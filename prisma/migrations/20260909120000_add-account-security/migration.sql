-- AlterTable
ALTER TABLE "Account" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Account" ADD COLUMN "lockedUntil" DATETIME;
