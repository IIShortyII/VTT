// Integrationstests zu openspec/changes/add-session-map/specs/session-map/spec.md
// (REST-Szenarien der Requirements "Instanzrouten verlangen den Spielleiter", "Karte
// einhängen", "Eingehängte Karten auflisten" und "Karte aushängen" — ohne das
// Socket-Szenario "Aushängen der aktiven Karte leert den Raum", das in
// session-map-socket.integration.test.ts liegt) sowie den vier NEUEN Szenarien des Deltas
// openspec/changes/add-session-map/specs/map-library/spec.md (tasks.md 1.1). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Angesprochen wird der Server ueber `app.inject()` gegen die Suite-eigene Wegwerf-DB
// (`session-map.test.db` via setupEphemeralDb, design.md D8, constitution.md §4.3), mit einem
// eigenen Upload-Verzeichnis (`mkdtemp`), das `createApp({ uploadDir })` bekommt. Karten und
// Bilder wie in #49 (Signatur plus Fuellbytes). DB-Aussagen direkt aus `MapInstance` und
// `GameSession.activeInstanceId` (design.md D8).
//
// Delta add-fog-of-war (tasks.md 1.4, MODIFIED-Delta map-library): das Szenario "Mitglied
// erhält das Bild der aktiven Karte" ist auf seine neue Aussage umgestellt — die
// Bibliotheksroute `GET /api/maps/:id/image` liefert einem Mitglied `404` (wie eine unbekannte
// Karte), das vollstaendige bzw. maskierte Bild kommt nur ueber `GET
// /api/sessions/:id/map-image`. Die uebrigen Szenarien bleiben unveraendert.
//
// Rote Phase (tasks.md 1.1, constitution.md §3.1): bis die Routen und die Migration aus 2.1
// existieren, fehlen Instanzrouten (404 statt 201/200/204) bzw. Tabelle `MapInstance` und
// Spalte `GameSession.activeInstanceId`. Tests, die die neue Tabelle/Spalte im GIVEN oder in
// der Aussage lesen, scheitern dann am Prisma-Laufzeitzugriff; Tests, die nur eine Route
// treffen, an der Statusaussage. Fuer das umgestellte Fog-Szenario ist der erwartete rote
// Grund, dass die Bibliotheksroute heute `200` liefert und die Sitzungsroute
// `/api/sessions/:id/map-image` noch fehlt (`404` statt `200`).

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
const DEFAULT_GRID = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 } as const

// createApp locker getippt: `uploadDir` existiert bereits (#49). Der `as unknown`-Cast beim
// Import haelt die Testdatei in der roten Phase frei von Excess-Property-Compilefehlern.
type App = Awaited<ReturnType<(typeof import('../src/server/core/app.js'))['createApp']>>
type CreateAppFn = (opts: { prisma?: PrismaClient; logger?: boolean; uploadDir?: string }) => App | Promise<App>

let createApp: CreateAppFn
let prisma: PrismaClient
let uploadDir = ''
const openApps: App[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die (teils neuen) Tabellen -------------------------------------------------
// Bis die Migration aus tasks.md 2.1 existiert, kennt der generierte Prisma-Client weder das
// Modell `MapInstance` noch die Spalte `GameSession.activeInstanceId`. Ein schmaler, getippter
// Zugriff haelt die Tests lesbar; fehlt Tabelle/Spalte, scheitert erst der Laufzeitzugriff
// (der erwartete rote Grund), nicht der Compile der Testdatei.
interface GameMapRow {
  id: string
  ownerId: string
  name: string
  imageFile: string | null
  imageType: string | null
  gridType: string
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
}
interface GameSessionRow {
  id: string
  name: string
  code: string
  status: string
  activeInstanceId?: string | null
}
interface MapInstanceRow {
  id: string
  sessionId: string
  mapId: string
  position: number
}
interface SessionMapDb {
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
    findUnique(args: { where: { id: string } }): Promise<GameMapRow | null>
    count(args?: unknown): Promise<number>
    deleteMany(args?: unknown): Promise<unknown>
  }
  gameSession: {
    create(args: { data: { name: string; code: string; status: string } }): Promise<GameSessionRow>
    update(args: { where: { id: string }; data: { activeInstanceId: string | null } }): Promise<GameSessionRow>
    findUnique(args: { where: { id: string } }): Promise<GameSessionRow | null>
    deleteMany(args?: unknown): Promise<unknown>
  }
  membership: {
    create(args: { data: { sessionId: string; userId: string; role: string } }): Promise<unknown>
    deleteMany(args?: unknown): Promise<unknown>
  }
  mapInstance: {
    create(args: { data: { sessionId: string; mapId: string; position: number } }): Promise<MapInstanceRow>
    findFirst(args: { where: Record<string, unknown> }): Promise<MapInstanceRow | null>
    findMany(args?: unknown): Promise<MapInstanceRow[]>
    count(args?: unknown): Promise<number>
    deleteMany(args?: unknown): Promise<unknown>
  }
}
const db = (): SessionMapDb => prisma as unknown as SessionMapDb

