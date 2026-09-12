import type { PrismaClient } from '@prisma/client'
import type { Server, Socket } from 'socket.io'

import {
  AnnotationColorSchema,
  AnnotationKindSchema,
  AnnotationModeSchema,
  AnnotationVisibilitySchema,
  CreateAnnotationInputSchema,
  DeleteAnnotationInputSchema,
  PointListSchema,
  SESSION_ANNOTATION_EVENTS,
  canDeleteAnnotation,
  filterAnnotationsFor,
  snapToCellCenter,
  type Annotation,
  type AnnotationViewer,
  type CreateAnnotationAck,
  type DeleteAnnotationAck,
} from '../../shared/annotation.js'
import { MemberRoleSchema } from '../../shared/session.js'
import type { Clock } from '../core/clock.js'
import { toMapSummary } from '../map/rules.js'
import { authorizeAction } from './authorize.js'
import type { Presence } from './presence.js'

// Eine Stelle, die den Anmerkungsbestand einer Spielsitzung laedt, filtert, verteilt, und die
// beiden Anmerkungs-Handler (design.md D3, spec.md Requirement "Anmerkung anlegen"/"Anmerkung
// entfernen"). Reihenfolge in jedem Handler: zod-Parse -> authorizeAction (ohne
// Rollenanforderung, jedes Mitglied) -> aktive Instanz aus der Spielsitzung lesen (nicht aus
// der Payload) -> Regel -> DB -> `broadcastAnnotations` -> Acknowledgement (Muster
// `server/session/fog.ts`/`server/session/tokens.ts`).

export interface AnnotationSocketDeps {
  prisma: PrismaClient
  clock: Clock
  presence: Presence
}

/** Ausschnitt einer `Annotation`-Zeile, den `toAnnotation` braucht - lose gekoppelt an Prisma
 * (Muster `GameMapLike`). */
interface AnnotationRow {
  id: string
  instanceId: string
  authorId: string | null
  kind: string
  mode: string
  visibility: string
  color: string | null
  points: string
}

const INVALID_PAYLOAD_MESSAGE = 'Ungültige Anfrage.'
const GENERIC_ACK_ERROR_MESSAGE = 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv.'
const NOT_FOUND_MESSAGE = 'Anmerkung nicht gefunden.'
// Wortlaut identisch mit `authorizeAction` (design.md D3) - ein Spieler kann "Rolle fehlt" und
// "nicht dein Objekt" nicht unterscheiden und muss es auch nicht.
const FORBIDDEN_MESSAGE = 'Dafür fehlt die Berechtigung.'

/** Prisma-Zeile -> Anmerkungsdarstellung (design.md D3): `points` per `PointListSchema.parse
 * (JSON.parse(row.points))`, `kind`/`mode`/`visibility` per Enum-Parse - eine korrupte Zeile
 * ist ein Fehler, der bis zum generischen Ack-Handler sprudelt (kein stilles `catch`,
 * AGENTS.md). */
export function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    instanceId: row.instanceId,
    kind: AnnotationKindSchema.parse(row.kind),
    mode: AnnotationModeSchema.parse(row.mode),
    visibility: AnnotationVisibilitySchema.parse(row.visibility),
    color: row.color === null ? null : AnnotationColorSchema.parse(row.color),
    points: PointListSchema.parse(JSON.parse(row.points)),
    authorId: row.authorId,
  }
}

/** Laedt den Anmerkungsbestand der aktiven Instanz einer Spielsitzung - die leere Liste ohne
 * aktive Karte (design.md D3, spec.md "Anmerkungsbestand"). Ungefiltert. */
