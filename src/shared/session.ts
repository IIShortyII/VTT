import { z } from 'zod'
import type { ActiveMap } from './session-map.js'
import type { Token } from './token.js'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D1, Folgeregel zu Verzeichnisschnitt D1).
//
// Begriffe siehe specs/game-session/spec.md: "Spielsitzung" (Modell `GameSession`, nicht zu
// verwechseln mit der Anmelde-Sitzung `sid` aus `shared/auth.ts`), "Mitgliedschaft",
// "Zustand", "Raum".

export const GAME_SESSION_STATUSES = ['geschlossen', 'geoeffnet', 'gestartet', 'pausiert'] as const
export const GameSessionStatusSchema = z.enum(GAME_SESSION_STATUSES)
export type GameSessionStatus = z.infer<typeof GameSessionStatusSchema>

export const MEMBER_ROLES = ['spielleiter', 'spieler'] as const
export const MemberRoleSchema = z.enum(MEMBER_ROLES)
export type MemberRole = z.infer<typeof MemberRoleSchema>

export const TRANSITION_ACTIONS = ['oeffnen', 'starten', 'pausieren', 'beenden'] as const
export const TransitionActionSchema = z.enum(TRANSITION_ACTIONS)
export type TransitionAction = z.infer<typeof TransitionActionSchema>

/**
 * Lebenszyklus-Tabelle (design.md D5): eine Quelle fuer Client (Schaltflaechen ableiten) und
 * Server (Uebergang entscheiden). `pausiert` ist ein gespeicherter Zustand, keine Ableitung
 * aus der Anwesenheit - siehe Requirement "Abwesenheit des Spielleiters pausiert".
 */
export const TRANSITIONS: Record<GameSessionStatus, Partial<Record<TransitionAction, GameSessionStatus>>> = {
  geschlossen: { oeffnen: 'geoeffnet' },
  geoeffnet: { starten: 'gestartet', beenden: 'geschlossen' },
  gestartet: { pausieren: 'pausiert', beenden: 'geschlossen' },
  pausiert: { starten: 'gestartet', beenden: 'geschlossen' },
}

/** Liefert den Folgezustand eines erlaubten Uebergangs, sonst `null`. */
export function nextStatus(from: GameSessionStatus, action: TransitionAction): GameSessionStatus | null {
  return TRANSITIONS[from][action] ?? null
}

/** Die im aktuellen Zustand erlaubten Aktionen - der Client leitet daraus seine
 * Schaltflaechen ab; ob ein Klick tatsaechlich etwas bewirkt, entscheidet der Server
 * (constitution.md §9.1). */
export function allowedActions(from: GameSessionStatus): TransitionAction[] {
  return Object.keys(TRANSITIONS[from]) as TransitionAction[]
}

/**
 * Sitzungscode-Alphabet (design.md D4): 32 Zeichen ohne `0/O`, `1/I` - visuell nicht zu
 * verwechseln.
 */
export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const SESSION_CODE_LENGTH = 6

const SESSION_CODE_PATTERN = new RegExp(`^[${SESSION_CODE_ALPHABET}]{${SESSION_CODE_LENGTH}}$`)

const SESSION_NAME_MIN_LENGTH = 1
const SESSION_NAME_MAX_LENGTH = 60

/**
 * `POST /api/sessions` (Requirement "Spielsitzung erstellen"): Name wird vor der
 * Laengenpruefung getrimmt - Client und Server sehen denselben Wert (`transform`, wie beim
 * Sitzungscode).
 */
export const CreateSessionInputSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(SESSION_NAME_MIN_LENGTH, 'Der Name muss mindestens 1 Zeichen lang sein.')
        .max(SESSION_NAME_MAX_LENGTH, `Der Name darf höchstens ${SESSION_NAME_MAX_LENGTH} Zeichen lang sein.`),
    ),
})
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>

/**
 * `POST /api/sessions/join` (Requirement "Beitritt per Sitzungscode"): Normalisierung
 * (Leerraum entfernt, Grossbuchstaben) per `transform`, damit Client-Vorpruefung und Server
 * denselben Wert sehen (design.md D4).
 */
export const JoinSessionInputSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(SESSION_CODE_PATTERN, 'Der Sitzungscode ist ungültig.')),
})
export type JoinSessionInput = z.infer<typeof JoinSessionInputSchema>

/**
 * Aussendarstellung einer Spielsitzung (spec.md "Drahtformat"): `code` ist nur enthalten,
 * wenn der Empfaenger Spielleiter ist - verdeckte Information verlaesst den Server nicht
 * (constitution.md §9.2).
 */
