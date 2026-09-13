/** @jest-environment jsdom */
// Komponententests zum Delta "Tokenansicht im Raum" aus
// openspec/changes/add-token-assignment/specs/session-token/spec.md (tasks.md 1.2). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
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
//
// add-ui-form (#90, MODIFIED session-token): Das Formular `Tokens` folgt dem Formularmuster von
// `ui-form` OHNE Feldfehler (design.md D7): `Anlegen` ist gesperrt, solange
// `CreateTokenInputSchema` (ohne `sessionId`) den Zustand nicht akzeptiert oder das
// Acknowledgement aussteht, und traegt waehrenddessen `aria-busy="true"`; ein bestaetigendes
// Acknowledgement leert das Feld `Name`, ein ablehnendes laesst es stehen. „Spielleiter legt ein
// Token über das Formular an" und „Abgelehnte Aktion zeigt die Meldung" aendern ihre Erwartung
// (Namen bleiben); „Anlegen bleibt gesperrt ohne Namen" ist neu. Die Ablehnung bleibt
// Raum-Meldung, das Panel rendert keinen Formularfehler.
//
// Rote Phase (constitution.md §3.1): das Formular `Tokens` sperrt `Anlegen` noch nicht aus dem
// Schema, traegt kein `aria-busy`, wartet nicht auf das Acknowledgement und leert das Feld `Name`
// noch vor der Antwort. Die geaenderten/neuen Szenarien scheitern an ihrer Assertion, kein
// Setup-/Compile-Fehler.

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
    shareToken: jest.fn(),
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
    shareToken: jest.Mock
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

type ShareAudience = 'keine' | 'alle' | string[]
type Freigaben = { hp: ShareAudience; tempHp: ShareAudience; ac: ShareAudience; initiative: ShareAudience; conditions: ShareAudience }
const KEINE_SHARES: Freigaben = { hp: 'keine', tempHp: 'keine', ac: 'keine', initiative: 'keine', conditions: 'keine' }
const GOBLIN = {
  id: 't-goblin',
  instanceId: 'i-tav',
  name: 'Goblin',
  color: '#3366ff',
  icon: 'undead',
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
  shares: null as Freigaben | null,
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
  shares: null as Freigaben | null,
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
  expect(opts.tokens).toEqual([ORK])
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

// Timeout auf 15000 ms angehoben: Vollsuite unter Last, Gate #86
test('Spielleiter legt ein Token über das Formular an', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })
  // Ein zurueckgehaltenes Acknowledgement: erst nach `ackAufloesen` antwortet der Server —
  // dazwischen ist das Formular im Ladezustand (design.md D7).
  let ackAufloesen!: (ack: { ok: true; token: unknown }) => void
  socketMock.__facade.createToken.mockReturnValue(
    new Promise((res) => {
      ackAufloesen = res
    }),
  )

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Goblin' } })
  fireEvent.change(screen.getByLabelText('Farbe'), { target: { value: '#3366ff' } })
  const symbolGruppe = screen.getByRole('group', { name: 'Symbol' })
  const symbolNamen = ['Kein Symbol', 'Kämpfer', 'Wächter', 'Untoter', 'Drache', 'Magier', 'Schütze', 'Adel', 'Bestie', 'Ungeziefer', 'Feuer']
  for (const optionName of symbolNamen) {
    expect(within(symbolGruppe).getByRole('radio', { name: optionName })).toBeTruthy()
  }
  for (const optionName of symbolNamen.slice(1)) {
    const optionLabel = within(symbolGruppe).getByRole('radio', { name: optionName }).closest('label')
    expect(optionLabel?.querySelector('svg')).not.toBeNull()
  }
  fireEvent.click(within(symbolGruppe).getByRole('radio', { name: 'Untoter' }))
  fireEvent.change(screen.getByLabelText('Größe'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Spalte'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Zeile'), { target: { value: '4' } })

  const anlegen = screen.getByRole('button', { name: 'Anlegen' }) as HTMLButtonElement
  await act(async () => {
    fireEvent.click(anlegen)
  })

  await waitFor(() =>
    expect(socketMock.__facade.createToken).toHaveBeenCalledWith('s1', { name: 'Goblin', color: '#3366ff', icon: 'undead', size: 2, col: 3, row: 4 }),
  )
  // Solange das Acknowledgement aussteht: gesperrt, `aria-busy="true"`, `Name` bleibt stehen.
  expect(anlegen.disabled).toBe(true)
  expect(anlegen.getAttribute('aria-busy')).toBe('true')
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Goblin')

  // Nach dem bestaetigenden Acknowledgement ist das Feld `Name` leer.
  await act(async () => {
    ackAufloesen({ ok: true, token: GOBLIN })
  })
  await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(''))
}, 15000)

