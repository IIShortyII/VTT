/** @jest-environment jsdom */
// Komponententests zum Capability `ui-form` aus
// openspec/changes/add-ui-form/specs/ui-form/spec.md (Requirements „Feldhülle",
// „Absende-Schaltfläche", „Rückversicherungstext in der aktiven Sprache"). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird der oeffentliche Vertrag von `src/client/ui/form.tsx` (design.md D1):
// `Field`, `SubmitButton`, `SLOW_AFTER_MS`. Adressen ueber die Schnittstellentabelle
// design.md D11 (Steuerelement ueber sein Label, Feldhuelle = `parentElement`, Feldfehler
// ueber `aria-describedby`, Schaltflaeche beim Namen; `disabled` als Property, `aria-busy`
// per `getAttribute`, Spinner = erstes Kind mit Klasse `spinner`). Rendering nimmt der
// menschliche App-Test ab (AGENTS.md).
//
// Rote Phase (constitution.md §3.1): das Modul `src/client/ui/form.tsx` existiert noch nicht;
// diese Szenarien liegen bewusst in einer eigenen Datei, damit ihr Ladefehler die bestehenden
// Suiten nicht mitreisst (design.md D11). Sie werden rot am fehlenden Modul bzw. an ihrer
// jeweiligen Assertion — kein Setup-/Tippfehler.

import { act, fireEvent, render, screen } from '@testing-library/react'
import type { FormEvent } from 'react'

import { Field, SubmitButton, SLOW_AFTER_MS, type FieldControlProps } from '../src/client/ui/form.js'
import { setLocale } from '../src/client/i18n/locale.js'

const REASSURANCE_DE = 'Verbinde noch… das kann einen Moment dauern.'
const REASSURANCE_EN = 'Still connecting… this may take a moment.'

afterEach(() => {
  setLocale('de')
  jest.useRealTimers()
})

// --- Requirement: Feldhülle -----------------------------------------------------------------

test('Feld ohne Fehler', () => {
  render(
    <Field id="code" label="Sitzungscode">
      {(control: FieldControlProps) => <input type="text" {...control} />}
    </Field>,
  )

  const control = screen.getByLabelText('Sitzungscode')
  expect(control.getAttribute('id')).toBe('code')
  expect(control.hasAttribute('aria-invalid')).toBe(false)
  expect(control.hasAttribute('aria-describedby')).toBe(false)
  // Die Feldhuelle ist das Elternelement des Steuerelements (Klasse `form-field`).
  expect((control.parentElement as HTMLElement).classList.contains('form-field')).toBe(true)
  // Das Label traegt die Klasse `field-label`.
  const label = document.querySelector('label[for="code"]') as HTMLElement
  expect(label.classList.contains('field-label')).toBe(true)
  // Kein Feldfehler.
  expect(screen.queryByRole('alert')).toBeNull()
})

