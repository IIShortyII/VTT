// Integrationstests zu openspec/changes/add-session-leave/specs/session-annotation/spec.md
// (#70): die Requirement "Bereinigung der Anmerkungen beim Verlassen" (zwei Szenarien). Ein
// Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Das Verlassen wird ueber die REST-Route `DELETE /api/sessions/:id/members/:userId` per
// `app.inject()` ausgeloest; die Bereinigung geschieht serverseitig in derselben Transaktion
// (design.md D2): eine geteilte Anmerkung des Betroffenen bleibt mit `authorId: null` erhalten,
// eine private wird geloescht; fremde Anmerkungen bleiben unberuehrt. GIVEN-Zustaende (Sitzung,
// Mitgliedschaft, Karte, Instanz, Anmerkungen) werden direkt in der DB geschrieben, DB-Aussagen
// ebenso direkt daraus gelesen. Gegen die Suite-eigene Wegwerf-DB
// (`session-annotation-leave-cleanup.test.db`, constitution.md §4.3).
//
// Rote Phase (constitution.md §3.1): die Route ist noch nicht registriert; `app.inject` liefert
// einen Standard-404, die Bereinigung laeuft nicht, Urheber und Bestand bleiben unveraendert.
// Die `expect(res.statusCode).toBe(200)`- und Bereinigungs-Assertions scheitern daran — der
// erwartete rote Grund, kein Setup-/Tippfehler.

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'

type Pt = { x: number; y: number }

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die Tabellen (siehe session-annotation-socket.integration.test.ts) ---------
interface GameSessionRow {
  id: string
  name: string
  code: string
  status: string
  activeInstanceId?: string | null
}
interface GameMapRow {
  id: string
  ownerId: string
  name: string
  imageFile: string | null
}
interface MapInstanceRow {
  id: string
  sessionId: string
  mapId: string
  position: number
}
interface AnnotationRow {
  id: string
  instanceId: string
  authorId: string | null
  kind: string
  mode: string
  visibility: string
  color: string | null
  points: string
}
interface GameDb {
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    update(args: { where: { id: string }; data: { activeInstanceId: string | null } }): Promise<GameSessionRow>
    deleteMany(): Promise<unknown>
  }
  membership: {
    create(args: { data: { sessionId: string; userId: string; role: string } }): Promise<unknown>
    deleteMany(): Promise<unknown>
  }
  gameMap: {
    create(args: { data: { ownerId: string; name: string; imageFile?: string | null; imageType?: string | null; gridType?: string; gridSize?: number; gridOffsetX?: number; gridOffsetY?: number } }): Promise<GameMapRow>
    deleteMany(): Promise<unknown>
  }
  mapInstance: {
    create(args: { data: { sessionId: string; mapId: string; position: number } }): Promise<MapInstanceRow>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
  annotation: {
    create(args: { data: { instanceId: string; authorId: string | null; kind: string; mode: string; visibility: string; color: string | null; points: string } }): Promise<AnnotationRow>
    findUnique(args: { where: { id: string } }): Promise<AnnotationRow | null>
    deleteMany(args?: unknown): Promise<unknown>
  }
}
const db = (): GameDb => prisma as unknown as GameDb

// --- Hilfen ---------------------------------------------------------------------------------

type InjectRes = { statusCode: number; body: string; cookies: Array<{ name: string; value: string }> }

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}

async function makeApp(): Promise<App> {
  const app = await createApp({ prisma, logger: false })
  openApps.push(app)
  return app
}

async function registerUser(app: App, email: string, username: string = usernameFromEmail(email)): Promise<{ sid: string; userId: string }> {
  const res = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, username, password: PASSWORD } })) as unknown as InjectRes
  if (res.statusCode !== 201) throw new Error(`Registrierung fehlgeschlagen (${res.statusCode}): ${res.body}`)
  const sid = must(res.cookies.find((c) => c.name === 'sid'), 'ein Sitzungscookie').value
  const userId = String((JSON.parse(res.body) as Record<string, unknown>).id)
  return { sid, userId }
}

let codeZaehler = 0
function frischerCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  codeZaehler += 1
  const zahl = codeZaehler.toString().padStart(3, '2').slice(-3)
  return `AL${alphabet[codeZaehler % alphabet.length]}${zahl}`
}

async function createGameSession(fields: { name?: string; status?: string } = {}): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: fields.name ?? 'Freitagsrunde', code: frischerCode(), status: fields.status ?? 'geoeffnet' } })
}

async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}

async function makeMap(ownerId: string, name: string): Promise<GameMapRow> {
  return db().gameMap.create({ data: { ownerId, name, imageFile: null, imageType: null, gridType: 'quadrat', gridSize: 70, gridOffsetX: 0, gridOffsetY: 0 } })
}

async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}

async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

async function createAnnotationDirect(
  instanceId: string,
  data: { authorId: string | null; visibility: string; points?: Pt[] },
): Promise<AnnotationRow> {
  return db().annotation.create({
    data: {
      instanceId,
      authorId: data.authorId,
      kind: 'strecke',
      mode: 'frei',
      visibility: data.visibility,
      color: null,
      points: JSON.stringify(data.points ?? [{ x: 1, y: 2 }, { x: 3, y: 4 }]),
    },
  })
}

function removeMember(app: App, sessionId: string, userId: string, sid: string): Promise<InjectRes> {
  return app.inject({ method: 'DELETE', url: `/api/sessions/${sessionId}/members/${userId}`, cookies: { sid } }) as unknown as Promise<InjectRes>
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-annotation-leave-cleanup'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as Partial<GameDb>
  if (c.annotation) await c.annotation.deleteMany()
  if (c.mapInstance) await c.mapInstance.deleteMany()
  if (c.gameMap) await c.gameMap.deleteMany()
  if (c.membership) await c.membership.deleteMany()
  if (c.gameSession) await c.gameSession.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
})

afterAll(async () => {
  if (prisma) await prisma.$disconnect()
  removeDbFiles()
})

// --- Szenarien ------------------------------------------------------------------------------

test('Geteilte Anmerkung bleibt mit Urheber null', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const tom = await registerUser(app, 'tom@example.com', 'tom')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  await addMembership(gs.id, tom.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const samGeteilt = await createAnnotationDirect(instanz.id, { authorId: sam.userId, visibility: 'geteilt' })
  const tomGeteilt = await createAnnotationDirect(instanz.id, { authorId: tom.userId, visibility: 'geteilt' })

  const res = await removeMember(app, gs.id, sam.userId, sam.sid)
  expect(res.statusCode).toBe(200)

  // Die Anmerkung von sam existiert weiterhin, ihr Urheber ist null; toms Anmerkung bleibt bei tom.
  const samNachher = await db().annotation.findUnique({ where: { id: samGeteilt.id } })
  expect(samNachher).not.toBeNull()
  expect(must(samNachher, 'die geteilte Anmerkung von sam').authorId).toBeNull()
  const tomNachher = await db().annotation.findUnique({ where: { id: tomGeteilt.id } })
  expect(must(tomNachher, 'die geteilte Anmerkung von tom').authorId).toBe(tom.userId)
})

test('Private Anmerkung wird gelöscht', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const samPrivat = await createAnnotationDirect(instanz.id, { authorId: sam.userId, visibility: 'privat' })

  const res = await removeMember(app, gs.id, sam.userId, sam.sid)
  expect(res.statusCode).toBe(200)

  // Die private Anmerkung existiert nicht mehr.
  expect(await db().annotation.findUnique({ where: { id: samPrivat.id } })).toBeNull()
})
