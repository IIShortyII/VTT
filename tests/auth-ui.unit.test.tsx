/** @jest-environment jsdom */
// Komponententests zum Requirement "Anmeldeoberfläche" aus
// openspec/changes/add-user-auth/specs/user-auth/spec.md und dem Delta aus
// openspec/changes/fix-auth-followups/specs/user-auth/spec.md sowie dem Requirement
// "Registrierungsoberfläche" aus openspec/changes/add-username-and-alias/specs/user-auth/spec.md
// (#45). Ein Test je Szenario, Testname = Szenarioname (constitution.md §4.1).
//
// Geprueft wird, *was* die Anwendung anbietet und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). `fetch` ist gemockt, damit der
// Server hier nur eine Antwort ist (design.md D10).
//
// Nutzer-Fixtures tragen ab #45 zusaetzlich `username` (die Antwort von `/api/auth/me` nennt
// ihn). Die beiden Szenarien der Registrierungsoberfläche sind rot, weil das
// Registrierungsformular das Nutzernamensfeld noch nicht rendert.

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  return container.querySelector('input[type="email"], input[name="email"], input#email, input#register-email')
}

function passwortFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector('input[type="password"], input[name="password"], input#password, input#register-password')
}

// Das Nutzernamensfeld der Registrierung (#45, design.md D6): `id` `register-username`, `name`
// `username` oder `autoComplete="nickname"`.
function nutzernameFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector('input[name="username"], input#register-username, input[autocomplete="nickname"]')
}

/** Wechselt aus dem Anmelde- in das Registrierungsformular (ein Umschalter, kein Router). */
function zurRegistrierung(): void {
  fireEvent.click(screen.getByRole('button', { name: /registrieren/i }))
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
  const user = { id: 'nutzer-1', email: 'spieler@example.com', username: 'Gandalf' }
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
  const header = screen.getByRole('banner')
  expect(within(header).getByText('Gandalf')).toBeTruthy()
  expect(within(header).getByRole('button', { name: 'Abmelden' })).toBeTruthy()
})

// --- Registrierungsoberfläche (#45) ---------------------------------------------------------
// Requirement "Registrierungsoberfläche" aus
// openspec/changes/add-username-and-alias/specs/user-auth/spec.md. Das Nutzernamensfeld
// (design.md D6) entsteht erst mit der Implementierung; bis dahin fehlt es — die Tests sind
// rot, weil das erwartete Feld nicht gerendert wird.

test('Registrierungsformular zeigt das Nutzernamensfeld', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) }])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  zurRegistrierung()
  await screen.findByText(/Registrierung/i)

  // Eingabefelder für Nutzername, E-Mail und Passwort.
  expect(nutzernameFeld(container)).not.toBeNull()
  expect(emailFeld(container)).not.toBeNull()
  expect(passwortFeld(container)).not.toBeNull()
})

test('Vergebener Nutzername wird angezeigt', async () => {
  const ABLEHNUNG = 'Dieser Nutzername ist bereits vergeben.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) },
    {
      pfad: '/api/auth/register',
      antwort: antwort(409, { error: ABLEHNUNG, message: ABLEHNUNG, field: 'username' }),
    },
  ])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  zurRegistrierung()
  await screen.findByText(/Registrierung/i)

  const nutzername = must(nutzernameFeld(container), 'ein Eingabefeld für den Nutzernamen')
  const email = must(emailFeld(container), 'ein Eingabefeld für die E-Mail')
  const passwort = must(passwortFeld(container), 'ein Eingabefeld für das Passwort')
  fireEvent.change(nutzername, { target: { value: 'Gandalf' } })
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  fireEvent.change(passwort, { target: { value: 'ein-sicheres-passwort' } })

  fireEvent.submit(must(nutzername.closest('form'), 'ein <form> um die Registrierungsfelder'))

  // Die Meldung des Servers wird angezeigt …
  await waitFor(() => expect(screen.getAllByText(ABLEHNUNG).length).toBeGreaterThan(0))
  // … und die Ansicht bleibt im Registrierungsformular (das Nutzernamensfeld ist weiter da).
  expect(nutzernameFeld(container)).not.toBeNull()
})

