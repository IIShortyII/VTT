import { z } from 'zod'

import { cellKey } from './fog.js'
import type { Cell } from './grid.js'
import type { GridType } from './map.js'
import type { MemberRole } from './session.js'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D1, Folgeregel zu Verzeichnisschnitt D1). Sie
// importiert `zod`, `cellKey` (Wert) sowie die Typen `Cell` (`grid.ts`) und `GridType`
// (`map.ts`) - beide importieren selbst nichts Serverseitiges (add-token-fog-visibility #17,
// design.md D1) - und als Typ, add-token-assignment #15, design.md D2 - `MemberRole`
// aus `session.ts`; `session.ts` importiert bereits `Token` von hier, ein `import type` in
// Gegenrichtung erzeugt keinen Laufzeitzyklus.
//
// Begriffe siehe specs/session-token/spec.md: "Token", "Name", "Farbe", "Symbol", "Größe",
// "Zelle", "Zellen eines Tokens", "Sichtbares Token", "Aktive Instanz", "Tokendarstellung",
// "Tokenbestand", "Besitzer", "Stat", "Zielgruppe", "Freigaben".

/** Fester Symbolkatalog (spec.md "Begriffe") - gespeichert wird der Symbolname der
 * Icon-Registry (`client/ui/icons.ts`, add-icon-registry #85, design.md D3), nicht mehr
 * das Emoji selbst. `shared/` importiert weiterhin nichts aus `client/` - die Namen stehen
 * hier als Literale; `client/session/token-icons.ts` prueft per Typ, dass jeder ein
 * `IconName` ist. */
export const TOKEN_ICONS = ['fighter', 'guardian', 'undead', 'dragon', 'mage', 'archer', 'royal', 'beast', 'vermin', 'fire'] as const
export const TokenIconSchema = z.enum(TOKEN_ICONS)
export type TokenIcon = z.infer<typeof TokenIconSchema>

export const TOKEN_SIZE_MIN = 1
export const TOKEN_SIZE_MAX = 4
export const TOKEN_NAME_MAX_LENGTH = 40

// add-token-stats (#61, design.md D2): Grenzen der Markierungsliste - ein Kurztext von 1 bis
// 20 Zeichen, hoechstens 12 Markierungen je Token.
export const CONDITION_MAX_LENGTH = 20
export const CONDITIONS_MAX = 12

/** Eine Markierung (spec.md "Werte"): getrimmter Text, 1 bis 20 Zeichen, keine
 * Steuerzeichen - dasselbe Muster wie `name` in `CreateTokenInputSchema`. Der Server prueft
 * NICHT gegen den 5e-Katalog (`client/session/conditions.ts`) - der Katalog ist eine
 * Schnellwahl des Clients (spec.md Requirement "Markierungen setzen"). */
export const ConditionLabelSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, 'Die Markierung muss mindestens 1 Zeichen lang sein.')
      .max(CONDITION_MAX_LENGTH, `Die Markierung darf höchstens ${CONDITION_MAX_LENGTH} Zeichen lang sein.`)
      .regex(/^[^\p{Cc}]+$/u, 'Die Markierung darf keine Steuerzeichen enthalten.'),
  )

/** Die fuenf teilbaren Werte eines Tokens (add-token-sharing #62, design.md D2, spec.md
 * "Begriffe"): `hp` deckt `hp` UND `hpMax` gemeinsam ab - `hpMax` ist bewusst KEIN eigener
 * Stat. Reihenfolge wie in der Schnittstellentabelle (design.md D8). */
export const TOKEN_STATS = ['hp', 'tempHp', 'ac', 'initiative', 'conditions'] as const
export const TokenStatSchema = z.enum(TOKEN_STATS)
export type TokenStat = z.infer<typeof TokenStatSchema>

