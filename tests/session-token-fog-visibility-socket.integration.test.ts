// Integrationstests zu openspec/changes/add-token-fog-visibility/specs/session-token/spec.md
// (tasks.md 1.1 und 1.2). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1),
// Testname = Szenarioname.
//
// Enthalten: die 12 Szenarien der neuen Requirement "Sichtbarkeit von Tokens im Fog" sowie die
// zwei neuen Szenarien "Verborgenes Token ist beim Bewegen nicht unterscheidbar" (Requirement
// "Token bewegen") und "Verborgenes Token ist beim Teilen nicht unterscheidbar" (Requirement
// "Zielgruppe eines Tokenwerts setzen").
//
// Aufbau wie in session-token-socket.integration.test.ts und session-fog-socket.integration.test.ts
// (design.md D6): die App lauscht auf Port 0, ein `socket.io-client` verbindet mit dem
// Sitzungscookie in `extraHeaders`, `reconnection: false`. GIVEN-Zustaende (Spielsitzung,
// Mitgliedschaften, Karte, Instanz, aktive Instanz, Tokens samt Besitzer/Werten/Markierungen,
// Zielgruppen) werden direkt in der DB geschrieben; aufgedeckte Zellen als `FogCell`-Zeilen
// (`revealDirect`). Der Einhaenge-Helfer `mountDirect` deckt hier **keine** Zellen auf — die
// verdeckten Szenarien setzen den Fog-Zustand gezielt. Das Hex-Szenario nutzt eine Karte mit
// Rastertyp `hex-spitz`. Die Reihenfolge "session:fog vor session:tokens" wird ueber eine
// Ereignisliste je Client geprueft (`recordEvents`), "erhaelt kein session:tokens" als kurze
// Wartezeit ohne Ereignis, "das letzte session:tokens" ueber die aufzeichnende Liste. Gegen die
// Suite-eigene Wegwerf-DB (`session-token-fog-visibility-socket.test.db`, constitution.md §4.3).
//
// Rote Phase (constitution.md §3.1): heute erhaelt ein Spieler jedes Token der aktiven Karte
// (keine Existenzfilterung) — die Enter-Acks/session:tokens tragen darum das verborgene Token
// statt einer leeren Liste. Nach `session:fog-set` folgt heute **kein** `session:tokens`, weshalb
// die Ereignisliste [session:fog] statt [session:fog, session:tokens] enthaelt. Und ein Spieler,
// der ein verborgenes, besitzerloses Token bewegen/teilen will, erhaelt heute
// `Dieses Token darfst du nicht bewegen.`/`… teilen.` statt der ununterscheidbaren Meldung
// `Token nicht gefunden.`. Das sind die erwarteten roten Gruende, kein Setup-/Tippfehler. Die
// Fog-Modelle (`FogCell`) und `Token.ownerId`/`TokenShare` sind seit #16/#15/#62 migriert.

import { PrismaClient } from '@prisma/client'
import { io, type Socket } from 'socket.io-client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
const WAIT_MS = 5000
const ACK_MS = 3000
const QUIET_MS = 800

const EV_MAP = 'session:map'
const EV_FOG = 'session:fog'
const EV_TOKENS = 'session:tokens'

const MSG_NICHT_GEFUNDEN = 'Token nicht gefunden.'

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
const openSockets: Socket[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die Tabellen ---------------------------------------------------------------
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
    deleteMany(): Promise<unknown>
  }
  tokenCondition: {
    create(args: { data: { tokenId: string; label: string; position: number } }): Promise<unknown>
    deleteMany(): Promise<unknown>
  }
  tokenShare: {
    create(args: { data: { tokenId: string; stat: string; userId: string | null } }): Promise<TokenShareRow>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
  fogCell: {
    create(args: { data: { instanceId: string; col: number; row: number } }): Promise<unknown>
    deleteMany(): Promise<unknown>
  }
  fogArea: {
    findFirst(args: { where: Record<string, unknown> }): Promise<FogAreaRow | null>
    deleteMany(): Promise<unknown>
  }
  fogAreaCell: {
    deleteMany(): Promise<unknown>
  }
}
const db = (): GameDb => prisma as unknown as GameDb

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

