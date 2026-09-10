// Integrationstests zu openspec/changes/add-user-auth/specs/user-auth/spec.md und dem Delta
// aus openspec/changes/fix-auth-followups/specs/user-auth/spec.md sowie
// openspec/changes/add-username-and-alias/specs/user-auth/spec.md (Nutzername, #45).
// Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Sie laufen gegen die ephemere Wegwerf-DB (AGENTS.md, constitution.md §4.3): prisma/test.db
// wird hier angelegt, per `prisma migrate deploy` aus prisma/migrations/ aufgebaut und am Ende
// wieder geloescht — derselbe Weg wie in der CI-Pipeline (design.md D5, constitution.md §6.1).
// Niemals gegen dev.db oder eine produktive Datenbank.
//
// Der Server wird ueber `app.inject()` angesprochen — echter Fastify-Stack samt Cookie-Plugin
// und Prisma, aber ohne Port und Netzwerk (design.md D10).
//
// Nutzername (#45): jede Registrierung traegt ein Feld `username`. Der Wert ist fuer die
// meisten Szenarien beliebig, muss aber gueltig und je Test eindeutig sein — dafuer der Helfer
// `usernameFromEmail` (tests/helpers/username.ts). Die Spalte `User.username` kennt der
// Prisma-Client erst nach der Migration (tasks.md 2.1); bis dahin fehlt sie im Ergebnis, und
// die darauf gerichteten Assertions werden aus genau diesem Grund rot (§3.1) — nicht aus einem
// Setup-Fehler. Die uebrigen (bestehenden) Tests bleiben grün, weil das heutige Schema das
// zusaetzliche Feld ignoriert (design.md Folgeregel).

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

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
let removeDbFiles: () => void = () => {}

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

/**
 * Der rohe Nutzer-Datensatz der Antwort — fuer Felder, die `userOf` nicht kennt (`username`,
 * #45). Fehlt das Feld noch (vor der Implementierung), ist es `undefined`, und die darauf
 * gerichtete Assertion wird aus dem erwarteten Grund rot.
 */
function userRecordOf(res: Res): Record<string, unknown> {
  const body = must(asRecord(JSON.parse(res.body)), 'ein JSON-Objekt als Antwortkoerper')
  return asRecord(body.user) ?? body
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

/**
 * Ein Cookie ist im Browser entwertet, wenn es einen leeren Wert traegt oder seine Laufzeit
 * abgelaufen ist (`Max-Age=0` bzw. ein Ablaufzeitpunkt in der Vergangenheit) — genau das, was
 * die Abmeldung tut.
 */
function cookieEntwertet(header: string, now: Date): boolean {
  const laufzeit = cookieLifetimeMs(header, now)
  return sessionCookieValue(header) === '' || (laufzeit !== null && laufzeit <= 0)
}

function sidOf(res: Res): string {
  return must(
    res.cookies.find((cookie) => cookie.name === 'sid'),
    'ein gesetztes Sitzungscookie "sid"',
  ).value
}

/**
 * Liest die Nutzerzeile zu einer E-Mail lose typisiert aus. Die Spalte `username` kennt der
 * Prisma-Client erst nach der Migration (tasks.md 2.1); die lose Typisierung haelt die Suite
 * kompilierbar, ohne der DB-Aussage die Spitze zu nehmen.
 */
async function userRowByEmail(email: string): Promise<Record<string, unknown> | null> {
  const loose = prisma as unknown as {
    user: { findFirst(args: { where: { email: string } }): Promise<Record<string, unknown> | null> }
  }
  return loose.user.findFirst({ where: { email } })
}

async function makeApp(clock: () => Date = () => new Date()): Promise<App> {
  // `logger: false`: jede `inject()`-Antwort schriebe sonst pino-Zeilen in genau die
  // Gate-Ausgabe, aus der das Fehler-Feedback geparst wird.
  const app = await createApp({ prisma, clock, logger: false })
  openApps.push(app)
  return app
}

/**
 * Registriert einen Nutzer. Der Nutzername ist ab #45 Pflicht; ist keiner angegeben, wird ein
 * gueltiger, eindeutiger aus der E-Mail abgeleitet (der konkrete Wert ist fuer die meisten
 * Szenarien belanglos).
 */
function register(app: App, email: string, password: string, username: string = usernameFromEmail(email)) {
  return app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, username, password } })
}

