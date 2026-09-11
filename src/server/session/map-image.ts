import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import sharp from 'sharp'

import { cellCorners, type Cell } from '../../shared/grid.js'
import type { Grid } from '../../shared/map.js'
import { MemberRoleSchema } from '../../shared/session.js'
import { resolveSession, SESSION_COOKIE_NAME } from '../auth/session.js'
import type { Clock } from '../core/clock.js'
import { toMapSummary } from '../map/rules.js'
import { readImage } from '../map/storage.js'

// `GET /api/sessions/:id/map-image` (add-fog-of-war #16, design.md D4, spec.md Requirement
// "Kartenbild der Spielsitzung"): dem Spielleiter das Originalbild, einem Spieler das
// serverseitig maskierte WebP - gerendert mit `sharp`, ein Render je (Bilddatei,
// Fog-Version), gecacht und von allen Spielern geteilt. Die einzige Route, die das
// vollstaendige Bild einer aktiven Karte an ein Mitglied ausliefert (`server/map/routes.ts`
// liefert wieder nur dem Besitzer).

export interface MapImageRouteDeps {
  prisma: PrismaClient
  clock: Clock
  uploadDir: string
}

interface SessionIdParams {
  id: string
}

const NOT_LOGGED_IN_MESSAGE = 'Nicht angemeldet.'
const SESSION_NOT_FOUND_MESSAGE = 'Spielsitzung nicht gefunden.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv.'
const IMAGE_MISSING_MESSAGE = 'Diese Karte hat kein Bild.'

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string): FastifyReply {
  return reply.status(statusCode).send({ statusCode, error, message })
}

/** Loest die Anmelde-Sitzung wie `session/routes.ts` auf; antwortet bei fehlender/ungueltiger
 * Sitzung selbst mit `401` und liefert dann `null` - der Aufrufer bricht in diesem Fall ab. */
async function requireUser(request: FastifyRequest, reply: FastifyReply, deps: Pick<MapImageRouteDeps, 'prisma' | 'clock'>) {
  const sessionId = request.cookies[SESSION_COOKIE_NAME]
  if (!sessionId) {
    sendError(reply, 401, 'Unauthorized', NOT_LOGGED_IN_MESSAGE)
    return null
  }
  const resolved = await resolveSession(deps.prisma, sessionId, deps.clock)
  if (!resolved) {
    sendError(reply, 401, 'Unauthorized', NOT_LOGGED_IN_MESSAGE)
    return null
  }
  return resolved.user
}

/** SVG-Maske in Bildgroesse (design.md D4): ein `<path>`, der fuer jede aufgedeckte Zelle das
 * Polygon aus `cellCorners` (M/L/Z) enthaelt, Fuellung weiss, `shape-rendering="crispEdges"`
 * gegen halbtransparente Kantenpixel. Ohne Zellen ein Pfad ohne Segmente - ergibt nach dem
 * `dest-in`-Composite ein vollstaendig transparentes Bild. */
function buildMaskSvg(grid: Grid, cells: Cell[], width: number, height: number): Buffer {
  const path = cells
    .map((cell) => {
      const corners = cellCorners(grid, cell)
      if (corners.length === 0) {
        return ''
      }
      const [first, ...rest] = corners
      const lines = rest.map((point) => `L ${point.x} ${point.y}`).join(' ')
      return `M ${first.x} ${first.y} ${lines} Z`
    })
    .filter((segment) => segment.length > 0)
    .join(' ')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${path}" fill="#ffffff" shape-rendering="crispEdges" /></svg>`
  return Buffer.from(svg)
}

/** Maskiert ein Kartenbild fuer einen Spieler (design.md D4): jeder Bildpunkt innerhalb einer
 * aufgedeckten Zelle behaelt die Farbe des Originals, jeder andere wird vollstaendig
 * transparent (Alpha 0) - `dest-in` behaelt vom Bild genau die Bildpunkte, an denen die
 * Maske deckend ist. `alphaQuality: 100` haelt den Alphakanal verlustfrei, sodass "Alpha 0"
 * und "Alpha 255" exakt gelten. Reine Funktion ueber `sharp`, exportiert fuer direkte Tests. */
export async function renderMaskedImage(bytes: Buffer, grid: Grid, cells: Cell[]): Promise<Buffer> {
  const metadata = await sharp(bytes).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  const mask = buildMaskSvg(grid, cells, width, height)
  return sharp(bytes)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer()
}

/** Rendercache (design.md D4): hoechstens ein Render je Instanz im Speicher, Schluessel
 * `imageFile + ':' + fogVersion` - ein Bildwechsel (neuer Dateiname) und jede
 * Fog-Aenderung (neue Version) verfehlen den Schluessel automatisch, keine explizite
 * Invalidierung noetig. */
export interface MaskedImageCache {
  get(instanceId: string, key: string): Buffer | undefined
  set(instanceId: string, key: string, bytes: Buffer): void
}

export function createMaskedImageCache(): MaskedImageCache {
  const entries = new Map<string, { key: string; bytes: Buffer }>()
  return {
    get(instanceId, key) {
      const entry = entries.get(instanceId)
      return entry && entry.key === key ? entry.bytes : undefined
    },
    set(instanceId, key, bytes) {
      entries.set(instanceId, { key, bytes })
    },
  }
}

export function registerMapImageRoute(app: FastifyInstance, deps: MapImageRouteDeps): void {
  const { prisma, uploadDir } = deps
  // Eine Instanz je App (design.md D4) - geteilt von allen Anfragen dieser Route, nicht je
  // Anfrage neu erzeugt.
  const cache = createMaskedImageCache()

  app.get<{ Params: SessionIdParams }>('/api/sessions/:id/map-image', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    // Mitgliedschaft pro Anfrage neu geladen (constitution.md §9.3) - ein Nicht-Mitglied und
    // eine unbekannte Spielsitzung sind fuer den Anfragenden nicht unterscheidbar (§9.2).
    const membership = await prisma.membership.findUnique({
      where: { sessionId_userId: { sessionId: request.params.id, userId: user.id } },
    })
    if (!membership) {
      sendError(reply, 404, 'Not Found', SESSION_NOT_FOUND_MESSAGE)
      return
    }

    const gameSession = await prisma.gameSession.findUnique({
      where: { id: request.params.id },
      include: { activeInstance: { include: { map: true } } },
    })
    if (!gameSession?.activeInstance) {
      sendError(reply, 404, 'Not Found', NO_ACTIVE_MAP_MESSAGE)
      return
    }

    const instance = gameSession.activeInstance
    const map = instance.map
    if (!map.imageFile || !map.imageType) {
      sendError(reply, 404, 'Not Found', IMAGE_MISSING_MESSAGE)
      return
    }

    const role = MemberRoleSchema.parse(membership.role)
    const bytes = await readImage(uploadDir, map.imageFile)

    if (role === 'spielleiter') {
      reply.header('Content-Type', map.imageType).header('Cache-Control', 'private, no-store').status(200).send(bytes)
      return
    }

    const cacheKey = `${map.imageFile}:${instance.fogVersion}`
    let masked = cache.get(instance.id, cacheKey)
    if (!masked) {
      const cells = await prisma.fogCell.findMany({ where: { instanceId: instance.id } })
      const grid = toMapSummary(map).grid
      masked = await renderMaskedImage(bytes, grid, cells)
      cache.set(instance.id, cacheKey, masked)
    }

    reply.header('Content-Type', 'image/webp').header('Cache-Control', 'private, no-store').status(200).send(masked)
  })
}
