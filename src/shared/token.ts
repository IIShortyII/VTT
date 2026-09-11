import { z } from 'zod'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D1, Folgeregel zu Verzeichnisschnitt D1). Sie
// importiert nur `zod`, keine Zirkularitaet zu `session.ts` (design.md D4).
//
// Begriffe siehe specs/session-token/spec.md: "Token", "Name", "Farbe", "Symbol", "Größe",
// "Zelle", "Aktive Instanz", "Tokendarstellung", "Tokenbestand".

/** Fester Symbolkatalog (spec.md "Begriffe") - gespeichert wird der Katalogeintrag selbst
 * (das Emoji), nicht ein Schluesselwort (design.md D1). */
export const TOKEN_ICONS = ['⚔️', '🛡️', '💀', '🐉', '🧙', '🏹', '👑', '🐺', '🕷️', '🔥'] as const
export const TokenIconSchema = z.enum(TOKEN_ICONS)
export type TokenIcon = z.infer<typeof TokenIconSchema>

export const TOKEN_SIZE_MIN = 1
export const TOKEN_SIZE_MAX = 4
export const TOKEN_NAME_MAX_LENGTH = 40

/** Tokendarstellung (spec.md "Begriffe"): `icon` ist ein Katalogeintrag oder `null`. */
export const TokenSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  name: z.string(),
  color: z.string(),
  icon: TokenIconSchema.nullable(),
  size: z.number(),
  col: z.number(),
  row: z.number(),
})
export type Token = z.infer<typeof TokenSchema>

const TOKEN_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/**
 * Payload von `session:token-create` (design.md D4). `name` wie `AliasInputSchema` aus
 * `session.ts`: getrimmt, 1-40 Zeichen, keine Steuerzeichen. `color` als Hex-Wert,
 * gespeichert in Kleinschreibung. `icon` nullable (nicht optional) - ein bewusstes `null`
 * ist "kein Symbol" (Muster wie `instanceId` in `session-map.ts`). `col`/`row` ganzzahlig
 * ohne Bereich - negative Werte und Zellen ausserhalb des Bilds sind zulaessig.
 */
export const CreateTokenInputSchema = z.object({
  sessionId: z.string(),
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, 'Der Name muss mindestens 1 Zeichen lang sein.')
        .max(TOKEN_NAME_MAX_LENGTH, `Der Name darf höchstens ${TOKEN_NAME_MAX_LENGTH} Zeichen lang sein.`)
        .regex(/^[^\p{Cc}]+$/u, 'Der Name darf keine Steuerzeichen enthalten.'),
    ),
  color: z
    .string()
    .regex(TOKEN_COLOR_PATTERN, 'Die Farbe muss ein Hex-Wert wie #3366ff sein.')
    .transform((value) => value.toLowerCase()),
  icon: TokenIconSchema.nullable(),
  size: z.number().int().min(TOKEN_SIZE_MIN).max(TOKEN_SIZE_MAX),
  col: z.number().int(),
  row: z.number().int(),
})
export type CreateTokenInput = z.infer<typeof CreateTokenInputSchema>

/** Payload von `session:token-move` (design.md D4). */
export const MoveTokenInputSchema = z.object({
  sessionId: z.string(),
  tokenId: z.string(),
  col: z.number().int(),
  row: z.number().int(),
})
export type MoveTokenInput = z.infer<typeof MoveTokenInputSchema>

/** Payload von `session:token-remove` (design.md D4). */
export const RemoveTokenInputSchema = z.object({
  sessionId: z.string(),
  tokenId: z.string(),
})
export type RemoveTokenInput = z.infer<typeof RemoveTokenInputSchema>

/** Acknowledgement von `session:token-create`. */
export type CreateTokenAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-move`. */
export type MoveTokenAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-remove`. */
export type RemoveTokenAck = { ok: true } | { ok: false; message: string }

/** Payload von `session:tokens` (Server -> Client, spec.md "Drahtformat"). */
export interface TokensEvent {
  sessionId: string
  tokens: Token[]
}

/** Ereignisnamen auf der Leitung - eine Quelle fuer Client und Server (spec.md
 * "Drahtformat"). */
export const SESSION_TOKEN_EVENTS = {
  create: 'session:token-create',
  move: 'session:token-move',
  remove: 'session:token-remove',
  tokens: 'session:tokens',
} as const
