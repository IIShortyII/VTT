/** @jest-environment jsdom */
// Komponententests zum Requirement "Kartenansicht im Raum" aus
// openspec/changes/add-session-map/specs/session-map/spec.md (tasks.md 1.3). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anbietet, anfordert und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). Drei Mock-Grenzen (design.md D8):
//  - die Socket-Fassade `src/client/session/socket.ts` (aufzeichnendes `activateMap`, ein von
//    aussen ausloesbarer `map`-Handler, `enter`-Acknowledgement mit `map`),
//  - die Canvas-Fassade `src/client/map/canvas.ts` — ueber den *aufloesbaren* Modulschluessel
//    mit `.js`-Endung, so wie `MapCanvas` sie importiert; kein Test importiert `pixi.js`,
//  - `fetch`, nach Pfad und Methode (`/api/auth/me`, `/api/sessions`,
//    `/api/sessions/<id>/maps`, `/api/maps`).
// Elemente ausschliesslich ueber getByRole/getByLabelText/getByText (D7-Schnittstellentabelle).
//
// Rote Phase (tasks.md 1.3): `SessionRoom` kennt weder Kartenansicht noch Hinweis noch
// Kartenverwaltung; `MapPanel` und die Fassaden-Methode `activateMap` fehlen. Die Szenarien
// scheitern daher am fehlenden Text/Bedienelement bzw. Verhalten — der erwartete rote Grund,
// kein Compile-/Setup-Fehler.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- Mock der Canvas-Fassade (design.md D8/D10) ---------------------------------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = { setGrid: jest.fn(), setImage: jest.fn(), destroy: jest.fn() }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

type CanvasMock = {
  createMapCanvas: jest.Mock
  __handle: { setGrid: jest.Mock; setImage: jest.Mock; destroy: jest.Mock }
}
const canvasMock = jest.requireMock('../src/client/map/canvas.js') as CanvasMock

// --- fetch-Mock (nach Pfad und Methode, wie tests/map-library-ui.unit.test.tsx) -------------

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

// --- Room betreten --------------------------------------------------------------------------

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

function gefragt(pfad: string, method = 'GET'): boolean {
  return calls.some((c) => c.method === method && c.url.includes(pfad))
}

function zaehle(pfad: string, method = 'GET'): number {
  return calls.filter((c) => c.method === method && c.url.includes(pfad)).length
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

test('Raum mit aktiver Karte zeigt die Kartenansicht', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: { instanceId: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT },
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ imageUrl: '/api/maps/m1/image', grid: QUADRAT }),
  )
  expect(screen.getByText('Aktive Karte: Taverne')).toBeTruthy()
})

test('Raum ohne aktive Karte zeigt einen Hinweis', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: null,
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  expect(await screen.findByText('Keine Karte aktiv')).toBeTruthy()
  expect(canvasMock.createMapCanvas).not.toHaveBeenCalled()
})

test('Kartenwechsel folgt dem Server', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: { instanceId: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT },
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  // Sicherstellen, dass die Fassade steht, bevor der Server den Wechsel meldet.
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const krypta = { type: 'hex-spitz', size: 60, offsetX: 0, offsetY: 0 }
  await act(async () => {
    socketMock.__emit('map', { sessionId: 's1', map: { instanceId: 'i-kry', mapId: 'm2', name: 'Krypta', hasImage: true, grid: krypta } })
  })

  await waitFor(() => expect(canvasMock.__handle.setImage).toHaveBeenCalledWith('/api/maps/m2/image'))
  expect(canvasMock.__handle.setGrid).toHaveBeenCalledWith(krypta)
  // Dieselbe Kartenansicht wird umgestellt, nicht neu erzeugt (design.md D7).
  expect(canvasMock.createMapCanvas).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Aktive Karte: Krypta')).toBeTruthy()
})

test('Zurücksetzen entfernt die Kartenansicht', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: { instanceId: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT },
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    socketMock.__emit('map', { sessionId: 's1', map: null })
  })

  await waitFor(() => expect(canvasMock.__handle.destroy).toHaveBeenCalledTimes(1))
  expect(screen.getByText('Keine Karte aktiv')).toBeTruthy()
})

test('Spieler sieht keine Kartenverwaltung', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: null,
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByText('Keine Karte aktiv')

  expect(screen.queryByRole('button', { name: /einhängen|einhaengen/i })).toBeNull()
  expect(gefragt('/api/sessions/s1/maps')).toBe(false)
  expect(calls.some((c) => c.method === 'GET' && c.url.includes('/api/maps') && !c.url.includes('/image'))).toBe(false)
})

