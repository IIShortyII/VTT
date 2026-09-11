/** @jest-environment jsdom */
// Komponententests zum Delta "Tokenansicht im Raum" aus
// openspec/changes/add-token-assignment/specs/session-token/spec.md (tasks.md 1.2). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname. Neu zu #15: die
// vier Szenarien "Spieler greift nur eigene Tokens", "Spieler sieht die abgelehnte Bewegung",
// "Spielleiter weist ein Token über die Liste zu" und "Spielleiter nimmt eine Zuweisung über die
// Liste zurück". Der bestehende Test "Spieler zieht nicht" aendert seine Aussage (Rueckruf
// vorhanden, `canMoveToken` verneint fuer das fremde Token), "Spieler sieht keine
// Token-Verwaltung" bekommt eine weitere Assertion (kein Auswahlfeld). Die uebrigen Szenarien
// aus #14 bleiben unveraendert.
//
// Geprueft wird, *was* die Anwendung anfordert und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Mock-Grenzen (design.md D8), wie in
// session-map-ui.unit.test.tsx:
//  - die Socket-Fassade `src/client/session/socket.ts` mit aufzeichnenden
//    `createToken`/`moveToken`/`removeToken`/`assignToken`, einem von aussen ausloesbaren
//    `tokens`-Handler und `enter`-Acknowledgement mit `map`, `tokens` und `participants`,
//  - die Canvas-Fassade `src/client/map/canvas.ts` — ueber den *aufloesbaren* Modulschluessel mit
//    `.js`-Endung; `createMapCanvas` zeichnet `options` (inkl. `tokens`, `onTokenMove`,
//    `canMoveToken`) auf und liefert ein Handle mit `setGrid`/`setImage`/`setTokens`/`destroy`
//    als `jest.fn`; kein Test importiert `pixi.js`,
//  - `fetch`, nach Pfad und Methode.
// Elemente ausschliesslich ueber getByRole/getByLabelText/getByText und within (D7-Tabelle);
// keine `must()`-Helfer mit Kurzmeldung in den neuen Tests — die DOM-Ausgabe der Testing Library
// ist das Gate-Feedback des implementers (design.md D8).
//
// Rote Phase (tasks.md 1.2): fuer einen Spieler uebergibt `SessionRoom` der Canvas-Fassade
// bislang weder `onTokenMove` noch `canMoveToken`; die Meldung einer abgelehnten Bewegung
// erscheint fuer den Spieler nirgends; die Token-Verwaltung kennt kein Auswahlfeld und
// `assignToken` fehlt. Die Szenarien scheitern daher am fehlenden Rueckruf/Bedienelement/an der
// fehlenden Meldung — der erwartete rote Grund, kein Compile-/Setup-Fehler.

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
    createToken: jest.fn(),
    moveToken: jest.fn(),
    removeToken: jest.fn(),
    assignToken: jest.fn(),
    setTokenStats: jest.fn(async () => ({ ok: true })),
    setTokenConditions: jest.fn(async () => ({ ok: true })),
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
    assignToken: jest.Mock
    setTokenStats: jest.Mock
    setTokenConditions: jest.Mock
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
// `ownerId` ist Teil der Tokendarstellung (spec.md "Drahtformat"). Standardwert `null`
// ("gehört dem Spielleiter"); wo ein Besitzer gebraucht wird, entsteht eine lokale Variante.

const GOBLIN = {
  id: 't-goblin',
  instanceId: 'i-tav',
  name: 'Goblin',
  color: '#3366ff',
  icon: '💀',
  size: 2,
  col: 3,
  row: 4,
  ownerId: null as string | null,
  hp: null as number | null,
  hpMax: null as number | null,
  tempHp: null as number | null,
  ac: null as number | null,
  initiative: null as number | null,
  conditions: [] as string[],
}
const ORK = {
  id: 't-ork',
  instanceId: 'i-tav',
  name: 'Ork',
  color: '#aa2222',
  icon: null,
  size: 1,
  col: 1,
  row: 1,
  ownerId: null as string | null,
  hp: null as number | null,
  hpMax: null as number | null,
  tempHp: null as number | null,
  ac: null as number | null,
  initiative: null as number | null,
  conditions: [] as string[],
}
const AKTIVE_KARTE = { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }

// Teilnehmer fuer die Zuweisungs-Szenarien (design.md D8): meister (Spielleiter, selbst) und
// sam (Spieler, userId u-sam, Alias Gandalf).
const TEILNEHMER = [
  { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true },
  { userId: 'u-sam', username: 'sam', alias: 'Gandalf', role: 'spieler', online: true },
]

function enterAck(role: 'spieler' | 'spielleiter', extras: { map?: unknown; tokens?: unknown[]; participants?: unknown[] } = {}): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: extras.participants ?? [{ userId: 'u-selbst', username: 'ich', role, online: true }],
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
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const opts = letzteCanvasOptions()
  // Positiver Anker: der Tokenbestand erreicht die Spielersicht (D6) ...
  expect(opts.tokens).toEqual([ORK])
  // ... mit Zieh-Rueckruf fuer jede Rolle (D6), aber einer Greifbarkeitsregel, die das fremde
  // Token verneint (ORK gehört dem Spielleiter, ownerId null).
  expect(typeof opts.onTokenMove).toBe('function')
  const canMoveToken = opts.canMoveToken as ((token: unknown) => boolean) | undefined
  expect(typeof canMoveToken).toBe('function')
  expect(must(canMoveToken, 'canMoveToken-Regel')(ORK)).toBe(false)
})

test('Spieler greift nur eigene Tokens', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst' }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN, ORK] })
  socketMock.__facade.moveToken.mockResolvedValue({ ok: true, token: { ...MEIN_GOBLIN, col: 7, row: 1 } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const opts = letzteCanvasOptions()
  const canMoveToken = opts.canMoveToken as ((token: unknown) => boolean) | undefined
  expect(typeof canMoveToken).toBe('function')
  expect(must(canMoveToken, 'canMoveToken-Regel')(MEIN_GOBLIN)).toBe(true)
  expect(must(canMoveToken, 'canMoveToken-Regel')(ORK)).toBe(false)

  const onTokenMove = opts.onTokenMove as ((id: string, cell: { col: number; row: number }) => void) | undefined
  expect(typeof onTokenMove).toBe('function')
  await act(async () => {
    must(onTokenMove, 'onTokenMove-Rueckruf')('t-goblin', { col: 7, row: 1 })
  })

  await waitFor(() => expect(socketMock.__facade.moveToken).toHaveBeenCalledWith('s1', 't-goblin', { col: 7, row: 1 }))
})

test('Spieler sieht die abgelehnte Bewegung', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.moveToken.mockResolvedValue({ ok: false, message: 'Dieses Token darfst du nicht bewegen.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const onTokenMove = letzteCanvasOptions().onTokenMove as ((id: string, cell: { col: number; row: number }) => void) | undefined
  await act(async () => {
    onTokenMove?.('t-goblin', { col: 7, row: 1 })
  })

  expect(await screen.findByText('Dieses Token darfst du nicht bewegen.')).toBeTruthy()
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

test('Spielleiter weist ein Token über die Liste zu', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN], participants: TEILNEHMER })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true, token: { ...GOBLIN, ownerId: 'u-sam' } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const select = (await screen.findByRole('combobox', { name: 'Goblin zuweisen' })) as HTMLSelectElement
  expect(within(select).getByRole('option', { name: 'Spielleiter' })).toBeTruthy()
  expect(within(select).getByRole('option', { name: 'Gandalf' })).toBeTruthy()
  expect(within(select).queryByRole('option', { name: 'meister' })).toBeNull()
  expect(within(select).queryByRole('option', { name: 'sam' })).toBeNull()

  await act(async () => {
    fireEvent.change(select, { target: { value: 'u-sam' } })
  })

  await waitFor(() => expect(socketMock.__facade.assignToken).toHaveBeenCalledWith('s1', 't-goblin', 'u-sam'))
})

