// Integrationstests zu openspec/changes/add-game-session/specs/game-session/spec.md.
// Die acht REST-Szenarien der Requirements "Spielsitzung erstellen", "Beitritt per
// Sitzungscode", "Meine Spielsitzungen" und "Sitzungsrouten verlangen eine Anmeldung"
// (tasks.md 1.1). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1),
// Testname = Szenarioname.
//
// Angesprochen wird der Server ueber `app.inject()` gegen die Suite-eigene Wegwerf-DB
// (`game-session.test.db` via setupEphemeralDb, design.md D11, constitution.md §4.3). Der
// GIVEN-Zustand einer Spielsitzung wird direkt in die Tabellen `GameSession`/`Membership`
// geschrieben, DB-Aussagen ebenso direkt daraus gelesen (Prisma, design.md D2).

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'

jest.setTimeout(120_000)

// Alphabet des Sitzungscodes: ohne 0/O und 1/I (spec.md "Spielsitzung erstellen", design.md D4).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const PASSWORD = 'ein-sicheres-passwort'

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
async function registerUser(app: App, email: string): Promise<{ sid: string; userId: string; email: string }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: PASSWORD },
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

  expect(geschlossen.statusCode).toBe(404)
  expect(unbekannt.statusCode).toBe(404)
  expect(unbekannt.statusCode).toBe(geschlossen.statusCode)
  expect(bodyOf(unbekannt).message).toBe(bodyOf(geschlossen).message)
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

// --- Sitzungsrouten verlangen eine Anmeldung ------------------------------------------------

test('Sitzungsrouten ohne Cookie', async () => {
  const app = await makeApp()
  await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  const sessionsVorher = await db().gameSession.count()
  const membershipsVorher = await db().membership.count()

  const erstellen = await post(app, '/api/sessions', { name: 'Ohne Anmeldung' })
  const beitreten = await post(app, '/api/sessions/join', { code: 'ABC234' })
  const liste = await get(app, '/api/sessions')

  expect(erstellen.statusCode).toBe(401)
  expect(beitreten.statusCode).toBe(401)
  expect(liste.statusCode).toBe(401)
  expect(await db().gameSession.count()).toBe(sessionsVorher)
  expect(await db().membership.count()).toBe(membershipsVorher)
})
