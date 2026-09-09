import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'

import type { Clock } from '../core/clock.js'

// Reine, framework-freie Regeln: Passwort-Hashing und Sitzungsarithmetik. Keine Fastify-,
// keine Prisma-Abhaengigkeit - das ist die duenne Anbindung in routes.ts/session.ts
// (design.md D1, Folgeregel "Regeln von Glue trennen").

const SCRYPT_ALGORITHM = 'scrypt'
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SALT_BYTES = 16
const KEY_LENGTH = 64

/**
 * scrypt braucht bei N=16384 mehr Speicher als Nodes Default-Limit (32 MB) - `maxmem` muss
 * daher explizit gesetzt werden (design.md D3).
 */
function maxmemFor(n: number, r: number): number {
  return n * r * 128 * 2
}

/**
 * Handgeschriebene Promise-Huelle statt `util.promisify` - die Node-Typings fuer
 * `crypto.scrypt` bieten `promisify` keine Ueberladung mit `options`, nur die
 * Drei-Parameter-Variante ohne Optionen. Bleibt trotzdem die asynchrone, nicht
 * blockierende Variante (design.md D3) - kein `scryptSync`.
 */
function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey)
    })
  })
}

async function deriveKey(password: string, salt: Buffer, n: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return scryptAsync(password, salt, keyLength, {
    N: n,
    r,
    p,
    maxmem: maxmemFor(n, r),
  })
}

function encodeHash(n: number, r: number, p: number, salt: Buffer, key: Buffer): string {
  return `${SCRYPT_ALGORITHM}$N=${n},r=${r},p=${p}$${salt.toString('base64')}$${key.toString('base64')}`
}

interface ParsedHash {
  n: number
  r: number
  p: number
  salt: Buffer
  key: Buffer
}

function parseHash(hash: string): ParsedHash | null {
  const parts = hash.split('$')
  if (parts.length !== 4 || parts[0] !== SCRYPT_ALGORITHM) {
    return null
  }
  const [, paramsPart, saltPart, keyPart] = parts
  const params = new Map<string, number>()
  for (const pair of paramsPart.split(',')) {
    const [key, value] = pair.split('=')
    if (!key || value === undefined) {
      return null
    }
    params.set(key, Number(value))
  }
  const n = params.get('N')
  const r = params.get('r')
  const p = params.get('p')
  if (n === undefined || r === undefined || p === undefined || Number.isNaN(n) || Number.isNaN(r) || Number.isNaN(p)) {
    return null
  }
  return {
    n,
    r,
    p,
    salt: Buffer.from(saltPart, 'base64'),
    key: Buffer.from(keyPart, 'base64'),
  }
}

/** Hasht ein Passwort mit zufaelligem Salt. Format und Parameter siehe design.md D3. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH)
  return encodeHash(SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, key)
}

/** Prueft ein Passwort gegen einen gespeicherten Hash - Vergleich zeitkonstant. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parsed = parseHash(hash)
  if (!parsed) {
    return false
  }
  const derived = await deriveKey(password, parsed.salt, parsed.n, parsed.r, parsed.p, parsed.key.length)
  if (derived.length !== parsed.key.length) {
    return false
  }
  return timingSafeEqual(derived, parsed.key)
}

const DUMMY_PASSWORD = 'dieses-passwort-wird-nie-fuer-ein-konto-benutzt'
// Fester (nicht zufaelliger) Salt: dieser Hash gehoert zu keinem Konto und wird nie
// gespeichert oder verglichen ausser mit sich selbst - Determinismus ist hier wichtiger als
// Zufall.
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 7)

let dummyHashPromise: Promise<string> | null = null

/**
 * Ein valider, aber an kein Konto gebundener Hash - verifiziert bei unbekannter E-Mail
 * gegen diesen Hash, damit der Anmeldeversuch dieselbe Arbeit leistet wie bei einer
 * bekannten E-Mail (constitution.md §9.2, design.md Risks/Trade-offs).
 */
export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = (async () => {
      const key = await deriveKey(DUMMY_PASSWORD, DUMMY_SALT, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH)
      return encodeHash(SCRYPT_N, SCRYPT_R, SCRYPT_P, DUMMY_SALT, key)
    })()
  }
  return dummyHashPromise
}

/** E-Mail wird vor Speichern/Suche normalisiert, damit Gross-/Kleinschreibung nicht durch
 * die `@unique`-Einschraenkung schluepft (design.md D2). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Volle Sitzungslaufzeit (design.md, Requirement "Ablauf und gleitende Verlängerung"). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000

/** Ablaufzeitpunkt einer neuen bzw. verlaengerten Sitzung, aus der injizierten Uhr. */
export function computeSessionExpiry(clock: Clock): Date {
  return new Date(clock().getTime() + SESSION_TTL_MS)
}

/** Eine Sitzung gilt als abgelaufen, sobald ihr Ablaufzeitpunkt nicht mehr in der Zukunft liegt. */
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime()
}

/**
 * Halbwertsregel (design.md D5): verlaengert wird nur, wenn weniger als die Haelfte der
 * vollen Laufzeit uebrig ist - sonst schriebe jede Anfrage in die DB.
 */
export function shouldRenewSession(expiresAt: Date, now: Date): boolean {
  const remaining = expiresAt.getTime() - now.getTime()
  return remaining < SESSION_TTL_MS / 2
}

// account-security (#13): Sperrregel als reine Funktionen, ohne Prisma, mit injizierter Uhr
// (design.md D2/D6). `LockoutState` bildet genau die zwei neuen Spalten am `Account` ab.

/** Schwelle: der wievielte Fehlversuch das Konto sperrt (design.md D2). */
export const LOCKOUT_THRESHOLD = 5
/** Sperrdauer in Millisekunden - 15 Minuten (design.md D2). */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export interface LockoutState {
  failedLoginCount: number
  lockedUntil: Date | null
}

/** Ein Konto gilt als gesperrt, solange `lockedUntil` in der Zukunft liegt. */
export function isAccountLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime()
}

/**
 * Verarbeitet einen Fehlversuch. Ist das Konto zum Zeitpunkt `now` bereits gesperrt, bleibt
 * der Zustand unveraendert - ein Fehlversuch waehrend der Sperre verlaengert sie nicht und
 * veraendert den Zaehler nicht (design.md D2, Frage 3: sonst koennte ein Fremder das Konto
 * dauerhaft zuhalten). Sonst wird der Zaehler um eins erhoeht; erreicht er dabei die
 * Schwelle, wird das Konto ab `now` fuer `LOCKOUT_DURATION_MS` gesperrt und der Zaehler auf
 * null zurueckgesetzt - er beginnt nach Ablauf der Sperre wieder bei null, nicht bei fuenf.
 */
export function recordFailedAttempt(state: LockoutState, now: Date): LockoutState {
  if (isAccountLocked(state.lockedUntil, now)) {
    return state
  }
  const failedLoginCount = state.failedLoginCount + 1
  if (failedLoginCount >= LOCKOUT_THRESHOLD) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS) }
  }
  return { failedLoginCount, lockedUntil: null }
}

/** Zustand nach einer erfolgreichen Anmeldung bzw. Passwortaenderung: Zaehler und Sperre weg. */
export function clearLockout(): LockoutState {
  return { failedLoginCount: 0, lockedUntil: null }
}