test('Feld mit Fehler', () => {
  render(
    <Field id="code" label="Sitzungscode" error="Der Sitzungscode ist ungültig.">
      {(control: FieldControlProps) => <input type="text" {...control} />}
    </Field>,
  )

  const control = screen.getByLabelText('Sitzungscode')
  expect(control.getAttribute('aria-invalid')).toBe('true')
  expect(control.getAttribute('aria-describedby')).toBe('code-error')

  const fehler = document.getElementById('code-error') as HTMLElement
  expect(fehler.getAttribute('role')).toBe('alert')
  expect(fehler.classList.contains('field-error')).toBe(true)
  expect(fehler.textContent).toBe('Der Sitzungscode ist ungültig.')
  // Nicht im Label: sein Elternelement ist die Feldhuelle.
  expect((fehler.parentElement as HTMLElement).classList.contains('form-field')).toBe(true)
  // Im Dokument nach dem Textfeld.
  expect(control.compareDocumentPosition(fehler) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

// --- Requirement: Absende-Schaltfläche ------------------------------------------------------

test('Gesperrt, solange das Formular ungültig ist', () => {
  const onSubmit = jest.fn((event: FormEvent) => event.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <SubmitButton pending={false} disabled>
        Beitreten
      </SubmitButton>
    </form>,
  )

  const button = screen.getByRole('button', { name: 'Beitreten' }) as HTMLButtonElement
  fireEvent.click(button)

  expect(button.disabled).toBe(true)
  expect(button.hasAttribute('aria-busy')).toBe(false)
  expect(button.querySelector('.spinner')).toBeNull()
  expect(button.textContent).toBe('Beitreten')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('Ladezustand', () => {
  render(
    <SubmitButton pending disabled={false}>
      Beitreten
    </SubmitButton>,
  )

  const button = screen.getByRole('button', { name: 'Beitreten' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-busy')).toBe('true')
  const spinner = button.firstElementChild as HTMLElement
  expect(spinner.classList.contains('spinner')).toBe(true)
  expect(spinner.getAttribute('aria-hidden')).toBe('true')
  expect(button.textContent).toBe('Beitreten')
})

test('Rückversicherung nach der Verzögerungsgrenze', () => {
  jest.useFakeTimers()
  render(
    <SubmitButton pending disabled={false}>
      Beitreten
    </SubmitButton>,
  )
  const button = screen.getByRole('button', { name: 'Beitreten' }) as HTMLButtonElement

  act(() => {
    jest.advanceTimersByTime(SLOW_AFTER_MS - 1)
  })
  expect(button.textContent).toBe('Beitreten')

  act(() => {
    jest.advanceTimersByTime(1)
  })
  expect(button.textContent).toBe(REASSURANCE_DE)
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-busy')).toBe('true')
})

test('Ende des Ladezustands stellt die Beschriftung wieder her', () => {
  jest.useFakeTimers()
  const { rerender } = render(
    <SubmitButton pending disabled={false}>
      Beitreten
    </SubmitButton>,
  )
  const button = () => screen.getByRole('button') as HTMLButtonElement

  act(() => {
    jest.advanceTimersByTime(5000)
  })
  expect(button().textContent).toBe(REASSURANCE_DE)

  // WHEN: `pending` wird falsch.
  rerender(
    <SubmitButton pending={false} disabled={false}>
      Beitreten
    </SubmitButton>,
  )
  expect(button().textContent).toBe('Beitreten')
  expect(button().disabled).toBe(false)
  expect(button().hasAttribute('aria-busy')).toBe(false)

  // WHEN: `pending` wird erneut wahr; der Timer zaehlt von vorn.
  rerender(
    <SubmitButton pending disabled={false}>
      Beitreten
    </SubmitButton>,
  )
  act(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(button().disabled).toBe(true)
  expect(button().textContent).toBe('Beitreten')
})

test('Unmount räumt den Timer auf', () => {
  jest.useFakeTimers()
  const { unmount } = render(
    <SubmitButton pending disabled={false}>
      Beitreten
    </SubmitButton>,
  )
  act(() => {
    jest.advanceTimersByTime(1000)
  })

  unmount()

  // Unmittelbar nach dem Unmount steht kein Timer mehr aus.
  expect(jest.getTimerCount()).toBe(0)
  // Ein anschliessendes Vorruecken loest keinen Fehler und keine Zustandsaenderung aus.
  expect(() =>
    act(() => {
      jest.advanceTimersByTime(SLOW_AFTER_MS)
    }),
  ).not.toThrow()
})

// --- Requirement: Rückversicherungstext in der aktiven Sprache ------------------------------

test('Rückversicherung auf Englisch', () => {
  jest.useFakeTimers()
  setLocale('en')
  render(
    <SubmitButton pending disabled={false}>
      Join
    </SubmitButton>,
  )
  const button = screen.getByRole('button') as HTMLButtonElement

  act(() => {
    jest.advanceTimersByTime(SLOW_AFTER_MS)
  })

  expect(button.textContent).toBe(REASSURANCE_EN)
})
