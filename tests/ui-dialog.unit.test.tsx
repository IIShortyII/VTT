/** @jest-environment jsdom */
// Komponententests zur neuen Capability `ui-dialog` aus
// openspec/changes/add-ui-dialog/specs/ui-dialog/spec.md (#89). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname: zwei zu
// „Modal-Baustein", zwei zu „Fokus beim Öffnen", drei zu „Tab-Zyklus", vier zu „Schließen",
// zwei zu „Fokusrückgabe", sechs zu „Bestätigungsdialog", eins zu „Ohne Provider" und eins
// zum „Stylesheet der Dialoge".
//
// Diese Szenarien rendern `Modal` bzw. `ConfirmProvider` um kleine Testkomponenten, ohne `App`
// (design.md D9). Die Module `src/client/ui/Modal.tsx` und `src/client/ui/confirm.tsx`
// existieren noch nicht — der Import mit `.js`-Endung (TS-Konvention, `moduleNameMapper`) läuft
// erst nach der Implementierung auf. In der roten Phase scheitert die Suite daher am fehlenden
// Modul (der erwartete Grund für ein TDD-Rot, constitution.md §3.1); deshalb liegen alle
// Szenarien, die diese Module importieren, in dieser einen Datei — ein Ladefehler reißt so
// nicht die Start- und Bibliotheks-Suiten mit (design.md D9).
//
// Adressierung ausschließlich über Rolle und Namen (design.md D9): `getByRole`,
// `getByLabelText`, `within`; nie `querySelector` über id/name. Backdrop = `parentElement` des
// Dialog-Elements. Tasten per Keydown-Ereignis auf dem fokussierten Element (Tab, Umschalt+Tab)
// bzw. auf dem Dialog-Element (Escape, bubbelt zu `document`). Fokus über
// `document.activeElement`. jsdom bewegt den Fokus bei `Tab` nicht von selbst; die Tab-Szenarien
// prüfen daher ausschließlich den Umbruch (design.md D9).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { useRef, useState } from 'react'
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'

import { Modal } from '../src/client/ui/Modal.js'
import { ConfirmProvider, useConfirm } from '../src/client/ui/confirm.js'
import type { ConfirmOptions } from '../src/client/ui/confirm.js'

// --- Testkomponenten ------------------------------------------------------------------------

// Rendert `Öffnen` (Auslöser) und ihr Modal; Schließen setzt den State zurück, sodass der
// Aufrufer das Modal nicht mehr rendert (design.md D9, „Fokusrückgabe").
function OeffnenHarness() {
  const [offen, setOffen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOffen(true)}>
        Öffnen
      </button>
      {offen && (
        <Modal title="Beispiel" onClose={() => setOffen(false)}>
          <button type="button" onClick={() => setOffen(false)}>
            Abbrechen
          </button>
        </Modal>
      )}
    </>
  )
}

// Wie oben, doch nach dem Auslösen im Modal rendert der Aufrufer weder Modal noch `Öffnen`
// mehr (der Auslöser verschwindet, design.md D9).
function VerschwindenHarness() {
  const [phase, setPhase] = useState<'zu' | 'auf' | 'weg'>('zu')
  if (phase === 'weg') return <p>fertig</p>
  return (
    <>
      <button type="button" onClick={() => setPhase('auf')}>
        Öffnen
      </button>
      {phase === 'auf' && (
        <Modal title="Beispiel" onClose={() => setPhase('zu')}>
          <button type="button" onClick={() => setPhase('weg')}>
            Entfernen
          </button>
        </Modal>
      )}
    </>
  )
}

// Ruft `confirm` mit der jeweils nächsten Optionsmenge und rendert jedes Ergebnis in
// Reihenfolge als Listeneintrag `bestätigt`/`abgelehnt` (design.md D9, „Bestätigungsdialog").
function ConfirmHarness({ optionsList }: { optionsList: ConfirmOptions[] }) {
  const { confirm } = useConfirm()
  const [ergebnis, setErgebnis] = useState<string[]>([])
  const indexRef = useRef(0)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const i = indexRef.current
          indexRef.current = i + 1
          const opts = optionsList[Math.min(i, optionsList.length - 1)]
          void confirm(opts).then((ok) => {
            setErgebnis((e) => [...e, ok ? 'bestätigt' : 'abgelehnt'])
          })
        }}
      >
        Rückfrage
      </button>
      <ul aria-label="Ergebnisse">
        {ergebnis.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </>
  )
}

async function stelleAnfrage(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Rückfrage' }))
  })
}

// ============================================================================================
// Requirement: Modal-Baustein
// ============================================================================================

