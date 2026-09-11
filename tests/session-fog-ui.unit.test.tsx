/** @jest-environment jsdom */
// Komponententests zum Requirement "Fog-Ansicht im Raum" aus
// openspec/changes/add-fog-of-war/specs/session-fog/spec.md (tasks.md 1.5). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname (16 Szenarien).
//
// Geprueft wird, *was* die Anwendung anbietet, anfordert und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). Drei Mock-Grenzen (design.md D8/D9):
//  - die Socket-Fassade `src/client/session/socket.ts` mit aufzeichnenden
//    `setFog`/`createFogArea`/`deleteFogArea` (Standard `{ ok: true }`) und einem von aussen
//    ausloesbaren `fog`-Handler; das `enter`-Acknowledgement traegt `map`, `tokens` und `fog`,
//  - die Canvas-Fassade `src/client/map/canvas.ts` — ueber den *aufloesbaren* Modulschluessel mit
//    `.js`-Endung; `createMapCanvas` zeichnet `options` (inkl. `imageUrl`, `fog`, `onCellsSelected`)
//    auf und liefert ein Handle mit `setGrid`/`setImage`/`setTokens`/`setFog`/`setTool`/
//    `setSelection`/`destroy`; kein Test importiert `pixi.js`,
//  - `fetch`, nach Pfad und Methode.
// Elemente ausschliesslich ueber getByRole/getByLabelText/getByText (D8-Schnittstellentabelle);
// keine `must()`-Helfer mit Kurzmeldung fuer Bedienelemente.
//
// Rote Phase (tasks.md 1.5): `SessionRoom` kennt weder die Fog-Ebene noch die Bild-URL ueber
// `/api/sessions/<id>/map-image` noch die Fog-Verwaltung (`FogPanel`), und die Fassaden-Methoden
// `setFog`/`createFogArea`/`deleteFogArea` werden nicht aufgerufen. Die Szenarien scheitern daher
// am fehlenden Bedienelement/Aufruf/an der falschen Bild-URL — der erwartete rote Grund, kein
// Compile-/Setup-Fehler.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

type Cell = { col: number; row: number }
function C(col: number, row: number): Cell {
  return { col, row }
}
function keysOf(cells: Cell[]): string[] {
  return cells.map((c) => `${c.col},${c.row}`).sort()
}

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
    assignToken: jest.fn(),
    shareToken: jest.fn(),
    setTokenStats: jest.fn(async () => ({ ok: true })),
    setTokenConditions: jest.fn(async () => ({ ok: true })),
    setFog: jest.fn(async () => ({ ok: true })),
    createFogArea: jest.fn(async () => ({ ok: true })),
    deleteFogArea: jest.fn(async () => ({ ok: true })),
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
    enter: jest.Mock
    activateMap: jest.Mock
    setFog: jest.Mock
    createFogArea: jest.Mock
    deleteFogArea: jest.Mock
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- Mock der Canvas-Fassade (design.md D8/D9) ----------------------------------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = {
    setGrid: jest.fn(),
    setImage: jest.fn(),
    setTokens: jest.fn(),
    setFog: jest.fn(),
    setTool: jest.fn(),
    setSelection: jest.fn(),
    destroy: jest.fn(),
  }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

type CanvasMock = {
  createMapCanvas: jest.Mock
  __handle: { setGrid: jest.Mock; setImage: jest.Mock; setTokens: jest.Mock; setFog: jest.Mock; setTool: jest.Mock; setSelection: jest.Mock; destroy: jest.Mock }
}
const canvasMock = jest.requireMock('../src/client/map/canvas.js') as CanvasMock

/** Optionen, mit denen `createMapCanvas` zuletzt erzeugt wurde (2. Argument, design.md D6). */
function letzteCanvasOptions(): Record<string, unknown> {
  const calls = canvasMock.createMapCanvas.mock.calls
  if (calls.length === 0) throw new Error('createMapCanvas wurde nicht aufgerufen')
  return calls[calls.length - 1][1] as Record<string, unknown>
}
function onCellsSelected(): (cells: Cell[]) => void {
  const fn = letzteCanvasOptions().onCellsSelected
  if (typeof fn !== 'function') throw new Error('onCellsSelected fehlt in den Canvas-Optionen')
  return fn as (cells: Cell[]) => void
}
function letzteSetSelection(): Cell[] {
  const calls = canvasMock.__handle.setSelection.mock.calls
  if (calls.length === 0) throw new Error('setSelection wurde nicht aufgerufen')
  return calls[calls.length - 1][0] as Cell[]
}

