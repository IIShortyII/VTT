import { z } from 'zod'

import { FOG_TOOLS, type FogTool } from './fog.js'
import { cellAt, cellCenter, type Cell, type Point } from './grid.js'
import type { GridType } from './map.js'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D2, Folgeregel zu Verzeichnisschnitt D1). Sie
// importiert nur aus `grid.ts`, `fog.ts`, `map.ts` und `zod` - die Rolle eines Empfaengers
// wird als Literal-Union gefuehrt (strukturell kompatibel mit `MemberRole` aus
// `shared/session.ts`), damit kein Import in diese Richtung noetig ist (Muster `TokenViewer`).
//
// Begriffe siehe specs/session-annotation/spec.md: "Anmerkung", "Art", "Punkt", "Punkte",
// "Modus", "Sichtbarkeit", "Farbe", "Urheber", "Zellabstand", "Länge in Feldern", "Winkel in
// Grad", "Einheit", "Zahlenformat", "Etikett", "Anmerkungsdarstellung", "Ziel", "Entfernen
// dürfen", "Anmerkungsbestand", "Werkzeug".

/** Betragsgrenze je Koordinate und Obergrenze der Punktliste einer Anmerkung (spec.md
 * "Begriffe"). */
export const ANNOTATION_COORD_LIMIT = 1_000_000
export const ANNOTATION_MAX_POINTS = 2000

/** Umrechnung Feld -> Meter/Fuss (spec.md "Begriffe": "1 Feld = 1,5 m = 5 ft"). */
export const FIELD_METERS = 1.5
export const FIELD_FEET = 5

/** Schluessel des Browserspeichers fuer die Einheit (design.md D5) - kein Sitzungszustand. */
export const DISTANCE_UNIT_STORAGE_KEY = 'vtt.distanceUnit'

/** Die vier Arten einer Anmerkung (spec.md "Begriffe" "Art"): die ersten drei sind Messungen,
 * die vierte eine Zeichnung. */
export const ANNOTATION_KINDS = ['strecke', 'kreis', 'winkel', 'zeichnung'] as const
export const AnnotationKindSchema = z.enum(ANNOTATION_KINDS)
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>

/** Modus einer Anmerkung (spec.md "Begriffe" "Modus"). */
export const ANNOTATION_MODES = ['gerastert', 'frei'] as const
export const AnnotationModeSchema = z.enum(ANNOTATION_MODES)
export type AnnotationMode = z.infer<typeof AnnotationModeSchema>

/** Sichtbarkeit einer Anmerkung (spec.md "Begriffe" "Sichtbarkeit"). */
export const ANNOTATION_VISIBILITIES = ['privat', 'geteilt'] as const
export const AnnotationVisibilitySchema = z.enum(ANNOTATION_VISIBILITIES)
export type AnnotationVisibility = z.infer<typeof AnnotationVisibilitySchema>

/** Feste Farbpalette einer Zeichnung (spec.md "Begriffe" "Farbe"). */
export const ANNOTATION_COLORS = ['rot', 'orange', 'gelb', 'gruen', 'blau', 'weiss'] as const
export const AnnotationColorSchema = z.enum(ANNOTATION_COLORS)
export type AnnotationColor = z.infer<typeof AnnotationColorSchema>

/** Einheit fuer das Etikett (spec.md "Begriffe" "Einheit"). */
export const DISTANCE_UNITS = ['meter', 'fuss'] as const
export const DistanceUnitSchema = z.enum(DISTANCE_UNITS)
export type DistanceUnit = z.infer<typeof DistanceUnitSchema>

/** Werkzeuge des Panels "Messen & Zeichnen" (design.md D2, spec.md "Begriffe" "Werkzeug"):
 * Werkzeugwerte sind die Artwerte - `AnnotationTool` ist ein Alias von `AnnotationKind`. */
export const ANNOTATION_TOOLS = ANNOTATION_KINDS
export const AnnotationToolSchema = AnnotationKindSchema
export type AnnotationTool = AnnotationKind

/** Alle Werkzeuge der Kartenansicht (design.md D2, spec.md "Begriffe" "Werkzeug"): die vier
 * Fog-Werkzeuge plus die vier Anmerkungswerkzeuge - genau ein Werkzeugzustand je Raumansicht
 * (design.md D5). */
export const CANVAS_TOOLS = [...FOG_TOOLS, ...ANNOTATION_TOOLS] as const
export type CanvasTool = FogTool | AnnotationTool