/**
 * Eine Registrieranfrage mit einem roh vorgegebenen Koerper — fuer die Faelle, in denen das
 * Feld `username` fehlen soll oder einen bestimmten (auch ungueltigen) Wert traegt, ohne dass
 * der Helfer ihn vorher ableitet.
 */
function registerRaw(app: App, body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/auth/register', payload: body })
}

function login(app: App, email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
}

/**
 * Eine Anmeldeanfrage mit einem roh vorgegebenen JSON-Koerper — fuer die Faelle, in denen der
 * Koerper strukturell nicht dem Vertrag entspricht (kein Objekt) und deshalb kein `{ email,
 * password }`-Objekt konstruiert werden kann.
 */
function loginRaw(app: App, rawJsonBody: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: rawJsonBody,
  })
}

function me(app: App, sid?: string) {
  return sid === undefined
    ? app.inject({ method: 'GET', url: '/api/auth/me' })
    : app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  // Suite-eigene Wegwerf-DB (prisma/user-auth.test.db): DATABASE_URL steht danach, bevor der
  // Prisma-Client und src/server/... geladen werden (die lesen sie beim Modulstart).
  ;({ removeDbFiles } = setupEphemeralDb('user-auth'))

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

  const res = await register(app, EMAIL, PASSWORD, 'Gandalf')

  expect(res.statusCode).toBe(201)
  const user = userOf(res)
  expect(user.email).toBe(EMAIL)
  expect(user.id.length).toBeGreaterThan(0)
  // Die Antwort nennt den angelegten Nutzernamen (Requirement "Kontoregistrierung", #45).
  expect(userRecordOf(res).username).toBe('Gandalf')
  expect(sidOf(res).length).toBeGreaterThan(0)
  expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1)
  expect(await prisma.account.count({ where: { user: { email: EMAIL } } })).toBe(1)
  // Genau eine Nutzerzeile zu dieser E-Mail, und ihre Zeile traegt den Nutzernamen "Gandalf".
  expect(must(await userRowByEmail(EMAIL), 'die Nutzerzeile zur E-Mail').username).toBe('Gandalf')
})

test('Registrierung mit bereits vergebener E-Mail', async () => {
  const app = await makeApp()
  // Erste Registrierung mit einem Nutzernamen …
  expect((await register(app, EMAIL, PASSWORD, 'Gandalf')).statusCode).toBe(201)

  // … die zweite mit derselben E-Mail, aber einem noch unbenutzten Nutzernamen: der Konflikt
  // muss die E-Mail sein, nicht der Nutzername.
  const res = await register(app, EMAIL, 'ein-ganz-anderes-passwort', 'Radagast')

  expect(res.statusCode).toBe(409)
  expect(setCookieHeaders(res)).toHaveLength(0)
  expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1)
})

test('Registrierung mit ungültigen Eingaben', async () => {
  const app = await makeApp()

  // Gueltiger Nutzername (aus der E-Mail abgeleitet), aber ungueltige E-Mail bzw. zu kurzes
  // Passwort — das verletzte Feld ist `email` bzw. `password`, nicht `username`.
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

// --- Nutzername bei der Registrierung (#45) ------------------------------------------------

test('Registrierung ohne Nutzernamen', async () => {
  const app = await makeApp()

  const res = await registerRaw(app, { email: EMAIL, password: PASSWORD })

  expect(res.statusCode).toBe(400)
  expect(fieldOf(res)).toBe('username')
  expect(setCookieHeaders(res)).toHaveLength(0)
  expect(await prisma.user.count()).toBe(0)
})

test('Registrierung mit formal ungültigem Nutzernamen', async () => {
  const app = await makeApp()

  // Je ein Fall: zu kurz (2), Leerzeichen im Inneren, zu lang (25 Buchstaben).
  const faelle = ['Ga', 'Gandalf der Graue', 'a'.repeat(25)]
  for (const [i, username] of faelle.entries()) {
    const res = await registerRaw(app, { email: `spieler${i}@example.com`, username, password: PASSWORD })

    expect(res.statusCode).toBe(400)
    expect(fieldOf(res)).toBe('username')
    expect(setCookieHeaders(res)).toHaveLength(0)
  }
  expect(await prisma.user.count()).toBe(0)
})

test('Nutzername wird getrimmt und in seiner Schreibweise bewahrt', async () => {
  const app = await makeApp()

  const res = await register(app, EMAIL, PASSWORD, '  Jörg_42  ')

  expect(res.statusCode).toBe(201)
  expect(userRecordOf(res).username).toBe('Jörg_42')
  expect(must(await userRowByEmail(EMAIL), 'die Nutzerzeile zur E-Mail').username).toBe('Jörg_42')
})

test('Nutzername ist unabhängig von der Schreibweise einmalig', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD, 'Gandalf')).statusCode).toBe(201)

  // Andere, unbenutzte E-Mail, aber derselbe Nutzername in anderer Schreibweise.
  const res = await register(app, 'zweiter@example.com', PASSWORD, 'gandalf')

  expect(res.statusCode).toBe(409)
  expect(fieldOf(res)).toBe('username')
  expect(setCookieHeaders(res)).toHaveLength(0)
  expect(await prisma.user.count()).toBe(1)
})

