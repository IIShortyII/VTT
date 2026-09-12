import type { PrismaClient } from '@prisma/client'
import type { Server, Socket } from 'socket.io'

import { cellRange, type Cell } from '../../shared/grid.js'
import {
  CreateFogAreaInputSchema,
  DeleteFogAreaInputSchema,
  SESSION_FOG_EVENTS,
  SetFogInputSchema,
  cellKey,
  isAreaRevealed,
  redactFog,
  type FogAck,
  type FogState,
  type FogTarget,
} from '../../shared/fog.js'
import { MemberRoleSchema, type MemberRole } from '../../shared/session.js'
import type { Clock } from '../core/clock.js'
import { imageSize } from '../map/storage.js'
import { toMapSummary, type GameMapLike } from '../map/rules.js'
import { authorizeAction } from './authorize.js'
import type { Presence } from './presence.js'
import { broadcastTokens } from './tokens.js'

// Eine Stelle, die den Fog-Zustand einer Spielsitzung laedt, filtert, verteilt, und die drei
// Fog-Handler (add-fog-of-war #16, design.md D3). Reihenfolge in jedem Handler: zod-Parse ->
// authorizeAction (Rolle `spielleiter`) -> aktive Instanz aus der Spielsitzung lesen (nicht
// aus der Payload) -> Zellen der Aktion aufloesen -> Schreiben -> `broadcastFog` ->
// Acknowledgement mit dem ungefilterten Zustand (Muster `server/session/tokens.ts`).
// add-token-fog-visibility (#17, design.md D4): `handleSetFog` sendet nach `broadcastFog`
// zusaetzlich `broadcastTokens` - Aufdecken und Verdecken aendern, welche Tokens fuer wen
// sichtbar sind. `handleCreateFogArea`/`handleDeleteFogArea` bleiben unveraendert: sie
// aendern die aufgedeckten Zellen nicht.

export interface FogSocketDeps {
  prisma: PrismaClient
  clock: Clock
  presence: Presence
  uploadDir: string
}

const FOG_AREA_INCLUDE = { cells: true } as const

type FogAreaRow = { id: string; name: string; cells: { col: number; row: number }[] }

const INVALID_PAYLOAD_MESSAGE = 'Ungültige Anfrage.'
const GENERIC_ACK_ERROR_MESSAGE = 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv.'
const AREA_NOT_FOUND_MESSAGE = 'Bereich nicht gefunden.'

// design.md D3: Blockgroesse fuer `createMany`/`deleteMany` - SQLite begrenzt die Anzahl
// gebundener Parameter je Anweisung, 10000 Zellen auf einmal (D2: `FOG_MAX_CELLS`) lägen
// darueber.
const FOG_BATCH_SIZE = 500

// design.md D3/spec.md "Begriffe": Rueckfallgroesse fuer "alle aufdecken" ohne Bild -
// dieselbe wie die Canvas-Fassade (`client/map/canvas.ts`, `FALLBACK_WIDTH`/`FALLBACK_HEIGHT`).
const FALLBACK_IMAGE_SIZE = 1000

/** Instanz plus Zellen plus Bereiche -> Fog-Darstellung (design.md D3): reine Funktion,
 * `areas` immer als Objekt - `null` entsteht erst in `redactFog`. */
export function toFogState(
  instance: { id: string; fogVersion: number },
  cells: Cell[],
  areas: FogAreaRow[],
): FogState {
  const revealedKeys = new Set(cells.map(cellKey))
  return {
    instanceId: instance.id,
    version: instance.fogVersion,
    revealed: cells,
    areas: areas.map((area) => ({
      id: area.id,
      name: area.name,
      cellCount: area.cells.length,
      revealed: isAreaRevealed(area.cells, revealedKeys),
    })),
  }
}

/** Laedt den Fog-Zustand der aktiven Instanz einer Spielsitzung - `null` ohne aktive Instanz
 * (design.md D3). Ungefiltert - fuer den Handler-Ack-Pfad des Spielleiters. */
export async function loadFog(prisma: PrismaClient, sessionId: string): Promise<FogState | null> {
  const gameSession = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { activeInstance: true },
  })
  if (!gameSession?.activeInstance) {
    return null
  }
  const instance = gameSession.activeInstance
  const [cells, areas] = await Promise.all([
    prisma.fogCell.findMany({ where: { instanceId: instance.id } }),
    prisma.fogArea.findMany({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'asc' },
      include: FOG_AREA_INCLUDE,
    }),
  ])
  return toFogState(instance, cells, areas)
}

/** `loadFog` gefolgt von `redactFog` fuer einen bestimmten Empfaenger (design.md D3) -
 * benutzt vom Enter-Ack. */
export async function loadFogFor(prisma: PrismaClient, sessionId: string, role: MemberRole): Promise<FogState | null> {
  const fog = await loadFog(prisma, sessionId)
  return fog ? redactFog(fog, role) : null
}