/** Ob ein Werkzeug ein Anmerkungswerkzeug ist (design.md D2) - benutzt von der Canvas-Fassade,
 * um Gesten fuer Strecke/Kreis/Winkel/Zeichnung von den Fog-Werkzeugen zu unterscheiden. */
export function isAnnotationTool(tool: CanvasTool): tool is AnnotationTool {
  return (ANNOTATION_TOOLS as readonly string[]).includes(tool)
}

/** Palettenname -> Farbwert (design.md D2) - die einzige Stelle, die beide verbindet; der
 * Client zeichnet damit. */
export const ANNOTATION_COLOR_HEX: Record<AnnotationColor, string> = {
  rot: '#e53935',
  orange: '#fb8c00',
  gelb: '#fdd835',
  gruen: '#43a047',
  blau: '#1e88e5',
  weiss: '#ffffff',
}

/** Ein Punkt in Bildkoordinaten (spec.md "Begriffe" "Punkt"): endliche Zahlen, Betrag je
 * Koordinate hoechstens `ANNOTATION_COORD_LIMIT`. */
export const PointSchema = z.object({
  x: z.number().finite().min(-ANNOTATION_COORD_LIMIT).max(ANNOTATION_COORD_LIMIT),
  y: z.number().finite().min(-ANNOTATION_COORD_LIMIT).max(ANNOTATION_COORD_LIMIT),
})

/** Punkte einer Anmerkung (spec.md "Begriffe" "Punkte"): 2 bis `ANNOTATION_MAX_POINTS` - die
 * genaue Anzahl je Art prueft `CreateAnnotationInputSchema` per `superRefine`. */
export const PointListSchema = z.array(PointSchema).min(2).max(ANNOTATION_MAX_POINTS)

const POINTS_PER_KIND: Record<AnnotationKind, { min: number; max: number }> = {
  strecke: { min: 2, max: 2 },
  kreis: { min: 2, max: 2 },
  winkel: { min: 3, max: 3 },
  zeichnung: { min: 2, max: ANNOTATION_MAX_POINTS },
}

/** Payload von `session:annotation-create` (Client -> Server, design.md D2, spec.md
 * "Drahtformat"): Punktzahl je Art (spec.md "Begriffe" "Punkte"), `color !== null` genau
 * dann, wenn `kind === 'zeichnung'`, und `kind === 'zeichnung'` erzwingt `mode === 'frei'`
 * (spec.md "Begriffe" "Farbe"/"Modus"). */
export const CreateAnnotationInputSchema = z
  .object({
    sessionId: z.string(),
    kind: AnnotationKindSchema,
    mode: AnnotationModeSchema,
    visibility: AnnotationVisibilitySchema,
    color: AnnotationColorSchema.nullable(),
    points: PointListSchema,
  })
  .superRefine((value, ctx) => {
    const bounds = POINTS_PER_KIND[value.kind]
    if (value.points.length < bounds.min || value.points.length > bounds.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Anfrage.', path: ['points'] })
    }
    if (value.kind === 'zeichnung') {
      if (value.color === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Anfrage.', path: ['color'] })
      }
      if (value.mode !== 'frei') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Anfrage.', path: ['mode'] })
      }
    } else if (value.color !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Anfrage.', path: ['color'] })
    }
  })
export type CreateAnnotationInput = z.infer<typeof CreateAnnotationInputSchema>

/** Ziel einer Entfern-Aktion (spec.md "Begriffe" "Ziel"). */
export const DeleteAnnotationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('eine'), annotationId: z.string().min(1) }),
  z.object({ kind: z.literal('meine') }),
  z.object({ kind: z.literal('geteilte') }),
])
export type DeleteAnnotationTarget = z.infer<typeof DeleteAnnotationTargetSchema>

/** Payload von `session:annotation-delete` (Client -> Server, design.md D2). */
export const DeleteAnnotationInputSchema = z.object({
  sessionId: z.string(),
  target: DeleteAnnotationTargetSchema,
})
export type DeleteAnnotationInput = z.infer<typeof DeleteAnnotationInputSchema>

/** Anmerkungsdarstellung (spec.md "Begriffe" "Anmerkungsdarstellung"). */
export const AnnotationSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  kind: AnnotationKindSchema,
  mode: AnnotationModeSchema,
  visibility: AnnotationVisibilitySchema,
  color: AnnotationColorSchema.nullable(),
  points: PointListSchema,
  authorId: z.string().nullable(),
})
export type Annotation = z.infer<typeof AnnotationSchema>

/** Acknowledgement von `session:annotation-create` (spec.md "Drahtformat"). */
export type CreateAnnotationAck = { ok: true; annotation: Annotation } | { ok: false; message: string }

