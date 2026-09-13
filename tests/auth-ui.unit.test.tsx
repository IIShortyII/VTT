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
// add-ui-form (#90, MODIFIED user-auth): Anmelde-, Registrierungs- und Passwort-Formular folgen
// dem Formularmuster von `ui-form` (design.md D4). Eine Ablehnung mit `field` erscheint als
// Feldfehler des genannten Feldes (`aria-invalid="true"` am Steuerelement, `aria-describedby`
// auf ein `role="alert"`-Element mit der Meldung); eine Ablehnung ohne `field` und ein
// Netzfehler als Formularfehler (`role="alert"`, Klasse `form-error`) unter dem letzten Feld;
// die Absende-Schaltflaeche ist gesperrt, solange das gemeinsame Schema den Zustand nicht
// akzeptiert.
//
// add-ui-menu (#92, MODIFIED user-auth + ui-shell): Die Passwortaenderung liegt jetzt in einem
// Modal (`ui-dialog`) mit dem Titel `Passwort ändern`, das der Eintrag `Passwort ändern` des
// Kontomenues (Menue-Schaltflaeche mit dem Nutzernamen in der Top-Bar) oeffnet. Solange das
// Modal nicht offen ist, ist kein Passwortfeld gerendert; beim Oeffnen erhaelt `Bisheriges
// Passwort` den Fokus, nach einem Erfolg schliesst das Modal und der Fokus kehrt zur
// Menue-Schaltflaeche des Kontos zurueck. Das Abmelden ist ebenfalls ein Menueeintrag. Die vier
// Passwort-Szenarien und „Fehlgeschlagene Abmeldung wird angezeigt" aendern ihre Erwartung
// (Testnamen bleiben).
//
// Rote Phase (constitution.md §3.1): Kontomenue und Passwort-Modal existieren noch nicht; die
// betroffenen Szenarien scheitern daran, dass weder die Menue-Schaltflaeche des Kontos noch der
// Menueeintrag noch der Dialog `Passwort ändern` gefunden werden — fehlende Implementierung,
// kein Setup-Fehler.

import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { App } from '../src/client/app/App.js'

const FEHLERMELDUNG = 'E-Mail oder Passwort ist falsch.'
const REASSURANCE_DE = 'Verbinde noch… das kann einen Moment dauern.'
const GUELTIGES_PASSWORT = 'ein-sehr-sicheres-passwort'

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

/** Wurde `fetch` mit einem Pfad aufgerufen? (Fuer „es wurde keine Anfrage gesendet".) */
function fetchAngefragt(pfad: string): boolean {
  const mock = globalThis.fetch as unknown as jest.Mock
  return mock.mock.calls.some(([input]) => urlOf(input as RequestInfo | URL).includes(pfad))
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

/** Der Feldfehler eines Steuerelements: das `role="alert"`-Element, auf das `aria-describedby`
 * zeigt (design.md D11). `null`, wenn das Steuerelement keines nennt. */
function feldFehlerVon(control: HTMLElement): HTMLElement | null {
  const id = control.getAttribute('aria-describedby')
  return id ? document.getElementById(id) : null
}

/** Wechselt aus dem Anmelde- in das Registrierungsformular (ein Umschalter, kein Router). */
function zurRegistrierung(): void {
  fireEvent.click(screen.getByRole('button', { name: /registrieren/i }))
}

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
  jest.useRealTimers()
})

test('Ohne Anmeldung erscheint das Anmeldeformular', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) }])

  const { container } = render(<App />)

  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  expect(passwortFeld(container)).not.toBeNull()
  // Wechsel zur Registrierung (design.md D7: kein Router, ein Umschalter in der Ansicht).
  expect(screen.getAllByText(/registr/i).length).toBeGreaterThan(0)
  // MODIFIED (#90): `Anmelden` ist gesperrt, solange beide Felder leer sind.
  expect((screen.getByRole('button', { name: 'Anmelden' }) as HTMLButtonElement).disabled).toBe(true)
})

test('Fehlgeschlagene Anmeldung wird angezeigt', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) },
    // Der Server meldet den Fehlschlag ohne `field` (`401`) — er betrifft beide Felder; die
    // Anwendung zeigt ihn als Formularfehler, nicht am einzelnen Feld.
    {
      pfad: '/api/auth/login',
      antwort: antwort(401, { error: FEHLERMELDUNG, message: FEHLERMELDUNG }),
    },
  ])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  const email = screen.getByLabelText('E-Mail')
  const passwort = screen.getByLabelText('Passwort')
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  fireEvent.change(passwort, { target: { value: GUELTIGES_PASSWORT } })

  const form = must(email.closest('form'), 'ein <form> um die Anmeldefelder') as HTMLElement
  await act(async () => {
    fireEvent.submit(form)
  })

  // MODIFIED (#90): Formularfehler (`role="alert"`, Klasse `form-error`), kein Feld markiert.
  await waitFor(() => {
    const alert = within(form).getByRole('alert')
    expect(alert.classList.contains('form-error')).toBe(true)
    expect(alert.textContent).toContain(FEHLERMELDUNG)
  })
  expect(email.hasAttribute('aria-invalid')).toBe(false)
  expect(passwort.hasAttribute('aria-invalid')).toBe(false)
  expect(emailFeld(container)).not.toBeNull()
})