/**
 * Laedt den aktuellen Fog-Zustand und sendet ihn JE VERBINDUNG im Raum, mit der fuer den
 * jeweiligen Empfaenger gefilterten Darstellung (design.md D3, constitution.md §9.2/§9.3).
 * Aufrufer: die Fog-Handler, `handleActivateMap` (nach `emitActiveMap`) und das Aushaengen
 * der aktiven Instanz (nach `emitActiveMap(io, id, null)`). Bei `fog === null` (keine aktive
 * Instanz) geht `null` an jeden. Ein Eintrag ohne (mehr gueltige) Mitgliedschaft bekommt
 * nichts.
 */
export async function broadcastFog(io: Server, prisma: PrismaClient, presence: Presence, sessionId: string): Promise<void> {
  const fog = await loadFog(prisma, sessionId)
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
    const filtered = fog ? redactFog(fog, MemberRoleSchema.parse(role)) : null
    io.to(socketId).emit(SESSION_FOG_EVENTS.fog, { sessionId, fog: filtered })
  }
}

type ResolvedCells = { ok: true; cells: Cell[] } | { ok: false; message: string }

/**
 * Loest die betroffenen Zellen einer Aktion auf (design.md D3, spec.md "Begriffe" "Ziel") -
 * wird NICHT fuer `{ kind: 'alle' }` beim Verdecken aufgerufen (das ist ein Sonderfall im
 * Handler, "alle Zeilen der Instanz loeschen"). `bereich` prueft `id` UND `instanceId` der
 * aktiven Instanz - ein Bereich einer anderen Instanz ist damit "nicht gefunden", nicht
 * "verboten" (constitution.md §9.2).
 */
async function resolveTargetCells(
  prisma: PrismaClient,
  uploadDir: string,
  instance: { id: string; map: GameMapLike },
  target: FogTarget,
): Promise<ResolvedCells> {
  if (target.kind === 'zellen') {
    return { ok: true, cells: target.cells }
  }

  if (target.kind === 'bereich') {
    const area = await prisma.fogArea.findFirst({
      where: { id: target.areaId, instanceId: instance.id },
      include: FOG_AREA_INCLUDE,
    })
    if (!area) {
      return { ok: false, message: AREA_NOT_FOUND_MESSAGE }
    }
    return { ok: true, cells: area.cells.map((cell) => ({ col: cell.col, row: cell.row })) }
  }

  // target.kind === 'alle', nur fuer Aufdecken aufgerufen (design.md D3).
  const summary = toMapSummary(instance.map)
  let width = FALLBACK_IMAGE_SIZE
  let height = FALLBACK_IMAGE_SIZE
  if (instance.map.imageFile) {
    const size = await imageSize(uploadDir, instance.map.imageFile)
    width = size.width
    height = size.height
  }
  const range = cellRange(summary.grid, width, height)
  const cells: Cell[] = []
  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      cells.push({ col, row })
    }
  }
  return { ok: true, cells }
}

/**
 * Registriert die drei Fog-Ereignisse auf einem verbundenen Socket (design.md D3) - aus
 * `session/socket.ts` in der `connection`-Registrierung aufgerufen, damit diese Datei nicht
 * weiter waechst (Muster `registerTokenHandlers`).
 */
