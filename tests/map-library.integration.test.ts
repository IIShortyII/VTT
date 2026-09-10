// Integrationstests zu openspec/changes/add-map-library/specs/map-library/spec.md.
// Die 18 REST-Szenarien der Requirements "Kartenrouten verlangen eine Anmeldung",
// "Karte anlegen", "Meine Karten", "Karte ändern", "Kartenbild hochladen",
// "Kartenbild abrufen" und "Karte löschen" (tasks.md 1.1). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Angesprochen wird der Server ueber `app.inject()` gegen die Suite-eigene Wegwerf-DB
// (`map-library.test.db` via setupEphemeralDb, design.md D10, constitution.md §4.3), mit einem
// eigenen Upload-Verzeichnis (`mkdtemp` unter os.tmpdir()), das `createApp({ uploadDir })`
// bekommt und in afterAll entfernt wird. Bild-Bodies sind rohe Buffer mit der jeweiligen
// Signatur plus Fuellbytes; "zu gross" ist MAX_IMAGE_BYTES + 1. DB-Aussagen kommen direkt aus
// GameMap, Verzeichnisaussagen per readdir (design.md D10).
//
// Rote Phase: solange Routen und die Tabelle GameMap fehlen, scheitern die Tests entweder an
// der Statusaussage (Route fehlt -> 404 statt 201/200/...) oder bereits am GIVEN-Aufbau, der
// eine GameMap-Zeile schreibt (Tabelle fehlt -> Laufzeitfehler). Beides ist der erwartete rote
// Grund dieser Phase (tasks.md 1.1, constitution.md §3.1), kein Setup-/Tippfehler im Test.

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

import { PrismaClient } from '@prisma/client'

import { setupEphemeralDb } from './helpers/ephemeral-db.js'
import { usernameFromEmail } from './helpers/username.js'

jest.setTimeout(120_000)

const PASSWORD = 'ein-sicheres-passwort'
// Grenze aus spec.md "Begriffe" / design.md D5. Lokal gehalten, damit die Testdatei schon vor
// src/shared/map.ts kompiliert (der eigentliche rote Grund liegt in Route/Tabelle, nicht hier).
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const DEFAULT_GRID = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 } as const

// createApp wird bewusst locker getippt: die Option `uploadDir` (design.md D2, tasks.md 4.5)
// existiert erst nach der Implementierung. Ein `as unknown`-Cast beim Import haelt die
// Testdatei in der roten Phase frei von einem Excess-Property-Compilefehler, der den
// eigentlichen roten Grund verdecken wuerde.
type App = Awaited<ReturnType<(typeof import('../src/server/core/app.js'))['createApp']>>
type CreateAppFn = (opts: { prisma?: PrismaClient; logger?: boolean; uploadDir?: string }) => App | Promise<App>

let createApp: CreateAppFn
let prisma: PrismaClient
let uploadDir = ''
const openApps: App[] = []
let removeDbFiles: () => void = () => {}

// --- Zugriff auf die neue Tabelle GameMap ---------------------------------------------------
// Bis die Migration aus tasks.md 2.1 existiert, kennt der generierte Prisma-Client das Modell
// GameMap nicht. Ein schmaler, getippter Zugriff haelt die Tests lesbar; fehlt die Tabelle,
// scheitert erst der Laufzeitzugriff (der erwartete rote Grund), nicht der Compile.
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
interface GameMapDelegate {
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
  findFirst(args: { where: Record<string, unknown> }): Promise<GameMapRow | null>
  findMany(args?: unknown): Promise<GameMapRow[]>
  count(args?: unknown): Promise<number>
  deleteMany(args?: unknown): Promise<unknown>
}
interface MapDb {
  gameMap: GameMapDelegate
}
const db = (): MapDb => prisma as unknown as MapDb

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

// --- Bild-Bodies mit korrekter Signatur (design.md D3) --------------------------------------

function withSignature(signature: number[], total = 64): Buffer {
  const buffer = Buffer.alloc(Math.max(total, signature.length))
  Buffer.from(signature).copy(buffer)
  return buffer
}
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
function pngBody(total = 64): Buffer {
  return withSignature(PNG_SIGNATURE, total)
}
function jpegBody(total = 64): Buffer {
  return withSignature(JPEG_SIGNATURE, total)
}

