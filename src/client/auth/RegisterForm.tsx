import { useState, type FormEvent } from 'react'

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, type UserOutput } from '../../shared/auth.js'
import { register } from './api.js'

export interface RegisterFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToLogin: () => void
}

const GENERIC_ERROR_MESSAGE = 'Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.'

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await register({ username, email, password })
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
      {/* Die Ebene-1-Ueberschrift der Startansicht traegt der Hero (add-start-view #86,
          design.md D1/D2) - dieses Formular bekommt nur noch eine `<h2>`. */}
      <h2>Registrierung</h2>
      <label className="field-label" htmlFor="register-username">
        Nutzername
      </label>
      <input
        id="register-username"
        name="username"
        type="text"
        autoComplete="nickname"
        minLength={USERNAME_MIN_LENGTH}
        maxLength={USERNAME_MAX_LENGTH}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        required
      />
      <label className="field-label" htmlFor="register-email">
        E-Mail
      </label>
      <input
        id="register-email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label className="field-label" htmlFor="register-password">
        Passwort
      </label>
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
      {error !== null && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={submitting}>
        Registrieren
      </button>
      <button type="button" className="link" onClick={onSwitchToLogin}>
        Ich habe schon ein Konto
      </button>
    </form>
  )
}
