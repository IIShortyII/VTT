// Integrationstests zu openspec/changes/add-fog-of-war/specs/session-fog/spec.md (tasks.md 1.1
// und 1.2). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Enthalten: 14 der 15 Szenarien "Aufdecken und Verdecken durch den Spielleiter" (das Szenario
// "Alles aufdecken bei einer Karte mit Bild" liegt in session-map-image.integration.test.ts,
// weil es `sharp` braucht — design.md D9), die 6 Szenarien "Bereiche verwalten" und die 4
// Szenarien "Fog beim Betreten und Kartenwechsel".
//
// Aufbau wie session-map-socket.integration.test.ts (design.md D9): die App lauscht auf Port 0,
// ein `socket.io-client` verbindet mit dem Sitzungscookie in `extraHeaders`, `reconnection:
// false`. Ereignisse werden ueber `once`-Promises mit Timeout eingesammelt; ein `onAny`-Recorder
// haelt die Reihenfolge (`session:map` -> `session:fog` -> `session:tokens`) je Client fest.
// "erhaelt kein session:fog" ist eine kurze Wartezeit ohne Ereignis. GIVEN-Zustaende werden
// direkt in GameSession/Membership/GameMap/MapInstance und (fuer den Fog) in FogCell/FogArea/
// FogAreaCell geschrieben. Gegen die Suite-eigene Wegwerf-DB (`session-fog-socket.test.db`,
// constitution.md §4.3).
//
// Rote Phase (constitution.md §3.1): die Ereignisse `session:fog-set`/`session:fog-area-create`/
// `session:fog-area-delete` sind unbekannt (kein Acknowledgement -> Timeout), `fog` fehlt im
// Enter-Acknowledgement und in keiner Broadcast-Kette, und bis zur Migration (tasks.md 2.1)
// kennt Prisma die Modelle `fogCell`/`fogArea`/`fogAreaCell` sowie die Spalte
// `MapInstance.fogVersion` nicht — ein GIVEN, das Fog-Zeilen direkt anlegt oder zaehlt,
// scheitert dann am Laufzeitzugriff. Prisma-Typ-/Laufzeitfehler an fehlenden Fog-Modellen sind
// der erwartete rote Grund, kein Setup-/Tippfehler im Test.

import { PrismaClient } from '@prisma/client'
import { io, type Socket } from 'socket.io-client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
const WAIT_MS = 5000
const ACK_MS = 3000
const QUIET_MS = 800

const MSG_UNGUELTIG = 'Ungültige Anfrage.'
const MSG_KEINE_KARTE = 'Keine Karte aktiv.'
const MSG_BEREICH_WEG = 'Bereich nicht gefunden.'
const MSG_KEINE_RECHTE = 'Dafür fehlt die Berechtigung.'

const EV_FOG_SET = 'session:fog-set'
const EV_FOG_AREA_CREATE = 'session:fog-area-create'
const EV_FOG_AREA_DELETE = 'session:fog-area-delete'
const EV_FOG = 'session:fog'
const EV_MAP = 'session:map'
const EV_TOKENS = 'session:tokens'

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
const openSockets: Socket[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die (teils neuen) Tabellen -------------------------------------------------
// `FogCell`/`FogArea`/`FogAreaCell` und `MapInstance.fogVersion` entstehen erst mit der
// Migration (2.1). Der Zugriff ist lose getippt, damit die Suite kompilierbar bleibt und erst
// zur Laufzeit am fehlenden Modell/Feld scheitert (der erwartete rote Grund).
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
interface FogAreaRow {
  id: string
  instanceId: string
  name: string
}
interface FogDb {
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    update(args: { where: { id: string }; data: { activeInstanceId: string | null } }): Promise<GameSessionRow>
    findUnique(args: { where: { id: string } }): Promise<GameSessionRow | null>
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
  fogCell: {
    create(args: { data: { instanceId: string; col: number; row: number } }): Promise<unknown>
    count(args?: unknown): Promise<number>
    findFirst(args: { where: Record<string, unknown> }): Promise<unknown | null>
    deleteMany(args?: unknown): Promise<unknown>
  }
  fogArea: {
    create(args: { data: { instanceId: string; name: string; cells: { create: Array<{ col: number; row: number }> } } }): Promise<FogAreaRow>
    findFirst(args: { where: Record<string, unknown> }): Promise<FogAreaRow | null>
    count(args?: unknown): Promise<number>
    deleteMany(args?: unknown): Promise<unknown>
  }
  fogAreaCell: {
    count(args?: unknown): Promise<number>
    deleteMany(args?: unknown): Promise<unknown>
  }
}
const db = (): FogDb => prisma as unknown as FogDb

// --- Hilfen ---------------------------------------------------------------------------------

type CellT = { col: number; row: number }
function C(col: number, row: number): CellT {
  return { col, row }
}
function keysOf(cells: CellT[]): string[] {
  return cells.map((c) => `${c.col},${c.row}`).sort()
}

type InjectRes = { statusCode: number; body: string; cookies: Array<{ name: string; value: string }> }

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}