// --- fetch-Mock (nach Pfad und Methode) -----------------------------------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
const MAP = { instanceId: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT }

type Call = { method: string; url: string; json?: Record<string, unknown> }
let calls: Call[] = []
type Route = { method: string; match: (url: string) => boolean; make: () => Response }

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}
function antwort(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
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
function instanzRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/sessions/s1/maps'), make }
}
function eigeneKartenRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/maps') && !u.includes('/image'), make }
}
function basis(role: 'spieler' | 'spielleiter'): Route[] {
  return [
    { method: 'GET', match: (u) => u.includes('/api/auth/me'), make: () => antwort(200, NUTZER) },
    { method: 'GET', match: (u) => /\/api\/sessions(\?|$)/.test(u) || u.endsWith('/api/sessions'), make: () => antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) }]) },
  ]
}
/** Vollstaendiger fetch-Aufbau; fuer den Spielleiter mit den Listen, die das MapPanel abfragt. */
function fetchFuer(role: 'spieler' | 'spielleiter'): void {
  if (role === 'spieler') {
    installFetch(basis('spieler'))
    return
  }
  installFetch([
    instanzRoute(() => antwort(200, [{ id: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis('spielleiter'),
  ])
}

type Fog = { instanceId: string; version: number; revealed: Cell[]; areas: Array<{ id: string; name: string; cellCount: number; revealed: boolean }> | null }
function fogState(version: number, revealed: Cell[], areas: Fog['areas']): Fog {
  return { instanceId: 'i-tav', version, revealed, areas }
}
function enterAck(role: 'spieler' | 'spielleiter', extras: { map?: unknown; fog?: unknown }): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: [{ userId: 'u-selbst', username: 'ich', role, online: true }],
    map: 'map' in extras ? extras.map : null,
    tokens: [],
    fog: 'fog' in extras ? extras.fog : null,
  })
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
  calls = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- Bild-URL und Fog erreichen die Kartenansicht -------------------------------------------

test('Kartenansicht eines Spielers erhält maskiertes Bild und Fog', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP, fog: fogState(2, [C(0, 0)], null) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ imageUrl: '/api/sessions/s1/map-image?fog=2', fog: { revealed: [C(0, 0)], opaque: true } }),
  )
})

test('Kartenansicht des Spielleiters erhält das Originalbild', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(2, [C(0, 0)], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ imageUrl: '/api/sessions/s1/map-image', fog: { revealed: [C(0, 0)], opaque: false } }),
  )
})

test('Fog-Änderung folgt dem Server', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP, fog: fogState(2, [C(0, 0)], null) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    socketMock.__emit('fog', { sessionId: 's1', fog: fogState(3, [C(0, 0), C(1, 0)], null) })
  })

  await waitFor(() => expect(canvasMock.__handle.setFog).toHaveBeenCalledWith({ revealed: [C(0, 0), C(1, 0)], opaque: true }))
  expect(canvasMock.__handle.setImage).toHaveBeenCalledWith('/api/sessions/s1/map-image?fog=3')
})

// --- Sichtbarkeit der Fog-Verwaltung --------------------------------------------------------