test('Spielleiter entfernt ein Token über die Liste', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.removeToken.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  // MODIFIED (#92): Entfernen über das Menü `Aktionen für Goblin` mit Bestätigungsdialog.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Entfernen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Token „Goblin" entfernen?' })
  // Vor der Bestätigung wurde kein removeToken gesendet.
  expect(socketMock.__facade.removeToken).not.toHaveBeenCalled()

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
  })

  await waitFor(() => expect(socketMock.__facade.removeToken).toHaveBeenCalledWith('s1', 't-goblin'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('Spielleiter weist ein Token über die Liste zu', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN], participants: TEILNEHMER })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true, token: { ...GOBLIN, ownerId: 'u-sam' } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  // MODIFIED (#92): Zuweisen über das Menü `Aktionen für Goblin` und das Modal `Goblin zuweisen`.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zuweisen…' }))
  })
  const dialog = screen.getByRole('dialog', { name: 'Goblin zuweisen' })
  const select = within(dialog).getByLabelText('Spieler') as HTMLSelectElement
  expect(within(select).getByRole('option', { name: 'Spielleiter' })).toBeTruthy()
  expect(within(select).getByRole('option', { name: 'Gandalf' })).toBeTruthy()
  expect(within(select).queryByRole('option', { name: 'meister' })).toBeNull()
  expect(within(select).queryByRole('option', { name: 'sam' })).toBeNull()

  await act(async () => {
    fireEvent.change(select, { target: { value: 'u-sam' } })
  })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zuweisen' }))
  })

  await waitFor(() => expect(socketMock.__facade.assignToken).toHaveBeenCalledWith('s1', 't-goblin', 'u-sam'))
  expect(screen.queryByRole('dialog', { name: 'Goblin zuweisen' })).toBeNull()
})

test('Spielleiter nimmt eine Zuweisung über die Liste zurück', async () => {
  const GOBLIN_SAM = { ...GOBLIN, ownerId: 'u-sam' }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_SAM], participants: TEILNEHMER })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_SAM, ownerId: null } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  // MODIFIED (#92): Zuweisung über das Menü und das Modal `Goblin zuweisen` zurücknehmen.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zuweisen…' }))
  })
  const dialog = screen.getByRole('dialog', { name: 'Goblin zuweisen' })
  const select = within(dialog).getByLabelText('Spieler') as HTMLSelectElement
  expect(select.value).toBe('u-sam')

  await act(async () => {
    fireEvent.change(select, { target: { value: '' } })
  })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zuweisen' }))
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
  // MODIFIED (#90): ein ablehnendes Acknowledgement laesst das Feld `Name` stehen.
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Goblin')
})

test('Anlegen bleibt gesperrt ohne Namen', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const anlegen = (await screen.findByRole('button', { name: 'Anlegen' })) as HTMLButtonElement
  const form = must(anlegen.closest('form'), 'das Formular „Tokens"') as HTMLElement
  await act(async () => {
    fireEvent.click(anlegen)
    fireEvent.submit(form)
  })

  expect(anlegen.disabled).toBe(true)
  expect(socketMock.__facade.createToken).not.toHaveBeenCalled()
})