// --- App und HTTP-Hilfen --------------------------------------------------------------------

async function makeApp(): Promise<App> {
  const app = await createApp({ prisma, uploadDir, logger: false })
  openApps.push(app)
  return app
}

async function registerUser(app: App, email: string): Promise<{ sid: string; userId: string }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, username: usernameFromEmail(email), password: PASSWORD },
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
function patch(app: App, url: string, payload: Record<string, unknown>, sid?: string): Promise<Res> {
  return app.inject({ method: 'PATCH', url, payload, ...(sid ? { cookies: { sid } } : {}) }) as unknown as Promise<Res>
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

/** Legt eine Karte des Nutzers direkt in der DB an (GIVEN-Zustand, umgeht die Route). */
async function makeMap(ownerId: string, name: string): Promise<GameMapRow> {
  return db().gameMap.create({
    data: {
      ownerId,
      name,
      gridType: DEFAULT_GRID.type,
      gridSize: DEFAULT_GRID.size,
      gridOffsetX: DEFAULT_GRID.offsetX,
      gridOffsetY: DEFAULT_GRID.offsetY,
    },
  })
}

// --- Wegwerf-DB und Upload-Verzeichnis ------------------------------------------------------

beforeAll(async () => {
  ;({ removeDbFiles } = setupEphemeralDb('map-library'))
  uploadDir = await mkdtemp(path.join(tmpdir(), 'vtt-maps-'))
  prisma = new PrismaClient()
  ;({ createApp } = (await import('../src/server/core/app.js')) as unknown as { createApp: CreateAppFn })
})

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  const client = prisma as unknown as { gameMap?: GameMapDelegate }
  if (client.gameMap) await client.gameMap.deleteMany()
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

// --- Kartenrouten verlangen eine Anmeldung --------------------------------------------------

test('Ohne Cookie wird die Kartenliste verweigert', async () => {
  const app = await makeApp()

  const res = await get(app, '/api/maps')

  expect(res.statusCode).toBe(401)
})

// --- Karte anlegen --------------------------------------------------------------------------

test('Anlegen mit gültigem Namen', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'anlegen@example.com')

  const res = await post(app, '/api/maps', { name: 'Taverne' }, nutzer.sid)

  expect(res.statusCode).toBe(201)
  const body = bodyOf(res)
  expect(body.name).toBe('Taverne')
  expect(body.hasImage).toBe(false)
  expect(body.grid).toEqual({ type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 })
  expect(typeof body.id).toBe('string')

  const maps = await db().gameMap.findMany({ where: { name: 'Taverne' } })
  expect(maps).toHaveLength(1)
  expect(maps[0].ownerId).toBe(nutzer.userId)
})

test('Anlegen mit ungültigem Namen', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'leer@example.com')

  const res = await post(app, '/api/maps', { name: '   ' }, nutzer.sid)

  expect(res.statusCode).toBe(400)
  expect(bodyOf(res).field).toBe('name')
  expect(await db().gameMap.count()).toBe(0)
})

// --- Meine Karten ---------------------------------------------------------------------------

test('Liste enthält nur eigene Karten', async () => {
  const app = await makeApp()
  const a = await registerUser(app, 'a@example.com')
  const b = await registerUser(app, 'b@example.com')
  await makeMap(a.userId, 'Taverne')
  await makeMap(a.userId, 'Wald')
  await makeMap(b.userId, 'Krypta')

  const res = await get(app, '/api/maps', a.sid)

  expect(res.statusCode).toBe(200)
  const eintraege = JSON.parse(res.body) as Array<Record<string, unknown>>
  expect(Array.isArray(eintraege)).toBe(true)
  expect(eintraege).toHaveLength(2)
  expect(eintraege.map((e) => e.name)).toEqual(['Taverne', 'Wald'])
  for (const eintrag of eintraege) {
    expect(typeof eintrag.id).toBe('string')
    expect('hasImage' in eintrag).toBe(true)
    expect('grid' in eintrag).toBe(true)
  }
  expect(eintraege.some((e) => e.name === 'Krypta')).toBe(false)
})

// --- Karte ändern ---------------------------------------------------------------------------

