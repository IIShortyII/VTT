import { randomInt as cryptoRandomInt } from 'node:crypto'

import {
  GameSessionStatusSchema,
  SESSION_CODE_ALPHABET,
  SESSION_CODE_LENGTH,
  type GameSessionStatus,
  type MemberRole,
  type SessionSummary,
} from '../../shared/session.js'

// Reine, framework-freie Regeln fuer Spielsitzungen: Code-Erzeugung, Aussendarstellung.
// Keine Fastify-, keine Prisma-Abhaengigkeit ausser den Typen - analog zu auth/rules.ts
// (design.md D1, Folgeregel "Regeln von Glue trennen").

export type RandomInt = (max: number) => number

/**
 * Erzeugt einen Sitzungscode aus `SESSION_CODE_ALPHABET` (design.md D4). `randomInt` liefert
 * per Aufruf eine ganze Zahl aus `[0, max)` - Default ist `crypto.randomInt`, ein Test kann
 * eine deterministische Variante injizieren.
 */
export function generateCode(randomInt: RandomInt = (max) => cryptoRandomInt(max)): string {
  let code = ''
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)]
  }
  return code
}

/** Normalisiert einen eingegebenen Code wie `shared/session.ts` (Leerraum entfernt,
 * Grossbuchstaben) - falls ein Aufrufer den Wert nicht schon durch das zod-Schema geschickt
 * hat. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase()
}

/** Ausschnitt einer `GameSession`-Zeile, den `toSessionSummary` braucht - lose gekoppelt an
 * Prisma, damit diese Datei ohne `@prisma/client` testbar bleibt. */
export interface GameSessionLike {
  id: string
  name: string
  status: string
  code: string
}

/**
 * Aussendarstellung einer Spielsitzung fuer einen bestimmten Empfaenger: `code` nur fuer den
 * Spielleiter (design.md D4, constitution.md §9.2). Der Status wird durch das Schema
 * geparst statt blind gecastet - eine unerwartete DB-Zeile faellt hier auf, nicht erst beim
 * Client (design.md D2).
 */
export function toSessionSummary(gameSession: GameSessionLike, role: MemberRole): SessionSummary {
  const status: GameSessionStatus = GameSessionStatusSchema.parse(gameSession.status)
  return {
    id: gameSession.id,
    name: gameSession.name,
    status,
    role,
    ...(role === 'spielleiter' ? { code: gameSession.code } : {}),
  }
}
