import type { PrismaClient, Token as PrismaToken } from '@prisma/client'
import type { Server, Socket } from 'socket.io'

import {
  CreateTokenInputSchema,
  MoveTokenInputSchema,
  RemoveTokenInputSchema,
  SESSION_TOKEN_EVENTS,
  TokenIconSchema,
  type CreateTokenAck,
  type MoveTokenAck,
  type RemoveTokenAck,
  type Token,
} from '../../shared/token.js'
import type { Clock } from '../core/clock.js'
import { authorizeAction } from './authorize.js'
import { roomName } from './room.js'

// Eine Stelle, die den Tokenbestand einer Spielsitzung laedt und verteilt, und die drei
// Token-Handler (design.md D3). Reihenfolge in jedem Handler: zod-Parse -> authorizeAction
// (Rolle `spielleiter`) -> aktive Instanz aus der Spielsitzung lesen (nicht aus der Payload)
// -> Token laden mit `id` UND `instanceId` der aktiven Instanz -> Schreiben ->
// `broadcastTokens` -> Acknowledgement (design.md D2).

export interface TokenSocketDeps {
  prisma: PrismaClient
  clock: Clock
}

const INVALID_PAYLOAD_MESSAGE = 'Ungültige Anfrage.'
const GENERIC_ACK_ERROR_MESSAGE = 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv.'
const TOKEN_NOT_FOUND_MESSAGE = 'Token nicht gefunden.'

/** Prisma-Zeile -> Tokendarstellung (design.md D3). `icon` bleibt `null`, wenn kein Symbol
 * gespeichert ist - ein gespeicherter Wert ist immer ein Katalogeintrag (die Handler
 * schreiben nur validierte Werte). */
export function toToken(row: PrismaToken): Token {
  return {
    id: row.id,
    instanceId: row.instanceId,
    name: row.name,
    color: row.color,
    icon: row.icon === null ? null : TokenIconSchema.parse(row.icon),
    size: row.size,
    col: row.col,
    row: row.row,
  }
}

/** Laedt den Tokenbestand der aktiven Instanz einer Spielsitzung - die leere Liste ohne
 * aktive Karte (design.md D3, spec.md "Tokenbestand"). */
export async function loadTokens(prisma: PrismaClient, sessionId: string): Promise<Token[]> {
  const gameSession = await prisma.gameSession.findUnique({ where: { id: sessionId } })
  if (!gameSession?.activeInstanceId) {
    return []
  }
  const rows = await prisma.token.findMany({
    where: { instanceId: gameSession.activeInstanceId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toToken)
}

/** Sendet `session:tokens` an alle Verbindungen im Raum dieser Spielsitzung (design.md D3). */
export function emitTokens(io: Server, sessionId: string, tokens: Token[]): void {
  io.to(roomName(sessionId)).emit(SESSION_TOKEN_EVENTS.tokens, { sessionId, tokens })
}

/** Laedt den aktuellen Tokenbestand und sendet ihn an den Raum (design.md D3). Aufrufer: die
 * drei Token-Handler, `handleActivateMap` (nach `emitActiveMap`) und das Aushaengen der
 * aktiven Instanz (nach `emitActiveMap(io, id, null)`). */
export async function broadcastTokens(io: Server, prisma: PrismaClient, sessionId: string): Promise<void> {
  const tokens = await loadTokens(prisma, sessionId)
  emitTokens(io, sessionId, tokens)
}

/**
 * Registriert die drei Token-Ereignisse auf einem verbundenen Socket (design.md D3) - aus
 * `session/socket.ts` in der `connection`-Registrierung aufgerufen, damit diese Datei nicht
 * weiter waechst.
 */
export function registerTokenHandlers(io: Server, socket: Socket, deps: TokenSocketDeps): void {
  const { prisma, clock } = deps

  socket.on(SESSION_TOKEN_EVENTS.create, (payload: unknown, callback: (ack: CreateTokenAck) => void) => {
    handleCreateToken(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_TOKEN_EVENTS.move, (payload: unknown, callback: (ack: MoveTokenAck) => void) => {
    handleMoveToken(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_TOKEN_EVENTS.remove, (payload: unknown, callback: (ack: RemoveTokenAck) => void) => {
    handleRemoveToken(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  /**
   * `session:token-create` (spec.md Requirement "Token anlegen"): ohne aktive Karte wird
   * nichts angelegt - die aktive Instanz kommt aus der Spielsitzung, nicht aus der Payload
   * (constitution.md §9.1).
   */
  async function handleCreateToken(payload: unknown, callback: (ack: CreateTokenAck) => void): Promise<void> {
    const parsed = CreateTokenInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, name, color, icon, size, col, row } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId, { role: 'spielleiter' })
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    const activeInstanceId = authResult.gameSession.activeInstanceId
    if (!activeInstanceId) {
      callback({ ok: false, message: NO_ACTIVE_MAP_MESSAGE })
      return
    }

    const created = await prisma.token.create({
      data: { instanceId: activeInstanceId, name, color, icon, size, col, row },
    })
    await broadcastTokens(io, prisma, sessionId)
    callback({ ok: true, token: toToken(created) })
  }

  /**
   * `session:token-move` (spec.md Requirement "Token bewegen"): ein unbekanntes Token, ein
   * Token einer anderen Spielsitzung und ein Token einer eingehaengten, nicht aktiven Instanz
   * sind identisch "nicht gefunden" (constitution.md §9.2) - das Token wird mit `id` UND
   * `instanceId` der aktiven Instanz geladen; ohne aktive Karte ist `activeInstanceId` `null`,
   * also ebenfalls kein Treffer.
   */
  async function handleMoveToken(payload: unknown, callback: (ack: MoveTokenAck) => void): Promise<void> {
    const parsed = MoveTokenInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, tokenId, col, row } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId, { role: 'spielleiter' })
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    const activeInstanceId = authResult.gameSession.activeInstanceId
    const existing = activeInstanceId ? await prisma.token.findFirst({ where: { id: tokenId, instanceId: activeInstanceId } }) : null
    if (!existing) {
      callback({ ok: false, message: TOKEN_NOT_FOUND_MESSAGE })
      return
    }

    const updated = await prisma.token.update({ where: { id: existing.id }, data: { col, row } })
    await broadcastTokens(io, prisma, sessionId)
    callback({ ok: true, token: toToken(updated) })
  }

  /** `session:token-remove` (spec.md Requirement "Token entfernen"): dieselbe Ladepruefung
   * wie beim Bewegen. */
  async function handleRemoveToken(payload: unknown, callback: (ack: RemoveTokenAck) => void): Promise<void> {
    const parsed = RemoveTokenInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, tokenId } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId, { role: 'spielleiter' })
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    const activeInstanceId = authResult.gameSession.activeInstanceId
    const existing = activeInstanceId ? await prisma.token.findFirst({ where: { id: tokenId, instanceId: activeInstanceId } }) : null
    if (!existing) {
      callback({ ok: false, message: TOKEN_NOT_FOUND_MESSAGE })
      return
    }

    await prisma.token.delete({ where: { id: existing.id } })
    await broadcastTokens(io, prisma, sessionId)
    callback({ ok: true })
  }
}