test('Abgelehntes Feld zeigt den Fehler am Feld', async () => {
  const MELDUNG = 'Das ist keine gültige E-Mail-Adresse.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) },
    { pfad: '/api/auth/login', antwort: antwort(400, { message: MELDUNG, field: 'email' }) },
  ])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  const email = screen.getByLabelText('E-Mail')
  const passwort = screen.getByLabelText('Passwort')
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  fireEvent.change(passwort, { target: { value: GUELTIGES_PASSWORT } })
  const form = must(email.closest('form'), 'ein <form> um die Anmeldefelder') as HTMLElement

  await act(async () => {
    fireEvent.submit(form)
  })

  await waitFor(() => expect(email.getAttribute('aria-invalid')).toBe('true'))
  const fehler = must(feldFehlerVon(email), 'ein Feldfehler am E-Mail-Feld')
  expect(fehler.getAttribute('role')).toBe('alert')
  expect(fehler.textContent).toContain(MELDUNG)
  expect(passwort.hasAttribute('aria-invalid')).toBe(false)
  // Ein Fehler mit Feldbezug ist kein Formularfehler.
  expect(form.querySelector('.form-error')).toBeNull()
  expect(emailFeld(container)).not.toBeNull()
})

test('Anmelden bleibt gesperrt bei leerem Pflichtfeld', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) },
    { pfad: '/api/auth/login', antwort: antwort(401, { message: FEHLERMELDUNG }) },
  ])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  const email = screen.getByLabelText('E-Mail')
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  // Passwort bleibt leer.
  const button = screen.getByRole('button', { name: 'Anmelden' }) as HTMLButtonElement
  const form = must(email.closest('form'), 'ein <form> um die Anmeldefelder') as HTMLElement

  await act(async () => {
    fireEvent.click(button)
    fireEvent.submit(form)
  })

  expect(button.disabled).toBe(true)
  expect(fetchAngefragt('/api/auth/login')).toBe(false)
})

test('Anmelden zeigt den Ladezustand und die Rückversicherung', async () => {
  let loginAufloesen!: (res: Response) => void
  const loginPromise = new Promise<Response>((res) => {
    loginAufloesen = res
  })
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input)
    if (url.includes('/api/auth/login')) return loginPromise
    return antwort(401, { error: 'nicht angemeldet' })
  }) as unknown as typeof fetch

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  const email = screen.getByLabelText('E-Mail')
  const passwort = screen.getByLabelText('Passwort')
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  fireEvent.change(passwort, { target: { value: GUELTIGES_PASSWORT } })
  const form = must(email.closest('form'), 'ein <form> um die Anmeldefelder') as HTMLElement
  const button = within(form).getByRole('button', { name: 'Anmelden' }) as HTMLButtonElement

  jest.useFakeTimers()
  await act(async () => {
    fireEvent.submit(form)
  })

  // Nach dem Ausloesen: gesperrt und `aria-busy="true"`.
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-busy')).toBe('true')

  // Nach 4000 ms: der Rueckversicherungstext.
  act(() => {
    jest.advanceTimersByTime(4000)
  })
  expect(button.textContent).toBe(REASSURANCE_DE)

  // Nach der Antwort: wieder `Anmelden`, kein `aria-busy`, nicht gesperrt, Formularfehler.
  await act(async () => {
    loginAufloesen(antwort(401, { message: FEHLERMELDUNG }))
  })
  expect(button.textContent).toBe('Anmelden')
  expect(button.hasAttribute('aria-busy')).toBe(false)
  expect(button.disabled).toBe(false)
  const alert = within(form).getByRole('alert')
  expect(alert.classList.contains('form-error')).toBe(true)
  expect(alert.textContent).toContain(FEHLERMELDUNG)
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
    { pfad: '/api/sessions', antwort: antwort(200, []) },
  ])

  render(<App />)

  // MODIFIED (#92): `Abmelden` liegt im Kontomenue der Top-Bar. Erst die Menue-Schaltflaeche
  // mit dem Nutzernamen oeffnen, dann den Menueeintrag `Abmelden` waehlen.
  const konto = await screen.findByRole('button', { name: 'Gandalf' })
  await act(async () => {
    fireEvent.click(konto)
  })
  const abmelden = await screen.findByRole('menuitem', { name: 'Abmelden' })
  await act(async () => {
    fireEvent.click(abmelden)
  })

  // Der Fehlschlag wird sichtbar gemacht, statt lautlos zu verpuffen …
  await waitFor(() => expect(screen.getByText(/abmelden fehlgeschlagen/i)).toBeTruthy())
  // … und die Ansicht bleibt angemeldet: das Konto ist weiterhin als Menue-Schaltflaeche da
  // (constitution.md §9.1).
  const header = screen.getByRole('banner')
  expect(within(header).getByRole('button', { name: 'Gandalf' })).toBeTruthy()
})

