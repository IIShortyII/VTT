/** @jest-environment jsdom */
// Komponententests zum Requirement "Tokenansicht im Raum" aus
// openspec/changes/add-session-tokens/specs/session-token/spec.md (tasks.md 1.2). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anfordert und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Mock-Grenzen (design.md D8), wie in
// session-map-ui.unit.test.tsx:
//  - die Socket-Fassade `src/client/session/socket.ts` mit aufzeichnenden
//    `createToken`/`moveToken`/`removeToken`, einem von aussen ausloesbaren `tokens`-Handler und
//    `enter`-Acknowledgement mit `map` und `tokens`,
//  - die Canvas-Fassade `src/client/map/canvas.ts` — ueber den *aufloesbaren* Modulschluessel mit
//    `.js`-Endung; `createMapCanvas` zeichnet `options` (inkl. `tokens`, `onTokenMove`) auf und
//    liefert ein Handle mit `setGrid`/`setImage`/`setTokens`/`destroy` als `jest.fn`; kein Test
//    importiert `pixi.js`,
//  - `fetch`, nach Pfad und Methode.
// Elemente ausschliesslich ueber getByRole/getByLabelText/getByText (D7-Schnittstellentabelle).
//
// Rote Phase (tasks.md 1.2): `SessionRoom` uebergibt der Canvas-Fassade weder `tokens` noch
// `onTokenMove`, kennt `setTokens` nicht, und die Token-Verwaltung (`TokenPanel`) fehlt. Die
// Szenarien scheitern daher am fehlenden Aufruf/Bedienelement — der erwartete rote Grund, kein
// Compile-/Setup-Fehler. Die beiden reinen Spieler-Verbote ("zieht nicht", "sieht keine
// Verwaltung") tragen zusaetzlich einen positiven Anker (der Tokenbestand erreicht die
// Canvas-Fassade, D6), damit sie vor der Umsetzung aus dem richtigen Grund rot sind statt trivial
// gruen — dieselbe Technik wie der "Keine Karte aktiv"-Anker in session-map-ui.unit.test.tsx.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade (design.md D8) -------------------------------------------------
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
    alias: jest.fn(),
    activateMap: jest.fn(),
    createToken: jest.fn(),
    moveToken: jest.fn(),
    removeToken: jest.fn(),
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
    alias: jest.Mock
    activateMap: jest.Mock
    createToken: jest.Mock
    moveToken: jest.Mock
    removeToken: jest.Mock
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- Mock der Canvas-Fassade (design.md D8) -------------------------------------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = { setGrid: jest.fn(), setImage: jest.fn(), setTokens: jest.fn(), destroy: jest.fn() }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

type CanvasMock = {
  createMapCanvas: jest.Mock
  __handle: { setGrid: jest.Mock; setImage: jest.Mock; setTokens: jest.Mock; destroy: jest.Mock }
}
const canvasMock = jest.requireMock('../src/client/map/canvas.js') as CanvasMock

/** Optionen, mit denen `createMapCanvas` zuletzt erzeugt wurde (2. Argument, design.md D6). */
function letzteCanvasOptions(): Record<string, unknown> {
  const calls = canvasMock.createMapCanvas.mock.calls
  if (calls.length === 0) throw new Error('createMapCanvas wurde nicht aufgerufen')
  return calls[calls.length - 1][1] as Record<string, unknown>
}

// --- fetch-Mock (nach Pfad und Methode, wie session-map-ui.unit.test.tsx) -------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }

type Call = { method: string; url: string; json?: Record<string, unknown> }
let calls: Call[] = []

type Route = { method: string; match: (url: string) => boolean; make: () => Response }

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

function installFetch(routes: Route[]): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    let json: Record<string, unknown> | undefined
    if (typeof init?.body === 'string') {
      try {
        json = JSON.parse(init.body) as Record<string, unknown>
      } catch {
        json = undefined
      }
    }
    calls.push({ method, url, json })
    const route = routes.find((r) => r.method === method && r.match(url))
    return must(route, `eine gemockte Antwort fuer ${method} ${url}`).make()
  }) as unknown as typeof fetch
}