function tokensOf(event: unknown, what: string): Array<Record<string, unknown>> {
  const e = rec(event, what)
  if (!Array.isArray(e.tokens)) throw new Error(`Erwartet eine tokens-Liste: ${what}`)
  return e.tokens as Array<Record<string, unknown>>
}

function fogOf(container: Record<string, unknown>, what: string): Record<string, unknown> {
  return rec(container.fog, what)
}
function revealedOf(fog: Record<string, unknown>): CellT[] {
  if (!Array.isArray(fog.revealed)) throw new Error('fog.revealed ist keine Liste')
  return fog.revealed as CellT[]
}

/** Findet ein Token nach Name in einer session:tokens-/Ack-Liste. */
function tokenNamed(tokens: Array<Record<string, unknown>>, name: string): Record<string, unknown> {
  return must(
    tokens.find((t) => t.name === name),
    `Token "${name}" in der Liste`,
  )
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

/** Zeichnet die Reihenfolge relevanter Server-Ereignisse einer Verbindung auf (design.md D6). */
function recordEvents(socket: Socket): Array<{ name: string; payload: Record<string, unknown> }> {
  const log: Array<{ name: string; payload: Record<string, unknown> }> = []
  socket.onAny((name: string, payload: unknown) => {
    if (name === EV_MAP || name === EV_FOG || name === EV_TOKENS) {
      log.push({ name, payload: (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown> })
    }
  })
  return log
}
function namesOf(log: Array<{ name: string; payload: Record<string, unknown> }>): string[] {
  return log.map((e) => e.name)
}
function tokenEventsOf(log: Array<{ name: string; payload: Record<string, unknown> }>): Array<Record<string, unknown>> {
  return log.filter((e) => e.name === EV_TOKENS).map((e) => e.payload)
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
function fogAreaCreate(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:fog-area-create', payload)
}
function tokenMove(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-move', payload)
}
function tokenShare(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:token-share', payload)
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
  return `TF${alphabet[codeZaehler % alphabet.length]}${zahl}`
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
/** Haengt eine Karte ein — ohne Fog-Zustand: die verdeckten Szenarien setzen ihn gezielt. */
async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}
async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

type ShareAudienceSetup = Partial<Record<'hp' | 'tempHp' | 'ac' | 'initiative' | 'conditions', 'alle' | string[]>>

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
      name: fields.name ?? 'Ork',
      color: fields.color ?? '#aa2222',
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
  if (fields.conditions) {
    for (let position = 0; position < fields.conditions.length; position += 1) {
      await db().tokenCondition.create({ data: { tokenId: token.id, label: fields.conditions[position], position } })
    }
  }
  return token
}

/** Legt Zielgruppen als TokenShare-Zeilen an: `'alle'` -> eine Zeile mit `userId` null; eine Liste
 * -> eine Zeile je `userId` (design.md D6). */
async function setShareRows(tokenId: string, shares: ShareAudienceSetup): Promise<void> {
  for (const [stat, audience] of Object.entries(shares)) {
    if (audience === 'alle') {
      await db().tokenShare.create({ data: { tokenId, stat, userId: null } })
    } else if (Array.isArray(audience)) {
      for (const userId of audience) {
        await db().tokenShare.create({ data: { tokenId, stat, userId } })
      }
    }
  }
}

/** Deckt Zellen direkt auf (FogCell-Zeilen, GIVEN-Zustand). */
async function revealDirect(instanceId: string, cells: CellT[]): Promise<void> {
  for (const c of cells) await db().fogCell.create({ data: { instanceId, col: c.col, row: c.row } })
}
async function tokenRowById(id: string): Promise<TokenRow | null> {
  return db().token.findUnique({ where: { id } })
}
async function shareRowCount(tokenId: string): Promise<number> {
  return db().tokenShare.count({ where: { tokenId } })
}
function wait(ms = QUIET_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-token-fog-visibility-socket'))
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
  if (c.fogAreaCell) await c.fogAreaCell.deleteMany()
  if (c.fogArea) await c.fogArea.deleteMany()
  if (c.fogCell) await c.fogCell.deleteMany()
  if (c.tokenShare) await c.tokenShare.deleteMany()
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

// ============================================================================================
// Requirement: Sichtbarkeit von Tokens im Fog (12 Szenarien)
// ============================================================================================

test('Besitzerloses Token im Fog erreicht den Spieler nicht', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  const slAck = await enter(slSocket, gs.id)
  const samAck = await enter(samSocket, gs.id)

  const slTokens = tokensOf(slAck, 'tokens im Enter-Acknowledgement des Spielleiters')
  expect(slTokens.length).toBe(1)
  const slOrk = tokenNamed(slTokens, 'Ork')
  expect(slOrk.col).toBe(3)
  expect(slOrk.row).toBe(4)

  expect(tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')).toEqual([])
})

test('Aufdecken lässt das Token erscheinen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)
  await enter(samSocket, gs.id)

  const slLog = recordEvents(slSocket)
  const samLog = recordEvents(samSocket)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(3, 4)] } })
  expect(ack.ok).toBe(true)
  await wait()

  // sam: erst session:fog (genau (3,4)), dann session:tokens (genau Ork) — Reihenfolge.
  expect(namesOf(samLog)).toEqual([EV_FOG, EV_TOKENS])
  const samFog = fogOf(samLog[0].payload, 'fog beim Spieler')
  expect(keysOf(revealedOf(samFog))).toEqual(keysOf([C(3, 4)]))
  const samTokens = tokensOf(samLog[1].payload, 'session:tokens beim Spieler')
  expect(samTokens.length).toBe(1)
  const samOrk = tokenNamed(samTokens, 'Ork')
  expect(samOrk.col).toBe(3)
  expect(samOrk.row).toBe(4)
  expect(samOrk.ownerId).toBeNull()
  expect(samOrk.hp).toBeNull()
  expect(samOrk.shares).toBeNull()

  // Spielleiter: session:tokens mit genau Ork.
  const slTokenEvents = tokenEventsOf(slLog)
  expect(slTokenEvents.length).toBeGreaterThanOrEqual(1)
  const slTokens = tokensOf(slTokenEvents[slTokenEvents.length - 1], 'session:tokens beim Spielleiter')
  expect(slTokens.length).toBe(1)
  expect(tokenNamed(slTokens, 'Ork')).toBeDefined()
})