/** Zielgruppe eines Stats (add-token-sharing #62, design.md D2, spec.md "Begriffe"):
 * `'keine'` (niemand zusaetzlich), `'alle'` (jedes Mitglied) oder eine nicht-leere Liste
 * eindeutiger `userId`s. Eine leere Liste ist UNGUELTIG, nicht "keine" - der Client sendet
 * `'keine'` selbst (design.md D7), damit ist eine Liste in `shares` nie leer. */
export const TokenAudienceSchema = z.union([
  z.literal('keine'),
  z.literal('alle'),
  z
    .array(z.string())
    .min(1, 'Die Zielgruppe darf nicht leer sein.')
    .refine((ids) => new Set(ids).size === ids.length, 'Die Empfänger müssen sich unterscheiden.'),
])
export type TokenAudience = z.infer<typeof TokenAudienceSchema>

/** Die fuenf Zielgruppen eines Tokens als Objekt (add-token-sharing #62, design.md D2,
 * spec.md "Begriffe" "Freigaben"). */
export const TokenSharesSchema = z.object({
  hp: TokenAudienceSchema,
  tempHp: TokenAudienceSchema,
  ac: TokenAudienceSchema,
  initiative: TokenAudienceSchema,
  conditions: TokenAudienceSchema,
})
export type TokenShares = z.infer<typeof TokenSharesSchema>

/** Ausgangszustand "nichts geteilt" (add-token-sharing #62, design.md D2) - Rueckfall fuer
 * den Client und Baustein fuer Test-Fixtures. */
export const NO_SHARES: TokenShares = {
  hp: 'keine',
  tempHp: 'keine',
  ac: 'keine',
  initiative: 'keine',
  conditions: 'keine',
}

/** Tokendarstellung (spec.md "Begriffe"): `icon` ist ein Katalogeintrag oder `null`.
 * `ownerId` (add-token-assignment #15) ist die `userId` des Besitzers oder `null` ("gehört
 * dem Spielleiter") - fuer jeden Teilnehmer sichtbar, keine verdeckte Information
 * (constitution.md §9.2). add-token-stats (#61, design.md D2): die fuenf Wertefelder sind
 * ganze Zahlen oder `null` - "nicht gesetzt" ODER "fuer diesen Empfaenger verborgen",
 * ununterscheidbar (spec.md "Drahtformat"); `conditions` ist die Markierungsliste in
 * gespeicherter Reihenfolge. add-token-sharing (#62, design.md D2): `shares` traegt die
 * Freigaben fuer Spielleiter und Besitzer, `null` fuer jeden anderen Empfaenger - "wer sonst
 * noch sieht" ist keine Information fuer Dritte (constitution.md §9.2). */
export const TokenSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  name: z.string(),
  color: z.string(),
  icon: TokenIconSchema.nullable(),
  size: z.number(),
  col: z.number(),
  row: z.number(),
  ownerId: z.string().nullable(),
  hp: z.number().int().nullable(),
  hpMax: z.number().int().nullable(),
  tempHp: z.number().int().nullable(),
  ac: z.number().int().nullable(),
  initiative: z.number().int().nullable(),
  conditions: z.array(z.string()),
  shares: TokenSharesSchema.nullable(),
})
export type Token = z.infer<typeof TokenSchema>

const TOKEN_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/**
 * Payload von `session:token-create` (design.md D4). `name` wie `AliasInputSchema` aus
 * `session.ts`: getrimmt, 1-40 Zeichen, keine Steuerzeichen. `color` als Hex-Wert,
 * gespeichert in Kleinschreibung. `icon` nullable (nicht optional) - ein bewusstes `null`
 * ist "kein Symbol" (Muster wie `instanceId` in `session-map.ts`). `col`/`row` ganzzahlig
 * ohne Bereich - negative Werte und Zellen ausserhalb des Bilds sind zulaessig. Kein
 * `ownerId` - ein neu angelegtes Token gehoert dem Spielleiter (add-token-assignment #15,
 * spec.md "Neu angelegtes Token gehört dem Spielleiter"). Keine Werte - ein neu angelegtes
 * Token hat keine (add-token-stats #61, spec.md "Neu angelegtes Token hat keine Werte").
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

/**
 * Payload von `session:token-assign` (add-token-assignment #15, design.md D2). `ownerId`
 * nullable, nicht optional - ein bewusstes `null` ist "zurücknehmen", ein fehlendes Feld ist
 * ungültig (Muster wie `instanceId` in `session-map.ts`).
 */