// ============================================================================================
// Delta add-token-stats (#61): die 10 neuen Szenarien der Requirement "Tokenansicht im Raum".

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

  const markierungsListe = await screen.findByRole('list', { name: 'Goblin Markierungen' })
  const liegendEintrag = within(markierungsListe).getByText('Liegend').closest('li')
  expect(liegendEintrag?.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  const segenEintrag = within(markierungsListe).getByText('Segen').closest('li')
  expect(segenEintrag?.querySelector('svg[aria-hidden="true"]')).toBeNull()

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
  expect(screen.getByText('Ork')).toBeTruthy()
  expect(screen.queryByText(/^(HP|Temp|RK|Ini)/)).toBeNull()
})

test('Spieler sieht keine Token-Verwaltung', async () => {
  const FREMDER_ORK = { ...ORK, ownerId: null, shares: null }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [FREMDER_ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: [FREMDER_ORK] }))
  // Keine Verwaltungselemente (weder Überschrift noch Felder noch die alten Zeilen-Schaltflächen).
  expect(screen.queryByRole('heading', { name: 'Tokens' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Anlegen' })).toBeNull()
  expect(screen.queryByRole('spinbutton', { name: 'Ork HP' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork Werte speichern' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork Schaden' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Ork Markierung wählen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork Markierung hinzufügen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork entfernen' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Ork zuweisen' })).toBeNull()

  // MODIFIED (#92): das Menü `Aktionen für Ork` unter `Tokenwerte` zeigt alle vier Einträge gesperrt.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Ork' }))
  })
  const menu = screen.getByRole('menu', { name: 'Aktionen für Ork' })
  for (const eintrag of ['Bearbeiten', 'Zuweisen…', 'Freigeben…', 'Entfernen']) {
    expect(within(menu).getByRole('menuitem', { name: eintrag }).getAttribute('aria-disabled')).toBe('true')
  }
}, 15000)

// ============================================================================================
// Delta add-token-sharing (#62): die 9 Szenarien der Requirement "Tokenansicht im Raum".

const MEISTER = { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true }
const SAM = { userId: 'u-sam', username: 'sam', alias: 'Gandalf', role: 'spieler', online: true }
const TOM = { userId: 'u-tom', username: 'tom', role: 'spieler', online: true }
const SELBST_SPIELER = { userId: 'u-selbst', username: 'ich', alias: 'Gandalf', role: 'spieler', online: true }

function checkbox(name: string): HTMLInputElement {
  return screen.getByRole('checkbox', { name }) as HTMLInputElement
}

// add-ui-menu (#92): die Freigabe-Kästchen liegen jetzt im Modal `Freigaben für <Name>`, das
// der Eintrag `Freigeben…` des Token-Menüs öffnet.
async function oeffneFreigaben(tokenName = 'Goblin'): Promise<void> {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: `Aktionen für ${tokenName}` }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Freigeben…' }))
  })
  await screen.findByRole('dialog', { name: `Freigaben für ${tokenName}` })
}

test('Spielleiter teilt einen Wert mit allen über die Liste', async () => {
  const GOBLIN_TEILBAR = { ...GOBLIN, shares: KEINE_SHARES }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_TEILBAR], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_TEILBAR, shares: { ...KEINE_SHARES, hp: 'alle' } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin HP für alle' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'hp', 'alle'))
})

test('Spielleiter teilt einen Wert mit einem Spieler über die Liste', async () => {
  const GOBLIN_TEILBAR = { ...GOBLIN, shares: KEINE_SHARES }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_TEILBAR], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_TEILBAR, shares: { ...KEINE_SHARES, ac: ['u-sam'] } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin RK für Gandalf' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'ac', ['u-sam']))
  expect(screen.queryByRole('checkbox', { name: 'Goblin RK für meister' })).toBeNull()
})

test('Weiterer Empfänger wird an die Liste angehängt', async () => {
  const GOBLIN_AC_SAM = { ...GOBLIN, shares: { ...KEINE_SHARES, ac: ['u-sam'] } }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_AC_SAM], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_AC_SAM, shares: { ...KEINE_SHARES, ac: ['u-sam', 'u-tom'] } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin RK für tom' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'ac', ['u-sam', 'u-tom']))
})

