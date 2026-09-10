import { z } from 'zod'

import { GridSchema } from './map.js'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D1, Folgeregel zu Verzeichnisschnitt D1). Sie
// importiert nur aus `map.ts`, nie aus `session.ts` - `session.ts` importiert umgekehrt von
// hier (design.md D5), eine Zirkularitaet waere sonst unvermeidbar.
//
// Begriffe siehe specs/session-map/spec.md: "Karteninstanz", "Position", "Aktive Karte",
// "Instanzdarstellung", "Aktive-Karte-Darstellung".

/** Instanzdarstellung (spec.md "Begriffe"): `name`, `hasImage` und `grid` stammen von der
 * Karte. Nur der Spielleiter erhaelt sie. */
export const MapInstanceSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  name: z.string(),
  hasImage: z.boolean(),
  grid: GridSchema,
  position: z.number(),
})
export type MapInstance = z.infer<typeof MapInstanceSchema>

/** Aktive-Karte-Darstellung (spec.md "Begriffe"): erreicht jeden Teilnehmer im Raum - sie
 * enthaelt nichts, was nicht auch auf dem Canvas sichtbar waere (constitution.md §9.2). */
export const ActiveMapSchema = z.object({
  instanceId: z.string(),
  mapId: z.string(),
  name: z.string(),
  hasImage: z.boolean(),
  grid: GridSchema,
})
export type ActiveMap = z.infer<typeof ActiveMapSchema>

/** `POST /api/sessions/:id/maps` (Requirement "Karte einhaengen"). */
export const MountMapInputSchema = z.object({
  mapId: z.string().min(1, 'Es muss eine Karte angegeben werden.'),
})
export type MountMapInput = z.infer<typeof MountMapInputSchema>

/** Payload von `session:activate-map` (Client -> Server). `instanceId` ist `nullable`, nicht
 * `optional` - ein fehlendes Feld ist ungueltig, ein bewusstes `null` ist "keine Karte"
 * (design.md D5). */
export const ActivateMapInputSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string().nullable(),
})
export type ActivateMapInput = z.infer<typeof ActivateMapInputSchema>

/** Acknowledgement von `session:activate-map`. */
export type ActivateMapAck = { ok: true; map: ActiveMap | null } | { ok: false; message: string }

/** Payload von `session:map` (Server -> Client). */
export interface MapEvent {
  sessionId: string
  map: ActiveMap | null
}

/** Ereignisnamen auf der Leitung - eine Quelle fuer Client und Server (spec.md
 * "Drahtformat"). */
export const SESSION_MAP_EVENTS = {
  activate: 'session:activate-map',
  map: 'session:map',
} as const
