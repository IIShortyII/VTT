/** @jest-environment jsdom */
// Komponententests zur neuen Capability `ui-feedback` aus
// openspec/changes/add-toast-feedback/specs/ui-feedback/spec.md (#88) — der Teil, der das
// Toast-Modul direkt gegen seinen oeffentlichen Vertrag prueft: die Requirements „Toast-Host und
// Auslösen", „Lebensdauer", „Stapelgrenze", „Dedupe gleicher Texte", „Räumen beim Unmount" und
// „Auslösen ohne Provider". Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1),
// Testname = Szenarioname.
//
// Diese Szenarien rendern den Provider (bzw. bewusst keinen) um eine kleine Testkomponente, die
// `useToasts()` holt und `push` bereitstellt (design.md D6). Sie importieren
// `ToastProvider`/`useToasts`/`TOAST_TTL_MS`/`TOAST_MAX` aus `src/client/ui/toast.tsx` (Import
// mit `.js`-Endung, TS-Konvention). Das Modul existiert vor der Implementierung noch nicht — der
// Import laesst diese ganze Datei bis dahin nicht laden (der erwartete rote Grund: fehlende
// Implementierung, design.md D6). Damit reisst dieser Import keine anderen Szenarien mit: die
// Auslöser im Raum und das Stylesheet stehen in tests/ui-feedback.unit.test.tsx, das ohne dieses
// Modul ladbar bleibt.
//
// Adressierung ausschliesslich ueber Testing-Library-Abfragen und den Toast-Host
// `getByRole('status')` bzw. dessen `children` (design.md D6); Zeit ueber `jest.useFakeTimers()`
// mit Vorruecken in `act(…)`.

import { act, render, screen, within } from '@testing-library/react'

import { ToastProvider, useToasts, TOAST_TTL_MS, TOAST_MAX } from '../src/client/ui/toast.js'

// Eine kleine Testkomponente faengt das `push` des Hooks ein, damit die Szenarien es direkt in
// `act(…)` aufrufen koennen (design.md D6). Sie rendert selbst nichts Sichtbares.
let push: (text: string) => void = () => {}
function Fangen(): null {
  push = useToasts().push
  return null
}

afterEach(() => {
  jest.useRealTimers()
})

// --- Requirement: Toast-Host und Auslösen ---------------------------------------------------

test('Der Host ist auch ohne Toast vorhanden', () => {
  render(
    <ToastProvider>
      <div>Inhalt</div>
    </ToastProvider>,
  )

  const hosts = screen.getAllByRole('status')
  expect(hosts).toHaveLength(1)
  const host = hosts[0]
  expect(host.getAttribute('aria-live')).toBe('polite')
  expect(host.classList.contains('toast-host')).toBe(true)
  expect(host.children.length).toBe(0)
})

test('Auslösen zeigt einen Toast mit dem Text', () => {
  render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Code kopiert')
  })

  const host = screen.getByRole('status')
  expect(host.children.length).toBe(1)
  const toast = host.children[0] as HTMLElement
  expect(toast.classList.contains('toast')).toBe(true)
  expect(toast.textContent).toBe('Code kopiert')
  expect(within(toast).queryByRole('button')).toBeNull()
  expect(within(toast).queryByRole('link')).toBeNull()
})

test('Mehrere Toasts stehen in Auslöse-Reihenfolge', () => {
  render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Erster')
    push('Zweiter')
    push('Dritter')
  })

  const host = screen.getByRole('status')
  expect(host.children.length).toBe(3)
  expect(Array.from(host.children).map((child) => child.textContent)).toEqual(['Erster', 'Zweiter', 'Dritter'])
})

// --- Requirement: Lebensdauer ---------------------------------------------------------------

test('Toast verschwindet nach Ablauf der Lebensdauer', () => {
  jest.useFakeTimers()
  render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Token angelegt')
  })

  const host = screen.getByRole('status')
  // Kurz vor Ablauf der Lebensdauer ist der Toast noch sichtbar …
  act(() => {
    jest.advanceTimersByTime(TOAST_TTL_MS - 100)
  })
  expect(within(host).queryByText('Token angelegt')).not.toBeNull()
  // … und mit den restlichen 0,1 s (= volle Lebensdauer) verschwindet er von selbst.
  act(() => {
    jest.advanceTimersByTime(100)
  })
  expect(within(host).queryByText('Token angelegt')).toBeNull()
  expect(host.children.length).toBe(0)
})

// --- Requirement: Stapelgrenze --------------------------------------------------------------

test('Der vierte Toast verdrängt den ältesten', () => {
  jest.useFakeTimers()
  render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Erster')
    push('Zweiter')
    push('Dritter')
  })
  expect(screen.getByRole('status').children.length).toBe(TOAST_MAX)

  act(() => {
    push('Vierter')
  })

  const host = screen.getByRole('status')
  expect(host.children.length).toBe(TOAST_MAX)
  expect(Array.from(host.children).map((child) => child.textContent)).toEqual(['Zweiter', 'Dritter', 'Vierter'])
  expect(within(host).queryByText('Erster')).toBeNull()
})

// --- Requirement: Dedupe gleicher Texte -----------------------------------------------------

test('Erneutes Auslösen verlängert statt zu stapeln', () => {
  jest.useFakeTimers()
  render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Karte eingehängt')
  })
  act(() => {
    jest.advanceTimersByTime(2000)
  })
  // Erneutes Auslösen desselben Textes stapelt nicht, sondern setzt die Lebensdauer neu.
  act(() => {
    push('Karte eingehängt')
  })

  const host = screen.getByRole('status')
  expect(host.children.length).toBe(1)
  // 2 s nach dem erneuten Auslösen (also 4 s nach dem ersten) ist er noch sichtbar …
  act(() => {
    jest.advanceTimersByTime(2000)
  })
  expect(within(host).queryByText('Karte eingehängt')).not.toBeNull()
  expect(host.children.length).toBe(1)
  // … und 0,8 s spaeter (volle Lebensdauer seit dem erneuten Auslösen) verschwindet er.
  act(() => {
    jest.advanceTimersByTime(800)
  })
  expect(within(host).queryByText('Karte eingehängt')).toBeNull()
})

test('Dedupe trifft auch einen älteren Toast', () => {
  jest.useFakeTimers()
  render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Erster')
    push('Zweiter')
  })
  act(() => {
    push('Erster')
  })

  const host = screen.getByRole('status')
  expect(host.children.length).toBe(2)
  expect(Array.from(host.children).map((child) => child.textContent)).toEqual(['Erster', 'Zweiter'])
})

// --- Requirement: Räumen beim Unmount -------------------------------------------------------

test('Unmount lässt keinen Timer zurück', () => {
  jest.useFakeTimers()
  const { unmount } = render(
    <ToastProvider>
      <Fangen />
    </ToastProvider>,
  )
  act(() => {
    push('Erster')
    push('Zweiter')
  })
  expect(screen.getByRole('status').children.length).toBe(2)

  act(() => {
    unmount()
  })
  act(() => {
    jest.advanceTimersByTime(3000)
  })

  // Nach dem Entfernen steht kein Lebensdauer-Timer des Providers mehr aus.
  expect(jest.getTimerCount()).toBe(0)
})

// --- Requirement: Auslösen ohne Provider ----------------------------------------------------

test('Ohne Provider passiert nichts', () => {
  expect(() => {
    render(<Fangen />)
    act(() => {
      push('Verloren')
    })
  }).not.toThrow()

  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByText('Verloren')).toBeNull()
})
