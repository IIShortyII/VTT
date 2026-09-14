import type { GameSession, PrismaClient } from '@prisma/client'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Server } from 'socket.io'

import { CreateSessionInputSchema, JoinSessionInputSchema, MemberRoleSchema, SESSION_EVENTS, type SessionSummary } from '../../shared/session.js'
import { resolveSession, SESSION_COOKIE_NAME } from '../auth/session.js'
import type { Clock } from '../core/clock.js'
import { broadcastParticipants, roomName } from './room.js'
import { generateCode, toSessionSummary } from './rules.js'
import type { Presence } from './presence.js'

// Duenne Fastify-Anbindung fuer Erstellen/Beitreten/Liste/Verlassen (design.md D3, add-
// session-leave #70 D1-D3). Der Beitritt und das Verlassen senden zusaetzlich in den Raum
// (design.md D3) - deshalb braucht diese Registrierung `io` und `presence`.

export interface SessionRoutesDeps {
  prisma: PrismaClient
  clock: Clock
  cookieSecure: boolean
  io: Server
  presence: Presence
}

interface SessionMemberParams {
  id: string
  userId: string
}

const NOT_LOGGED_IN_MESSAGE = 'Nicht angemeldet.'
const JOIN_FAILURE_MESSAGE = 'Sitzungscode prüfen und ob die Spielleitung die Sitzung geöffnet hat.'
const CODE_GENERATION_FAILURE_MESSAGE = 'Sitzungscode konnte nicht erzeugt werden. Bitte versuche es erneut.'
const MAX_CODE_ATTEMPTS = 10
// add-session-leave (#70, Requirement "Verlassen einer Spielsitzung und Entfernen eines
// Spielers"): dieselbe Meldung fuer jeden der drei 403-Faelle aus design.md D1 - der Client
// unterscheidet sie ohnehin nicht (nur der Statuscode zaehlt fuer die Berechtigungspruefung).
const MEMBER_FORBIDDEN_MESSAGE = 'Dafür fehlt die Berechtigung.'
const MEMBER_NOT_FOUND_MESSAGE = 'Mitgliedschaft nicht gefunden.'

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

/** Loest die Anmelde-Sitzung wie `auth/routes.ts` auf; antwortet bei fehlender/ungueltiger
 * Sitzung selbst mit `401` und liefert dann `null` - der Aufrufer bricht in diesem Fall ab. */