export function registerFogHandlers(io: Server, socket: Socket, deps: FogSocketDeps): void {
  const { prisma, clock, presence, uploadDir } = deps

  socket.on(SESSION_FOG_EVENTS.set, (payload: unknown, callback: (ack: FogAck) => void) => {
    handleSetFog(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_FOG_EVENTS.areaCreate, (payload: unknown, callback: (ack: FogAck) => void) => {
    handleCreateFogArea(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_FOG_EVENTS.areaDelete, (payload: unknown, callback: (ack: FogAck) => void) => {
    handleDeleteFogArea(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  /**
   * `session:fog-set` (spec.md Requirement "Aufdecken und Verdecken durch den
   * Spielleiter"): nur der Spielleiter. `{ kind: 'alle' }` beim Verdecken ist ein
   * Sonderfall ("alle Zeilen der Instanz loeschen") - jede andere Kombination loest die
   * betroffenen Zellen ueber `resolveTargetCells` auf und fuehrt Aufdecken/Verdecken als
   * Mengenoperation in einer Transaktion aus (design.md D3): Aufdecken legt nur Zellen an,
   * die noch nicht vorhanden sind (kein `skipDuplicates` unter SQLite); Verdecken loescht
   * die Treffermenge. Die Fog-Version waechst in jedem Fall um 1, auch ohne Mengenaenderung.
   * add-token-fog-visibility (#17, design.md D4): nach `broadcastFog` (je Verbindung zuerst
   * `session:fog`, danach `session:tokens`) verteilt `broadcastTokens` den fuer die
   * geaenderte Sichtbarkeit neu gefilterten Tokenbestand - fuer jedes Ziel und beide
   * Richtungen, auch ohne tatsaechliche Mengenaenderung.
   */
  async function handleSetFog(payload: unknown, callback: (ack: FogAck) => void): Promise<void> {
    const parsed = SetFogInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, revealed, target } = parsed.data

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

    const instance = await prisma.mapInstance.findFirst({ where: { id: activeInstanceId }, include: { map: true } })
    if (!instance) {
      callback({ ok: false, message: NO_ACTIVE_MAP_MESSAGE })
      return
    }

    if (target.kind === 'alle' && !revealed) {
      await prisma.$transaction([
        prisma.fogCell.deleteMany({ where: { instanceId: instance.id } }),
        prisma.mapInstance.update({ where: { id: instance.id }, data: { fogVersion: { increment: 1 } } }),
      ])
    } else {
      const resolved = await resolveTargetCells(prisma, uploadDir, instance, target)
      if (!resolved.ok) {
        callback({ ok: false, message: resolved.message })
        return
      }
      const cells = resolved.cells

      await prisma.$transaction(async (tx) => {
        const existing = await tx.fogCell.findMany({ where: { instanceId: instance.id } })
        const existingKeys = new Set(existing.map((cell) => cellKey(cell)))

        if (revealed) {
          const toCreate = cells.filter((cell) => !existingKeys.has(cellKey(cell)))
          for (let i = 0; i < toCreate.length; i += FOG_BATCH_SIZE) {
            const batch = toCreate.slice(i, i + FOG_BATCH_SIZE)
            await tx.fogCell.createMany({ data: batch.map((cell) => ({ instanceId: instance.id, col: cell.col, row: cell.row })) })
          }
        } else {
          const targetKeys = new Set(cells.map(cellKey))
          const toDeleteIds = existing.filter((cell) => targetKeys.has(cellKey(cell))).map((cell) => cell.id)
          for (let i = 0; i < toDeleteIds.length; i += FOG_BATCH_SIZE) {
            const batch = toDeleteIds.slice(i, i + FOG_BATCH_SIZE)
            await tx.fogCell.deleteMany({ where: { id: { in: batch } } })
          }
        }

        await tx.mapInstance.update({ where: { id: instance.id }, data: { fogVersion: { increment: 1 } } })
      })
    }

    const fog = await loadFog(prisma, sessionId)
    if (!fog) {
      callback({ ok: false, message: NO_ACTIVE_MAP_MESSAGE })
      return
    }
    await broadcastFog(io, prisma, presence, sessionId)
    await broadcastTokens(io, prisma, presence, sessionId)
    callback({ ok: true, fog })
  }

  /**
   * `session:fog-area-create` (spec.md Requirement "Bereiche verwalten"): nur der
   * Spielleiter, aendert weder die aufgedeckten Zellen noch die Fog-Version (design.md D3).
   * add-token-fog-visibility (#17): keine `broadcastTokens` - ein Bereich aendert die
   * aufgedeckten Zellen nicht.
   */
  async function handleCreateFogArea(payload: unknown, callback: (ack: FogAck) => void): Promise<void> {
    const parsed = CreateFogAreaInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, name, cells } = parsed.data

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

    await prisma.$transaction(async (tx) => {
      const area = await tx.fogArea.create({ data: { instanceId: activeInstanceId, name } })
      for (let i = 0; i < cells.length; i += FOG_BATCH_SIZE) {
        const batch = cells.slice(i, i + FOG_BATCH_SIZE)
        await tx.fogAreaCell.createMany({ data: batch.map((cell) => ({ areaId: area.id, col: cell.col, row: cell.row })) })
      }
    })

    const fog = await loadFog(prisma, sessionId)
    if (!fog) {
      callback({ ok: false, message: NO_ACTIVE_MAP_MESSAGE })
      return
    }
    await broadcastFog(io, prisma, presence, sessionId)
    callback({ ok: true, fog })
  }

  /**
   * `session:fog-area-delete` (spec.md Requirement "Bereiche verwalten"): nur der
   * Spielleiter. Das Loeschen nimmt die Zellen des Bereichs per Cascade mit, aendert aber
   * die aufgedeckten Zellen nicht (design.md D3). add-token-fog-visibility (#17): keine
   * `broadcastTokens` - dieselbe Begruendung.
   */
  async function handleDeleteFogArea(payload: unknown, callback: (ack: FogAck) => void): Promise<void> {
    const parsed = DeleteFogAreaInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, areaId } = parsed.data

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

    const area = await prisma.fogArea.findFirst({ where: { id: areaId, instanceId: activeInstanceId } })
    if (!area) {
      callback({ ok: false, message: AREA_NOT_FOUND_MESSAGE })
      return
    }

    await prisma.fogArea.delete({ where: { id: area.id } })

    const fog = await loadFog(prisma, sessionId)
    if (!fog) {
      callback({ ok: false, message: NO_ACTIVE_MAP_MESSAGE })
      return
    }
    await broadcastFog(io, prisma, presence, sessionId)
    callback({ ok: true, fog })
  }
}