function rec(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Erwartet ein Objekt: ${what}`)
  return value as Record<string, unknown>
}

function fogOf(container: Record<string, unknown>, what: string): Record<string, unknown> {
  return rec(container.fog, what)
}

function revealedOf(fog: Record<string, unknown>): CellT[] {
  if (!Array.isArray(fog.revealed)) throw new Error('fog.revealed ist keine Liste')
  return fog.revealed as CellT[]
}

function areasOf(fog: Record<string, unknown>): Array<Record<string, unknown>> | null {
  if (fog.areas === null) return null
  if (!Array.isArray(fog.areas)) throw new Error('fog.areas ist weder Liste noch null')
  return fog.areas as Array<Record<string, unknown>>
}

let baseUrl = ''

async function startApp(): Promise<App> {
  const app = await createApp({ prisma, logger: false })
  openApps.push(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  return app
}

function client(sid?: string): Socket {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    forceNew: true,
    ...(sid ? { extraHeaders: { cookie: `sid=${sid}` } } : {}),
  })
  openSockets.push(socket)
  return socket
}

function connect(socket: Socket, ms = WAIT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Verbindungsaufbau kam nicht innerhalb ${ms}ms zustande`)), ms)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    })
    socket.connect()
  })
}

function once<T = unknown>(socket: Socket, event: string, ms = WAIT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ereignis "${event}" kam nicht innerhalb ${ms}ms`)), ms)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

function emitAck(socket: Socket, event: string, payload: unknown, ms = ACK_MS): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Kein Acknowledgement fuer "${event}" innerhalb ${ms}ms`)), ms)
    socket.emit(event, payload, (ack: unknown) => {
      clearTimeout(timer)
      resolve(rec(ack, `Acknowledgement fuer ${event}`))
    })
  })
}

function enter(socket: Socket, sessionId: string): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:enter', { sessionId }, WAIT_MS)
}
function activateMap(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:activate-map', payload, WAIT_MS)
}
function fogSet(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, EV_FOG_SET, payload)
}
function fogAreaCreate(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, EV_FOG_AREA_CREATE, payload)
}
function fogAreaDelete(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, EV_FOG_AREA_DELETE, payload)
}

/** Zeichnet die Reihenfolge relevanter Server-Ereignisse einer Verbindung auf (design.md D9). */
function recordEvents(socket: Socket): Array<{ name: string; payload: Record<string, unknown> }> {
  const log: Array<{ name: string; payload: Record<string, unknown> }> = []
  socket.onAny((name: string, payload: unknown) => {
    if (name === EV_MAP || name === EV_FOG || name === EV_TOKENS) {
      log.push({ name, payload: (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown> })
    }
  })
  return log
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
  return `FG${alphabet[codeZaehler % alphabet.length]}${zahl}`
}

async function createGameSession(fields: { name?: string; status?: string } = {}): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: fields.name ?? 'Freitagsrunde', code: frischerCode(), status: fields.status ?? 'geoeffnet' } })
}
async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}
async function makeMap(ownerId: string, name: string, opts: { image?: boolean; grid?: { type: string; size: number; offsetX: number; offsetY: number } } = {}): Promise<GameMapRow> {
  const grid = opts.grid ?? { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
  return db().gameMap.create({
    data: { ownerId, name, imageFile: opts.image ? `${name}.png` : null, imageType: opts.image ? 'image/png' : null, gridType: grid.type, gridSize: grid.size, gridOffsetX: grid.offsetX, gridOffsetY: grid.offsetY },
  })
}
async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}
async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