test('Verdecken lässt das Token verschwinden', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(3, 4)])
  await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)
  await enter(samSocket, gs.id)

  const slLog = recordEvents(slSocket)
  const samLog = recordEvents(samSocket)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: false, target: { kind: 'zellen', cells: [C(3, 4)] } })
  expect(ack.ok).toBe(true)
  await wait()

  const samTokenEvents = tokenEventsOf(samLog)
  expect(samTokenEvents.length).toBeGreaterThanOrEqual(1)
  expect(tokensOf(samTokenEvents[samTokenEvents.length - 1], 'session:tokens beim Spieler')).toEqual([])

  const slTokenEvents = tokenEventsOf(slLog)
  expect(slTokenEvents.length).toBeGreaterThanOrEqual(1)
  const slTokens = tokensOf(slTokenEvents[slTokenEvents.length - 1], 'session:tokens beim Spielleiter')
  expect(slTokens.length).toBe(1)
  expect(tokenNamed(slTokens, 'Ork')).toBeDefined()
})

test('Alles verdecken lässt nur die Tokens mit Besitzer stehen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(3, 4), C(5, 5)])
  await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })
  await createTokenDirect(instanz.id, { name: 'Goblin', col: 5, row: 5, ownerId: sam.userId })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)
  await enter(samSocket, gs.id)

  const slLog = recordEvents(slSocket)
  const samLog = recordEvents(samSocket)
  const ack = await fogSet(slSocket, { sessionId: gs.id, revealed: false, target: { kind: 'alle' } })
  expect(ack.ok).toBe(true)
  await wait()

  const samTokenEvents = tokenEventsOf(samLog)
  expect(samTokenEvents.length).toBeGreaterThanOrEqual(1)
  const samTokens = tokensOf(samTokenEvents[samTokenEvents.length - 1], 'session:tokens beim Spieler')
  expect(samTokens.map((t) => t.name).sort()).toEqual(['Goblin'])

  const slTokenEvents = tokenEventsOf(slLog)
  expect(slTokenEvents.length).toBeGreaterThanOrEqual(1)
  const slTokens = tokensOf(slTokenEvents[slTokenEvents.length - 1], 'session:tokens beim Spielleiter')
  expect(slTokens.map((t) => t.name).sort()).toEqual(['Goblin', 'Ork'])
})

