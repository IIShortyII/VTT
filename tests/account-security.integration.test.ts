// Integrationstests zum Delta openspec/changes/add-account-security/specs/user-auth/spec.md
// (Requirements "Sperre nach Fehlversuchen" und "Passwortänderung"). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Sie teilen sich die Wegwerf-DB-Infrastruktur mit user-auth.integration.test.ts (AGENTS.md,
// constitution.md §4.3): dieselbe ephemere prisma/test.db, per `prisma migrate deploy` aus
// prisma/migrations/ aufgebaut und am Ende geloescht. Der Zugang zum Server laeuft wie dort
// ueber `createApp({ prisma, clock, logger: false }).inject()` — echter Fastify-Stack ohne Netz.
//
// Die Spalten Account.failedLoginCount / Account.lockedUntil (design.md D1), die Schwelle 5 /
// Dauer 15 Minuten und die Route POST /api/auth/password (D3) existieren erst nach der
// Implementierung. Tests, die diese Spalten setzen (`setLockout`), scheitern vorher zur
// Laufzeit an der fehlenden Spalte; Tests, die Zaehler/Sperrzeitpunkt lesen oder den neuen
// Endpunkt ansprechen, scheitern an der erwarteten Assertion (404 statt 200/400/401/403 bzw.
// `undefined` statt des erwarteten Zaehlerstands). Beide Gruende sind zulaessig (§3.1), ein
// Setup-/Compile-Fehler nicht.

import { Prisma, PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'

jest.setTimeout(120_000)

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const LOCKOUT_DURATION_MS = 15 * MINUTE // design.md D2
const LOCKOUT_THRESHOLD = 5 // design.md D2

const EMAIL = 'spieler@example.com'
const PASSWORD = 'ein-sicheres-passwort' // 21 Zeichen, erfuellt die 15er-Mindestlaenge (design.md D11)
const FALSCHES_PASSWORT = 'das-ist-das-falsche-passwort' // gueltige Form, falscher Wert
const NEUES_PASSWORT = 'mein-neues-sicheres-passwort' // 28 Zeichen, erfuellt die Passwortregel
const KURZES_PASSWORT = 'a'.repeat(14) // verletzt die 15er-Mindestlaenge

// Dieselbe Fehlermeldung, die der Anmeldepfad bei falschem Passwort sendet — ein gesperrtes
// Konto muss davon nicht zu unterscheiden sein (Requirement "Sperre nach Fehlversuchen").
type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
let removeDbFiles: () => void = () => {}

// --- Hilfen ---------------------------------------------------------------------------------

type Res = {
  statusCode: number
  body: string
  headers: Record<string, unknown>
  cookies: Array<{ name: string; value: string }>
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function userOf(res: Res): { id: string; email: string } {
  const body = must(asRecord(JSON.parse(res.body)), 'ein JSON-Objekt als Antwortkoerper')
  const user = asRecord(body.user) ?? body
  return {
    id: String(must(user.id, 'ein Feld "id" am Nutzer')),
    email: String(must(user.email, 'ein Feld "email" am Nutzer')),
  }
}

function fieldOf(res: Res): unknown {
  return must(asRecord(JSON.parse(res.body)), 'ein JSON-Objekt als Antwortkoerper').field
}

function setCookieHeaders(res: Res): string[] {
  const raw = res.headers['set-cookie']
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) return raw.map(String)
  return []
}

function sessionCookieHeader(res: Res): string | undefined {
  return setCookieHeaders(res).find((value) => value.startsWith('sid='))
}

function sidOf(res: Res): string {
  return must(
    res.cookies.find((cookie) => cookie.name === 'sid'),
    'ein gesetztes Sitzungscookie "sid"',
  ).value
}

async function makeApp(clock: () => Date = () => new Date()): Promise<App> {
  const app = await createApp({ prisma, clock, logger: false })
  openApps.push(app)
  return app
}

function register(app: App, email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password } })
}

function login(app: App, email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
}

function failedLogin(app: App, email: string) {
  return login(app, email, FALSCHES_PASSWORT)
}

function me(app: App, sid: string) {
  return app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } })
}

