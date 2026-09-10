/** @jest-environment jsdom */
// Komponententests zum Requirement "Sitzungsoberfläche" aus
// openspec/changes/add-game-session/specs/game-session/spec.md (tasks.md 1.3). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anbietet und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). `fetch` ist gemockt (`/api/auth/me` liefert
// einen Nutzer, `/api/sessions` die Liste). Die Socket-Fassade
// `src/client/session/socket.ts` ist per `jest.mock` ersetzt; Server-Ereignisse werden durch
// Aufruf der registrierten Handler ausgeloest (design.md D10/D11).

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade ----------------------------------------------------------------
// Die Fassade ist die Mock-Grenze (design.md D10). `createSessionSocket` liefert ein Objekt mit
// connect/disconnect/enter/transition/on; `on` merkt sich die Handler, `__emit` ruft sie auf.
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
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

import * as sessionSocketModule from '../src/client/session/socket.js'

type SocketTestApi = {
  __facade: {
    connect: jest.Mock
    disconnect: jest.Mock
    enter: jest.Mock
    transition: jest.Mock
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- fetch-Mock (wie tests/auth-ui.unit.test.tsx) -------------------------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com' }

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

// Eingabefelder werden ueber Bedeutung gesucht (name/id/aria-label/placeholder), nicht ueber
// eine bestimmte Beschriftung — wie in tests/auth-ui.unit.test.tsx.
function nameFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector(
    'input[name="name"], input#name, input[name="sessionName"], input[aria-label*="ame" i], input[placeholder*="ame" i]',
  )
}

function codeFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector(
    'input[name="code"], input#code, input[aria-label*="ode" i], input[placeholder*="ode" i]',
  )
}

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Runde', status: 'geoeffnet', role: 'spieler' },
    participants: [],
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
})

// --- Szenarien ------------------------------------------------------------------------------

test('Sitzungsliste mit Erstellen und Beitreten', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geschlossen', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])

  const { container } = render(<App />)

  await screen.findByText(/Freitagsrunde/)
  expect(screen.getAllByText(/spielleiter/i).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/geschlossen/i).length).toBeGreaterThan(0)
  expect(nameFeld(container)).not.toBeNull()
  expect(codeFeld(container)).not.toBeNull()
  expect(screen.getByRole('button', { name: /abmelden/i })).toBeTruthy()
})

test('Raumansicht des Spielleiters', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [
      { userId: 'u-a', email: 'anwesend@example.com', role: 'spieler', online: true },
      { userId: 'u-b', email: 'abwesend@example.com', role: 'spieler', online: false },
    ],
  })

  const { container } = render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await screen.findByText(/ABC234/)
  expect(screen.getAllByText(/geoeffnet|geöffnet/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/anwesend@example\.com/)).toBeTruthy()
  expect(screen.getByText(/abwesend@example\.com/)).toBeTruthy()
  // Anwesenheit muss unterscheidbar sein (Text, title oder aria-label — daher innerHTML).
  expect(container.innerHTML).toMatch(/online|anwesend/i)
  expect(container.innerHTML).toMatch(/offline|abwesend/i)
  // Erlaubte Uebergaenge in "geoeffnet": starten, beenden — nicht oeffnen/pausieren.
  expect(screen.getByRole('button', { name: /starten/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /beenden/i })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /öffnen|oeffnen/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /pausieren/i })).toBeNull()
})

test('Raumansicht des Spielers', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
    participants: [
      { userId: 'u-sl', email: 'leiter@example.com', role: 'spielleiter', online: true },
      { userId: 'u-selbst', email: 'ich@example.com', role: 'spieler', online: true },
    ],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()

  await waitFor(() => expect(screen.getAllByText(/gestartet/i).length).toBeGreaterThan(0))
  expect(screen.getByText(/leiter@example\.com/)).toBeTruthy()
  expect(screen.getByText(/ich@example\.com/)).toBeTruthy()
  // Kein Sitzungscode und keine Schaltflaeche fuer einen Zustandsuebergang.
  expect(screen.queryByText(/code/i)).toBeNull()
  expect(screen.queryByRole('button', { name: /starten|beenden|öffnen|oeffnen|pausieren/i })).toBeNull()
})

test('Zustand folgt dem Server', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', email: 'ich@example.com', role: 'spieler', online: true }],
  })

  const { container } = render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(container.innerHTML).toMatch(/geoeffnet|geöffnet/i))

  await act(async () => {
    socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
  })

  await waitFor(() => expect(container.innerHTML).toMatch(/gestartet/i))
  expect(container.innerHTML).not.toMatch(/geoeffnet|geöffnet/i)
})

test('Ersetzte Verbindung verbindet sich nicht neu', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', email: 'ich@example.com', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalled())

  const connectRufeVorher = socketMock.__facade.connect.mock.calls.length
  const enterRufeVorher = socketMock.__facade.enter.mock.calls.length

  await act(async () => {
    socketMock.__emit('replaced', { sessionId: 's1' })
    socketMock.__emit('disconnect', 'io server disconnect')
  })

  await waitFor(() => expect(screen.getByText(/an anderer stelle/i)).toBeTruthy())
  // Kein selbsttaetiger Wiederaufbau, kein erneutes Betreten (constitution.md §9.1, design.md D10).
  expect(socketMock.__facade.connect.mock.calls.length).toBe(connectRufeVorher)
  expect(socketMock.__facade.enter.mock.calls.length).toBe(enterRufeVorher)
})

test('Beendete Spielsitzung führt zur Liste zurück', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', email: 'ich@example.com', role: 'spieler', online: true }],
  })

  const { container } = render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalled())

  await act(async () => {
    socketMock.__emit('ended', { sessionId: 's1' })
  })

  // Zurueck zur Sitzungsliste (Formularfelder erscheinen wieder) samt Hinweis.
  await waitFor(() => expect(screen.getByText(/beendet/i)).toBeTruthy())
  expect(nameFeld(container)).not.toBeNull()
  expect(codeFeld(container)).not.toBeNull()
})