// --- Registrierungsoberfläche (#45) ---------------------------------------------------------

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

  const nutzername = screen.getByLabelText('Nutzername')
  const email = screen.getByLabelText('E-Mail')
  const passwort = screen.getByLabelText('Passwort')
  fireEvent.change(nutzername, { target: { value: 'Gandalf' } })
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  fireEvent.change(passwort, { target: { value: GUELTIGES_PASSWORT } })
  const form = must(nutzername.closest('form'), 'ein <form> um die Registrierungsfelder') as HTMLElement

  await act(async () => {
    fireEvent.submit(form)
  })

  // MODIFIED (#90): der Fehler steht am Feld `Nutzername`, nicht als Formularfehler.
  await waitFor(() => expect(nutzername.getAttribute('aria-invalid')).toBe('true'))
  const fehler = must(feldFehlerVon(nutzername), 'ein Feldfehler am Nutzernamensfeld')
  expect(fehler.getAttribute('role')).toBe('alert')
  expect(fehler.textContent).toContain(ABLEHNUNG)
  expect(email.hasAttribute('aria-invalid')).toBe(false)
  expect(passwort.hasAttribute('aria-invalid')).toBe(false)
  expect(form.querySelector('.form-error')).toBeNull()
  // … und die Ansicht bleibt im Registrierungsformular (das Nutzernamensfeld ist weiter da).
  expect(nutzernameFeld(container)).not.toBeNull()
})

test('Registrieren bleibt gesperrt bei leerem Pflichtfeld', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) },
    { pfad: '/api/auth/register', antwort: antwort(201, {}) },
  ])

  const { container } = render(<App />)
  await waitFor(() => expect(emailFeld(container)).not.toBeNull())
  zurRegistrierung()
  await screen.findByText(/Registrierung/i)

  const nutzername = screen.getByLabelText('Nutzername')
  const email = screen.getByLabelText('E-Mail')
  fireEvent.change(nutzername, { target: { value: 'Gandalf' } })
  fireEvent.change(email, { target: { value: 'spieler@example.com' } })
  // `Passwort` bleibt leer.
  const button = screen.getByRole('button', { name: 'Registrieren' }) as HTMLButtonElement
  const form = must(nutzername.closest('form'), 'ein <form> um die Registrierungsfelder') as HTMLElement

  await act(async () => {
    fireEvent.click(button)
    fireEvent.submit(form)
  })

  expect(button.disabled).toBe(true)
  expect(fetchAngefragt('/api/auth/register')).toBe(false)
})

// --- Passwortänderung in der Oberfläche -----------------------------------------------------
// Requirement "Passwortänderung in der Oberfläche" aus
// openspec/changes/add-account-security/specs/user-auth/spec.md, MODIFIED zuletzt in
// openspec/changes/add-ui-menu/specs/user-auth/spec.md (#92): das Formular liegt in einem Modal
// `Passwort ändern`, das der Eintrag `Passwort ändern` des Kontomenues oeffnet; ein Erfolg
// schliesst das Modal und der Fokus kehrt zur Menue-Schaltflaeche des Kontos zurueck.

const ANGEMELDETER_NUTZER = { id: 'nutzer-1', email: 'spieler@example.com', username: 'Gandalf' }

/** Oeffnet das Passwort-Modal ueber das Kontomenue und liefert den Dialog. */
async function oeffnePasswortModal(): Promise<HTMLElement> {
  const konto = await screen.findByRole('button', { name: 'Gandalf' })
  await act(async () => {
    fireEvent.click(konto)
  })
  const eintrag = await screen.findByRole('menuitem', { name: 'Passwort ändern' })
  await act(async () => {
    fireEvent.click(eintrag)
  })
  return screen.getByRole('dialog', { name: 'Passwort ändern' })
}

test('Angemeldete Ansicht bietet die Passwortänderung an', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
  ])

  render(<App />)
  // Vor dem Oeffnen gibt es kein Feld `Bisheriges Passwort` im Dokument.
  await screen.findByRole('button', { name: 'Gandalf' })
  expect(screen.queryByLabelText('Bisheriges Passwort')).toBeNull()

  const dialog = await oeffnePasswortModal()
  const bisher = within(dialog).getByLabelText('Bisheriges Passwort')
  expect(within(dialog).getByLabelText('Neues Passwort')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Passwort ändern' })).toBeTruthy()
  // `Bisheriges Passwort` hat beim Oeffnen den Fokus.
  expect(document.activeElement).toBe(bisher)
})