test('Spieler sieht keine Fog-Verwaltung', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP, fog: fogState(0, [], null) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  expect(screen.queryByRole('radio', { name: 'Aufdecken' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Alles aufdecken' })).toBeNull()
  expect(screen.queryByLabelText('Bereichsname')).toBeNull()
})

test('Spielleiter sieht die Fog-Verwaltung', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], [{ id: 'a1', name: 'Raum 1', cellCount: 2, revealed: false }]) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  expect((await screen.findByRole('radio', { name: 'Schwenken' })) as HTMLInputElement).toHaveProperty('checked', true)
  expect((screen.getByRole('radio', { name: 'Aufdecken' }) as HTMLInputElement).checked).toBe(false)
  expect((screen.getByRole('radio', { name: 'Verdecken' }) as HTMLInputElement).checked).toBe(false)
  expect((screen.getByRole('radio', { name: 'Bereich markieren' }) as HTMLInputElement).checked).toBe(false)
  expect(screen.getByRole('button', { name: 'Alles aufdecken' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Alles verdecken' })).toBeTruthy()
  expect(screen.getByLabelText('Bereichsname')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Bereich speichern' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('Auswahl: 0 Zellen')).toBeTruthy()
  expect((screen.getByRole('checkbox', { name: 'Raum 1 aufgedeckt' }) as HTMLInputElement).checked).toBe(false)
  expect(screen.getByRole('button', { name: 'Raum 1 löschen' })).toBeTruthy()
})

test('Ohne aktive Karte keine Fog-Verwaltung', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: null, fog: null })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByText('Keine Karte aktiv')

  expect(screen.queryByRole('radio', { name: 'Aufdecken' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Alles aufdecken' })).toBeNull()
})

// --- Werkzeuge und Auswahl ------------------------------------------------------------------

test('Werkzeugwahl erreicht die Kartenansicht', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Aufdecken' }))
  })

  await waitFor(() => expect(canvasMock.__handle.setTool).toHaveBeenCalledWith('aufdecken'))
  expect((screen.getByRole('radio', { name: 'Aufdecken' }) as HTMLInputElement).checked).toBe(true)
})

test('Aufdecken sendet die Auswahl', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Aufdecken' }))
  })

  await act(async () => {
    onCellsSelected()([C(0, 0), C(1, 0)])
  })

  await waitFor(() => expect(socketMock.__facade.setFog).toHaveBeenCalledWith('s1', true, { kind: 'zellen', cells: [C(0, 0), C(1, 0)] }))
  // Der angezeigte Fog aendert sich erst mit `session:fog` (constitution.md §9.1): keine
  // Uebergabe eines geaenderten Fog (mit aufgedeckten Zellen) an die Kartenansicht.
  for (const call of canvasMock.__handle.setFog.mock.calls) {
    const fog = call[0] as { revealed: Cell[] } | null
    expect(fog === null || fog.revealed.length === 0).toBe(true)
  }
})

test('Verdecken sendet die Auswahl', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [C(0, 0)], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Verdecken' }))
  })

  await act(async () => {
    onCellsSelected()([C(0, 0)])
  })

  await waitFor(() => expect(socketMock.__facade.setFog).toHaveBeenCalledWith('s1', false, { kind: 'zellen', cells: [C(0, 0)] }))
})

test('Bereich markieren sammelt die Auswahl', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Bereich markieren' }))
  })

  await act(async () => {
    onCellsSelected()([C(0, 0), C(1, 0)])
  })
  await act(async () => {
    onCellsSelected()([C(1, 0), C(2, 0)])
  })

  expect(socketMock.__facade.setFog).not.toHaveBeenCalled()
  await waitFor(() => expect(keysOf(letzteSetSelection())).toEqual(keysOf([C(0, 0), C(1, 0), C(2, 0)])))
  expect(screen.getByText('Auswahl: 3 Zellen')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Bereich speichern' }) as HTMLButtonElement).disabled).toBe(false)
})

test('Bereich speichern sendet die Absicht und leert die Auswahl', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })
  socketMock.__facade.createFogArea.mockResolvedValue({ ok: true, fog: fogState(0, [], [{ id: 'a1', name: 'Raum 1', cellCount: 3, revealed: false }]) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Bereich markieren' }))
  })
  await act(async () => {
    onCellsSelected()([C(0, 0), C(1, 0), C(2, 0)])
  })

  fireEvent.change(screen.getByLabelText('Bereichsname'), { target: { value: 'Raum 1' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Bereich speichern' }))
  })

  await waitFor(() => expect(socketMock.__facade.createFogArea).toHaveBeenCalled())
  const [sessionId, name, cells] = socketMock.__facade.createFogArea.mock.calls[0] as [string, string, Cell[]]
  expect(sessionId).toBe('s1')
  expect(name).toBe('Raum 1')
  expect(keysOf(cells)).toEqual(keysOf([C(0, 0), C(1, 0), C(2, 0)]))
  await waitFor(() => expect(screen.getByText('Auswahl: 0 Zellen')).toBeTruthy())
  expect(letzteSetSelection()).toEqual([])
  expect((screen.getByRole('button', { name: 'Bereich speichern' }) as HTMLButtonElement).disabled).toBe(true)
})

