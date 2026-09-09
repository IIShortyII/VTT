/** @jest-environment jsdom */
// Komponententests zum Requirement "Anmeldeoberfläche" aus
// openspec/changes/add-user-auth/specs/user-auth/spec.md und dem Delta aus
// openspec/changes/fix-auth-followups/specs/user-auth/spec.md. Ein Test je Szenario,
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

/** Der Pfad, den ein `fetch`-Aufruf anspricht — unabhaengig von der Eingabeform. */
function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** Bedient `fetch` anhand des angefragten Pfades. */
function mockFetch(routes: Array<{ pfad: string; antwort: Response }>): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input)
    const treffer = routes.find((route) => url.includes(route.pfad))
    return must(treffer, `eine gemockte Antwort für ${url}`).antwort
  }) as unknown as typeof fetch
}

/**
 * Bedient `fetch` so, dass ein bestimmter Pfad die Anfrage *verwirft* (kein HTTP-Ergebnis,
 * sondern ein geworfener Fehler — Netzfehler, Server nicht erreichbar), waehrend die uebrigen
 * Pfade regulaer antworten. Damit laesst sich der Fall "keine brauchbare Antwort" pruefen, den
 * die Spec vom "Server sagt nein" (`401`) unterscheidet.
 */
function mockFetchMitFehler(
  fehlerPfad: string,
  routes: Array<{ pfad: string; antwort: Response }>,
): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input)
    if (url.includes(fehlerPfad)) {
      throw new TypeError('Failed to fetch')
    }
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

test('Server beim Start nicht erreichbar', async () => {
  // Die Abfrage des angemeldeten Nutzers beim Start scheitert ohne Antwort des Servers: die
  // Anfrage wird mit einem Fehler verworfen. Die Anwendung darf sich davon nicht als
  // angemeldet oder still weiterladend zeigen — der Server hat nichts bestaetigt
  // (constitution.md §9.1).
  mockFetchMitFehler('/api/auth/me', [])

  const { container } = render(<App />)

  // Das Anmeldeformular erscheint (der Besucher kommt an ein Formular, mit dem er es erneut
  // versuchen kann) …
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  expect(passwortFeld(container)).not.toBeNull()
  // … samt einem sichtbaren Hinweis, dass der Server nicht erreichbar war …
  expect(screen.getByText(/nicht erreichbar/i)).toBeTruthy()
  // … und der Ladehinweis ist verschwunden (kein dauerhaftes Verharren im Ladezustand).
  expect(screen.queryByText(/lädt/i)).toBeNull()
})

test('Fehlgeschlagene Abmeldung wird angezeigt', async () => {
  const user = { id: 'nutzer-1', email: 'spieler@example.com' }
  // Angemeldeter Nutzer beim Start; die Abmeldeanfrage scheitert dann ohne Antwort des
  // Servers (Anfrage verworfen).
  mockFetchMitFehler('/api/auth/logout', [
    { pfad: '/api/auth/me', antwort: antwort(200, user) },
  ])

  render(<App />)

  // In der angemeldeten Ansicht auf "Abmelden" gehen.
  const abmelden = await screen.findByRole('button', { name: /abmelden/i })
  fireEvent.click(abmelden)

  // Der Fehlschlag wird sichtbar gemacht, statt lautlos zu verpuffen …
  await waitFor(() => expect(screen.getByText(/abmelden fehlgeschlagen/i)).toBeTruthy())
  // … und die Ansicht bleibt angemeldet: der Server hat die Abmeldung nicht bestaetigt
  // (constitution.md §9.1).
  expect(screen.getByRole('button', { name: /abmelden/i })).toBeTruthy()
  expect(screen.getByText(/angemeldet als/i)).toBeTruthy()
})