test('Bewegung in den Fog lässt das Token verschwinden', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(3, 4)])
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)
  await enter(samSocket, gs.id)

  const slLog = recordEvents(slSocket)
  const samLog = recordEvents(samSocket)
  const ack = await tokenMove(slSocket, { sessionId: gs.id, tokenId: ork.id, col: 7, row: 1 })

  expect(ack.ok).toBe(true)
  const token = rec(ack.token, 'token im Acknowledgement')
  expect(token.col).toBe(7)
  expect(token.row).toBe(1)
  const inDb = must(await tokenRowById(ork.id), 'die Token-Zeile Ork')
  expect(inDb.col).toBe(7)
  expect(inDb.row).toBe(1)
  await wait()

  const samTokenEvents = tokenEventsOf(samLog)
  expect(samTokenEvents.length).toBeGreaterThanOrEqual(1)
  expect(tokensOf(samTokenEvents[samTokenEvents.length - 1], 'session:tokens beim Spieler')).toEqual([])

  const slTokenEvents = tokenEventsOf(slLog)
  expect(slTokenEvents.length).toBeGreaterThanOrEqual(1)
  const slOrk = tokenNamed(tokensOf(slTokenEvents[slTokenEvents.length - 1], 'session:tokens beim Spielleiter'), 'Ork')
  expect(slOrk.col).toBe(7)
  expect(slOrk.row).toBe(1)
})

test('Bewegung aus dem Fog lässt das Token erscheinen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(3, 4)])
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 7, row: 1, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)
  // Vorbedingung: das Token steht verborgen in (7,1), sam sieht es beim Betreten nicht.
  const samAck = await enter(samSocket, gs.id)
  expect(tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')).toEqual([])

  const beimSpieler = once(samSocket, EV_TOKENS)
  const ack = await tokenMove(slSocket, { sessionId: gs.id, tokenId: ork.id, col: 3, row: 4 })
  expect(ack.ok).toBe(true)

  const samTokens = tokensOf(await beimSpieler, 'session:tokens beim Spieler nach der Bewegung')
  expect(samTokens.length).toBe(1)
  const samOrk = tokenNamed(samTokens, 'Ork')
  expect(samOrk.col).toBe(3)
  expect(samOrk.row).toBe(4)
})

