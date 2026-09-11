// Integrationstests zu openspec/changes/add-token-assignment/specs/session-token/spec.md — das
// Delta zu #15: die neue Requirement "Token zuweisen" (7 Szenarien), die geaenderte Requirement
// "Token bewegen" (3 neue Szenarien plus zwei bestehende, die ihren Namen behalten). Die
// uebrigen Szenarien aus #14 ("Token anlegen", "Token entfernen", "Tokenbestand beim Betreten
// und Kartenwechsel", "Unbekanntes … nicht unterscheidbar") bleiben unveraendert (tasks.md 1.1).
// Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Aufbau wie in session-map-socket.integration.test.ts (design.md D8): die App lauscht auf
// Port 0, ein `socket.io-client` verbindet mit dem Sitzungscookie in `extraHeaders`,
// `reconnection: false`. Ereignisse werden ueber `once`-Promises mit Timeout eingesammelt;
// Listener werden vor der ausloesenden Aktion registriert. "erhält kein session:tokens" ist
// eine kurze Wartezeit ohne Ereignis. GIVEN-Zustaende (Sitzung, Mitgliedschaft, Karte, Instanz,
// Token samt Besitzer) werden direkt in der DB geschrieben; das Szenario "Entzogene Zuweisung
// wirkt mit der nächsten Bewegung" nutzt **eine** Spieler-Verbindung fuer beide Bewegungen
// (§9.3). Gegen die Suite-eigene Wegwerf-DB (`session-token-socket.test.db`, constitution.md
// §4.3).
//
// Ereignisnamen und Payloads woertlich aus spec.md "Drahtformat" / design.md: das neue Ereignis
// `session:token-assign` mit `{ sessionId, tokenId, ownerId }` (`ownerId` als userId oder
// `null`) → `{ ok: true, token }` | `{ ok: false, message }`; die Tokendarstellung traegt
// zusaetzlich `ownerId`.
//
// Rote Phase (tasks.md 1.1, constitution.md §3.1): das Ereignis `session:token-assign` ist
// unbekannt (kein Acknowledgement -> Timeout); `session:token-move` verlangt bis zur Umsetzung
// weiterhin die Rolle `spielleiter`, weshalb ein Spieler eine falsche/allgemeine statt der
// festen Meldung `Dieses Token darfst du nicht bewegen.` erhaelt bzw. sein eigenes Token nicht
// bewegen darf; `ownerId` fehlt in der Tokendarstellung (Wert `undefined` statt der userId bzw.
// `null`). Zusaetzlich kennt Prisma bis zur Migration aus 2.1 die Spalte `ownerId` nicht:
// Tests, die ein Token mit `ownerId` in der DB anlegen (`createTokenDirect({ ownerId })`) oder
// `ownerId` aus der DB lesen, scheitern dann am Datenbankzugriff (Prisma "Unknown argument
// ownerId"). Beides ist der erwartete rote Grund, kein Setup-/Tippfehler.

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
// `MapInstance`/`GameSession.activeInstanceId` (aus #50) und `Token` (aus #14, mit #15 um
// `ownerId` erweitert). Der Zugriff ist lose getippt gegen selbst geschriebene Interfaces,
// damit die Suite kompilierbar bleibt und erst zur Laufzeit am fehlenden Spalten scheitert
// (der erwartete rote Grund).
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
  color: string
  icon: string | null
  size: number
  col: number
  row: number
  ownerId?: string | null
  hp?: number | null
  hpMax?: number | null
  tempHp?: number | null
  ac?: number | null
  initiative?: number | null
  createdAt?: Date
}
interface TokenConditionRow {
  id: string
  tokenId: string
  label: string
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
      data: { ownerId: string; name: string; imageFile?: string | null; imageType?: string | null; gridType?: string; gridSize?: number; gridOffsetX?: number; gridOffsetY?: number }
    }): Promise<GameMapRow>
    deleteMany(): Promise<unknown>
  }
  mapInstance: {
    create(args: { data: { sessionId: string; mapId: string; position: number } }): Promise<MapInstanceRow>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
  token: {
    create(args: {
      data: {
        instanceId: string
        name: string
        color: string
        icon: string | null
        size: number
        col: number
        row: number
        ownerId?: string | null
        hp?: number | null
        hpMax?: number | null
        tempHp?: number | null
        ac?: number | null
        initiative?: number | null
      }
    }): Promise<TokenRow>
    findUnique(args: { where: { id: string } }): Promise<TokenRow | null>
    findMany(args?: unknown): Promise<TokenRow[]>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
  tokenCondition: {
    create(args: { data: { tokenId: string; label: string; position: number } }): Promise<TokenConditionRow>
    findMany(args?: unknown): Promise<TokenConditionRow[]>
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

function tokensOf(event: unknown, what: string): Array<Record<string, unknown>> {
  const e = rec(event, what)
  if (!Array.isArray(e.tokens)) throw new Error(`Erwartet eine tokens-Liste: ${what}`)
  return e.tokens as Array<Record<string, unknown>>
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

/** Sammelt alle Vorkommen eines Server-Ereignisses je Verbindung (Sichtbarkeits-Szenarien,
 * design.md D11: "zaehlt je Verbindung genau zwei Ereignisse"). Listener vor der Aktion setzen. */
function collect(socket: Socket, event: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = []
  socket.on(event, (payload: Record<string, unknown>) => events.push(rec(payload, `${event}-Ereignis`)))
  return events
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

// Drahtereignisse woertlich aus spec.md "Drahtformat".
function tokenCreate(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-create', payload)
}
function tokenMove(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-move', payload)
}
function tokenRemove(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-remove', payload)
}
function tokenAssign(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-assign', payload)
}
function tokenStats(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-stats', payload)
}
function tokenConditions(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-conditions', payload)
}
function activateMap(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:activate-map', payload)
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
  return `TK${alphabet[codeZaehler % alphabet.length]}${zahl}`
}

async function createGameSession(fields: { name?: string; status?: string } = {}): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: fields.name ?? 'Freitagsrunde', code: frischerCode(), status: fields.status ?? 'geoeffnet' } })
}

async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}

