import type { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'

import { MemberRoleSchema, SESSION_EVENTS, type GameSessionStatus, type Participant } from '../../shared/session.js'
import type { Presence } from './presence.js'

// Teilnehmerliste und Broadcasts an den Raum einer Spielsitzung (design.md D3, D7). Jede
// Aenderung sendet die vollstaendige Liste, kein Delta - bei den Teilnehmerzahlen eines VTT
// ist ein Delta-Protokoll Zeremonie ohne Gegenwert (design.md D7).

export function roomName(gameSessionId: string): string {
  return `session:${gameSessionId}`
}

/** Mitgliedschaften aus der DB, verschnitten mit `presence.isOnline` (design.md D7). Die
 * E-Mail wird nicht selektiert - sie verlaesst den Server in keinem Drahtformat, das andere
 * Mitspieler erreicht (constitution.md §9.2, add-username-and-alias #45, design.md D5).
 * `alias` fehlt am Objekt, wenn die Mitgliedschaft keinen traegt - `ParticipantSchema` bildet
 * das auf ein fehlendes Feld auf der Leitung ab. */
export async function buildParticipants(prisma: PrismaClient, presence: Presence, gameSessionId: string): Promise<Participant[]> {
  const memberships = await prisma.membership.findMany({
    where: { sessionId: gameSessionId },
    include: { user: { select: { id: true, username: true } } },
  })
  return memberships.map((membership) => ({
    userId: membership.user.id,
    username: membership.user.username,
    ...(membership.alias !== null ? { alias: membership.alias } : {}),
    role: MemberRoleSchema.parse(membership.role),
    online: presence.isOnline(gameSessionId, membership.user.id),
  }))
}

/** Sendet die vollstaendige Teilnehmerliste an alle Verbindungen im Raum. */
export function emitParticipants(io: Server, gameSessionId: string, participants: Participant[]): void {
  io.to(roomName(gameSessionId)).emit(SESSION_EVENTS.participants, { sessionId: gameSessionId, participants })
}

/** Baut die Teilnehmerliste frisch aus der DB und sendet sie an den Raum (Requirement
 * "Teilnehmerliste in Echtzeit"). */
export async function broadcastParticipants(io: Server, presence: Presence, prisma: PrismaClient, gameSessionId: string): Promise<void> {
  const participants = await buildParticipants(prisma, presence, gameSessionId)
  emitParticipants(io, gameSessionId, participants)
}

/** Sendet den neuen Zustand an alle Verbindungen im Raum (Requirement "Lebenszyklus durch
 * den Spielleiter" / "Abwesenheit des Spielleiters pausiert"). */
export function broadcastStatus(io: Server, gameSessionId: string, status: GameSessionStatus): void {
  io.to(roomName(gameSessionId)).emit(SESSION_EVENTS.status, { sessionId: gameSessionId, status })
}