test('Abgelehnte Passwortänderung wird angezeigt', async () => {
  const ABLEHNUNG = 'Das bisherige Passwort ist falsch.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
    {
      pfad: '/api/auth/password',
      antwort: antwort(403, { error: ABLEHNUNG, message: ABLEHNUNG, field: 'currentPassword' }),
    },
  ])

  render(<App />)
  const dialog = await oeffnePasswortModal()
  const bisher = within(dialog).getByLabelText('Bisheriges Passwort')
  const neu = within(dialog).getByLabelText('Neues Passwort')
  fireEvent.change(bisher, { target: { value: GUELTIGES_PASSWORT } })
  fireEvent.change(neu, { target: { value: 'mein-neues-sicheres-passwort' } })
  const form = must(bisher.closest('form'), 'ein <form> um die Passwortfelder') as HTMLElement

  await act(async () => {
    fireEvent.submit(form)
  })

  // Der Fehler steht am Feld `Bisheriges Passwort`, `Neues Passwort` traegt kein `aria-invalid`.
  await waitFor(() => expect(bisher.getAttribute('aria-invalid')).toBe('true'))
  const fehler = must(feldFehlerVon(bisher), 'ein Feldfehler am Feld „Bisheriges Passwort"')
  expect(fehler.getAttribute('role')).toBe('alert')
  expect(fehler.textContent).toContain(ABLEHNUNG)
  expect(neu.hasAttribute('aria-invalid')).toBe(false)
  // … der Toast-Host zeigt keinen Toast (kein Erfolgstoast bei einer Ablehnung) …
  const host = screen.queryByRole('status')
  expect(host === null || host.children.length === 0).toBe(true)
  // … und die Ansicht bleibt angemeldet (constitution.md §9.1).
  expect(screen.getByRole('button', { name: 'Gandalf' })).toBeTruthy()
})

test('Passwort ändern bleibt gesperrt bei zu kurzem neuen Passwort', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
    { pfad: '/api/auth/password', antwort: antwort(200, { ok: true }) },
  ])

  render(<App />)
  const dialog = await oeffnePasswortModal()
  const bisher = within(dialog).getByLabelText('Bisheriges Passwort')
  const neu = within(dialog).getByLabelText('Neues Passwort')
  fireEvent.change(bisher, { target: { value: GUELTIGES_PASSWORT } })
  fireEvent.change(neu, { target: { value: 'a'.repeat(14) } })
  const form = must(bisher.closest('form'), 'ein <form> um die Passwortfelder') as HTMLElement
  const aendern = within(form).getByRole('button', { name: 'Passwort ändern' }) as HTMLButtonElement

  await act(async () => {
    fireEvent.click(aendern)
    fireEvent.submit(form)
  })

  expect(aendern.disabled).toBe(true)
  expect(fetchAngefragt('/api/auth/password')).toBe(false)
})

test('Erfolgreiche Passwortänderung wird bestätigt', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, ANGEMELDETER_NUTZER) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
    { pfad: '/api/auth/password', antwort: antwort(200, { ok: true }) },
  ])

  render(<App />)
  const konto = await screen.findByRole('button', { name: 'Gandalf' })
  await act(async () => {
    fireEvent.click(konto)
  })
  const eintrag = await screen.findByRole('menuitem', { name: 'Passwort ändern' })
  await act(async () => {
    fireEvent.click(eintrag)
  })
  const dialog = screen.getByRole('dialog', { name: 'Passwort ändern' })
  const bisher = within(dialog).getByLabelText('Bisheriges Passwort')
  const neu = within(dialog).getByLabelText('Neues Passwort')
  fireEvent.change(bisher, { target: { value: GUELTIGES_PASSWORT } })
  fireEvent.change(neu, { target: { value: 'mein-neues-sicheres-passwort' } })
  const form = must(bisher.closest('form'), 'ein <form> um die Passwortfelder') as HTMLElement

  await act(async () => {
    fireEvent.submit(form)
  })

  // Der Erfolg erscheint als Toast `Passwort geändert.` im Toast-Host (`role="status"`).
  const host = await screen.findByRole('status')
  await waitFor(() => expect(within(host).getByText('Passwort geändert.')).toBeTruthy())
  // Das Modal schliesst, der Fokus kehrt zur Menue-Schaltflaeche des Kontos zurueck …
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Passwort ändern' })).toBeNull())
  expect(document.activeElement).toBe(konto)
  // … und die Ansicht bleibt angemeldet.
  expect(screen.getByRole('button', { name: 'Gandalf' })).toBeTruthy()
})