async function makeMap(ownerId: string, name: string, opts: { image?: boolean } = {}): Promise<GameMapRow> {
  return db().gameMap.create({
    data: { ownerId, name, imageFile: opts.image ? `${name}.png` : null, imageType: opts.image ? 'image/png' : null, gridType: 'quadrat', gridSize: 70, gridOffsetX: 0, gridOffsetY: 0 },
  })
}

async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}

async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

/** GIVEN-Token direkt auf einer (auch nicht aktiven) Instanz — der einzige Weg, ein Token auf
 * einer nicht aktiven Instanz oder in einer fremden Sitzung anzulegen (design.md D8). Ein
 * optionales `ownerId` legt den Besitzer direkt fest (design.md D8, GIVEN "Besitzer ist sam"). */
async function createTokenDirect(
  instanceId: string,
  fields: {
    name?: string
    color?: string
    icon?: string | null
    size?: number
    col?: number
    row?: number
    ownerId?: string | null
    hp?: number | null
    hpMax?: number | null
    tempHp?: number | null
    ac?: number | null
    initiative?: number | null
    conditions?: string[]
  } = {},
): Promise<TokenRow> {
  const token = await db().token.create({
    data: {
      instanceId,
      name: fields.name ?? 'Goblin',
      color: fields.color ?? '#3366ff',
      icon: fields.icon ?? null,
      size: fields.size ?? 1,
      col: fields.col ?? 0,
      row: fields.row ?? 0,
      ...(fields.ownerId !== undefined ? { ownerId: fields.ownerId } : {}),
      ...(fields.hp !== undefined ? { hp: fields.hp } : {}),
      ...(fields.hpMax !== undefined ? { hpMax: fields.hpMax } : {}),
      ...(fields.tempHp !== undefined ? { tempHp: fields.tempHp } : {}),
      ...(fields.ac !== undefined ? { ac: fields.ac } : {}),
      ...(fields.initiative !== undefined ? { initiative: fields.initiative } : {}),
    },
  })
  // Markierungen als TokenCondition-Zeilen mit `position` in gesendeter Reihenfolge (design.md D11).
  if (fields.conditions) {
    for (let position = 0; position < fields.conditions.length; position += 1) {
      await db().tokenCondition.create({ data: { tokenId: token.id, label: fields.conditions[position], position } })
    }
  }
  return token
}

async function tokenRowById(id: string): Promise<TokenRow | null> {
  return db().token.findUnique({ where: { id } })
}

async function conditionLabels(tokenId: string): Promise<string[]> {
  const rows = await db().tokenCondition.findMany({ where: { tokenId }, orderBy: { position: 'asc' } })
  return rows.map((r) => r.label)
}
async function conditionCount(tokenId: string): Promise<number> {
  return db().tokenCondition.count({ where: { tokenId } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-token-socket'))
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
  if (c.tokenCondition) await c.tokenCondition.deleteMany()
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

// --- Token anlegen --------------------------------------------------------------------------

test('Spielleiter legt ein Token an', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenCreate(slSocket, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: '💀', size: 2, col: 3, row: 4 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.name).toBe('Goblin')
  expect(token.color).toBe('#3366ff')
  expect(token.icon).toBe('💀')
  expect(token.size).toBe(2)
  expect(token.col).toBe(3)
  expect(token.row).toBe(4)
  expect(token.instanceId).toBe(instanz.id)

  expect(await db().token.count()).toBe(1)
  expect(await db().token.count({ where: { id: token.id, instanceId: instanz.id } })).toBe(1)

  const slEvent = tokensOf(await beimSl, 'session:tokens beim Spielleiter')
  const spEvent = rec(await beimSpieler, 'session:tokens beim Spieler')
  expect(spEvent.sessionId).toBe(gs.id)
  const spTokens = tokensOf(spEvent, 'tokens beim Spieler')
  expect(slEvent.length).toBe(1)
  expect(spTokens.length).toBe(1)
  expect(slEvent[0].name).toBe('Goblin')
  expect(spTokens[0].name).toBe('Goblin')
})

test('Ohne aktive Karte wird kein Token angelegt', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  await mountDirect(gs.id, karte.id) // eingehaengt, aber nicht aktiv

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  let tokensEmpfangen = false
  slSocket.on('session:tokens', () => {
    tokensEmpfangen = true
  })
  const ack = await tokenCreate(slSocket, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: null, size: 1, col: 0, row: 0 })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe('Keine Karte aktiv.')
  expect(await db().token.count()).toBe(0)
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(tokensEmpfangen).toBe(false)
})

