import type { Account, PrismaClient, User } from '@prisma/client'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { ZodIssue } from 'zod'

import { ChangePasswordInputSchema, LoginInputSchema, RegisterInputSchema, type UserOutput } from '../../shared/auth.js'
import type { Clock } from '../core/clock.js'
import { clearLockout, getDummyHash, hashPassword, isAccountLocked, normalizeEmail, recordFailedAttempt, verifyPassword } from './rules.js'
import { createSession, deleteOtherSessions, destroySession, resolveSession, SESSION_COOKIE_NAME } from './session.js'

// Duenne Fastify-Anbindung: Validierung an der Grenze (zod), Aufruf der reinen Regeln aus
// rules.ts/session.ts, Uebersetzung in HTTP. Keine Geschaeftsregeln hier (design.md D1).

export interface AuthDeps {
  prisma: PrismaClient
  clock: Clock
  cookieSecure: boolean
}

const PROVIDER_PASSWORD = 'password'
const LOGIN_FAILURE_MESSAGE = 'E-Mail oder Passwort ist falsch.'
const CURRENT_PASSWORD_WRONG_MESSAGE = 'Das bisherige Passwort ist falsch.'

function toUserOutput(user: Pick<User, 'id' | 'email'>): UserOutput {
  return { id: user.id, email: user.email }
}

/**
 * Die Cookie-Laufzeit ist keine eigene Quelle, sondern eine Projektion des
 * Sitzungs-Ablaufzeitpunkts aus der Datenbank (design.md D1) - so holt ein Browser, dem eine
 * verlaengernde Antwort verloren ging, die Verlaengerung mit der naechsten Antwort nach.
 */
function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: Date, clock: Clock, cookieSecure: boolean): void {
  const maxAge = Math.max(0, Math.ceil((expiresAt.getTime() - clock().getTime()) / 1000))
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: cookieSecure,
    maxAge,
  })
}

function clearSessionCookie(reply: FastifyReply, cookieSecure: boolean): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: cookieSecure,
  })
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string, field?: string): FastifyReply {
  return reply.status(statusCode).send({
    statusCode,
    error,
    message,
    ...(field ? { field } : {}),
  })
}

/** Uebersetzt einen zod-Issue-Pfad in das `field`-Antwortfeld - bei leerem Pfad (etwa ein
 * strukturell ungueltiger Koerper) entfaellt es, statt als leerer String zu erscheinen
 * (design.md D3). */
function fieldFromPath(path: ZodIssue['path']): string | undefined {
  return path.length > 0 ? path.join('.') : undefined
}

/** Haengt eine Issue am Feld `password`? Nur dann ist ein Anmeldekoerper eine formal
 * moegliche, aber an den Zugangsdaten scheiternde Anmeldung (design.md D3). */