test('Raster ändern', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'raster@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')

  const neuesRaster = { type: 'hex-spitz', size: 60, offsetX: 12, offsetY: -8 }
  const res = await patch(app, `/api/maps/${karte.id}`, { grid: neuesRaster }, nutzer.sid)

  expect(res.statusCode).toBe(200)
  expect(bodyOf(res).grid).toEqual(neuesRaster)

  const zeile = await db().gameMap.findUnique({ where: { id: karte.id } })
  expect(zeile?.gridType).toBe('hex-spitz')
  expect(zeile?.gridSize).toBe(60)
  expect(zeile?.gridOffsetX).toBe(12)
  expect(zeile?.gridOffsetY).toBe(-8)
})

test('Ungültige Zellgröße wird abgelehnt', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'zellgroesse@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')

  const res = await patch(app, `/api/maps/${karte.id}`, { grid: { type: 'quadrat', size: 4, offsetX: 0, offsetY: 0 } }, nutzer.sid)

  expect(res.statusCode).toBe(400)
  expect(bodyOf(res).field).toBe('grid')

  const zeile = await db().gameMap.findUnique({ where: { id: karte.id } })
  expect(zeile?.gridType).toBe('quadrat')
  expect(zeile?.gridSize).toBe(70)
  expect(zeile?.gridOffsetX).toBe(0)
  expect(zeile?.gridOffsetY).toBe(0)
})

test('Fremde und unbekannte Karte sind nicht unterscheidbar', async () => {
  const app = await makeApp()
  const a = await registerUser(app, 'a@example.com')
  const b = await registerUser(app, 'b@example.com')
  const karteB = await makeMap(b.userId, 'Krypta')

  const aufFremde = await patch(app, `/api/maps/${karteB.id}`, { name: 'Gekapert' }, a.sid)
  const aufUnbekannt = await patch(app, '/api/maps/unbekannt', { name: 'Gekapert' }, a.sid)

  expect(aufFremde.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufFremde.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufFremde).message)

  const zeile = await db().gameMap.findUnique({ where: { id: karteB.id } })
  expect(zeile?.name).toBe('Krypta')
})

// --- Kartenbild hochladen -------------------------------------------------------------------

test('PNG hochladen', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'png@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')
  const body = pngBody()

  const res = await putImage(app, `/api/maps/${karte.id}/image`, body, 'image/png', nutzer.sid)

  expect(res.statusCode).toBe(200)
  expect(bodyOf(res).hasImage).toBe(true)

  const dateien = await readdir(uploadDir)
  expect(dateien).toHaveLength(1)
  const zeile = must(await db().gameMap.findUnique({ where: { id: karte.id } }), 'die Kartenzeile')
  const gespeichert = await readImage(zeile.imageFile)
  expect(gespeichert.equals(body)).toBe(true)
})

test('Erneuter Upload ersetzt das Bild', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'ersetzen@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')
  await putImage(app, `/api/maps/${karte.id}/image`, pngBody(), 'image/png', nutzer.sid)

  const zweiterBody = jpegBody(128)
  const res = await putImage(app, `/api/maps/${karte.id}/image`, zweiterBody, 'image/jpeg', nutzer.sid)

  expect(res.statusCode).toBe(200)
  const dateien = await readdir(uploadDir)
  expect(dateien).toHaveLength(1)
  const zeile = must(await db().gameMap.findUnique({ where: { id: karte.id } }), 'die Kartenzeile')
  const gespeichert = await readImage(zeile.imageFile)
  expect(gespeichert.equals(zweiterBody)).toBe(true)
})

test('Unbekannter Typ wird abgelehnt', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'typ@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')

  const res = await putImage(app, `/api/maps/${karte.id}/image`, Buffer.from('kein bild'), 'text/plain', nutzer.sid)

  expect(res.statusCode).toBe(415)
  const zeile = await db().gameMap.findUnique({ where: { id: karte.id } })
  expect(zeile?.imageFile).toBeNull()
  expect(await readdir(uploadDir)).toHaveLength(0)
})

test('Inhalt passt nicht zum Typ', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'inhalt@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')

  // Body traegt die PNG-Signatur, deklariert wird aber image/jpeg.
  const res = await putImage(app, `/api/maps/${karte.id}/image`, pngBody(), 'image/jpeg', nutzer.sid)

  expect(res.statusCode).toBe(400)
  const zeile = await db().gameMap.findUnique({ where: { id: karte.id } })
  expect(zeile?.imageFile).toBeNull()
  expect(await readdir(uploadDir)).toHaveLength(0)
})

