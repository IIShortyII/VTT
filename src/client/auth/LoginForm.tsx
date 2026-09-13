import { useState, type FormEvent } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import { useT } from '../i18n/locale.js'
import { login } from './api.js'

export interface LoginFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToRegister: () => void
}

// ui-text (#87, design.md D6): Ueberschrift, Labels, Schaltflaechen und die frueher als
// Modulkonstante gehaltene Fehlermeldung laufen jetzt ueber `t('auth.*')`; der Aufruf steht im
// `catch`-Zweig, damit er die aktive Sprache zum Zeitpunkt des Fehlers traegt (design.md D1).

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await login({ email, password })
      if (result.ok) {
        onSuccess(result.user)
      } else {
        setError(result.message)
      }
    } catch {
      // Ein Server- oder Netzwerkfehler wird angezeigt statt lautlos zu verpuffen
      // (AGENTS.md: "Fehler sprudeln bis zum zentralen Handler").
      setError(t('auth.login.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      {/* Die Ebene-1-Ueberschrift der Startansicht traegt der Hero (add-start-view #86,
          design.md D1/D2) - dieses Formular bekommt nur noch eine `<h2>`. */}
      <h2>{t('auth.login.title')}</h2>
      <label className="field-label" htmlFor="login-email">
        {t('auth.login.email')}
      </label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label className="field-label" htmlFor="login-password">
        {t('auth.login.password')}
      </label>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error !== null && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={submitting}>
        {t('auth.login.submit')}
      </button>
      <button type="button" className="link" onClick={onSwitchToRegister}>
        {t('auth.login.toRegister')}
      </button>
    </form>
  )
}