test('Modal rendert Dialog mit Titel, Schließen-Schaltfläche und Inhalt', () => {
  render(
    <Modal title="Beispiel" onClose={jest.fn()}>
      <button type="button">Weiter</button>
    </Modal>,
  )

  const dialoge = screen.getAllByRole('dialog')
  expect(dialoge).toHaveLength(1)
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.classList.contains('modal')).toBe(true)
  expect(dialog.parentElement?.classList.contains('modal-backdrop')).toBe(true)
  // Die erste Schaltfläche der Box heißt `Schließen` (erstes Element in der Box).
  expect(within(dialog).getAllByRole('button')[0]).toBe(within(dialog).getByRole('button', { name: 'Schließen' }))
  expect(within(dialog).getByRole('heading', { level: 2, name: 'Beispiel' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Weiter' })).toBeTruthy()
  expect(dialog.hasAttribute('aria-describedby')).toBe(false)
})

test('Rolle alertdialog mit Beschreibung und breiter Box', () => {
  render(
    <Modal
      title="Wirklich?"
      role="alertdialog"
      description="Das lässt sich nicht rückgängig machen."
      wide
      onClose={jest.fn()}
    >
      <button type="button">Weiter</button>
    </Modal>,
  )

  const dialog = screen.getByRole('alertdialog', { name: 'Wirklich?' })
  expect(dialog.classList.contains('modal')).toBe(true)
  expect(dialog.classList.contains('modal--wide')).toBe(true)
  const descId = dialog.getAttribute('aria-describedby') ?? ''
  expect(document.getElementById(descId)?.textContent).toBe('Das lässt sich nicht rückgängig machen.')
})

// ============================================================================================
// Requirement: Fokus beim Öffnen
// ============================================================================================

test('Ohne autoFocus erhält die Schließen-Schaltfläche den Fokus', () => {
  render(
    <Modal title="Beispiel" onClose={jest.fn()}>
      <button type="button">Weiter</button>
    </Modal>,
  )

  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Schließen' }))
})

test('Ein Kind mit autoFocus behält den Fokus', () => {
  render(
    <Modal title="Beispiel" onClose={jest.fn()}>
      <button type="button" autoFocus>
        Weiter
      </button>
    </Modal>,
  )

  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Weiter' }))
  expect(document.activeElement).not.toBe(within(dialog).getByRole('button', { name: 'Schließen' }))
})

// ============================================================================================
// Requirement: Tab-Zyklus
// ============================================================================================

test('Tab auf dem letzten Element springt zum ersten', () => {
  render(
    <Modal title="Beispiel" onClose={jest.fn()}>
      <button type="button">Eins</button>
      <button type="button">Zwei</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  const zwei = within(dialog).getByRole('button', { name: 'Zwei' })
  zwei.focus()

  const ev = createEvent.keyDown(zwei, { key: 'Tab' })
  fireEvent(zwei, ev)

  expect(ev.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Schließen' }))
})

test('Umschalt+Tab auf dem ersten Element springt zum letzten', () => {
  render(
    <Modal title="Beispiel" onClose={jest.fn()}>
      <button type="button">Eins</button>
      <button type="button">Zwei</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  const schliessen = within(dialog).getByRole('button', { name: 'Schließen' })
  schliessen.focus()

  const ev = createEvent.keyDown(schliessen, { key: 'Tab', shiftKey: true })
  fireEvent(schliessen, ev)

  expect(ev.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Zwei' }))
})

test('Tab zwischen zwei Elementen bewegt den Fokus nicht selbst', () => {
  render(
    <Modal title="Beispiel" onClose={jest.fn()}>
      <button type="button">Eins</button>
      <button type="button">Zwei</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  const eins = within(dialog).getByRole('button', { name: 'Eins' })
  eins.focus()

  const ev = createEvent.keyDown(eins, { key: 'Tab' })
  fireEvent(eins, ev)

  expect(ev.defaultPrevented).toBe(false)
  expect(document.activeElement).toBe(eins)
})

// ============================================================================================
// Requirement: Schließen
// ============================================================================================

test('Escape ruft onClose', () => {
  const onClose = jest.fn()
  render(
    <Modal title="Beispiel" onClose={onClose}>
      <button type="button">Weiter</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })

  fireEvent.keyDown(dialog, { key: 'Escape' })

  expect(onClose).toHaveBeenCalledTimes(1)
})

test('Klick auf den Backdrop ruft onClose', () => {
  const onClose = jest.fn()
  render(
    <Modal title="Beispiel" onClose={onClose}>
      <button type="button">Weiter</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  const backdrop = dialog.parentElement as HTMLElement

  fireEvent.click(backdrop)

  expect(onClose).toHaveBeenCalledTimes(1)
})

test('Klick in die Box ruft onClose nicht', () => {
  const onClose = jest.fn()
  render(
    <Modal title="Beispiel" onClose={onClose}>
      <button type="button">Weiter</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })

  fireEvent.click(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Weiter' }))

  expect(onClose).not.toHaveBeenCalled()
})

test('Schließen-Schaltfläche ruft onClose', () => {
  const onClose = jest.fn()
  render(
    <Modal title="Beispiel" onClose={onClose}>
      <button type="button">Weiter</button>
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })

  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))

  expect(onClose).toHaveBeenCalledTimes(1)
})

// ============================================================================================
// Requirement: Fokusrückgabe
// ============================================================================================

test('Auslöser erhält den Fokus zurück', async () => {
  render(<OeffnenHarness />)
  const oeffnen = screen.getByRole('button', { name: 'Öffnen' })
  oeffnen.focus()
  expect(document.activeElement).toBe(oeffnen)

  await act(async () => {
    fireEvent.click(oeffnen)
  })
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })
  // Nach dem Öffnen liegt der Fokus innerhalb des Dialogs …
  expect(dialog.contains(document.activeElement)).toBe(true)

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  })

  // … und nach dem Schließen zurück auf dem Auslöser.
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(oeffnen)
})

