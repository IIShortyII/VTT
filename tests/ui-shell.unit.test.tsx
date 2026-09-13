/** @jest-environment jsdom */
// Komponententests zum Capability `ui-shell` aus
// openspec/changes/add-app-shell/specs/ui-shell/spec.md (tasks.md 1.1) und dem MODIFIED-Delta
// openspec/changes/add-start-view/specs/ui-shell/spec.md (#86, tasks.md 1.2). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname: sechs zur
// „Top-Bar", zwei zu „Inhaltsbereich und Footer", eins zum „Stylesheet der Shell".
//
// Geprueft wird, *was* die Shell rendert und anbietet — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Adressen ausschliesslich ueber
// Testing-Library-Abfragen nach Rolle und Namen (design.md D6): Landmarks `banner`/`main`/
// `contentinfo`, Schaltflaechen `Zurück` / `Abmelden` / `Zur Bibliothek` beim Namen,
// `document.activeElement` fuer den Fokus. `App` wird ohne Props gerendert (die Build-Angaben
// fallen auf `0.0.0-dev`/`dev` zurueck); `fetch` und die Socket-/Canvas-Fassaden sind nach dem
// Muster der bestehenden Auth-/Sitzungs-/Bibliothekstests gemockt.
//
// add-start-view (#86, tasks.md 1.2): Die angemeldete Startansicht ist nun an der Schaltflaeche
// `Sitzung leiten` erkennbar (statt am Formular `Neue Spielsitzung`); das Chevron der
// Schaltflaeche `Zurück` ist ein dekoratives Icon (`<svg aria-hidden="true">`) statt des
// Textknotens `‹`.
//
// add-ui-text-keys (#87, MODIFIED ui-shell): Die Top-Bar zeigt in jeder Ansicht — auch anonym —
// den Sprachschalter aus `ui-text` (Gruppe `Sprache`). Die Raumansicht wird an der Ueberschrift
// der Ebene 1 (Sitzungsname) statt an `Zustand: …` erkannt, denn der Rohwert weicht der
// Zustandspille (design.md D8). Zwei Szenarien sind darauf umgestellt (Testnamen bleiben); die
// Suite importiert das i18n-Modul nicht — sie laeuft in der Standardsprache Deutsch.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// --- Mock der Socket-Fassade (wie tests/session-ui.unit.test.tsx) ---------------------------
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
    alias: jest.fn(),
    on: jest.fn((event: string, handler: (payload: unknown) => void) => {
      handlers[event] = handler
    }),
  }
  return {
    createSessionSocket: jest.fn(() => facade),
    __facade: facade,
    __handlers: handlers,
    __emit: (event: string, payload: unknown) => handlers[event]?.(payload),
  }
})

// --- Mock der PixiJS-Fassade (wie tests/map-library-ui.unit.test.tsx) -----------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = { setGrid: jest.fn(), setImage: jest.fn(), destroy: jest.fn() }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

import * as sessionSocketModule from '../src/client/session/socket.js'
import { App } from '../src/client/app/App.js'

type SocketTestApi = {
  __facade: {
    connect: jest.Mock
    disconnect: jest.Mock
    enter: jest.Mock
    transition: jest.Mock
    alias: jest.Mock
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- fetch-Mock (wie tests/auth-ui.unit.test.tsx) -------------------------------------------

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

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

function mockFetch(routes: Array<{ pfad: string; antwort: Response }>): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input)
    const treffer = routes.find((route) => url.includes(route.pfad))
    return must(treffer, `eine gemockte Antwort für ${url}`).antwort
  }) as unknown as typeof fetch
}

// Normalisiert Textknoten fuer den exakten Footer-Vergleich (mehrere Textknoten aus
// `Version {v} · Build {s}`).
function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

const MITTELPUNKT = '·'

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

async function oeffneBibliothek(): Promise<void> {
  const knopf = await screen.findByRole('button', { name: /kartenbibliothek/i })
  await act(async () => {
    fireEvent.click(knopf)
  })
  await screen.findByText(/neue karte/i)
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
})

