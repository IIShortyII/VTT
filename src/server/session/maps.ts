import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Server } from 'socket.io'

import { MountMapInputSchema, type MapInstance } from '../../shared/session-map.js'
import { resolveSession, SESSION_COOKIE_NAME } from '../auth/session.js'
import type { Clock } from '../core/clock.js'
import { findOwnMap, toMapSummary, type GameMapLike } from '../map/rules.js'
import { emitActiveMap } from './active-map.js'
import { broadcastFog } from './fog.js'
import type { Presence } from './presence.js'
import { broadcastTokens } from './tokens.js'

// Duenne Fastify-Anbindung fuer die Karteninstanzen einer Spielsitzung (design.md D2, D3):
// Liste, Einhaengen, Aushaengen. Jede Route laedt die Spielsitzung ausschliesslich ueber
// `findLedSession` - die Spielleiter-Pruefung ist Teil der Abfrage, kein `if` danach (Muster
// wie `findOwnMap`, #49 D4). Ein Spieler, ein Nicht-Mitglied und eine unbekannte
// Spielsitzung sind fuer jede Route identisch nicht erreichbar (constitution.md §9.2).

export interface SessionMapRoutesDeps {
  prisma: PrismaClient
  clock: Clock
  io: Server
  presence: Presence
}

interface SessionIdParams {
  id: string
}

interface InstanceParams {
  id: string
  instanceId: string
}

const NOT_LOGGED_IN_MESSAGE = 'Nicht angemeldet.'
const SESSION_NOT_FOUND_MESSAGE = 'Spielsitzung nicht gefunden.'
const MAP_NOT_FOUND_MESSAGE = 'Karte nicht gefunden.'
const ALREADY_MOUNTED_MESSAGE = 'Diese Karte ist bereits eingehängt.'
const INSTANCE_NOT_FOUND_MESSAGE = 'Karteninstanz nicht gefunden.'

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string, field?: string): FastifyReply {
  return reply.status(statusCode).send({
    statusCode,
    error,
    message,
    ...(field ? { field } : {}),
  })
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002'
}

/** Loest die Anmelde-Sitzung wie `session/routes.ts` auf; antwortet bei fehlender/ungueltiger
 * Sitzung selbst mit `401` und liefert dann `null` - der Aufrufer bricht in diesem Fall ab. */
async function requireUser(request: FastifyRequest, reply: FastifyReply, deps: Pick<SessionMapRoutesDeps, 'prisma' | 'clock'>) {
  const sessionId = request.cookies[SESSION_COOKIE_NAME]
  if (!sessionId) {
    sendError(reply, 401, 'Unauthorized', NOT_LOGGED_IN_MESSAGE)
    return null
  }
  const resolved = await resolveSession(deps.prisma, sessionId, deps.clock)
  if (!resolved) {
    sendError(reply, 401, 'Unauthorized', NOT_LOGGED_IN_MESSAGE)
    return null
  }
  return resolved.user
}

/**
 * Laedt eine Spielsitzung, aber nur, wenn `userId` sie als Spielleiter leitet - die Pruefung
 * ist Teil der Abfrage (design.md D3), nicht ein `if` danach. Ohne Treffer `null`, egal ob
 * Spieler, Nicht-Mitglied oder unbekannte `id` - fuer den Aufrufer nicht unterscheidbar
 * (constitution.md §9.2).
 */
export async function findLedSession(prisma: PrismaClient, userId: string, sessionId: string) {
  return prisma.gameSession.findFirst({
    where: { id: sessionId, memberships: { some: { userId, role: 'spielleiter' } } },
  })
}

function toInstanceView(instanceId: string, position: number, map: GameMapLike): MapInstance {
  const summary = toMapSummary(map)
  return {
    id: instanceId,
    mapId: summary.id,
    name: summary.name,
    hasImage: summary.hasImage,
    grid: summary.grid,
    position,
  }
}