// --- Antworttyp -----------------------------------------------------------------------------

type Res = {
  statusCode: number
  body: string
  rawPayload: Buffer
  headers: Record<string, string | string[] | undefined>
  cookies: Array<{ name: string; value: string }>
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Erwartet: ein JSON-Objekt als Antwortkoerper')
  }
  return value as Record<string, unknown>
}

function bodyOf(res: Res): Record<string, unknown> {
  return asRecord(JSON.parse(res.body))
}

function sidOf(res: Res): string {
  return must(res.cookies.find((c) => c.name === 'sid'), 'ein gesetztes Sitzungscookie "sid"').value
}

function headerOf(res: Res, name: string): string {
  const value = res.headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

// --- Bild-Bodies mit korrekter Signatur (design.md D3, wie #49) -----------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
function pngBody(total = 64): Buffer {
  const buffer = Buffer.alloc(Math.max(total, PNG_SIGNATURE.length))
  Buffer.from(PNG_SIGNATURE).copy(buffer)
  return buffer
}

// Ein echtes, dekodierbares 1x1-PNG (rot, deckend). Die Sitzungsroute `map-image` maskiert das
// Bild mit `sharp` und braucht dafuer ein gueltiges Bild — die Fuellbyte-Attrappe `pngBody`
// reicht dort nicht. Als base64-Konstante eingebettet, damit diese Suite kein `sharp` importiert
// (die Bild-Szenarien mit `sharp` liegen in session-map-image.integration.test.ts, design.md D9).
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==',
  'base64',
)

// --- App und HTTP-Hilfen --------------------------------------------------------------------

async function makeApp(): Promise<App> {
  const app = await createApp({ prisma, uploadDir, logger: false })
  openApps.push(app)
  return app
}

async function registerUser(app: App, email: string, username: string = usernameFromEmail(email)): Promise<{ sid: string; userId: string }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, username, password: PASSWORD },
  })) as unknown as Res
  if (res.statusCode !== 201) throw new Error(`Registrierung fehlgeschlagen (${res.statusCode}): ${res.body}`)
  return { sid: sidOf(res), userId: String(bodyOf(res).id) }
}

