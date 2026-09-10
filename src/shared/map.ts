import { z } from 'zod'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D1, Folgeregel zu Verzeichnisschnitt D1).
//
// Begriffe siehe specs/map-library/spec.md: "Karte" (Modell `GameMap`), "Besitzer", "Bild",
// "Raster", "Bildkoordinaten", "Zelle".

/** Rastertypen (design.md D5, spec.md "Begriffe"): `quadrat`, `hex-spitz` (Spitze oben),
 * `hex-flach` (flache Kante oben). */
export const GRID_TYPES = ['quadrat', 'hex-spitz', 'hex-flach'] as const
export const GridTypeSchema = z.enum(GRID_TYPES)
export type GridType = z.infer<typeof GridTypeSchema>

const GRID_SIZE_MIN = 8
const GRID_SIZE_MAX = 2000
const GRID_OFFSET_MIN = -2000
const GRID_OFFSET_MAX = 2000

/**
 * Raster einer Karte (spec.md "Begriffe"): `size` ist der Abstand zweier paralleler Kanten
 * einer Zelle in Bildpixeln, ganzzahlig 8-2000; `offsetX`/`offsetY` verschieben den
 * Rasterursprung, ganzzahlig -2000 bis 2000.
 */
export const GridSchema = z.object({
  type: GridTypeSchema,
  size: z
    .number()
    .int('Die Zellgröße muss eine ganze Zahl sein.')
    .min(GRID_SIZE_MIN, `Die Zellgröße muss mindestens ${GRID_SIZE_MIN} sein.`)
    .max(GRID_SIZE_MAX, `Die Zellgröße darf höchstens ${GRID_SIZE_MAX} sein.`),
  offsetX: z
    .number()
    .int('Der Versatz muss eine ganze Zahl sein.')
    .min(GRID_OFFSET_MIN, `Der Versatz muss mindestens ${GRID_OFFSET_MIN} sein.`)
    .max(GRID_OFFSET_MAX, `Der Versatz darf höchstens ${GRID_OFFSET_MAX} sein.`),
  offsetY: z
    .number()
    .int('Der Versatz muss eine ganze Zahl sein.')
    .min(GRID_OFFSET_MIN, `Der Versatz muss mindestens ${GRID_OFFSET_MIN} sein.`)
    .max(GRID_OFFSET_MAX, `Der Versatz darf höchstens ${GRID_OFFSET_MAX} sein.`),
})
export type Grid = z.infer<typeof GridSchema>

/** Standardraster einer neu angelegten Karte (spec.md "Begriffe", Requirement "Karte
 * anlegen"). */
export const DEFAULT_GRID: Grid = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }

/** Erlaubte Bildtypen fuer Upload/Auslieferung (design.md D3). */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const ImageMimeTypeSchema = z.enum(IMAGE_MIME_TYPES)
export type ImageMimeType = z.infer<typeof ImageMimeTypeSchema>

/** Groessengrenze eines Kartenbilds: 20 MB = 20 * 1024 * 1024 Bytes (spec.md "Begriffe"). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const MAP_NAME_MIN_LENGTH = 1
const MAP_NAME_MAX_LENGTH = 60

const MapNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(MAP_NAME_MIN_LENGTH, 'Der Name muss mindestens 1 Zeichen lang sein.')
      .max(MAP_NAME_MAX_LENGTH, `Der Name darf höchstens ${MAP_NAME_MAX_LENGTH} Zeichen lang sein.`),
  )

/** `POST /api/maps` (Requirement "Karte anlegen"). */
export const CreateMapInputSchema = z.object({
  name: MapNameSchema,
})
export type CreateMapInput = z.infer<typeof CreateMapInputSchema>

/**
 * `PATCH /api/maps/:id` (Requirement "Karte ändern"): mindestens eines von `name`/`grid`
 * muss angegeben sein. Ein mitgesendetes Raster ist immer vollständig (`GridSchema` verlangt
 * alle vier Felder) - eine Teilaktualisierung des Rasters gibt es nicht.
 */
export const UpdateMapInputSchema = z
  .object({
    name: MapNameSchema.optional(),
    grid: GridSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.grid !== undefined, {
    message: 'Es muss mindestens Name oder Raster angegeben werden.',
  })
export type UpdateMapInput = z.infer<typeof UpdateMapInputSchema>

/** Aussendarstellung einer Karte (spec.md "Drahtformat"): `hasImage` ist `imageFile !==
 * null` - das Bild selbst liegt nicht im JSON, sondern hinter `GET /api/maps/:id/image`. */
export const MapSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  hasImage: z.boolean(),
  grid: GridSchema,
})
export type MapSummary = z.infer<typeof MapSummarySchema>
