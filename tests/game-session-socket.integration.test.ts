// Integrationstests zu openspec/changes/add-game-session/specs/game-session/spec.md und den
// Deltas openspec/changes/add-username-and-alias/specs/game-session/spec.md (Alias, #45) sowie
// openspec/changes/reenter-room-after-reconnect/specs/game-session/spec.md (Raumwechsel, #46).
// Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Aufbau nach design.md D11: die App lauscht auf Port 0, ein `socket.io-client` verbindet mit
// dem Sitzungscookie in `extraHeaders`, `reconnection: false`. Ereignisse werden ueber
// `once`-Promises mit Timeout eingesammelt (kein `setTimeout`-Schlaf); Listener werden vor der
// ausloesenden Aktion registriert. GIVEN-Zustaende werden direkt in die `GameSession`- bzw.
// `Membership`-Zeile geschrieben, nicht ueber Uebergaenge hergestellt. Gegen die Suite-eigene
// Wegwerf-DB (`game-session-socket.test.db`, constitution.md §4.3).
//
// Nutzername/Alias (#45): jede Registrierung traegt ein `username` (Helfer `usernameFromEmail`
// bzw. ein bestimmter Wert). Die Spalte `Membership.alias` kennt der Prisma-Client erst nach
// der Migration (tasks.md 2.1). Tests, die einen Alias direkt in die `Membership`-Zeile
// schreiben, scheitern vorher zur Laufzeit am DB-Zugriff (unbekannte Spalte); Tests, die das
// neue Ereignis `session:alias` senden, scheitern am ausbleibenden Acknowledgement (Timeout
// auf dem unbekannten Ereignis) bzw. an noch enthaltenem `email`. Beide Gruende sind zulaessig
// (§3.1), ein Setup-/Compile-Fehler nicht.

import { PrismaClient } from '@prisma/client'
import { io, type Socket } from 'socket.io-client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
const WAIT_MS = 5000

type CreateApp = (typeof import('../src/server/core/app.js'))['createApp']
type App = Awaited<ReturnType<CreateApp>>

