import type { PrismaClient } from '@prisma/client'

import { GridTypeSchema, type Grid, type MapSummary } from '../../shared/map.js'

// Reine Regeln und die Ladefunktionen fuer Kartenrouten (design.md D4, D6): `findOwnMap` -
// es gibt keinen Codepfad, der eine fremde Karte in der Hand haelt (constitution.md §9.2).
// add-fog-of-war (#16, design.md D5): `findViewableMap` entfaellt - die Bildroute der
// Kartenbibliothek liefert wieder ausschliesslich dem Besitzer; ein Mitglied erreicht das
// Bild der aktiven Karte ausschliesslich ueber `GET /api/sessions/:id/map-image`
// (`server/session/map-image.ts`, `session-fog`).

/** Ausschnitt einer `GameMap`-Zeile, den `toMapSummary` braucht - lose gekoppelt an Prisma,
 * damit diese Datei ohne Testinhalt ueber die reine Form nachvollziehbar bleibt (Muster wie
 * `server/session/rules.ts`, `GameSessionLike`). */
export interface GameMapLike {
  id: string
  name: string
  imageFile: string | null
  gridType: string
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
}

/** Aussendarstellung einer Karte (spec.md "Drahtformat", design.md D1): das Raster wird aus
 * den vier Spalten zu einem verschachtelten Objekt zusammengesetzt, der Typ durch das Schema
 * geparst statt blind gecastet - eine unerwartete DB-Zeile faellt hier auf, nicht erst beim
 * Client (Muster wie `toSessionSummary`). */
export function toMapSummary(map: GameMapLike): MapSummary {
  const grid: Grid = {
    type: GridTypeSchema.parse(map.gridType),
    size: map.gridSize,
    offsetX: map.gridOffsetX,
    offsetY: map.gridOffsetY,
  }
  return {
    id: map.id,
    name: map.name,
    hasImage: map.imageFile !== null,
    grid,
  }
}

/**
 * Laedt eine Karte, aber nur, wenn `userId` ihr Besitzer ist - die Besitzerpruefung ist Teil
 * der Abfrage (`findFirst` mit `ownerId` in der `where`-Klausel), nicht ein `if` danach
 * (design.md D4). Ohne Treffer `null`, egal ob die Karte einem anderen Nutzer gehoert oder
 * gar nicht existiert - fuer den Aufrufer nicht unterscheidbar (constitution.md §9.2).
 */
export async function findOwnMap(prisma: PrismaClient, userId: string, id: string) {
  return prisma.gameMap.findFirst({ where: { id, ownerId: userId } })
}