test('Spielleiter sieht die Kartenverwaltung', async () => {
  installFetch([
    instanzRoute('s1', () => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() =>
      antwort(200, [
        { id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT },
        { id: 'm-wald', name: 'Wald', hasImage: false, grid: QUADRAT },
      ]),
    ),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: null,
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  // Taverne als eingehängte Karte mit Schaltflaechen (aria-label eindeutig je Instanz, D7).
  expect(await screen.findByRole('button', { name: 'Taverne aktivieren' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Taverne aushängen' })).toBeTruthy()
  // Auswahl zum Einhängen bietet Wald, aber nicht Taverne.
  const auswahl = screen.getByLabelText('Karte aus der Bibliothek')
  expect(within(auswahl).getByRole('option', { name: 'Wald' })).toBeTruthy()
  expect(within(auswahl).queryByRole('option', { name: 'Taverne' })).toBeNull()
  expect(screen.getByRole('button', { name: /einhängen|einhaengen/i })).toBeTruthy()
})

test('Einhängen sendet die Absicht und lädt die Liste neu', async () => {
  installFetch([
    instanzRoute('s1', () => antwort(200, [])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-wald', name: 'Wald', hasImage: false, grid: QUADRAT }])),
    { method: 'POST', match: (u) => u.includes('/api/sessions/s1/maps'), make: () => antwort(201, { id: 'i-wald', mapId: 'm-wald', name: 'Wald', hasImage: false, grid: QUADRAT, position: 1 }) },
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: null,
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const auswahl = (await screen.findByLabelText('Karte aus der Bibliothek')) as HTMLSelectElement
  await act(async () => {
    fireEvent.change(auswahl, { target: { value: 'm-wald' } })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /einhängen|einhaengen/i }))
  })

  const postCall = await waitFor(() => must(calls.find((c) => c.method === 'POST' && c.url.includes('/api/sessions/s1/maps')), 'den POST-Aufruf'))
  expect(postCall.json).toEqual({ mapId: 'm-wald' })
  await waitFor(() => expect(zaehle('/api/sessions/s1/maps')).toBeGreaterThanOrEqual(2))
})

test('Aktivieren sendet die Absicht und folgt dem Server', async () => {
  installFetch([
    instanzRoute('s1', () => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: null,
  })
  socketMock.__facade.activateMap.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Taverne aktivieren' }))
  })

  await waitFor(() => expect(socketMock.__facade.activateMap).toHaveBeenCalledWith('s1', 'i-tav'))
  // Bis das Server-Ereignis kommt, bleibt der Hinweis stehen (constitution.md §9.1).
  expect(screen.getByText('Keine Karte aktiv')).toBeTruthy()

  await act(async () => {
    socketMock.__emit('map', { sessionId: 's1', map: { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT } })
  })

  expect(await screen.findByText('Aktive Karte: Taverne')).toBeTruthy()
})

test('Aushängen sendet die Absicht und lädt die Liste neu', async () => {
  installFetch([
    instanzRoute('s1', () => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    { method: 'DELETE', match: (u) => u.includes('/api/sessions/s1/maps/i-tav'), make: () => antwort(204, {}) },
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: null,
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Taverne aushängen' }))
  })

  await waitFor(() => expect(gefragt('/api/sessions/s1/maps/i-tav', 'DELETE')).toBe(true))
  await waitFor(() => expect(zaehle('/api/sessions/s1/maps')).toBeGreaterThanOrEqual(2))
})

test('Zurücksetzen sendet die Absicht', async () => {
  installFetch([
    instanzRoute('s1', () => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT },
  })
  socketMock.__facade.activateMap.mockResolvedValue({ ok: true, map: null })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByText('Aktive Karte: Taverne')

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /keine karte anzeigen/i }))
  })

  await waitFor(() => expect(socketMock.__facade.activateMap).toHaveBeenCalledWith('s1', null))
  // Bis session:map mit null kommt, bleibt Taverne die aktive Karte (constitution.md §9.1).
  expect(screen.getByText('Aktive Karte: Taverne')).toBeTruthy()
})

test('Abgelehntes Aktivieren wird angezeigt', async () => {
  const ABLEHNUNG = 'Diese Karte kann nicht aktiviert werden.'
  installFetch([
    instanzRoute('s1', () => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: null,
  })
  socketMock.__facade.activateMap.mockResolvedValue({ ok: false, message: ABLEHNUNG })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Taverne aktivieren' }))
  })

  await waitFor(() => expect(screen.getAllByText(ABLEHNUNG).length).toBeGreaterThan(0))
  // Die aktive Karte bleibt unveraendert (weiterhin kein Hinweis auf eine aktive Karte).
  expect(screen.getByText('Keine Karte aktiv')).toBeTruthy()
})
