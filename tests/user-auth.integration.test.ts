// Integrationstests zu openspec/changes/add-user-auth/specs/user-auth/spec.md.
// Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Sie laufen gegen die ephemere Wegwerf-DB (AGENTS.md, constitution.md §4.3): prisma/test.db
// wird hier angelegt, per `prisma db push` migriert und am Ende wieder geloescht. Niemals
// gegen dev.db oder eine produktive Datenbank.
//
// Der Server wird ueber `app.inject()` angesprochen — echter Fastify-Stack samt Cookie-Plugin
// und Prisma, aber ohne Port und Netzwerk (design.md D10).

import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import * as path from 'node:path'
import { PrismaClient } from '@prisma/client'

jest.setTimeout(120_000)

const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'prisma', 'test.db')
const DB_URL = `file:${DB_FILE.replace(/\\/g, '/')}`
const DB_ARTEFAKTE = ['', '-journal', '-wal', '-shm']

const DAY = 24 * 60 * 60 * 1000
const SESSION_TTL = 30 * DAY // Laufzeit einer Sitzung laut Spec

const EMAIL = 'spieler@example.com'
const PASSWORD = 'ein-sicheres-passwort' // 21 Zeichen, erfuellt die 15er-Mindestlaenge (design.md D11)

// Der Fastify-Vertrag wird erst beim Laden aufgeloest: `DATABASE_URL` muss stehen, bevor
// src/server/... importiert wird (die Prisma-Instanz dort liest sie beim Modulstart).
type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []

// --- Hilfen ---------------------------------------------------------------------------------

/** Antwortform von `app.inject()`, auf das reduziert, was die Szenarien pruefen. */
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

/**
 * Die Spec legt die Felder des Nutzers fest (`id`, `email`), nicht die Huelle der Antwort.
 * Deshalb werden beide gaengigen Formen akzeptiert: `{ id, email }` und `{ user: { id, email } }`.
 */
function userOf(res: Res): { id: string; email: string } {
  const body = must(asRecord(JSON.parse(res.body)), 'ein JSON-Objekt als Antwortkoerper')
  const user = asRecord(body.user) ?? body
  return {
    id: String(must(user.id, 'ein Feld "id" am Nutzer')),
    email: String(must(user.email, 'ein Feld "email" am Nutzer')),
  }
}

/** Das von der Spec geforderte Antwortfeld `field` einer 400er-Antwort. */
function fieldOf(res: Res): unknown {
  return must(asRecord(JSON.parse(res.body)), 'ein JSON-Objekt als Antwortkoerper').field
}

function setCookieHeaders(res: Res): string[] {
  const raw = res.headers['set-cookie']
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) return raw.map(String)
  return []
}

/** Der Set-Cookie-Header, der das Sitzungscookie setzt oder entwertet — falls vorhanden. */
function sessionCookieHeader(res: Res): string | undefined {
  return setCookieHeaders(res).find((value) => value.startsWith('sid='))
}

function sessionCookieValue(header: string): string {
  return decodeURIComponent(/^sid=([^;]*)/.exec(header)?.[1] ?? '')
}

/**
 * Laufzeit, die ein Set-Cookie-Header dem Browser mitgibt — aus `Max-Age` oder ersatzweise
 * `Expires`. Die Spec fordert die volle Laufzeit, nicht eine bestimmte Schreibweise.
 */
function cookieLifetimeMs(header: string, now: Date): number | null {
  const maxAge = /;\s*Max-Age=(-?\d+)/i.exec(header)
  if (maxAge) return Number(maxAge[1]) * 1000
  const expires = /;\s*Expires=([^;]+)/i.exec(header)
  if (expires) return new Date(expires[1]).getTime() - now.getTime()
  return null
}

function sidOf(res: Res): string {
  return must(
    res.cookies.find((cookie) => cookie.name === 'sid'),
    'ein gesetztes Sitzungscookie "sid"',
  ).value
}

