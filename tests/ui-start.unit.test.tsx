/** @jest-environment jsdom */
// Komponententests zum Capability `ui-start` aus
// openspec/changes/add-start-view/specs/ui-start/spec.md (tasks.md 1.1). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname: zwei zu „Hero der
// Startansicht", sechs zu „Erstellen und Beitreten auf Anforderung", drei zu „Sitzungskarten",
// drei zu „Leerzustand", eins zum „Stylesheet der Startansicht".
//
// Geprueft wird, *was* die Startansicht rendert und anbietet — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Adressen ausschliesslich nach design.md D8:
// die einzige Ueberschrift der Ebene 1 als Titel, Formulare beim zugaenglichen Namen, die Liste
// `Meine Spielsitzungen` und ihre Eintraege per `within`, das Absenden `Beitreten` nur innerhalb
// des Formulars (im Hero gibt es eine zweite Schaltflaeche `Beitreten`), `document.activeElement`
// fuer den Fokus, `aria-expanded` per Attribut. `App` wird ohne Props gerendert; `fetch`, die
// Socket- und die Canvas-Fassade sind nach dem Muster der bestehenden Auth-/Sitzungs-/Shell-Tests
// gemockt. `POST /api/sessions` und `POST /api/sessions/join` werden ueber den Aufruf-Body des
// `fetch`-Mocks geprueft; „Antwort steht noch aus" ist ein von Hand aufzuloesendes Promise.
//
// Rote Phase: die Startansicht (`Hero`, Aufklapp-Formulare, benannte Sitzungsliste, Karten mit
// Zustandspille, Leerzustand) existiert noch nicht — es gibt keinen Text `Deine Runde`, keine
// Schaltflaeche `Sitzung leiten`, keine Liste mit Namen `Meine Spielsitzungen`, keinen
// Leerzustand und keine Start-Selektoren im Stylesheet. Jedes Szenario wird daher an seiner
// Assertion rot, nicht an einem Lade- oder Typfehler (constitution.md §3.1): der angemeldete
// Einstieg laedt wie bisher, erst die neue Adresse fehlt.

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

// --- Mock der PixiJS-Fassade (wie tests/ui-shell.unit.test.tsx) ------------------------------
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

// --- fetch-Mock (methodenbewusst, wie tests/auth-ui.unit.test.tsx) --------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-1', email: 'g@example.com', username: 'Gandalf' }

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

type Antwort = Response | Promise<Response> | (() => Response | Promise<Response>)
interface Route {
  pfad: string
  method?: string
  antwort: Antwort
}

// Der Pfad wird laengster zuerst geprueft, damit `/api/sessions/join` nicht von `/api/sessions`
// abgefangen wird; Treffer nur bei passender Methode (GET beim Laden der Liste, POST beim
// Erstellen/Beitreten).
function mockFetch(routes: Route[]): void {
  const sortiert = [...routes].sort((a, b) => b.pfad.length - a.pfad.length)
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const treffer = sortiert.find((route) => url.includes(route.pfad) && (route.method ?? 'GET').toUpperCase() === method)
    const a = must(treffer, `eine gemockte Antwort für ${method} ${url}`).antwort
    return typeof a === 'function' ? a() : a
  }) as unknown as typeof fetch
}

// Die Bodies der POST-Aufrufe an einen Pfad (exakt, ueber `endsWith` von `/api/sessions` und
// `/api/sessions/join` unterschieden), damit die gesendete Absicht geprueft werden kann (§9.1).
function postBodies(pfad: string): Array<Record<string, unknown>> {
  const mock = globalThis.fetch as unknown as jest.Mock
  return (mock.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>)
    .filter(([input, init]) => urlOf(input).endsWith(pfad) && (init?.method ?? 'GET').toUpperCase() === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
}

// Anker der angemeldeten Startansicht (design.md D8): die Schaltflaeche `Sitzung leiten`.
async function findeSitzungLeiten(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: 'Sitzung leiten' })
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

// --- Requirement: Hero der Startansicht -----------------------------------------------------