async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Pick<SessionRoutesDeps, 'prisma' | 'clock'>,
) {
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

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRoutesDeps): void {
  const { prisma, io, presence } = deps

  app.post('/api/sessions', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const parsed = CreateSessionInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      sendError(reply, 400, 'Bad Request', issue.message, 'name')
      return
    }

    // Code-Schleife (design.md D4): bei einer Kollision (`P2002` auf `code`) neu erzeugen,
    // bei jedem anderen Fehler sofort weiterwerfen. Bei 2^30 moeglichen Codes praktisch
    // unerreichbar, aber begrenzt statt endlos.
    let gameSession: GameSession | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateCode()
      try {
        gameSession = await prisma.$transaction(async (tx) => {
          const created = await tx.gameSession.create({
            data: { name: parsed.data.name, code, status: 'geschlossen' },
          })
          await tx.membership.create({
            data: { sessionId: created.id, userId: user.id, role: 'spielleiter' },
          })
          return created
        })
        lastError = null
        break
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          lastError = error
          continue
        }
        throw error
      }
    }
    if (!gameSession) {
      throw lastError instanceof Error ? lastError : new Error(CODE_GENERATION_FAILURE_MESSAGE)
    }

    const summary = toSessionSummary(gameSession, 'spielleiter')
    reply.status(201).send(summary)
  })

  app.post('/api/sessions/join', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const parsed = JoinSessionInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      sendError(reply, 400, 'Bad Request', issue.message, 'code')
      return
    }

    const gameSession = await prisma.gameSession.findUnique({ where: { code: parsed.data.code } })
    if (!gameSession || gameSession.status === 'geschlossen') {
      // Unbekannter Code und geschlossene Spielsitzung sind fuer den Anfragenden identisch
      // (constitution.md §9.2, design.md D4).
      sendError(reply, 404, 'Not Found', JOIN_FAILURE_MESSAGE, 'code')
      return
    }

    const existing = await prisma.membership.findUnique({
      where: { sessionId_userId: { sessionId: gameSession.id, userId: user.id } },
    })

    let role = existing ? MemberRoleSchema.parse(existing.role) : null
    if (!existing) {
      try {
        const created = await prisma.membership.create({
          data: { sessionId: gameSession.id, userId: user.id, role: 'spieler' },
        })
        role = MemberRoleSchema.parse(created.role)
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error
        }
        // Wettlauf: zwischen der Suche oben und dem Anlegen ist die Mitgliedschaft schon
        // entstanden - erneut lesen statt zu scheitern (Beitritt bleibt idempotent).
        const raced = await prisma.membership.findUnique({
          where: { sessionId_userId: { sessionId: gameSession.id, userId: user.id } },
        })
        if (!raced) {
          throw error
        }
        role = MemberRoleSchema.parse(raced.role)
      }
      await broadcastParticipants(io, presence, prisma, gameSession.id)
    }

    const summary: SessionSummary = toSessionSummary(gameSession, role ?? 'spieler')
    reply.status(200).send(summary)
  })

  app.get('/api/sessions', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { session: true },
    })
    const summaries: SessionSummary[] = memberships.map((membership) =>
      toSessionSummary(membership.session, MemberRoleSchema.parse(membership.role)),
    )
    reply.status(200).send(summaries)
  })

  /**
   * `DELETE /api/sessions/:id/members/:userId` (add-session-leave #70, design.md D1-D3,
   * Requirement "Verlassen einer Spielsitzung und Entfernen eines Spielers"): Selbstaustritt
   * eines Spielers oder Entfernen eines Spielers durch den Spielleiter. Berechtigung und
   * Ziel werden bei jedem Aufruf frisch aus der Datenbank gelesen (constitution.md §9.3) -
   * nichts an der Anfrage selbst gilt als Erlaubnis.
   */
  app.delete<{ Params: SessionMemberParams }>('/api/sessions/:id/members/:userId', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const { id: sessionId, userId: targetUserId } = request.params

    const requesterMembership = await prisma.membership.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
    })
    if (!requesterMembership) {
      sendError(reply, 403, 'Forbidden', MEMBER_FORBIDDEN_MESSAGE)
      return
    }
    const requesterRole = MemberRoleSchema.parse(requesterMembership.role)
    const isSelf = targetUserId === user.id

    const targetMembership = await prisma.membership.findUnique({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
    })

    // design.md D1: ein Spielleiter kann ueber diese Route nicht entfernt werden - auch nicht
    // sich selbst. Diese Pruefung greift vor der 404-Pruefung, wenn das Ziel existiert.
    if (targetMembership && MemberRoleSchema.parse(targetMembership.role) === 'spielleiter') {
      sendError(reply, 403, 'Forbidden', MEMBER_FORBIDDEN_MESSAGE)
      return
    }

    // design.md D1: ein Spieler darf ausschliesslich sich selbst austragen.
    if (requesterRole === 'spieler' && !isSelf) {
      sendError(reply, 403, 'Forbidden', MEMBER_FORBIDDEN_MESSAGE)
      return
    }

    if (!targetMembership) {
      sendError(reply, 404, 'Not Found', MEMBER_NOT_FOUND_MESSAGE)
      return
    }

    // design.md D2: eine Transaktion loescht die Mitgliedschaft und bereinigt Tokens (session-
    // token, Requirement "Bereinigung der Tokens beim Verlassen") sowie Anmerkungen (session-
    // annotation, Requirement "Bereinigung der Anmerkungen beim Verlassen") dieser
    // Spielsitzung - scheitert ein Schritt, bleibt kein Teil bestehen (§9.1).
    await prisma.$transaction([
      prisma.tokenShare.deleteMany({
        where: { userId: targetUserId, token: { instance: { sessionId } } },
      }),
      prisma.token.updateMany({
        where: { ownerId: targetUserId, instance: { sessionId } },
        data: { ownerId: null },
      }),
      prisma.annotation.updateMany({
        where: { authorId: targetUserId, visibility: 'geteilt', instance: { sessionId } },
        data: { authorId: null },
      }),
      prisma.annotation.deleteMany({
        where: { authorId: targetUserId, visibility: 'privat', instance: { sessionId } },
      }),
      prisma.membership.delete({
        where: { sessionId_userId: { sessionId, userId: targetUserId } },
      }),
    ])

    // design.md D3: der Betroffene verliert den Raum sofort - VOR dem Broadcast der uebrigen
    // Teilnehmerliste, sonst erreichte ihn dieser Broadcast noch (Requirement "Entfernter
    // anwesender Spieler verliert den Raum sofort"). `presence` kennt hoechstens eine Socket-ID
    // je Nutzer und Raum (design.md D7 aus #6) - Muster wie der Uebergang "beenden" in
    // `socket.ts`.
    const removedSocketId = presence.socketOf(sessionId, targetUserId)
    if (removedSocketId) {
      const removedSocket = io.sockets.sockets.get(removedSocketId)
      if (removedSocket) {
        removedSocket.emit(SESSION_EVENTS.removed, { sessionId })
        await removedSocket.leave(roomName(sessionId))
        presence.leave(removedSocketId)
      }
    }
    await broadcastParticipants(io, presence, prisma, sessionId)

    reply.status(200).send({ ok: true })
  })
}