test('Großes Token ist sichtbar, sobald eine seiner Zellen aufgedeckt ist', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true, grid: { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 } })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(4, 5)])
  await createTokenDirect(instanz.id, { name: 'Ork', size: 2, col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)

  // WHEN: sam betritt (Ork deckt (4,5) ab -> sichtbar), dann Zelle (4,5) verdecken und (5,6) aufdecken.
  const samAck = await enter(samSocket, gs.id)
  const samTokens = tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')
  expect(samTokens.map((t) => t.name)).toEqual(['Ork'])

  const samLog = recordEvents(samSocket)
  await fogSet(slSocket, { sessionId: gs.id, revealed: false, target: { kind: 'zellen', cells: [C(4, 5)] } })
  await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(5, 6)] } })
  await wait()

  const samTokenEvents = tokenEventsOf(samLog)
  expect(samTokenEvents.length).toBeGreaterThanOrEqual(1)
  expect(tokensOf(samTokenEvents[samTokenEvents.length - 1], 'letztes session:tokens beim Spieler')).toEqual([])
})

test('Bei Hex zählt nur die Ankerzelle', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Hoehle', { image: true, grid: { type: 'hex-spitz', size: 70, offsetX: 0, offsetY: 0 } })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await revealDirect(instanz.id, [C(4, 5)])
  await createTokenDirect(instanz.id, { name: 'Ork', size: 2, col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)

  // WHEN: sam betritt (nur (4,5) auf, Ankerzelle (3,4) verdeckt -> unsichtbar), dann (3,4) aufdecken.
  const samAck = await enter(samSocket, gs.id)
  expect(tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')).toEqual([])

  const samLog = recordEvents(samSocket)
  await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(3, 4)] } })
  await wait()

  const samTokenEvents = tokenEventsOf(samLog)
  expect(samTokenEvents.length).toBeGreaterThanOrEqual(1)
  const samTokens = tokensOf(samTokenEvents[samTokenEvents.length - 1], 'session:tokens beim Spieler')
  expect(samTokens.map((t) => t.name)).toEqual(['Ork'])
})

test('Eigenes Token bleibt im Fog sichtbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, { name: 'Goblin', col: 3, row: 4, ownerId: sam.userId, hp: 23, hpMax: 40 })

  const samSocket = client(sam.sid)
  await connect(samSocket)
  const samAck = await enter(samSocket, gs.id)

  const samTokens = tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')
  expect(samTokens.length).toBe(1)
  const goblin = tokenNamed(samTokens, 'Goblin')
  expect(goblin.ownerId).toBe(sam.userId)
  expect(goblin.hp).toBe(23)
  expect(goblin.hpMax).toBe(40)
})

test('Token eines Mitspielers ist unabhängig vom Fog sichtbar', async () => {
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
  await createTokenDirect(instanz.id, { name: 'Elf', col: 3, row: 4, ownerId: tom.userId, hp: 12, hpMax: 12 })

  const samSocket = client(sam.sid)
  await connect(samSocket)
  const samAck = await enter(samSocket, gs.id)

  const samTokens = tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')
  expect(samTokens.length).toBe(1)
  const elf = tokenNamed(samTokens, 'Elf')
  expect(elf.ownerId).toBe(tom.userId)
  expect(elf.col).toBe(3)
  expect(elf.row).toBe(4)
  expect(elf.hp).toBeNull()
  expect(elf.hpMax).toBeNull()
  expect(elf.shares).toBeNull()
})

test('Geteilte Werte eines verborgenen Tokens erreichen den Spieler nicht', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null, hp: 30, hpMax: 30, conditions: ['Liegend'] })
  await setShareRows(ork.id, { hp: 'alle', conditions: [sam.userId] })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)

  // WHEN: sam betritt (Token verborgen -> leere Liste), dann deckt der Spielleiter (3,4) auf.
  const samAck = await enter(samSocket, gs.id)
  expect(tokensOf(samAck, 'tokens im Enter-Acknowledgement von sam')).toEqual([])

  const samLog = recordEvents(samSocket)
  await fogSet(slSocket, { sessionId: gs.id, revealed: true, target: { kind: 'zellen', cells: [C(3, 4)] } })
  await wait()

  const samTokenEvents = tokenEventsOf(samLog)
  expect(samTokenEvents.length).toBeGreaterThanOrEqual(1)
  const samTokens = tokensOf(samTokenEvents[samTokenEvents.length - 1], 'session:tokens beim Spieler')
  expect(samTokens.length).toBe(1)
  const samOrk = tokenNamed(samTokens, 'Ork')
  expect(samOrk.hp).toBe(30)
  expect(samOrk.hpMax).toBe(30)
  expect(samOrk.conditions).toEqual(['Liegend'])
})