export function registerSessionMapRoutes(app: FastifyInstance, deps: SessionMapRoutesDeps): void {
  const { prisma, io, presence } = deps

  app.get<{ Params: SessionIdParams }>('/api/sessions/:id/maps', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const gameSession = await findLedSession(prisma, user.id, request.params.id)
    if (!gameSession) {
      sendError(reply, 404, 'Not Found', SESSION_NOT_FOUND_MESSAGE)
      return
    }

    const instances = await prisma.mapInstance.findMany({
      where: { sessionId: gameSession.id },
      include: { map: true },
      orderBy: { position: 'asc' },
    })
    reply.status(200).send(instances.map((instance) => toInstanceView(instance.id, instance.position, instance.map)))
  })

  app.post<{ Params: SessionIdParams }>('/api/sessions/:id/maps', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const gameSession = await findLedSession(prisma, user.id, request.params.id)
    if (!gameSession) {
      sendError(reply, 404, 'Not Found', SESSION_NOT_FOUND_MESSAGE)
      return
    }

    const parsed = MountMapInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      sendError(reply, 400, 'Bad Request', issue.message, 'mapId')
      return
    }

    const map = await findOwnMap(prisma, user.id, parsed.data.mapId)
    if (!map) {
      sendError(reply, 404, 'Not Found', MAP_NOT_FOUND_MESSAGE)
      return
    }

    try {
      const instance = await prisma.$transaction(async (tx) => {
        const highest = await tx.mapInstance.findFirst({
          where: { sessionId: gameSession.id },
          orderBy: { position: 'desc' },
        })
        const position = (highest?.position ?? 0) + 1
        return tx.mapInstance.create({
          data: { sessionId: gameSession.id, mapId: map.id, position },
        })
      })
      reply.status(201).send(toInstanceView(instance.id, instance.position, map))
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(reply, 409, 'Conflict', ALREADY_MOUNTED_MESSAGE)
        return
      }
      throw error
    }
  })

  app.delete<{ Params: InstanceParams }>('/api/sessions/:id/maps/:instanceId', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const gameSession = await findLedSession(prisma, user.id, request.params.id)
    if (!gameSession) {
      sendError(reply, 404, 'Not Found', SESSION_NOT_FOUND_MESSAGE)
      return
    }

    const instance = await prisma.mapInstance.findFirst({
      where: { id: request.params.instanceId, sessionId: gameSession.id },
    })
    if (!instance) {
      sendError(reply, 404, 'Not Found', INSTANCE_NOT_FOUND_MESSAGE)
      return
    }

    const wasActive = gameSession.activeInstanceId === instance.id
    await prisma.$transaction(async (tx) => {
      if (wasActive) {
        await tx.gameSession.update({ where: { id: gameSession.id }, data: { activeInstanceId: null } })
      }
      await tx.mapInstance.delete({ where: { id: instance.id } })
    })

    if (wasActive) {
      emitActiveMap(io, gameSession.id, null)
      // add-fog-of-war (#16, Requirement "Fog beim Betreten und Kartenwechsel"): Aushaengen
      // der aktiven Instanz sendet ebenfalls "session:fog" (hier immer `null`, da keine
      // Instanz mehr aktiv ist) - vor dem Tokenbestand, wie bei jedem anderen Kartenwechsel.
      // Die Cascade hat die `FogCell`-/`FogArea`-Zeilen der geloeschten Instanz bereits mit
      // entfernt (design.md D1, Requirement "Aushängen löscht aufgedeckte Zellen und
      // Bereiche").
      await broadcastFog(io, prisma, presence, gameSession.id)
      // session-token (#14, Requirement "Aushängen löscht die Tokens der Instanz"): die
      // Cascade hat die Tokens bereits geloescht - der leere Bestand erreicht den Raum wie
      // bei jedem anderen Kartenwechsel.
      await broadcastTokens(io, prisma, presence, gameSession.id)
    }

    reply.status(204).send()
  })
}
