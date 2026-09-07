import { randomBytes } from 'node:crypto'

import type { PrismaClient, User } from '@prisma/client'

import type { Clock } from '../core/clock.js'
import { computeSessionExpiry, isSessionExpired, shouldRenewSession } from './rules.js'

// Duenne Anbindung der Sitzungsregeln aus rules.ts an Prisma. Die Uhr wird durchgereicht,
// nie selbst erzeugt (design.md D5).

export const SESSION_COOKIE_NAME = 'sid'

/** Legt eine neue Sitzung an - opake ID nach design.md D4, niemals aus vorhersagbaren Werten. */
export async function createSession(prisma: PrismaClient, userId: string, clock: Clock) {
  const id = randomBytes(32).toString('base64url')
  const expiresAt = computeSessionExpiry(clock)
  return prisma.session.create({ data: { id, userId, expiresAt } })
}

export interface ResolvedSession {
  user: User
  /** War die Sitzung nach der Halbwertsregel faellig fuer eine Verlaengerung? Falls ja, hat
   * diese Funktion `Session.expiresAt` bereits aktualisiert - der Aufrufer muss dann noch
   * das Cookie im Browser mit frischem `maxAge` neu setzen, sonst laeuft die Anmeldung im
   * Browser trotz gueltiger DB-Sitzung nach 30 Tagen aus (Review-Runde 2). */
  renewed: boolean
  expiresAt: Date
}

/**
 * Loest eine Sitzungs-ID zum angemeldeten Nutzer auf. Eine abgelaufene Sitzung wird dabei
 * geloescht und gilt nicht mehr als Anmeldung; eine gueltige Sitzung wird nach der
 * Halbwertsregel verlaengert.
 */
export async function resolveSession(prisma: PrismaClient, sessionId: string, clock: Clock): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } })
  if (!session) {
    return null
  }
  const now = clock()
  if (isSessionExpired(session.expiresAt, now)) {
    await prisma.session.deleteMany({ where: { id: session.id } })
    return null
  }
  if (shouldRenewSession(session.expiresAt, now)) {
    const expiresAt = computeSessionExpiry(clock)
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt },
    })
    return { user: session.user, renewed: true, expiresAt }
  }
  return { user: session.user, renewed: false, expiresAt: session.expiresAt }
}

/** Beendet eine Sitzung serverseitig. Idempotent - eine bereits geloeschte Sitzung ist kein Fehler. */
export async function destroySession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } })
}