test('Spielleiter nimmt eine Zuweisung über die Liste zurück', async () => {
  const GOBLIN_SAM = { ...GOBLIN, ownerId: 'u-sam' }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_SAM], participants: TEILNEHMER })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_SAM, ownerId: null } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const select = (await screen.findByRole('combobox', { name: 'Goblin zuweisen' })) as HTMLSelectElement
  expect(select.value).toBe('u-sam')

  await act(async () => {
    fireEvent.change(select, { target: { value: '' } })
  })

  await waitFor(() => expect(socketMock.__facade.assignToken).toHaveBeenCalledWith('s1', 't-goblin', null))
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

// ============================================================================================
// Delta add-token-stats (#61): die 10 neuen Szenarien der Requirement "Tokenansicht im Raum"
// (tasks.md 1.2). Ein Test je Szenario, Testname = Szenarioname. Elemente ausschliesslich ueber
// die Schnittstellentabelle design.md D9 (Rolle + zugaenglicher Name, genauer Text). Rote Phase:
// die Wertefelder, Schaltflaechen, das Auswahlfeld "Markierung wählen", die Ueberschrift
// "Tokenwerte" und die Fassadenmethoden `setTokenStats`/`setTokenConditions` fehlen — die
// Abfragen finden ihr Element nicht bzw. der erwartete Fassaden-Aufruf bleibt aus.

test('Spielleiter setzt Werte über die Liste', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin HP' }), { target: { value: '23' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Goblin HP-Maximum' }), { target: { value: '40' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Goblin RK' }), { target: { value: '16' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Werte speichern' }))
  })

  await waitFor(() =>
    expect(socketMock.__facade.setTokenStats).toHaveBeenCalledWith('s1', 't-goblin', {
      hp: 23,
      hpMax: 40,
      tempHp: null,
      ac: 16,
      initiative: null,
    }),
  )
})

test('Wertefelder folgen dem Bestand', async () => {
  const GOBLIN_VOLL = { ...GOBLIN, hp: 23, hpMax: 40, tempHp: 5, ac: 16, initiative: 12 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_VOLL] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  expect(((await screen.findByRole('spinbutton', { name: 'Goblin HP' })) as HTMLInputElement).value).toBe('23')
  expect((screen.getByRole('spinbutton', { name: 'Goblin HP-Maximum' }) as HTMLInputElement).value).toBe('40')
  expect((screen.getByRole('spinbutton', { name: 'Goblin Temp-HP' }) as HTMLInputElement).value).toBe('5')
  expect((screen.getByRole('spinbutton', { name: 'Goblin RK' }) as HTMLInputElement).value).toBe('16')
  expect((screen.getByRole('spinbutton', { name: 'Goblin Initiative' }) as HTMLInputElement).value).toBe('12')

  expect(screen.getByText('HP 23/40')).toBeTruthy()
  expect(screen.getByText('Temp 5')).toBeTruthy()
  expect(screen.getByText('RK 16')).toBeTruthy()
  expect(screen.getByText('Ini 12')).toBeTruthy()
})

test('Schaden über die Liste', async () => {
  const GOBLIN_HP = { ...GOBLIN, hp: 23, hpMax: 40 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin Änderung' }), { target: { value: '7' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Schaden' }))
  })

  await waitFor(() => expect(socketMock.__facade.setTokenStats).toHaveBeenCalledWith('s1', 't-goblin', { hp: 16 }))
})

test('Heilung deckelt am Maximum', async () => {
  const GOBLIN_HP = { ...GOBLIN, hp: 38, hpMax: 40 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin Änderung' }), { target: { value: '5' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Heilung' }))
  })

  await waitFor(() => expect(socketMock.__facade.setTokenStats).toHaveBeenCalledWith('s1', 't-goblin', { hp: 40 }))
})

