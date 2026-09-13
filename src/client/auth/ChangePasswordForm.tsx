import { useState, type FormEvent } from 'react'

import { ChangePasswordInputSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../shared/auth.js'
import { useT } from '../i18n/locale.js'
import { Field, SubmitButton } from '../ui/form.js'
import { useToasts } from '../ui/toast.js'
import { changePassword } from './api.js'

// Formular zur Passwortaenderung in der angemeldeten Ansicht (account-security #13,
// design.md D5). Kein Zustandswechsel in App - die Sitzung bleibt, der Server sagt nichts
// anderes (constitution.md §9.1); eine Ablehnung zeigt nur eine Meldung, meldet niemanden ab.
// add-start-view (#86, design.md D5): liegt jetzt in einem `<details>` mit der Summary
// "Passwort ändern" (SessionList.tsx) - die Summary ist die Ueberschrift, eine eigene `<h2>`
// stuende sonst zweimal untereinander.
// ui-text (#87, design.md D6): Labels, Schaltflaeche und die frueher als Modulkonstanten
// gehaltenen Meldungen laufen jetzt ueber `t('auth.password.*')`; die Aufrufe stehen im
// Erfolgs- bzw. `catch`-Zweig, damit sie die aktive Sprache zum Zeitpunkt des Ereignisses
// tragen (design.md D1).
// ui-feedback (#88, design.md D4): der Erfolg laeuft jetzt als Toast - `message` traegt nur
// noch die Ablehnung (Meldung des Servers) und den Netzfehler; nach einem Erfolg zeigt das
// Formular keine Meldung mit `role="alert"` mehr.
// ui-form (#90, design.md D2-D4): `message` weicht `fieldErrors`/`formError`/`pending`;
// Gueltigkeit kommt aus `ChangePasswordInputSchema.safeParse` (design.md D3).

type ChangePasswordField = 'currentPassword' | 'newPassword'

function isChangePasswordField(value: string | undefined): value is ChangePasswordField {
  return value === 'currentPassword' || value === 'newPassword'
}

export function ChangePasswordForm() {
  const t = useT()
  const { push } = useToasts()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ChangePasswordField, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const valid = ChangePasswordInputSchema.safeParse({ currentPassword, newPassword }).success

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || pending) {
      return
    }
    setPending(true)
    setFieldErrors({})
    setFormError(null)
    try {
      const result = await changePassword({ currentPassword, newPassword })
      if (result.ok) {
        push(t('auth.password.changed'))
        setCurrentPassword('')
        setNewPassword('')
      } else if (isChangePasswordField(result.field)) {
        // Ablehnung (400/403) mit Feldbezug: Meldung am Feld, Felder bleiben erhalten
        // (design.md D2/D4).
        setFieldErrors({ [result.field]: result.message })
      } else {
        setFormError(result.message)
      }
    } catch {
      // Ein Server- oder Netzwerkfehler wird angezeigt statt lautlos zu verpuffen
      // (AGENTS.md: "Fehler sprudeln bis zum zentralen Handler").
      setFormError(t('auth.password.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
      <Field id="change-password-current" label={t('auth.password.current')} error={fieldErrors.currentPassword ?? null}>
        {(control) => (
          <input
            {...control}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        )}
      </Field>
      <Field id="change-password-new" label={t('auth.password.new')} error={fieldErrors.newPassword ?? null}>
        {(control) => (
          <input
            {...control}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        )}
      </Field>
      {formError !== null && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <SubmitButton pending={pending} disabled={!valid}>
          {t('auth.password.submit')}
        </SubmitButton>
      </div>
    </form>
  )
}
