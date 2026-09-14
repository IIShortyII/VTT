// Integrationstests zu openspec/changes/add-game-session/specs/game-session/spec.md.
// Die acht REST-Szenarien der Requirements "Spielsitzung erstellen", "Beitritt per
// Sitzungscode", "Meine Spielsitzungen" und "Sitzungsrouten verlangen eine Anmeldung"
// (tasks.md 1.1). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1),
// Testname = Szenarioname.
//
// add-session-leave (#70): die neue Route `DELETE /api/sessions/:id/members/:userId`
// (Requirement "Verlassen einer Spielsitzung und Entfernen eines Spielers") mit ihren fuenf
// REST-Szenarien (Selbstaustritt 200, Entfernen durch den Spielleiter 200, fremdes Entfernen
// durch einen Spieler 403, Selbstaustritt des Spielleiters 403, unbekannte Mitgliedschaft
// 404). Das MODIFIED-Szenario "Sitzungsrouten ohne Cookie" nennt die Route zusaetzlich; sie
// MUSS ohne Cookie mit 401 antworten und nichts schreiben. Rote Phase (constitution.md §3.1):
// die Route ist noch nicht registriert, weshalb Fastify sie mit dem Standard-404 beantwortet
// (Meldung `Route DELETE:… not found`) — die erwarteten 200/403/401 scheitern daran, und der
// 404-Fall unterscheidet sich am Meldungsmuster vom Standard-404. Der erwartete rote Grund,
// kein Setup-/Tippfehler.
//
// Angesprochen wird der Server ueber `app.inject()` gegen die Suite-eigene Wegwerf-DB
// (`game-session.test.db` via setupEphemeralDb, design.md D11, constitution.md §4.3). Der
// GIVEN-Zustand einer Spielsitzung wird direkt in die Tabellen `GameSession`/`Membership`
// geschrieben, DB-Aussagen ebenso direkt daraus gelesen (Prisma, design.md D2).

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

// Alphabet des Sitzungscodes: ohne 0/O und 1/I (spec.md "Spielsitzung erstellen", design.md D4).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const PASSWORD = 'ein-sicheres-passwort'

// Die Meldung eines nicht registrierten Fastify-Routings (Standard-404). Der applikative
// 404-Fall (unbekannte Mitgliedschaft) darf diese Form NICHT tragen — daran scheitert der Test
// in der roten Phase, in der die Route fehlt (constitution.md §3.1).
const ROUTE_NOT_FOUND = /Route DELETE:.*not found/i

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die neuen Tabellen ---------------------------------------------------------
// Bis die Migration aus tasks.md 2.1 existiert, kennt der generierte Prisma-Client die Modelle
// GameSession/Membership nicht. Ein schmaler, getippter Zugriff haelt die Tests lesbar und
// unabhaengig vom generierten Typ; fehlt die Tabelle, scheitert erst der Laufzeitzugriff (der
// erwartete rote Grund in dieser Phase), nicht der Compile der Testdatei.
interface GameSessionRow {
  id: string
  name: string
  code: string
  status: string
}
interface MembershipRow {
  id: string
  sessionId: string
  userId: string
  role: string
}
interface GameDb {
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    findUnique(args: { where: { id: string } }): Promise<GameSessionRow | null>
    findMany(args?: unknown): Promise<GameSessionRow[]>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
  membership: {
    create(args: { data: { sessionId: string; userId: string; role: string } }): Promise<MembershipRow>
    findMany(args?: unknown): Promise<MembershipRow[]>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
}
const db = (): GameDb => prisma as unknown as GameDb

// --- Hilfen ---------------------------------------------------------------------------------

type Res = {
  statusCode: number
  body: string
  cookies: Array<{ name: string; value: string }>
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Erwartet: ein JSON-Objekt als Antwortkoerper')
  }
  return value as Record<string, unknown>
}

function bodyOf(res: Res): Record<string, unknown> {
  return asRecord(JSON.parse(res.body))
}

function sidOf(res: Res): string {
  return must(res.cookies.find((c) => c.name === 'sid'), 'ein gesetztes Sitzungscookie "sid"').value
}

