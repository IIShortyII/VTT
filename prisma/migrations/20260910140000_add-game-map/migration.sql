-- CreateTable
CREATE TABLE "GameMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageFile" TEXT,
    "imageType" TEXT,
    "gridType" TEXT NOT NULL,
    "gridSize" INTEGER NOT NULL,
    "gridOffsetX" INTEGER NOT NULL,
    "gridOffsetY" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameMap_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GameMap_ownerId_idx" ON "GameMap"("ownerId");
