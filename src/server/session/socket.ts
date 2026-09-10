import cookiePluginDefault from '@fastify/cookie'
import type { PrismaClient } from '@prisma/client'
import type { Server, Socket } from 'socket.io'

import {
  AliasInputSchema,
  EnterInputSchema,
  GameSessionStatusSchema,
  MemberRoleSchema,
  nextStatus,
  SESSION_EVENTS,
  TransitionInputSchema,
  type AliasAck,
  type EnterAck,
  type TransitionAck,
} from '../../shared/session.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import type { Clock } from '../core/clock.js'
import { authorizeAction } from './authorize.js'
import type { Presence } from './presence.js'
import { broadcastParticipants, broadcastStatus, buildParticipants, emitParticipants, roomName } from './room.js'
import { toSessionSummary } from './rules.js'

// Socket-Handler des Raums (design.md D6-D9): Reihenfolge in jedem Handler ist zod-Parse der
// Payload -> authorizeAction -> Regel -> DB -> Broadcast -> Acknowledgement. Nichts an der
// Verbindung gilt als Erlaubnis (constitution.md §9.3) - jede Aktion loest Cookie-Sitzung,
// Mitgliedschaft und Zustand frisch aus der Datenbank auf.

// `@fastify/cookie` ist ein reines CJS-Paket (`export =`); Node's CJS-Interop liefert beim
// Default-Import in jedem Modulsystem dasselbe `module.exports`-Objekt (mit `.parse` als
// eigener Eigenschaft zur Laufzeit) - aber TypeScript leitet aus der Typdeklaration je nach
// `moduleResolution` unterschiedliche statische Formen ab (unter "NodeNext" liegt `.parse`
// scheinbar nur unter `.fastifyCookie.parse`, unter "node"/commonjs - wie es `ts-jest` im
// Gate faehrt - fehlt sogar das). Ein einziger Cast auf die tatsaechliche Laufzeitform macht
// den Zugriff unabhaengig von dieser Diskrepanz und typisiert unter beiden Konfigurationen
// (design.md D6: "parse aus @fastify/cookie, kein Eigenbau").
const parseCookieHeader = (cookiePluginDefault as unknown as { parse: (cookieHeader: string) => Record<string, string> }).parse

export interface SessionSocketDeps {
  prisma: PrismaClient
  clock: Clock
  presence: Presence
}

const INVALID_PAYLOAD_MESSAGE = 'Ungültige Anfrage.'
const GENERIC_ACK_ERROR_MESSAGE = 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.'
const CLOSED_SESSION_MESSAGE = 'Diese Spielsitzung ist geschlossen.'
const TRANSITION_NOT_ALLOWED_MESSAGE = 'Dieser Übergang ist nicht erlaubt.'