test('Abwahl des letzten Empfängers sendet keine', async () => {
  const GOBLIN_AC_SAM = { ...GOBLIN, shares: { ...KEINE_SHARES, ac: ['u-sam'] } }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_AC_SAM], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_AC_SAM, shares: KEINE_SHARES } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  const box = screen.getByRole('checkbox', { name: 'Goblin RK für Gandalf' }) as HTMLInputElement
  expect(box.checked).toBe(true)
  await act(async () => {
    fireEvent.click(box)
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'ac', 'keine'))
})

test('Abwahl von alle sendet keine', async () => {
  const GOBLIN_HP_ALLE = { ...GOBLIN, shares: { ...KEINE_SHARES, hp: 'alle' } }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP_ALLE], participants: [MEISTER, SAM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_HP_ALLE, shares: KEINE_SHARES } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  const box = screen.getByRole('checkbox', { name: 'Goblin HP für alle' }) as HTMLInputElement
  expect(box.checked).toBe(true)
  await act(async () => {
    fireEvent.click(box)
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'hp', 'keine'))
})

test('Freigabe-Schalter folgen dem Bestand', async () => {
  const GOBLIN_MIX = {
    ...GOBLIN,
    shares: { hp: 'alle', tempHp: 'keine', ac: ['u-sam'], initiative: 'keine', conditions: 'keine' } as Freigaben,
  }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_MIX], participants: [MEISTER, SAM, TOM] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  expect(checkbox('Goblin HP für alle').checked).toBe(true)
  expect(checkbox('Goblin HP für Gandalf').disabled).toBe(true)
  expect(checkbox('Goblin HP für Gandalf').checked).toBe(false)
  expect(checkbox('Goblin RK für Gandalf').checked).toBe(true)
  expect(checkbox('Goblin RK für Gandalf').disabled).toBe(false)
  expect(checkbox('Goblin RK für tom').checked).toBe(false)
  expect(checkbox('Goblin RK für tom').disabled).toBe(false)
  expect(checkbox('Goblin Markierungen für alle').checked).toBe(false)
  expect(screen.getByRole('checkbox', { name: 'Goblin Temp-HP für alle' })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Goblin Initiative für alle' })).toBeTruthy()
})

test('Besitzer sieht Freigabe-Schalter nur am eigenen Token', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  const FREMDER_ORK = { ...ORK, ownerId: null, shares: null }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN, FREMDER_ORK], participants: [MEISTER, SELBST_SPIELER, TOM] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  // MODIFIED (#92): das Menü `Aktionen für Ork` zeigt `Freigeben…` gesperrt.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Ork' }))
  })
  const orkMenu = screen.getByRole('menu', { name: 'Aktionen für Ork' })
  expect(within(orkMenu).getByRole('menuitem', { name: 'Freigeben…' }).getAttribute('aria-disabled')).toBe('true')
  await act(async () => {
    fireEvent.keyDown(within(orkMenu).getByRole('menuitem', { name: 'Freigeben…' }), { key: 'Escape' })
  })

  // Im Menü `Aktionen für Goblin` ist `Freigeben…` nicht gesperrt und öffnet das Modal.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Aktionen für Goblin' }))
  })
  const goblinFreigeben = within(screen.getByRole('menu', { name: 'Aktionen für Goblin' })).getByRole('menuitem', { name: 'Freigeben…' })
  expect(goblinFreigeben.getAttribute('aria-disabled')).toBeNull()
  await act(async () => {
    fireEvent.click(goblinFreigeben)
  })
  await screen.findByRole('dialog', { name: 'Freigaben für Goblin' })

  expect(screen.getByRole('checkbox', { name: 'Goblin HP für alle' })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Goblin HP für tom' })).toBeTruthy()
  expect(screen.queryByRole('checkbox', { name: 'Goblin HP für Gandalf' })).toBeNull()
  expect(screen.queryByRole('checkbox', { name: 'Goblin HP für meister' })).toBeNull()
  expect(screen.queryAllByRole('checkbox', { name: /^Ork/ })).toHaveLength(0)
})

