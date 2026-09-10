import { z } from 'zod'

// Gemeinsamer Vertrag zwischen Client und Server (AGENTS.md: "Jedes eingehende Event wird
// an der Grenze mit zod validiert"). Diese Datei importiert nichts Serverseitiges - kein
// `@prisma/client`, kein `node:*` (design.md D1, Folgeregel zu Verzeichnisschnitt D1).

/**
 * NIST SP 800-63B-4 §3.1.1 / OWASP Authentication Cheat Sheet: 15-128 Zeichen, keine
 * Zeichenklassenpflicht, kein Trimmen, kein Beschneiden (design.md D11).
 */
export const PASSWORD_MIN_LENGTH = 15
export const PASSWORD_MAX_LENGTH = 128

function countCodepoints(value: string): number {
  return [...value].length
}

export const EmailSchema = z.string().email('Das ist keine gültige E-Mail-Adresse.')

export const PasswordSchema = z.string().superRefine((value, ctx) => {
  const length = countCodepoints(value)
  if (length < PASSWORD_MIN_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein - eine kurze Passphrase aus drei bis vier Wörtern erreicht das mühelos.`,
    })
  }
  if (length > PASSWORD_MAX_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
    })
  }
})

/**
 * Nutzername (add-username-and-alias #45, design.md D1): getrimmt, 3-24 Codepoints,
 * Unicode-Buchstaben/-Ziffern sowie `_`, `-`, `.` - keine Leerzeichen. Die Laenge zaehlt
 * Codepoints (`[...value].length`), nicht `String.length`, analog zum Passwort (D11). Die
 * Einmaligkeit unabhaengig von der Schreibweise erzwingt die Datenbank ueber einen
 * normalisierten Schluessel (`server/auth/rules.ts`, `usernameKey`), nicht dieses Schema.
 */
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 24
const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]+$/u

export const UsernameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z.string().superRefine((value, ctx) => {
      const length = countCodepoints(value)
      if (length < USERNAME_MIN_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Der Nutzername muss mindestens ${USERNAME_MIN_LENGTH} Zeichen lang sein.`,
        })
        return
      }
      if (length > USERNAME_MAX_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Der Nutzername darf höchstens ${USERNAME_MAX_LENGTH} Zeichen lang sein.`,
        })
        return
      }
      if (!USERNAME_PATTERN.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Der Nutzername darf nur Buchstaben, Ziffern, „_“, „-“ und „.“ enthalten - keine Leerzeichen.',
        })
      }
    }),
  )

export const RegisterInputSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
})
export type RegisterInput = z.infer<typeof RegisterInputSchema>

/**
 * An der Anmeldegrenze wird nur die Form geprueft (nicht leer, nicht laenger als ein
 * gueltiges Passwort je sein kann) - keine Mindestlaenge, da sonst ein Bestandskonto mit
 * einem vor dieser Regel vergebenen Passwort nicht mehr einloggen koennte. Die Obergrenze
 * ist kein Stilmittel, sondern verhindert, dass eine beliebig lange Eingabe ungebremst in
 * `scrypt` laeuft (design.md D3 Risiko, tasks.md Review-Runde 2).
 */
export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z
    .string()
    .min(1, 'Passwort wird benötigt.')
    .max(PASSWORD_MAX_LENGTH, `Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`),
})
export type LoginInput = z.infer<typeof LoginInputSchema>

/**
 * Anfragekoerper der Passwortaenderung (account-security #13, design.md D3). Das bisherige
 * Passwort hat dieselbe Form wie beim Login (nicht leer, nicht laenger als ein gueltiges
 * Passwort je sein kann) - eine Mindestlaenge wuerde ein Bestandskonto mit einem aelteren,
 * kuerzeren Passwort aussperren. Das neue Passwort unterliegt derselben Regel wie bei der
 * Registrierung.
 */
export const ChangePasswordInputSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Passwort wird benötigt.')
    .max(PASSWORD_MAX_LENGTH, `Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`),
  newPassword: PasswordSchema,
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>

/**
 * Was der Server ueber einen Nutzer preisgibt - nie Hash, Salt oder Hash-Parameter
 * (constitution.md §9.2). `username` ist das, was andere Mitspieler sehen (#45); die E-Mail
 * erreicht in jedem Drahtformat ausschliesslich den Nutzer selbst.
 */
export const UserOutputSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
})
export type UserOutput = z.infer<typeof UserOutputSchema>

/**
 * Fehlerantwort-Form, von Login/Registrierung/Me gemeinsam benutzt. Nur `message` ist
 * Pflicht - der Statuscode steht ohnehin im HTTP-Status, nicht im Body; `error`/`field`
 * sind zusaetzlicher Kontext, den nicht jede Fehlerantwort traegt.
 */
export const ErrorOutputSchema = z.object({
  message: z.string(),
  error: z.string().optional(),
  field: z.string().optional(),
  statusCode: z.number().optional(),
})
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>