test('Zu großes Bild wird abgelehnt', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'gross@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')

  const res = await putImage(app, `/api/maps/${karte.id}/image`, pngBody(MAX_IMAGE_BYTES + 1), 'image/png', nutzer.sid)

  expect(res.statusCode).toBe(413)
  const zeile = await db().gameMap.findUnique({ where: { id: karte.id } })
  expect(zeile?.imageFile).toBeNull()
  expect(await readdir(uploadDir)).toHaveLength(0)
})

test('Upload auf fremde Karte', async () => {
  const app = await makeApp()
  const a = await registerUser(app, 'a@example.com')
  const b = await registerUser(app, 'b@example.com')
  const karteB = await makeMap(b.userId, 'Krypta')

  const res = await putImage(app, `/api/maps/${karteB.id}/image`, pngBody(), 'image/png', a.sid)

  expect(res.statusCode).toBe(404)
  const zeile = await db().gameMap.findUnique({ where: { id: karteB.id } })
  expect(zeile?.imageFile).toBeNull()
  expect(await readdir(uploadDir)).toHaveLength(0)
})

// --- Kartenbild abrufen ---------------------------------------------------------------------

test('Besitzer erhält das Bild', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'abruf@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')
  const body = pngBody(96)
  await putImage(app, `/api/maps/${karte.id}/image`, body, 'image/png', nutzer.sid)

  const res = await get(app, `/api/maps/${karte.id}/image`, nutzer.sid)

  expect(res.statusCode).toBe(200)
  expect(headerOf(res, 'content-type')).toContain('image/png')
  expect(headerOf(res, 'cache-control')).toBe('private, no-store')
  expect(res.rawPayload.equals(body)).toBe(true)
})

test('Karte ohne Bild', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'ohnebild@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')

  const res = await get(app, `/api/maps/${karte.id}/image`, nutzer.sid)

  expect(res.statusCode).toBe(404)
})

test('Fremdes Bild ist nicht erreichbar', async () => {
  const app = await makeApp()
  const a = await registerUser(app, 'a@example.com')
  const b = await registerUser(app, 'b@example.com')
  const karteB = await makeMap(b.userId, 'Krypta')
  await putImage(app, `/api/maps/${karteB.id}/image`, pngBody(), 'image/png', b.sid)

  const aufFremde = await get(app, `/api/maps/${karteB.id}/image`, a.sid)
  const aufUnbekannt = await get(app, '/api/maps/unbekannt/image', a.sid)

  expect(aufFremde.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(404)
  expect(aufUnbekannt.statusCode).toBe(aufFremde.statusCode)
  expect(bodyOf(aufUnbekannt).message).toBe(bodyOf(aufFremde).message)
})

// --- Karte löschen --------------------------------------------------------------------------

test('Löschen entfernt Karte und Bild', async () => {
  const app = await makeApp()
  const nutzer = await registerUser(app, 'loeschen@example.com')
  const karte = await makeMap(nutzer.userId, 'Taverne')
  await putImage(app, `/api/maps/${karte.id}/image`, pngBody(), 'image/png', nutzer.sid)

  const res = await del(app, `/api/maps/${karte.id}`, nutzer.sid)

  expect(res.statusCode).toBe(204)
  expect(await db().gameMap.findUnique({ where: { id: karte.id } })).toBeNull()
  expect(await readdir(uploadDir)).toHaveLength(0)
})

test('Fremde Karte bleibt bestehen', async () => {
  const app = await makeApp()
  const a = await registerUser(app, 'a@example.com')
  const b = await registerUser(app, 'b@example.com')
  const karteB = await makeMap(b.userId, 'Krypta')

  const res = await del(app, `/api/maps/${karteB.id}`, a.sid)

  expect(res.statusCode).toBe(404)
  expect(await db().gameMap.findUnique({ where: { id: karteB.id } })).not.toBeNull()
})

// --- Datei-Hilfe (nach den Tests deklariert, per Hoisting nutzbar) --------------------------

async function readImage(fileName: string | null): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises')
  return readFile(path.join(uploadDir, must(fileName, 'ein imageFile in der Kartenzeile')))
}
