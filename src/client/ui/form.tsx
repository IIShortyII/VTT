import { useEffect, useState, type ReactNode } from 'react'

import { useT } from '../i18n/locale.js'

// Formularmuster des Clients (ui-form, #90, design.md D1). Zwei Komponenten in einer Datei -
// `Field` rendert Label, Steuerelement und Feldfehler und reicht Steuerelement-Props an eine
// Render-Funktion (kein `cloneElement`); `SubmitButton` haelt `aria-busy`, Spinner und den
// Verzoegerungs-Timer selbst. Diese Datei importiert `react` und `../i18n/locale.js`, sonst
// nichts (design.md D1/D12).

export const SLOW_AFTER_MS = 4000

export interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export interface FieldProps {
  id: string
  label: string
  error?: string | null
  children: (control: FieldControlProps) => ReactNode
}

/** Feldhuelle (`form-field`): Label, Steuerelement, Feldfehler - in dieser Reihenfolge
 * (design.md D1, specs/ui-form/spec.md Requirement "Feldhuelle"). Ohne `error` bekommt das
 * Steuerelement nur `id`, kein `aria-invalid="false"` und kein leeres `aria-describedby`. */
export function Field({ id, label, error, children }: FieldProps): ReactNode {
  const hasError = typeof error === 'string' && error !== ''
  const errorId = `${id}-error`
  const control: FieldControlProps = hasError ? { id, 'aria-invalid': true, 'aria-describedby': errorId } : { id }
  return (
    <div className="form-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(control)}
      {hasError && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export interface SubmitButtonProps {
  pending: boolean
  disabled?: boolean
  className?: string
  children: ReactNode
}

/** Absende-Schaltflaeche: gesperrt bei `disabled` oder `pending`, `aria-busy` und Spinner
 * waehrend `pending`, Rueckversicherungstext nach `SLOW_AFTER_MS` ununterbrochenen `pending`
 * (design.md D1, specs/ui-form/spec.md Requirement "Absende-Schaltflaeche"). Der Timer zaehlt
 * bei jedem neuen `pending` von vorn und raeumt beim Ende von `pending` sowie beim Unmount auf. */
export function SubmitButton({ pending, disabled, className, children }: SubmitButtonProps): ReactNode {
  const t = useT()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!pending) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [pending])

  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending ? 'true' : undefined}>
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending && slow ? t('form.stillWorking') : children}
    </button>
  )
}