/** Die Passwortaenderung aus der Sitzung heraus (design.md D3). Der Koerper wird roh
 * uebergeben — das gemeinsame Schema `ChangePasswordInputSchema` entsteht erst mit der
 * Implementierung, der Vertrag ist aber fest: `{ currentPassword, newPassword }`. */
function changePassword(
  app: App,
  body: { currentPassword: string; newPassword: string },
  sid?: string,
) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/password',
    ...(sid === undefined ? {} : { cookies: { sid } }),
    payload: body,
  })
}

type Lockout = { failedLoginCount: number; lockedUntil: Date | null }

/** Liest die Sperr-Spalten der Kontozeile (design.md D1). Der Prisma-Client kennt sie erst
 * nach der Migration — bis dahin ist der Zugriff lose typisiert und liefert `undefined`, was
 * die erwartenden Assertions rot werden laesst. */
async function lockoutOf(email: string): Promise<Lockout> {
  const account = must(
    await prisma.account.findFirst({ where: { user: { email } } }),
    `eine Kontozeile zu ${email}`,
  )
  const loose = account as unknown as Lockout
  return { failedLoginCount: loose.failedLoginCount, lockedUntil: loose.lockedUntil }
}

/** Setzt die Sperr-Spalten direkt (GIVEN "gesperrtes Konto"). Vor der Migration wirft dieser
 * Update zur Laufzeit an der fehlenden Spalte — der erwartete Rot-Grund fuer diese Szenarien.
 * Die Feldnamen stammen aus design.md D1, damit der Test nach der Migration unveraendert
 * laeuft. */
async function setLockout(email: string, fields: Partial<Lockout>): Promise<void> {
  const account = must(
    await prisma.account.findFirst({ where: { user: { email } } }),
    `eine Kontozeile zu ${email}`,
  )
  await prisma.account.update({
    where: { id: account.id },
    data: fields as unknown as Prisma.AccountUpdateInput,
  })
}

function passwordHashOf(email: string) {
  return prisma.account
    .findFirst({ where: { user: { email } } })
    .then((account) => must(account, `eine Kontozeile zu ${email}`).passwordHash)
}

function sessionCountOf(userId: string) {
  return prisma.session.count({ where: { userId } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  // Suite-eigene Wegwerf-DB (prisma/account-security.test.db): DATABASE_URL steht danach, bevor
  // der Prisma-Client und src/server/... geladen werden (die lesen sie beim Modulstart).
  ;({ removeDbFiles } = setupEphemeralDb('account-security'))

  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
})

afterAll(async () => {
  if (prisma) await prisma.$disconnect()
  removeDbFiles()
})

// --- Sperre nach Fehlversuchen --------------------------------------------------------------

test('Fünfter Fehlversuch sperrt das Konto', async () => {
  const now = new Date('2026-03-01T12:00:00.000Z')
  const app = await makeApp(() => now)
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
    expect((await failedLogin(app, EMAIL)).statusCode).toBe(401)
  }

  const fuenfter = await failedLogin(app, EMAIL)

  expect(fuenfter.statusCode).toBe(401)
  const lockout = await lockoutOf(EMAIL)
  // Sperrzeitpunkt 15 Minuten nach der fuenften Anmeldung, Zaehler auf 0 zurueckgesetzt.
  expect(lockout.lockedUntil).not.toBeNull()
  expect(must(lockout.lockedUntil, 'ein Sperrzeitpunkt').getTime()).toBe(now.getTime() + LOCKOUT_DURATION_MS)
  expect(lockout.failedLoginCount).toBe(0)
})

test('Gesperrtes Konto ist von falschem Passwort nicht zu unterscheiden', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  expect(registered.statusCode).toBe(201)
  const userId = userOf(registered).id
  // Sperrzeitpunkt in der Zukunft (GIVEN gesperrtes Konto).
  await setLockout(EMAIL, { lockedUntil: new Date(Date.now() + HOUR), failedLoginCount: 0 })
  await prisma.session.deleteMany({ where: { userId } }) // die Registrierungs-Sitzung zaehlt nicht mit

  const richtig = await login(app, EMAIL, PASSWORD)
  const falsch = await login(app, EMAIL, FALSCHES_PASSWORT)

  expect(richtig.statusCode).toBe(401)
  expect(falsch.statusCode).toBe(richtig.statusCode)
  expect(richtig.body).toBe(falsch.body)
  expect(sessionCookieHeader(richtig)).toBeUndefined()
  expect(sessionCookieHeader(falsch)).toBeUndefined()
  expect(await sessionCountOf(userId)).toBe(0)
})