test('Anmeldung und Nutzerabfrage nennen den Nutzernamen', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD, 'Gandalf')).statusCode).toBe(201)

  const angemeldet = await login(app, EMAIL, PASSWORD)
  const abgefragt = await me(app, sidOf(angemeldet))

  expect(angemeldet.statusCode).toBe(200)
  expect(abgefragt.statusCode).toBe(200)
  for (const res of [angemeldet, abgefragt]) {
    const user = userRecordOf(res)
    expect(user.username).toBe('Gandalf')
    expect(user.id).toBeDefined()
    expect(user.email).toBe(EMAIL)
  }
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

test('Anmeldung mit strukturell ungültigem Anfragekörper', async () => {
  const app = await makeApp()
  expect((await register(app, EMAIL, PASSWORD)).statusCode).toBe(201)
  // Die Registrierung hat bereits eine Sitzung eroeffnet; die ungueltigen Anfragen duerfen
  // keine weitere anlegen.
  const sessionsBefore = await prisma.session.count()

  // Kein Objekt: JSON `null`, ein JSON-String, ein JSON-Array. Keine dieser Formen ist eine
  // Anmeldung, sondern eine ungueltige Anfrage — `400`, nicht `401`.
  for (const rawBody of ['null', '"spieler@example.com"', '[]']) {
    const res = await loginRaw(app, rawBody)

    expect(res.statusCode).toBe(400)
    expect(setCookieHeaders(res)).toHaveLength(0)
  }
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
  // Die Antwort, die die abgelaufene Sitzung zurueckweist, entwertet auch das Cookie im
  // Browser — so wie es die Abmeldung tut (`Max-Age=0` bzw. leerer Wert).
  const cookie = must(sessionCookieHeader(res), 'ein Set-Cookie-Header, der das Cookie entwertet')
  expect(cookieEntwertet(cookie, new Date())).toBe(true)
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
  // "Aendert nichts" bezieht sich auf die Sitzung: ihr Ablaufzeitpunkt bleibt stehen.
  expect(session.expiresAt.getTime()).toBe(vorher.getTime())
  // Die Laufzeit im Browser folgt trotzdem der DB: die Antwort traegt das Sitzungscookie mit
  // der verbleibenden Restlaufzeit — kuerzer als 30 Tage und nicht laenger als der Abstand
  // zwischen jetzt und dem unveraenderten Ablaufzeitpunkt (Toleranz im Sekundenbereich,
  // design.md Risks). So holt ein Browser, dem eine verlaengernde Antwort verloren ging, die
  // Verlaengerung mit der naechsten Antwort nach, statt trotz gueltiger Sitzung abgemeldet zu
  // werden.
  const cookie = must(sessionCookieHeader(res), 'ein Sitzungscookie mit der Restlaufzeit')
  expect(sessionCookieValue(cookie)).toBe(sid)
  const laufzeit = must(cookieLifetimeMs(cookie, now), 'eine ablesbare Cookie-Laufzeit')
  const rest = vorher.getTime() - now.getTime()
  expect(laufzeit).toBeGreaterThan(0)
  expect(laufzeit).toBeLessThan(SESSION_TTL)
  expect(laufzeit).toBeLessThanOrEqual(rest + 1_000)
  expect(laufzeit).toBeGreaterThanOrEqual(rest - 2_000)
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
  expect(cookieEntwertet(cookie, new Date())).toBe(true)
  expect(danach.statusCode).toBe(401)
})