/** Deckt Zellen direkt auf (FogCell-Zeilen, GIVEN-Zustand). */
async function revealDirect(instanceId: string, cells: CellT[]): Promise<void> {
  for (const c of cells) await db().fogCell.create({ data: { instanceId, col: c.col, row: c.row } })
}
/** Legt einen Bereich direkt an (FogArea + FogAreaCell, GIVEN-Zustand). */
async function createAreaDirect(instanceId: string, name: string, cells: CellT[]): Promise<FogAreaRow> {
  return db().fogArea.create({ data: { instanceId, name, cells: { create: cells.map((c) => ({ col: c.col, row: c.row })) } } })
}
async function fogCellCount(instanceId: string): Promise<number> {
  return db().fogCell.count({ where: { instanceId } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-fog-socket'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as Partial<FogDb>
  if (c.fogAreaCell) await c.fogAreaCell.deleteMany()
  if (c.fogArea) await c.fogArea.deleteMany()
  if (c.fogCell) await c.fogCell.deleteMany()
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

// ============================================================================================
// Aufdecken und Verdecken durch den Spielleiter (14 Szenarien; "Alles aufdecken bei einer
// Karte mit Bild" liegt in der Bildroute-Suite).
// ============================================================================================

test('Karte startet vollständig verdeckt', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  const ack = await enter(slSocket, gs.id)

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Enter-Acknowledgement')
  expect(fog.instanceId).toBe(instanz.id)
  expect(fog.version).toBe(0)
  expect(revealedOf(fog)).toEqual([])
  expect(areasOf(fog)).toEqual([])
})

test('Spielleiter deckt Zellen auf', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, EV_FOG)
  const beimSpieler = once(spSocket, EV_FOG)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(0, 0), C(1, 0), C(0, 1)] } })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(0, 0), C(1, 0), C(0, 1)]))
  expect(fog.version).toBe(1)
  expect(areasOf(fog)).toEqual([])
  expect(await fogCellCount(instanz.id)).toBe(3)

  const slFog = fogOf(rec(await beimSl, 'session:fog beim Spielleiter'), 'fog')
  expect(keysOf(revealedOf(slFog))).toEqual(keysOf([C(0, 0), C(1, 0), C(0, 1)]))
  const spFog = fogOf(rec(await beimSpieler, 'session:fog beim Spieler'), 'fog')
  expect(keysOf(revealedOf(spFog))).toEqual(keysOf([C(0, 0), C(1, 0), C(0, 1)]))
  expect(spFog.version).toBe(1)
  expect(areasOf(spFog)).toBeNull()
})

test('Erneutes Aufdecken erzeugt keine doppelten Zellen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  const enterAck = await enter(slSocket, gs.id)
  const versionVorher = fogOf(enterAck, 'fog im Enter-Ack').version as number

  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(1, 0), C(2, 0)] } })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(0, 0), C(1, 0), C(2, 0)]))
  expect(await fogCellCount(instanz.id)).toBe(3)
  expect(fog.version).toBe(versionVorher + 1)
})

test('Spielleiter verdeckt Zellen wieder', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0), C(1, 0), C(0, 1)])

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_FOG)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: false, target: { kind: 'zellen', cells: [C(1, 0), C(5, 5)] } })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(0, 0), C(0, 1)]))
  expect(await fogCellCount(instanz.id)).toBe(2)

  const spFog = fogOf(rec(await beimSpieler, 'session:fog beim Spieler'), 'fog')
  expect(keysOf(revealedOf(spFog))).toEqual(keysOf([C(0, 0), C(0, 1)]))
})

test('Alles verdecken', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0), C(1, 0), C(2, 0), C(3, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: false, target: { kind: 'alle' } })

  expect(ack.ok).toBe(true)
  expect(revealedOf(fogOf(ack, 'fog im Acknowledgement'))).toEqual([])
  expect(await fogCellCount(instanz.id)).toBe(0)
})

test('Alles aufdecken bei einer Karte ohne Bild', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: false, grid: { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 } })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'alle' } })

  expect(ack.ok).toBe(true)
  const erwartet: CellT[] = []
  for (let col = 0; col <= 14; col += 1) for (let row = 0; row <= 14; row += 1) erwartet.push(C(col, row))
  expect(keysOf(revealedOf(fogOf(ack, 'fog im Acknowledgement')))).toEqual(keysOf(erwartet))
  expect(await fogCellCount(instanz.id)).toBe(225)
})