export async function loadAnnotations(prisma: PrismaClient, sessionId: string): Promise<Annotation[]> {
  const gameSession = await prisma.gameSession.findUnique({ where: { id: sessionId } })
  if (!gameSession?.activeInstanceId) {
    return []
  }
  const rows = await prisma.annotation.findMany({
    where: { instanceId: gameSession.activeInstanceId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map(toAnnotation)
}

/** `loadAnnotations` gefolgt von `filterAnnotationsFor` fuer einen bestimmten Empfaenger
 * (design.md D3) - benutzt vom Enter-Ack. */
export async function loadAnnotationsFor(prisma: PrismaClient, sessionId: string, viewer: AnnotationViewer): Promise<Annotation[]> {
  const list = await loadAnnotations(prisma, sessionId)
  return filterAnnotationsFor(list, viewer)
}

/**
 * Laedt den aktuellen Anmerkungsbestand einmal und sendet ihn JE VERBINDUNG im Raum, mit dem
 * fuer den jeweiligen Empfaenger gefilterten Bestand (design.md D3, constitution.md
 * §9.2/§9.3). Aufrufer: die Anmerkungs-Handler, `handleActivateMap` (nach `broadcastTokens`)
 * und das Aushaengen der aktiven Instanz (nach `broadcastTokens`). Ohne aktive Instanz geht
 * die leere Liste an alle. Ein Eintrag ohne (mehr gueltige) Mitgliedschaft bekommt nichts.
 */
export async function broadcastAnnotations(io: Server, prisma: PrismaClient, presence: Presence, sessionId: string): Promise<void> {
  const entries = presence.entriesIn(sessionId)
  if (entries.length === 0) {
    return
  }
  const list = await loadAnnotations(prisma, sessionId)
  const memberships = await prisma.membership.findMany({ where: { sessionId } })
  const roleByUserId = new Map(memberships.map((membership) => [membership.userId, membership.role]))

  for (const { userId, socketId } of entries) {
    const role = roleByUserId.get(userId)
    if (!role) {
      continue
    }
    const viewer: AnnotationViewer = { role: MemberRoleSchema.parse(role), userId }
    const filtered = filterAnnotationsFor(list, viewer)
    io.to(socketId).emit(SESSION_ANNOTATION_EVENTS.annotations, { sessionId, annotations: filtered })
  }
}

/**
 * Registriert die beiden Anmerkungs-Ereignisse auf einem verbundenen Socket (design.md D3) -
 * aus `session/socket.ts` in der `connection`-Registrierung aufgerufen (Muster
 * `registerFogHandlers`/`registerTokenHandlers`).
 */
export function registerAnnotationHandlers(io: Server, socket: Socket, deps: AnnotationSocketDeps): void {
  const { prisma, clock, presence } = deps

  socket.on(SESSION_ANNOTATION_EVENTS.create, (payload: unknown, callback: (ack: CreateAnnotationAck) => void) => {
    handleCreateAnnotation(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  socket.on(SESSION_ANNOTATION_EVENTS.delete, (payload: unknown, callback: (ack: DeleteAnnotationAck) => void) => {
    handleDeleteAnnotation(payload, callback).catch((error: unknown) => {
      console.error(error)
      callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
    })
  })

  /**
   * `session:annotation-create` (spec.md Requirement "Anmerkung anlegen"): jedes Mitglied
   * darf senden - keine Rollenanforderung an `authorizeAction`. Die aktive Instanz kommt aus
   * der Spielsitzung, nicht aus der Payload (constitution.md §9.1). Bei `mode === 'gerastert'`
   * setzt der Server jeden Punkt selbst auf die Zellmitte, bevor er speichert - unabhaengig
   * davon, was der Client geschickt hat (constitution.md §9.1, design.md D3).
   */
  async function handleCreateAnnotation(payload: unknown, callback: (ack: CreateAnnotationAck) => void): Promise<void> {
    const parsed = CreateAnnotationInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, kind, mode, visibility, color, points } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId)
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

    const finalPoints =
      mode === 'gerastert' ? points.map((point) => snapToCellCenter(toMapSummary(instance.map).grid, point)) : points

    const created = await prisma.annotation.create({
      data: {
        instanceId: activeInstanceId,
        authorId: authResult.user.id,
        kind,
        mode,
        visibility,
        color,
        points: JSON.stringify(finalPoints),
      },
    })
    await broadcastAnnotations(io, prisma, presence, sessionId)
    callback({ ok: true, annotation: toAnnotation(created) })
  }

  /**
   * `session:annotation-delete` (spec.md Requirement "Anmerkung entfernen"): jedes Mitglied
   * darf senden. Ziel `eine`: eine fremde private Anmerkung und eine unbekannte `id` sind
   * identisch "nicht gefunden" (constitution.md §9.2); danach entscheidet
   * `canDeleteAnnotation` gegen die JETZT geladene Zeile und die JETZT geladene Mitgliedschaft
   * (constitution.md §9.3). Ziel `meine` loescht immer, auch ohne Treffer. Ziel `geteilte` nur
   * fuer den Spielleiter - die Rolle wird hier gegen die Mitgliedschaft geprueft (nicht ueber
   * `authorizeAction`, design.md D3 "Verworfen"), damit "Keine Karte aktiv." in derselben
   * Reihenfolge kommt wie bei `eine`/`meine`.
   */
  async function handleDeleteAnnotation(payload: unknown, callback: (ack: DeleteAnnotationAck) => void): Promise<void> {
    const parsed = DeleteAnnotationInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, target } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId)
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    const activeInstanceId = authResult.gameSession.activeInstanceId
    if (!activeInstanceId) {
      callback({ ok: false, message: NO_ACTIVE_MAP_MESSAGE })
      return
    }

    const viewer: AnnotationViewer = { role: MemberRoleSchema.parse(authResult.membership.role), userId: authResult.user.id }

    if (target.kind === 'eine') {
      const existing = await prisma.annotation.findFirst({ where: { id: target.annotationId, instanceId: activeInstanceId } })
      if (!existing) {
        callback({ ok: false, message: NOT_FOUND_MESSAGE })
        return
      }
      const visibility = AnnotationVisibilitySchema.parse(existing.visibility)
      if (visibility === 'privat' && existing.authorId !== viewer.userId) {
        callback({ ok: false, message: NOT_FOUND_MESSAGE })
        return
      }
      if (!canDeleteAnnotation({ authorId: existing.authorId, visibility }, viewer)) {
        callback({ ok: false, message: FORBIDDEN_MESSAGE })
        return
      }
      await prisma.annotation.delete({ where: { id: existing.id } })
    } else if (target.kind === 'meine') {
      await prisma.annotation.deleteMany({ where: { instanceId: activeInstanceId, authorId: viewer.userId } })
    } else {
      // target.kind === 'geteilte'
      if (viewer.role !== 'spielleiter') {
        callback({ ok: false, message: FORBIDDEN_MESSAGE })
        return
      }
      await prisma.annotation.deleteMany({ where: { instanceId: activeInstanceId, visibility: 'geteilt' } })
    }

    await broadcastAnnotations(io, prisma, presence, sessionId)
    callback({ ok: true })
  }
}
