-- add-token-sharing (#62): Zielgruppen je Token und Stat als eigene Tabelle (design.md D1) -
-- je Empfaenger eine Zeile ("alle" = eine Zeile mit "userId" NULL, "keine" = keine Zeile).
-- Fasst nichts Bestehendes an - bestehende Tokens haben keine Zeilen und damit die
-- Zielgruppe "keine" fuer jeden Stat.

-- CreateTable
CREATE TABLE "TokenShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "stat" TEXT NOT NULL,
    "userId" TEXT,
    CONSTRAINT "TokenShare_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenShare_tokenId_stat_userId_key" ON "TokenShare"("tokenId", "stat", "userId");

-- CreateIndex
CREATE INDEX "TokenShare_tokenId_idx" ON "TokenShare"("tokenId");

-- CreateIndex
CREATE INDEX "TokenShare_userId_idx" ON "TokenShare"("userId");
