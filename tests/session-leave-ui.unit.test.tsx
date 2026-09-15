/** @jest-environment jsdom */
// Komponententests zum Requirement "Sitzungsoberfläche" aus
// openspec/changes/add-session-leave/specs/game-session/spec.md (#70), fortgeschrieben durch
// add-participant-cards (#97): die Szenarien des Verlassens/Entfernens in der Raumansicht —
// "Spieler tritt über die eigene Zeile aus", "Spielleiter entfernt über die Spielerzeile" und
// "Entfernt-Ereignis führt zur Sitzungsliste". Ein Test je GIVEN/WHEN/THEN-Szenario
// (constitution.md §4.1), Testname = Szenarioname.
//
// Aufbau wie tests/session-ui.unit.test.tsx: `fetch` ist gemockt (`/api/auth/me` liefert einen
// Nutzer, `/api/sessions` die Liste), die Socket-Fassade `src/client/session/socket.ts` ist per
// `jest.mock` ersetzt; Server-Ereignisse werden durch Aufruf der registrierten Handler
// ausgeloest (`__emit`). Geprueft wird, *was* die Anwendung anbietet und ausloest — nicht, wie
// es aussieht (AGENTS.md). Das Austreten/Entfernen ruft die REST-Route
// `DELETE /api/sessions/:id/members/:userId` (design.md D4), beobachtbar am `fetch`-Mock. Der
// angemeldete Nutzername (Kontomenue der Top-Bar) ist bewusst von jedem angezeigten
// Teilnehmernamen verschieden, damit die Namensabfrage eindeutig die Teilnehmerkarte trifft.
//
// MODIFIED (#97, add-participant-cards): `Austreten`/`Entfernen` liegen nicht mehr als blanke
// Buttons in der Zeile, sondern im ⋮-Menue `Aktionen für <Name>` der Karte und laufen erst nach
// einem Bestaetigungsdialog (`Spielsitzung verlassen?` bzw. `<Name> entfernen?`).
//
// Rote Phase (constitution.md §3.1): die Karten tragen weder ein ⋮-Menue noch einen
// Bestaetigungsdialog — die Szenarien scheitern an ihrer Assertion (fehlendes Element/Verhalten),
// kein Setup-Fehler.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade (wie tests/session-ui.unit.test.tsx) ---------------------------
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
    alias: jest.fn(),
    rename: jest.fn(),
    assignToken: jest.fn(async () => ({ ok: true })),
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

// --- Mock der Canvas-Fassade (jsdom hat kein WebGL) -----------------------------------------
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

import * as sessionSocketModule from '../src/client/session/socket.js'

type SocketTestApi = {
  __facade: {
    connect: jest.Mock
    disconnect: jest.Mock
    enter: jest.Mock
    transition: jest.Mock
    alias: jest.Mock
    rename: jest.Mock
    assignToken: jest.Mock
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- fetch-Mock -----------------------------------------------------------------------------

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

/** Alle `fetch`-Aufrufe mit Methode DELETE (design.md D4: das Austreten/Entfernen geht ueber
 * `DELETE /api/sessions/:id/members/:userId`). */
function deleteAufrufe(): string[] {
  const mock = globalThis.fetch as unknown as jest.Mock
  return mock.mock.calls
    .filter((args) => String((args[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'DELETE')
    .map((args) => urlOf(args[0] as RequestInfo | URL))
}

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

// Aktiviert einen Bereichs-Reiter der Raumansicht (session-tabs, Testaufbau-Konvention):
// Teilnehmerkarten liegen im Reiter `Teilnehmer`.
async function aktiviereReiter(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name }))
  })
}

/** Die Karte (`article.participant-card`) eines Teilnehmers, gefunden ueber seinen Namen
 * (MODIFIED #97: Karte statt `<li>`, design.md D7). */
