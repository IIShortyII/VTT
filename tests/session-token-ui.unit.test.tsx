/** @jest-environment jsdom */
// Komponententests zum Delta "Tokenansicht im Raum" aus
// openspec/changes/add-token-cards/specs/session-token/spec.md. Ein Test je GIVEN/WHEN/THEN-
// Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anfordert und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Mock-Grenzen (design.md D8), wie in
// session-map-ui.unit.test.tsx:
//  - die Socket-Fassade `src/client/session/socket.ts` mit aufzeichnenden
//    `createToken`/`moveToken`/`removeToken`/`assignToken`/`shareToken`/`setTokenStats`/
//    `setTokenConditions`, einem von aussen ausloesbaren `tokens`-Handler und `enter`-
//    Acknowledgement mit `map`, `tokens` und `participants`,
//  - die Canvas-Fassade `src/client/map/canvas.ts` — ueber den *aufloesbaren* Modulschluessel mit
//    `.js`-Endung; `createMapCanvas` zeichnet `options` (inkl. `tokens`, `onTokenMove`,
//    `canMoveToken`, `onTokenContextMenu`) auf und liefert ein Handle mit
//    `setGrid`/`setImage`/`setTokens`/`centerOn`/`destroy` als `jest.fn`; kein Test importiert
//    `pixi.js`,
//  - `fetch`, nach Pfad und Methode.
//
// add-token-cards (#95, MODIFIED "Tokenansicht im Raum"): jede Token-Zeile wird eine Karte
// (`article.token-card`) mit Kopf (Symbol, Name `token-card__name`, Zuweisungs-Pill `chip`,
// ⋮-Trigger), HP-Balken (`token-card__hp-bar`, `--pct`, Low-Klasse `--low` bei <=25 %),
// `dl`-Wertezeilen und Condition-Chips (`token-card__conditions > .chip`). Anlegen laeuft ueber
// den Kopf-Knopf `Token anlegen` -> Modal `Token anlegen`; die vollstaendige Werte-/Conditions-
// Bearbeitung ueber den Menueeintrag `Bearbeiten` -> Modal `<Name> bearbeiten`; Schaden/Heilung
// bleibt inline auf der Karte. Das ⋮-Menue erhaelt `Auf Karte zentrieren` (Icon `locate`, fuer
// jede Rolle aktiv) vor `Entfernen`; die Raumansicht ruft dabei `centerOn` der Canvas-Fassade
// mit der Zelle `{ col, row }` auf (design.md D6/D7).
//
// Rote Phase (constitution.md §3.1): die Anwendung rendert noch die Zeilenansicht mit stets
// offenem Anlege-Formular, ohne `Token anlegen`-Knopf, ohne Anlege-/Bearbeiten-Modal, ohne
// Karten-Klassen/HP-Balken/Chips/`dl`-Paare und ohne `centerOn`. Die geaenderten/neuen
// Szenarien scheitern an ihrer Assertion bzw. am fehlenden Element, kein Setup-/Compile-Fehler.

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
  const handle = { setGrid: jest.fn(), setImage: jest.fn(), setTokens: jest.fn(), centerOn: jest.fn(), destroy: jest.fn() }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

type CanvasMock = {
  createMapCanvas: jest.Mock
  __handle: { setGrid: jest.Mock; setImage: jest.Mock; setTokens: jest.Mock; centerOn: jest.Mock; destroy: jest.Mock }
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

// MODIFIED (#94): Aktiviert einen Bereichs-Reiter der Raumansicht (session-tabs,
// Testaufbau-Konvention). Inhalte ausserhalb des Reiters `Karte` liegen in versteckten
// Reiterpanels und werden erst nach dem Klick von den Standardabfragen gefunden.
async function aktiviereReiter(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name }))
  })
}

// MODIFIED (#95): Die Token-Karte (`article.token-card`, Rolle `listitem`), aufgeloest ueber
// ihren Namen (Klasse `token-card__name`).
function tokenKarte(name: string): HTMLElement {
  const karte = screen
    .getAllByText(name)
    .map((el) => el.closest('.token-card'))
    .find((el): el is HTMLElement => el !== null)
  return must(karte, `Karte für ${name}`)
}