export const SessionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: GameSessionStatusSchema,
  role: MemberRoleSchema,
  code: z.string().optional(),
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>

/**
 * Teilnehmer der Echtzeit-Teilnehmerliste (Requirement "Teilnehmerliste in Echtzeit"). Die
 * E-Mail steht hier NICHT (mehr) - sie ist Anmeldename, keine Information fuer andere
 * Mitspieler (constitution.md §9.2, add-username-and-alias #45). `alias` fehlt auf der
 * Leitung, wenn die Mitgliedschaft keinen traegt (`JSON.stringify` laesst `undefined` weg);
 * das Fehlen des Felds ist der natuerliche Zustand "kein Alias" (design.md D5).
 */
export const ParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  alias: z.string().optional(),
  role: MemberRoleSchema,
  online: z.boolean(),
})
export type Participant = z.infer<typeof ParticipantSchema>

/** Zeigt den Alias, falls die Mitgliedschaft einen traegt, sonst den Nutzernamen
 * (design.md D5) - die einzige Stelle, die "wie heisst dieser Spieler" beantwortet; Tokens
 * (#8) und Chat benutzen denselben Helfer, statt die Regel zu wiederholen. */
export function displayName(p: Pick<Participant, 'username' | 'alias'>): string {
  return p.alias ?? p.username
}

/** Payload von `session:enter` (Client -> Server). */
export const EnterInputSchema = z.object({
  sessionId: z.string(),
})
export type EnterInput = z.infer<typeof EnterInputSchema>

/** Payload von `session:transition` (Client -> Server). */
export const TransitionInputSchema = z.object({
  sessionId: z.string(),
  action: TransitionActionSchema,
})
export type TransitionInput = z.infer<typeof TransitionInputSchema>

/**
 * Alias-Obergrenze (design.md D4, Requirement "Alias pro Mitgliedschaft"): 1-40 Codepoints
 * nach Trimmen, frei bis auf Steuerzeichen (einschliesslich Zeilenumbruch).
 */
export const ALIAS_MAX_LENGTH = 40

/**
 * Payload von `session:alias` (Client -> Server, design.md D4). Der Alias wird an den
 * Raendern getrimmt; ein danach leerer Wert setzt den Alias zurueck (`null`). Ein nicht
 * leerer Wert muss 1-40 Codepoints lang sein und darf keine Steuerzeichen enthalten -
 * sonst ist er frei waehlbar und nicht einmalig (mehrere Mitglieder duerfen denselben
 * Alias tragen).
 */
export const AliasInputSchema = z.object({
  sessionId: z.string(),
  alias: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z.union([
        z.literal(''),
        z
          .string()
          .regex(/^[^\p{Cc}]+$/u, 'Der Alias darf keine Steuerzeichen enthalten.')
          .refine((value) => [...value].length <= ALIAS_MAX_LENGTH, `Der Alias darf höchstens ${ALIAS_MAX_LENGTH} Zeichen lang sein.`),
      ]),
    )
    .transform((value) => (value === '' ? null : value)),
})
export type AliasInput = z.infer<typeof AliasInputSchema>

/** Acknowledgement von `session:enter`. */
export type EnterAck =
  | { ok: true; session: SessionSummary; participants: Participant[]; map: ActiveMap | null; tokens: Token[] }
  | { ok: false; message: string }

/** Acknowledgement von `session:transition`. */
export type TransitionAck = { ok: true; status: GameSessionStatus } | { ok: false; message: string }

/** Acknowledgement von `session:alias` - `alias` ist hier `null` statt fehlend, weil
 * "zurueckgesetzt" eine explizite Antwort ist (design.md D5), anders als das optionale Feld
 * in `ParticipantSchema`. */
export type AliasAck = { ok: true; alias: string | null } | { ok: false; message: string }

/** Ereignisnamen auf der Leitung - eine Quelle fuer Client und Server (spec.md
 * "Drahtformat"). */
export const SESSION_EVENTS = {
  enter: 'session:enter',
  transition: 'session:transition',
  alias: 'session:alias',
  participants: 'session:participants',
  status: 'session:status',
  replaced: 'session:replaced',
  ended: 'session:ended',
} as const

export interface ParticipantsEvent {
  sessionId: string
  participants: Participant[]
}

export interface StatusEvent {
  sessionId: string
  status: GameSessionStatus
}

export interface ReplacedEvent {
  sessionId: string
}

export interface EndedEvent {
  sessionId: string
}
