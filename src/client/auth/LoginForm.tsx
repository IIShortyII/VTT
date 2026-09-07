import { useState, type FormEvent } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import { login } from './api.js'

export interface LoginFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToRegister: () => void
}

const GENERIC_ERROR_MESSAGE = 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.'

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
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
      setError(GENERIC_ERROR_MESSAGE)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <h1>Anmelden</h1>
      <label htmlFor="login-email">E-Mail</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="login-password">Passwort</label>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error !== null && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        Anmelden
      </button>
      <button type="button" onClick={onSwitchToRegister}>
        Noch kein Konto? Registrieren
      </button>
    </form>
  )
}