test('Spieler darf kein Token anlegen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  let slTokens = false
  slSocket.on('session:tokens', () => {
    slTokens = true
  })
  const ack = await tokenCreate(spSocket, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: null, size: 1, col: 0, row: 0 })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await db().token.count()).toBe(0)
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(slTokens).toBe(false)
})

test('Ungültige Felder werden abgelehnt', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const leererName = await tokenCreate(slSocket, { sessionId: gs.id, name: '', color: '#3366ff', icon: null, size: 1, col: 0, row: 0 })
  const falscheFarbe = await tokenCreate(slSocket, { sessionId: gs.id, name: 'Goblin', color: 'rot', icon: null, size: 1, col: 0, row: 0 })
  const zuGross = await tokenCreate(slSocket, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: null, size: 5, col: 0, row: 0 })

  expect(leererName.ok).toBe(false)
  expect(typeof leererName.message).toBe('string')
  expect(falscheFarbe.ok).toBe(false)
  expect(typeof falscheFarbe.message).toBe('string')
  expect(zuGross.ok).toBe(false)
  expect(typeof zuGross.message).toBe('string')
  expect(await db().token.count()).toBe(0)
})

test('Neu angelegtes Token gehört dem Spielleiter', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenCreate(slSocket, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: null, size: 1, col: 0, row: 0 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.ownerId).toBeNull()

  const inDb = must(await tokenRowById(String(token.id)), 'die Token-Zeile')
  expect(inDb.ownerId).toBeNull()
})

// --- Token bewegen --------------------------------------------------------------------------

test('Spielleiter bewegt ein Token', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, 'session:tokens')
  const beimSl = once(slSocket, 'session:tokens')
  const ack = await tokenMove(slSocket, { sessionId: gs.id, tokenId: goblin.id, col: 7, row: 1 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.col).toBe(7)
  expect(token.row).toBe(1)

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.col).toBe(7)
  expect(inDb.row).toBe(1)

  for (const [event, wer] of [
    [await beimSl, 'Spielleiter'],
    [await beimSpieler, 'Spieler'],
  ] as const) {
    const tokens = tokensOf(event, `session:tokens beim ${wer}`)
    const goblinEvent = must(
      tokens.find((t) => t.name === 'Goblin'),
      `Goblin in session:tokens beim ${wer}`,
    )
    expect(goblinEvent.col).toBe(7)
    expect(goblinEvent.row).toBe(1)
  }
})

test('Spieler bewegt sein eigenes Token', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sp.userId })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenMove(spSocket, { sessionId: gs.id, tokenId: goblin.id, col: 7, row: 1 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.col).toBe(7)
  expect(token.row).toBe(1)
  expect(token.ownerId).toBe(sp.userId)

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.col).toBe(7)
  expect(inDb.row).toBe(1)

  for (const [event, wer] of [
    [await beimSl, 'Spielleiter'],
    [await beimSpieler, 'Spieler'],
  ] as const) {
    const tokens = tokensOf(event, `session:tokens beim ${wer}`)
    const goblinEvent = must(
      tokens.find((t) => t.name === 'Goblin'),
      `Goblin in session:tokens beim ${wer}`,
    )
    expect(goblinEvent.col).toBe(7)
    expect(goblinEvent.row).toBe(1)
  }
})

test('Spieler darf kein Token bewegen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  let spTokens = false
  spSocket.on('session:tokens', () => {
    spTokens = true
  })
  const ack = await tokenMove(spSocket, { sessionId: gs.id, tokenId: goblin.id, col: 7, row: 1 })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe('Dieses Token darfst du nicht bewegen.')
  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.col).toBe(3)
  expect(inDb.row).toBe(4)
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(spTokens).toBe(false)
})

test('Spieler darf ein fremdes Token nicht bewegen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const tom = await registerUser(app, 'tom@example.com', 'tom')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  await addMembership(gs.id, tom.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 5, row: 5, ownerId: tom.userId })

  const samSocket = client(sam.sid)
  await connect(samSocket)
  await enter(samSocket, gs.id)

  const ack = await tokenMove(samSocket, { sessionId: gs.id, tokenId: ork.id, col: 7, row: 1 })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe('Dieses Token darfst du nicht bewegen.')
  const inDb = must(await tokenRowById(ork.id), 'die Token-Zeile Ork')
  expect(inDb.col).toBe(5)
  expect(inDb.row).toBe(5)
})

test('Entzogene Zuweisung wirkt mit der nächsten Bewegung', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sp.userId })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  // GIVEN: sam bewegt Goblin ueber diese Verbindung bereits erfolgreich nach (7, 1).
  const ersteAck = await tokenMove(spSocket, { sessionId: gs.id, tokenId: goblin.id, col: 7, row: 1 })
  expect(ersteAck.ok).toBe(true)

  // WHEN: der Spielleiter nimmt die Zuweisung zurueck, dann bewegt sam ueber dieselbe Verbindung erneut.
  const assignAck = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: null })
  expect(assignAck.ok).toBe(true)
  const zweiteAck = await tokenMove(spSocket, { sessionId: gs.id, tokenId: goblin.id, col: 8, row: 2 })

  expect(zweiteAck.ok).toBe(false)
  expect(zweiteAck.message).toBe('Dieses Token darfst du nicht bewegen.')
  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.col).toBe(7)
  expect(inDb.row).toBe(1)
})

