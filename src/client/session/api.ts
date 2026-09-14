import { ErrorOutputSchema } from '../../shared/auth.js'
import {
  CreateSessionInputSchema,
  JoinSessionInputSchema,
  SessionSummarySchema,
  type CreateSessionInput,
  type JoinSessionInput,
  type SessionSummary,
} from '../../shared/session.js'

// Die Aufrufe gegen /api/sessions* (design.md D10, D3). `credentials: 'include'` ist
// Pflicht, sonst sendet der Browser das Sitzungscookie nicht mit - wie in `client/auth/api.ts`.
// Antworten werden gegen die Schemas aus `shared/session.ts` geprueft statt Server-Objekte
// blind durchzureichen.

export type SessionResult = { ok: true; session: SessionSummary } | { ok: false; message: string; field?: string }
export type ListSessionsResult = { ok: true; sessions: SessionSummary[] } | { ok: false; message: string }
// add-session-leave (#70, design.md D6): Ergebnis von `removeMember` - der Fehlerfall traegt
// nur eine Meldung, kein Feld (die Route kennt kein Formularfeld, anders als beim Erstellen/
// Beitreten).
export type RemoveMemberResult = { ok: true } | { ok: false; message: string }

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
}

async function parseSessionResult(response: Response): Promise<SessionResult> {
  const data: unknown = await response.json()
  if (response.ok) {
    return { ok: true, session: SessionSummarySchema.parse(data) }
  }
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message, field: error.field }
}

/** `POST /api/sessions` - legt eine neue Spielsitzung an, der Aufrufer wird Spielleiter
 * (Requirement "Spielsitzung erstellen"). */
export async function createSession(input: CreateSessionInput): Promise<SessionResult> {
  const parsed = CreateSessionInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: issue.path.join('.') }
  }
  const response = await postJson('/api/sessions', parsed.data)
  return parseSessionResult(response)
}

/** `POST /api/sessions/join` - tritt einer Spielsitzung per Code bei (Requirement "Beitritt
 * per Sitzungscode"). */
export async function joinSession(input: JoinSessionInput): Promise<SessionResult> {
  const parsed = JoinSessionInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: issue.path.join('.') }
  }
  const response = await postJson('/api/sessions/join', parsed.data)
  return parseSessionResult(response)
}

/** `GET /api/sessions` - alle Spielsitzungen des angemeldeten Nutzers (Requirement "Meine
 * Spielsitzungen"). */
export async function listSessions(): Promise<ListSessionsResult> {
  const response = await fetch('/api/sessions', { credentials: 'include' })
  const data: unknown = await response.json()
  if (!response.ok) {
    const error = ErrorOutputSchema.parse(data)
    return { ok: false, message: error.message }
  }
  return { ok: true, sessions: SessionSummarySchema.array().parse(data) }
}

/** `DELETE /api/sessions/:id/members/:userId` - beendet die eigene Mitgliedschaft
 * (Austreten) oder die eines Spielers (Entfernen durch den Spielleiter), je nachdem, wessen
 * `userId` uebergeben wird (add-session-leave #70, Requirement "Verlassen einer Spielsitzung
 * und Entfernen eines Spielers"). */
export async function removeMember(sessionId: string, userId: string): Promise<RemoveMemberResult> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (response.ok) {
    return { ok: true }
  }
  const data: unknown = await response.json()
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message }
}