test('Anonyme Startansicht zeigt Hero und Anmeldekarte', async () => {
  mockFetch([{ pfad: '/api/auth/me', antwort: antwort(401, { message: 'nicht angemeldet' }) }])

  const { container } = render(<App />)
  // Anker: das Anmeldeformular ist erschienen (E-Mail-Eingabefeld).
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  const main = screen.getByRole('main')
  expect(within(main).getByText('Deine Runde')).toBeTruthy()
  // Genau eine Ueberschrift der Ebene 1, Titel `Karten, Tokens, Nebel`.
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Karten, Tokens, Nebel' })).toBeTruthy()
  expect(within(main).getByText('Leite deine Runde am virtuellen Tisch oder tritt einer bei.')).toBeTruthy()
  // Anmeldekarte: E-Mail- und Passwortfeld, Absenden `Anmelden`, Umschalter zur Registrierung.
  expect(container.querySelector('input[type="email"]')).not.toBeNull()
  expect(container.querySelector('input[type="password"]')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Anmelden' })).toBeTruthy()
  const umschalter = screen.getByRole('button', { name: 'Noch kein Konto? Registrieren' })

  // Nach dem Umschalten erscheint die Registrierung, die Ueberschrift der Ebene 1 bleibt gleich.
  await act(async () => {
    fireEvent.click(umschalter)
  })
  await screen.findByText(/Registrierung/i)
  expect(screen.getByRole('heading', { level: 1, name: 'Karten, Tokens, Nebel' })).toBeTruthy()
})

test('Angemeldete Startansicht zeigt Hero mit Aktionen', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(200, []) },
  ])

  render(<App />)
  const sitzungLeiten = await findeSitzungLeiten()

  const main = screen.getByRole('main')
  expect(within(main).getByText('Deine Runde')).toBeTruthy()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Meine Spielsitzungen' })).toBeTruthy()
  expect(within(main).getByText('Leite eine Sitzung oder tritt mit einem Code bei.')).toBeTruthy()
  // Drei Aktionen, die Aufklapp-Auslöser mit `aria-expanded="false"`.
  expect(sitzungLeiten.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('button', { name: 'Beitreten' }).getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('button', { name: 'Kartenbibliothek' })).toBeTruthy()
  // Ohne Auslösen ist kein Formular gerendert.
  expect(screen.queryByRole('form', { name: 'Neue Spielsitzung' })).toBeNull()
  expect(screen.queryByRole('form', { name: 'Spielsitzung beitreten' })).toBeNull()
})

// --- Requirement: Erstellen und Beitreten auf Anforderung -----------------------------------

test('Sitzung leiten öffnet das Erstellen-Formular', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(200, []) },
  ])

  render(<App />)
  const sitzungLeiten = await findeSitzungLeiten()
  await act(async () => {
    fireEvent.click(sitzungLeiten)
  })

  const formular = screen.getByRole('form', { name: 'Neue Spielsitzung' })
  const nameFeld = within(formular).getByLabelText('Name')
  expect(nameFeld).toBeTruthy()
  expect(within(formular).getByRole('button', { name: 'Erstellen' })).toBeTruthy()
  expect(within(formular).getByRole('button', { name: 'Abbrechen' })).toBeTruthy()
  expect(document.activeElement).toBe(nameFeld)
  expect(sitzungLeiten.getAttribute('aria-expanded')).toBe('true')
})

