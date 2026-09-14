// Integrationstests zu openspec/changes/add-session-leave/specs/game-session/spec.md (#70):
// die beiden socket-gebundenen Szenarien des Verlassens/Entfernens —
// "Entfernter anwesender Spieler verliert den Raum sofort" (Requirement "Verlassen einer
// Spielsitzung und Entfernen eines Spielers") und "Entfernter Spieler verschwindet aus der
// Liste" (Requirement "Teilnehmerliste in Echtzeit"). Ein Test je GIVEN/WHEN/THEN-Szenario
// (constitution.md §4.1), Testname = Szenarioname.
//
// Aufbau wie game-session-socket.integration.test.ts (design.md D11): die App lauscht auf
// Port 0, ein `socket.io-client` verbindet mit dem Sitzungscookie in `extraHeaders`,
// `reconnection: false`. Ereignisse werden ueber `once`-Promises mit Timeout eingesammelt;
// Listener werden vor der ausloesenden Aktion registriert. Die Entfernung wird ueber die
// REST-Route `DELETE /api/sessions/:id/members/:userId` per `app.inject()` ausgeloest; ihr
// Broadcast erreicht die im selben Prozess verbundenen Sockets (design.md D3). Gegen die
// Suite-eigene Wegwerf-DB (`session-leave-socket.test.db`, constitution.md §4.3).
//
// Rote Phase (constitution.md §3.1): die Route ist noch nicht registriert und das Ereignis
// `session:removed` existiert nicht — `app.inject` liefert einen Standard-404, kein
// `session:removed` und kein aus der Entfernung ausgeloestes `session:participants` kommt, und
// die Mitgliedschaft bleibt bestehen. Die `once`-Promises laufen deshalb in ihren Timeout bzw.
// die DB-Assertion scheitert. Der erwartete rote Grund, kein Setup-/Tippfehler.

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

// --- Zugriff auf die Tabellen (siehe game-session.integration.test.ts) ----------------------
interface GameSessionRow {
  id: string
  name: string
  code: string
  status: string
}
interface GameDb {
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    deleteMany(): Promise<unknown>
  }
  membership: {
    create(args: { data: { sessionId: string; userId: string; role: string } }): Promise<unknown>
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

function participantsIn(payload: unknown): Array<Record<string, unknown>> {
  const list = rec(payload, 'session:participants-Payload').participants
  if (!Array.isArray(list)) throw new Error('Erwartet: participants-Array in session:participants')
  return list as Array<Record<string, unknown>>
}

function participantFor(list: Array<Record<string, unknown>>, userId: string): Record<string, unknown> | undefined {
  return list.find((p) => p.userId === userId)
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

async function registerUser(
  app: App,
  email: string,
  username: string = usernameFromEmail(email),
): Promise<{ sid: string; userId: string }> {
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

async function createGameSession(fields: { name?: string; code: string; status: string }): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: fields.name ?? 'Eine Runde', code: fields.code, status: fields.status } })
}

async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}

/** Loest das Entfernen ueber die REST-Route aus (design.md D3). */
function removeMember(app: App, sessionId: string, userId: string, sid: string): Promise<InjectRes> {
  return app.inject({
    method: 'DELETE',
    url: `/api/sessions/${sessionId}/members/${userId}`,
    cookies: { sid },
  }) as unknown as Promise<InjectRes>
}

function membershipCount(sessionId: string, userId: string): Promise<number> {
  return db().membership.count({ where: { sessionId, userId } })
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-leave-socket'))
  prisma = new PrismaClient()
  ;({ createApp } = await import('../src/server/core/app.js'))
})

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const c = prisma as unknown as { membership?: GameDb['membership']; gameSession?: GameDb['gameSession'] }
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

test('Entfernter anwesender Spieler verliert den Raum sofort', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sam.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  // "kein weiteres session:participants bei sam": ein Fehl-Listener macht ein unerwartetes,
  // aus der Entfernung ausgeloestes Ereignis sichtbar. Gewartet wird auf das erwartete
  // `session:removed` (design.md D11-Muster fuer "kein Ereignis").
  let participantsBeiSam = false
  spSocket.on('session:participants', () => {
    participantsBeiSam = true
  })
  const entfernt = once(spSocket, 'session:removed')
  const res = await removeMember(app, gs.id, sam.userId, sl.sid)
  expect(res.statusCode).toBe(200)

  const payload = await entfernt
  expect(rec(payload, 'session:removed-Payload').sessionId).toBe(gs.id)

  // sam ist nicht mehr im Raum: das aus der Entfernung ausgeloeste session:participants erreicht
  // ihn nicht.
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  expect(participantsBeiSam).toBe(false)
  expect(await membershipCount(gs.id, sam.userId)).toBe(0)
})

test('Entfernter Spieler verschwindet aus der Liste', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sam.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const teilnehmer = once(slSocket, 'session:participants')
  const res = await removeMember(app, gs.id, sam.userId, sl.sid)
  expect(res.statusCode).toBe(200)

  const payload = await teilnehmer
  // sam erscheint weder als online:true noch als online:false — er ist kein Mitglied mehr.
  expect(participantFor(participantsIn(payload), sam.userId)).toBeUndefined()
  expect(await membershipCount(gs.id, sam.userId)).toBe(0)
})
