// Integrationstests zu openspec/changes/add-fog-of-war/specs/session-fog/spec.md (tasks.md 1.3):
// die 7 Szenarien der Requirement "Kartenbild der Spielsitzung" und das Szenario "Alles
// aufdecken bei einer Karte mit Bild" der Requirement "Aufdecken und Verdecken durch den
// Spielleiter". Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname =
// Szenarioname.
//
// Alle Szenarien, die `sharp` brauchen (Bilder erzeugen und WebP dekodieren), liegen in dieser
// einen Suite, damit das native Modul je Jest-Worker nur einmal geladen wird (design.md D9).
// Bilder werden per `sharp` erzeugt (ein deckend rotes PNG von 140 × 140) und der WebP-Body per
// `sharp().ensureAlpha().raw()` dekodiert; Bildpunkte über `(y * width + x) * channels`
// adressiert, Alpha ist der letzte Kanal. Angesprochen wird die REST-Route über `app.inject()`;
// wo ein Aufdecken durch den Spielleiter im Raum nötig ist, ein echter `socket.io-client`.
// Gegen die Suite-eigene Wegwerf-DB (`session-map-image.test.db`, constitution.md §4.3) mit
// eigenem Upload-Verzeichnis.
//
// Rote Phase (constitution.md §3.1): die Route `GET /api/sessions/:id/map-image` existiert noch
// nicht (404 statt 200/401), und das Ereignis `session:fog-set` ist unbekannt (Timeout); bis
// zur Migration (tasks.md 2.1) kennt Prisma das Modell `fogCell` nicht, sodass ein GIVEN, das
// Zellen direkt aufdeckt, am Laufzeitzugriff scheitert. Beides ist der erwartete rote Grund,
// kein Setup-/Tippfehler.

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { io, type Socket } from 'socket.io-client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
const WAIT_MS = 5000
const ACK_MS = 3000
const QUADRAT_70 = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 } as const

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
let uploadDir = ''
const openApps: App[] = []
const openSockets: Socket[] = []
let removeDbFiles: () => void = () => {}
let baseUrl = ''

/** Ein deckend rotes PNG von 140 × 140 (design.md D9), einmal pro Suite erzeugt. */
let RED_140: Buffer

// --- Loser Prisma-Zugriff auf die (teils neuen) Tabellen ------------------------------------
interface GameSessionRow {
  id: string
  activeInstanceId?: string | null
}
interface GameMapRow {
  id: string
  ownerId: string
  name: string
}
interface MapInstanceRow {
  id: string
  sessionId: string
  mapId: string
}
interface ImgDb {
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
    create(args: { data: { ownerId: string; name: string; gridType?: string; gridSize?: number; gridOffsetX?: number; gridOffsetY?: number } }): Promise<GameMapRow>
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
    deleteMany(args?: unknown): Promise<unknown>
  }
  fogArea: { deleteMany(args?: unknown): Promise<unknown> }
  fogAreaCell: { deleteMany(args?: unknown): Promise<unknown> }
}
const db = (): ImgDb => prisma as unknown as ImgDb

// --- Antwort- und HTTP-Hilfen ---------------------------------------------------------------

type Res = {
  statusCode: number
  body: string
  rawPayload: Buffer
  headers: Record<string, string | string[] | undefined>
  cookies: Array<{ name: string; value: string }>
}

