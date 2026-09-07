/** @jest-environment jsdom */
// Komponententests zum Requirement "Anmeldeoberfläche" aus
// openspec/changes/add-user-auth/specs/user-auth/spec.md. Ein Test je Szenario,
// Testname = Szenarioname (constitution.md §4.1).
//
// Geprueft wird, *was* die Anwendung anbietet und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). `fetch` ist gemockt, damit der
// Server hier nur eine Antwort ist (design.md D10).

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../src/client/app/App.js'

const FEHLERMELDUNG = 'E-Mail oder Passwort ist falsch.'

const originalFetch = globalThis.fetch

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}

function antwort(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** Bedient `fetch` anhand des angefragten Pfades. */
function mockFetch(routes: Array<{ pfad: string; antwort: Response }>): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const treffer = routes.find((route) => url.includes(route.pfad))
    return must(treffer, `eine gemockte Antwort für ${url}`).antwort
  }) as unknown as typeof fetch
}

// Die Felder werden ueber ihre Bedeutung gesucht, nicht ueber eine bestimmte Beschriftung:
// Typ, `name` oder `id` — irgendeines davon traegt jedes ernst gemeinte Eingabefeld.
function emailFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector('input[type="email"], input[name="email"], input#email')
}

function passwortFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector('input[type="password"], input[name="password"], input#password')
}

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
})

test('Ohne Anmeldung erscheint das Anmeldeformular', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) }])

  const { container } = render(<App />)

  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  expect(passwortFeld(container)).not.toBeNull()
  // Wechsel zur Registrierung (design.md D7: kein Router, ein Umschalter in der Ansicht).
  expect(screen.getAllByText(/registr/i).length).toBeGreaterThan(0)
})

test('Fehlgeschlagene Anmeldung wird angezeigt', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) },
    // Der Server meldet den Fehlschlag; die Anwendung soll ihn sichtbar machen, statt ihn zu
    // verschlucken. Beide gaengigen Feldnamen tragen denselben Text — geprueft wird, dass die
    // Meldung des Servers ankommt, nicht wie die Huelle heisst.
    {
      pfad: '/api/auth/login',
      antwort: antwort(401, { error: FEHLERMELDUNG, message: FEHLERMELDUNG }),
    },
  ])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  const email = must(emailFeld(container), 'ein Eingabefeld für die E-Mail')
  const passwort = must(passwortFeld(container), 'ein Eingabefeld für das Passwort')
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  fireEvent.change(passwort, { target: { value: 'ein-sicheres-passwort' } })

  fireEvent.submit(must(email.closest('form'), 'ein <form> um die Anmeldefelder'))

  await waitFor(() => expect(screen.getAllByText(FEHLERMELDUNG).length).toBeGreaterThan(0))
  expect(emailFeld(container)).not.toBeNull()
  expect(passwortFeld(container)).not.toBeNull()
})