function karteMit(name: RegExp): HTMLElement {
  const panel = screen.getByRole('tabpanel', { name: 'Teilnehmer' })
  const treffer = within(panel).getByText(name)
  return must(treffer.closest('article.participant-card') as HTMLElement | null, `eine Teilnehmerkarte fuer ${String(name)}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
})

// --- Szenarien ------------------------------------------------------------------------------

test('Spieler tritt über die eigene Zeile aus', async () => {
  // GIVEN: die Raumansicht eines Spielers mit Nutzernamen `sam` und `userId` `U` (die
  // eigene Karte), dazu ein Spielleiter `meister`.
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'U', email: 'ich@example.com', username: 'ich' }) },
    { pfad: '/api/sessions/s1/members', antwort: antwort(200, {}) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]) },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [
      { userId: 'U', username: 'sam', role: 'spieler', online: true },
      { userId: 'u-meister', username: 'meister', role: 'spielleiter', online: true },
    ],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // MODIFIED (#98): die Teilnehmerkarten des Spielers liegen im Teilnehmer-Modal, das der
  // Trigger `Teilnehmer` der Spieler-Leiste oeffnet (player-bar, „On-Demand-Modals").
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Teilnehmer' }))
  })
  const modal = await screen.findByRole('dialog', { name: 'Teilnehmer' })
  const karteImModal = (name: RegExp): HTMLElement =>
    must(within(modal).getByText(name).closest('article.participant-card') as HTMLElement | null, `eine Teilnehmerkarte fuer ${String(name)}`)
  await waitFor(() => expect(karteImModal(/\bsam\b/)).toBeTruthy())

  // THEN: das ⋮-Menue der eigenen Karte von `sam` bietet `Austreten`; keine Karte bietet fuer
  // ihn `Entfernen`.
  const eigeneKarte = karteImModal(/\bsam\b/)
  await act(async () => {
    fireEvent.click(within(eigeneKarte).getByRole('button', { name: 'Aktionen für sam' }))
  })
  within(screen.getByRole('menu', { name: 'Aktionen für sam' })).getByRole('menuitem', { name: 'Austreten' })
  expect(screen.queryByRole('menuitem', { name: 'Entfernen' })).toBeNull()

  // WHEN: `Austreten` ausloesen und den Bestaetigungsdialog `Spielsitzung verlassen?` bestaetigen.
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Austreten' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Spielsitzung verlassen?' })
  expect(deleteAufrufe()).toHaveLength(0)
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Austreten' }))
  })

  // THEN: DELETE /api/sessions/s1/members/U.
  await waitFor(() => expect(deleteAufrufe().some((u) => u.includes('/api/sessions/s1/members/U'))).toBe(true))
})

test('Spielleiter entfernt über die Spielerzeile', async () => {
  // GIVEN: die Raumansicht des Spielleiters `meister` (`userId` `u-selbst`, die eigene Karte),
  // dazu ein Spieler `sam` mit `userId` `U`.
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-selbst', email: 'chef@example.com', username: 'chef' }) },
    { pfad: '/api/sessions/s1/members', antwort: antwort(200, {}) },
    { pfad: '/api/sessions/s1/maps', antwort: antwort(200, []) },
    { pfad: '/api/maps', antwort: antwort(200, []) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]) },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [
      { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true },
      { userId: 'U', username: 'sam', role: 'spieler', online: true },
    ],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await aktiviereReiter('Teilnehmer')
  await waitFor(() => expect(karteMit(/\bsam\b/)).toBeTruthy())

  // THEN: das ⋮-Menue der Karte `sam` bietet `Entfernen`; die eigene Karte `meister` traegt
  // kein ⋮-Menue (weder `Entfernen` noch `Austreten`).
  const eigeneKarte = karteMit(/\bmeister\b/)
  expect(within(eigeneKarte).queryByRole('button', { name: 'Aktionen für meister' })).toBeNull()

  const samKarte = karteMit(/\bsam\b/)
  await act(async () => {
    fireEvent.click(within(samKarte).getByRole('button', { name: 'Aktionen für sam' }))
  })
  const menu = screen.getByRole('menu', { name: 'Aktionen für sam' })
  within(menu).getByRole('menuitem', { name: 'Entfernen' })
  expect(within(menu).queryByRole('menuitem', { name: 'Austreten' })).toBeNull()

  // WHEN: `Entfernen` ausloesen und den Bestaetigungsdialog `sam entfernen?` bestaetigen.
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Entfernen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'sam entfernen?' })
  expect(deleteAufrufe()).toHaveLength(0)
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
  })

  // THEN: DELETE /api/sessions/s1/members/U.
  await waitFor(() => expect(deleteAufrufe().some((u) => u.includes('/api/sessions/s1/members/U'))).toBe(true))
})

test('Entfernt-Ereignis führt zur Sitzungsliste', async () => {
  // GIVEN: die Raumansicht eines Spielers ist geoeffnet.
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]) },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Sitzung' })

  // WHEN: `session:removed` mit der `sessionId` des Raums.
  await act(async () => {
    socketMock.__emit('removed', { sessionId: 's1' })
  })

  // THEN: die Sitzungsliste (Anker `Sitzung leiten`), keine Raumansicht mehr (keine Gruppe
  // `Sitzung`), genau ein Element der Rolle `alert` mit dem Hinweis.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy())
  expect(screen.queryByRole('group', { name: 'Sitzung' })).toBeNull()
  const alerts = screen.getAllByRole('alert')
  expect(alerts).toHaveLength(1)
  expect(alerts[0].textContent).toContain('Du wurdest aus der Spielsitzung entfernt.')
})
