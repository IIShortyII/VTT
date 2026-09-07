import { PrismaClient } from '@prisma/client'

// Eine geteilte PrismaClient-Instanz fuer den Produktivbetrieb (src/server/index.ts). Ein
// Test, der eine zweite, unabhaengige Serverinstanz auf derselben DB-Datei braucht (etwa
// das Neustart-Szenario, design.md D10), injiziert stattdessen seine eigene Instanz ueber
// `buildApp({ prisma })` statt diese zu importieren.
export const prisma = new PrismaClient()
