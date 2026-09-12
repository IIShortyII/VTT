-- add-measure-draw (#11): Anmerkungen (Messungen und Zeichnungen) einer Karteninstanz
-- (design.md D1) - "Punkte" als JSON-Text in einer Spalte, kein Tabellen-Neuaufbau je Punkt.
-- "ON DELETE CASCADE" zur Instanz (Aushaengen loescht die Anmerkungen mit), "ON DELETE SET
-- NULL" zum Nutzer (ein geloeschter Nutzer hinterlaesst eine Anmerkung mit Urheber "null") -
-- Muster wie "Token" in 20260911130000_add-token-owner und "FogArea"/"FogCell" in
-- 20260911160000_add-fog-of-war.

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "color" TEXT,
    "points" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Annotation_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "MapInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Annotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Annotation_instanceId_idx" ON "Annotation"("instanceId");