test('Bereich aufdecken', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  const bereich = await createAreaDirect(instanz.id, 'Raum 1', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_FOG)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'bereich', areaId: bereich.id } })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(0, 0), C(1, 0)]))
  const areas = must(areasOf(fog), 'areas fuer den Spielleiter')
  const raum1 = must(areas.find((a) => a.name === 'Raum 1'), 'den Eintrag Raum 1')
  expect(raum1.revealed).toBe(true)

  const spFog = fogOf(rec(await beimSpieler, 'session:fog beim Spieler'), 'fog')
  expect(keysOf(revealedOf(spFog))).toEqual(keysOf([C(0, 0), C(1, 0)]))
  expect(areasOf(spFog)).toBeNull()
})

test('Bereich verdecken', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0), C(1, 0), C(5, 5)])
  const bereich = await createAreaDirect(instanz.id, 'Raum 1', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: false, target: { kind: 'bereich', areaId: bereich.id } })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(5, 5)]))
  const areas = must(areasOf(fog), 'areas fuer den Spielleiter')
  const raum1 = must(areas.find((a) => a.name === 'Raum 1'), 'den Eintrag Raum 1')
  expect(raum1.revealed).toBe(false)
})

test('Bereich einer anderen Instanz ist nicht erreichbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const keller = await makeMap(sl.userId, 'Keller', { image: true })
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  const kelInstanz = await mountDirect(gs.id, keller.id)
  await setActive(gs.id, tavInstanz.id)
  const lager = await createAreaDirect(kelInstanz.id, 'Lager', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const aufLager = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'bereich', areaId: lager.id } })
  const aufUnbekannt = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'bereich', areaId: 'unbekannt' } })

  expect(aufLager.ok).toBe(false)
  expect(aufLager.message).toBe(MSG_BEREICH_WEG)
  expect(aufUnbekannt.ok).toBe(false)
  expect(aufUnbekannt.message).toBe(MSG_BEREICH_WEG)
  expect(await fogCellCount(tavInstanz.id)).toBe(0)
  expect(await fogCellCount(kelInstanz.id)).toBe(0)
})

test('Spieler darf nicht aufdecken', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  let slBekamFog = false
  slSocket.on(EV_FOG, () => {
    slBekamFog = true
  })

  const ack = await fogSet(spSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(0, 0)] } })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_KEINE_RECHTE)
  expect(await fogCellCount(instanz.id)).toBe(0)
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(slBekamFog).toBe(false)
})

test('Aufdecken ohne aktive Karte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  await mountDirect(gs.id, taverne.id) // eingehängt, aber nicht aktiviert

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(0, 0)] } })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_KEINE_KARTE)
  expect(await db().fogCell.count()).toBe(0)
})

test('Ungültige Payload beim Aufdecken', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ungueltige: unknown[] = [
    { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [] } },
    { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(1.5, 0)] } },
    { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(0, 0), C(0, 0)] } },
    { sessionId: gs.id, revealed: true },
    { sessionId: gs.id, revealed: 'ja', target: { kind: 'zellen', cells: [C(0, 0)] } },
  ]
  for (const payload of ungueltige) {
    const ack = await fogSet(slSocket, payload)
    expect(ack.ok).toBe(false)
    expect(ack.message).toBe(MSG_UNGUELTIG)
  }
  expect(await fogCellCount(instanz.id)).toBe(0)
})

test('Aushängen löscht aufgedeckte Zellen und Bereiche', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await revealDirect(instanz.id, [C(0, 0), C(1, 0)])
  await createAreaDirect(instanz.id, 'Raum 1', [C(0, 0), C(1, 0)])

  const res = (await app.inject({ method: 'DELETE', url: `/api/sessions/${gs.id}/maps/${instanz.id}`, cookies: { sid: sl.sid } })) as unknown as InjectRes

  expect(res.statusCode).toBe(204)
  expect(await db().fogCell.count({ where: { instanceId: instanz.id } })).toBe(0)
  expect(await db().fogArea.count({ where: { instanceId: instanz.id } })).toBe(0)
  expect(await db().fogAreaCell.count()).toBe(0)
})