// Liest die `dl`-Wertezeilen einer Karte als geordnete [dt, dd]-Paare (spec.md, design.md D3).
function dlPaare(karte: HTMLElement): Array<[string, string]> {
  const dl = karte.querySelector('dl')
  if (!dl) return []
  const kinder = Array.from(dl.children)
  const paare: Array<[string, string]> = []
  for (let i = 0; i < kinder.length - 1; i += 1) {
    if (kinder[i].tagName === 'DT' && kinder[i + 1].tagName === 'DD') {
      paare.push([kinder[i].textContent?.trim() ?? '', kinder[i + 1].textContent?.trim() ?? ''])
    }
  }
  return paare
}

// MODIFIED (#95): Anlegen ueber den Kopf-Knopf `Token anlegen` -> Modal `Token anlegen` (D1).
async function oeffneAnlegen(): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Token anlegen' }))
  })
  return screen.getByRole('dialog', { name: 'Token anlegen' })
}

// MODIFIED (#95): Vollstaendige Werte-/Conditions-Bearbeitung ueber `Bearbeiten` -> Modal
// `<Name> bearbeiten` (D1).
async function oeffneBearbeiten(name = 'Goblin'): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: `Aktionen für ${name}` }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))
  })
  return screen.getByRole('dialog', { name: `${name} bearbeiten` })
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  calls = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- Szenarien: Kartenansicht & Bewegung ----------------------------------------------------

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

// --- Szenarien: Anlege-Modal ----------------------------------------------------------------

test('Spielleiter legt ein Token über das Formular an', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })
  // Ein zurueckgehaltenes Acknowledgement: erst nach `ackAufloesen` antwortet der Server —
  // dazwischen ist die Schaltfläche im Ladezustand (design.md D7).
  let ackAufloesen!: (ack: { ok: true; token: unknown }) => void
  socketMock.__facade.createToken.mockReturnValue(
    new Promise((res) => {
      ackAufloesen = res
    }),
  )

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneAnlegen()
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Goblin' } })
  fireEvent.change(within(dialog).getByLabelText('Farbe'), { target: { value: '#3366ff' } })
  const symbolGruppe = within(dialog).getByRole('group', { name: 'Symbol' })
  fireEvent.click(within(symbolGruppe).getByRole('radio', { name: 'Untoter' }))
  fireEvent.change(within(dialog).getByLabelText('Größe'), { target: { value: '2' } })
  fireEvent.change(within(dialog).getByLabelText('Spalte'), { target: { value: '3' } })
  fireEvent.change(within(dialog).getByLabelText('Zeile'), { target: { value: '4' } })

  const anlegen = within(dialog).getByRole('button', { name: 'Anlegen' }) as HTMLButtonElement
  await act(async () => {
    fireEvent.click(anlegen)
  })

  await waitFor(() =>
    expect(socketMock.__facade.createToken).toHaveBeenCalledWith('s1', { name: 'Goblin', color: '#3366ff', icon: 'undead', size: 2, col: 3, row: 4 }),
  )
  // Solange das Acknowledgement aussteht: gesperrt, `aria-busy="true"`.
  expect(anlegen.disabled).toBe(true)
  expect(anlegen.getAttribute('aria-busy')).toBe('true')

  // Nach dem bestaetigenden Acknowledgement ist das Modal `Token anlegen` geschlossen.
  await act(async () => {
    ackAufloesen({ ok: true, token: GOBLIN })
  })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Token anlegen' })).toBeNull())
}, 15000)

test('Abgelehnte Aktion zeigt die Meldung', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: null, tokens: [] })
  socketMock.__facade.createToken.mockResolvedValue({ ok: false, message: 'Keine Karte aktiv.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneAnlegen()
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Goblin' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }))
  })

  expect(await screen.findByText('Keine Karte aktiv.')).toBeTruthy()
  // Das Modal `Token anlegen` bleibt offen, und das Feld `Name` traegt weiterhin den Namen.
  expect(screen.getByRole('dialog', { name: 'Token anlegen' })).toBeTruthy()
  expect((within(screen.getByRole('dialog', { name: 'Token anlegen' })).getByLabelText('Name') as HTMLInputElement).value).toBe('Goblin')
}, 15000)

test('Anlegen bleibt gesperrt ohne Namen', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneAnlegen()
  const anlegen = within(dialog).getByRole('button', { name: 'Anlegen' }) as HTMLButtonElement
  const form = must(anlegen.closest('form'), 'das Formular „Token anlegen"') as HTMLElement
  await act(async () => {
    fireEvent.click(anlegen)
    fireEvent.submit(form)
  })

  expect(anlegen.disabled).toBe(true)
  expect(socketMock.__facade.createToken).not.toHaveBeenCalled()
}, 15000)

