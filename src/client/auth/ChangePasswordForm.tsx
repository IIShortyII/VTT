import { useState, type FormEvent } from 'react'

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../shared/auth.js'
import { useT } from '../i18n/locale.js'
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

export function ChangePasswordForm() {
  const t = useT()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const result = await changePassword({ currentPassword, newPassword })
      if (result.ok) {
        setMessage(t('auth.password.changed'))
        setCurrentPassword('')
        setNewPassword('')
      } else {
        // Ablehnung (400/403): Meldung des Servers anzeigen, Felder bleiben erhalten
        // (design.md D5).
        setMessage(result.message)
      }
    } catch {
      // Ein Server- oder Netzwerkfehler wird angezeigt statt lautlos zu verpuffen
      // (AGENTS.md: "Fehler sprudeln bis zum zentralen Handler").
      setMessage(t('auth.password.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label className="field-label" htmlFor="change-password-current">
        {t('auth.password.current')}
      </label>
      <input
        id="change-password-current"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <label className="field-label" htmlFor="change-password-new">
        {t('auth.password.new')}
      </label>
      <input
        id="change-password-new"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      {message !== null && <p role="alert">{message}</p>}
      <button type="submit" disabled={submitting}>
        {t('auth.password.submit')}
      </button>
    </form>
  )
}