type CellT = { col: number; row: number }
function C(col: number, row: number): CellT {
  return { col, row }
}
function keysOf(cells: CellT[]): string[] {
  return cells.map((c) => `${c.col},${c.row}`).sort()
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}
function rec(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Erwartet ein Objekt: ${what}`)
  return value as Record<string, unknown>
}
function bodyOf(res: Res): Record<string, unknown> {
  return rec(JSON.parse(res.body), 'JSON-Antwortkoerper')
}
function sidOf(res: Res): string {
  return must(res.cookies.find((c) => c.name === 'sid'), 'ein Sitzungscookie "sid"').value
}
function headerOf(res: Res, name: string): string {
  const value = res.headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

// --- WebP dekodieren (design.md D9) ---------------------------------------------------------
type Decoded = { data: Buffer; width: number; height: number; channels: number }
async function decode(buf: Buffer): Promise<Decoded> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}
function alphaAt(dec: Decoded, x: number, y: number): number {
  return dec.data[(y * dec.width + x) * dec.channels + 3]
}
function rgbAt(dec: Decoded, x: number, y: number): { r: number; g: number; b: number } {
  const i = (y * dec.width + x) * dec.channels
  return { r: dec.data[i], g: dec.data[i + 1], b: dec.data[i + 2] }
}

async function startApp(): Promise<App> {
  const app = await createApp({ prisma, uploadDir, logger: false } as Parameters<CreateApp>[0])
  openApps.push(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  return app
}

async function registerUser(app: App, email: string, username: string = usernameFromEmail(email)): Promise<{ sid: string; userId: string }> {
  const res = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, username, password: PASSWORD } })) as unknown as Res
  if (res.statusCode !== 201) throw new Error(`Registrierung fehlgeschlagen (${res.statusCode}): ${res.body}`)
  return { sid: sidOf(res), userId: String(bodyOf(res).id) }
}
function get(app: App, url: string, sid?: string): Promise<Res> {
  return app.inject({ method: 'GET', url, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
}
function putImage(app: App, url: string, body: Buffer, contentType: string, sid: string): Promise<Res> {
  return app.inject({ method: 'PUT', url, payload: body, headers: { 'content-type': contentType }, cookies: { sid } }) as unknown as Promise<Res>
}

let codeZaehler = 0
function frischerCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  codeZaehler += 1
  const zahl = codeZaehler.toString().padStart(3, '2').slice(-3)
  return `MI${alphabet[codeZaehler % alphabet.length]}${zahl}`
}
async function createGameSession(): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: 'Freitagsrunde', code: frischerCode(), status: 'geoeffnet' } })
}
async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}
async function makeMap(ownerId: string, name: string, grid = QUADRAT_70): Promise<GameMapRow> {
  return db().gameMap.create({ data: { ownerId, name, gridType: grid.type, gridSize: grid.size, gridOffsetX: grid.offsetX, gridOffsetY: grid.offsetY } })
}
async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}
async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}
async function revealDirect(instanceId: string, cells: CellT[]): Promise<void> {
  for (const c of cells) await db().fogCell.create({ data: { instanceId, col: c.col, row: c.row } })
}

/** Legt eine aktive Karte mit hochgeladenem, deckend rotem 140 × 140-PNG an; gibt Instanz und
 * die hochgeladenen Bytes zurück. */
async function aktiveKarteMitBild(app: App, ownerSid: string, ownerId: string, sessionId: string, name = 'Taverne'): Promise<{ instanz: MapInstanceRow; bytes: Buffer }> {
  const karte = await makeMap(ownerId, name)
  const put = await putImage(app, `/api/maps/${karte.id}/image`, RED_140, 'image/png', ownerSid)
  if (put.statusCode !== 200) throw new Error(`Bild-Upload fehlgeschlagen (${put.statusCode}): ${put.body}`)
  const instanz = await mountDirect(sessionId, karte.id)
  await setActive(sessionId, instanz.id)
  return { instanz, bytes: RED_140 }
}

// --- Socket-Hilfen (für das Aufdecken durch den Spielleiter im Raum) ------------------------
function client(sid: string): Socket {
  const socket = io(baseUrl, { transports: ['websocket'], reconnection: false, autoConnect: false, forceNew: true, extraHeaders: { cookie: `sid=${sid}` } })
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
function fogSet(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:fog-set', payload)
}

// --- Wegwerf-DB und Upload-Verzeichnis ------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-map-image'))
  uploadDir = await mkdtemp(path.join(tmpdir(), 'vtt-fog-image-'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
  RED_140 = await sharp({ create: { width: 140, height: 140, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer()
})

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as Partial<ImgDb>
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
  for (const entry of await readdir(uploadDir)) await rm(path.join(uploadDir, entry), { force: true, recursive: true })
})

afterAll(async () => {
  if (prisma) await prisma.$disconnect()
  await rm(uploadDir, { force: true, recursive: true })
  removeDbFiles()
})

// ============================================================================================
// Kartenbild der Spielsitzung (7 Szenarien).
// ============================================================================================

test('Kartenbild ohne Cookie', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)

  const res = await get(app, `/api/sessions/${gs.id}/map-image`)

  expect(res.statusCode).toBe(401)
})

test('Nicht-Mitglied und unbekannte Spielsitzung sind nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const fremd = await registerUser(app, 'fremd@example.com', 'nora')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)

  const aufSitzung = await get(app, `/api/sessions/${gs.id}/map-image`, fremd.sid)
  const aufUnbekannt = await get(app, '/api/sessions/unbekannt/map-image', fremd.sid)

  expect(aufSitzung.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufSitzung.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufSitzung).message)
})

test('Spielleiter erhält das Originalbild', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const { bytes } = await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)

  const res = await get(app, `/api/sessions/${gs.id}/map-image`, sl.sid)

  expect(res.statusCode).toBe(200)
  expect(headerOf(res, 'content-type')).toContain('image/png')
  expect(headerOf(res, 'cache-control')).toBe('private, no-store')
  expect(res.rawPayload.equals(bytes)).toBe(true)
})

test('Spieler erhält das maskierte Bild', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const { instanz } = await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)
  await revealDirect(instanz.id, [C(0, 0)])

  const res = await get(app, `/api/sessions/${gs.id}/map-image`, sam.sid)

  expect(res.statusCode).toBe(200)
  expect(headerOf(res, 'content-type')).toContain('image/webp')
  expect(headerOf(res, 'cache-control')).toBe('private, no-store')
  const dec = await decode(res.rawPayload)
  expect(dec.width).toBe(140)
  expect(dec.height).toBe(140)
  expect(alphaAt(dec, 35, 35)).toBe(255)
  const farbe = rgbAt(dec, 35, 35)
  expect(farbe.r).toBeGreaterThan(200)
  expect(farbe.g).toBeLessThan(60)
  expect(farbe.b).toBeLessThan(60)
  expect(alphaAt(dec, 105, 105)).toBe(0)
  expect(alphaAt(dec, 105, 35)).toBe(0)
})

test('Vollständig verdeckte Karte liefert ein leeres Bild', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)

  const res = await get(app, `/api/sessions/${gs.id}/map-image`, sam.sid)

  expect(res.statusCode).toBe(200)
  expect(headerOf(res, 'content-type')).toContain('image/webp')
  const dec = await decode(res.rawPayload)
  expect(dec.width).toBe(140)
  expect(dec.height).toBe(140)
  expect(alphaAt(dec, 35, 35)).toBe(0)
  expect(alphaAt(dec, 105, 105)).toBe(0)
})

test('Aufdecken wirkt auf den nächsten Abruf', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const { instanz } = await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)
  await revealDirect(instanz.id, [C(0, 0)])

  // sam ruft das maskierte Bild bereits einmal ab.
  const erste = await get(app, `/api/sessions/${gs.id}/map-image`, sam.sid)
  expect(erste.statusCode).toBe(200)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)
  const setAck = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(1, 1)] } })
  expect(setAck.ok).toBe(true)

  const zweite = await get(app, `/api/sessions/${gs.id}/map-image`, sam.sid)

  expect(zweite.statusCode).toBe(200)
  const dec = await decode(zweite.rawPayload)
  expect(alphaAt(dec, 105, 105)).toBe(255)
  expect(alphaAt(dec, 105, 35)).toBe(0)
})

test('Kartenbild ohne aktive Karte oder ohne Bild', async () => {
  const app = await startApp()
  const sl1 = await registerUser(app, 'sl1@example.com', 'meister')
  const sl2 = await registerUser(app, 'sl2@example.com', 'gerda')

  // Erste Spielsitzung: keine aktive Karte.
  const ohneAktive = await createGameSession()
  await addMembership(ohneAktive.id, sl1.userId, 'spielleiter')
  const karte1 = await makeMap(sl1.userId, 'Taverne')
  await mountDirect(ohneAktive.id, karte1.id) // eingehängt, nicht aktiviert

  // Zweite Spielsitzung: aktive Karte ohne Bild.
  const ohneBild = await createGameSession()
  await addMembership(ohneBild.id, sl2.userId, 'spielleiter')
  const karte2 = await makeMap(sl2.userId, 'Keller')
  const instanz2 = await mountDirect(ohneBild.id, karte2.id)
  await setActive(ohneBild.id, instanz2.id)

  const aufOhneAktive = await get(app, `/api/sessions/${ohneAktive.id}/map-image`, sl1.sid)
  const aufOhneBild = await get(app, `/api/sessions/${ohneBild.id}/map-image`, sl2.sid)

  expect(aufOhneAktive.statusCode).toBe(404)
  expect(aufOhneBild.statusCode).toBe(404)
})

// ============================================================================================
// Alles aufdecken bei einer Karte mit Bild (Requirement "Aufdecken und Verdecken").
// ============================================================================================

test('Alles aufdecken bei einer Karte mit Bild', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession()
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const { instanz } = await aktiveKarteMitBild(app, sl.sid, sl.userId, gs.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'alle' } })

  expect(ack.ok).toBe(true)
  const fog = rec(ack.fog, 'fog im Acknowledgement')
  const erwartet: CellT[] = []
  for (let col = 0; col <= 2; col += 1) for (let row = 0; row <= 2; row += 1) erwartet.push(C(col, row))
  if (!Array.isArray(fog.revealed)) throw new Error('fog.revealed ist keine Liste')
  expect(keysOf(fog.revealed as CellT[])).toEqual(keysOf(erwartet))
  expect(await db().fogCell.count({ where: { instanceId: instanz.id } })).toBe(9)
})