export const AssignTokenInputSchema = z.object({
  sessionId: z.string(),
  tokenId: z.string(),
  ownerId: z.string().nullable(),
})
export type AssignTokenInput = z.infer<typeof AssignTokenInputSchema>

/**
 * Payload von `session:token-stats` (add-token-stats #61, design.md D2): ein Teilobjekt -
 * jedes Feld ist optional (fehlend = "unverändert") und nullable (`null` = "löschen"),
 * `nullable().optional()` in dieser Reihenfolge (Muster wie `ownerId` in
 * `AssignTokenInputSchema`, erweitert um "fehlend"). Die Kopplung `hp`/`hpMax` steht NICHT
 * hier - sie haengt vom gespeicherten Stand ab und wird im Handler geprueft (design.md D3).
 */
export const TokenStatsInputSchema = z.object({
  sessionId: z.string(),
  tokenId: z.string(),
  hp: z.number().int().min(0).nullable().optional(),
  hpMax: z.number().int().min(1).nullable().optional(),
  tempHp: z.number().int().min(0).nullable().optional(),
  ac: z.number().int().min(0).nullable().optional(),
  initiative: z.number().int().nullable().optional(),
})
export type TokenStatsInput = z.infer<typeof TokenStatsInputSchema>
/** Fuer Fassade und Panel: das Teilobjekt ohne die Adressierung (design.md D2). */
export type TokenStatsPatch = Omit<TokenStatsInput, 'sessionId' | 'tokenId'>

/**
 * Payload von `session:token-conditions` (add-token-stats #61, design.md D2): die
 * vollstaendige Liste, die die bisherige ersetzt. Eindeutigkeit NACH dem Trimmen, deshalb
 * `refine` auf dem Array, nicht auf dem Element.
 */
export const TokenConditionsInputSchema = z.object({
  sessionId: z.string(),
  tokenId: z.string(),
  conditions: z
    .array(ConditionLabelSchema)
    .max(CONDITIONS_MAX, `Es sind höchstens ${CONDITIONS_MAX} Markierungen erlaubt.`)
    .refine((labels) => new Set(labels).size === labels.length, 'Die Markierungen müssen sich unterscheiden.'),
})
export type TokenConditionsInput = z.infer<typeof TokenConditionsInputSchema>

/**
 * Payload von `session:token-share` (add-token-sharing #62, design.md D2): ersetzt die
 * Zielgruppe eines Stats an einem Token als Ganzes.
 */
export const ShareTokenInputSchema = z.object({
  sessionId: z.string(),
  tokenId: z.string(),
  stat: TokenStatSchema,
  audience: TokenAudienceSchema,
})
export type ShareTokenInput = z.infer<typeof ShareTokenInputSchema>

/** Acknowledgement von `session:token-create`. */
export type CreateTokenAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-move`. */
export type MoveTokenAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-remove`. */
export type RemoveTokenAck = { ok: true } | { ok: false; message: string }

/** Acknowledgement von `session:token-assign` (add-token-assignment #15, design.md D2). */
export type AssignTokenAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-stats` (add-token-stats #61, design.md D2). */
export type TokenStatsAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-conditions` (add-token-stats #61, design.md D2). */
export type TokenConditionsAck = { ok: true; token: Token } | { ok: false; message: string }

/** Acknowledgement von `session:token-share` (add-token-sharing #62, design.md D2). */
export type ShareTokenAck = { ok: true; token: Token } | { ok: false; message: string }

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
  assign: 'session:token-assign',
  stats: 'session:token-stats',
  conditions: 'session:token-conditions',
  share: 'session:token-share',
  tokens: 'session:tokens',
} as const