test('Auswahl leeren', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await act(async () => {
    fireEvent.click(await screen.findByRole('radio', { name: 'Bereich markieren' }))
  })
  await act(async () => {
    onCellsSelected()([C(0, 0), C(1, 0)])
  })
  await waitFor(() => expect(screen.getByText('Auswahl: 2 Zellen')).toBeTruthy())

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl leeren' }))
  })

  await waitFor(() => expect(screen.getByText('Auswahl: 0 Zellen')).toBeTruthy())
  expect(letzteSetSelection()).toEqual([])
  expect(socketMock.__facade.setFog).not.toHaveBeenCalled()
  expect(socketMock.__facade.createFogArea).not.toHaveBeenCalled()
})

// --- Bereiche umschalten und loeschen -------------------------------------------------------

test('Bereich umschalten sendet die Absicht und folgt dem Server', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], [{ id: 'a1', name: 'Raum 1', cellCount: 2, revealed: false }]) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  const kaestchen = (await screen.findByRole('checkbox', { name: 'Raum 1 aufgedeckt' })) as HTMLInputElement
  expect(kaestchen.checked).toBe(false)

  await act(async () => {
    fireEvent.click(kaestchen)
  })

  await waitFor(() => expect(socketMock.__facade.setFog).toHaveBeenCalledWith('s1', true, { kind: 'bereich', areaId: 'a1' }))
  // Bis session:fog eintrifft, bleibt das Kaestchen nicht angekreuzt (constitution.md §9.1).
  expect((screen.getByRole('checkbox', { name: 'Raum 1 aufgedeckt' }) as HTMLInputElement).checked).toBe(false)

  await act(async () => {
    socketMock.__emit('fog', { sessionId: 's1', fog: fogState(0, [C(0, 0), C(1, 0)], [{ id: 'a1', name: 'Raum 1', cellCount: 2, revealed: true }]) })
  })

  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Raum 1 aufgedeckt' }) as HTMLInputElement).checked).toBe(true))
})

test('Bereich löschen sendet die Absicht', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], [{ id: 'a1', name: 'Raum 1', cellCount: 2, revealed: false }]) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Raum 1 löschen' }))
  })

  await waitFor(() => expect(socketMock.__facade.deleteFogArea).toHaveBeenCalledWith('s1', 'a1'))
  // Bis session:fog ohne Raum 1 eintrifft, bleibt der Bereich gelistet.
  expect(screen.getByRole('button', { name: 'Raum 1 löschen' })).toBeTruthy()

  await act(async () => {
    socketMock.__emit('fog', { sessionId: 's1', fog: fogState(0, [], []) })
  })

  await waitFor(() => expect(screen.queryByRole('button', { name: 'Raum 1 löschen' })).toBeNull())
})

// --- Alles aufdecken/verdecken und Meldung --------------------------------------------------

test('Alles aufdecken und Alles verdecken senden die Absicht', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Alles aufdecken' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Alles verdecken' }))
  })

  await waitFor(() => expect(socketMock.__facade.setFog).toHaveBeenCalledWith('s1', true, { kind: 'alle' }))
  expect(socketMock.__facade.setFog).toHaveBeenCalledWith('s1', false, { kind: 'alle' })
})

test('Abgelehnte Fog-Aktion zeigt die Meldung', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, fog: fogState(0, [], []) })
  socketMock.__facade.setFog.mockResolvedValue({ ok: false, message: 'Keine Karte aktiv.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Alles aufdecken' }))
  })

  expect(await screen.findByText('Keine Karte aktiv.')).toBeTruthy()
  // Der Kartenansicht wurde kein geaenderter Fog uebergeben.
  for (const call of canvasMock.__handle.setFog.mock.calls) {
    const fog = call[0] as { revealed: Cell[] } | null
    expect(fog === null || fog.revealed.length === 0).toBe(true)
  }
})