test('Aufgedeckte Zellen überstehen einen Serverneustart', async () => {
  const app1 = await startApp()
  const sl = await registerUser(app1, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  // GIVEN: (2,3) wird über die erste App-Instanz aufgedeckt.
  const slSocket1 = client(sl.sid)
  await connect(slSocket1)
  await enter(slSocket1, gs.id)
  const setAck = await fogSet(slSocket1, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(2, 3)] } })
  expect(setAck.ok).toBe(true)

  openSockets.splice(openSockets.indexOf(slSocket1), 1)
  slSocket1.removeAllListeners()
  slSocket1.disconnect()
  openApps.splice(openApps.indexOf(app1), 1)
  await app1.close()

  // WHEN: zweite App-Instanz gegen dieselbe DB, Spielleiter betritt.
  await startApp()
  const slSocket2 = client(sl.sid)
  await connect(slSocket2)
  const ack = await enter(slSocket2, gs.id)

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Enter-Acknowledgement der zweiten App')
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(2, 3)]))
})

// ============================================================================================
// Bereiche verwalten (6 Szenarien).
// ============================================================================================

test('Spielleiter legt einen Bereich an', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_FOG)
  const ack = await fogAreaCreate(slSocket, { sessionId: gs.id, name: 'Raum 1', cells: [C(0, 0), C(1, 0)] })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  const areas = must(areasOf(fog), 'areas fuer den Spielleiter')
  expect(areas).toHaveLength(1)
  expect(typeof areas[0].id).toBe('string')
  expect(areas[0].name).toBe('Raum 1')
  expect(areas[0].cellCount).toBe(2)
  expect(areas[0].revealed).toBe(false)
  expect(revealedOf(fog)).toEqual([])
  expect(fog.version).toBe(0)

  const zeile = must(await db().fogArea.findFirst({ where: { instanceId: instanz.id, name: 'Raum 1' } }), 'die FogArea-Zeile')
  expect(zeile.name).toBe('Raum 1')
  expect(await db().fogAreaCell.count({ where: { areaId: zeile.id } })).toBe(2)

  const spFog = fogOf(rec(await beimSpieler, 'session:fog beim Spieler'), 'fog')
  expect(areasOf(spFog)).toBeNull()
})

test('Bereich gilt als aufgedeckt, wenn alle seine Zellen aufgedeckt sind', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await createAreaDirect(instanz.id, 'Raum 1', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ersterAck = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(0, 0)] } })
  const zweiterAck = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(1, 0), C(5, 5)] } })

  const erstesAreas = must(areasOf(fogOf(ersterAck, 'fog im ersten Acknowledgement')), 'areas')
  expect(must(erstesAreas.find((a) => a.name === 'Raum 1'), 'Raum 1 im ersten Ack').revealed).toBe(false)
  const zweitesAreas = must(areasOf(fogOf(zweiterAck, 'fog im zweiten Acknowledgement')), 'areas')
  expect(must(zweitesAreas.find((a) => a.name === 'Raum 1'), 'Raum 1 im zweiten Ack').revealed).toBe(true)
})

test('Spielleiter löscht einen Bereich', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0)])
  const bereich = await createAreaDirect(instanz.id, 'Raum 1', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await fogAreaDelete(slSocket, { sessionId: gs.id, areaId: bereich.id })

  expect(ack.ok).toBe(true)
  const fog = fogOf(ack, 'fog im Acknowledgement')
  expect(areasOf(fog)).toEqual([])
  expect(keysOf(revealedOf(fog))).toEqual(keysOf([C(0, 0)]))
  expect(await db().fogArea.count({ where: { instanceId: instanz.id } })).toBe(0)
  expect(await db().fogAreaCell.count({ where: { areaId: bereich.id } })).toBe(0)
})

test('Bereich einer anderen Instanz kann nicht gelöscht werden', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const keller = await makeMap(sl.userId, 'Keller', { image: true })
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  const kelInstanz = await mountDirect(gs.id, keller.id)
  await setActive(gs.id, tavInstanz.id)
  const lager = await createAreaDirect(kelInstanz.id, 'Lager', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await fogAreaDelete(slSocket, { sessionId: gs.id, areaId: lager.id })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_BEREICH_WEG)
  expect(await db().fogArea.findFirst({ where: { id: lager.id } })).not.toBeNull()
})