function get(app: App, url: string, sid?: string): Promise<Res> {
  return app.inject({ method: 'GET', url, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
}
function post(app: App, url: string, payload: Record<string, unknown>, sid?: string): Promise<Res> {
  return app.inject({ method: 'POST', url, payload, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
}
function del(app: App, url: string, sid?: string): Promise<Res> {
  return app.inject({ method: 'DELETE', url, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
}
function putImage(app: App, url: string, body: Buffer, contentType: string, sid?: string): Promise<Res> {
  return app.inject({
    method: 'PUT',
    url,
    payload: body,
    headers: { 'content-type': contentType },
    ...(sid ? { cookies: { sid } } : {}),
  }) as unknown as Promise<Res>
}

let codeZaehler = 0
function frischerCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  codeZaehler += 1
  const zahl = codeZaehler.toString().padStart(3, '2').slice(-3)
  return `AB${alphabet[codeZaehler % alphabet.length]}${zahl}`
}

// --- GIVEN-Zustaende direkt in der DB (umgehen die noch fehlenden Routen) --------------------

async function makeMap(ownerId: string, name: string, opts: { image?: boolean; grid?: { type: string; size: number; offsetX: number; offsetY: number } } = {}): Promise<GameMapRow> {
  const grid = opts.grid ?? DEFAULT_GRID
  return db().gameMap.create({
    data: {
      ownerId,
      name,
      gridType: grid.type,
      gridSize: grid.size,
      gridOffsetX: grid.offsetX,
      gridOffsetY: grid.offsetY,
    },
  })
}

async function createGameSession(fields: { name?: string; status?: string }): Promise<GameSessionRow> {
  return db().gameSession.create({
    data: { name: fields.name ?? 'Freitagsrunde', code: frischerCode(), status: fields.status ?? 'geoeffnet' },
  })
}

async function addMembership(sessionId: string, userId: string, role: string): Promise<void> {
  await db().membership.create({ data: { sessionId, userId, role } })
}

/** Haengt eine Karte direkt (ohne Route) in eine Spielsitzung ein — GIVEN-Zustand. Die
 * Position ist die bisher hoechste plus 1. */
async function mountDirect(sessionId: string, mapId: string): Promise<MapInstanceRow> {
  const vorhandene = await db().mapInstance.count({ where: { sessionId } })
  return db().mapInstance.create({ data: { sessionId, mapId, position: vorhandene + 1 } })
}

async function setActive(sessionId: string, instanceId: string | null): Promise<void> {
  await db().gameSession.update({ where: { id: sessionId }, data: { activeInstanceId: instanceId } })
}

// --- Wegwerf-DB und Upload-Verzeichnis ------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('session-map'))
  uploadDir = await mkdtemp(path.join(tmpdir(), 'vtt-session-maps-'))
  prisma = new PrismaClient()
  ;({ createApp } = (await import('../src/server/core/app.js')) as unknown as { createApp: CreateAppFn })
})

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const client = prisma as unknown as Partial<SessionMapDb>
  // Reihenfolge: erst die aktive-Karte-Zeiger loesen, dann Instanzen, dann Karten (FK
  // Restrict von MapInstance -> GameMap). In der roten Phase fehlen die neuen Delegates; nur
  // loeschen, was der Client kennt, damit das Aufraeumen nicht selbst wirft.
  if (client.mapInstance) await client.mapInstance.deleteMany()
  if (client.gameMap) await client.gameMap.deleteMany()
  if (client.membership) await client.membership.deleteMany()
  if (client.gameSession) await client.gameSession.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
  for (const entry of await readdir(uploadDir)) {
    await rm(path.join(uploadDir, entry), { force: true, recursive: true })
  }
})

afterAll(async () => {
  if (prisma) await prisma.$disconnect()
  await rm(uploadDir, { force: true, recursive: true })
  removeDbFiles()
})

// --- Instanzrouten verlangen den Spielleiter ------------------------------------------------

test('Instanzrouten ohne Cookie', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const karte = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, karte.id)
  const vorher = await db().mapInstance.count()

  const liste = await get(app, `/api/sessions/${gs.id}/maps`)
  const einhaengen = await post(app, `/api/sessions/${gs.id}/maps`, { mapId: karte.id })
  const aushaengen = await del(app, `/api/sessions/${gs.id}/maps/${instanz.id}`)

  expect(liste.statusCode).toBe(401)
  expect(einhaengen.statusCode).toBe(401)
  expect(aushaengen.statusCode).toBe(401)
  expect(await db().mapInstance.count()).toBe(vorher)
})

test('Spieler, Nicht-Mitglied und unbekannte Spielsitzung sind nicht unterscheidbar', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const fremd = await registerUser(app, 'fremd@example.com', 'nora')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const karte = await makeMap(sl.userId, 'Taverne')
  await mountDirect(gs.id, karte.id)

  const alsSpieler = await get(app, `/api/sessions/${gs.id}/maps`, sam.sid)
  const alsFremd = await get(app, `/api/sessions/${gs.id}/maps`, fremd.sid)
  const aufUnbekannt = await get(app, '/api/sessions/unbekannt/maps', sl.sid)

  expect(alsSpieler.statusCode).toBe(404)
  expect(alsFremd.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(alsFremd.statusCode).toBe(alsSpieler.statusCode)
  expect(aufUnbekannt.statusCode).toBe(alsSpieler.statusCode)
  expect(bodyOf(alsFremd).message).toBe(bodyOf(alsSpieler).message)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(alsSpieler).message)
})

// --- Karte einhängen ------------------------------------------------------------------------

