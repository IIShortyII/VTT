-- session-map (#50): Karteninstanz - Verweis einer Spielsitzung auf eine Bibliothekskarte
-- mit eigener Identitaet (design.md D1). Nullable Spalte an "GameSession" reicht per
-- ALTER TABLE ADD COLUMN (kein Tabellen-Neuaufbau noetig, anders als bei einer NOT-NULL-
-- Spalte ohne Default); der Unique-Index kommt als eigene Anweisung (design.md Migration
-- Plan). Bestehende Zeilen bleiben unangetastet.

-- CreateTable
CREATE TABLE "MapInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapInstance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapInstance_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "GameMap" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MapInstance_sessionId_mapId_key" ON "MapInstance"("sessionId", "mapId");

-- CreateIndex
CREATE INDEX "MapInstance_mapId_idx" ON "MapInstance"("mapId");

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN "activeInstanceId" TEXT REFERENCES "MapInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_activeInstanceId_key" ON "GameSession"("activeInstanceId");
