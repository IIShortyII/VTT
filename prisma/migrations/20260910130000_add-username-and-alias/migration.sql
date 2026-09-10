-- add-username-and-alias (#45): Nutzername (Pflicht, instanzweit einmalig ueber einen
-- normalisierten Schluessel) und Alias je Mitgliedschaft (optional). Es gibt keine
-- Bestandskonten (Entwicklungsphase, siehe design.md D3) - das INSERT...SELECT scheitert
-- absichtlich, falls doch Zeilen in "User" existieren, statt stumm einen Nutzernamen zu
-- erfinden.

-- RedefineTables (SQLite kann keine NOT-NULL-Spalte ohne Default per ALTER TABLE ergaenzen)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("id", "email", "createdAt") SELECT "id", "email", "createdAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "alias" TEXT;