test('Unbekanntes, fremdes und nicht aktives Token sind nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const a = await createGameSession({ name: 'A', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', status: 'geoeffnet' })
  await addMembership(a.id, sl.userId, 'spielleiter')
  await addMembership(b.id, sl.userId, 'spielleiter')

  const karte1 = await makeMap(sl.userId, 'Erste', { image: true })
  const karte2 = await makeMap(sl.userId, 'Zweite', { image: true })
  const aktivA = await mountDirect(a.id, karte1.id)
  const nichtAktivA = await mountDirect(a.id, karte2.id)
  await setActive(a.id, aktivA.id)
  const verborgen = await createTokenDirect(nichtAktivA.id, { name: 'Verborgen', col: 0, row: 0 })

  const karteB = await makeMap(sl.userId, 'B-Karte', { image: true })
  const aktivB = await mountDirect(b.id, karteB.id)
  await setActive(b.id, aktivB.id)
  const fremd = await createTokenDirect(aktivB.id, { name: 'Fremd', col: 2, row: 2 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, a.id)

  const unbekanntAck = await tokenMove(slSocket, { sessionId: a.id, tokenId: 'unbekannt', col: 5, row: 5 })
  const fremdAck = await tokenMove(slSocket, { sessionId: a.id, tokenId: fremd.id, col: 5, row: 5 })
  const verborgenAck = await tokenMove(slSocket, { sessionId: a.id, tokenId: verborgen.id, col: 5, row: 5 })

  expect(unbekanntAck.ok).toBe(false)
  expect(fremdAck.ok).toBe(false)
  expect(verborgenAck.ok).toBe(false)
  expect(typeof unbekanntAck.message).toBe('string')
  expect(fremdAck.message).toBe(unbekanntAck.message)
  expect(verborgenAck.message).toBe(unbekanntAck.message)

  const fremdInDb = must(await tokenRowById(fremd.id), 'Fremd')
  expect(fremdInDb.col).toBe(2)
  expect(fremdInDb.row).toBe(2)
  const verborgenInDb = must(await tokenRowById(verborgen.id), 'Verborgen')
  expect(verborgenInDb.col).toBe(0)
  expect(verborgenInDb.row).toBe(0)
})

// --- Token zuweisen -------------------------------------------------------------------------

test('Spielleiter weist ein Token zu', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: sp.userId })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.ownerId).toBe(sp.userId)

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.ownerId).toBe(sp.userId)

  for (const [event, wer] of [
    [await beimSl, 'Spielleiter'],
    [await beimSpieler, 'Spieler'],
  ] as const) {
    const tokens = tokensOf(event, `session:tokens beim ${wer}`)
    const goblinEvent = must(
      tokens.find((t) => t.name === 'Goblin'),
      `Goblin in session:tokens beim ${wer}`,
    )
    expect(goblinEvent.ownerId).toBe(sp.userId)
  }
})

test('Spielleiter nimmt eine Zuweisung zurück', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sp.userId })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: null })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.ownerId).toBeNull()

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.ownerId).toBeNull()

  const tokens = tokensOf(await beimSpieler, 'session:tokens beim Spieler')
  const goblinEvent = must(tokens.find((t) => t.name === 'Goblin'), 'Goblin beim Spieler')
  expect(goblinEvent.ownerId).toBeNull()
})

test('Spielleiter übergibt ein Token an einen anderen Spieler', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const tom = await registerUser(app, 'tom@example.com', 'tom')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  await addMembership(gs.id, tom.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sam.userId })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: tom.userId })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.ownerId).toBe(tom.userId)

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.ownerId).toBe(tom.userId)
})

test('Nur Spieler-Mitglieder kommen als Besitzer in Frage', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const fremd = await registerUser(app, 'fremd@example.com', 'fremd')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  let slTokens = false
  slSocket.on('session:tokens', () => {
    slTokens = true
  })
  const fremdAck = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: fremd.userId })
  const selbstAck = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: sl.userId })

  expect(fremdAck.ok).toBe(false)
  expect(fremdAck.message).toBe('Spieler nicht gefunden.')
  expect(selbstAck.ok).toBe(false)
  expect(selbstAck.message).toBe('Spieler nicht gefunden.')

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.ownerId).toBeNull()
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(slTokens).toBe(false)
})

test('Spieler darf nicht zuweisen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await tokenAssign(spSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: sp.userId })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.ownerId).toBeNull()
})

test('Unbekanntes und nicht aktives Token sind beim Zuweisen nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte1 = await makeMap(sl.userId, 'Erste', { image: true })
  const karte2 = await makeMap(sl.userId, 'Zweite', { image: true })
  const aktiv = await mountDirect(gs.id, karte1.id)
  const nichtAktiv = await mountDirect(gs.id, karte2.id)
  await setActive(gs.id, aktiv.id)
  const verborgen = await createTokenDirect(nichtAktiv.id, { name: 'Verborgen', col: 0, row: 0 })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const unbekanntAck = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: 'unbekannt', ownerId: sp.userId })
  const verborgenAck = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: verborgen.id, ownerId: sp.userId })

  expect(unbekanntAck.ok).toBe(false)
  expect(verborgenAck.ok).toBe(false)
  expect(typeof unbekanntAck.message).toBe('string')
  expect(verborgenAck.message).toBe(unbekanntAck.message)

  const inDb = must(await tokenRowById(verborgen.id), 'Verborgen')
  expect(inDb.ownerId).toBeNull()
})