// --- Requirement: Top-Bar -------------------------------------------------------------------

test('Startansicht ohne Zurück', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-1', email: 'g@example.com', username: 'Gandalf' }) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
  ])

  render(<App />)
  // Anker: die angemeldete Startansicht ist erschienen (Schaltflaeche `Sitzung leiten`, ui-start).
  await screen.findByRole('button', { name: 'Sitzung leiten' })

  const header = screen.getByRole('banner')
  expect(within(header).getByText('VTT')).toBeTruthy()
  expect(within(header).getByText('Gandalf')).toBeTruthy()
  expect(within(header).getByRole('button', { name: 'Abmelden' })).toBeTruthy()
  // In der Startansicht gibt es im Dokument keine Schaltflaeche `Zurück`.
  expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull()
})

test('Anonyme Ansicht zeigt nur die Marke', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) }])

  const { container } = render(<App />)
  // Anker: das Anmeldeformular ist erschienen (Eingabefeld fuer die E-Mail als Textbox).
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  const header = screen.getByRole('banner')
  expect(within(header).getByText('VTT')).toBeTruthy()
  // Auch anonym traegt die Top-Bar den Sprachschalter (Gruppe `Sprache`, ui-text #87).
  expect(within(header).getByRole('group', { name: 'Sprache' })).toBeTruthy()
  // Keine Kontozone: weder `Abmelden` noch `Zurück` im Dokument.
  expect(screen.queryByRole('button', { name: 'Abmelden' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull()
  // Das Anmeldeformular liegt im `<main>`.
  const main = screen.getByRole('main')
  expect(main.querySelector('input[type="email"]')).not.toBeNull()
})

test('Unteransicht zeigt Zurück als erstes fokussierbares Element', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
    { pfad: '/api/maps', antwort: antwort(200, []) },
  ])

  render(<App />)
  await oeffneBibliothek()

  // Genau eine Schaltflaeche `Zurück`, im `<header>`, erste Schaltflaeche in Dokumentreihenfolge.
  const zurueckAlle = screen.getAllByRole('button', { name: 'Zurück' })
  expect(zurueckAlle).toHaveLength(1)
  const zurueck = zurueckAlle[0]
  const header = screen.getByRole('banner')
  expect(within(header).getByRole('button', { name: 'Zurück' })).toBe(zurueck)
  expect(screen.getAllByRole('button')[0]).toBe(zurueck)
  // Sie hat beim Erscheinen den Fokus (autoFocus).
  expect(document.activeElement).toBe(zurueck)
  // Das Chevron ist ein dekoratives Icon (genau ein `<svg aria-hidden="true">`), kein Textknoten
  // `‹` (ui-start #86, design.md D6).
  expect(zurueck.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
  expect(zurueck.textContent ?? '').not.toContain('‹')
})

test('Zurück führt aus der Bibliothek zur Sitzungsliste', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
    { pfad: '/api/maps', antwort: antwort(200, []) },
  ])

  render(<App />)
  await oeffneBibliothek()

  const zurueck = screen.getByRole('button', { name: 'Zurück' })
  await act(async () => {
    fireEvent.click(zurueck)
  })

  // Die Sitzungsliste ist zurueck (Schaltflaeche `Sitzung leiten`, ui-start), die Bibliothek ist weg …
  await screen.findByRole('button', { name: 'Sitzung leiten' })
  expect(screen.queryByText(/neue karte/i)).toBeNull()
  // … und es gibt keine Schaltflaeche `Zurück` mehr.
  expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull()
})