test('Schaden ohne Trefferpunkte sendet nichts', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin Änderung' }), { target: { value: '7' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Schaden' }))
  })

  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(socketMock.__facade.setTokenStats).not.toHaveBeenCalled()
})

test('Spielleiter setzt eine Markierung über die Schnellwahl', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const select = (await screen.findByRole('combobox', { name: 'Goblin Markierung wählen' })) as HTMLSelectElement
  expect(within(select).getByRole('option', { name: 'Liegend' })).toBeTruthy()
  expect(within(select).getByRole('option', { name: 'Vergiftet' })).toBeTruthy()
  expect(within(select).getByRole('option', { name: 'Bewusstlos' })).toBeTruthy()

  await act(async () => {
    fireEvent.change(select, { target: { value: 'Liegend' } })
  })

  await waitFor(() => expect(socketMock.__facade.setTokenConditions).toHaveBeenCalledWith('s1', 't-goblin', ['Liegend']))
})

test('Spielleiter fügt eine freie Markierung hinzu', async () => {
  const GOBLIN_LIEGEND = { ...GOBLIN, conditions: ['Liegend'] }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_LIEGEND] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByRole('textbox', { name: 'Goblin Markierung' }), { target: { value: 'Segen' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Markierung hinzufügen' }))
  })

  await waitFor(() =>
    expect(socketMock.__facade.setTokenConditions).toHaveBeenCalledWith('s1', 't-goblin', ['Liegend', 'Segen']),
  )
})

test('Spielleiter entfernt eine Markierung', async () => {
  const GOBLIN_ZWEI = { ...GOBLIN, conditions: ['Liegend', 'Segen'] }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_ZWEI] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Goblin Markierung Liegend entfernen' }))
  })

  await waitFor(() => expect(socketMock.__facade.setTokenConditions).toHaveBeenCalledWith('s1', 't-goblin', ['Segen']))
})

test('Spieler sieht die Werte seines Tokens', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', hp: 23, hpMax: 40, tempHp: 5, ac: 16, initiative: 12, conditions: ['Liegend', 'Segen'] }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  expect(await screen.findByRole('heading', { name: 'Tokenwerte' })).toBeTruthy()
  expect(screen.getByText('HP 23/40')).toBeTruthy()
  expect(screen.getByText('Temp 5')).toBeTruthy()
  expect(screen.getByText('RK 16')).toBeTruthy()
  expect(screen.getByText('Ini 12')).toBeTruthy()
  expect(screen.getByText('Liegend')).toBeTruthy()
  expect(screen.getByText('Segen')).toBeTruthy()
})

test('Spieler sieht ohne Werte keine Werte', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  expect(await screen.findByRole('heading', { name: 'Tokenwerte' })).toBeTruthy()
  // Der Tokenname erscheint, aber kein Werte-Span (queryByText mit dem Werte-Praefix ist null).
  expect(screen.getByText('Ork')).toBeTruthy()
  expect(screen.queryByText(/^(HP|Temp|RK|Ini)/)).toBeNull()
})

test('Spieler sieht keine Token-Verwaltung', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  // Positiver Anker: der Tokenbestand erreicht auch die Spielersicht (D6) ...
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: [GOBLIN] }))
  // ... aber die Token-Verwaltung bleibt dem Spieler verborgen, samt Auswahlfeld.
  expect(screen.queryByRole('heading', { name: 'Tokens' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Anlegen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Goblin entfernen' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Goblin zuweisen' })).toBeNull()
  // Delta #61: auch die Werte- und Markierungsbedienung bleibt dem Spieler verborgen.
  expect(screen.queryByRole('spinbutton', { name: 'Goblin HP' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Goblin Werte speichern' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Goblin Schaden' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Goblin Markierung wählen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Goblin Markierung hinzufügen' })).toBeNull()
})
