import { ErrorOutputSchema } from '../../shared/auth.js'
import { MapInstanceSchema, MountMapInputSchema, type MapInstance } from '../../shared/session-map.js'

// Die Aufrufe gegen /api/sessions/:id/maps* (design.md D7). `credentials: 'include'` ist
// Pflicht, sonst sendet der Browser das Sitzungscookie nicht mit - wie in
// `client/session/api.ts`. Antworten werden gegen die Schemas aus `shared/session-map.ts`
// geprueft statt Server-Objekte blind durchzureichen (constitution.md §9.1).

export type ListSessionMapsResult = { ok: true; instances: MapInstance[] } | { ok: false; message: string }
export type MountMapResult = { ok: true; instance: MapInstance } | { ok: false; message: string; field?: string }
export type UnmountMapResult = { ok: true } | { ok: false; message: string }

/** `GET /api/sessions/:id/maps` - alle Karteninstanzen dieser Spielsitzung (Requirement
 * "Eingehängte Karten auflisten"), nur fuer den Spielleiter erreichbar. */
export async function listSessionMaps(sessionId: string): Promise<ListSessionMapsResult> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/maps`, { credentials: 'include' })
  const data: unknown = await response.json()
  if (!response.ok) {
    const error = ErrorOutputSchema.parse(data)
    return { ok: false, message: error.message }
  }
  return { ok: true, instances: MapInstanceSchema.array().parse(data) }
}

/** `POST /api/sessions/:id/maps` - haengt eine eigene Bibliothekskarte ein (Requirement
 * "Karte einhängen"). */
export async function mountMap(sessionId: string, mapId: string): Promise<MountMapResult> {
  const parsed = MountMapInputSchema.safeParse({ mapId })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: 'mapId' }
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(parsed.data),
  })
  const data: unknown = await response.json()
  if (!response.ok) {
    const error = ErrorOutputSchema.parse(data)
    return { ok: false, message: error.message, field: error.field }
  }
  return { ok: true, instance: MapInstanceSchema.parse(data) }
}

/** `DELETE /api/sessions/:id/maps/:instanceId` - haengt eine Karteninstanz aus (Requirement
 * "Karte aushängen"). */
export async function unmountMap(sessionId: string, instanceId: string): Promise<UnmountMapResult> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/maps/${encodeURIComponent(instanceId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (response.status === 204 || response.ok) {
    return { ok: true }
  }
  const data: unknown = await response.json()
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message }
}
