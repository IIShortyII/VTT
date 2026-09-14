// Integrationstests zu openspec/changes/add-session-leave/specs/session-token/spec.md (#70):
// die Requirement "Bereinigung der Tokens beim Verlassen" (drei Szenarien). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Das Verlassen wird ueber die REST-Route `DELETE /api/sessions/:id/members/:userId` per
// `app.inject()` ausgeloest; die Bereinigung geschieht serverseitig in derselben Transaktion
// (design.md D2). GIVEN-Zustaende (Sitzung, Mitgliedschaft, Karte, Instanz, Token samt Besitzer
// und Zielgruppen als `TokenShare`-Zeilen) werden direkt in der DB geschrieben, DB-Aussagen
// ebenso direkt daraus gelesen. Gegen die Suite-eigene Wegwerf-DB
// (`session-token-leave-cleanup.test.db`, constitution.md §4.3).
//
// Zielgruppenmodell (design.md, session-token): `keine` = keine `TokenShare`-Zeile,
// `alle` = eine Zeile mit `userId = null`, Liste = eine Zeile je `userId`.
//
// Rote Phase (constitution.md §3.1): die Route ist noch nicht registriert; `app.inject` liefert
// einen Standard-404, die Bereinigung laeuft nicht, Besitzer und Zielgruppen bleiben
// unveraendert. Die `expect(res.statusCode).toBe(200)`- und Bereinigungs-Assertions scheitern
// daran — der erwartete rote Grund, kein Setup-/Tippfehler.

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die Tabellen (siehe session-token-fog-visibility-socket.integration.test.ts) --
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
interface TokenRow {
  id: string
  instanceId: string
  name: string
  ownerId?: string | null
}
interface TokenShareRow {
  id: string
  tokenId: string
  stat: string
  userId: string | null
}
interface GameDb {
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    update(args: { where: { id: string }; data: { activeInstanceId: string | null } }): Promise<GameSessionRow>
    deleteMany(): Promise<unknown>
  }
  membership: {
    create(args: { data: { sessionId: string; userId: string; role: string } }): Promise<unknown>
    count(args?: unknown): Promise<number>
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
  token: {
    create(args: { data: { instanceId: string; name: string; color: string; icon: string | null; size: number; col: number; row: number; ownerId?: string | null } }): Promise<TokenRow>
    findUnique(args: { where: { id: string } }): Promise<TokenRow | null>
    deleteMany(): Promise<unknown>
  }
  tokenShare: {
    create(args: { data: { tokenId: string; stat: string; userId: string | null } }): Promise<TokenShareRow>
    findMany(args?: unknown): Promise<TokenShareRow[]>
    deleteMany(): Promise<unknown>
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
  return `TL${alphabet[codeZaehler % alphabet.length]}${zahl}`
}

async function createGameSession(fields: { name?: string; status?: string } = {}): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: fields.name ?? 'Freitagsrunde', code: frischerCode(), status: fields.status ?? 'geoeffnet' } })
}

async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}

async function makeMap(ownerId: string, name: string): Promise<GameMapRow> {
  return db().gameMap.create({ data: { ownerId, name, imageFile: `${name}.png`, imageType: 'image/png', gridType: 'quadrat', gridSize: 70, gridOffsetX: 0, gridOffsetY: 0 } })
}

async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}

async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

async function createTokenDirect(instanceId: string, fields: { name: string; ownerId?: string | null }): Promise<TokenRow> {
  return db().token.create({
    data: {
      instanceId,
      name: fields.name,
      color: '#3366ff',
      icon: null,
      size: 1,
      col: 0,
      row: 0,
      ...(fields.ownerId !== undefined ? { ownerId: fields.ownerId } : {}),
    },
  })
}

type ShareAudienceSetup = Partial<Record<'hp' | 'tempHp' | 'ac' | 'initiative' | 'conditions', 'alle' | string[]>>

/** Legt Zielgruppen als `TokenShare`-Zeilen an: `'alle'` → eine Zeile mit `userId` null; eine
 * Liste → eine Zeile je `userId`. */
async function setShareRows(tokenId: string, shares: ShareAudienceSetup): Promise<void> {
  for (const [stat, audience] of Object.entries(shares)) {
    if (audience === 'alle') {
      await db().tokenShare.create({ data: { tokenId, stat, userId: null } })
    } else if (Array.isArray(audience)) {
      for (const userId of audience) await db().tokenShare.create({ data: { tokenId, stat, userId } })
    }
  }
}

/** Liest die `userId`-Eintraege der Zielgruppe eines Stats (leer = `keine`). */
async function shareUserIds(tokenId: string, stat: string): Promise<Array<string | null>> {
  const rows = await db().tokenShare.findMany({ where: { tokenId, stat } })
  return rows.map((r) => r.userId)
}

function ownerOf(tokenId: string): Promise<string | null | undefined> {
  return db()
    .token.findUnique({ where: { id: tokenId } })
    .then((row) => must(row, `die Token-Zeile ${tokenId}`).ownerId)
}

function removeMember(app: App, sessionId: string, userId: string, sid: string): Promise<InjectRes> {
  return app.inject({ method: 'DELETE', url: `/api/sessions/${sessionId}/members/${userId}`, cookies: { sid } }) as unknown as Promise<InjectRes>
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-token-leave-cleanup'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as Partial<GameDb>
  if (c.tokenShare) await c.tokenShare.deleteMany()
  if (c.token) await c.token.deleteMany()
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

test('Token des Betroffenen verliert den Besitzer', async () => {
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
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', ownerId: sam.userId })
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', ownerId: tom.userId })

  const res = await removeMember(app, gs.id, sam.userId, sam.sid)
  expect(res.statusCode).toBe(200)

  // Ork gehoert danach dem Spielleiter (ownerId null); Goblin bleibt bei tom; beide existieren.
  expect(await ownerOf(ork.id)).toBeNull()
  expect(await ownerOf(goblin.id)).toBe(tom.userId)
  expect(await db().token.findUnique({ where: { id: ork.id } })).not.toBeNull()
  expect(await db().token.findUnique({ where: { id: goblin.id } })).not.toBeNull()
})

test('userId verlässt die listenwertige Zielgruppe', async () => {
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
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', ownerId: null })
  await setShareRows(ork.id, { hp: [sam.userId, tom.userId], ac: 'alle' })

  const res = await removeMember(app, gs.id, sam.userId, sam.sid)
  expect(res.statusCode).toBe(200)

  // hp-Zielgruppe nennt nur noch tom; ac-Zielgruppe bleibt `alle` (eine Zeile mit userId null).
  expect(await shareUserIds(ork.id, 'hp')).toEqual([tom.userId])
  expect(await shareUserIds(ork.id, 'ac')).toEqual([null])
})

test('Letzter Eintrag einer Zielgruppe wird zu keine', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', ownerId: null })
  await setShareRows(ork.id, { initiative: [sam.userId] })

  const res = await removeMember(app, gs.id, sam.userId, sam.sid)
  expect(res.statusCode).toBe(200)

  // Die initiative-Zielgruppe wird `keine` — keine `TokenShare`-Zeile mehr.
  expect(await shareUserIds(ork.id, 'initiative')).toEqual([])
})
