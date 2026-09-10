import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { CreateMapInputSchema, DEFAULT_GRID, ImageMimeTypeSchema, UpdateMapInputSchema, type ImageMimeType } from '../../shared/map.js'
import { resolveSession, SESSION_COOKIE_NAME } from '../auth/session.js'
import type { Clock } from '../core/clock.js'
import { findOwnMap, toMapSummary } from './rules.js'
import { detectSignature, readImage, removeImage, writeImage } from './storage.js'

// Duenne Fastify-Anbindung fuer die Kartenbibliothek (design.md D4): jede Route laedt eine
// Karte ausschliesslich ueber `findOwnMap` - Besitzerpruefung als Teil der Abfrage, kein `if`
// danach (constitution.md §9.2). Alle id-bezogenen Routen (PATCH, PUT, GET, DELETE) pruefen
// den Besitzer zuerst, bevor irgendetwas anderes an der Anfrage bewertet wird - eine fremde
// oder unbekannte Karte verhaelt sich damit fuer jede Art von Anfrage gleich. Der
// Content-Type-Parser fuer Bild-Uploads ist global in `core/app.ts` registriert (design.md
// D3); diese Datei prueft den Header selbst gegen die erlaubte Liste.

export interface MapRoutesDeps {
  prisma: PrismaClient
  clock: Clock
  uploadDir: string
}

interface MapIdParams {
  id: string
}

const NOT_LOGGED_IN_MESSAGE = 'Nicht angemeldet.'
const MAP_NOT_FOUND_MESSAGE = 'Karte nicht gefunden.'
const IMAGE_MISSING_MESSAGE = 'Diese Karte hat kein Bild.'
const UNSUPPORTED_MEDIA_TYPE_MESSAGE = 'Nicht unterstützter Bildtyp. Erlaubt sind PNG, JPEG oder WebP.'
const EMPTY_BODY_MESSAGE = 'Der Bildinhalt darf nicht leer sein.'
const SIGNATURE_MISMATCH_MESSAGE = 'Der Dateiinhalt passt nicht zum angegebenen Bildtyp.'

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string, field?: string): FastifyReply {
  return reply.status(statusCode).send({
    statusCode,
    error,
    message,
    ...(field ? { field } : {}),
  })
}

/** Erstes Segment eines zod-Issue-Pfads als `field` (design.md D5: "das erste zod-Issue
 * entscheidet anhand seines Pfads") - bei einem Rasterfehler etwa `['grid', 'size']` wird
 * daraus `grid`, nicht `grid.size`. */
function topLevelField(path: ReadonlyArray<string | number>): string | undefined {
  return path.length > 0 ? String(path[0]) : undefined
}

/** Loest die Anmelde-Sitzung wie `session/routes.ts` auf; antwortet bei fehlender/ungueltiger
 * Sitzung selbst mit `401` und liefert dann `null` - der Aufrufer bricht in diesem Fall ab. */
async function requireUser(request: FastifyRequest, reply: FastifyReply, deps: Pick<MapRoutesDeps, 'prisma' | 'clock'>) {
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

export function registerMapRoutes(app: FastifyInstance, deps: MapRoutesDeps): void {
  const { prisma, uploadDir } = deps

  app.post('/api/maps', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const parsed = CreateMapInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      sendError(reply, 400, 'Bad Request', issue.message, 'name')
      return
    }

    const created = await prisma.gameMap.create({
      data: {
        ownerId: user.id,
        name: parsed.data.name,
        gridType: DEFAULT_GRID.type,
        gridSize: DEFAULT_GRID.size,
        gridOffsetX: DEFAULT_GRID.offsetX,
        gridOffsetY: DEFAULT_GRID.offsetY,
      },
    })

    reply.status(201).send(toMapSummary(created))
  })

  app.get('/api/maps', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const maps = await prisma.gameMap.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } })
    reply.status(200).send(maps.map(toMapSummary))
  })

  app.patch<{ Params: MapIdParams }>('/api/maps/:id', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const map = await findOwnMap(prisma, user.id, request.params.id)
    if (!map) {
      sendError(reply, 404, 'Not Found', MAP_NOT_FOUND_MESSAGE)
      return
    }

    const parsed = UpdateMapInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      sendError(reply, 400, 'Bad Request', issue.message, topLevelField(issue.path))
      return
    }

    const data: { name?: string; gridType?: string; gridSize?: number; gridOffsetX?: number; gridOffsetY?: number } = {}
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name
    }
    if (parsed.data.grid !== undefined) {
      data.gridType = parsed.data.grid.type
      data.gridSize = parsed.data.grid.size
      data.gridOffsetX = parsed.data.grid.offsetX
      data.gridOffsetY = parsed.data.grid.offsetY
    }

    const updated = await prisma.gameMap.update({ where: { id: map.id }, data })
    reply.status(200).send(toMapSummary(updated))
  })

  app.delete<{ Params: MapIdParams }>('/api/maps/:id', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const map = await findOwnMap(prisma, user.id, request.params.id)
    if (!map) {
      sendError(reply, 404, 'Not Found', MAP_NOT_FOUND_MESSAGE)
      return
    }

    await prisma.gameMap.delete({ where: { id: map.id } })
    if (map.imageFile) {
      await removeImage(uploadDir, map.imageFile)
    }

    reply.status(204).send()
  })

  app.put<{ Params: MapIdParams }>('/api/maps/:id/image', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const map = await findOwnMap(prisma, user.id, request.params.id)
    if (!map) {
      sendError(reply, 404, 'Not Found', MAP_NOT_FOUND_MESSAGE)
      return
    }

    const contentTypeHeader = request.headers['content-type']
    const contentTypeResult = ImageMimeTypeSchema.safeParse(contentTypeHeader)
    if (!contentTypeResult.success) {
      sendError(reply, 415, 'Unsupported Media Type', UNSUPPORTED_MEDIA_TYPE_MESSAGE)
      return
    }
    const contentType: ImageMimeType = contentTypeResult.data

    const bytes = request.body
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      sendError(reply, 400, 'Bad Request', EMPTY_BODY_MESSAGE)
      return
    }

    const detected = detectSignature(bytes)
    if (detected === null || detected !== contentType) {
      sendError(reply, 400, 'Bad Request', SIGNATURE_MISMATCH_MESSAGE)
      return
    }

    const previousImageFile = map.imageFile
    const fileName = await writeImage(uploadDir, map.id, contentType, bytes)

    let updated
    try {
      updated = await prisma.gameMap.update({ where: { id: map.id }, data: { imageFile: fileName, imageType: contentType } })
    } catch (error) {
      // Schritt (3) aus design.md D2 ist gescheitert - die eben geschriebene Datei gehoert zu
      // keiner Karte und wird entfernt, bevor der Fehler weitergeworfen wird.
      await removeImage(uploadDir, fileName)
      throw error
    }

    if (previousImageFile) {
      await removeImage(uploadDir, previousImageFile)
    }

    reply.status(200).send(toMapSummary(updated))
  })

  app.get<{ Params: MapIdParams }>('/api/maps/:id/image', async (request, reply) => {
    const user = await requireUser(request, reply, deps)
    if (!user) {
      return
    }

    const map = await findOwnMap(prisma, user.id, request.params.id)
    if (!map || !map.imageFile || !map.imageType) {
      sendError(reply, 404, 'Not Found', map ? IMAGE_MISSING_MESSAGE : MAP_NOT_FOUND_MESSAGE)
      return
    }

    const bytes = await readImage(uploadDir, map.imageFile)
    reply.header('Content-Type', map.imageType).header('Cache-Control', 'private, no-store').status(200).send(bytes)
  })
}
