import type { PrismaClient, Token as PrismaToken, TokenCondition as PrismaTokenCondition } from '@prisma/client'
import type { Server, Socket } from 'socket.io'

import { MemberRoleSchema, type MemberRole } from '../../shared/session.js'
import {
  AssignTokenInputSchema,
  CreateTokenInputSchema,
  MoveTokenInputSchema,
  RemoveTokenInputSchema,
  SESSION_TOKEN_EVENTS,
  TokenConditionsInputSchema,
  TokenIconSchema,
  TokenStatsInputSchema,
  canMoveToken,
  type AssignTokenAck,
  type CreateTokenAck,
  type MoveTokenAck,
  type RemoveTokenAck,
  type Token,
  type TokenConditionsAck,
  type TokenStatsAck,
} from '../../shared/token.js'
import type { Clock } from '../core/clock.js'
import { authorizeAction } from './authorize.js'
import type { Presence } from './presence.js'

// Eine Stelle, die den Tokenbestand einer Spielsitzung laedt und verteilt, und die sechs
// Token-Handler (design.md D3, add-token-assignment #15, add-token-stats #61). Reihenfolge
// in jedem Handler: zod-Parse -> authorizeAction (Rolle je nach Aktion, siehe unten) ->
// aktive Instanz aus der Spielsitzung lesen (nicht aus der Payload) -> Token laden mit `id`
// UND `instanceId` der aktiven Instanz -> Schreiben -> `broadcastTokens` -> Acknowledgement
// (design.md D2).

export interface TokenSocketDeps {
  prisma: PrismaClient
  clock: Clock
  presence: Presence
}

/** add-token-stats (#61, design.md D3): jede Lade-/Schreibstelle, deren Ergebnis durch
 * `toToken` geht, benutzt dieses `include` - Markierungen nach `position` sortiert. */
export const TOKEN_INCLUDE = {
  conditions: { orderBy: { position: 'asc' as const } },
} as const

type TokenRow = PrismaToken & { conditions: PrismaTokenCondition[] }

const INVALID_PAYLOAD_MESSAGE = 'Ungültige Anfrage.'
const GENERIC_ACK_ERROR_MESSAGE = 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv.'
const TOKEN_NOT_FOUND_MESSAGE = 'Token nicht gefunden.'
// add-token-assignment (#15, design.md D3): eine Meldung fuer "kein Mitglied" und "der
// Spielleiter selbst" - beides ist aus Sicht des Clients dasselbe: kein waehlbarer Eintrag.
const PLAYER_NOT_FOUND_MESSAGE = 'Spieler nicht gefunden.'
// add-token-assignment (#15, spec.md Requirement "Token bewegen"): Rolle `spielleiter` oder
// Besitzer, geprueft gegen die gespeicherte Zuweisung (constitution.md §9.3).
const NOT_TOKEN_OWNER_MESSAGE = 'Dieses Token darfst du nicht bewegen.'
// add-token-stats (#61, spec.md Requirement "Tokenwerte setzen"): weder ein stilles Deckeln
// noch eine Verrechnung von Schaden/Heilung - eine Kopplungsverletzung wird abgelehnt.
const INVALID_HP_MESSAGE = 'Ungültige Trefferpunkte.'

/** Prisma-Zeile (mit Markierungen) -> Tokendarstellung (design.md D3). `icon` bleibt `null`,
 * wenn kein Symbol gespeichert ist - ein gespeicherter Wert ist immer ein Katalogeintrag
 * (die Handler schreiben nur validierte Werte). `ownerId` (add-token-assignment #15) wird
 * unveraendert uebernommen - fuer jeden Teilnehmer sichtbar (constitution.md §9.2).
 * add-token-stats (#61): die fuenf Wertefelder unveraendert, `conditions` als Label-Liste in
 * der Reihenfolge der geladenen Zeilen (siehe `TOKEN_INCLUDE`). */
