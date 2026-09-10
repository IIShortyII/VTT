// Integrationstests zu openspec/changes/add-session-map/specs/session-map/spec.md — die
// Socket-Szenarien der Requirements "Aktive Karte setzen", "Betreten liefert die aktive
// Karte", "Änderung der Bibliothekskarte erreicht aktive Räume" und das Socket-Szenario
// "Aushängen der aktiven Karte leert den Raum" der Requirement "Karte aushängen" (tasks.md
// 1.2). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Aufbau wie in game-session-socket.integration.test.ts (design.md D8): die App lauscht auf
// Port 0, ein `socket.io-client` verbindet mit dem Sitzungscookie in `extraHeaders`,
// `reconnection: false`. Ereignisse werden ueber `once`-Promises mit Timeout eingesammelt;
// Listener werden vor der ausloesenden Aktion registriert. "erhält kein session:map" ist eine
// kurze Wartezeit ohne Ereignis, wie dort "kein session:status". GIVEN-Zustaende werden direkt
// in `GameSession`/`Membership`/`GameMap`/`MapInstance` geschrieben. Gegen die Suite-eigene
// Wegwerf-DB (`session-map-socket.test.db`, constitution.md §4.3).
//
// Rote Phase (tasks.md 1.2, constitution.md §3.1): das Ereignis `session:activate-map` ist
// unbekannt (kein Acknowledgement -> Timeout), `map` fehlt im Enter-Acknowledgement, und der
// Broadcast bei `PATCH`/Aushängen ist nicht verdrahtet. Zusaetzlich fehlen bis zur Migration
// aus 2.1 Tabelle `MapInstance` und Spalte `GameSession.activeInstanceId`; Tests, die sie im
// GIVEN schreiben, scheitern dann am Prisma-Laufzeitzugriff. Beides ist der erwartete rote
// Grund, kein Setup-/Tippfehler.

import { PrismaClient } from '@prisma/client'
import { io, type Socket } from 'socket.io-client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
const WAIT_MS = 5000
const QUIET_MS = 800

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
const openSockets: Socket[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die (teils neuen) Tabellen -------------------------------------------------
// `MapInstance` und `GameSession.activeInstanceId` entstehen erst mit der Migration (2.1); der
// Zugriff ist lose getippt, damit die Suite kompilierbar bleibt und erst zur Laufzeit am
// fehlenden Modell/Feld scheitert (der erwartete rote Grund).
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
interface GameDb {
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
    create(args: {
      data: {
        ownerId: string
        name: string
        imageFile?: string | null
        imageType?: string | null
        gridType?: string
        gridSize?: number
        gridOffsetX?: number
        gridOffsetY?: number
      }
    }): Promise<GameMapRow>
    deleteMany(): Promise<unknown>
  }
  mapInstance: {
    create(args: { data: { sessionId: string; mapId: string; position: number } }): Promise<MapInstanceRow>
    count(args?: unknown): Promise<number>
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

function rec(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Erwartet ein Objekt: ${what}`)
  return value as Record<string, unknown>
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

/** Wartet auf das naechste Vorkommen eines Server-Ereignisses (Listener vor der Aktion setzen). */
function once<T = unknown>(socket: Socket, event: string, ms = WAIT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ereignis "${event}" kam nicht innerhalb ${ms}ms`)), ms)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