// --- Token entfernen ------------------------------------------------------------------------

test('Spielleiter entfernt ein Token', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 1, row: 1 })
  await createTokenDirect(instanz.id, { name: 'Ork', col: 2, row: 2 })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenRemove(slSocket, { sessionId: gs.id, tokenId: goblin.id })

  expect(ack.ok).toBe(true)
  expect(await tokenRowById(goblin.id)).toBeNull()

  for (const [event, wer] of [
    [await beimSl, 'Spielleiter'],
    [await beimSpieler, 'Spieler'],
  ] as const) {
    const tokens = tokensOf(event, `session:tokens beim ${wer}`)
    expect(tokens.length).toBe(1)
    expect(tokens[0].name).toBe('Ork')
  }
})

test('Spieler darf kein Token entfernen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 1, row: 1 })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await tokenRemove(spSocket, { sessionId: gs.id, tokenId: goblin.id })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await tokenRowById(goblin.id)).not.toBeNull()
})

// --- Tokenbestand beim Betreten und Kartenwechsel -------------------------------------------

test('Betreten liefert den Tokenbestand', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, { name: 'Held', col: 1, row: 1 })
  await createTokenDirect(instanz.id, { name: 'Ork', col: 2, row: 2 })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  const ack = await enter(spSocket, gs.id)

  expect(ack.ok).toBe(true)
  const tokens = tokensOf(ack, 'tokens im Enter-Acknowledgement')
  expect(tokens.length).toBe(2)
  expect(tokens.map((t) => t.name).sort()).toEqual(['Held', 'Ork'])
})

test('Betreten ohne aktive Karte liefert einen leeren Bestand', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sp.userId, 'spieler')

  const spSocket = client(sp.sid)
  await connect(spSocket)
  const ack = await enter(spSocket, gs.id)

  expect(ack.ok).toBe(true)
  expect('tokens' in ack).toBe(true)
  expect(tokensOf(ack, 'tokens im Enter-Acknowledgement')).toEqual([])
})

test('Kartenwechsel liefert den Bestand der neuen Karte', async () => {
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
  await createTokenDirect(tavInstanz.id, { name: 'Wirt', col: 1, row: 1 })
  await createTokenDirect(kelInstanz.id, { name: 'Ratte', col: 2, row: 2 })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const nachKeller = once(spSocket, 'session:tokens')
  await activateMap(slSocket, { sessionId: gs.id, instanceId: kelInstanz.id })
  const kellerTokens = tokensOf(await nachKeller, 'session:tokens nach Wechsel auf Keller')
  expect(kellerTokens.length).toBe(1)
  expect(kellerTokens[0].name).toBe('Ratte')

  const nachTaverne = once(spSocket, 'session:tokens')
  await activateMap(slSocket, { sessionId: gs.id, instanceId: tavInstanz.id })
  const taverneTokens = tokensOf(await nachTaverne, 'session:tokens nach Wechsel auf Taverne')
  expect(taverneTokens.length).toBe(1)
  expect(taverneTokens[0].name).toBe('Wirt')
})

test('Zurücksetzen liefert einen leeren Bestand', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 1, row: 1 })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, 'session:tokens')
  await activateMap(slSocket, { sessionId: gs.id, instanceId: null })

  const tokens = tokensOf(await beimSpieler, 'session:tokens nach Zuruecksetzen')
  expect(tokens).toEqual([])
  expect(await tokenRowById(goblin.id)).not.toBeNull()
})

test('Aushängen löscht die Tokens der Instanz', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await createTokenDirect(instanz.id, { name: 'Goblin', col: 1, row: 1 })

  const res = (await app.inject({ method: 'DELETE', url: `/api/sessions/${gs.id}/maps/${instanz.id}`, cookies: { sid: sl.sid } })) as unknown as InjectRes

  expect(res.statusCode).toBe(204)
  expect(await db().token.count({ where: { instanceId: instanz.id } })).toBe(0)
})

test('Tokens überstehen einen Serverneustart', async () => {
  const app1 = await startApp()
  const sl = await registerUser(app1, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)

  // GIVEN: das Token wird ueber die erste App-Instanz angelegt.
  const slSocket1 = client(sl.sid)
  await connect(slSocket1)
  await enter(slSocket1, gs.id)
  const createAck = await tokenCreate(slSocket1, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: null, size: 1, col: 0, row: 0 })
  expect(createAck.ok).toBe(true)

  // Erste App-Instanz beenden.
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
  const tokens = tokensOf(ack, 'tokens im Enter-Acknowledgement der zweiten App')
  expect(tokens.length).toBe(1)
  expect(tokens[0].name).toBe('Goblin')
})