async function makeApp(clock: () => Date = () => new Date()): Promise<App> {
  // `logger: false`: jede `inject()`-Antwort schriebe sonst pino-Zeilen in genau die
  // Gate-Ausgabe, aus der das Fehler-Feedback geparst wird.
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

function me(app: App, sid?: string) {
  return sid === undefined
    ? app.inject({ method: 'GET', url: '/api/auth/me' })
    : app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } })
}

function removeDbFiles(): void {
  for (const suffix of DB_ARTEFAKTE) {
    if (existsSync(DB_FILE + suffix)) rmSync(DB_FILE + suffix, { force: true })
  }
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL
  // Lokaler HTTP-Testlauf: das `secure`-Attribut des Cookies bleibt aus (design.md D4).
  process.env.COOKIE_SECURE = 'false'

  // Wegwerf-DB pro Lauf: erst die Datei aus einem eventuell abgebrochenen Vorlauf entfernen,
  // dann frisch anlegen. Bewusst ohne `--force-reset` — der leere Startzustand kommt aus dem
  // geloeschten File, nicht aus einem destruktiven Migrate-Kommando.
  removeDbFiles()
  try {
    execSync('pnpm exec prisma db push --skip-generate', {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: 'pipe',
    })
  } catch (error) {
    const details = error as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `prisma db push gegen die Wegwerf-DB fehlgeschlagen:\n${details.stdout ?? ''}\n${details.stderr ?? ''}`,
    )
  }

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

// --- Kontoregistrierung ---------------------------------------------------------------------

test('Registrierung mit unbenutzter E-Mail', async () => {
  const app = await makeApp()

  const res = await register(app, EMAIL, PASSWORD)

  expect(res.statusCode).toBe(201)
  const user = userOf(res)
  expect(user.email).toBe(EMAIL)
  expect(user.id.length).toBeGreaterThan(0)
  expect(sidOf(res).length).toBeGreaterThan(0)
  expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1)
  expect(await prisma.account.count({ where: { user: { email: EMAIL } } })).toBe(1)
})

test('Registrierung mit bereits vergebener E-Mail', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)

  const res = await register(app, EMAIL, 'ein-ganz-anderes-passwort')

  expect(res.statusCode).toBe(409)
  expect(setCookieHeaders(res)).toHaveLength(0)
  expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1)
})

test('Registrierung mit ungültigen Eingaben', async () => {
  const app = await makeApp()

  const badEmail = await register(app, 'keine-gueltige-adresse', PASSWORD)
  const shortPassword = await register(app, EMAIL, 'a'.repeat(14))

  // Das verletzte Feld muss maschinenlesbar in einem eigenen Antwortfeld `field` stehen —
  // eine Fehlermeldung, die das Wort zufaellig enthaelt, genuegt der Spec nicht.
  expect(badEmail.statusCode).toBe(400)
  expect(fieldOf(badEmail)).toBe('email')
  expect(shortPassword.statusCode).toBe(400)
  expect(fieldOf(shortPassword)).toBe('password')
  expect(await prisma.user.count()).toBe(0)
})

test('E-Mail wird unabhängig von der Schreibweise erkannt', async () => {
  const app = await makeApp()
  const registered = await register(app, 'Spieler@Example.COM', PASSWORD)
  expect(registered.statusCode).toBe(201)

  const res = await login(app, 'spieler@example.com', PASSWORD)

  expect(res.statusCode).toBe(200)
  expect(userOf(res).id).toBe(userOf(registered).id)
})

// --- Passwortablage -------------------------------------------------------------------------

test('Passwort wird nicht im Klartext abgelegt', async () => {
  const app = await makeApp()
  const plaintext = 'korrekt-pferd-batterie'
  expect((await register(app, EMAIL, plaintext)).statusCode).toBe(201)

  const account = must(
    await prisma.account.findFirst({ where: { user: { email: EMAIL } } }),
    'eine Kontozeile zur registrierten E-Mail',
  )

  expect(JSON.stringify(account)).not.toContain(plaintext)
  // Die hinterlegten Werte verifizieren das Passwort trotzdem erfolgreich:
  expect((await login(app, EMAIL, plaintext)).statusCode).toBe(200)
})