export function toToken(row: TokenRow): Token {
  return {
    id: row.id,
    instanceId: row.instanceId,
    name: row.name,
    color: row.color,
    icon: row.icon === null ? null : TokenIconSchema.parse(row.icon),
    size: row.size,
    col: row.col,
    row: row.row,
    ownerId: row.ownerId,
    hp: row.hp,
    hpMax: row.hpMax,
    tempHp: row.tempHp,
    ac: row.ac,
    initiative: row.initiative,
    conditions: row.conditions.map((c) => c.label),
  }
}

/** Wer eine Tokendarstellung empfaengt (add-token-stats #61, design.md D3, constitution.md
 * §9.2/§9.3). */
export interface TokenViewer {
  role: MemberRole
  userId: string
}

/** Filtert die Werte eines Tokens fuer einen Empfaenger (add-token-stats #61, design.md D3,
 * constitution.md §9.2): der Spielleiter und der Besitzer sehen das Token unveraendert, jeder
 * andere Empfaenger erhaelt `null` fuer die fuenf Wertefelder und die leere Markierungsliste
 * - ununterscheidbar von "nicht gesetzt". Reine Funktion, keine DB. */
export function redactToken(token: Token, viewer: TokenViewer): Token {
  if (viewer.role === 'spielleiter' || token.ownerId === viewer.userId) {
    return token
  }
  return { ...token, hp: null, hpMax: null, tempHp: null, ac: null, initiative: null, conditions: [] }
}

/** Laedt den Tokenbestand der aktiven Instanz einer Spielsitzung - die leere Liste ohne
 * aktive Karte (design.md D3, spec.md "Tokenbestand"). Ungefiltert - fuer den
 * Handler-Ack-Pfad eines Spielleiters und als Ausgangsbasis der Verteilung. */
export async function loadTokens(prisma: PrismaClient, sessionId: string): Promise<Token[]> {
  const gameSession = await prisma.gameSession.findUnique({ where: { id: sessionId } })
  if (!gameSession?.activeInstanceId) {
    return []
  }
  const rows = await prisma.token.findMany({
    where: { instanceId: gameSession.activeInstanceId },
    orderBy: { createdAt: 'asc' },
    include: TOKEN_INCLUDE,
  })
  return rows.map(toToken)
}

/** `loadTokens` gefolgt von `redactToken` je Token, fuer einen bestimmten Empfaenger
 * (add-token-stats #61, design.md D3) - benutzt von `handleEnter` fuer den Betretenden. */
export async function loadTokensFor(prisma: PrismaClient, sessionId: string, viewer: TokenViewer): Promise<Token[]> {
  const tokens = await loadTokens(prisma, sessionId)
  return tokens.map((token) => redactToken(token, viewer))
}

/**
 * Laedt den aktuellen Tokenbestand und sendet ihn JE VERBINDUNG im Raum, mit dem fuer den
 * jeweiligen Empfaenger gefilterten Bestand (add-token-stats #61, design.md D3,
 * constitution.md §9.2/§9.3). Aufrufer: die Token-Handler, `handleActivateMap` (nach
 * `emitActiveMap`) und das Aushaengen der aktiven Instanz (nach `emitActiveMap(io, id,
 * null)`). Identitaet aus `Presence` (dort seit #6 gebunden), Rolle und `ownerId` kommen aus
 * der Datenbank JETZT - nichts an der Verbindung gilt als Erlaubnis. Ein Eintrag ohne
 * (mehr gueltige) Mitgliedschaft bekommt nichts.
 */
export async function broadcastTokens(io: Server, prisma: PrismaClient, presence: Presence, sessionId: string): Promise<void> {
  const tokens = await loadTokens(prisma, sessionId)
  const entries = presence.entriesIn(sessionId)
  if (entries.length === 0) {
    return
  }
  const memberships = await prisma.membership.findMany({ where: { sessionId } })
  const roleByUserId = new Map(memberships.map((membership) => [membership.userId, membership.role]))

  for (const { userId, socketId } of entries) {
    const role = roleByUserId.get(userId)
    if (!role) {
      continue
    }
    const viewer: TokenViewer = { role: MemberRoleSchema.parse(role), userId }
    const filtered = tokens.map((token) => redactToken(token, viewer))
    io.to(socketId).emit(SESSION_TOKEN_EVENTS.tokens, { sessionId, tokens: filtered })
  }
}