test('Besitzer teilt über die Liste', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN], participants: [SELBST_SPIELER, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...MEIN_GOBLIN, shares: { ...KEINE_SHARES, conditions: ['u-tom'] } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin Markierungen für tom' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'conditions', ['u-tom']))
})

test('Abgelehnte Freigabe zeigt die Meldung', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN], participants: [SELBST_SPIELER, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: false, message: 'Dieses Token darfst du nicht teilen.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin HP für alle' }))
  })

  expect(await screen.findByText('Dieses Token darfst du nicht teilen.')).toBeTruthy()
})

// ============================================================================================
// add-ui-menu (#92): neue Szenarien der Requirement „Tokenansicht im Raum" — Kontextmenü-Rückruf
// der Karte, Rechtsklick auf Karte und Zeile, Bearbeiten, abgebrochenes Entfernen, gesperrte
// Einträge für den Spieler.

test('Kartenansicht erhält den Kontextmenü-Rückruf', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  expect(typeof letzteCanvasOptions().onTokenContextMenu).toBe('function')
})

test('Rechtsklick auf ein Token der Karte öffnet das Token-Menü am Zeiger', async () => {
  const GOBLIN_TEILBAR = { ...GOBLIN, shares: KEINE_SHARES }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_TEILBAR] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const onTokenContextMenu = letzteCanvasOptions().onTokenContextMenu as
    | ((id: string, anchor: { x: number; y: number }) => void)
    | undefined
  expect(typeof onTokenContextMenu).toBe('function')
  await act(async () => {
    must(onTokenContextMenu, 'onTokenContextMenu-Rueckruf')('t-goblin', { x: 120, y: 80 })
  })

  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  expect(menu.style.left).toBe('120px')
  expect(menu.style.top).toBe('80px')
  const items = within(menu).getAllByRole('menuitem')
  expect(items.map((el) => el.textContent)).toEqual(['Bearbeiten', 'Zuweisen…', 'Freigeben…', 'Entfernen'])
  for (const item of items) {
    expect(item.getAttribute('aria-disabled')).toBeNull()
  }
  expect(within(menu).getByRole('menuitem', { name: 'Entfernen' }).classList.contains('menu-item--danger')).toBe(true)
  expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Bearbeiten' }))
}, 15000)

test('Rechtsklick auf die Token-Zeile öffnet das Menü', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const name = await screen.findByText('Goblin')
  const unterdrueckt = fireEvent.contextMenu(name, { clientX: 30, clientY: 40 })
  expect(unterdrueckt).toBe(false)

  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  expect(menu.style.left).toBe('30px')
  expect(menu.style.top).toBe('40px')
}, 15000)

test('Bearbeiten setzt den Fokus in das HP-Feld', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))
  })

  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Goblin HP' }))
}, 15000)

test('Abgebrochenes Entfernen sendet nichts', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.removeToken.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const trigger = await screen.findByRole('button', { name: 'Aktionen für Goblin' })
  await act(async () => {
    fireEvent.click(trigger)
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Entfernen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Token „Goblin" entfernen?' })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  })

  expect(socketMock.__facade.removeToken).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Aktionen für Goblin' }))
}, 15000)

test('Spieler sieht im Token-Menü nur Freigeben aktiv', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  expect(within(menu).getByRole('menuitem', { name: 'Bearbeiten' }).getAttribute('aria-disabled')).toBe('true')
  expect(within(menu).getByRole('menuitem', { name: 'Zuweisen…' }).getAttribute('aria-disabled')).toBe('true')
  expect(within(menu).getByRole('menuitem', { name: 'Entfernen' }).getAttribute('aria-disabled')).toBe('true')
  const freigeben = within(menu).getByRole('menuitem', { name: 'Freigeben…' })
  expect(freigeben.getAttribute('aria-disabled')).toBeNull()
  expect(document.activeElement).toBe(freigeben)
}, 15000)