/** Acknowledgement von `session:annotation-delete` (spec.md "Drahtformat"). */
export type DeleteAnnotationAck = { ok: true } | { ok: false; message: string }

/** Payload von `session:annotations` (Server -> Client, spec.md "Drahtformat"). */
export interface AnnotationsEvent {
  sessionId: string
  annotations: Annotation[]
}

/** Ereignisnamen auf der Leitung - eine Quelle fuer Client und Server (spec.md
 * "Drahtformat"). */
export const SESSION_ANNOTATION_EVENTS = {
  create: 'session:annotation-create',
  delete: 'session:annotation-delete',
  annotations: 'session:annotations',
} as const

/** Wer eine Anmerkungsdarstellung empfaengt bzw. eine Entfern-Aktion sendet (design.md D2,
 * constitution.md §9.2/§9.3) - strukturell kompatibel mit `MemberRole` (`shared/session.ts`),
 * ohne diese Datei von dort importieren zu muessen (Muster `TokenViewer`). */
export interface AnnotationViewer {
  role: 'spielleiter' | 'spieler'
  userId: string
}

/** Filtert einen Anmerkungsbestand fuer einen Empfaenger (design.md D2, constitution.md
 * §9.2): geteilte Anmerkungen fuer jeden, private nur fuer ihren Urheber. Reine Funktion,
 * keine DB. Reihenfolge bleibt erhalten. */
export function filterAnnotationsFor(list: Annotation[], viewer: AnnotationViewer): Annotation[] {
  return list.filter((annotation) => annotation.visibility === 'geteilt' || annotation.authorId === viewer.userId)
}

/** Wer eine Anmerkung entfernen darf (design.md D2, spec.md "Begriffe" "Entfernen dürfen"):
 * ihr Urheber, eine geteilte zusaetzlich jedes Mitglied mit Rolle `spielleiter`. Reine
 * Funktion, keine DB - Muster `canMoveToken` (der Server prueft damit pro Aktion, das Panel
 * zeigt damit `Entfernen` nur dort, wo der Server zustimmen wuerde). */
export function canDeleteAnnotation(annotation: Pick<Annotation, 'authorId' | 'visibility'>, viewer: AnnotationViewer): boolean {
  return annotation.authorId === viewer.userId || (annotation.visibility === 'geteilt' && viewer.role === 'spielleiter')
}

/** Wandelt eine Zelle in Wuerfelkoordinaten um - odd-r fuer `hex-spitz`, odd-q fuer
 * `hex-flach` (design.md D2, dieselbe Zuordnung und `&`-Maske fuer negative Zeilen/Spalten
 * wie `shared/grid.ts` `cellAt`/`cellCenter`). */
function cubeCoords(gridType: GridType, cell: Cell): { x: number; y: number; z: number } {
  if (gridType === 'hex-spitz') {
    const x = cell.col - (cell.row - (cell.row & 1)) / 2
    const z = cell.row
    const y = -x - z
    return { x, y, z }
  }
  // 'hex-flach'
  const x = cell.col
  const z = cell.row - (cell.col - (cell.col & 1)) / 2
  const y = -x - z
  return { x, y, z }
}

/** Zellabstand zweier Zellen je Rastertyp (spec.md "Begriffe" "Zellabstand", design.md D2):
 * `quadrat` die Chebyshev-Distanz ("Diagonale zählt 1"), Hex ueber Wuerfelkoordinaten. */
export function cellDistance(gridType: GridType, a: Cell, b: Cell): number {
  if (gridType === 'quadrat') {
    return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))
  }
  const ca = cubeCoords(gridType, a)
  const cb = cubeCoords(gridType, b)
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z))
}

/** Punkt, auf die Zellmitte eingerastet, in der er liegt (spec.md "Begriffe" "Modus",
 * design.md D2): `cellCenter(grid, cellAt(grid, point))`. Server und Client benutzen
 * dieselbe Funktion (spec.md Requirement "Messgeometrie"). */
export function snapToCellCenter(grid: Parameters<typeof cellAt>[0], point: Point): Point {
  return cellCenter(grid, cellAt(grid, point))
}

/** Rundet auf eine Nachkommastelle (spec.md "Begriffe" "Zahlenformat"). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Grid-Ausschnitt, den die Geometriefunktionen brauchen - dieselbe Form wie `shared/map.ts`
 * `Grid`, hier lose gekoppelt referenziert (design.md D2 importiert nur `./map.js` als Typ). */