test('Spielleiter hängt eigene Karte ein', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ name: 'Freitagsrunde', status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne', { grid: DEFAULT_GRID })
  await putImage(app, `/api/maps/${taverne.id}/image`, pngBody(), 'image/png', sl.sid)

  const res = await post(app, `/api/sessions/${gs.id}/maps`, { mapId: taverne.id }, sl.sid)

  expect(res.statusCode).toBe(201)
  const body = bodyOf(res)
  expect(body.mapId).toBe(taverne.id)
  expect(body.name).toBe('Taverne')
  expect(body.hasImage).toBe(true)
  expect(body.grid).toEqual({ type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 })
  expect(body.position).toBe(1)
  expect(typeof body.id).toBe('string')

  const instanzen = await db().mapInstance.findMany({ where: { sessionId: gs.id, mapId: taverne.id } })
  expect(instanzen).toHaveLength(1)
  expect(instanzen[0].position).toBe(1)
})

test('Fremde und unbekannte Karte sind nicht unterscheidbar', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const b = await registerUser(app, 'b@example.com', 'nora')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const krypta = await makeMap(b.userId, 'Krypta')

  const aufFremde = await post(app, `/api/sessions/${gs.id}/maps`, { mapId: krypta.id }, sl.sid)
  const aufUnbekannt = await post(app, `/api/sessions/${gs.id}/maps`, { mapId: 'unbekannt' }, sl.sid)

  expect(aufFremde.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufFremde.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufFremde).message)
  expect(await db().mapInstance.count({ where: { sessionId: gs.id } })).toBe(0)
})

test('Doppeltes Einhängen wird abgelehnt', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await mountDirect(gs.id, taverne.id)

  const res = await post(app, `/api/sessions/${gs.id}/maps`, { mapId: taverne.id }, sl.sid)

  expect(res.statusCode).toBe(409)
  expect(await db().mapInstance.count({ where: { sessionId: gs.id, mapId: taverne.id } })).toBe(1)
})

// --- Eingehängte Karten auflisten -----------------------------------------------------------

test('Liste in Reihenfolge des Einhängens', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const a = await createGameSession({ name: 'A', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', status: 'geoeffnet' })
  await addMembership(a.id, sl.userId, 'spielleiter')
  await addMembership(b.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne') // ohne Bild
  const waldGrid = { type: 'hex-spitz', size: 60, offsetX: 12, offsetY: -8 }
  const wald = await makeMap(sl.userId, 'Wald', { grid: waldGrid })
  await putImage(app, `/api/maps/${wald.id}/image`, pngBody(), 'image/png', sl.sid)
  await mountDirect(a.id, taverne.id)
  await mountDirect(a.id, wald.id)
  const krypta = await makeMap(sl.userId, 'Krypta')
  await mountDirect(b.id, krypta.id)

  const res = await get(app, `/api/sessions/${a.id}/maps`, sl.sid)

  expect(res.statusCode).toBe(200)
  const eintraege = JSON.parse(res.body) as Array<Record<string, unknown>>
  expect(eintraege).toHaveLength(2)
  expect(eintraege[0].name).toBe('Taverne')
  expect(eintraege[0].position).toBe(1)
  expect(eintraege[0].hasImage).toBe(false)
  expect(eintraege[1].name).toBe('Wald')
  expect(eintraege[1].position).toBe(2)
  expect(eintraege[1].hasImage).toBe(true)
  expect(eintraege[1].grid).toEqual(waldGrid)
  for (const eintrag of eintraege) {
    expect(typeof eintrag.id).toBe('string')
    expect(typeof eintrag.mapId).toBe('string')
  }
  expect(eintraege.some((e) => e.name === 'Krypta')).toBe(false)
})

// --- Karte aushängen ------------------------------------------------------------------------

test('Aushängen entfernt die Instanz, nicht die Karte', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await putImage(app, `/api/maps/${taverne.id}/image`, pngBody(), 'image/png', sl.sid)
  const instanz = await mountDirect(gs.id, taverne.id)

  const res = await del(app, `/api/sessions/${gs.id}/maps/${instanz.id}`, sl.sid)

  expect(res.statusCode).toBe(204)
  expect(await db().mapInstance.findFirst({ where: { id: instanz.id } })).toBeNull()
  const karte = await db().gameMap.findUnique({ where: { id: taverne.id } })
  expect(karte).not.toBeNull()
  expect(karte?.imageFile).not.toBeNull()
})

test('Instanz einer anderen Spielsitzung ist nicht erreichbar', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const a = await createGameSession({ name: 'A', status: 'geoeffnet' })
  const b = await createGameSession({ name: 'B', status: 'geoeffnet' })
  await addMembership(a.id, sl.userId, 'spielleiter')
  await addMembership(b.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanzB = await mountDirect(b.id, taverne.id)

  const aufFremde = await del(app, `/api/sessions/${a.id}/maps/${instanzB.id}`, sl.sid)
  const aufUnbekannt = await del(app, `/api/sessions/${a.id}/maps/unbekannt`, sl.sid)

  expect(aufFremde.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufFremde.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufFremde).message)
  expect(await db().mapInstance.findFirst({ where: { id: instanzB.id } })).not.toBeNull()
})