/**
 * Wer ein Token bewegen darf (add-token-assignment #15, design.md D2) - die EINE Regel, die
 * Server (Entscheidung, `server/session/tokens.ts`) und Client (Greifbarkeit,
 * `client/map/canvas.ts`, `client/session/SessionRoom.tsx`) gleichermassen benutzen. Der
 * Spielleiter darf jedes Token, ein Spieler nur die Tokens, deren `ownerId` seine eigene
 * `userId` ist. `Pick<Token, 'ownerId'>`, damit der Server sie mit der Prisma-Zeile
 * aufrufen kann, ohne vorher `toToken` zu bemuehen.
 */
export interface TokenMover {
  role: MemberRole
  userId: string
}

export function canMoveToken(token: Pick<Token, 'ownerId'>, mover: TokenMover): boolean {
  return mover.role === 'spielleiter' || token.ownerId === mover.userId
}

/**
 * Wer die Zielgruppe eines Tokenwerts setzen darf (add-token-sharing #62, design.md D2) -
 * heute derselbe Koerper wie `canMoveToken`, aber ein eigener Name: eine spaetere
 * Spielleiter-Sperre gegen das Teilen durch den Besitzer (proposal.md "Nicht im Umfang")
 * aendert damit nur diese Regel. Der Client benutzt sie NICHT zum Ein-/Ausblenden der
 * Freigabe-Schalter - das entscheidet `shares !== null` (design.md D7); sie ist die
 * Serverregel.
 */
export function canShareToken(token: Pick<Token, 'ownerId'>, actor: TokenMover): boolean {
  return actor.role === 'spielleiter' || token.ownerId === actor.userId
}

/**
 * Zellen eines Tokens (spec.md "Begriffe": "Zellen eines Tokens", add-token-fog-visibility
 * #17, design.md D1): bei Raster `quadrat` alle `size x size` Zellen ab der Ankerzelle (`col`
 * bis `col + size - 1`, `row` bis `row + size - 1`) - dieselbe Geometrie, mit der die
 * Kartenansicht das Token zeichnet; bei `hex-spitz` und `hex-flach` ausschliesslich die
 * Ankerzelle. `size` `1` liefert in beiden Faellen die Ankerzelle. Reine Funktion, keine DB.
 */
export function tokenCells(token: Pick<Token, 'col' | 'row' | 'size'>, gridType: GridType): Cell[] {
  if (gridType !== 'quadrat') {
    return [{ col: token.col, row: token.row }]
  }
  const cells: Cell[] = []
  for (let row = token.row; row < token.row + token.size; row++) {
    for (let col = token.col; col < token.col + token.size; col++) {
      cells.push({ col, row })
    }
  }
  return cells
}

/**
 * Sichtbarkeitsregel fuer Tokens im Fog (spec.md "Begriffe": "Sichtbares Token",
 * add-token-fog-visibility #17, design.md D1, constitution.md §9.2): ein Empfaenger mit
 * Rolle `spielleiter` sieht jedes Token; sonst ist ein Token sichtbar, wenn es einen Besitzer
 * hat (das eigene wie das eines Mitspielers) oder wenn mindestens eine seiner Zellen
 * (`tokenCells`) zu `revealedKeys` gehoert - einer Menge von `cellKey`-Schluesseln der
 * aufgedeckten Zellen der aktiven Instanz, vom Aufrufer einmal je Sendevorgang gebaut (nicht
 * je Token). `viewer` ist strukturell derselbe Schnitt wie `TokenMover`/`TokenViewer` (`role`,
 * `userId`). Reine Funktion, keine DB.
 */
export function isTokenVisible(
  token: Pick<Token, 'ownerId' | 'col' | 'row' | 'size'>,
  viewer: TokenMover,
  revealedKeys: Set<string>,
  gridType: GridType,
): boolean {
  if (viewer.role === 'spielleiter') {
    return true
  }
  if (token.ownerId !== null) {
    return true
  }
  return tokenCells(token, gridType).some((cell) => revealedKeys.has(cellKey(cell)))
}