export type AnnotationGrid = Parameters<typeof cellAt>[0] & { size: number }

/** Laenge in Feldern einer Strecke (spec.md "Begriffe" "Länge in Feldern", design.md D2): bei
 * `gerastert` der Zellabstand der Zellen, in denen die Punkte liegen; bei `frei` die
 * euklidische Laenge in Bildkoordinaten geteilt durch die Zellgroesse, auf eine
 * Nachkommastelle gerundet. */
export function distanceInFields(grid: AnnotationGrid, mode: AnnotationMode, a: Point, b: Point): number {
  if (mode === 'gerastert') {
    return cellDistance(grid.type, cellAt(grid, a), cellAt(grid, b))
  }
  const dx = b.x - a.x
  const dy = b.y - a.y
  return round1(Math.hypot(dx, dy) / grid.size)
}

/** Winkel in Grad zwischen zwei Schenkeln (spec.md "Begriffe" "Winkel in Grad", design.md
 * D2): 0 bis 180, auf eine ganze Zahl gerundet; hat ein Schenkel die Laenge 0, ist der Winkel
 * 0. */
export function angleDegrees(vertex: Point, a: Point, b: Point): number {
  const va = { x: a.x - vertex.x, y: a.y - vertex.y }
  const vb = { x: b.x - vertex.x, y: b.y - vertex.y }
  if ((va.x === 0 && va.y === 0) || (vb.x === 0 && vb.y === 0)) {
    return 0
  }
  const angleA = Math.atan2(va.y, va.x)
  const angleB = Math.atan2(vb.y, vb.x)
  let diff = Math.abs(angleA - angleB)
  if (diff > Math.PI) {
    diff = 2 * Math.PI - diff
  }
  return Math.round((diff * 180) / Math.PI)
}

/** Zahlenformat des Etiketts (spec.md "Begriffe" "Zahlenformat"): hoechstens eine
 * Nachkommastelle, Komma als Dezimaltrenner, ganze Zahlen ohne Nachkommastelle. Kein
 * `toLocaleString` - unter Node ohne volle ICU faellt das anders aus (design.md D2). */
export function formatNumber(n: number): string {
  const rounded = round1(n)
  return String(rounded).replace('.', ',')
}

/** "Feld" bei genau 1, sonst "Felder" (spec.md "Begriffe" "Zahlenformat"). */
export function fieldsWord(n: number): string {
  return n === 1 ? 'Feld' : 'Felder'
}

/** Feld -> Meter/Fuss, auf eine Nachkommastelle gerundet (spec.md "Begriffe" "Einheit",
 * design.md D2). */
export function convertFields(fields: number, unit: DistanceUnit): number {
  return unit === 'meter' ? round1(fields * FIELD_METERS) : round1(fields * FIELD_FEET)
}

/** Einheitensuffix des Etiketts (spec.md "Begriffe" "Etikett"). */
export function unitSuffix(unit: DistanceUnit): string {
  return unit === 'meter' ? 'm' : 'ft'
}

/** Formt "<Länge> Felder (<Wert> <Einheit>)" - der wiederkehrende Baustein des Etiketts einer
 * Strecke bzw. des Radius/Durchmessers eines Kreises (spec.md "Begriffe" "Etikett"). */
function lengthLabel(fields: number, unit: DistanceUnit): string {
  const converted = convertFields(fields, unit)
  return `${formatNumber(fields)} ${fieldsWord(fields)} (${formatNumber(converted)} ${unitSuffix(unit)})`
}

/** Etikett einer Anmerkung (spec.md "Begriffe" "Etikett", design.md D2): reine Funktion aus
 * Anmerkung, Raster und Einheit - nichts davon wird gespeichert oder gesendet. */
export function annotationLabel(annotation: Pick<Annotation, 'kind' | 'mode' | 'points'>, grid: AnnotationGrid, unit: DistanceUnit): string {
  const { kind, mode, points } = annotation
  if (kind === 'zeichnung') {
    return ''
  }
  if (kind === 'strecke') {
    const fields = distanceInFields(grid, mode, points[0], points[1])
    return lengthLabel(fields, unit)
  }
  if (kind === 'kreis') {
    const radiusFields = distanceInFields(grid, mode, points[0], points[1])
    const diameterFields = round1(radiusFields * 2)
    return `r ${lengthLabel(radiusFields, unit)} · ⌀ ${lengthLabel(diameterFields, unit)}`
  }
  // 'winkel'
  const degrees = angleDegrees(points[0], points[1], points[2])
  return `${degrees}°`
}