test('Spieler darf keinen Bereich anlegen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await fogAreaCreate(spSocket, { sessionId: gs.id, name: 'Raum 1', cells: [C(0, 0)] })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_KEINE_RECHTE)
  expect(await db().fogArea.count()).toBe(0)
})

test('Ungültiger Bereich', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ungueltige: unknown[] = [
    { sessionId: gs.id, name: '', cells: [C(0, 0)] },
    { sessionId: gs.id, name: 'Raum 1', cells: [] },
    { sessionId: gs.id, name: 'Raum 1', cells: [C(0, 0), C(0, 0)] },
  ]
  for (const payload of ungueltige) {
    const ack = await fogAreaCreate(slSocket, payload)
    expect(ack.ok).toBe(false)
    expect(ack.message).toBe(MSG_UNGUELTIG)
  }
  expect(await db().fogArea.count()).toBe(0)
})

// ============================================================================================
// Fog beim Betreten und Kartenwechsel (4 Szenarien).
// ============================================================================================

test('Betreten liefert den gefilterten Fog-Zustand', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0)])
  await createAreaDirect(instanz.id, 'Raum 1', [C(0, 0), C(1, 0)])

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  const slAck = await enter(slSocket, gs.id)
  const spAck = await enter(spSocket, gs.id)

  const slFog = fogOf(slAck, 'fog im Enter-Ack des Spielleiters')
  expect(keysOf(revealedOf(slFog))).toEqual(keysOf([C(0, 0)]))
  const slAreas = must(areasOf(slFog), 'areas fuer den Spielleiter')
  expect(slAreas).toHaveLength(1)
  expect(slAreas[0].name).toBe('Raum 1')

  const spFog = fogOf(spAck, 'fog im Enter-Ack von sam')
  expect(keysOf(revealedOf(spFog))).toEqual(keysOf([C(0, 0)]))
  expect(spFog.instanceId).toBe(slFog.instanceId)
  expect(spFog.version).toBe(slFog.version)
  expect(areasOf(spFog)).toBeNull()
})

test('Betreten ohne aktive Karte liefert keinen Fog', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const spSocket = client(sp.sid)
  await connect(spSocket)
  const ack = await enter(spSocket, gs.id)

  expect(ack.ok).toBe(true)
  expect('fog' in ack).toBe(true)
  expect(ack.fog).toBeNull()
})

test('Kartenwechsel liefert den Fog der neuen Karte in der richtigen Reihenfolge', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const keller = await makeMap(sl.userId, 'Keller', { image: true })
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  const kelInstanz = await mountDirect(gs.id, keller.id)
  await setActive(gs.id, tavInstanz.id)
  await revealDirect(tavInstanz.id, [C(0, 0)])
  await revealDirect(kelInstanz.id, [C(3, 3)])

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const log = recordEvents(spSocket)
  const nachKeller = once(spSocket, EV_FOG)
  await activateMap(slSocket, { sessionId: gs.id, instanceId: kelInstanz.id })
  const kellerFog = fogOf(rec(await nachKeller, 'session:fog nach Wechsel auf Keller'), 'fog')
  expect(keysOf(revealedOf(kellerFog))).toEqual(keysOf([C(3, 3)]))
  expect(kellerFog.instanceId).toBe(kelInstanz.id)

  const nachTaverne = once(spSocket, EV_FOG)
  await activateMap(slSocket, { sessionId: gs.id, instanceId: tavInstanz.id })
  const taverneFog = fogOf(rec(await nachTaverne, 'session:fog nach Wechsel auf Taverne'), 'fog')
  expect(keysOf(revealedOf(taverneFog))).toEqual(keysOf([C(0, 0)]))
  expect(taverneFog.instanceId).toBe(tavInstanz.id)

  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(log.map((e) => e.name)).toEqual([EV_MAP, EV_FOG, EV_TOKENS, EV_MAP, EV_FOG, EV_TOKENS])
})

test('Zurücksetzen liefert keinen Fog', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(0, 0)])

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_FOG)
  await activateMap(slSocket, { sessionId: gs.id, instanceId: null })

  const event = rec(await beimSpieler, 'session:fog nach Zuruecksetzen')
  expect('fog' in event).toBe(true)
  expect(event.fog).toBeNull()
  expect(await db().fogCell.findFirst({ where: { instanceId: instanz.id, col: 0, row: 0 } })).not.toBeNull()
})
