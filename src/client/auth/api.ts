import {
  ErrorOutputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  UserOutputSchema,
  type LoginInput,
  type RegisterInput,
  type UserOutput,
} from '../../shared/auth.js'

// Die vier Aufrufe gegen /api/auth/*. `credentials: 'include'` ist Pflicht, sonst sendet
// der Browser das Sitzungscookie nicht mit (design.md D7). Antworten werden gegen die
// Schemas aus shared/auth.ts geprueft statt Prisma-/Server-Objekte blind durchzureichen.

export type AuthResult = { ok: true; user: UserOutput } | { ok: false; message: string; field?: string }

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
  const body = RegisterInputSchema.parse(input)
  const response = await postJson('/api/auth/register', body)
  return parseAuthResult(response)
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const body = LoginInputSchema.parse(input)
  const response = await postJson('/api/auth/login', body)
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

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}