// ============================================================================================
// Delta add-token-stats (#61): Integrationstests zu
// openspec/changes/add-token-stats/specs/session-token/spec.md (tasks.md 1.1). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname: die 8 Szenarien
// "Tokenwerte setzen", 5 "Markierungen setzen", 6 "Sichtbarkeit der Tokenwerte". Aufbau wie
// oben (echte Socket.IO-Clients, Routen, direkte DB-Anlage; `createTokenDirect` um Werte und
// `conditions` erweitert). Sichtbarkeits-Szenarien lesen `session:tokens` beider Verbindungen
// und zaehlen sie je Verbindung. "erhaelt kein session:tokens" ist eine kurze Wartezeit ohne
// Ereignis.
//
// Rote Phase (constitution.md §3.1): die Ereignisse `session:token-stats`/
// `session:token-conditions` sind unbekannt (kein Ack -> Timeout); die fuenf Wertespalten und
// die Tabelle `TokenCondition` kennt Prisma bis zur Migration (2.1) nicht, weshalb ein GIVEN,
// das Werte/Markierungen direkt anlegt oder liest, am Datenbankzugriff scheitert
// ("Unknown argument hp" bzw. "tokenCondition"); bei den Sichtbarkeits-Szenarien fehlt die
// Filterung, sodass ein Spieler Werte statt `null` erhielte. Prisma-Typfehler beim
// Rot-Bestaetigen sind der erwartete Grund, kein Setup-/Tippfehler.

// --- Tokenwerte setzen ----------------------------------------------------------------------

test('Spielleiter setzt Trefferpunkte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const ack = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hp: 23, hpMax: 40 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.hp).toBe(23)
  expect(token.hpMax).toBe(40)
  expect(token.tempHp).toBeNull()
  expect(token.ac).toBeNull()
  expect(token.initiative).toBeNull()

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.hp).toBe(23)
  expect(inDb.hpMax).toBe(40)

  const tokens = tokensOf(await beimSl, 'session:tokens beim Spielleiter')
  const goblinEvent = must(tokens.find((t) => t.name === 'Goblin'), 'Goblin beim Spielleiter')
  expect(goblinEvent.hp).toBe(23)
  expect(goblinEvent.hpMax).toBe(40)
})

test('Teilobjekt lässt nicht genannte Werte stehen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, hp: 23, hpMax: 40 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, ac: 16, initiative: -2 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.hp).toBe(23)
  expect(token.hpMax).toBe(40)
  expect(token.ac).toBe(16)
  expect(token.initiative).toBe(-2)

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.hp).toBe(23)
  expect(inDb.hpMax).toBe(40)
  expect(inDb.ac).toBe(16)
  expect(inDb.initiative).toBe(-2)
})

test('Werte löschen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, hp: 23, hpMax: 40, tempHp: 5 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hp: null, hpMax: null, tempHp: null })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.hp).toBeNull()
  expect(token.hpMax).toBeNull()
  expect(token.tempHp).toBeNull()

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.hp).toBeNull()
  expect(inDb.hpMax).toBeNull()
  expect(inDb.tempHp).toBeNull()
})

test('Trefferpunkte und Maximum nur gemeinsam und in Ordnung', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, hp: 23, hpMax: 40 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  let slTokens = false
  slSocket.on('session:tokens', () => {
    slTokens = true
  })
  const nurMax = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hpMax: 10 })
  const zuHoch = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hp: 41 })
  const maxWeg = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hpMax: null })

  for (const ack of [nurMax, zuHoch, maxWeg]) {
    expect(ack.ok).toBe(false)
    expect(ack.message).toBe('Ungültige Trefferpunkte.')
  }

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.hp).toBe(23)
  expect(inDb.hpMax).toBe(40)
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(slTokens).toBe(false)
})

test('Ungültige Werte werden abgelehnt', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const negativHp = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hp: -1, hpMax: 10 })
  const nullMax = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, hp: 0, hpMax: 0 })
  const negativTemp = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, tempHp: -1 })
  const kommaAc = await tokenStats(slSocket, { sessionId: gs.id, tokenId: goblin.id, ac: 1.5 })

  for (const ack of [negativHp, nullMax, negativTemp, kommaAc]) {
    expect(ack.ok).toBe(false)
    expect(ack.message).toBe('Ungültige Anfrage.')
  }

  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.hp).toBeNull()
  expect(inDb.hpMax).toBeNull()
  expect(inDb.tempHp).toBeNull()
  expect(inDb.ac).toBeNull()
  expect(inDb.initiative).toBeNull()
})

test('Spieler darf keine Werte setzen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sp.userId })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  let spTokens = false
  spSocket.on('session:tokens', () => {
    spTokens = true
  })
  const ack = await tokenStats(spSocket, { sessionId: gs.id, tokenId: goblin.id, hp: 23, hpMax: 40 })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  const inDb = must(await tokenRowById(goblin.id), 'die Token-Zeile')
  expect(inDb.hp).toBeNull()
  expect(inDb.hpMax).toBeNull()
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(spTokens).toBe(false)
})

test('Unbekanntes und nicht aktives Token sind beim Setzen nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte1 = await makeMap(sl.userId, 'Erste', { image: true })
  const karte2 = await makeMap(sl.userId, 'Zweite', { image: true })
  const aktiv = await mountDirect(gs.id, karte1.id)
  const nichtAktiv = await mountDirect(gs.id, karte2.id)
  await setActive(gs.id, aktiv.id)
  const verborgen = await createTokenDirect(nichtAktiv.id, { name: 'Verborgen', col: 0, row: 0 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const unbekanntAck = await tokenStats(slSocket, { sessionId: gs.id, tokenId: 'unbekannt', hp: 5, hpMax: 5 })
  const verborgenAck = await tokenStats(slSocket, { sessionId: gs.id, tokenId: verborgen.id, hp: 5, hpMax: 5 })

  expect(unbekanntAck.ok).toBe(false)
  expect(verborgenAck.ok).toBe(false)
  expect(typeof unbekanntAck.message).toBe('string')
  expect(verborgenAck.message).toBe(unbekanntAck.message)

  const inDb = must(await tokenRowById(verborgen.id), 'Verborgen')
  expect(inDb.hp).toBeNull()
})

test('Neu angelegtes Token hat keine Werte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenCreate(slSocket, { sessionId: gs.id, name: 'Goblin', color: '#3366ff', icon: null, size: 1, col: 0, row: 0 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.hp).toBeNull()
  expect(token.hpMax).toBeNull()
  expect(token.tempHp).toBeNull()
  expect(token.ac).toBeNull()
  expect(token.initiative).toBeNull()
  expect(token.conditions).toEqual([])

  const inDb = must(await tokenRowById(String(token.id)), 'die Token-Zeile')
  expect(inDb.hp).toBeNull()
  expect(inDb.hpMax).toBeNull()
  expect(inDb.tempHp).toBeNull()
  expect(inDb.ac).toBeNull()
  expect(inDb.initiative).toBeNull()
})

