import { z } from 'zod'

import type { Cell } from './grid.js'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*`, kein `sharp` (design.md D2, Folgeregel zu
// Verzeichnisschnitt D1). Sie importiert nur den Typ `Cell` aus `grid.ts` und `zod` - die
// Rolle eines Empfaengers wird als Literal-Union gefuehrt (strukturell kompatibel mit
// `MemberRole` aus `shared/session.ts`), damit kein Import in diese Richtung noetig ist.
//
// Begriffe siehe specs/session-fog/spec.md: "Zelle", "Aufgedeckte Zellen", "Bereich",
// "Ziel", "Fog-Version", "Bereichsdarstellung", "Fog-Darstellung", "Maskiertes Bild".

/** Betragsgrenze je Koordinate und Obergrenze der Zellenliste je Aktion (spec.md
 * "Begriffe"/Drahtformat). */
export const FOG_COORD_LIMIT = 10000
export const FOG_MAX_CELLS = 10000
export const FOG_AREA_NAME_MAX_LENGTH = 40

/** Eine Zelle im Raster einer Karte (spec.md "Begriffe"): ganzzahlig, Betrag je Koordinate
 * hoechstens `FOG_COORD_LIMIT`. Negative Werte und Zellen ausserhalb des Bilds sind
 * zulaessig - der Server prueft keinen Kartenrand. */
export const CellSchema = z.object({
  col: z.number().int().min(-FOG_COORD_LIMIT).max(FOG_COORD_LIMIT),
  row: z.number().int().min(-FOG_COORD_LIMIT).max(FOG_COORD_LIMIT),
})

/** Eindeutiger Schluessel einer Zelle - Grundlage von "keine Zelle doppelt" (Validierung)
 * und der Mengenoperationen in Server und Fassade. */
export function cellKey(cell: Cell): string {
  return `${cell.col},${cell.row}`
}

/** Liste von Zellen fuer eine Aktion (Ad-hoc-Zellen einer `session:fog-set`-Aktion oder die
 * Zellen eines neuen Bereichs): 1 bis `FOG_MAX_CELLS`, keine Zelle doppelt. */
export const CellListSchema = z
  .array(CellSchema)
  .min(1, 'Es muss mindestens eine Zelle angegeben werden.')
  .max(FOG_MAX_CELLS, `Es sind höchstens ${FOG_MAX_CELLS} Zellen erlaubt.`)
  .refine((cells) => new Set(cells.map(cellKey)).size === cells.length, 'Die Zellen müssen sich unterscheiden.')

/** Name eines Bereichs (spec.md "Begriffe"): getrimmt, 1 bis 40 Zeichen, keine
 * Steuerzeichen - dasselbe Muster wie `CreateTokenInputSchema.name` in `shared/token.ts`. */
export const FogAreaNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, 'Der Name muss mindestens 1 Zeichen lang sein.')
      .max(FOG_AREA_NAME_MAX_LENGTH, `Der Name darf höchstens ${FOG_AREA_NAME_MAX_LENGTH} Zeichen lang sein.`)
      .regex(/^[^\p{Cc}]+$/u, 'Der Name darf keine Steuerzeichen enthalten.'),
  )

/** Ziel einer Fog-Aktion (spec.md "Begriffe"): Ad-hoc-Zellen, ein gespeicherter Bereich
 * oder die ganze Karte. */
export const FogTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('zellen'), cells: CellListSchema }),
  z.object({ kind: z.literal('bereich'), areaId: z.string().min(1) }),
  z.object({ kind: z.literal('alle') }),
])
export type FogTarget = z.infer<typeof FogTargetSchema>

/** Payload von `session:fog-set` (Client -> Server). */
export const SetFogInputSchema = z.object({
  sessionId: z.string(),
  revealed: z.boolean(),
  target: FogTargetSchema,
})
export type SetFogInput = z.infer<typeof SetFogInputSchema>

/** Payload von `session:fog-area-create` (Client -> Server). */
export const CreateFogAreaInputSchema = z.object({
  sessionId: z.string(),
  name: FogAreaNameSchema,
  cells: CellListSchema,
})
export type CreateFogAreaInput = z.infer<typeof CreateFogAreaInputSchema>

/** Payload von `session:fog-area-delete` (Client -> Server). */
export const DeleteFogAreaInputSchema = z.object({
  sessionId: z.string(),
  areaId: z.string(),
})
export type DeleteFogAreaInput = z.infer<typeof DeleteFogAreaInputSchema>

/** Bereichsdarstellung (spec.md "Begriffe"): die Zellen selbst verlassen den Server nicht -
 * nur `cellCount` und das abgeleitete `revealed`. */
export const FogAreaViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  cellCount: z.number().int(),
  revealed: z.boolean(),
})
export type FogAreaView = z.infer<typeof FogAreaViewSchema>

/** Fog-Darstellung (spec.md "Begriffe"): `areas` ist `null`, wenn dieser Empfaenger keine
 * Bereiche sehen darf (jeder ausser dem Spielleiter, `constitution.md` §9.2) - erzeugt durch
 * `redactFog`, niemals direkt gesetzt. */
export const FogStateSchema = z.object({
  instanceId: z.string(),
  version: z.number().int(),
  revealed: z.array(CellSchema),
  areas: z.array(FogAreaViewSchema).nullable(),
})
export type FogState = z.infer<typeof FogStateSchema>

/** Acknowledgement der drei Fog-Ereignisse (spec.md "Drahtformat"). */
export type FogAck = { ok: true; fog: FogState } | { ok: false; message: string }

/** Payload von `session:fog` (Server -> Client, spec.md "Drahtformat"). `fog` ist `null`
 * ohne aktive Karteninstanz. */
export interface FogEvent {
  sessionId: string
  fog: FogState | null
}

/** Ereignisnamen auf der Leitung - eine Quelle fuer Client und Server (spec.md
 * "Drahtformat"). */
export const SESSION_FOG_EVENTS = {
  set: 'session:fog-set',
  areaCreate: 'session:fog-area-create',
  areaDelete: 'session:fog-area-delete',
  fog: 'session:fog',
} as const

/** Werkzeuge der Fog-Verwaltung im Raum (design.md D6, Requirement "Fog-Ansicht im
 * Raum") - `schwenken` ist der Ausgangszustand. */
export const FOG_TOOLS = ['schwenken', 'aufdecken', 'verdecken', 'bereich'] as const
export const FogToolSchema = z.enum(FOG_TOOLS)
export type FogTool = z.infer<typeof FogToolSchema>

/** Alle Zellen des Rechtecks zwischen zwei Zellen, beide Ecken einschliesslich - Reihenfolge
 * der Argumente ist egal (design.md D2). Benutzt von der Canvas-Fassade fuer das Ziehen mit
 * einem Fog-Werkzeug. */
export function cellsInRange(a: Cell, b: Cell): Cell[] {
  const minCol = Math.min(a.col, b.col)
  const maxCol = Math.max(a.col, b.col)
  const minRow = Math.min(a.row, b.row)
  const maxRow = Math.max(a.row, b.row)
  const cells: Cell[] = []
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      cells.push({ col, row })
    }
  }
  return cells
}

/** Ob ein Bereich als aufgedeckt gilt: genau dann, wenn jede seiner Zellen in der Menge der
 * aufgedeckten Zellen liegt (spec.md "Begriffe": "Bereich gilt als aufgedeckt") - abgeleitet,
 * nicht gespeichert (design.md D1/D3). */
export function isAreaRevealed(areaCells: Cell[], revealedKeys: Set<string>): boolean {
  return areaCells.every((cell) => revealedKeys.has(cellKey(cell)))
}

/** Filtert eine Fog-Darstellung fuer einen Empfaenger (design.md D2, constitution.md §9.2):
 * der Spielleiter sieht sie unveraendert (inklusive `areas`), jeder andere Empfaenger erhaelt
 * `areas: null` - die Bereiche sind Vorbereitung des Spielleiters und keine Information fuer
 * Dritte. Reine Funktion, keine DB. Die Rolle ist strukturell kompatibel mit `MemberRole`
 * (`shared/session.ts`), ohne diese Datei von dort importieren zu muessen. */
export function redactFog(fog: FogState, role: 'spielleiter' | 'spieler'): FogState {
  if (role === 'spielleiter') {
    return fog
  }
  return { ...fog, areas: null }
}
