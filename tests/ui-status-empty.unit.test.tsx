/** @jest-environment jsdom */
// Komponententests zu den Leerzustand-Szenarien des Change add-ui-status (#91). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname. Diese Datei buendelt
// die MODIFIED-Leerzustand-Szenarien der fuenf Listen-Capabilities, weil sie dieselben
// Mock-Grenzen brauchen (App + Socket-/Canvas-Fassade) und der Leerzustand (`ui-status`,
// Requirement „Leerzustand") ihr gemeinsamer Gegenstand ist:
//  - session-token: „Leere Token-Verwaltung zeigt den Leerzustand", „Leere Tokenwerte zeigen
//    den Leerzustand"
//  - session-fog: „Ohne Bereiche zeigt die Fog-Verwaltung den Leerzustand"
//  - session-annotation: „Ohne Anmerkungen zeigt das Panel den Leerzustand"
//  - session-map: „Ohne eingehängte Karten zeigt die Kartenverwaltung den Leerzustand"
//  - map-library: „Leere Bibliothek zeigt den Leerzustand"
//
// Geprueft wird, *was* gerendert werden soll, nicht das Aussehen (AGENTS.md). Adressierung nach
// design.md D9: Panels ueber die Ueberschrift bzw. die Gruppe scopen, Leerzustand ueber den
// Titeltext (`<strong>`) und dessen `closest('.empty-state')`, „keine Liste" ueber
// `queryAllByRole('listitem')`.
//
// Rote Phase (constitution.md §3.1): die sechs Listen rendern heute eine leere `<ul>` statt des
// Bausteins `EmptyState`; die Szenarien scheitern daran, dass der Titeltext des Leerzustands
// fehlt — die erwartete Assertion, kein Setup-/Ladefehler.

import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade ----------------------------------------------------------------
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
    alias: jest.fn(),
    activateMap: jest.fn(),
    createToken: jest.fn(async () => ({ ok: true })),
    moveToken: jest.fn(),
    removeToken: jest.fn(async () => ({ ok: true })),
    assignToken: jest.fn(async () => ({ ok: true })),
    shareToken: jest.fn(async () => ({ ok: true })),
    setTokenStats: jest.fn(async () => ({ ok: true })),
    setTokenConditions: jest.fn(async () => ({ ok: true })),
    setFog: jest.fn(async () => ({ ok: true })),
    createFogArea: jest.fn(async () => ({ ok: true })),
    deleteFogArea: jest.fn(async () => ({ ok: true })),
    createAnnotation: jest.fn(async () => ({ ok: true, annotation: { id: 'neu' } })),
    deleteAnnotation: jest.fn(async () => ({ ok: true })),
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
  __facade: { enter: jest.Mock; on: jest.Mock } & Record<string, jest.Mock>
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- Mock der Canvas-Fassade (kein pixi.js in jsdom) ----------------------------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = {
    setGrid: jest.fn(),
    setImage: jest.fn(),
    setTokens: jest.fn(),
    setFog: jest.fn(),
    setTool: jest.fn(),
    setSelection: jest.fn(),
    setAnnotations: jest.fn(),
    setAnnotationOptions: jest.fn(),
    destroy: jest.fn(),
  }
  return { createMapCanvas: jest.fn(async () => handle), __handle: handle }
})

// --- fetch-Mock (nach Pfad und Methode, wie tests/session-token-ui.unit.test.tsx) -----------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
const AKTIVE_KARTE = { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }
const FOG_LEER = { instanceId: 'i-tav', version: 0, revealed: [], areas: [] }

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
function basis(sessions: unknown[]): Route[] {
  return [
    { method: 'GET', match: (u) => u.includes('/api/auth/me'), make: () => antwort(200, NUTZER) },
    { method: 'GET', match: (u) => /\/api\/sessions(\?|$)/.test(u) || u.endsWith('/api/sessions'), make: () => antwort(200, sessions) },
  ]
}

function enterAck(
  role: 'spieler' | 'spielleiter',
  status: string,
  extras: { map?: unknown; tokens?: unknown[]; fog?: unknown; annotations?: unknown[] } = {},
): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status, role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: [{ userId: 'u-selbst', username: 'ich', role, online: true }],
    map: 'map' in extras ? extras.map : null,
    tokens: extras.tokens ?? [],
    fog: 'fog' in extras ? extras.fog : null,
    annotations: extras.annotations ?? [],
  })
}

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
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- session-token --------------------------------------------------------------------------