/**
 * Registriert die sechs Token-Ereignisse auf einem verbundenen Socket (design.md D3,
 * add-token-assignment #15, add-token-stats #61) - aus `session/socket.ts` in der
 * `connection`-Registrierung aufgerufen, damit diese Datei nicht weiter waechst.
 */
export function registerTokenHandlers(io: Server, socket: Socket, deps: TokenSocketDeps): void {
  const { prisma, clock, presence } = deps

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

  socket.on(SESSION_TOKEN_EVENTS.assign, (payload: unknown, callback: (ack: AssignTokenAck) => void) => {
    handleAssignToken(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_TOKEN_EVENTS.stats, (payload: unknown, callback: (ack: TokenStatsAck) => void) => {
    handleTokenStats(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_TOKEN_EVENTS.conditions, (payload: unknown, callback: (ack: TokenConditionsAck) => void) => {
    handleTokenConditions(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  /**
   * `session:token-create` (spec.md Requirement "Token anlegen"): ohne aktive Karte wird
   * nichts angelegt - die aktive Instanz kommt aus der Spielsitzung, nicht aus der Payload
   * (constitution.md §9.1). Kein `ownerId` beim Schreiben - der Datenbank-Default ist
   * `null`, ein neu angelegtes Token gehoert damit dem Spielleiter (add-token-assignment
   * #15, spec.md Requirement "Token zuweisen"). Kein Wert wird gesetzt - ein neu angelegtes
   * Token hat keine Werte (add-token-stats #61, spec.md "Neu angelegtes Token hat keine
   * Werte").
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
      include: TOKEN_INCLUDE,
    })
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true, token: toToken(created) })
  }

  /**
   * `session:token-move` (spec.md Requirement "Token bewegen", add-token-assignment #15):
   * jede Mitgliedschaft darf senden - keine Rollenanforderung an `authorizeAction`. Das
   * Token wird zuerst geladen (ein unbekanntes Token, ein Token einer anderen Spielsitzung
   * und ein Token einer eingehaengten, nicht aktiven Instanz sind identisch "nicht gefunden",
   * constitution.md §9.2 - unabhaengig von der Berechtigung, sonst verriete die Meldung
   * einem Spieler, ob eine `id` existiert). Danach entscheidet `canMoveToken` gegen die
   * JETZT geladene Zuweisung und die JETZT geladene Mitgliedschaft - nichts an der
   * Verbindung und keine fruehere Bewegung gilt als Erlaubnis (constitution.md §9.3).
   * add-token-stats (#61, design.md D3, Risks): das Ack wird zusaetzlich mit `redactToken`
   * fuer den Absender gefiltert - fuer den Spielleiter ein No-op, fuer einen Spieler ein
   * zusaetzlicher Rueckhalt (er bewegt ohnehin nur eigene Tokens).
   */
  async function handleMoveToken(payload: unknown, callback: (ack: MoveTokenAck) => void): Promise<void> {
    const parsed = MoveTokenInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, tokenId, col, row } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId)
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

    const mover = { role: MemberRoleSchema.parse(authResult.membership.role), userId: authResult.user.id }
    if (!canMoveToken(existing, mover)) {
      callback({ ok: false, message: NOT_TOKEN_OWNER_MESSAGE })
      return
    }

    const updated = await prisma.token.update({ where: { id: existing.id }, data: { col, row }, include: TOKEN_INCLUDE })
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true, token: redactToken(toToken(updated), mover) })
  }

  /** `session:token-remove` (spec.md Requirement "Token entfernen"): dieselbe Ladepruefung
   * wie beim Bewegen, weiterhin Rolle `spielleiter`. Die Markierungen werden per
   * `onDelete: Cascade` mit entfernt (add-token-stats #61, spec.md "Entfernen nimmt die
   * Markierungen mit") - kein zusaetzlicher Code hier. */
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
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true })
  }

  /**
   * `session:token-assign` (add-token-assignment #15, spec.md Requirement "Token
   * zuweisen"): nur der Spielleiter. Reihenfolge Token-vor-Mitglied, damit ein nicht
   * auffindbares Token dieselbe Meldung liefert wie beim Bewegen, unabhaengig vom
   * `ownerId`. Ein `ownerId` ungleich `null`, der nicht die `userId` eines Mitglieds
   * dieser Spielsitzung mit Rolle `spieler` ist - auch die `userId` des Spielleiters
   * selbst -, wird mit `PLAYER_NOT_FOUND_MESSAGE` abgelehnt.
   */
  async function handleAssignToken(payload: unknown, callback: (ack: AssignTokenAck) => void): Promise<void> {
    const parsed = AssignTokenInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, tokenId, ownerId } = parsed.data

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

    if (ownerId !== null) {
      const ownerMembership = await prisma.membership.findUnique({
        where: { sessionId_userId: { sessionId, userId: ownerId } },
      })
      if (!ownerMembership || ownerMembership.role !== 'spieler') {
        callback({ ok: false, message: PLAYER_NOT_FOUND_MESSAGE })
        return
      }
    }

    const updated = await prisma.token.update({ where: { id: existing.id }, data: { ownerId }, include: TOKEN_INCLUDE })
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true, token: toToken(updated) })
  }

  /**
   * `session:token-stats` (add-token-stats #61, spec.md Requirement "Tokenwerte setzen"):
   * nur der Spielleiter, auch fuer ein Token, dessen Besitzer er selbst nicht ist. Das
   * Teilobjekt wird mit dem gespeicherten Stand zusammengefuehrt (fehlend = unveraendert,
   * `null` = geloescht), danach die Kopplung `hp`/`hpMax` geprueft - erst danach wird
   * geschrieben, kein stilles Deckeln (design.md D3).
   */
  async function handleTokenStats(payload: unknown, callback: (ack: TokenStatsAck) => void): Promise<void> {
    const parsed = TokenStatsInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, tokenId, ...patch } = parsed.data

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

    const mergedHp: number | null = patch.hp === undefined ? existing.hp : patch.hp
    const mergedHpMax: number | null = patch.hpMax === undefined ? existing.hpMax : patch.hpMax
    const mergedTempHp: number | null = patch.tempHp === undefined ? existing.tempHp : patch.tempHp
    const mergedAc: number | null = patch.ac === undefined ? existing.ac : patch.ac
    const mergedInitiative: number | null = patch.initiative === undefined ? existing.initiative : patch.initiative

    const hpValid =
      (mergedHp === null && mergedHpMax === null) || (mergedHp !== null && mergedHpMax !== null && mergedHp <= mergedHpMax)
    if (!hpValid) {
      callback({ ok: false, message: INVALID_HP_MESSAGE })
      return
    }

    const updated = await prisma.token.update({
      where: { id: existing.id },
      data: { hp: mergedHp, hpMax: mergedHpMax, tempHp: mergedTempHp, ac: mergedAc, initiative: mergedInitiative },
      include: TOKEN_INCLUDE,
    })
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true, token: toToken(updated) })
  }

  /**
   * `session:token-conditions` (add-token-stats #61, spec.md Requirement "Markierungen
   * setzen"): nur der Spielleiter, ersetzt die vollstaendige Liste. `deleteMany` +
   * `createMany` in einer Transaktion (AGENTS.md: mehrschrittige Schreibvorgaenge in eine
   * Transaktion) - nicht genannte bisherige Markierungen sind danach entfernt.
   */
  async function handleTokenConditions(payload: unknown, callback: (ack: TokenConditionsAck) => void): Promise<void> {
    const parsed = TokenConditionsInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, tokenId, conditions } = parsed.data

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

    await prisma.$transaction([
      prisma.tokenCondition.deleteMany({ where: { tokenId: existing.id } }),
      prisma.tokenCondition.createMany({
        data: conditions.map((label, position) => ({ tokenId: existing.id, label, position })),
      }),
    ])

    const updated = await prisma.token.findUniqueOrThrow({ where: { id: existing.id }, include: TOKEN_INCLUDE })
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true, token: toToken(updated) })
  }
}