async function makeApp(): Promise<App> {
  const app = await createApp({ prisma, logger: false })
  openApps.push(app)
  return app
}

/** Registriert einen Nutzer und liefert Cookie und Nutzer-Id. */
async function registerUser(app: App, email: string, username: string = usernameFromEmail(email)): Promise<{ sid: string; userId: string; email: string }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, username, password: PASSWORD },
  })) as unknown as Res
  if (res.statusCode !== 201) throw new Error(`Registrierung fehlgeschlagen (${res.statusCode}): ${res.body}`)
  return { sid: sidOf(res), userId: String(bodyOf(res).id), email }
}

async function createGameSession(fields: { name?: string; code: string; status: string }): Promise<GameSessionRow> {
  return db().gameSession.create({
    data: { name: fields.name ?? 'Eine Runde', code: fields.code, status: fields.status },
  })
}

async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}

function post(app: App, url: string, payload: Record<string, unknown>, sid?: string): Promise<Res> {
  return app.inject({
    method: 'POST',
    url,
    payload,
    ...(sid ? { cookies: { sid } } : {}),
  }) as unknown as Promise<Res>
}

function get(app: App, url: string, sid?: string): Promise<Res> {
  return app.inject({ method: 'GET', url, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
}

function del(app: App, url: string, sid?: string): Promise<Res> {
  return app.inject({ method: 'DELETE', url, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
}

function membershipCount(sessionId: string, userId: string): Promise<number> {
  return db().membership.count({ where: { sessionId, userId } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('game-session'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  // In der roten Phase fehlen die Tabellen GameSession/Membership noch; nur loeschen, was der
  // generierte Client kennt, damit das Aufraeumen nicht selbst wirft und den eigentlichen
  // roten Grund verdeckt.
  const client = prisma as unknown as { membership?: GameDb['membership']; gameSession?: GameDb['gameSession'] }
  if (client.membership) await client.membership.deleteMany()
  if (client.gameSession) await client.gameSession.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
})

afterAll(async () => {
  if (prisma) await prisma.$disconnect()
  removeDbFiles()
})

// --- Spielsitzung erstellen -----------------------------------------------------------------

test('Erstellen mit gültigem Namen', async () => {
  const app = await makeApp()
  const spielleiter = await registerUser(app, 'sl@example.com')

  const res = await post(app, '/api/sessions', { name: 'Freitagsrunde' }, spielleiter.sid)

  expect(res.statusCode).toBe(201)
  const body = bodyOf(res)
  expect(body.name).toBe('Freitagsrunde')
  expect(body.status).toBe('geschlossen')
  expect(body.role).toBe('spielleiter')
  const code = String(body.code)
  expect(code).toHaveLength(6)
  for (const ch of code) expect(CODE_ALPHABET).toContain(ch)
  expect(typeof body.id).toBe('string')

  const sessions = await db().gameSession.findMany({ where: { name: 'Freitagsrunde' } })
  expect(sessions).toHaveLength(1)
  expect(sessions[0].code).toBe(code)
  const memberships = await db().membership.findMany({ where: { userId: spielleiter.userId, sessionId: sessions[0].id } })
  expect(memberships).toHaveLength(1)
  expect(memberships[0].role).toBe('spielleiter')
})

test('Erstellen mit ungültigem Namen', async () => {
  const app = await makeApp()
  const spielleiter = await registerUser(app, 'sl@example.com')

  const res = await post(app, '/api/sessions', { name: '   ' }, spielleiter.sid)

  expect(res.statusCode).toBe(400)
  expect(bodyOf(res).field).toBe('name')
  expect(await db().gameSession.count()).toBe(0)
  expect(await db().membership.count()).toBe(0)
})

// --- Beitritt per Sitzungscode --------------------------------------------------------------

test('Beitritt zu geöffneter Spielsitzung', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ name: 'Offene Runde', code: 'ABC234', status: 'geoeffnet' })
  const spieler = await registerUser(app, 'spieler@example.com')

  const res = await post(app, '/api/sessions/join', { code: 'ABC234' }, spieler.sid)

  expect(res.statusCode).toBe(200)
  const body = bodyOf(res)
  expect(body.id).toBe(gs.id)
  expect(body.name).toBe('Offene Runde')
  expect(body.status).toBe('geoeffnet')
  expect(body.role).toBe('spieler')
  expect('code' in body).toBe(false)

  const memberships = await db().membership.findMany({ where: { userId: spieler.userId, sessionId: gs.id } })
  expect(memberships).toHaveLength(1)
  expect(memberships[0].role).toBe('spieler')
})

test('Code wird normalisiert', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const spieler = await registerUser(app, 'spieler@example.com')

  const res = await post(app, '/api/sessions/join', { code: ' abc 234 ' }, spieler.sid)

  expect(res.statusCode).toBe(200)
  expect(bodyOf(res).id).toBe(gs.id)
  const memberships = await db().membership.findMany({ where: { userId: spieler.userId, sessionId: gs.id } })
  expect(memberships).toHaveLength(1)
})

test('Geschlossene Spielsitzung und unbekannter Code sind nicht unterscheidbar', async () => {
  const app = await makeApp()
  await createGameSession({ code: 'ABC234', status: 'geschlossen' })
  const spieler = await registerUser(app, 'spieler@example.com')

  const geschlossen = await post(app, '/api/sessions/join', { code: 'ABC234' }, spieler.sid)
  const unbekannt = await post(app, '/api/sessions/join', { code: 'ZZZ999' }, spieler.sid)

  const MELDUNG = 'Sitzungscode prüfen und ob die Spielleitung die Sitzung geöffnet hat.'
  expect(geschlossen.statusCode).toBe(404)
  expect(unbekannt.statusCode).toBe(404)
  expect(unbekannt.statusCode).toBe(geschlossen.statusCode)
  expect(bodyOf(unbekannt).message).toBe(bodyOf(geschlossen).message)
  // add-ui-form (#90): die identische Meldung nennt die Handlung, nicht den Grund, und traegt
  // `field` gleich `code`, damit der Client sie am Feld `Sitzungscode` zeigen kann.
  expect(bodyOf(geschlossen).message).toBe(MELDUNG)
  expect(bodyOf(unbekannt).message).toBe(MELDUNG)
  expect(bodyOf(geschlossen).field).toBe('code')
  expect(bodyOf(unbekannt).field).toBe('code')
  expect(await db().membership.count({ where: { userId: spieler.userId } })).toBe(0)
})

test('Erneuter Beitritt eines Mitglieds ist idempotent', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const spielleiter = await registerUser(app, 'sl@example.com')
  await addMembership(gs.id, spielleiter.userId, 'spielleiter')

  const res = await post(app, '/api/sessions/join', { code: 'ABC234' }, spielleiter.sid)

  expect(res.statusCode).toBe(200)
  expect(bodyOf(res).role).toBe('spielleiter')
  const memberships = await db().membership.findMany({ where: { userId: spielleiter.userId, sessionId: gs.id } })
  expect(memberships).toHaveLength(1)
})

// --- Meine Spielsitzungen -------------------------------------------------------------------

test('Liste enthält nur eigene Mitgliedschaften mit Rolle', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'nutzer@example.com')
  const a = await createGameSession({ name: 'A', code: 'AAA234', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', code: 'BBB234', status: 'geschlossen' })
  const c = await createGameSession({ name: 'C', code: 'CCC234', status: 'geoeffnet' })
  await addMembership(a.id, nutzer.userId, 'spielleiter')
  await addMembership(b.id, nutzer.userId, 'spieler')
  // C bleibt ohne Mitgliedschaft dieses Nutzers.
  void c

  const res = await get(app, '/api/sessions', nutzer.sid)

  expect(res.statusCode).toBe(200)
  const eintraege = JSON.parse(res.body) as Array<Record<string, unknown>>
  expect(Array.isArray(eintraege)).toBe(true)
  expect(eintraege).toHaveLength(2)

  const eintragA = must(
    eintraege.find((e) => e.id === a.id),
    'den Eintrag A in der Liste',
  )
  expect(eintragA.role).toBe('spielleiter')
  expect(eintragA.code).toBe('AAA234')

  const eintragB = must(
    eintraege.find((e) => e.id === b.id),
    'den Eintrag B in der Liste',
  )
  expect(eintragB.role).toBe('spieler')
  expect(eintragB.status).toBe('geschlossen')
  expect('code' in eintragB).toBe(false)

  expect(eintraege.find((e) => e.id === c.id)).toBeUndefined()
})

// --- Verlassen einer Spielsitzung und Entfernen eines Spielers (#70) -------------------------

test('Spieler verlässt die Spielsitzung', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')

  const res = await del(app, `/api/sessions/${gs.id}/members/${sam.userId}`, sam.sid)

  expect(res.statusCode).toBe(200)
  expect(await membershipCount(gs.id, sam.userId)).toBe(0)
})

