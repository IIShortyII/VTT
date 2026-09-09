import {
  ChangePasswordInputSchema,
  ErrorOutputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  UserOutputSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type UserOutput,
} from '../../shared/auth.js'

// Die Aufrufe gegen /api/auth/*. `credentials: 'include'` ist Pflicht, sonst sendet
// der Browser das Sitzungscookie nicht mit (design.md D7). Antworten werden gegen die
// Schemas aus shared/auth.ts geprueft statt Prisma-/Server-Objekte blind durchzureichen.

export type AuthResult = { ok: true; user: UserOutput } | { ok: false; message: string; field?: string }
export type ChangePasswordResult = { ok: true } | { ok: false; message: string; field?: string }

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
}

async function parseAuthResult(response: Response): Promise<AuthResult> {
  const data: unknown = await response.json()
  if (response.ok) {
    return { ok: true, user: UserOutputSchema.parse(data) }
  }
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message, field: error.field }
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  // Clientseitige Vorpruefung mit `safeParse` statt `parse`: ein zu kurzes Passwort soll die
  // in design.md D11 entworfene Meldung (Zahl + Passphrasen-Hinweis) und das betroffene Feld
  // bis zum Formular durchreichen, statt als geworfener ZodError im generischen
  // Fehler-Catch des Formulars zu verschwinden (Review-Runde 2). Kein Netzwerkaufruf, wenn
  // die Eingabe schon lokal ungueltig ist.
  const parsed = RegisterInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: issue.path.join('.') }
  }
  const response = await postJson('/api/auth/register', parsed.data)
  return parseAuthResult(response)
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const parsed = LoginInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: issue.path.join('.') }
  }
  const response = await postJson('/api/auth/login', parsed.data)
  return parseAuthResult(response)
}

export async function fetchCurrentUser(): Promise<UserOutput | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (!response.ok) {
    return null
  }
  const data: unknown = await response.json()
  return UserOutputSchema.parse(data)
}

/**
 * Meldet ab und gibt zurueck, ob der Server das bestaetigt hat. Der Aufrufer MUSS diesen
 * Rueckgabewert pruefen statt den Zustand selbst zu entscheiden - der Server ist autoritativ
 * (constitution.md §9.1); scheitert die Anfrage, lebt die Sitzung serverseitig weiter, auch
 * wenn der Client sie gern beendet haette.
 */
export async function logout(): Promise<boolean> {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  return response.ok
}

/**
 * Aendert das Passwort des angemeldeten Nutzers (account-security #13, design.md D5).
 * Dieselbe lokale Vorpruefung wie bei `register` - kein Netzaufruf bei einem zu kurzen neuen
 * Passwort, und die `ErrorOutput`-Form des Servers wird unveraendert durchgereicht.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const parsed = ChangePasswordInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue.message, field: issue.path.join('.') }
  }
  const response = await postJson('/api/auth/password', parsed.data)
  if (response.ok) {
    return { ok: true }
  }
  const data: unknown = await response.json()
  const error = ErrorOutputSchema.parse(data)
  return { ok: false, message: error.message, field: error.field }
}