// --- Szenarien: Kartendarstellung (Pill, HP-Balken, Chips) ----------------------------------

test('Karte zeigt die Zuweisung als Pill', async () => {
  const GOBLIN_SAM = { ...GOBLIN, ownerId: 'u-sam' }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_SAM, ORK], participants: TEILNEHMER })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const goblinKarte = tokenKarte('Goblin')
  const gandalfPill = within(goblinKarte).getByText('Gandalf')
  expect(gandalfPill.closest('.chip')).not.toBeNull()

  const orkKarte = tokenKarte('Ork')
  const orkPill = within(orkKarte).getByText('Unzugewiesen')
  expect(orkPill.closest('.chip')).not.toBeNull()
}, 15000)

test('Karte zeigt den HP-Balken mit Anteil und Low-Klasse', async () => {
  const GOBLIN_HP = { ...GOBLIN, hp: 10, hpMax: 40 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const karte = tokenKarte('Goblin')
  const balken = karte.querySelectorAll('.token-card__hp-bar')
  expect(balken).toHaveLength(1)
  const bar = balken[0] as HTMLElement
  expect(bar.style.getPropertyValue('--pct').trim()).toBe('25')
  expect(bar.classList.contains('token-card__hp-bar--low')).toBe(true)
}, 15000)

test('Karte ohne volle Trefferpunkte-Angabe zeigt keinen Balken', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const karte = tokenKarte('Ork')
  expect(karte.querySelectorAll('.token-card__hp-bar')).toHaveLength(0)
}, 15000)

test('Karte zeigt Conditions als Chips mit Icon und Label', async () => {
  const GOBLIN_COND = { ...GOBLIN, conditions: ['Vergiftet', 'Segen'] }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_COND] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const karte = tokenKarte('Goblin')
  const chips = Array.from(karte.querySelectorAll('.token-card__conditions .chip'))
  expect(chips).toHaveLength(2)
  expect(chips[0].textContent).toContain('Vergiftet')
  expect(chips[0].querySelector('svg')).not.toBeNull()
  expect(chips[1].textContent).toContain('Segen')
  expect(chips[1].querySelector('svg')).toBeNull()
}, 15000)

// --- Szenarien: Entfernen & Zuweisen --------------------------------------------------------

test('Spielleiter entfernt ein Token über die Liste', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.removeToken.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Entfernen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Token „Goblin" entfernen?' })
  expect(socketMock.__facade.removeToken).not.toHaveBeenCalled()

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
  })

  await waitFor(() => expect(socketMock.__facade.removeToken).toHaveBeenCalledWith('s1', 't-goblin'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
}, 15000)

test('Spielleiter weist ein Token über die Liste zu', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN], participants: TEILNEHMER })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true, token: { ...GOBLIN, ownerId: 'u-sam' } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

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
}, 15000)

test('Spielleiter nimmt eine Zuweisung über die Liste zurück', async () => {
  const GOBLIN_SAM = { ...GOBLIN, ownerId: 'u-sam' }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_SAM], participants: TEILNEHMER })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_SAM, ownerId: null } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

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
}, 15000)

// --- Szenarien: Werte im Bearbeiten-Modal & Schaden/Heilung inline --------------------------

test('Spielleiter setzt Werte über die Liste', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneBearbeiten('Goblin')
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Goblin HP' }), { target: { value: '23' } })
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Goblin HP-Maximum' }), { target: { value: '40' } })
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Goblin RK' }), { target: { value: '16' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Goblin Werte speichern' }))
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
}, 15000)

test('Wertefelder folgen dem Bestand', async () => {
  const GOBLIN_VOLL = { ...GOBLIN, hp: 23, hpMax: 40, tempHp: 5, ac: 16, initiative: 12 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_VOLL] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneBearbeiten('Goblin')
  expect((within(dialog).getByRole('spinbutton', { name: 'Goblin HP' }) as HTMLInputElement).value).toBe('23')
  expect((within(dialog).getByRole('spinbutton', { name: 'Goblin HP-Maximum' }) as HTMLInputElement).value).toBe('40')
  expect((within(dialog).getByRole('spinbutton', { name: 'Goblin Temp-HP' }) as HTMLInputElement).value).toBe('5')
  expect((within(dialog).getByRole('spinbutton', { name: 'Goblin RK' }) as HTMLInputElement).value).toBe('16')
  expect((within(dialog).getByRole('spinbutton', { name: 'Goblin Initiative' }) as HTMLInputElement).value).toBe('12')

  const karte = tokenKarte('Goblin')
  expect(dlPaare(karte)).toEqual([
    ['HP', '23/40'],
    ['Temp-HP', '5'],
    ['RK', '16'],
    ['Initiative', '12'],
  ])
}, 15000)