test('Spielleiter entfernt einen Spieler', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const tom = await registerUser(app, 'tom@example.com', 'tom')
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, tom.userId, 'spieler')

  const res = await del(app, `/api/sessions/${gs.id}/members/${tom.userId}`, sl.sid)

  expect(res.statusCode).toBe(200)
  expect(await membershipCount(gs.id, tom.userId)).toBe(0)
})

test('Spieler darf keinen anderen Spieler entfernen', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const tom = await registerUser(app, 'tom@example.com', 'tom')
  await addMembership(gs.id, sam.userId, 'spieler')
  await addMembership(gs.id, tom.userId, 'spieler')

  const res = await del(app, `/api/sessions/${gs.id}/members/${tom.userId}`, sam.sid)

  expect(res.statusCode).toBe(403)
  expect(await membershipCount(gs.id, tom.userId)).toBe(1)
})

test('Spielleiter kann über diese Route nicht selbst austreten', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const res = await del(app, `/api/sessions/${gs.id}/members/${sl.userId}`, sl.sid)

  expect(res.statusCode).toBe(403)
  expect(await membershipCount(gs.id, sl.userId)).toBe(1)
})

test('Unbekannte Mitgliedschaft', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const x = await registerUser(app, 'x@example.com', 'ecks')
  await addMembership(gs.id, sl.userId, 'spielleiter')
  // `x` ist angemeldet, aber KEIN Mitglied dieser Spielsitzung.
  const mitgliedschaftenVorher = await db().membership.count({ where: { sessionId: gs.id } })

  const res = await del(app, `/api/sessions/${gs.id}/members/${x.userId}`, sl.sid)

  expect(res.statusCode).toBe(404)
  // Der applikative 404 ist nicht der Fastify-Standard-404 einer fehlenden Route (roter Grund
  // in der Phase ohne registrierte Route).
  expect(String(bodyOf(res).message ?? '')).not.toMatch(ROUTE_NOT_FOUND)
  expect(await db().membership.count({ where: { sessionId: gs.id } })).toBe(mitgliedschaftenVorher)
})

// --- Sitzungsrouten verlangen eine Anmeldung ------------------------------------------------

test('Sitzungsrouten ohne Cookie', async () => {
  const app = await makeApp()
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  await addMembership(gs.id, sam.userId, 'spieler')
  const sessionsVorher = await db().gameSession.count()
  const membershipsVorher = await db().membership.count()

  const erstellen = await post(app, '/api/sessions', { name: 'Ohne Anmeldung' })
  const beitreten = await post(app, '/api/sessions/join', { code: 'ABC234' })
  const liste = await get(app, '/api/sessions')
  // #70: auch die Entfernen-Route verlangt eine Anmeldung und darf ohne Cookie nichts schreiben.
  const entfernen = await del(app, `/api/sessions/${gs.id}/members/${sam.userId}`)

  expect(erstellen.statusCode).toBe(401)
  expect(beitreten.statusCode).toBe(401)
  expect(liste.statusCode).toBe(401)
  expect(entfernen.statusCode).toBe(401)
  expect(await db().gameSession.count()).toBe(sessionsVorher)
  expect(await db().membership.count()).toBe(membershipsVorher)
})