test('Gleiches Passwort ergibt unterschiedliche Hashwerte', async () => {
  const app = await makeApp()
  expect((await register(app, 'eins@example.com', PASSWORD)).statusCode).toBe(201)
  expect((await register(app, 'zwei@example.com', PASSWORD)).statusCode).toBe(201)

  const accounts = await prisma.account.findMany({ orderBy: { id: 'asc' } })

  expect(accounts).toHaveLength(2)
  expect(accounts[0].passwordHash).not.toBe(accounts[1].passwordHash)
})

// --- Anmeldung ------------------------------------------------------------------------------

test('Anmeldung mit korrekten Zugangsdaten', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)

  const res = await login(app, EMAIL, PASSWORD)

  expect(res.statusCode).toBe(200)
  const user = userOf(res)
  expect(user.email).toBe(EMAIL)
  const session = await prisma.session.findUnique({ where: { id: sidOf(res) } })
  expect(must(session, 'die Sitzungszeile zum gesetzten Cookie').userId).toBe(user.id)
})

test('Anmeldung mit falschem Passwort', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const sessionsBefore = await prisma.session.count()

  const res = await login(app, EMAIL, 'das-ist-das-falsche-passwort')

  expect(res.statusCode).toBe(401)
  expect(setCookieHeaders(res)).toHaveLength(0)
  expect(await prisma.session.count()).toBe(sessionsBefore)
})

// --- Zurückhaltung des Servers --------------------------------------------------------------

test('Unbekannte E-Mail ist von falschem Passwort nicht zu unterscheiden', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)

  const falschesPasswort = await login(app, EMAIL, 'falsches-passwort-aber-lang')
  const unbekannteEmail = await login(app, 'fremd@example.com', 'falsches-passwort-aber-lang')

  expect(falschesPasswort.statusCode).toBe(401)
  expect(unbekannteEmail.statusCode).toBe(falschesPasswort.statusCode)
  expect(unbekannteEmail.body).toBe(falschesPasswort.body)
})

test('Antworten enthalten keine Passwortgeheimnisse', async () => {
  const app = await makeApp()
  const registered = await register(app, EMAIL, PASSWORD)
  const loggedIn = await login(app, EMAIL, PASSWORD)
  const current = await me(app, sidOf(loggedIn))

  const stored = must(
    await prisma.account.findFirst({ where: { user: { email: EMAIL } } }),
    'eine Kontozeile zur registrierten E-Mail',
  ).passwordHash
  // Salt, Hash und Parameter stehen laut design.md D3 als Abschnitte in einem Feld —
  // keiner davon darf den Server verlassen (constitution.md §9.2).
  const secrets = String(stored)
    .split('$')
    .filter((part: string) => part.length > 8)
  expect(secrets.length).toBeGreaterThan(0)

  for (const res of [registered, loggedIn, current]) {
    expect(res.body).not.toMatch(/hash|salt|scrypt/i)
    for (const secret of secrets) expect(res.body).not.toContain(secret)
  }
})

// --- Fortbestand der Anmeldung --------------------------------------------------------------

test('Sitzungscookie ist für Skripte unerreichbar', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)

  const res = await login(app, EMAIL, PASSWORD)

  const header = must(sessionCookieHeader(res), 'ein Set-Cookie-Header für "sid"')
  expect(header).toMatch(/;\s*HttpOnly/i)
  expect(header).toMatch(/;\s*SameSite=Lax/i)
  expect(header).toMatch(/;\s*Path=\/(;|$)/i)
})

test('Anfrage mit gültigem Cookie nennt den angemeldeten Nutzer', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const loggedIn = await login(app, EMAIL, PASSWORD)

  const res = await me(app, sidOf(loggedIn))

  expect(res.statusCode).toBe(200)
  expect(userOf(res)).toEqual(userOf(loggedIn))
})

test('Anfrage ohne Cookie gilt als nicht angemeldet', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)

  const res = await me(app)

  expect(res.statusCode).toBe(401)
  expect(res.body).not.toContain(EMAIL)
})

