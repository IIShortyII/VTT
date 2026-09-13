import { useState, type FormEvent } from 'react'

import { LoginInputSchema, type UserOutput } from '../../shared/auth.js'
import { useT } from '../i18n/locale.js'
import { Field, SubmitButton } from '../ui/form.js'
import { login } from './api.js'

export interface LoginFormProps {
  onSuccess: (user: UserOutput) => void
  onSwitchToRegister: () => void
}

// ui-text (#87, design.md D6): Ueberschrift, Labels, Schaltflaechen und die frueher als
// Modulkonstante gehaltene Fehlermeldung laufen jetzt ueber `t('auth.*')`; der Aufruf steht im
// `catch`-Zweig, damit er die aktive Sprache zum Zeitpunkt des Fehlers traegt (design.md D1).
// ui-form (#90, design.md D2-D4): `error`/`submitting` weichen `fieldErrors`/`formError`/
// `pending`; Gueltigkeit kommt aus `LoginInputSchema.safeParse` (design.md D3), Fehler mit
// `field` landen am genannten Feld, alles andere als Formularfehler unter dem letzten Feld.

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'email' | 'password', string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const valid = LoginInputSchema.safeParse({ email, password }).success

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || pending) {
      return
    }
    setPending(true)
    setFieldErrors({})
    setFormError(null)
    try {
      const result = await login({ email, password })
      if (result.ok) {
        onSuccess(result.user)
      } else if (result.field === 'email' || result.field === 'password') {
        setFieldErrors({ [result.field]: result.message })
      } else {
        setFormError(result.message)
      }
    } catch {
      // Ein Server- oder Netzwerkfehler wird angezeigt statt lautlos zu verpuffen
      // (AGENTS.md: "Fehler sprudeln bis zum zentralen Handler").
      setFormError(t('auth.login.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
      {/* Die Ebene-1-Ueberschrift der Startansicht traegt der Hero (add-start-view #86,
          design.md D1/D2) - dieses Formular bekommt nur noch eine `<h2>`. */}
      <h2>{t('auth.login.title')}</h2>
      <Field id="login-email" label={t('auth.login.email')} error={fieldErrors.email ?? null}>
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
      <Field id="login-password" label={t('auth.login.password')} error={fieldErrors.password ?? null}>
        {(control) => (
          <input
            {...control}
            name="password"
            type="password"
            autoComplete="current-password"
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
          {t('auth.login.submit')}
        </SubmitButton>
        <button type="button" className="link" onClick={onSwitchToRegister}>
          {t('auth.login.toRegister')}
        </button>
      </div>
    </form>
  )
}