// --- Markierungen setzen --------------------------------------------------------------------

test('Spielleiter setzt Markierungen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4 })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const ack = await tokenConditions(slSocket, { sessionId: gs.id, tokenId: goblin.id, conditions: ['Liegend', 'Segen'] })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.conditions).toEqual(['Liegend', 'Segen'])

  expect(await conditionLabels(goblin.id)).toEqual(['Liegend', 'Segen'])

  const tokens = tokensOf(await beimSl, 'session:tokens beim Spielleiter')
  const goblinEvent = must(tokens.find((t) => t.name === 'Goblin'), 'Goblin beim Spielleiter')
  expect(goblinEvent.conditions).toEqual(['Liegend', 'Segen'])
})

test('Ersetzen entfernt nicht genannte Markierungen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, conditions: ['Liegend', 'Segen'] })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenConditions(slSocket, { sessionId: gs.id, tokenId: goblin.id, conditions: ['Segen', 'Konzentration'] })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.conditions).toEqual(['Segen', 'Konzentration'])

  expect(await conditionLabels(goblin.id)).toEqual(['Segen', 'Konzentration'])
})

test('Ungültige Markierungen werden abgelehnt', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, conditions: ['Liegend'] })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  let slTokens = false
  slSocket.on('session:tokens', () => {
    slTokens = true
  })
  const leer = await tokenConditions(slSocket, { sessionId: gs.id, tokenId: goblin.id, conditions: ['Liegend', '  '] })
  const zuLang = await tokenConditions(slSocket, { sessionId: gs.id, tokenId: goblin.id, conditions: ['Liegend', 'x'.repeat(21)] })
  const doppelt = await tokenConditions(slSocket, { sessionId: gs.id, tokenId: goblin.id, conditions: ['Liegend', 'Liegend'] })
  const zuViele = await tokenConditions(slSocket, {
    sessionId: gs.id,
    tokenId: goblin.id,
    conditions: Array.from({ length: 13 }, (_, i) => `M${i}`),
  })

  for (const ack of [leer, zuLang, doppelt, zuViele]) {
    expect(ack.ok).toBe(false)
    expect(ack.message).toBe('Ungültige Anfrage.')
  }

  expect(await conditionLabels(goblin.id)).toEqual(['Liegend'])
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(slTokens).toBe(false)
})

test('Spieler darf keine Markierungen setzen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sp.userId })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await tokenConditions(spSocket, { sessionId: gs.id, tokenId: goblin.id, conditions: ['Unsichtbar'] })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await conditionCount(goblin.id)).toBe(0)
})

test('Entfernen nimmt die Markierungen mit', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, conditions: ['Liegend', 'Segen'] })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await tokenRemove(slSocket, { sessionId: gs.id, tokenId: goblin.id })

  expect(ack.ok).toBe(true)
  expect(await conditionCount(goblin.id)).toBe(0)
})

// --- Sichtbarkeit der Tokenwerte ------------------------------------------------------------

test('Spielleiter erhält beim Betreten alle Werte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, { name: 'Ork', col: 5, row: 5, ownerId: null, hp: 30, hpMax: 30, ac: 13, conditions: ['Liegend'] })

  const slSocket = client(sl.sid)
  await connect(slSocket)
  const ack = await enter(slSocket, gs.id)

  expect(ack.ok).toBe(true)
  const tokens = tokensOf(ack, 'tokens im Enter-Acknowledgement')
  const ork = must(tokens.find((t) => t.name === 'Ork'), 'Ork im Enter-Acknowledgement')
  expect(ork.hp).toBe(30)
  expect(ork.hpMax).toBe(30)
  expect(ork.ac).toBe(13)
  expect(ork.conditions).toEqual(['Liegend'])
})

test('Besitzer erhält die Werte seines Tokens', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, {
    name: 'Goblin',
    col: 3,
    row: 4,
    ownerId: sp.userId,
    hp: 23,
    hpMax: 40,
    tempHp: 5,
    ac: 16,
    initiative: 12,
    conditions: ['Segen'],
  })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  const ack = await enter(spSocket, gs.id)

  expect(ack.ok).toBe(true)
  const tokens = tokensOf(ack, 'tokens im Enter-Acknowledgement')
  const goblin = must(tokens.find((t) => t.name === 'Goblin'), 'Goblin im Enter-Acknowledgement')
  expect(goblin.hp).toBe(23)
  expect(goblin.hpMax).toBe(40)
  expect(goblin.tempHp).toBe(5)
  expect(goblin.ac).toBe(16)
  expect(goblin.initiative).toBe(12)
  expect(goblin.conditions).toEqual(['Segen'])
})