test('Verschwundener Auslöser bekommt keinen Fokus', async () => {
  render(<VerschwindenHarness />)
  const oeffnen = screen.getByRole('button', { name: 'Öffnen' })
  oeffnen.focus()

  await act(async () => {
    fireEvent.click(oeffnen)
  })
  const dialog = screen.getByRole('dialog', { name: 'Beispiel' })

  let fehler: unknown = null
  await act(async () => {
    try {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
    } catch (e) {
      fehler = e
    }
  })

  expect(fehler).toBeNull()
  expect(screen.queryByRole('button', { name: 'Öffnen' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(document.body)
})

// ============================================================================================
// Requirement: Bestätigungsdialog
// ============================================================================================

test('Anfrage öffnet den Bestätigungsdialog', async () => {
  render(
    <ConfirmProvider>
      <ConfirmHarness
        optionsList={[
          { title: 'Karte löschen?', message: 'Die Karte ist danach weg.', confirmLabel: 'Löschen', danger: true },
        ]}
      />
    </ConfirmProvider>,
  )

  await stelleAnfrage()

  const dialog = screen.getByRole('alertdialog', { name: 'Karte löschen?' })
  const descId = dialog.getAttribute('aria-describedby') ?? ''
  expect(document.getElementById(descId)?.textContent).toBe('Die Karte ist danach weg.')
  expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeTruthy()
  const loeschen = within(dialog).getByRole('button', { name: 'Löschen' })
  expect(loeschen.classList.contains('danger')).toBe(true)
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  expect(screen.queryByText('bestätigt')).toBeNull()
  expect(screen.queryByText('abgelehnt')).toBeNull()
})

test('Bestätigen löst mit true auf', async () => {
  render(
    <ConfirmProvider>
      <ConfirmHarness optionsList={[{ title: 'Titel', message: 'Text', confirmLabel: 'Weiter' }]} />
    </ConfirmProvider>,
  )
  await stelleAnfrage()
  const dialog = screen.getByRole('alertdialog', { name: 'Titel' })
  const weiter = within(dialog).getByRole('button', { name: 'Weiter' })
  expect(weiter.classList.contains('primary')).toBe(true)

  await act(async () => {
    fireEvent.click(weiter)
  })

  expect(screen.getByText('bestätigt')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('Abbrechen löst mit false auf', async () => {
  render(
    <ConfirmProvider>
      <ConfirmHarness optionsList={[{ title: 'Titel', message: 'Text', confirmLabel: 'Weiter' }]} />
    </ConfirmProvider>,
  )
  await stelleAnfrage()
  const dialog = screen.getByRole('alertdialog', { name: 'Titel' })

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  })

  expect(screen.getByText('abgelehnt')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('Escape löst mit false auf', async () => {
  render(
    <ConfirmProvider>
      <ConfirmHarness optionsList={[{ title: 'Titel', message: 'Text', confirmLabel: 'Weiter' }]} />
    </ConfirmProvider>,
  )
  await stelleAnfrage()
  const dialog = screen.getByRole('alertdialog', { name: 'Titel' })

  await act(async () => {
    fireEvent.keyDown(dialog, { key: 'Escape' })
  })

  expect(screen.getByText('abgelehnt')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('Backdrop-Klick löst mit false auf', async () => {
  render(
    <ConfirmProvider>
      <ConfirmHarness optionsList={[{ title: 'Titel', message: 'Text', confirmLabel: 'Weiter' }]} />
    </ConfirmProvider>,
  )
  await stelleAnfrage()
  const dialog = screen.getByRole('alertdialog', { name: 'Titel' })
  const backdrop = dialog.parentElement as HTMLElement

  await act(async () => {
    fireEvent.click(backdrop)
  })

  expect(screen.getByText('abgelehnt')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('Zweite Anfrage ersetzt die offene', async () => {
  render(
    <ConfirmProvider>
      <ConfirmHarness
        optionsList={[
          { title: 'Erste?', message: 'Eins', confirmLabel: 'Ja' },
          { title: 'Zweite?', message: 'Zwei', confirmLabel: 'Ja' },
        ]}
      />
    </ConfirmProvider>,
  )
  // GIVEN: die erste Anfrage ist offen.
  await stelleAnfrage()
  expect(screen.getByRole('alertdialog', { name: 'Erste?' })).toBeTruthy()

  // WHEN: eine zweite Anfrage wird gestellt.
  await stelleAnfrage()

  // THEN: die erste ist mit `abgelehnt` aufgelöst, die zweite noch nicht, und es gibt genau
  // einen `alertdialog` mit dem Namen `Zweite?`.
  const ergebnisse = within(screen.getByRole('list', { name: 'Ergebnisse' })).getAllByRole('listitem')
  expect(ergebnisse.map((li) => li.textContent)).toEqual(['abgelehnt'])
  const dialoge = screen.getAllByRole('alertdialog')
  expect(dialoge).toHaveLength(1)
  expect(dialoge[0]).toBe(screen.getByRole('alertdialog', { name: 'Zweite?' }))
})

// ============================================================================================
// Requirement: Ohne Provider
// ============================================================================================

test('Anfrage ohne Provider wird sofort abgelehnt', async () => {
  render(<ConfirmHarness optionsList={[{ title: 'Titel', message: 'Text', confirmLabel: 'Weiter' }]} />)

  await stelleAnfrage()

  expect(screen.getByText('abgelehnt')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

// ============================================================================================
// Requirement: Stylesheet der Dialoge
// ============================================================================================
// Das Stylesheet wird als Text gelesen (Helfer wie in der Theme-/Feedback-/Start-Suite, hier
// dupliziert, design.md D9). Ein Selektor ist vorhanden, wenn die normalisierte CSS die
// Zeichenfolge `<selektor> {` enthält (spec.md „Begriffe"). Außerhalb des Tokenblocks (`:root`)
// darf kein `#`-Hex-Wert und kein Aufruf von `rgb(`/`rgba(`/`hsl(`/`hsla(` stehen.

function readText(relPath: string): string {
  try {
    return readFileSync(resolve(process.cwd(), relPath), 'utf8')
  } catch {
    return ''
  }
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function selectorPresent(normalizedCss: string, selector: string): boolean {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  return re.test(normalizedCss)
}

// Der Tokenblock reicht von `:root {` bis zur nächsten `}` (keine verschachtelten Klammern).
function rootBlockRange(strippedCss: string): { start: number; end: number } {
  const start = strippedCss.search(/:root\s*\{/)
  if (start < 0) return { start: -1, end: -1 }
  const braceStart = strippedCss.indexOf('{', start)
  const braceEnd = strippedCss.indexOf('}', braceStart)
  return { start, end: braceEnd }
}

const DIALOG_SELEKTOREN = [
  '.modal-backdrop',
  '.modal',
  '.modal--wide',
  '.modal-close',
  '.modal-title',
  '.modal-description',
  '.modal-actions',
]

test('Dialog-Selektoren vorhanden', () => {
  const stripped = stripComments(readText('src/client/app/theme.css'))
  const norm = normalizeWs(stripped)
  const fehlend = DIALOG_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))

  const { start, end } = rootBlockRange(stripped)
  const ausserhalb = start >= 0 && end >= 0 ? stripped.slice(0, start) + stripped.slice(end + 1) : stripped
  const hexWerte = ausserhalb.match(/#[0-9a-f]{3,8}/gi) ?? []
  const farbFunktionen = ausserhalb.match(/\b(rgba?|hsla?)\s*\(/gi) ?? []

  expect({ fehlend, farbwerteAusserhalb: [...hexWerte, ...farbFunktionen] }).toEqual({
    fehlend: [],
    farbwerteAusserhalb: [],
  })
})