test('Zurück führt aus dem Raum zur Sitzungsliste', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]) },
  ])

  render(<App />)
  await screen.findByText('Freitagsrunde')
  await betreten()
  // Anker: die Raumansicht ist gerendert (Ueberschrift der Ebene 1 `Freitagsrunde`, ui-text #87).
  await screen.findByRole('heading', { level: 1, name: 'Freitagsrunde' })

  const zurueck = screen.getByRole('button', { name: 'Zurück' })
  await act(async () => {
    fireEvent.click(zurueck)
  })

  // Die Sitzungsliste ist zurueck (Schaltflaeche `Sitzung leiten`); die Raumansicht ist nicht
  // mehr gerendert: keine Ueberschrift der Ebene 1 `Freitagsrunde`, die Karte der Liste ist eine
  // Ueberschrift der Ebene 3.
  await screen.findByRole('button', { name: 'Sitzung leiten' })
  expect(screen.queryByRole('heading', { level: 1, name: 'Freitagsrunde' })).toBeNull()
  expect(screen.getByRole('heading', { level: 3, name: 'Freitagsrunde' })).toBeTruthy()
})

test('Abmelden über die Top-Bar', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-1', email: 'g@example.com', username: 'Gandalf' }) },
    { pfad: '/api/sessions', antwort: antwort(200, []) },
    { pfad: '/api/auth/logout', antwort: antwort(200, { ok: true }) },
  ])

  const { container } = render(<App />)
  await screen.findByRole('button', { name: 'Sitzung leiten' })

  const header = screen.getByRole('banner')
  const abmelden = within(header).getByRole('button', { name: 'Abmelden' })
  await act(async () => {
    fireEvent.click(abmelden)
  })

  // Nach der Bestaetigung des Servers erscheint das Anmeldeformular …
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())
  // … und die Top-Bar zeigt weder den Nutzernamen noch die Schaltflaeche `Abmelden`.
  const headerDanach = screen.getByRole('banner')
  expect(within(headerDanach).queryByRole('button', { name: 'Abmelden' })).toBeNull()
  expect(within(headerDanach).queryByText('Gandalf')).toBeNull()
})

// --- Requirement: Inhaltsbereich und Footer -------------------------------------------------

test('Inhalt liegt im Hauptbereich', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geschlossen', role: 'spielleiter', code: 'ABC234' }]) },
  ])

  render(<App />)
  await screen.findByText('Freitagsrunde')

  // Genau ein `<main>`, mit der Klasse `app-shell`, das den Eintrag enthaelt.
  const mains = screen.getAllByRole('main')
  expect(mains).toHaveLength(1)
  const main = mains[0]
  expect(main.classList.contains('app-shell')).toBe(true)
  expect(within(main).getByText('Freitagsrunde')).toBeTruthy()

  // `<header>`, `<main>` und `<footer>` stehen in dieser Reihenfolge im Dokument.
  const header = screen.getByRole('banner')
  const footer = screen.getByRole('contentinfo')
  expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('Footer nennt Version und Build', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(401, { error: 'nicht angemeldet' }) }])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  const footer = screen.getByRole('contentinfo')
  expect(normalize(footer.textContent)).toBe(`Version 0.0.0-dev ${MITTELPUNKT} Build dev`)
})

// --- Requirement: Stylesheet der Shell ------------------------------------------------------
// Das Stylesheet wird als Text gelesen (Helfer wie in tests/ui-theme.unit.test.ts, dort nichts
// geaendert). Ein Selektor ist vorhanden, wenn die normalisierte CSS (`\s+` → ein Leerzeichen,
// Kommentare entfernt) die Zeichenfolge `<selektor> {` enthaelt (spec.md „Begriffe").

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

const SHELL_SELEKTOREN = [
  '.app-shell-topbar',
  '.app-shell-back',
  '.app-shell-brand',
  '.app-shell-account',
  'main.app-shell',
  '.app-shell-hinweis',
  '.app-shell-footer',
]

test('Shell-Selektoren vorhanden', () => {
  const norm = normalizeWs(stripComments(readText('src/client/app/theme.css')))
  const fehlend = SHELL_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))

  expect(fehlend).toEqual([])
})