test('Spieler erhält von fremden Tokens keine Werte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const tom = await registerUser(app, 'tom@example.com', 'tom')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  await addMembership(gs.id, tom.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, {
    name: 'Ork',
    color: '#aa2222',
    icon: null,
    size: 1,
    col: 5,
    row: 5,
    ownerId: null,
    hp: 30,
    hpMax: 30,
    tempHp: 3,
    ac: 13,
    initiative: 8,
    conditions: ['Liegend'],
  })
  await createTokenDirect(instanz.id, { name: 'Elf', col: 2, row: 2, ownerId: tom.userId, hp: 12, hpMax: 12 })

  const samSocket = client(sam.sid)
  await connect(samSocket)
  const ack = await enter(samSocket, gs.id)

  expect(ack.ok).toBe(true)
  const tokens = tokensOf(ack, 'tokens im Enter-Acknowledgement')
  const ork = must(tokens.find((t) => t.name === 'Ork'), 'Ork im Enter-Acknowledgement')
  const elf = must(tokens.find((t) => t.name === 'Elf'), 'Elf im Enter-Acknowledgement')

  for (const t of [ork, elf]) {
    expect(t.hp).toBeNull()
    expect(t.hpMax).toBeNull()
    expect(t.tempHp).toBeNull()
    expect(t.ac).toBeNull()
    expect(t.initiative).toBeNull()
    expect(t.conditions).toEqual([])
  }

  // Die uebrigen Felder bleiben ungefiltert (spec.md "Sichtbarkeit der Tokenwerte").
  expect(ork.color).toBe('#aa2222')
  expect(ork.icon).toBeNull()
  expect(ork.size).toBe(1)
  expect(ork.col).toBe(5)
  expect(ork.row).toBe(5)
  expect(ork.ownerId).toBeNull()
  expect(elf.ownerId).toBe(tom.userId)
})

test('Derselbe Bestand erreicht Spielleiter und Spieler unterschiedlich', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 5, row: 5, ownerId: null })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const slEvents = collect(slSocket, 'session:tokens')
  const spEvents = collect(spSocket, 'session:tokens')

  const statsAck = await tokenStats(slSocket, { sessionId: gs.id, tokenId: ork.id, hp: 30, hpMax: 30 })
  expect(statsAck.ok).toBe(true)
  const condAck = await tokenConditions(slSocket, { sessionId: gs.id, tokenId: ork.id, conditions: ['Liegend'] })
  expect(condAck.ok).toBe(true)

  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))

  expect(slEvents.length).toBe(2)
  expect(spEvents.length).toBe(2)

  const slZweite = tokensOf(slEvents[1], 'zweites session:tokens beim Spielleiter')
  const slOrk = must(slZweite.find((t) => t.name === 'Ork'), 'Ork beim Spielleiter (2.)')
  expect(slOrk.hp).toBe(30)
  expect(slOrk.hpMax).toBe(30)
  expect(slOrk.conditions).toEqual(['Liegend'])

  for (const ev of spEvents) {
    const t = must(tokensOf(ev, 'session:tokens beim Spieler').find((x) => x.name === 'Ork'), 'Ork beim Spieler')
    expect(t.hp).toBeNull()
    expect(t.hpMax).toBeNull()
    expect(t.conditions).toEqual([])
  }
})

test('Zuweisung macht die Werte für den Besitzer sichtbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: null, hp: 23, hpMax: 40, conditions: ['Segen'] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: sp.userId })
  expect(ack.ok).toBe(true)

  const tokens = tokensOf(await beimSpieler, 'session:tokens beim Spieler')
  const goblinEvent = must(tokens.find((t) => t.name === 'Goblin'), 'Goblin beim Spieler')
  expect(goblinEvent.ownerId).toBe(sp.userId)
  expect(goblinEvent.hp).toBe(23)
  expect(goblinEvent.hpMax).toBe(40)
  expect(goblinEvent.conditions).toEqual(['Segen'])
})

test('Entzogene Zuweisung verbirgt die Werte mit dem nächsten Bestand', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const goblin = await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sp.userId, hp: 23, hpMax: 40, conditions: ['Segen'] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, 'session:tokens')
  const beimSpieler = once(spSocket, 'session:tokens')
  const ack = await tokenAssign(slSocket, { sessionId: gs.id, tokenId: goblin.id, ownerId: null })
  expect(ack.ok).toBe(true)

  const spTokens = tokensOf(await beimSpieler, 'session:tokens beim Spieler')
  const spGoblin = must(spTokens.find((t) => t.name === 'Goblin'), 'Goblin beim Spieler')
  expect(spGoblin.ownerId).toBeNull()
  expect(spGoblin.hp).toBeNull()
  expect(spGoblin.hpMax).toBeNull()
  expect(spGoblin.conditions).toEqual([])

  const slTokens = tokensOf(await beimSl, 'session:tokens beim Spielleiter')
  const slGoblin = must(slTokens.find((t) => t.name === 'Goblin'), 'Goblin beim Spielleiter')
  expect(slGoblin.hp).toBe(23)
  expect(slGoblin.hpMax).toBe(40)
  expect(slGoblin.conditions).toEqual(['Segen'])
})
