import { useState, type FormEvent } from 'react'

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RegisterInputSchema,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  type UserOutput,
} from '../../shared/auth.js'
import { useT } from '../i18n/locale.js'
import { Field, SubmitButton } from '../ui/form.js'
import { register } from './api.js'

export interface RegisterFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToLogin: () => void
}

// ui-text (#87, design.md D6): Ueberschrift, Labels, Schaltflaechen und die frueher als
// Modulkonstante gehaltene Fehlermeldung laufen jetzt ueber `t('auth.*')`; der Aufruf steht im
// `catch`-Zweig, damit er die aktive Sprache zum Zeitpunkt des Fehlers traegt (design.md D1).
// ui-form (#90, design.md D2-D4): `error`/`submitting` weichen `fieldErrors`/`formError`/
// `pending`; Gueltigkeit kommt aus `RegisterInputSchema.safeParse` (design.md D3).

type RegisterField = 'username' | 'email' | 'password'

function isRegisterField(value: string | undefined): value is RegisterField {
  return value === 'username' || value === 'email' || value === 'password'
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const t = useT()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const valid = RegisterInputSchema.safeParse({ username, email, password }).success

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || pending) {
      return
    }
    setPending(true)
    setFieldErrors({})
    setFormError(null)
    try {
      const result = await register({ username, email, password })
      if (result.ok) {
        onSuccess(result.user)
      } else if (isRegisterField(result.field)) {
        setFieldErrors({ [result.field]: result.message })
      } else {
        setFormError(result.message)
      }
    } catch {
      // Ein Server- oder Netzwerkfehler wird angezeigt statt lautlos zu verpuffen
      // (AGENTS.md: "Fehler sprudeln bis zum zentralen Handler").
      setFormError(t('auth.register.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
      {/* Die Ebene-1-Ueberschrift der Startansicht traegt der Hero (add-start-view #86,
          design.md D1/D2) - dieses Formular bekommt nur noch eine `<h2>`. */}
      <h2>{t('auth.register.title')}</h2>
      <Field id="register-username" label={t('auth.register.username')} error={fieldErrors.username ?? null}>
        {(control) => (
          <input
            {...control}
            name="username"
            type="text"
            autoComplete="nickname"
            minLength={USERNAME_MIN_LENGTH}
            maxLength={USERNAME_MAX_LENGTH}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        )}
      </Field>
      <Field id="register-email" label={t('auth.register.email')} error={fieldErrors.email ?? null}>
        {(control) => (
          <input
            {...control}
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        )}
      </Field>
      <Field id="register-password" label={t('auth.register.password')} error={fieldErrors.password ?? null}>
        {(control) => (
          <input
            {...control}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
        <SubmitButton className="primary" pending={pending} disabled={!valid}>
          {t('auth.register.submit')}
        </SubmitButton>
        <button type="button" className="link" onClick={onSwitchToLogin}>
          {t('auth.register.toLogin')}
        </button>
      </div>
    </form>
  )
}