test('Beitreten öffnet das Beitreten-Formular und schließt das Erstellen-Formular', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(200, []) },
  ])

  render(<App />)
  const sitzungLeiten = await findeSitzungLeiten()
  // GIVEN: das Erstellen-Formular ist offen.
  await act(async () => {
    fireEvent.click(sitzungLeiten)
  })
  expect(screen.getByRole('form', { name: 'Neue Spielsitzung' })).toBeTruthy()

  // WHEN: die Hero-Schaltflaeche `Beitreten` wird ausgeloest (solange das Beitreten-Formular
  // geschlossen ist, gibt es nur diese eine Schaltflaeche `Beitreten`).
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Beitreten' }))
  })

  const formular = screen.getByRole('form', { name: 'Spielsitzung beitreten' })
  const codeFeld = within(formular).getByLabelText('Sitzungscode')
  expect(codeFeld).toBeTruthy()
  // Das Absenden `Beitreten` nur innerhalb des Formulars (im Hero gibt es die zweite).
  expect(within(formular).getByRole('button', { name: 'Beitreten' })).toBeTruthy()
  expect(within(formular).getByRole('button', { name: 'Abbrechen' })).toBeTruthy()
  expect(document.activeElement).toBe(codeFeld)
  // Das Erstellen-Formular ist geschlossen, `Sitzung leiten` wieder zugeklappt.
  expect(screen.queryByRole('form', { name: 'Neue Spielsitzung' })).toBeNull()
  expect(sitzungLeiten.getAttribute('aria-expanded')).toBe('false')
})

test('Abbrechen schließt das Formular', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(200, []) },
  ])

  render(<App />)
  const sitzungLeiten = await findeSitzungLeiten()
  await act(async () => {
    fireEvent.click(sitzungLeiten)
  })
  const formular = screen.getByRole('form', { name: 'Neue Spielsitzung' })

  await act(async () => {
    fireEvent.click(within(formular).getByRole('button', { name: 'Abbrechen' }))
  })

  expect(screen.queryByRole('form', { name: 'Neue Spielsitzung' })).toBeNull()
  expect(sitzungLeiten.getAttribute('aria-expanded')).toBe('false')
  // Keine Anfrage an `/api/sessions` ausser dem Laden der Liste (GET); kein POST.
  expect(postBodies('/api/sessions')).toEqual([])
})

test('Erstellte Spielsitzung schließt das Formular und erscheint als Karte', async () => {
  let liste: unknown[] = []
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions/join', method: 'POST', antwort: antwort(200, {}) },
    {
      pfad: '/api/sessions',
      method: 'POST',
      antwort: antwort(201, { id: 's9', name: 'Krypta', status: 'geschlossen', role: 'spielleiter' }),
    },
    { pfad: '/api/sessions', method: 'GET', antwort: () => antwort(200, liste) },
  ])

  render(<App />)
  const sitzungLeiten = await findeSitzungLeiten()
  await act(async () => {
    fireEvent.click(sitzungLeiten)
  })
  const formular = screen.getByRole('form', { name: 'Neue Spielsitzung' })
  fireEvent.change(within(formular).getByLabelText('Name'), { target: { value: 'Krypta' } })
  // Nach dem Erstellen liefert die Liste `Krypta` (der Server ist autoritativ, §9.1).
  liste = [{ id: 's9', name: 'Krypta', status: 'geschlossen', role: 'spielleiter' }]

  await act(async () => {
    fireEvent.submit(formular)
  })

  // Die Absicht wurde als `{ name: 'Krypta' }` gesendet.
  await waitFor(() => expect(postBodies('/api/sessions')).toEqual([{ name: 'Krypta' }]))
  // Das Formular ist geschlossen, die Liste enthaelt eine Karte `Krypta`.
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Neue Spielsitzung' })).toBeNull())
  const liste2 = screen.getByRole('list', { name: 'Meine Spielsitzungen' })
  expect(within(liste2).getByRole('heading', { level: 3, name: 'Krypta' })).toBeTruthy()
})

test('Abgelehntes Erstellen bleibt im Formular', async () => {
  const MELDUNG = 'Der Name ist bereits vergeben.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'POST', antwort: antwort(400, { message: MELDUNG }) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(200, []) },
  ])

  render(<App />)
  const sitzungLeiten = await findeSitzungLeiten()
  await act(async () => {
    fireEvent.click(sitzungLeiten)
  })
  const formular = screen.getByRole('form', { name: 'Neue Spielsitzung' })
  fireEvent.change(within(formular).getByLabelText('Name'), { target: { value: 'Krypta' } })

  await act(async () => {
    fireEvent.submit(formular)
  })

  // Das Formular bleibt offen und zeigt die Meldung des Servers als Fehlermeldung.
  const formularDanach = await screen.findByRole('form', { name: 'Neue Spielsitzung' })
  await waitFor(() => expect(within(formularDanach).getByRole('alert').textContent).toContain(MELDUNG))
})