// --- Passwortänderung in der Oberfläche -----------------------------------------------------
// Requirement "Passwortänderung in der Oberfläche" aus
// openspec/changes/add-account-security/specs/user-auth/spec.md. Das Formular (design.md D5)
// entsteht erst mit der Implementierung; bis dahin fehlen Felder/Meldungen — die Tests sind rot,
// weil die erwartete Oberfläche noch nicht gerendert wird.

const ANGEMELDETER_NUTZER = { id: 'nutzer-1', email: 'spieler@example.com', username: 'Gandalf' }

// Die beiden Passwortfelder werden über ihre Bedeutung gesucht (autoComplete bzw. name aus
// design.md D5), nicht über eine bestimmte Beschriftung.
function bisherigesPasswortFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector('input[autocomplete="current-password"], input[name="currentPassword"]')
}

function neuesPasswortFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector('input[autocomplete="new-password"], input[name="newPassword"]')
}

test('Angemeldete Ansicht bietet die Passwortänderung an', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) }])

  const { container } = render(<App />)
  await screen.findByRole('button', { name: /ändern/i })

  // Die Passwortänderung liegt in der Sitzungsliste (die Abmeldung liegt in der Top-Bar,
  // ui-shell): Eingabefelder für das bisherige und das neue Passwort und eine Schaltfläche zum Ändern.
  expect(bisherigesPasswortFeld(container)).not.toBeNull()
  expect(neuesPasswortFeld(container)).not.toBeNull()
  expect(screen.getByRole('button', { name: /ändern/i })).toBeTruthy()
})

test('Abgelehnte Passwortänderung wird angezeigt', async () => {
  const ABLEHNUNG = 'Das bisherige Passwort ist falsch.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) },
    {
      pfad: '/api/auth/password',
      antwort: antwort(403, { error: ABLEHNUNG, message: ABLEHNUNG, field: 'currentPassword' }),
    },
  ])

  const { container } = render(<App />)
  await screen.findByRole('button', { name: /ändern/i })
  const bisher = must(bisherigesPasswortFeld(container), 'ein Feld für das bisherige Passwort')
  const neu = must(neuesPasswortFeld(container), 'ein Feld für das neue Passwort')
  fireEvent.change(bisher, { target: { value: 'ein-sicheres-passwort' } })
  fireEvent.change(neu, { target: { value: 'mein-neues-sicheres-passwort' } })

  fireEvent.submit(must(bisher.closest('form'), 'ein <form> um die Passwortfelder'))

  // Die Meldung des Servers wird angezeigt …
  await waitFor(() => expect(screen.getAllByText(ABLEHNUNG).length).toBeGreaterThan(0))
  // … und die Ansicht bleibt angemeldet (constitution.md §9.1): eine abgelehnte Änderung meldet
  // den Nutzer nicht ab.
  expect(screen.getByRole('button', { name: /ändern/i })).toBeTruthy()
})

test('Erfolgreiche Passwortänderung wird bestätigt', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) },
    { pfad: '/api/auth/password', antwort: antwort(200, { ok: true }) },
  ])

  const { container } = render(<App />)
  await screen.findByRole('button', { name: /ändern/i })
  const bisher = must(bisherigesPasswortFeld(container), 'ein Feld für das bisherige Passwort')
  const neu = must(neuesPasswortFeld(container), 'ein Feld für das neue Passwort')
  fireEvent.change(bisher, { target: { value: 'ein-sicheres-passwort' } })
  fireEvent.change(neu, { target: { value: 'mein-neues-sicheres-passwort' } })

  fireEvent.submit(must(bisher.closest('form'), 'ein <form> um die Passwortfelder'))

  // Eine Erfolgsmeldung erscheint …
  await waitFor(() => expect(screen.getByText(/geändert/i)).toBeTruthy())
  // … beide Passwortfelder sind geleert …
  expect((must(bisherigesPasswortFeld(container), 'das bisherige Passwortfeld') as HTMLInputElement).value).toBe('')
  expect((must(neuesPasswortFeld(container), 'das neue Passwortfeld') as HTMLInputElement).value).toBe('')
  // … und die Ansicht bleibt angemeldet.
  expect(screen.getByRole('button', { name: /ändern/i })).toBeTruthy()
})
