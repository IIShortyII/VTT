import { useState, type FormEvent } from 'react'

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type UserOutput } from '../../shared/auth.js'
import { register } from './api.js'

export interface RegisterFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToLogin: () => void
}

const GENERIC_ERROR_MESSAGE = 'Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.'

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await register({ email, password })
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
      <h1>Registrierung</h1>
      <label htmlFor="register-email">E-Mail</label>
      <input
        id="register-email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="register-password">Passwort</label>
      <input
        id="register-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error !== null && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        Registrieren
      </button>
      <button type="button" onClick={onSwitchToLogin}>
        Ich habe schon ein Konto
      </button>
    </form>
  )
}
