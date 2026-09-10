import type { PrismaClient } from '@prisma/client'

import { GridTypeSchema, type Grid, type MapSummary } from '../../shared/map.js'

// Reine Regeln und die Ladefunktionen fuer Kartenrouten (design.md D4, D6): `findOwnMap` -
// es gibt keinen Codepfad, der eine fremde Karte in der Hand haelt (constitution.md §9.2).
// `findViewableMap` (session-map #50) erweitert das um "oder Mitglied einer Spielsitzung, in
// der die Karte gerade aktiv ist" - enger als "eingehaengt" (design.md D6): eine
// eingehaengte, aber nicht aktive Karte ist Vorbereitung des Spielleiters (§9.2) und bleibt
// unsichtbar.

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

/**
 * Laedt eine Karte, wenn `userId` entweder ihr Besitzer ist oder Mitglied (jeder Rolle)
 * einer Spielsitzung, deren aktive Karte eine Instanz dieser Karte ist (session-map #50,
 * design.md D6). Die Pruefung ist Teil der Abfrage, nicht ein `if` danach - pro Anfrage neu
 * ausgewertet (constitution.md §9.3): ein Kartenwechsel entzieht die Berechtigung mit der
 * naechsten Anfrage. Ohne Treffer `null`, egal ob fremd, unbekannt oder nur eingehaengt ohne
 * aktiv zu sein - fuer den Aufrufer nicht unterscheidbar (§9.2).
 */
export async function findViewableMap(prisma: PrismaClient, userId: string, id: string) {
  return prisma.gameMap.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { instances: { some: { activeIn: { memberships: { some: { userId } } } } } }],
    },
  })
}
