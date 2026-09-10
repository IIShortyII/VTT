import type { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'

import { SESSION_MAP_EVENTS, type ActiveMap } from '../../shared/session-map.js'
import { toMapSummary, type GameMapLike } from '../map/rules.js'
import { roomName } from './room.js'

// Eine Stelle, die "was ist in dieser Spielsitzung aktiv" beantwortet und verteilt
// (design.md D4) - benutzt von `session:activate-map`, dem Aushaengen der aktiven Instanz,
// `session:enter` und der Weitergabe einer Rasteraenderung an aktive Raeume.

/** Ausschnitt, den `toActiveMap` braucht - eine Karteninstanz samt geladener Karte. */
export interface ActiveMapInstanceLike {
  id: string
  map: GameMapLike
}

/** Instanz plus Karte -> Aktive-Karte-Darstellung (design.md D4). */
export function toActiveMap(instance: ActiveMapInstanceLike): ActiveMap {
  const summary = toMapSummary(instance.map)
  return {
    instanceId: instance.id,
    mapId: summary.id,
    name: summary.name,
    hasImage: summary.hasImage,
    grid: summary.grid,
  }
}

/** Laedt die aktive Karte einer Spielsitzung, `null` ohne Zeiger (design.md D4). */
export async function loadActiveMap(prisma: PrismaClient, sessionId: string): Promise<ActiveMap | null> {
  const gameSession = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { activeInstance: { include: { map: true } } },
  })
  if (!gameSession?.activeInstance) {
    return null
  }
  return toActiveMap(gameSession.activeInstance)
}

/** Sendet `session:map` an alle Verbindungen im Raum dieser Spielsitzung (design.md D4). */
export function emitActiveMap(io: Server, sessionId: string, map: ActiveMap | null): void {
  io.to(roomName(sessionId)).emit(SESSION_MAP_EVENTS.map, { sessionId, map })
}

/**
 * Sendet die aktualisierte aktive Karte an jeden Raum, dessen Spielsitzung eine Instanz
 * dieser Karte gerade aktiv hat (design.md D4, D6, Requirement "Aenderung der
 * Bibliothekskarte erreicht aktive Raeume"). Aufruf aus `PATCH /api/maps/:id` nach dem
 * `update`. Raeume, in denen die Karte nur eingehaengt, aber nicht aktiv ist, bleiben still.
 */
export async function broadcastMapChanged(io: Server, prisma: PrismaClient, mapId: string): Promise<void> {
  const sessions = await prisma.gameSession.findMany({
    where: { activeInstance: { mapId } },
    include: { activeInstance: { include: { map: true } } },
  })
  for (const gameSession of sessions) {
    if (!gameSession.activeInstance) {
      continue
    }
    emitActiveMap(io, gameSession.id, toActiveMap(gameSession.activeInstance))
  }
}