test('Schaden über die Liste', async () => {
  const GOBLIN_HP = { ...GOBLIN, hp: 23, hpMax: 40 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin Änderung' }), { target: { value: '7' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Schaden' }))
  })

  await waitFor(() => expect(socketMock.__facade.setTokenStats).toHaveBeenCalledWith('s1', 't-goblin', { hp: 16 }))
}, 15000)

test('Heilung deckelt am Maximum', async () => {
  const GOBLIN_HP = { ...GOBLIN, hp: 38, hpMax: 40 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin Änderung' }), { target: { value: '5' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Heilung' }))
  })

  await waitFor(() => expect(socketMock.__facade.setTokenStats).toHaveBeenCalledWith('s1', 't-goblin', { hp: 40 }))
}, 15000)

test('Schaden ohne Trefferpunkte sendet nichts', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Goblin Änderung' }), { target: { value: '7' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Goblin Schaden' }))
  })

  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(socketMock.__facade.setTokenStats).not.toHaveBeenCalled()
}, 15000)

// --- Szenarien: Markierungen im Bearbeiten-Modal --------------------------------------------

test('Spielleiter setzt eine Markierung über die Schnellwahl', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneBearbeiten('Goblin')
  const select = within(dialog).getByRole('combobox', { name: 'Goblin Markierung wählen' }) as HTMLSelectElement
  expect(within(select).getByRole('option', { name: 'Liegend' })).toBeTruthy()
  expect(within(select).getByRole('option', { name: 'Vergiftet' })).toBeTruthy()
  expect(within(select).getByRole('option', { name: 'Bewusstlos' })).toBeTruthy()

  await act(async () => {
    fireEvent.change(select, { target: { value: 'Liegend' } })
  })

  await waitFor(() => expect(socketMock.__facade.setTokenConditions).toHaveBeenCalledWith('s1', 't-goblin', ['Liegend']))
}, 15000)

test('Spielleiter fügt eine freie Markierung hinzu', async () => {
  const GOBLIN_LIEGEND = { ...GOBLIN, conditions: ['Liegend'] }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_LIEGEND] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneBearbeiten('Goblin')
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Goblin Markierung' }), { target: { value: 'Segen' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Goblin Markierung hinzufügen' }))
  })

  await waitFor(() =>
    expect(socketMock.__facade.setTokenConditions).toHaveBeenCalledWith('s1', 't-goblin', ['Liegend', 'Segen']),
  )
}, 15000)

test('Spielleiter entfernt eine Markierung', async () => {
  const GOBLIN_ZWEI = { ...GOBLIN, conditions: ['Liegend', 'Segen'] }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_ZWEI] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  const dialog = await oeffneBearbeiten('Goblin')
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Goblin Markierung Liegend entfernen' }))
  })

  await waitFor(() => expect(socketMock.__facade.setTokenConditions).toHaveBeenCalledWith('s1', 't-goblin', ['Segen']))
}, 15000)

// --- Szenarien: Spieler-Sicht ---------------------------------------------------------------

test('Spieler sieht die Werte seines Tokens', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', hp: 23, hpMax: 40, tempHp: 5, ac: 16, initiative: 12, conditions: ['Liegend', 'Segen'] }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  expect(await screen.findByRole('heading', { name: 'Tokenwerte' })).toBeTruthy()
  const karte = tokenKarte('Goblin')
  expect(dlPaare(karte)).toEqual([
    ['HP', '23/40'],
    ['Temp-HP', '5'],
    ['RK', '16'],
    ['Initiative', '12'],
  ])
  const chips = Array.from(karte.querySelectorAll('.token-card__conditions .chip')).map((c) => c.textContent?.trim())
  expect(chips).toEqual(['Liegend', 'Segen'])
}, 15000)

