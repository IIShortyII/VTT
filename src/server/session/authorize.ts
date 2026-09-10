import type { GameSession, Membership, PrismaClient, User } from '@prisma/client'

import type { MemberRole } from '../../shared/session.js'
import { resolveSession } from '../auth/session.js'
import type { Clock } from '../core/clock.js'

// Autorisierung pro Aktion (design.md D6, constitution.md §9.3): jeder Socket-Handler
// beginnt mit dieser Funktion. Nichts an der Verbindung wird als Erlaubnis gecacht - Anmelde-
// Sitzung, Mitgliedschaft und Zustand werden bei jedem Aufruf frisch aus der DB gelesen.

export interface AuthorizeDeps {
  prisma: PrismaClient
  clock: Clock
}

/** Das, was `authorizeAction` von einem Socket braucht - ein `socket.data.sid`, wie ihn die
 * Handshake-Middleware in `session/socket.ts` setzt. Entkoppelt von `socket.io`, damit diese
 * Datei ohne echten Socket testbar bleibt. */
export interface AuthorizableSocket {
  data: { sid?: string }
}

export interface AuthorizeOptions {
  /** Verlangt genau diese Rolle der Mitgliedschaft (z. B. `spielleiter` fuer
   * Zustandsuebergaenge). Ohne Angabe genuegt jede Mitgliedschaft. */
  role?: MemberRole
}

export type AuthorizeResult =
  | { ok: true; user: User; membership: Membership; gameSession: GameSession }
  | { ok: false; message: string }

const NOT_AUTHENTICATED_MESSAGE = 'Nicht angemeldet.'
const NOT_A_MEMBER_MESSAGE = 'Kein Zugriff auf diese Spielsitzung.'
const FORBIDDEN_ROLE_MESSAGE = 'Dafür fehlt die Berechtigung.'
const NOT_FOUND_MESSAGE = 'Spielsitzung nicht gefunden.'

/**
 * Schritte, jedes Mal (design.md D6): (1) Anmelde-Sitzung aus `socket.data.sid` aufloesen,
 * (2) Mitgliedschaft nachsehen, (3) Spielsitzung laden und Rolle pruefen. Ein Aufrufer, der
 * zusaetzlich den Zustand der Spielsitzung einschraenken will (etwa "nur wenn nicht
 * geschlossen"), prueft das selbst anhand von `gameSession.status` - diese Funktion kennt nur
 * die Rollenanforderung, weil "welcher Zustand fuer welche Aktion erlaubt ist" je Handler
 * unterschiedlich ist (spec.md "Verbindung und Betreten des Raums" vs. "Lebenszyklus durch
 * den Spielleiter").
 */
export async function authorizeAction(
  deps: AuthorizeDeps,
  socket: AuthorizableSocket,
  gameSessionId: string,
  options?: AuthorizeOptions,
): Promise<AuthorizeResult> {
  const sid = socket.data.sid
  if (!sid) {
    return { ok: false, message: NOT_AUTHENTICATED_MESSAGE }
  }

  const resolved = await resolveSession(deps.prisma, sid, deps.clock)
  if (!resolved) {
    return { ok: false, message: NOT_AUTHENTICATED_MESSAGE }
  }

  const membership = await deps.prisma.membership.findUnique({
    where: { sessionId_userId: { sessionId: gameSessionId, userId: resolved.user.id } },
  })
  if (!membership) {
    return { ok: false, message: NOT_A_MEMBER_MESSAGE }
  }

  const gameSession = await deps.prisma.gameSession.findUnique({ where: { id: gameSessionId } })
  if (!gameSession) {
    return { ok: false, message: NOT_FOUND_MESSAGE }
  }

  if (options?.role && membership.role !== options.role) {
    return { ok: false, message: FORBIDDEN_ROLE_MESSAGE }
  }

  return { ok: true, user: resolved.user, membership, gameSession }
}