test('Beitritt per Code schließt das Formular', async () => {
  let liste: unknown[] = []
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions/join',
      method: 'POST',
      antwort: antwort(200, { id: 's8', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }),
    },
    { pfad: '/api/sessions', method: 'GET', antwort: () => antwort(200, liste) },
  ])

  render(<App />)
  await findeSitzungLeiten()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Beitreten' }))
  })
  const formular = screen.getByRole('form', { name: 'Spielsitzung beitreten' })
  fireEvent.change(within(formular).getByLabelText('Sitzungscode'), { target: { value: 'ABC234' } })
  liste = [{ id: 's8', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]

  await act(async () => {
    fireEvent.click(within(formular).getByRole('button', { name: 'Beitreten' }))
  })

  // Die Absicht wurde als `{ code: 'ABC234' }` gesendet.
  await waitFor(() => expect(postBodies('/api/sessions/join')).toEqual([{ code: 'ABC234' }]))
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Spielsitzung beitreten' })).toBeNull())
  const liste2 = screen.getByRole('list', { name: 'Meine Spielsitzungen' })
  const karte = within(liste2).getByRole('heading', { level: 3, name: 'Freitagsrunde' }).closest('li') as HTMLElement
  expect(within(karte).getByText('Spieler')).toBeTruthy()
})

// --- Requirement: Sitzungskarten ------------------------------------------------------------

test('Karte zeigt Name, Zustand und Rolle', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      method: 'GET',
      antwort: antwort(200, [
        { id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spielleiter' },
        { id: 's2', name: 'Sonntagsrunde', status: 'geschlossen', role: 'spieler' },
      ]),
    },
  ])

  render(<App />)
  await findeSitzungLeiten()

  const liste = await screen.findByRole('list', { name: 'Meine Spielsitzungen' })
  const eintraege = within(liste).getAllByRole('listitem')
  expect(eintraege).toHaveLength(2)

  const [erster, zweiter] = eintraege
  expect(within(erster).getByRole('heading', { level: 3, name: 'Freitagsrunde' })).toBeTruthy()
  expect(within(erster).getByText('Läuft')).toBeTruthy()
  expect(within(erster).getByText('Spielleiter')).toBeTruthy()
  expect(within(erster).getByRole('button', { name: 'Betreten' })).toBeTruthy()

  expect(within(zweiter).getByRole('heading', { level: 3, name: 'Sonntagsrunde' })).toBeTruthy()
  expect(within(zweiter).getByText('Geschlossen')).toBeTruthy()
  expect(within(zweiter).getByText('Spieler')).toBeTruthy()
  expect(within(zweiter).getByRole('button', { name: 'Betreten' })).toBeTruthy()

  // Kein Eintrag zeigt den Rohwert des Servers (Gross-/Kleinschreibung unterscheidet die
  // Beschriftung `Spieler` vom Rohwert `spieler`).
  for (const eintrag of eintraege) {
    expect(eintrag.textContent).not.toMatch(/gestartet|geschlossen|spielleiter|spieler/)
  }
})

test('Zustandspille folgt der Zuordnungstabelle', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      method: 'GET',
      antwort: antwort(200, [
        { id: 'a', name: 'Alpha', status: 'gestartet', role: 'spielleiter' },
        { id: 'b', name: 'Beta', status: 'pausiert', role: 'spielleiter' },
        { id: 'c', name: 'Gamma', status: 'geoeffnet', role: 'spielleiter' },
        { id: 'd', name: 'Delta', status: 'geschlossen', role: 'spielleiter' },
      ]),
    },
  ])

  render(<App />)
  await findeSitzungLeiten()
  await screen.findByRole('list', { name: 'Meine Spielsitzungen' })

  const faelle: Array<{ text: string; modifier: string | null }> = [
    { text: 'Läuft', modifier: 'status-pill--active' },
    { text: 'Pausiert', modifier: 'status-pill--paused' },
    { text: 'Geöffnet', modifier: null },
    { text: 'Geschlossen', modifier: 'status-pill--ended' },
  ]

  for (const fall of faelle) {
    const pille = screen.getByText(fall.text).closest('.status-pill') as HTMLElement
    expect(pille).not.toBeNull()
    expect(pille.classList.contains('status-pill')).toBe(true)
    expect(pille.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
    if (fall.modifier) {
      expect(pille.classList.contains(fall.modifier)).toBe(true)
    } else {
      expect([...pille.classList].some((klasse) => klasse.startsWith('status-pill--'))).toBe(false)
    }
  }
})

