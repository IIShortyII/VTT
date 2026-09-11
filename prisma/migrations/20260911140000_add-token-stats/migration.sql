-- add-token-stats (#61): fuenf nullable Wertespalten an "Token" (design.md D1) - "null"
-- heisst "nicht gesetzt", bestehende Zeilen bleiben unveraendert. Kein Tabellen-Neuaufbau
-- noetig (Muster wie "ownerId" in 20260911130000_add-token-owner).

-- AlterTable
ALTER TABLE "Token" ADD COLUMN "hp" INTEGER;
ALTER TABLE "Token" ADD COLUMN "hpMax" INTEGER;
ALTER TABLE "Token" ADD COLUMN "tempHp" INTEGER;
ALTER TABLE "Token" ADD COLUMN "ac" INTEGER;
ALTER TABLE "Token" ADD COLUMN "initiative" INTEGER;

-- add-token-stats (#61): Markierungen als eigene Tabelle statt JSON-String (design.md D1) -
-- "je Token eindeutig" ist damit eine Datenbank-Eigenschaft (Unique-Index), "onDelete
-- Cascade" nimmt die Markierungen beim Entfernen des Tokens mit.

-- CreateTable
CREATE TABLE "TokenCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "TokenCondition_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenCondition_tokenId_label_key" ON "TokenCondition"("tokenId", "label");

-- CreateIndex
CREATE INDEX "TokenCondition_tokenId_idx" ON "TokenCondition"("tokenId");