test('Fehlversuch während der Sperre verlängert sie nicht', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const T = new Date(Date.now() + HOUR)
  await setLockout(EMAIL, { lockedUntil: T, failedLoginCount: 0 })

  expect((await failedLogin(app, EMAIL)).statusCode).toBe(401)

  const lockout = await lockoutOf(EMAIL)
  expect(must(lockout.lockedUntil, 'der unveraenderte Sperrzeitpunkt').getTime()).toBe(T.getTime())
  expect(lockout.failedLoginCount).toBe(0)
})

test('Sperre läuft automatisch ab', async () => {
  const now = new Date('2026-03-01T12:00:00.000Z')
  const app = await makeApp(() => now)
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  // Sperrzeitpunkt in der Vergangenheit (GIVEN abgelaufene Sperre).
  await setLockout(EMAIL, { lockedUntil: new Date(now.getTime() - MINUTE), failedLoginCount: 0 })

  const res = await login(app, EMAIL, PASSWORD)

  expect(res.statusCode).toBe(200)
  expect(sidOf(res).length).toBeGreaterThan(0)
  const lockout = await lockoutOf(EMAIL)
  expect(lockout.lockedUntil).toBeNull()
  expect(lockout.failedLoginCount).toBe(0)
})

test('Erfolgreiche Anmeldung unterhalb der Schwelle setzt den Zähler zurück', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
    expect((await failedLogin(app, EMAIL)).statusCode).toBe(401)
  }

  const res = await login(app, EMAIL, PASSWORD)

  expect(res.statusCode).toBe(200)
  const lockout = await lockoutOf(EMAIL)
  expect(lockout.failedLoginCount).toBe(0)
  expect(lockout.lockedUntil).toBeNull()
})

test('Fehlversuche zählen je Konto', async () => {
  const app = await makeApp()
  expect((await register(app, 'a@example.com', PASSWORD)).statusCode).toBe(201)
  expect((await register(app, 'b@example.com', PASSWORD)).statusCode).toBe(201)
  for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
    expect((await failedLogin(app, 'a@example.com')).statusCode).toBe(401)
  }

  const res = await login(app, 'b@example.com', PASSWORD)

  expect(res.statusCode).toBe(200)
  const lockout = await lockoutOf('b@example.com')
  expect(lockout.failedLoginCount).toBe(0)
  expect(lockout.lockedUntil).toBeNull()
})

test('Unbekannte E-Mail hinterlässt keinen Zähler', async () => {
  const app = await makeApp()
  // Ein bekanntes Konto zum Vergleich: die Antwort auf die unbekannte E-Mail muss mit der auf
  // ein falsches Passwort gegen dieses Konto uebereinstimmen.
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const falschesPasswort = await login(app, EMAIL, FALSCHES_PASSWORT)

  for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
    const res = await login(app, 'fremd@example.com', FALSCHES_PASSWORT)
    expect(res.statusCode).toBe(401)
    expect(res.body).toBe(falschesPasswort.body)
  }

  expect(await prisma.user.count({ where: { email: 'fremd@example.com' } })).toBe(0)
  expect(await prisma.account.count({ where: { user: { email: 'fremd@example.com' } } })).toBe(0)
})

// --- Passwortänderung -----------------------------------------------------------------------

