-- add-token-assignment (#15): nullable Spalte "ownerId" an "Token" - "null" heisst "gehoert
-- dem Spielleiter", also das bisherige Verhalten fuer bestehende Zeilen. Kein Tabellen-
-- Neuaufbau noetig (Muster wie "activeInstanceId" in 20260910150000_add-map-instance).
-- "ON DELETE SET NULL": ein geloeschter Nutzer hinterlaesst ein besitzerloses Token.

-- AlterTable
ALTER TABLE "Token" ADD COLUMN "ownerId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Token_ownerId_idx" ON "Token"("ownerId");