test('Betreten öffnet den Raum der Karte', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      method: 'GET',
      antwort: antwort(200, [
        { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
        { id: 's2', name: 'Sonntagsrunde', status: 'geoeffnet', role: 'spieler' },
      ]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's2', name: 'Sonntagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await findeSitzungLeiten()
  const liste = await screen.findByRole('list', { name: 'Meine Spielsitzungen' })
  const karte = within(liste).getByRole('heading', { level: 3, name: 'Sonntagsrunde' }).closest('li') as HTMLElement

  await act(async () => {
    fireEvent.click(within(karte).getByRole('button', { name: 'Betreten' }))
  })

  // Die Anwendung sendet `session:enter` mit der `sessionId` `s2` …
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledWith('s2'))
  // … und die Raumansicht ist gerendert (Zustand der Sitzung).
  await screen.findByText(/Zustand:/i)
})

// --- Requirement: Leerzustand ---------------------------------------------------------------

test('Ohne Sitzungen erscheint der Leerzustand', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(200, []) },
  ])

  render(<App />)
  await findeSitzungLeiten()

  expect(await screen.findByText('Noch keine Sitzungen')).toBeTruthy()
  expect(screen.getByText('Erstelle eine Sitzung oder tritt mit einem Code bei.')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Meine Spielsitzungen' })).toBeNull()
})

test('Während des Ladens weder Liste noch Leerzustand', async () => {
  let aufloesen!: (response: Response) => void
  const ausstehend = new Promise<Response>((res) => {
    aufloesen = res
  })
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: ausstehend },
  ])

  render(<App />)
  // WHEN: die Anwendung ist gerendert und `Sitzung leiten` ist erschienen, die Liste steht aus.
  await findeSitzungLeiten()

  expect(screen.queryByText('Noch keine Sitzungen')).toBeNull()
  expect(screen.queryByRole('list', { name: 'Meine Spielsitzungen' })).toBeNull()

  // Sobald die Antwort mit einer leeren Liste eintrifft, erscheint der Leerzustand.
  await act(async () => {
    aufloesen(antwort(200, []))
  })
  expect(await screen.findByText('Noch keine Sitzungen')).toBeTruthy()
})

test('Fehlgeschlagenes Laden zeigt die Meldung statt des Leerzustands', async () => {
  const MELDUNG = 'Die Sitzungen konnten nicht geladen werden.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', method: 'GET', antwort: antwort(500, { message: MELDUNG }) },
  ])

  render(<App />)
  await findeSitzungLeiten()

  // Eine Fehlermeldung (role="alert") erscheint, aber weder Leerzustand noch Liste.
  await waitFor(() => expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0))
  expect(screen.queryByText('Noch keine Sitzungen')).toBeNull()
  expect(screen.queryByRole('list', { name: 'Meine Spielsitzungen' })).toBeNull()
})

// --- Requirement: Stylesheet der Startansicht -----------------------------------------------
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

const START_SELEKTOREN = [
  '.hero',
  '.hero-overline',
  '.hero-title',
  '.hero-subline',
  '.hero-actions',
  '.auth-panel',
  '.panel-actions',
  '.session-cards',
  '.session-card',
  '.session-card-name',
  '.session-card-meta',
  '.start-account',
]

test('Start-Selektoren vorhanden', () => {
  const norm = normalizeWs(stripComments(readText('src/client/app/theme.css')))
  const fehlend = START_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))

  expect(fehlend).toEqual([])
})