// --- map-library-Delta: Kartenbild abrufen (nur die NEUEN Szenarien) ------------------------

test('Mitglied erhält das Bild der aktiven Karte', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await putImage(app, `/api/maps/${taverne.id}/image`, REAL_PNG, 'image/png', sl.sid)
  const instanz = await mountDirect(gs.id, taverne.id)
  await setActive(gs.id, instanz.id)

  // MODIFIED (add-fog-of-war, map-library): die Bibliotheksroute liefert einem Mitglied `404`
  // wie eine unbekannte Karte — das Bild kommt nur ueber die Sitzungsroute.
  const aufTaverne = await get(app, `/api/maps/${taverne.id}/image`, sam.sid)
  const aufUnbekannt = await get(app, '/api/maps/unbekannt/image', sam.sid)
  const ueberSitzung = await get(app, `/api/sessions/${gs.id}/map-image`, sam.sid)

  expect(aufTaverne.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufTaverne.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufTaverne).message)

  expect(ueberSitzung.statusCode).toBe(200)
  expect(headerOf(ueberSitzung, 'content-type')).toContain('image/webp')
})

test('Eingehängte, nicht aktive Karte bleibt für Mitglieder unsichtbar', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const sam = await registerUser(app, 'sam@example.com', 'sam')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  await addMembership(gs.id, sam.userId, 'spieler')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await putImage(app, `/api/maps/${taverne.id}/image`, pngBody(), 'image/png', sl.sid)
  const wald = await makeMap(sl.userId, 'Wald')
  await putImage(app, `/api/maps/${wald.id}/image`, pngBody(), 'image/png', sl.sid)
  const tavInstanz = await mountDirect(gs.id, taverne.id)
  await mountDirect(gs.id, wald.id)
  await setActive(gs.id, tavInstanz.id)

  const aufWald = await get(app, `/api/maps/${wald.id}/image`, sam.sid)
  const aufUnbekannt = await get(app, '/api/maps/unbekannt/image', sam.sid)

  expect(aufWald.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufWald.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufWald).message)
})

// --- map-library-Delta: Karte löschen (nur die NEUEN Szenarien) -----------------------------

test('Eingehängte Karte kann nicht gelöscht werden', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  await putImage(app, `/api/maps/${taverne.id}/image`, pngBody(), 'image/png', sl.sid)
  const instanz = await mountDirect(gs.id, taverne.id)

  const res = await del(app, `/api/maps/${taverne.id}`, sl.sid)

  expect(res.statusCode).toBe(409)
  expect(await db().gameMap.findUnique({ where: { id: taverne.id } })).not.toBeNull()
  expect(await db().mapInstance.findFirst({ where: { id: instanz.id } })).not.toBeNull()
  expect(await readdir(uploadDir)).toHaveLength(1)
})

test('Nach dem Aushängen ist die Karte löschbar', async () => {
  const app = await makeApp()
  const sl = await registerUser(app, 'sl@example.com', 'meister')
  const gs = await createGameSession({ status: 'geoeffnet' })
  await addMembership(gs.id, sl.userId, 'spielleiter')
  const taverne = await makeMap(sl.userId, 'Taverne')
  const instanz = await mountDirect(gs.id, taverne.id)
  const ausgehaengt = await del(app, `/api/sessions/${gs.id}/maps/${instanz.id}`, sl.sid)
  expect(ausgehaengt.statusCode).toBe(204)

  const res = await del(app, `/api/maps/${taverne.id}`, sl.sid)

  expect(res.statusCode).toBe(204)
  expect(await db().gameMap.findUnique({ where: { id: taverne.id } })).toBeNull()
})
