-- session-token (#14): Token - eine Figur auf einer Karteninstanz (design.md D1). Haengt an
-- der Instanz, nicht an der Spielsitzung, mit `ON DELETE CASCADE` - ein Aushaengen der
-- Instanz loescht ihre Tokens mit. `icon` ist nullable (kein Symbol), `col`/`row` sind die
-- Ankerzelle im Raster der Karte.

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "size" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Token_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "MapInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Token_instanceId_idx" ON "Token"("instanceId");