test('Spieler sieht ohne Werte keine Werte', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  expect(await screen.findByRole('heading', { name: 'Tokenwerte' })).toBeTruthy()
  const karte = tokenKarte('Ork')
  expect(within(karte).getByText('Ork')).toBeTruthy()
  expect(dlPaare(karte)).toEqual([])
  expect(karte.querySelectorAll('.token-card__conditions .chip')).toHaveLength(0)
}, 15000)

test('Spieler sieht keine Token-Verwaltung', async () => {
  const FREMDER_ORK = { ...ORK, ownerId: null, shares: null }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [FREMDER_ORK] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: [FREMDER_ORK] }))
  // Keine Verwaltungselemente (weder Überschrift/Knöpfe noch Wertefelder).
  expect(screen.queryByRole('heading', { name: 'Tokens' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Token anlegen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Anlegen' })).toBeNull()
  expect(screen.queryByRole('spinbutton', { name: 'Ork HP' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork Werte speichern' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork Schaden' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Ork Markierung wählen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork Markierung hinzufügen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ork entfernen' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Ork zuweisen' })).toBeNull()

  // Das Menü `Aktionen für Ork` unter `Tokenwerte`: die vier Verwaltungs-Einträge gesperrt,
  // `Auf Karte zentrieren` nicht gesperrt.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Ork' }))
  })
  const menu = screen.getByRole('menu', { name: 'Aktionen für Ork' })
  for (const eintrag of ['Bearbeiten', 'Zuweisen…', 'Freigeben…', 'Entfernen']) {
    expect(within(menu).getByRole('menuitem', { name: eintrag }).getAttribute('aria-disabled')).toBe('true')
  }
  expect(within(menu).getByRole('menuitem', { name: 'Auf Karte zentrieren' }).getAttribute('aria-disabled')).toBeNull()
}, 15000)

// --- Szenarien: Freigabe (add-token-sharing, #62) -------------------------------------------

const MEISTER = { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true }
const SAM = { userId: 'u-sam', username: 'sam', alias: 'Gandalf', role: 'spieler', online: true }
const TOM = { userId: 'u-tom', username: 'tom', role: 'spieler', online: true }
const SELBST_SPIELER = { userId: 'u-selbst', username: 'ich', alias: 'Gandalf', role: 'spieler', online: true }

function checkbox(name: string): HTMLInputElement {
  return screen.getByRole('checkbox', { name }) as HTMLInputElement
}

// Die Freigabe-Kästchen liegen im Modal `Freigaben für <Name>`, das der Eintrag `Freigeben…`
// des Token-Menüs öffnet.
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
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin HP für alle' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'hp', 'alle'))
}, 15000)

test('Spielleiter teilt einen Wert mit einem Spieler über die Liste', async () => {
  const GOBLIN_TEILBAR = { ...GOBLIN, shares: KEINE_SHARES }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_TEILBAR], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_TEILBAR, shares: { ...KEINE_SHARES, ac: ['u-sam'] } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin RK für Gandalf' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'ac', ['u-sam']))
  expect(screen.queryByRole('checkbox', { name: 'Goblin RK für meister' })).toBeNull()
}, 15000)

test('Weiterer Empfänger wird an die Liste angehängt', async () => {
  const GOBLIN_AC_SAM = { ...GOBLIN, shares: { ...KEINE_SHARES, ac: ['u-sam'] } }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_AC_SAM], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_AC_SAM, shares: { ...KEINE_SHARES, ac: ['u-sam', 'u-tom'] } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin RK für tom' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'ac', ['u-sam', 'u-tom']))
}, 15000)

test('Abwahl des letzten Empfängers sendet keine', async () => {
  const GOBLIN_AC_SAM = { ...GOBLIN, shares: { ...KEINE_SHARES, ac: ['u-sam'] } }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_AC_SAM], participants: [MEISTER, SAM, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_AC_SAM, shares: KEINE_SHARES } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  const box = screen.getByRole('checkbox', { name: 'Goblin RK für Gandalf' }) as HTMLInputElement
  expect(box.checked).toBe(true)
  await act(async () => {
    fireEvent.click(box)
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'ac', 'keine'))
}, 15000)