test('Passwortänderung mit richtigem bisherigen Passwort', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  expect(registered.statusCode).toBe(201)
  const sid = sidOf(registered)
  // Zaehler 3 (GIVEN): drei Fehlversuche nach der Registrierung — die erfolgreiche Aenderung
  // soll ihn auf 0 zuruecksetzen.
  for (let i = 0; i < 3; i++) {
    expect((await failedLogin(app, EMAIL)).statusCode).toBe(401)
  }
  const hashVorher = await passwordHashOf(EMAIL)

  const res = await changePassword(app, { currentPassword: PASSWORD, newPassword: NEUES_PASSWORT }, sid)

  expect(res.statusCode).toBe(200)
  expect(await passwordHashOf(EMAIL)).not.toBe(hashVorher)
  const lockout = await lockoutOf(EMAIL)
  expect(lockout.failedLoginCount).toBe(0)
  expect(lockout.lockedUntil).toBeNull()
  expect((await login(app, EMAIL, NEUES_PASSWORT)).statusCode).toBe(200)
  expect((await login(app, EMAIL, PASSWORD)).statusCode).toBe(401)
})

test('Passwortänderung mit falschem bisherigen Passwort', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  expect(registered.statusCode).toBe(201)
  const sid = sidOf(registered)
  const hashVorher = await passwordHashOf(EMAIL)

  const res = await changePassword(app, { currentPassword: FALSCHES_PASSWORT, newPassword: NEUES_PASSWORT }, sid)

  expect(res.statusCode).toBe(403)
  expect(fieldOf(res)).toBe('currentPassword')
  expect(await passwordHashOf(EMAIL)).toBe(hashVorher)
  expect((await lockoutOf(EMAIL)).failedLoginCount).toBe(1) // zaehlt als Fehlversuch (D3)
  expect((await me(app, sid)).statusCode).toBe(200) // die Sitzung besteht weiter
})

test('Passwortänderung ohne Anmeldung', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const hashVorher = await passwordHashOf(EMAIL)

  const res = await changePassword(app, { currentPassword: PASSWORD, newPassword: NEUES_PASSWORT })

  expect(res.statusCode).toBe(401)
  expect(await passwordHashOf(EMAIL)).toBe(hashVorher)
})

test('Neues Passwort verletzt die Passwortregel', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  expect(registered.statusCode).toBe(201)
  const sid = sidOf(registered)
  const hashVorher = await passwordHashOf(EMAIL)

  const res = await changePassword(app, { currentPassword: PASSWORD, newPassword: KURZES_PASSWORT }, sid)

  expect(res.statusCode).toBe(400)
  expect(fieldOf(res)).toBe('newPassword')
  expect(await passwordHashOf(EMAIL)).toBe(hashVorher)
  expect((await lockoutOf(EMAIL)).failedLoginCount).toBe(0) // eine Formverletzung zaehlt nicht
})

test('Passwortänderung beendet die anderen Sitzungen', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  expect(registered.statusCode).toBe(201)
  const userId = userOf(registered).id
  // Zwei Sitzungen A und B aus zwei Anmeldungen.
  const sidA = sidOf(await login(app, EMAIL, PASSWORD))
  const sidB = sidOf(await login(app, EMAIL, PASSWORD))

  const res = await changePassword(app, { currentPassword: PASSWORD, newPassword: NEUES_PASSWORT }, sidA)

  expect(res.statusCode).toBe(200)
  const verbleibend = await prisma.session.findMany({ where: { userId } })
  expect(verbleibend).toHaveLength(1)
  expect(verbleibend[0].id).toBe(sidA)
  expect((await me(app, sidA)).statusCode).toBe(200)
  expect((await me(app, sidB)).statusCode).toBe(401)
})

test('Gesperrtes Konto kann das Passwort nicht ändern', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  expect(registered.statusCode).toBe(201)
  const sid = sidOf(registered)
  const T = new Date(Date.now() + HOUR)
  await setLockout(EMAIL, { lockedUntil: T, failedLoginCount: 0 })
  const hashVorher = await passwordHashOf(EMAIL)

  const res = await changePassword(app, { currentPassword: PASSWORD, newPassword: NEUES_PASSWORT }, sid)

  expect(res.statusCode).toBe(403)
  expect(fieldOf(res)).toBe('currentPassword')
  expect(await passwordHashOf(EMAIL)).toBe(hashVorher)
  expect(must((await lockoutOf(EMAIL)).lockedUntil, 'der unveraenderte Sperrzeitpunkt').getTime()).toBe(T.getTime())
})