test('Bereich anlegen löst keinen Tokenbestand aus', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const slSocket = client(sl.sid)
  const samSocket = client(sam.sid)
  await connect(slSocket)
  await connect(samSocket)
  await enter(slSocket, gs.id)
  await enter(samSocket, gs.id)

  let slTokens = false
  let samTokens = false
  slSocket.on(EV_TOKENS, () => {
    slTokens = true
  })
  samSocket.on(EV_TOKENS, () => {
    samTokens = true
  })

  const beimSpieler = once(samSocket, EV_FOG)
  const ack = await fogAreaCreate(slSocket, { sessionId: gs.id, name: 'Raum 1', cells: [C(3, 4)] })

  expect(ack.ok).toBe(true)
  expect(fogOf(ack, 'fog im Acknowledgement')).toBeDefined()
  const spFog = fogOf(rec(await beimSpieler, 'session:fog beim Spieler'), 'fog')
  expect(spFog.areas).toBeNull()

  await wait()
  expect(samTokens).toBe(false)
  expect(slTokens).toBe(false)
})

// ============================================================================================
// Requirement: Token bewegen — neues Szenario
// ============================================================================================

test('Verborgenes Token ist beim Bewegen nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const samSocket = client(sam.sid)
  await connect(samSocket)
  await enter(samSocket, gs.id)

  let samTokens = false
  samSocket.on(EV_TOKENS, () => {
    samTokens = true
  })

  const orkAck = await tokenMove(samSocket, { sessionId: gs.id, tokenId: ork.id, col: 7, row: 1 })
  const unbekanntAck = await tokenMove(samSocket, { sessionId: gs.id, tokenId: 'unbekannt', col: 7, row: 1 })

  expect(orkAck.ok).toBe(false)
  expect(unbekanntAck.ok).toBe(false)
  expect(orkAck.message).toBe(MSG_NICHT_GEFUNDEN)
  expect(unbekanntAck.message).toBe(orkAck.message)

  const inDb = must(await tokenRowById(ork.id), 'die Token-Zeile Ork')
  expect(inDb.col).toBe(3)
  expect(inDb.row).toBe(4)

  await wait()
  expect(samTokens).toBe(false)
})

// ============================================================================================
// Requirement: Zielgruppe eines Tokenwerts setzen — neues Szenario
// ============================================================================================

test('Verborgenes Token ist beim Teilen nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne', { image: true })
  const instanz = await mountDirect(gs.id, karte.id)
  await setActive(gs.id, instanz.id)
  const ork = await createTokenDirect(instanz.id, { name: 'Ork', col: 3, row: 4, ownerId: null })

  const samSocket = client(sam.sid)
  await connect(samSocket)
  await enter(samSocket, gs.id)

  let samTokens = false
  samSocket.on(EV_TOKENS, () => {
    samTokens = true
  })

  const orkAck = await tokenShare(samSocket, { sessionId: gs.id, tokenId: ork.id, stat: 'hp', audience: 'alle' })
  const unbekanntAck = await tokenShare(samSocket, { sessionId: gs.id, tokenId: 'unbekannt', stat: 'hp', audience: 'alle' })

  expect(orkAck.ok).toBe(false)
  expect(unbekanntAck.ok).toBe(false)
  expect(orkAck.message).toBe(MSG_NICHT_GEFUNDEN)
  expect(unbekanntAck.message).toBe(orkAck.message)

  expect(await shareRowCount(ork.id)).toBe(0)

  await wait()
  expect(samTokens).toBe(false)
})
