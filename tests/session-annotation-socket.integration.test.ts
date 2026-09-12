// Integrationstests zu openspec/changes/add-measure-draw/specs/session-annotation/spec.md
// (tasks.md 1.2 und 1.3). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1),
// Testname = Szenarioname.
//
// Enthalten: die 7 Szenarien "Anmerkung anlegen", die 7 Szenarien "Anmerkung entfernen", die
// Szenarien "Betreten liefert den gefilterten Bestand" und "Kartenwechsel verteilt den Bestand
// der neuen Karte" aus "Anmerkungsbestand beim Betreten und Kartenwechsel" sowie "Aushängen
// löscht die Anmerkungen".
//
// Aufbau wie session-fog-socket.integration.test.ts (design.md D7): die App lauscht auf Port 0,
// ein `socket.io-client` verbindet mit dem Sitzungscookie in `extraHeaders`, `reconnection:
// false`. Ereignisse werden ueber `once`-Promises mit Timeout eingesammelt; ein `onAny`-Recorder
// haelt die Reihenfolge (`session:map` -> `session:fog` -> `session:tokens` ->
// `session:annotations`) je Client fest. "erhaelt kein session:annotations" ist eine kurze
// Wartezeit ohne Ereignis. GIVEN-Zustaende werden direkt in GameSession/Membership/GameMap/
// MapInstance und (fuer Anmerkungen) in Annotation geschrieben. Gegen die Suite-eigene
// Wegwerf-DB (`session-annotation-socket.test.db`, constitution.md §4.3).
//
// Rote Phase (constitution.md §3.1, tasks.md 1.2): die Ereignisse `session:annotation-create`/
// `session:annotation-delete` sind unbekannt (kein Acknowledgement -> Timeout), `annotations`
// fehlt im Enter-Acknowledgement und in keiner Broadcast-Kette, und bis zur Migration (tasks.md
// 2.1) kennt Prisma das Modell `annotation` nicht — ein GIVEN, das Anmerkungs-Zeilen direkt
// anlegt oder zaehlt, scheitert dann am Laufzeitzugriff (und die lose getippte `db()`-Bruecke
// fuehrt beim vollen Typecheck zu einem Prisma-Typfehler am fehlenden Modell). Diese
// Ereignis-/Tabellen-/Enter-Ack-Luecken sind der erwartete rote Grund, kein Setup-/Tippfehler.

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
const MSG_NICHT_GEFUNDEN = 'Anmerkung nicht gefunden.'
const MSG_KEINE_RECHTE = 'Dafür fehlt die Berechtigung.'

const EV_CREATE = 'session:annotation-create'
const EV_DELETE = 'session:annotation-delete'
const EV_ANNOTATIONS = 'session:annotations'
const EV_MAP = 'session:map'
const EV_FOG = 'session:fog'
const EV_TOKENS = 'session:tokens'

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
const openSockets: Socket[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die (teils neuen) Tabellen -------------------------------------------------
// `Annotation` entsteht erst mit der Migration (2.1). Der Zugriff ist lose getippt, damit die
// Suite kompilierbar bleibt und erst zur Laufzeit am fehlenden Modell scheitert (der erwartete
// rote Grund); der volle Typecheck meldet das fehlende Prisma-Modell zusaetzlich.
type Pt = { x: number; y: number }
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
  createdAt: Date
}
interface AnnotationDb {
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
    create(args: { data: { instanceId: string; authorId: string | null; kind: string; mode: string; visibility: string; color: string | null; points: string; createdAt?: Date } }): Promise<AnnotationRow>
    findFirst(args: { where: Record<string, unknown> }): Promise<AnnotationRow | null>
    findMany(args?: unknown): Promise<AnnotationRow[]>
    count(args?: unknown): Promise<number>
    deleteMany(args?: unknown): Promise<unknown>
  }
}
const db = (): AnnotationDb => prisma as unknown as AnnotationDb