test('Leere Token-Verwaltung zeigt den Leerzustand', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [])),
    eigeneKartenRoute(() => antwort(200, [])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  enterAck('spielleiter', 'geoeffnet', { map: AKTIVE_KARTE, tokens: [], fog: FOG_LEER })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const scope = must((await screen.findByRole('heading', { name: 'Tokens' })).parentElement, 'die Token-Verwaltung')
  const titel = await within(scope).findByText('Noch keine Tokens')
  expect(titel.closest('.empty-state')).not.toBeNull()
  expect(within(scope).getByText('Lege ein Token an, um es auf der Karte zu sehen.')).toBeTruthy()
  expect(within(scope).queryAllByRole('listitem')).toHaveLength(0)
  expect(within(scope).getByRole('button', { name: 'Anlegen' })).toBeTruthy()
}, 15000)

test('Leere Tokenwerte zeigen den Leerzustand', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', 'geoeffnet', { map: AKTIVE_KARTE, tokens: [], fog: FOG_LEER })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const scope = must((await screen.findByRole('heading', { name: 'Tokenwerte' })).parentElement, 'die Liste Tokenwerte')
  const titel = await within(scope).findByText('Noch keine Tokens')
  expect(titel.closest('.empty-state')).not.toBeNull()
  expect(within(scope).getByText('Sobald die Spielleitung Tokens auf die Karte setzt, erscheinen sie hier.')).toBeTruthy()
  expect(within(scope).queryAllByRole('listitem')).toHaveLength(0)
}, 15000)

// --- session-fog ----------------------------------------------------------------------------

test('Ohne Bereiche zeigt die Fog-Verwaltung den Leerzustand', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [])),
    eigeneKartenRoute(() => antwort(200, [])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  enterAck('spielleiter', 'geoeffnet', { map: AKTIVE_KARTE, fog: { instanceId: 'i-tav', version: 0, revealed: [], areas: [] } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const scope = await screen.findByRole('group', { name: 'Fog of War' })
  const titel = await within(scope).findByText('Noch keine Bereiche')
  expect(titel.closest('.empty-state')).not.toBeNull()
  expect(within(scope).getByText('Markiere Zellen auf der Karte und speichere sie als Bereich.')).toBeTruthy()
  expect(within(scope).queryAllByRole('listitem')).toHaveLength(0)
  expect(within(scope).queryByRole('checkbox', { name: /aufgedeckt$/ })).toBeNull()
  expect(within(scope).getByRole('button', { name: 'Alles aufdecken' })).toBeTruthy()
  expect(within(scope).getByRole('button', { name: 'Alles verdecken' })).toBeTruthy()
}, 15000)

// --- session-annotation ---------------------------------------------------------------------

test('Ohne Anmerkungen zeigt das Panel den Leerzustand', async () => {
  installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
  enterAck('spieler', 'geoeffnet', { map: AKTIVE_KARTE, fog: FOG_LEER, annotations: [] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const scope = await screen.findByRole('group', { name: 'Messen & Zeichnen' })
  const titel = await within(scope).findByText('Noch keine Anmerkungen')
  expect(titel.closest('.empty-state')).not.toBeNull()
  expect(within(scope).getByText('Miss eine Strecke oder zeichne auf der Karte.')).toBeTruthy()
  expect(within(scope).queryAllByRole('listitem')).toHaveLength(0)
  expect(within(scope).getByRole('button', { name: 'Meine entfernen' })).toBeTruthy()
}, 15000)

// --- session-map ----------------------------------------------------------------------------

test('Ohne eingehängte Karten zeigt die Kartenverwaltung den Leerzustand', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-wald', name: 'Wald', hasImage: false, grid: QUADRAT }])),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
  enterAck('spielleiter', 'geoeffnet', { map: null })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const scope = must((await screen.findByRole('heading', { name: 'Karten' })).parentElement, 'die Kartenverwaltung')
  const titel = await within(scope).findByText('Noch keine Karten eingehängt')
  expect(titel.closest('.empty-state')).not.toBeNull()
  expect(within(scope).getByText('Hänge eine Karte aus deiner Bibliothek ein.')).toBeTruthy()
  expect(within(scope).queryAllByRole('listitem')).toHaveLength(0)
  const auswahl = within(scope).getByLabelText('Karte aus der Bibliothek')
  expect(within(auswahl).getByRole('option', { name: 'Wald' })).toBeTruthy()
}, 15000)

// --- map-library ----------------------------------------------------------------------------

test('Leere Bibliothek zeigt den Leerzustand', async () => {
  installFetch([...basis([]), { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, []) }])

  render(<App />)
  await oeffneBibliothek()

  const scope = must((await screen.findByRole('heading', { name: 'Kartenbibliothek' })).parentElement, 'die Bibliothek')
  const titel = await within(scope).findByText('Noch keine Karten')
  expect(titel.closest('.empty-state')).not.toBeNull()
  expect(within(scope).getByText('Lege eine Karte mit Namen und Bild an.')).toBeTruthy()
  expect(within(scope).queryAllByRole('listitem')).toHaveLength(0)
  expect(within(scope).getByText(/neue karte/i)).toBeTruthy()
}, 15000)