// Reihenfolge: die spezifische Instanzroute vor der generischen Sitzungsliste.
function instanzRoute(sessionId: string, make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes(`/api/sessions/${sessionId}/maps`), make }
}
function eigeneKartenRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/maps') && !u.includes('/image'), make }
}
function basis(sessions: unknown[]): Route[] {
  return [
    { method: 'GET', match: (u) => u.includes('/api/auth/me'), make: () => antwort(200, NUTZER) },
    { method: 'GET', match: (u) => /\/api\/sessions(\?|$)/.test(u) || u.endsWith('/api/sessions'), make: () => antwort(200, sessions) },
  ]
}
/** Fetch-Aufbau fuer den Spielleiter (MapPanel laedt Instanzen und eigene Karten beim Betreten). */
function spielleiterFetch(): void {
  installFetch([
    instanzRoute('s1', () => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
}

// --- Token-Testdaten ------------------------------------------------------------------------

const GOBLIN = { id: 't-goblin', instanceId: 'i-tav', name: 'Goblin', color: '#3366ff', icon: '💀', size: 2, col: 3, row: 4 }
const ORK = { id: 't-ork', instanceId: 'i-tav', name: 'Ork', color: '#aa2222', icon: null, size: 1, col: 1, row: 1 }
const AKTIVE_KARTE = { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }

function enterAck(role: 'spieler' | 'spielleiter', extras: { map?: unknown; tokens?: unknown[] } = {}): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: [{ userId: 'u-selbst', username: 'ich', role, online: true }],
    map: 'map' in extras ? extras.map : null,
    tokens: extras.tokens ?? [],
  })
}

// --- Room betreten --------------------------------------------------------------------------

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  calls = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- Szenarien ------------------------------------------------------------------------------

test('Tokens erreichen die Kartenansicht', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN, ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: [GOBLIN, ORK] }))
})

test('Tokenbestand folgt dem Server', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    socketMock.__emit('tokens', { sessionId: 's1', tokens: [GOBLIN, ORK] })
  })

  await waitFor(() => expect(canvasMock.__handle.setTokens).toHaveBeenCalledWith([GOBLIN, ORK]))
})

test('Spielleiter zieht ein Token', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.moveToken.mockResolvedValue({ ok: true, token: { ...GOBLIN, col: 7, row: 1 } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const onTokenMove = letzteCanvasOptions().onTokenMove as ((id: string, cell: { col: number; row: number }) => void) | undefined
  expect(typeof onTokenMove).toBe('function')
  await act(async () => {
    must(onTokenMove, 'onTokenMove-Rueckruf')('t-goblin', { col: 7, row: 1 })
  })

  await waitFor(() => expect(socketMock.__facade.moveToken).toHaveBeenCalledWith('s1', 't-goblin', { col: 7, row: 1 }))
})

test('Spieler zieht nicht', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  // Positiver Anker: der Tokenbestand erreicht die Spielersicht (D6, rot vor der Umsetzung) ...
  expect(letzteCanvasOptions().tokens).toEqual([GOBLIN])
  // ... aber ohne Zieh-Rueckruf.
  expect(letzteCanvasOptions().onTokenMove).toBeUndefined()
})

test('Spielleiter legt ein Token über das Formular an', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })
  socketMock.__facade.createToken.mockResolvedValue({ ok: true, token: GOBLIN })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Goblin' } })
  fireEvent.change(screen.getByLabelText('Farbe'), { target: { value: '#3366ff' } })
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: '💀' } })
  fireEvent.change(screen.getByLabelText('Größe'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Spalte'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Zeile'), { target: { value: '4' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
  })

  await waitFor(() =>
    expect(socketMock.__facade.createToken).toHaveBeenCalledWith('s1', { name: 'Goblin', color: '#3366ff', icon: '💀', size: 2, col: 3, row: 4 }),
  )
})

test('Spielleiter entfernt ein Token über die Liste', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.removeToken.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Goblin entfernen' }))
  })

  await waitFor(() => expect(socketMock.__facade.removeToken).toHaveBeenCalledWith('s1', 't-goblin'))
})

test('Abgelehnte Aktion zeigt die Meldung', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: null, tokens: [] })
  socketMock.__facade.createToken.mockResolvedValue({ ok: false, message: 'Keine Karte aktiv.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Goblin' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
  })

  expect(await screen.findByText('Keine Karte aktiv.')).toBeTruthy()
})

test('Spieler sieht keine Token-Verwaltung', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  // Positiver Anker: der Tokenbestand erreicht auch die Spielersicht (D6, rot vor der Umsetzung) ...
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: [GOBLIN] }))
  // ... aber die Token-Verwaltung bleibt dem Spieler verborgen.
  expect(screen.queryByRole('heading', { name: 'Tokens' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Anlegen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Goblin entfernen' })).toBeNull()
})