// --- Hilfen ---------------------------------------------------------------------------------

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}
function rec(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Erwartet ein Objekt: ${what}`)
  return value as Record<string, unknown>
}
function annotationsOf(event: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(event.annotations)) throw new Error('annotations ist keine Liste')
  return event.annotations as Array<Record<string, unknown>>
}

type InjectRes = { statusCode: number; body: string; cookies: Array<{ name: string; value: string }> }

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
function createAnnotation(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, EV_CREATE, payload)
}
function deleteAnnotation(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, EV_DELETE, payload)
}

/** Zeichnet die Reihenfolge relevanter Server-Ereignisse einer Verbindung auf (design.md D7). */
function recordEvents(socket: Socket): Array<{ name: string; payload: Record<string, unknown> }> {
  const log: Array<{ name: string; payload: Record<string, unknown> }> = []
  socket.onAny((name: string, payload: unknown) => {
    if (name === EV_MAP || name === EV_FOG || name === EV_TOKENS || name === EV_ANNOTATIONS) {
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
  return `AN${alphabet[codeZaehler % alphabet.length]}${zahl}`
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

// Legt Anmerkungen mit deterministisch aufsteigendem `createdAt` an, damit die
// Bestandsreihenfolge (aufsteigend nach Anlegezeitpunkt) in Tests stabil ist (design.md
// Risks: sequentielle Anlage schliesst die Gleichzeitigkeit aus).
let anlageZaehler = 0
async function createAnnotationDirect(
  instanceId: string,
  data: { authorId: string | null; kind: string; mode: string; visibility: string; color: string | null; points: Pt[] },
): Promise<AnnotationRow> {
  anlageZaehler += 1
  return db().annotation.create({
    data: {
      instanceId,
      authorId: data.authorId,
      kind: data.kind,
      mode: data.mode,
      visibility: data.visibility,
      color: data.color,
      points: JSON.stringify(data.points),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, anlageZaehler)),
    },
  })
}
async function annotationCount(instanceId: string): Promise<number> {
  return db().annotation.count({ where: { instanceId } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-annotation-socket'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as Partial<AnnotationDb>
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

// ============================================================================================
// Anmerkung anlegen (7 Szenarien).
// ============================================================================================

test('Spieler legt eine geteilte freie Strecke an', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, EV_ANNOTATIONS)
  const beimSpieler = once(spSocket, EV_ANNOTATIONS)
  const ack = await createAnnotation(spSocket, {
    sessionId: gs.id,
    kind: 'strecke',
    mode: 'frei',
    visibility: 'geteilt',
    color: null,
    points: [{ x: 10, y: 20 }, { x: 160, y: 120 }],
  })

  expect(ack.ok).toBe(true)
  const annotation = rec(ack.annotation, 'annotation im Acknowledgement')
  expect(typeof annotation.id).toBe('string')
  expect(annotation.instanceId).toBe(instanz.id)
  expect(annotation.kind).toBe('strecke')
  expect(annotation.mode).toBe('frei')
  expect(annotation.visibility).toBe('geteilt')
  expect(annotation.color).toBeNull()
  expect(annotation.points).toEqual([{ x: 10, y: 20 }, { x: 160, y: 120 }])
  expect(annotation.authorId).toBe(sp.userId)

  expect(await annotationCount(instanz.id)).toBe(1)
  const zeile = must(await db().annotation.findFirst({ where: { instanceId: instanz.id } }), 'die Annotation-Zeile')
  expect(zeile.authorId).toBe(sp.userId)

  const slListe = annotationsOf(rec(await beimSl, 'session:annotations beim Spielleiter'))
  expect(slListe).toHaveLength(1)
  expect(slListe[0].id).toBe(annotation.id)
  const spListe = annotationsOf(rec(await beimSpieler, 'session:annotations beim Spieler'))
  expect(spListe).toHaveLength(1)
  expect(spListe[0].id).toBe(annotation.id)
})

test('Private Messung erreicht nur den Urheber', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, EV_ANNOTATIONS)
  const beimSpieler = once(spSocket, EV_ANNOTATIONS)
  const ack = await createAnnotation(spSocket, {
    sessionId: gs.id,
    kind: 'strecke',
    mode: 'frei',
    visibility: 'privat',
    color: null,
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
  })

  expect(ack.ok).toBe(true)
  const annotation = rec(ack.annotation, 'annotation im Acknowledgement')
  expect(annotation.visibility).toBe('privat')

  const spListe = annotationsOf(rec(await beimSpieler, 'session:annotations beim Spieler'))
  expect(spListe).toHaveLength(1)
  expect(spListe[0].id).toBe(annotation.id)
  const slListe = annotationsOf(rec(await beimSl, 'session:annotations beim Spielleiter'))
  expect(slListe).toEqual([])
})

test('Gerastert setzt die Punkte auf Zellmitten', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await createAnnotation(slSocket, {
    sessionId: gs.id,
    kind: 'strecke',
    mode: 'gerastert',
    visibility: 'geteilt',
    color: null,
    points: [{ x: 100, y: 100 }, { x: 250, y: 30 }],
  })

  expect(ack.ok).toBe(true)
  const annotation = rec(ack.annotation, 'annotation im Acknowledgement')
  expect(annotation.points).toEqual([{ x: 105, y: 105 }, { x: 245, y: 35 }])

  const zeile = must(await db().annotation.findFirst({ where: { instanceId: instanz.id } }), 'die Annotation-Zeile')
  expect(JSON.parse(zeile.points)).toEqual([{ x: 105, y: 105 }, { x: 245, y: 35 }])
})

test('Zeichnung wird mit Farbe gespeichert', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_ANNOTATIONS)
  const ack = await createAnnotation(slSocket, {
    sessionId: gs.id,
    kind: 'zeichnung',
    mode: 'frei',
    visibility: 'geteilt',
    color: 'rot',
    points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }],
  })

  expect(ack.ok).toBe(true)
  const annotation = rec(ack.annotation, 'annotation im Acknowledgement')
  expect(annotation.kind).toBe('zeichnung')
  expect(annotation.color).toBe('rot')
  expect(annotation.points).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }])

  const spListe = annotationsOf(rec(await beimSpieler, 'session:annotations beim Spieler'))
  expect(spListe).toHaveLength(1)
  expect(spListe[0].id).toBe(annotation.id)
})

test('Ungültige Payload beim Anlegen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await createAnnotation(slSocket, {
    sessionId: gs.id,
    kind: 'winkel',
    mode: 'frei',
    visibility: 'geteilt',
    color: null,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_UNGUELTIG)
  expect(await annotationCount(instanz.id)).toBe(0)
})

test('Anlegen ohne aktive Karte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await mountDirect(gs.id, taverne.id) // eingehängt, aber nicht aktiviert

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const ack = await createAnnotation(slSocket, {
    sessionId: gs.id,
    kind: 'strecke',
    mode: 'frei',
    visibility: 'geteilt',
    color: null,
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
  })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_KEINE_KARTE)
  expect(await db().annotation.count()).toBe(0)
})

test('Abmeldung wirkt auf das Anlegen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: sl.sid } })
  const ack = await createAnnotation(slSocket, {
    sessionId: gs.id,
    kind: 'strecke',
    mode: 'frei',
    visibility: 'geteilt',
    color: null,
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
  })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await annotationCount(instanz.id)).toBe(0)
})

// ============================================================================================
// Anmerkung entfernen (7 Szenarien).
// ============================================================================================

test('Urheber entfernt eine private Anmerkung', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  const anm = await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'privat', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_ANNOTATIONS)
  const ack = await deleteAnnotation(spSocket, { sessionId: gs.id, target: { kind: 'eine', annotationId: anm.id } })

  expect(ack.ok).toBe(true)
  expect(await annotationCount(instanz.id)).toBe(0)
  const spListe = annotationsOf(rec(await beimSpieler, 'session:annotations beim Spieler'))
  expect(spListe).toEqual([])
})

test('Spielleiter entfernt eine geteilte Anmerkung eines Spielers', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  const anm = await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_ANNOTATIONS)
  const ack = await deleteAnnotation(slSocket, { sessionId: gs.id, target: { kind: 'eine', annotationId: anm.id } })

  expect(ack.ok).toBe(true)
  expect(await annotationCount(instanz.id)).toBe(0)
  const spListe = annotationsOf(rec(await beimSpieler, 'session:annotations beim Spieler'))
  expect(spListe).toEqual([])
})

test('Spieler darf eine fremde geteilte Anmerkung nicht entfernen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  const anm = await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  let spBekamAnnotations = false
  spSocket.on(EV_ANNOTATIONS, () => {
    spBekamAnnotations = true
  })

  const ack = await deleteAnnotation(spSocket, { sessionId: gs.id, target: { kind: 'eine', annotationId: anm.id } })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_KEINE_RECHTE)
  expect(await db().annotation.findFirst({ where: { id: anm.id } })).not.toBeNull()
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(spBekamAnnotations).toBe(false)
})

test('Fremde private und unbekannte Anmerkung sind nicht unterscheidbar', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  const privat = await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'privat', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const aufPrivat = await deleteAnnotation(spSocket, { sessionId: gs.id, target: { kind: 'eine', annotationId: privat.id } })
  const aufUnbekannt = await deleteAnnotation(spSocket, { sessionId: gs.id, target: { kind: 'eine', annotationId: 'unbekannt' } })

  expect(aufPrivat.ok).toBe(false)
  expect(aufUnbekannt.ok).toBe(false)
  expect(aufPrivat.message).toBe(MSG_NICHT_GEFUNDEN)
  expect(aufUnbekannt.message).toBe(MSG_NICHT_GEFUNDEN)
  expect(aufPrivat.message).toBe(aufUnbekannt.message)
  expect(await db().annotation.findFirst({ where: { id: privat.id } })).not.toBeNull()
})

test('Meine entfernen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'privat', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })
  await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 11, y: 21 }, { x: 31, y: 41 }] })
  const slAnm = await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 12, y: 22 }, { x: 32, y: 42 }] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSl = once(slSocket, EV_ANNOTATIONS)
  const ack = await deleteAnnotation(spSocket, { sessionId: gs.id, target: { kind: 'meine' } })

  expect(ack.ok).toBe(true)
  expect(await annotationCount(instanz.id)).toBe(1)
  const rest = must(await db().annotation.findFirst({ where: { instanceId: instanz.id } }), 'die verbliebene Anmerkung')
  expect(rest.id).toBe(slAnm.id)
  const slListe = annotationsOf(rec(await beimSl, 'session:annotations beim Spielleiter'))
  expect(slListe).toHaveLength(1)
  expect(slListe[0].id).toBe(slAnm.id)
})

test('Alle geteilten entfernen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })
  await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 11, y: 21 }, { x: 31, y: 41 }] })
  const spPrivat = await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'privat', color: null, points: [{ x: 12, y: 22 }, { x: 32, y: 42 }] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beimSpieler = once(spSocket, EV_ANNOTATIONS)
  const ack = await deleteAnnotation(slSocket, { sessionId: gs.id, target: { kind: 'geteilte' } })

  expect(ack.ok).toBe(true)
  expect(await annotationCount(instanz.id)).toBe(1)
  const rest = must(await db().annotation.findFirst({ where: { instanceId: instanz.id } }), 'die verbliebene Anmerkung')
  expect(rest.id).toBe(spPrivat.id)
  const spListe = annotationsOf(rec(await beimSpieler, 'session:annotations beim Spieler'))
  expect(spListe).toHaveLength(1)
  expect(spListe[0].id).toBe(spPrivat.id)
})

test('Spieler darf nicht alle geteilten entfernen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await deleteAnnotation(spSocket, { sessionId: gs.id, target: { kind: 'geteilte' } })

  expect(ack.ok).toBe(false)
  expect(ack.message).toBe(MSG_KEINE_RECHTE)
  expect(await annotationCount(instanz.id)).toBe(1)
})

// ============================================================================================
// Anmerkungsbestand beim Betreten und Kartenwechsel (2 Szenarien hier, das Aushängen folgt).
// ============================================================================================

test('Betreten liefert den gefilterten Bestand', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)
  const slPrivat = await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'privat', color: null, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })
  const slGeteilt = await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 3, y: 3 }, { x: 4, y: 4 }] })
  const spPrivat = await createAnnotationDirect(instanz.id, { authorId: sp.userId, kind: 'strecke', mode: 'frei', visibility: 'privat', color: null, points: [{ x: 5, y: 5 }, { x: 6, y: 6 }] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  const spAck = await enter(spSocket, gs.id)
  const slAck = await enter(slSocket, gs.id)

  const spListe = annotationsOf(spAck)
  expect(spListe.map((a) => a.id)).toEqual([slGeteilt.id, spPrivat.id])

  const slListe = annotationsOf(slAck)
  expect(slListe.map((a) => a.id)).toEqual([slPrivat.id, slGeteilt.id])
  expect(slListe.map((a) => a.id)).not.toContain(spPrivat.id)
})

test('Kartenwechsel verteilt den Bestand der neuen Karte', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const keller = await makeMap(sl.userId, 'Keller')
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  const kelInstanz = await mountDirect(gs.id, keller.id)
  await setActive(gs.id, tavInstanz.id)
  const geteilt = await createAnnotationDirect(tavInstanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const log = recordEvents(spSocket)

  const nachKeller = once(spSocket, EV_ANNOTATIONS)
  await activateMap(slSocket, { sessionId: gs.id, instanceId: kelInstanz.id })
  const kellerListe = annotationsOf(rec(await nachKeller, 'session:annotations nach Wechsel auf Keller'))
  expect(kellerListe).toEqual([])

  const nachTaverne = once(spSocket, EV_ANNOTATIONS)
  await activateMap(slSocket, { sessionId: gs.id, instanceId: tavInstanz.id })
  const taverneListe = annotationsOf(rec(await nachTaverne, 'session:annotations nach Wechsel auf Taverne'))
  expect(taverneListe).toHaveLength(1)
  expect(taverneListe[0].id).toBe(geteilt.id)

  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(log.map((e) => e.name)).toEqual([
    EV_MAP, EV_FOG, EV_TOKENS, EV_ANNOTATIONS,
    EV_MAP, EV_FOG, EV_TOKENS, EV_ANNOTATIONS,
  ])
})

test('Aushängen löscht die Anmerkungen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id) // eingehängt, aber nicht aktiv
  await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'strecke', mode: 'frei', visibility: 'geteilt', color: null, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })
  await createAnnotationDirect(instanz.id, { authorId: sl.userId, kind: 'zeichnung', mode: 'frei', visibility: 'privat', color: 'rot', points: [{ x: 3, y: 3 }, { x: 4, y: 4 }] })

  const res = (await app.inject({ method: 'DELETE', url: `/api/sessions/${gs.id}/maps/${instanz.id}`, cookies: { sid: sl.sid } })) as unknown as InjectRes

  expect(res.statusCode).toBe(204)
  expect(await annotationCount(instanz.id)).toBe(0)
})
