-- add-fog-of-war (#16): "fogVersion" an "MapInstance" als Cache-Schluessel des maskierten
-- Bilds (design.md D1) - Spalte mit Default, kein Tabellen-Neuaufbau, bestehende Zeilen
-- bekommen 0 (Muster wie "ownerId" in 20260911130000_add-token-owner).

-- AlterTable
ALTER TABLE "MapInstance" ADD COLUMN "fogVersion" INTEGER NOT NULL DEFAULT 0;

-- add-fog-of-war (#16): aufgedeckte Zellen einer Karteninstanz, eine Zeile je Zelle
-- (design.md D1) - "keine Zelle doppelt" ist der Unique-Index, nicht eine Regel im Code.

-- CreateTable
CREATE TABLE "FogCell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    CONSTRAINT "FogCell_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "MapInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FogCell_instanceId_col_row_key" ON "FogCell"("instanceId", "col", "row");

-- add-fog-of-war (#16): benannte, gespeicherte Bereiche einer Karteninstanz plus ihre Zellen
-- (design.md D1) - "revealed" ist abgeleitet (siehe shared/fog.ts, redactFog/toFogState),
-- deshalb keine eigene Spalte dafuer.

-- CreateTable
CREATE TABLE "FogArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FogArea_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "MapInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FogArea_instanceId_idx" ON "FogArea"("instanceId");

-- CreateTable
CREATE TABLE "FogAreaCell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "areaId" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    CONSTRAINT "FogAreaCell_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FogArea" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FogAreaCell_areaId_col_row_key" ON "FogAreaCell"("areaId", "col", "row");