/** Sendet ein Client-Ereignis und wartet auf sein Acknowledgement. */
function emitAck(socket: Socket, event: string, payload: unknown, ms = WAIT_MS): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Kein Acknowledgement fuer "${event}" innerhalb ${ms}ms`)), ms)
    socket.emit(event, payload, (ack: unknown) => {
      clearTimeout(timer)
      resolve(rec(ack, `Acknowledgement fuer ${event}`))
    })
  })
}

function enter(socket: Socket, sessionId: string): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:enter', { sessionId })
}

/** `session:activate-map` (design.md D5). `payload` bewusst `unknown`, damit auch eine
 * ungueltige Form (etwa eine Zahl) gesendet werden kann. */
function activateMap(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:activate-map', payload)
}

async function registerUser(app: App, email: string, username: string = usernameFromEmail(email)): Promise<{ sid: string; userId: string }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, username, password: PASSWORD },
  })) as unknown as InjectRes
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
  return `CD${alphabet[codeZaehler % alphabet.length]}${zahl}`
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
    data: {
      ownerId,
      name,
      imageFile: opts.image ? `${name}.png` : null,
      imageType: opts.image ? 'image/png' : null,
      gridType: grid.type,
      gridSize: grid.size,
      gridOffsetX: grid.offsetX,
      gridOffsetY: grid.offsetY,
    },
  })
}

async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}

async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

async function activeInstanceIdInDb(sessionId: string): Promise<string | null> {
  const row = await db().gameSession.findUnique({ where: { id: sessionId } })
  return (must(row, 'die Spielsitzungszeile').activeInstanceId ?? null) as string | null
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-map-socket'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as Partial<GameDb>
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

// --- Aktive Karte setzen --------------------------------------------------------------------

test('Spielleiter aktiviert eine Karte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true, grid: { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 } })
  const instanz = await mountDirect(gs.id, taverne.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, 'session:map')
  const ack = await activateMap(slSocket, { sessionId: gs.id, instanceId: instanz.id })

  expect(ack.ok).toBe(true)
  const map = rec(ack.map, 'map im Acknowledgement')
  expect(map.instanceId).toBe(instanz.id)
  expect(map.mapId).toBe(taverne.id)
  expect(map.name).toBe('Taverne')
  expect(map.hasImage).toBe(true)
  expect(map.grid).toEqual({ type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 })

  const event = rec(await beimSpieler, 'session:map beim Spieler')
  expect(rec(event.map, 'map im Ereignis').instanceId).toBe(instanz.id)
  expect(await activeInstanceIdInDb(gs.id)).toBe(instanz.id)
})

test('Aktive Karte zurücksetzen', async () => {
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

  const beimSpieler = once(spSocket, 'session:map')
  const ack = await activateMap(slSocket, { sessionId: gs.id, instanceId: null })

  expect(ack.ok).toBe(true)
  expect(ack.map).toBeNull()
  const event = rec(await beimSpieler, 'session:map beim Spieler')
  expect(event.map).toBeNull()
  expect(await activeInstanceIdInDb(gs.id)).toBeNull()
})

test('Spieler darf keine Karte aktivieren', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await activateMap(spSocket, { sessionId: gs.id, instanceId: instanz.id })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await activeInstanceIdInDb(gs.id)).toBeNull()
})

test('Instanz einer anderen Spielsitzung kann nicht aktiviert werden', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const a = await createGameSession({ name: 'A', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', status: 'geoeffnet' })
  await addMembership(a.id, sl.userId, 'spielleiter')
  await addMembership(b.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanzB = await mountDirect(b.id, taverne.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, a.id)

  const ack = await activateMap(slSocket, { sessionId: a.id, instanceId: instanzB.id })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await activeInstanceIdInDb(a.id)).toBeNull()
  expect(await activeInstanceIdInDb(b.id)).toBeNull()
})

test('Ungültige Payload beim Aktivieren', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await activateMap(slSocket, 42)

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await activeInstanceIdInDb(gs.id)).toBeNull()
})

test('Abmeldung wirkt auf das Aktivieren', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: sl.sid } })
  const ack = await activateMap(slSocket, { sessionId: gs.id, instanceId: instanz.id })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await activeInstanceIdInDb(gs.id)).toBeNull()
})

// --- Betreten liefert die aktive Karte ------------------------------------------------------

test('Spieler betritt einen Raum mit aktiver Karte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const wald = await makeMap(sl.userId, 'Wald', { image: true })
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  await mountDirect(gs.id, wald.id)
  await setActive(gs.id, tavInstanz.id)

  const spSocket = client(sp.sid)
  await connect(spSocket)
  const ack = await enter(spSocket, gs.id)

  expect(ack.ok).toBe(true)
  const map = rec(ack.map, 'map im Enter-Acknowledgement')
  expect(map.name).toBe('Taverne')
  expect(map.hasImage).toBe(true)
  expect(map.mapId).toBe(taverne.id)
  expect(map.instanceId).toBe(tavInstanz.id)
  expect(JSON.stringify(ack)).not.toContain('Wald')
})

test('Betreten ohne aktive Karte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await mountDirect(gs.id, taverne.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  const ack = await enter(slSocket, gs.id)

  expect(ack.ok).toBe(true)
  expect(ack.session).toBeDefined()
  expect(Array.isArray(ack.participants)).toBe(true)
  expect('map' in ack).toBe(true)
  expect(ack.map).toBeNull()
})

// --- Änderung der Bibliothekskarte erreicht aktive Räume ------------------------------------

test('Rasteränderung erreicht den Raum mit aktiver Karte', async () => {
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

  const beimSpieler = once(spSocket, 'session:map')
  const neuesRaster = { type: 'hex-flach', size: 55, offsetX: 3, offsetY: 4 }
  const res = (await app.inject({
    method: 'PATCH',
    url: `/api/maps/${taverne.id}`,
    payload: { grid: neuesRaster },
    cookies: { sid: sl.sid },
  })) as unknown as InjectRes
  expect(res.statusCode).toBe(200)

  const event = rec(await beimSpieler, 'session:map beim Spieler')
  const map = rec(event.map, 'map im Ereignis')
  expect(map.instanceId).toBe(instanz.id)
  expect(map.grid).toEqual(neuesRaster)
})

test('Änderung an einer eingehängten, nicht aktiven Karte bleibt still', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne', { image: true })
  const wald = await makeMap(sl.userId, 'Wald', { image: true })
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  await mountDirect(gs.id, wald.id)
  await setActive(gs.id, tavInstanz.id)

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  // "erhält kein session:map": ein Fehl-Listener macht ein unerwartetes Ereignis sichtbar,
  // gewartet wird eine kurze Ruhezeit ab (wie "kein session:status" in game-session).
  let mapEmpfangen = false
  spSocket.on('session:map', () => {
    mapEmpfangen = true
  })
  const res = (await app.inject({
    method: 'PATCH',
    url: `/api/maps/${wald.id}`,
    payload: { name: 'Dunkler Wald' },
    cookies: { sid: sl.sid },
  })) as unknown as InjectRes
  expect(res.statusCode).toBe(200)

  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(mapEmpfangen).toBe(false)
})

// --- Aushängen der aktiven Karte leert den Raum (Requirement "Karte aushängen") -------------

test('Aushängen der aktiven Karte leert den Raum', async () => {
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

  const beimSpieler = once(spSocket, 'session:map')
  const res = (await app.inject({
    method: 'DELETE',
    url: `/api/sessions/${gs.id}/maps/${instanz.id}`,
    cookies: { sid: sl.sid },
  })) as unknown as InjectRes
  expect(res.statusCode).toBe(204)

  const event = rec(await beimSpieler, 'session:map beim Spieler')
  expect(event.sessionId).toBe(gs.id)
  expect(event.map).toBeNull()
  expect(await activeInstanceIdInDb(gs.id)).toBeNull()
})