let createApp: CreateApp
let prisma: PrismaClient
const openApps: App[] = []
const openSockets: Socket[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die neuen Tabellen (siehe game-session.integration.test.ts) ----------------
// `Membership.alias` ist lose typisiert (optionales Feld in `create`, `findFirst` liefert
// einen losen Datensatz): die Spalte entsteht erst mit der Migration, die Suite bleibt aber
// kompilierbar.
interface GameSessionRow {
  id: string
  name: string
  code: string
  status: string
}
interface GameDb {
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    findUnique(args: { where: { id: string } }): Promise<GameSessionRow | null>
    count(args?: unknown): Promise<number>
    deleteMany(): Promise<unknown>
  }
  membership: {
    create(args: { data: { sessionId: string; userId: string; role: string; alias?: string | null } }): Promise<unknown>
    findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>
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

function participantsOf(ack: unknown): Array<Record<string, unknown>> {
  const list = rec(ack, 'Acknowledgement').participants
  if (!Array.isArray(list)) throw new Error('Erwartet: participants-Array im Acknowledgement')
  return list as Array<Record<string, unknown>>
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

/** Loest bei erfolgreichem Verbindungsaufbau auf, verwirft bei `connect_error`/Timeout. */
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

/** Verwirft, falls der Verbindungsaufbau *gelingt* — fuer das Szenario ohne Cookie. */
function expectConnectError(socket: Socket, ms = WAIT_MS): Promise<Error> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Kein connect_error innerhalb ${ms}ms`)), ms)
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer)
      resolve(err instanceof Error ? err : new Error(String(err)))
    })
    socket.once('connect', () => {
      clearTimeout(timer)
      reject(new Error('Verbindung kam zustande, obwohl kein Cookie gesendet wurde'))
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

function transition(socket: Socket, sessionId: string, action: string): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:transition', { sessionId, action })
}

/** Sendet `session:alias` und wartet auf das Acknowledgement (Ereignis aus #45, design.md D4). */
function setAlias(socket: Socket, payload: unknown): Promise<Record<string, unknown>> {
  return emitAck(socket, 'session:alias', payload)
}

async function registerUser(
  app: App,
  email: string,
  username: string = usernameFromEmail(email),
): Promise<{ sid: string; userId: string; email: string; username: string }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, username, password: PASSWORD },
  })) as unknown as InjectRes
  if (res.statusCode !== 201) throw new Error(`Registrierung fehlgeschlagen (${res.statusCode}): ${res.body}`)
  const sid = must(res.cookies.find((c) => c.name === 'sid'), 'ein Sitzungscookie').value
  const userId = String((JSON.parse(res.body) as Record<string, unknown>).id)
  return { sid, userId, email, username }
}

async function createGameSession(fields: { name?: string; code: string; status: string }): Promise<GameSessionRow> {
  return db().gameSession.create({ data: { name: fields.name ?? 'Eine Runde', code: fields.code, status: fields.status } })
}

/** Legt eine Mitgliedschaft an — optional mit einem Alias direkt in der Zeile (GIVEN-Zustand
 * fuer die Alias-Szenarien). Die Spalte `alias` kennt der Client erst nach der Migration. */
async function addMembership(sessionId: string, userId: string, role: string, alias?: string): Promise<void> {
  const data = alias === undefined ? { sessionId, userId, role } : { sessionId, userId, role, alias }
  await db().membership.create({ data })
}

/** Liest den in der DB gespeicherten Alias einer Mitgliedschaft (lose typisiert). */
async function aliasInDb(sessionId: string, userId: string): Promise<unknown> {
  const row = await db().membership.findFirst({ where: { sessionId, userId } })
  return row?.alias
}

function membershipCount(sessionId: string, userId: string): Promise<number> {
  return db().membership.count({ where: { sessionId, userId } })
}

function statusInDb(sessionId: string): Promise<string> {
  return db()
    .gameSession.findUnique({ where: { id: sessionId } })
    .then((row) => must(row, 'die Spielsitzungszeile').status)
}

// --- Wegwerf-DB -----------------------------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('game-session-socket'))
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

// --- Verbindung und Betreten des Raums ------------------------------------------------------

test('Mitglied betritt geöffnete Spielsitzung', async () => {
  const app = await startApp()
  const spieler = await registerUser(app, 'spieler@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, spieler.userId, 'spieler')

  const socket = client(spieler.sid)
  await connect(socket)
  const ack = await enter(socket, gs.id)

  expect(ack.ok).toBe(true)
  const session = rec(ack.session, 'session im Acknowledgement')
  expect(session.status).toBe('geoeffnet')
  expect(session.role).toBe('spieler')
  expect('code' in session).toBe(false)
  const selbst = must(participantFor(participantsOf(ack), spieler.userId), 'den Spieler in participants')
  expect(selbst.online).toBe(true)
})

test('Der Code erreicht nur den Spielleiter', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  const slAck = await enter(slSocket, gs.id)
  const spAck = await enter(spSocket, gs.id)

  expect(rec(slAck.session, 'session des Spielleiters').code).toBe('ABC234')
  expect('code' in rec(spAck.session, 'session des Spielers')).toBe(false)
  for (const p of [...participantsOf(slAck), ...participantsOf(spAck)]) {
    expect('code' in p).toBe(false)
  }
})

test('Nicht-Mitglied kann den Raum nicht betreten', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const fremd = await registerUser(app, 'fremd@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const slSocket = client(sl.sid)
  await connect(slSocket)
  const slAck = await enter(slSocket, gs.id)

  const fremdSocket = client(fremd.sid)
  await connect(fremdSocket)
  const fremdAck = await enter(fremdSocket, gs.id)

  expect(fremdAck.ok).toBe(false)
  expect(typeof fremdAck.message).toBe('string')
  // Die Teilnehmerliste, die der Spielleiter zuletzt hatte, nennt den Fremden nicht.
  expect(participantFor(participantsOf(slAck), fremd.userId)).toBeUndefined()
})

test('Spieler kann geschlossene Spielsitzung nicht betreten', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geschlossen' })
  await addMembership(gs.id, sp.userId, 'spieler')

  const socket = client(sp.sid)
  await connect(socket)
  const ack = await enter(socket, gs.id)

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
})

test('Spielleiter betritt geschlossene Spielsitzung', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geschlossen' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const socket = client(sl.sid)
  await connect(socket)
  const ack = await enter(socket, gs.id)

  expect(ack.ok).toBe(true)
  const session = rec(ack.session, 'session im Acknowledgement')
  expect(session.status).toBe('geschlossen')
  expect(session.code).toBe('ABC234')
})

test('Verbindung ohne Cookie wird abgelehnt', async () => {
  const app = await startApp()
  // Positivkontrolle: mit gueltigem Cookie kommt eine Verbindung zustande — das beweist, dass
  // der Socket-Server ueberhaupt existiert und die Ablehnung unten am fehlenden Cookie liegt,
  // nicht an einem abwesenden Server.
  const mitglied = await registerUser(app, 'mit-cookie@example.com')
  const mitCookie = client(mitglied.sid)
  await connect(mitCookie)
  expect(mitCookie.connected).toBe(true)

  const ohneCookie = client()
  const fehler = await expectConnectError(ohneCookie)

  expect(fehler).toBeTruthy()
  expect(ohneCookie.connected).toBe(false)
})

test('Ereignis mit ungültiger Payload', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sp.userId, 'spieler')

  const socket = client(sp.sid)
  await connect(socket)

  const ungueltig = await emitAck(socket, 'session:enter', 42)
  expect(ungueltig.ok).toBe(false)
  expect(typeof ungueltig.message).toBe('string')

  const gueltig = await enter(socket, gs.id)
  expect(gueltig.ok).toBe(true)
  const eigene = participantsOf(gueltig).filter((p) => p.userId === sp.userId)
  expect(eigene).toHaveLength(1)
})

// --- Autorisierung pro Aktion ---------------------------------------------------------------

test('Abmeldung wirkt auf eine bestehende Verbindung', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const socket = client(sl.sid)
  await connect(socket)
  expect((await enter(socket, gs.id)).ok).toBe(true)

  await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: sl.sid } })
  const ack = await transition(socket, gs.id, 'starten')

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await statusInDb(gs.id)).toBe('geoeffnet')
})

// --- Teilnehmerliste in Echtzeit ------------------------------------------------------------

test('Neues Mitglied erscheint sofort in der Liste', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const neu = await registerUser(app, 'neu@example.com', 'sam')

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const teilnehmer = once(slSocket, 'session:participants')
  const beitritt = (await app.inject({
    method: 'POST',
    url: '/api/sessions/join',
    payload: { code: 'ABC234' },
    cookies: { sid: neu.sid },
  })) as unknown as InjectRes
  expect(beitritt.statusCode).toBe(200)

  const payload = await teilnehmer
  const eintrag = must(participantFor(participantsIn(payload), neu.userId), 'den neuen Nutzer in der Teilnehmerliste')
  expect(eintrag.username).toBe('sam')
  expect(eintrag.role).toBe('spieler')
  expect(eintrag.online).toBe(false)
  // Ohne gesetzten Alias fehlt das Feld; die E-Mail steht ab #45 in keinem Drahtformat mehr.
  expect(eintrag).not.toHaveProperty('alias')
  expect(eintrag).not.toHaveProperty('email')
})

test('Betreten setzt das Mitglied auf anwesend', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const spSocket = client(sp.sid)
  await connect(spSocket)

  const teilnehmer = once(slSocket, 'session:participants')
  await enter(spSocket, gs.id)

  const payload = await teilnehmer
  const eintrag = must(participantFor(participantsIn(payload), sp.userId), 'den Spieler in der Teilnehmerliste')
  expect(eintrag.online).toBe(true)
})

test('Verbindungsabbruch setzt das Mitglied auf abwesend', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const teilnehmer = once(slSocket, 'session:participants')
  spSocket.disconnect()

  const payload = await teilnehmer
  const eintrag = must(participantFor(participantsIn(payload), sp.userId), 'den Spieler weiterhin in der Liste')
  expect(eintrag.online).toBe(false)
  expect(await db().membership.count({ where: { userId: sp.userId, sessionId: gs.id } })).toBe(1)
})

test('Raumwechsel setzt das Mitglied im alten Raum auf abwesend', async () => {
  // GIVEN: zwei Spielsitzungen A und B (beide `geoeffnet`). Nutzer `nora` ist Spielleiter von A
  // und hat A betreten; Nutzer `sven` ist Spieler in A und Spielleiter der zweiten Spielsitzung
  // B (per Mitgliedschaft — B muss dafuer nicht geoeffnet werden, ist es hier aber). `sven`
  // betritt A ueber eine Verbindung (design.md D5).
  const app = await startApp()
  const nora = await registerUser(app, 'nora@example.com', 'nora')
  const sven = await registerUser(app, 'sven@example.com', 'sven')
  const a = await createGameSession({ name: 'A', code: 'AAA234', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', code: 'BBB234', status: 'geoeffnet' })
  await addMembership(a.id, nora.userId, 'spielleiter')
  await addMembership(a.id, sven.userId, 'spieler')
  await addMembership(b.id, sven.userId, 'spielleiter')

  const noraSocket = client(nora.sid)
  await connect(noraSocket)
  await enter(noraSocket, a.id)

  const svenSocket = client(sven.sid)
  await connect(svenSocket)

  // Kontrolle: beim Betreten von A meldet der Server `sven` an nora als `online: true`.
  const anwesend = once(noraSocket, 'session:participants')
  await enter(svenSocket, a.id)
  const svenVorher = must(participantFor(participantsIn(await anwesend), sven.userId), 'sven in der Liste von A')
  expect(svenVorher.online).toBe(true)

  // WHEN: `sven` betritt ueber DIESELBE Verbindung die Spielsitzung B.
  const abwesend = once(noraSocket, 'session:participants')
  const svenAckB = await enter(svenSocket, b.id)

  // THEN: das Acknowledgement nennt B, und nora (im Raum A) erhaelt ein `session:participants`
  // mit `sessionId` gleich A, das `sven` weiterhin enthaelt, jetzt mit `online: false`.
  expect(svenAckB.ok).toBe(true)
  expect(rec(svenAckB.session, 'session im Acknowledgement').id).toBe(b.id)

  const payload = await abwesend
  expect(rec(payload, 'session:participants nach dem Wechsel').sessionId).toBe(a.id)
  const svenNachher = must(participantFor(participantsIn(payload), sven.userId), 'sven weiterhin in der Liste von A')
  expect(svenNachher.online).toBe(false)
})

test('Teilnehmerliste enthält Nutzername und Alias, aber keine E-Mail', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  // Alias direkt in die Mitgliedschaft (GIVEN) — Spalte erst nach der Migration.
  await addMembership(gs.id, sp.userId, 'spieler', 'Gandalf')

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const spSocket = client(sp.sid)
  await connect(spSocket)
  const teilnehmer = once(slSocket, 'session:participants')
  const enterAck = await enter(spSocket, gs.id)
  const payload = await teilnehmer

  for (const list of [participantsOf(enterAck), participantsIn(payload)]) {
    const sam = must(participantFor(list, sp.userId), 'den Spieler sam in der Liste')
    const meister = must(participantFor(list, sl.userId), 'den Spielleiter meister in der Liste')
    expect(sam.username).toBe('sam')
    expect(sam.alias).toBe('Gandalf')
    expect(meister.username).toBe('meister')
    expect(meister).not.toHaveProperty('alias')
    for (const p of list) expect(p).not.toHaveProperty('email')
  }
})

// --- Alias pro Mitgliedschaft (#45) ---------------------------------------------------------

test('Mitglied setzt seinen Alias', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const teilnehmer = once(slSocket, 'session:participants')
  const ack = await setAlias(spSocket, { sessionId: gs.id, alias: 'Gandalf der Graue' })

  expect(ack.ok).toBe(true)
  expect(ack.alias).toBe('Gandalf der Graue')
  expect(await aliasInDb(gs.id, sp.userId)).toBe('Gandalf der Graue')
  const eintrag = must(participantFor(participantsIn(await teilnehmer), sp.userId), 'den Spieler in der Teilnehmerliste')
  expect(eintrag.username).toBe('sam')
  expect(eintrag.alias).toBe('Gandalf der Graue')
})

test('Alias wird getrimmt', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sp.userId, 'spieler')

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  const ack = await setAlias(spSocket, { sessionId: gs.id, alias: "  Drizzt Do'Urden  " })

  expect(ack.ok).toBe(true)
  expect(ack.alias).toBe("Drizzt Do'Urden")
  expect(await aliasInDb(gs.id, sp.userId)).toBe("Drizzt Do'Urden")
})

test('Leerer Alias setzt zurück', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  // GIVEN: die Mitgliedschaft traegt bereits den Alias `Gandalf` (Spalte erst nach Migration).
  await addMembership(gs.id, sp.userId, 'spieler', 'Gandalf')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const teilnehmer = once(slSocket, 'session:participants')
  const ack = await setAlias(spSocket, { sessionId: gs.id, alias: '   ' })

  expect(ack.ok).toBe(true)
  expect(ack.alias).toBeNull()
  expect(await aliasInDb(gs.id, sp.userId)).toBeNull()
  const eintrag = must(participantFor(participantsIn(await teilnehmer), sp.userId), 'den Spieler in der Teilnehmerliste')
  expect(eintrag).not.toHaveProperty('alias')
})

test('Ungültiger Alias wird abgelehnt', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  // GIVEN: die Mitgliedschaft traegt den Alias `Gandalf`.
  await addMembership(gs.id, sp.userId, 'spieler', 'Gandalf')

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  // Je ein Fall: 41 Zeichen, ein Zeilenumbruch im Alias, eine Payload, die kein Objekt ist.
  const faelle: unknown[] = [
    { sessionId: gs.id, alias: 'a'.repeat(41) },
    { sessionId: gs.id, alias: 'Gan\ndalf' },
    42,
  ]
  for (const payload of faelle) {
    const ack = await setAlias(spSocket, payload)
    expect(ack.ok).toBe(false)
    expect(typeof ack.message).toBe('string')
  }
  expect(await aliasInDb(gs.id, sp.userId)).toBe('Gandalf')
})

test('Gleicher Alias für zwei Mitglieder ist erlaubt', async () => {
  const app = await startApp()
  const erster = await registerUser(app, 'erster@example.com', 'erster')
  const zweiter = await registerUser(app, 'zweiter@example.com', 'zweiter')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  // GIVEN: die Mitgliedschaft des ersten traegt bereits den Alias `Gandalf`.
  await addMembership(gs.id, erster.userId, 'spieler', 'Gandalf')
  await addMembership(gs.id, zweiter.userId, 'spieler')

  const zweiterSocket = client(zweiter.sid)
  await connect(zweiterSocket)
  await enter(zweiterSocket, gs.id)

  const ack = await setAlias(zweiterSocket, { sessionId: gs.id, alias: 'Gandalf' })

  expect(ack.ok).toBe(true)
  expect(ack.alias).toBe('Gandalf')
  expect(await aliasInDb(gs.id, erster.userId)).toBe('Gandalf')
  expect(await aliasInDb(gs.id, zweiter.userId)).toBe('Gandalf')
})

test('Alias gilt nur in dieser Spielsitzung', async () => {
  const app = await startApp()
  const nutzer = await registerUser(app, 'nutzer@example.com', 'sam')
  const a = await createGameSession({ name: 'A', code: 'AAA234', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', code: 'BBB234', status: 'geoeffnet' })
  await addMembership(a.id, nutzer.userId, 'spieler')
  await addMembership(b.id, nutzer.userId, 'spieler')

  const socket = client(nutzer.sid)
  await connect(socket)
  await enter(socket, a.id)

  const ack = await setAlias(socket, { sessionId: a.id, alias: 'Gandalf' })

  expect(ack.ok).toBe(true)
  expect(ack.alias).toBe('Gandalf')
  expect(await aliasInDb(a.id, nutzer.userId)).toBe('Gandalf')
  // Die Mitgliedschaft in B bleibt ohne Alias.
  expect(await aliasInDb(b.id, nutzer.userId)).toBeNull()
})

test('Nicht-Mitglied kann keinen Alias setzen', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const fremd = await registerUser(app, 'fremd@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const fremdSocket = client(fremd.sid)
  await connect(fremdSocket)

  const ack = await setAlias(fremdSocket, { sessionId: gs.id, alias: 'Gandalf' })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await membershipCount(gs.id, fremd.userId)).toBe(0)
})

test('Abmeldung wirkt auf das Alias-Ereignis', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com', 'sam')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sp.userId, 'spieler')

  const spSocket = client(sp.sid)
  await connect(spSocket)
  await enter(spSocket, gs.id)

  await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid: sp.sid } })
  const ack = await setAlias(spSocket, { sessionId: gs.id, alias: 'Gandalf' })

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await aliasInDb(gs.id, sp.userId)).toBeNull()
})

// --- Eine Verbindung pro Nutzer und Spielsitzung --------------------------------------------

test('Zweite Verbindung ersetzt die erste', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  await connect(slSocket)
  await enter(slSocket, gs.id)

  const v1 = client(sp.sid)
  await connect(v1)
  await enter(v1, gs.id)

  const ersetzt = once(v1, 'session:replaced')
  const getrennt = once<string>(v1, 'disconnect')
  const teilnehmer = once(slSocket, 'session:participants')

  const v2 = client(sp.sid)
  await connect(v2)
  const v2Ack = await enter(v2, gs.id)

  expect(v2Ack.ok).toBe(true)
  expect(rec(await ersetzt, 'session:replaced-Payload').sessionId).toBe(gs.id)
  expect(await getrennt).toBe('io server disconnect')
  const spielerEintraege = participantsIn(await teilnehmer).filter((p) => p.userId === sp.userId)
  expect(spielerEintraege).toHaveLength(1)
  expect(spielerEintraege[0].online).toBe(true)
})

test('Übernahme durch den Spielleiter pausiert nicht', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'gestartet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const v1 = client(sl.sid)
  await connect(v1)
  await enter(v1, gs.id)

  const getrennt = once<string>(v1, 'disconnect')
  const v2 = client(sl.sid)
  await connect(v2)
  const v2Ack = await enter(v2, gs.id)
  await getrennt

  expect(v2Ack.ok).toBe(true)
  expect(await statusInDb(gs.id)).toBe('gestartet')
  const eigene = participantsOf(v2Ack).filter((p) => p.userId === sl.userId)
  expect(eigene).toHaveLength(1)
  expect(eigene[0].online).toBe(true)
})

// --- Lebenszyklus durch den Spielleiter -----------------------------------------------------

test('Öffnen und Starten', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geschlossen' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const socket = client(sl.sid)
  await connect(socket)
  await enter(socket, gs.id)

  const status1 = once(socket, 'session:status')
  const ack1 = await transition(socket, gs.id, 'oeffnen')
  const s1 = await status1
  const status2 = once(socket, 'session:status')
  const ack2 = await transition(socket, gs.id, 'starten')
  const s2 = await status2

  expect(ack1.ok).toBe(true)
  expect(ack1.status).toBe('geoeffnet')
  expect(ack2.ok).toBe(true)
  expect(ack2.status).toBe('gestartet')
  expect(rec(s1, 'session:status nach oeffnen').status).toBe('geoeffnet')
  expect(rec(s2, 'session:status nach starten').status).toBe('gestartet')
  expect(await statusInDb(gs.id)).toBe('gestartet')
})

test('Pausieren und erneutes Starten', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'gestartet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const pausiert = once(spSocket, 'session:status')
  await transition(slSocket, gs.id, 'pausieren')
  const s1 = await pausiert
  const gestartet = once(spSocket, 'session:status')
  await transition(slSocket, gs.id, 'starten')
  const s2 = await gestartet

  expect(rec(s1, 'session:status pausiert').status).toBe('pausiert')
  expect(rec(s2, 'session:status gestartet').status).toBe('gestartet')
  expect(await statusInDb(gs.id)).toBe('gestartet')
})

test('Nicht erlaubter Übergang', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const socket = client(sl.sid)
  await connect(socket)
  await enter(socket, gs.id)
  const ack = await transition(socket, gs.id, 'pausieren')

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await statusInDb(gs.id)).toBe('geoeffnet')
})

test('Spieler darf nicht schalten', async () => {
  const app = await startApp()
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sp.userId, 'spieler')

  const socket = client(sp.sid)
  await connect(socket)
  await enter(socket, gs.id)
  const ack = await transition(socket, gs.id, 'starten')

  expect(ack.ok).toBe(false)
  expect(typeof ack.message).toBe('string')
  expect(await statusInDb(gs.id)).toBe('geoeffnet')
})

test('Beenden trennt die Spieler vom Raum', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'gestartet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const beendet = once(spSocket, 'session:ended')
  const teilnehmer = once(slSocket, 'session:participants')
  const ack = await transition(slSocket, gs.id, 'beenden')

  expect(ack.ok).toBe(true)
  expect(ack.status).toBe('geschlossen')
  expect(rec(await beendet, 'session:ended-Payload').sessionId).toBe(gs.id)
  const eintrag = must(participantFor(participantsIn(await teilnehmer), sp.userId), 'den Spieler in der Teilnehmerliste')
  expect(eintrag.online).toBe(false)
  expect(await statusInDb(gs.id)).toBe('geschlossen')
  expect(await db().membership.count({ where: { userId: sp.userId, sessionId: gs.id } })).toBe(1)
})

// --- Abwesenheit des Spielleiters pausiert --------------------------------------------------

test('Verbindungsverlust des Spielleiters in gestartet', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'gestartet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  const status = once(spSocket, 'session:status')
  slSocket.disconnect()
  const s = await status

  expect(rec(s, 'session:status').status).toBe('pausiert')
  expect(await statusInDb(gs.id)).toBe('pausiert')
})

test('Verbindungsverlust des Spielleiters in geöffnet', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const sp = await registerUser(app, 'sp@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sp.userId, 'spieler')

  const slSocket = client(sl.sid)
  const spSocket = client(sp.sid)
  await connect(slSocket)
  await connect(spSocket)
  await enter(slSocket, gs.id)
  await enter(spSocket, gs.id)

  // "kein session:status": ein Fehl-Listener macht ein unerwartetes Status-Ereignis sichtbar,
  // gewartet wird auf das *erwartete* session:participants (design.md D11).
  let statusEmpfangen = false
  spSocket.on('session:status', () => {
    statusEmpfangen = true
  })
  const teilnehmer = once(spSocket, 'session:participants')
  slSocket.disconnect()

  const eintrag = must(participantFor(participantsIn(await teilnehmer), sl.userId), 'den Spielleiter in der Liste')
  expect(eintrag.online).toBe(false)
  expect(statusEmpfangen).toBe(false)
  expect(await statusInDb(gs.id)).toBe('geoeffnet')
})

test('Rückkehr des Spielleiters setzt nicht fort', async () => {
  const app = await startApp()
  const sl = await registerUser(app, 'sl@example.com')
  const gs = await createGameSession({ code: 'ABC234', status: 'pausiert' })
  await addMembership(gs.id, sl.userId, 'spielleiter')

  const socket = client(sl.sid)
  await connect(socket)
  const ack = await enter(socket, gs.id)

  expect(ack.ok).toBe(true)
  expect(rec(ack.session, 'session im Acknowledgement').status).toBe('pausiert')
  expect(await statusInDb(gs.id)).toBe('pausiert')
})

test('Serverstart normalisiert gestartete Spielsitzungen', async () => {
  // Kein lauschender Server noetig: der onReady-Hook laeuft bei app.ready() (design.md D11).
  const app = await createApp({ prisma, logger: false })
  openApps.push(app)
  const gestartet = await createGameSession({ name: 'Gestartet', code: 'AAA234', status: 'gestartet' })
  const geoeffnet = await createGameSession({ name: 'Geöffnet', code: 'BBB234', status: 'geoeffnet' })

  await app.ready()

  expect(await statusInDb(gestartet.id)).toBe('pausiert')
  expect(await statusInDb(geoeffnet.id)).toBe('geoeffnet')
})