test('Abwahl von alle sendet keine', async () => {
  const GOBLIN_HP_ALLE = { ...GOBLIN, shares: { ...KEINE_SHARES, hp: 'alle' } }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_HP_ALLE], participants: [MEISTER, SAM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...GOBLIN_HP_ALLE, shares: KEINE_SHARES } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  const box = screen.getByRole('checkbox', { name: 'Goblin HP für alle' }) as HTMLInputElement
  expect(box.checked).toBe(true)
  await act(async () => {
    fireEvent.click(box)
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'hp', 'keine'))
}, 15000)

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
  await aktiviereReiter('Tokens')

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
}, 15000)

test('Besitzer sieht Freigabe-Schalter nur am eigenen Token', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  const FREMDER_ORK = { ...ORK, ownerId: null, shares: null }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN, FREMDER_ORK], participants: [MEISTER, SELBST_SPIELER, TOM] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Ork' }))
  })
  const orkMenu = screen.getByRole('menu', { name: 'Aktionen für Ork' })
  expect(within(orkMenu).getByRole('menuitem', { name: 'Freigeben…' }).getAttribute('aria-disabled')).toBe('true')
  await act(async () => {
    fireEvent.keyDown(within(orkMenu).getByRole('menuitem', { name: 'Freigeben…' }), { key: 'Escape' })
  })

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
}, 15000)

test('Besitzer teilt über die Liste', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN], participants: [SELBST_SPIELER, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: true, token: { ...MEIN_GOBLIN, shares: { ...KEINE_SHARES, conditions: ['u-tom'] } } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin Markierungen für tom' }))
  })

  await waitFor(() => expect(socketMock.__facade.shareToken).toHaveBeenCalledWith('s1', 't-goblin', 'conditions', ['u-tom']))
}, 15000)

test('Abgelehnte Freigabe zeigt die Meldung', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN], participants: [SELBST_SPIELER, TOM] })
  socketMock.__facade.shareToken.mockResolvedValue({ ok: false, message: 'Dieses Token darfst du nicht teilen.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await oeffneFreigaben()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Goblin HP für alle' }))
  })

  expect(await screen.findByText('Dieses Token darfst du nicht teilen.')).toBeTruthy()
}, 15000)

// --- Szenarien: Kontextmenü, Bearbeiten-Fokus, Entfernen, Zentrieren ------------------------

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
  expect(items.map((el) => el.textContent)).toEqual(['Bearbeiten', 'Zuweisen…', 'Freigeben…', 'Auf Karte zentrieren', 'Entfernen'])
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
  await aktiviereReiter('Tokens')

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
  await aktiviereReiter('Tokens')

  const dialog = await oeffneBearbeiten('Goblin')
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(within(dialog).getByRole('spinbutton', { name: 'Goblin HP' }))
}, 15000)

test('Abgebrochenes Entfernen sendet nichts', async () => {
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN] })
  socketMock.__facade.removeToken.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

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

test('Auf Karte zentrieren zentriert die Sicht auf das Token', async () => {
  const GOBLIN_71 = { ...GOBLIN, col: 7, row: 1 }
  spielleiterFetch()
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [GOBLIN_71] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Auf Karte zentrieren' }))
  })

  await waitFor(() => expect(canvasMock.__handle.centerOn).toHaveBeenCalledWith({ col: 7, row: 1 }))
}, 15000)

test('Spieler zentriert auf sein Token', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', col: 2, row: 5 }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Auf Karte zentrieren' }))
  })

  await waitFor(() => expect(canvasMock.__handle.centerOn).toHaveBeenCalledWith({ col: 2, row: 5 }))
}, 15000)

test('Spieler sieht im Token-Menü nur Freigeben aktiv', async () => {
  const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst', shares: KEINE_SHARES }
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await aktiviereReiter('Tokens')

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Goblin' }))
  })
  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  expect(within(menu).getByRole('menuitem', { name: 'Bearbeiten' }).getAttribute('aria-disabled')).toBe('true')
  expect(within(menu).getByRole('menuitem', { name: 'Zuweisen…' }).getAttribute('aria-disabled')).toBe('true')
  expect(within(menu).getByRole('menuitem', { name: 'Entfernen' }).getAttribute('aria-disabled')).toBe('true')
  const freigeben = within(menu).getByRole('menuitem', { name: 'Freigeben…' })
  expect(freigeben.getAttribute('aria-disabled')).toBeNull()
  expect(within(menu).getByRole('menuitem', { name: 'Auf Karte zentrieren' }).getAttribute('aria-disabled')).toBeNull()
  expect(document.activeElement).toBe(freigeben)
}, 15000)