export function registerSessionSocket(io: Server, deps: SessionSocketDeps): void {
  const { prisma, clock, presence } = deps

  // Handshake-Middleware (design.md D6): nur pruefen, dass ueberhaupt ein `sid`-Cookie
  // vorhanden ist - keine DB-Abfrage hier. Der Wert ist ein Verweis, keine Erlaubnis; die
  // eigentliche Pruefung geschieht pro Aktion in `authorizeAction`.
  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie
    const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {}
    const sid = cookies[SESSION_COOKIE_NAME]
    if (!sid) {
      next(new Error(INVALID_PAYLOAD_MESSAGE))
      return
    }
    socket.data.sid = sid
    next()
  })

  io.on('connection', (socket: Socket) => {
    socket.on(SESSION_EVENTS.enter, (payload: unknown, callback: (ack: EnterAck) => void) => {
      handleEnter(socket, payload, callback).catch((error: unknown) => {
        console.error(error)
        callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
      })
    })

    socket.on(SESSION_EVENTS.transition, (payload: unknown, callback: (ack: TransitionAck) => void) => {
      handleTransition(socket, payload, callback).catch((error: unknown) => {
        console.error(error)
        callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
      })
    })

    socket.on(SESSION_EVENTS.alias, (payload: unknown, callback: (ack: AliasAck) => void) => {
      handleAlias(socket, payload, callback).catch((error: unknown) => {
        console.error(error)
        callback({ ok: false, message: GENERIC_ACK_ERROR_MESSAGE })
      })
    })

    // Der disconnect-Handler hat keinen Absender, dem er antworten koennte - Fehler werden
    // nur geloggt (design.md D8, AGENTS.md: kein stilles catch{}).
    socket.on('disconnect', () => {
      handleDisconnect(socket).catch((error: unknown) => {
        console.error(error)
      })
    })
  })

  async function handleEnter(socket: Socket, payload: unknown, callback: (ack: EnterAck) => void): Promise<void> {
    const parsed = EnterInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId)
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    const { user, membership, gameSession } = authResult
    const role = MemberRoleSchema.parse(membership.role)
    const status = GameSessionStatusSchema.parse(gameSession.status)

    // Spieler duerfen eine geschlossene Spielsitzung nicht betreten; der Spielleiter erreicht
    // seine Spielsitzung in jedem Zustand (Requirement "Verbindung und Betreten des Raums").
    if (role === 'spieler' && status === 'geschlossen') {
      callback({ ok: false, message: CLOSED_SESSION_MESSAGE })
      return
    }

    const { replaced, previousRoom } = presence.enter(sessionId, user.id, socket.id)

    if (previousRoom && previousRoom !== sessionId) {
      await socket.leave(roomName(previousRoom))
    }

    if (replaced) {
      // Uebernahme (design.md D8): dem alten Socket Bescheid geben, aus dem Raum nehmen,
      // danach trennen. Socket.IO-Clients verbinden sich nach einer serverseitigen Trennung
      // nicht automatisch neu.
      const oldSocket = io.sockets.sockets.get(replaced)
      if (oldSocket) {
        oldSocket.emit(SESSION_EVENTS.replaced, { sessionId })
        await oldSocket.leave(roomName(sessionId))
        oldSocket.disconnect(true)
      }
    }

    await socket.join(roomName(sessionId))

    const participants = await buildParticipants(prisma, presence, sessionId)
    emitParticipants(io, sessionId, participants)

    const summary = toSessionSummary(gameSession, role)
    callback({ ok: true, session: summary, participants })
  }

  async function handleTransition(socket: Socket, payload: unknown, callback: (ack: TransitionAck) => void): Promise<void> {
    const parsed = TransitionInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, action } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId, { role: 'spielleiter' })
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    const currentStatus = GameSessionStatusSchema.parse(authResult.gameSession.status)
    const newStatus = nextStatus(currentStatus, action)
    if (!newStatus) {
      callback({ ok: false, message: TRANSITION_NOT_ALLOWED_MESSAGE })
      return
    }

    await prisma.gameSession.update({ where: { id: sessionId }, data: { status: newStatus } })
    broadcastStatus(io, sessionId, newStatus)
    callback({ ok: true, status: newStatus })

    if (action === 'beenden') {
      // Alle anwesenden Spieler-Sockets verlassen den Raum; der Spielleiter bleibt
      // (Requirement "Lebenszyklus durch den Spielleiter").
      const gameLeaderSocketId = presence.socketOf(sessionId, authResult.user.id)
      const socketIds = presence.socketsIn(sessionId)
      for (const socketId of socketIds) {
        if (socketId === gameLeaderSocketId) {
          continue
        }
        const playerSocket = io.sockets.sockets.get(socketId)
        if (!playerSocket) {
          continue
        }
        playerSocket.emit(SESSION_EVENTS.ended, { sessionId })
        await playerSocket.leave(roomName(sessionId))
        presence.leave(socketId)
      }
      await broadcastParticipants(io, presence, prisma, sessionId)
    }
  }

  /**
   * `session:alias` (design.md D4, Requirement "Alias pro Mitgliedschaft"): `authorizeAction`
   * ohne Rollenanforderung - jedes anwesende Mitglied darf sich selbst benennen. Das
   * Ereignis traegt keine Ziel-Nutzer-ID; geaendert wird ausschliesslich die Mitgliedschaft,
   * die `authorizeAction` fuer den Absender liefert - die Berechtigungspruefung ist damit
   * strukturell, nicht per `if` (constitution.md §9.3).
   */
  async function handleAlias(socket: Socket, payload: unknown, callback: (ack: AliasAck) => void): Promise<void> {
    const parsed = AliasInputSchema.safeParse(payload)
    if (!parsed.success) {
      callback({ ok: false, message: INVALID_PAYLOAD_MESSAGE })
      return
    }
    const { sessionId, alias } = parsed.data

    const authResult = await authorizeAction({ prisma, clock }, socket, sessionId)
    if (!authResult.ok) {
      callback({ ok: false, message: authResult.message })
      return
    }

    await prisma.membership.update({ where: { id: authResult.membership.id }, data: { alias } })
    await broadcastParticipants(io, presence, prisma, sessionId)
    callback({ ok: true, alias })
  }

  async function handleDisconnect(socket: Socket): Promise<void> {
    const result = presence.leave(socket.id)
    if (!result) {
      // Ein bereits ersetzter Socket (Uebernahme) loest hier nichts mehr aus (design.md D7).
      return
    }
    const { gameSessionId, userId } = result

    await broadcastParticipants(io, presence, prisma, gameSessionId)

    const membership = await prisma.membership.findUnique({
      where: { sessionId_userId: { sessionId: gameSessionId, userId } },
    })
    if (!membership || MemberRoleSchema.parse(membership.role) !== 'spielleiter') {
      return
    }

    const gameSession = await prisma.gameSession.findUnique({ where: { id: gameSessionId } })
    if (!gameSession || GameSessionStatusSchema.parse(gameSession.status) !== 'gestartet') {
      return
    }

    // Verbindungsverlust des Spielleiters in `gestartet` pausiert (Requirement "Abwesenheit
    // des Spielleiters pausiert") - eine Uebernahme durch eine zweite Verbindung desselben
    // Spielleiters loest das nicht aus, weil `presence.leave` dafuer bereits `null` liefert.
    await prisma.gameSession.update({ where: { id: gameSessionId }, data: { status: 'pausiert' } })
    broadcastStatus(io, gameSessionId, 'pausiert')
  }
}