function isPasswordFormIssue(issue: ZodIssue): boolean {
  return issue.path.length > 0 && issue.path[0] === 'password'
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { prisma, clock, cookieSecure } = deps

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = RegisterInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return sendError(reply, 400, 'Bad Request', issue.message, fieldFromPath(issue.path))
    }

    const email = normalizeEmail(parsed.data.email)
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return sendError(reply, 409, 'Conflict', 'Diese E-Mail-Adresse ist bereits vergeben.')
    }

    const passwordHash = await hashPassword(parsed.data.password)

    let user: User
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email } })
        await tx.account.create({
          data: { userId: created.id, provider: PROVIDER_PASSWORD, passwordHash },
        })
        return created
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002') {
        return sendError(reply, 409, 'Conflict', 'Diese E-Mail-Adresse ist bereits vergeben.')
      }
      throw error
    }

    const session = await createSession(prisma, user.id, clock)
    setSessionCookie(reply, session.id, session.expiresAt, clock, cookieSecure)
    return reply.status(201).send(toUserOutput(user))
  })

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issues = parsed.error.issues
      const isFailedLoginAttempt = issues.length > 0 && issues.every(isPasswordFormIssue)
      if (!isFailedLoginAttempt) {
        // Strukturell keine Anmeldung (kein Objekt, fehlende/ungueltige E-Mail, ...) - eine
        // ungueltige Anfrage, keine falschen Zugangsdaten (design.md D3).
        const issue = issues[0]
        return sendError(reply, 400, 'Bad Request', issue.message, fieldFromPath(issue.path))
      }
      // Der Koerper ist ein Objekt mit gueltiger E-Mail, und nur das Passwort hat nicht die
      // erwartete Form (leer oder laenger als ein gueltiges Passwort je sein kann -
      // PASSWORD_MAX_LENGTH). Das ist garantiert keine gueltige Anmeldung; wie falsche
      // Zugangsdaten behandeln (401, gleiche Meldung), statt einen dritten, unterscheidbaren
      // Antworttyp zu erzeugen und ohne den Wert erst durch `scrypt` zu schicken
      // (Review-Runde 2).
      return sendError(reply, 401, 'Unauthorized', LOGIN_FAILURE_MESSAGE)
    }

    const email = normalizeEmail(parsed.data.email)
    const user = await prisma.user.findUnique({ where: { email }, include: { accounts: true } })
    const account = user?.accounts.find((a) => a.provider === PROVIDER_PASSWORD)
    // Gleiche Arbeit fuer bekannte und unbekannte E-Mail: bei fehlendem Konto wird gegen
    // einen konstanten Dummy-Hash verifiziert (constitution.md §9.2).
    const hash = account?.passwordHash ?? (await getDummyHash())
    const valid = await verifyPassword(parsed.data.password, hash)

    if (!user || !account) {
      // Unbekannte E-Mail: kein Konto, also nichts zu zaehlen (design.md D2, Requirement
      // "Sperre nach Fehlversuchen").
      return sendError(reply, 401, 'Unauthorized', LOGIN_FAILURE_MESSAGE)
    }

    const now = clock()
    if (isAccountLocked(account.lockedUntil, now)) {
      // Die Sperre ist stumm: dieselbe Antwort wie bei falschem Passwort, unabhaengig davon,
      // ob das Passwort stimmte; kein Schreibzugriff, keine Sitzung (design.md D2,
      // constitution.md §9.2).
      return sendError(reply, 401, 'Unauthorized', LOGIN_FAILURE_MESSAGE)
    }

    if (!valid) {
      const next = recordFailedAttempt({ failedLoginCount: account.failedLoginCount, lockedUntil: account.lockedUntil }, now)
      await prisma.account.update({ where: { id: account.id }, data: next })
      return sendError(reply, 401, 'Unauthorized', LOGIN_FAILURE_MESSAGE)
    }

    // Zeile nur schreiben, wenn sich etwas aendert - sonst schriebe jede Anmeldung
    // (design.md D2).
    if (account.failedLoginCount !== 0 || account.lockedUntil !== null) {
      await prisma.account.update({ where: { id: account.id }, data: clearLockout() })
    }

    const session = await createSession(prisma, user.id, clock)
    setSessionCookie(reply, session.id, session.expiresAt, clock, cookieSecure)
    return reply.status(200).send(toUserOutput(user))
  })

  app.get('/api/auth/me', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME]
    if (!sessionId) {
      return sendError(reply, 401, 'Unauthorized', 'Nicht angemeldet.')
    }

    const resolved = await resolveSession(prisma, sessionId, clock)
    if (!resolved) {
      // "Keine Zeile" und "Zeile abgelaufen und geloescht" sind fuer den Aufrufer gleich: das
      // vorgelegte Cookie ist in beiden Faellen wertlos und wird entwertet, so wie es die
      // Abmeldung tut (design.md D2).
      clearSessionCookie(reply, cookieSecure)
      return sendError(reply, 401, 'Unauthorized', 'Nicht angemeldet.')
    }

    // Jede authentifizierte Antwort traegt das Cookie mit der aus der DB abgeleiteten
    // Restlaufzeit - unabhaengig davon, ob die Halbwertsregel gerade verlaengert hat
    // (design.md D1). Ein verlorener Verlaengerungs-Response holt sich das beim naechsten
    // Aufruf so von selbst nach.
    setSessionCookie(reply, sessionId, resolved.expiresAt, clock, cookieSecure)

    return reply.status(200).send(toUserOutput(resolved.user))
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME]
    if (sessionId) {
      await destroySession(prisma, sessionId)
    }
    clearSessionCookie(reply, cookieSecure)
    return reply.status(200).send({ ok: true })
  })

  app.post('/api/auth/password', async (request, reply) => {
    // 1) Sitzung aus dem Cookie aufloesen, wie /me (design.md D3 Schritt 1).
    const sessionId = request.cookies[SESSION_COOKIE_NAME]
    if (!sessionId) {
      return sendError(reply, 401, 'Unauthorized', 'Nicht angemeldet.')
    }
    const resolved = await resolveSession(prisma, sessionId, clock)
    if (!resolved) {
      clearSessionCookie(reply, cookieSecure)
      return sendError(reply, 401, 'Unauthorized', 'Nicht angemeldet.')
    }

    // 2) Koerper validieren, bevor irgendetwas gegen das Konto geprueft wird - ein
    // Fehlversuchszaehler darf nicht an einer Formverletzung des neuen Passworts hochzaehlen
    // (design.md D3 Schritt 2).
    const parsed = ChangePasswordInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return sendError(reply, 400, 'Bad Request', issue.message, fieldFromPath(issue.path))
    }

    const account: Account | null = await prisma.account.findUnique({
      where: { userId_provider: { userId: resolved.user.id, provider: PROVIDER_PASSWORD } },
    })
    if (!account) {
      throw new Error(`Kein Passwort-Konto fuer Nutzer ${resolved.user.id} gefunden.`)
    }

    // 3) Bisheriges Passwort immer gegen den Hash pruefen - auch bei gesperrtem Konto,
    // derselbe Grund wie beim Anmeldepfad: ein Kurzschluss vor scrypt waere ein Timing-Kanal
    // (design.md D3 Schritt 3, D2 Schritt 1).
    const now = clock()
    const locked = isAccountLocked(account.lockedUntil, now)
    const valid = await verifyPassword(parsed.data.currentPassword, account.passwordHash)

    if (locked || !valid) {
      // Falsches Passwort zaehlt als Fehlversuch und wird geschrieben; bei gesperrtem Konto
      // bleibt die Zeile unveraendert (design.md D3 Schritt 4).
      if (!locked && !valid) {
        const next = recordFailedAttempt({ failedLoginCount: account.failedLoginCount, lockedUntil: account.lockedUntil }, now)
        await prisma.account.update({ where: { id: account.id }, data: next })
      }
      return sendError(reply, 403, 'Forbidden', CURRENT_PASSWORD_WRONG_MESSAGE, 'currentPassword')
    }

    // 5) Erfolgreiche Aenderung: Hash vor der Transaktion berechnen - scrypt in einer offenen
    // Transaktion wuerde SQLite unnoetig lange sperren (design.md D3 Schritt 5).
    const newPasswordHash = await hashPassword(parsed.data.newPassword)

    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { passwordHash: newPasswordHash, ...clearLockout() },
      })
      // Jede andere Sitzung des Nutzers endet; die aktuelle bleibt bestehen (design.md D4).
      await deleteOtherSessions(tx, resolved.user.id, sessionId)
    })

    // Das Cookie bleibt unveraendert - die eigene Sitzung lebt weiter (design.md D3 Schritt 5).
    return reply.status(200).send({ ok: true })
  })
}
