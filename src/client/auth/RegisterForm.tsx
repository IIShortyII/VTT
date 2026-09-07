import { useState, type FormEvent } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import { register } from './api.js'

export interface RegisterFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToLogin: () => void
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await register({ email, password })
    setSubmitting(false)
    if (result.ok) {
      onSuccess(result.user)
    } else {
      setError(result.message)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <h1>Konto erstellen</h1>
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
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error !== null && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        Konto erstellen
      </button>
      <button type="button" onClick={onSwitchToLogin}>
        Ich habe schon ein Konto
      </button>
    </form>
  )
}