test('Anmeldung überdauert den Serverneustart', async () => {
  const erste = await makeApp()
  expect((await register(erste, EMAIL, PASSWORD)).statusCode).toBe(201)
  const loggedIn = await login(erste, EMAIL, PASSWORD)
  const sid = sidOf(loggedIn)
  await erste.close()

  const zweite = await makeApp() // frische Instanz auf derselben Datenbankdatei
  const res = await me(zweite, sid)

  expect(res.statusCode).toBe(200)
  expect(userOf(res)).toEqual(userOf(loggedIn))
})

// --- Ablauf und gleitende Verlängerung ------------------------------------------------------

test('Abgelaufene Sitzung gilt nicht mehr', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const sid = sidOf(await login(app, EMAIL, PASSWORD))
  await prisma.session.update({ where: { id: sid }, data: { expiresAt: new Date(Date.now() - DAY) } })

  const res = await me(app, sid)

  expect(res.statusCode).toBe(401)
  expect(await prisma.session.findUnique({ where: { id: sid } })).toBeNull()
})

test('Aktivität in der zweiten Hälfte der Laufzeit verlängert die Sitzung', async () => {
  let now = new Date('2026-03-01T12:00:00.000Z')
  const app = await makeApp(() => now)
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const sid = sidOf(await login(app, EMAIL, PASSWORD))

  now = new Date(now.getTime() + 20 * DAY) // Restlaufzeit 10 Tage < 15 Tage
  const res = await me(app, sid)

  expect(res.statusCode).toBe(200)
  const session = must(await prisma.session.findUnique({ where: { id: sid } }), 'die Sitzungszeile')
  expect(session.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL)
  // Die Verlaengerung muss den Browser erreichen: sonst laeuft das Cookie ab, waehrend die
  // Sitzung noch gilt, und der Nutzer wird trotz durchgehender Aktivitaet abgemeldet.
  const cookie = must(sessionCookieHeader(res), 'ein erneuertes Sitzungscookie in der Antwort')
  expect(sessionCookieValue(cookie)).toBe(sid)
  expect(cookieLifetimeMs(cookie, now)).toBe(SESSION_TTL)
})

test('Aktivität in der ersten Hälfte der Laufzeit ändert nichts', async () => {
  let now = new Date('2026-03-01T12:00:00.000Z')
  const app = await makeApp(() => now)
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const sid = sidOf(await login(app, EMAIL, PASSWORD))
  const vorher = must(await prisma.session.findUnique({ where: { id: sid } }), 'die Sitzungszeile').expiresAt

  now = new Date(now.getTime() + 5 * DAY) // Restlaufzeit 25 Tage > 15 Tage
  const res = await me(app, sid)

  expect(res.statusCode).toBe(200)
  const session = must(await prisma.session.findUnique({ where: { id: sid } }), 'die Sitzungszeile')
  expect(session.expiresAt.getTime()).toBe(vorher.getTime())
  // Unveraendert heisst auch: kein neues Sitzungscookie, also kein Schreibzugriff auf den
  // Browser ohne Anlass.
  expect(sessionCookieHeader(res)).toBeUndefined()
})

// --- Abmeldung ------------------------------------------------------------------------------

test('Abmeldung beendet die Sitzung', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  const sid = sidOf(await login(app, EMAIL, PASSWORD))

  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid } })
  const danach = await me(app, sid)

  expect(logout.statusCode).toBeLessThan(400)
  expect(await prisma.session.findUnique({ where: { id: sid } })).toBeNull()
  // Das folgende 401 kaeme auch von der geloeschten Zeile allein — die Spec verlangt
  // zusaetzlich, dass die Abmeldeantwort das Cookie im Browser entwertet.
  const cookie = must(sessionCookieHeader(logout), 'ein Set-Cookie-Header der Abmeldeantwort')
  const laufzeit = cookieLifetimeMs(cookie, new Date())
  const entwertet = sessionCookieValue(cookie) === '' || (laufzeit !== null && laufzeit <= 0)
  expect(entwertet ? 'entwertet' : cookie).toBe('entwertet')
  expect(danach.statusCode).toBe(401)
})
