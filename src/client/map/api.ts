import { ErrorOutputSchema } from '../../shared/auth.js'
import {
  CreateMapInputSchema,
  MapSummarySchema,
  UpdateMapInputSchema,
  type CreateMapInput,
  type MapSummary,
  type UpdateMapInput,
} from '../../shared/map.js'

// Die Aufrufe gegen /api/maps* (design.md D9). `credentials: 'include'` ist Pflicht, sonst
// sendet der Browser das Sitzungscookie nicht mit - wie in `client/session/api.ts`. Antworten
// werden gegen die Schemas aus `shared/map.ts` geprueft statt Server-Objekte blind
// durchzureichen (constitution.md §9.1).

export type MapResult = { ok: true; map: MapSummary } | { ok: false; message: string; field?: string }
export type ListMapsResult = { ok: true; maps: MapSummary[] } | { ok: false; message: string }
export type DeleteMapResult = { ok: true } | { ok: false; message: string }

/** Erstes Segment eines zod-Issue-Pfads als `field` - wie `server/map/routes.ts`, damit ein
 * Rasterfehler `grid` liefert, nicht `grid.size`. */
function topLevelField(path: ReadonlyArray<string | number>): string | undefined {
  return path.length > 0 ? String(path[0]) : undefined
}

async function parseMapResult(response: Response): Promise<MapResult> {
  const data: unknown = await response.json()
  if (response.ok) {
    return { ok: true, map: MapSummarySchema.parse(data) }
  }
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message, field: error.field }
}

/** `POST /api/maps` - legt eine neue Karte an, der Aufrufer wird Besitzer (Requirement
 * "Karte anlegen"). */
export async function createMap(input: CreateMapInput): Promise<MapResult> {
  const parsed = CreateMapInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: topLevelField(issue.path) }
  }
  const response = await fetch('/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(parsed.data),
  })
  return parseMapResult(response)
}

/** `GET /api/maps` - alle Karten des angemeldeten Nutzers (Requirement "Meine Karten"). */
export async function listMaps(): Promise<ListMapsResult> {
  const response = await fetch('/api/maps', { credentials: 'include' })
  const data: unknown = await response.json()
  if (!response.ok) {
    const error = ErrorOutputSchema.parse(data)
    return { ok: false, message: error.message }
  }
  return { ok: true, maps: MapSummarySchema.array().parse(data) }
}

/** `PATCH /api/maps/:id` - aendert Name und/oder Raster einer Karte (Requirement "Karte
 * ändern"). Was die Kartenansicht zeigt, kommt aus der Antwort - nie aus der Eingabe
 * (constitution.md §9.1). */
export async function updateMap(id: string, input: UpdateMapInput): Promise<MapResult> {
  const parsed = UpdateMapInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: topLevelField(issue.path) }
  }
  const response = await fetch(`/api/maps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(parsed.data),
  })
  return parseMapResult(response)
}

/** `PUT /api/maps/:id/image` - setzt das Kartenbild (Requirement "Kartenbild hochladen").
 * Roher Bild-Body, kein Multipart (design.md D3) - der `Content-Type` kommt aus `file.type`. */
export async function uploadMapImage(id: string, file: File): Promise<MapResult> {
  const response = await fetch(`/api/maps/${encodeURIComponent(id)}/image`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    credentials: 'include',
    body: file,
  })
  return parseMapResult(response)
}

/** `DELETE /api/maps/:id` - loescht eine Karte samt Bild (Requirement "Karte löschen"). */
export async function deleteMap(id: string): Promise<DeleteMapResult> {
  const response = await fetch(`/api/maps/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
  if (response.status === 204 || response.ok) {
    return { ok: true }
  }
  const data: unknown = await response.json()
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message }
}

/** URL des Kartenbilds hinter der geprueften Route (Requirement "Kartenbild abrufen") - kein
 * statischer Pfad, jede Anfrage prueft den Besitzer erneut (constitution.md §9.2). */
export function mapImageUrl(id: string): string {
  return `/api/maps/${encodeURIComponent(id)}/image`
}
