/** @jest-environment jsdom */
// Komponententests zur neuen Capability-Erweiterung `add-participant-cards` aus
// openspec/changes/add-participant-cards/specs/game-session/spec.md (#97), Requirement
// "Teilnehmerkarten" (ADDED). Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1),
// Testname = Szenarioname (woertlich).
//
// Geprueft wird, *was* der Reiter `Teilnehmer` je Mitglied als Karte anbietet und ausloest —
// nicht, wie es aussieht (AGENTS.md: Rendering nimmt der menschliche App-Test ab). Adressiert
// wird ausschliesslich ueber Testing-Library-Rollen/Labels (design.md D7); Karten, Chips,
// Rollen-Pill und Praesenz werden immer gescoped per `within(...)` geprueft. Die einzigen
// Klassenabfragen sind `.participant-card` und `.presence--online|--offline` — beide sind Teil
// der THEN der Spec (design.md D7).
//
// Aufbau wie die bestehenden Raum-Suiten (session-tabs-ui/session-token-ui/session-leave-ui):
// `fetch` ist gemockt, die Socket-Fassade `src/client/session/socket.ts` ist per `jest.mock`
// ersetzt (Sendewege beobachtbar), die Canvas-Fassade ebenso (jsdom hat kein WebGL).
// Server-Ereignisse werden ueber die registrierten Handler ausgeloest (`__emit`).
//
// Rote Phase (constitution.md §3.1): der Reiter `Teilnehmer` traegt heute ein `<ul>` mit
// Text-`<li>`, ein Inline-Alias-Formular und blanke `Austreten`/`Entfernen`-Buttons — weder
// `article.participant-card`, Rollen-Pill, `.presence`-Kennzeichen, Token-Chips, ein
// `Alias ändern`-Modal, ein ⋮-Menue `Aktionen für …`, Bestaetigungsdialoge, ein
// `Einladen`-Popover noch ein `Tokens zuweisen`-Modal existieren. Die Szenarien scheitern an
// ihrer Assertion (fehlendes Element/Verhalten), nicht an einem Setup-/Compile-Fehler.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade (Muster session-token-ui) --------------------------------------
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
    alias: jest.fn(async () => ({ ok: true, alias: '' })),
    rename: jest.fn(),
    activateMap: jest.fn(),
    createToken: jest.fn(),
    moveToken: jest.fn(),
    removeToken: jest.fn(),
    assignToken: jest.fn(async () => ({ ok: true })),
    shareToken: jest.fn(),
    setTokenStats: jest.fn(async () => ({ ok: true })),
    setTokenConditions: jest.fn(async () => ({ ok: true })),
    revealFog: jest.fn(async () => ({ ok: true })),
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
  __facade: Record<string, jest.Mock>
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- fetch-Mock (nach Pfad per `includes`, erster Treffer zaehlt) ----------------------------

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

/** Alle `fetch`-Aufrufe mit Methode DELETE (design.md D4: `DELETE …/members/:userId`). */
function deleteAufrufe(): string[] {
  const mock = globalThis.fetch as unknown as jest.Mock
  return mock.mock.calls
    .filter((args) => String((args[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'DELETE')
    .map((args) => urlOf(args[0] as RequestInfo | URL))
}

// Der Toast-Host (`ui-feedback`) traegt `role="status"` UND die Klasse `toast-host`.
function toastHost(): HTMLElement {
  const host = screen.getAllByRole('status').find((el) => el.classList.contains('toast-host'))
  return must(host, 'der Toast-Host (role=status, Klasse toast-host)')
}

// --- Testdaten & Fixtures -------------------------------------------------------------------

// Der angemeldete Nutzer (`/api/auth/me`): `id` bestimmt, welche Karte die eigene ist; der
// `username` ist bewusst von jedem Teilnehmernamen verschieden, damit die Namensabfragen in den
// Karten eindeutig bleiben (das Kontomenue der Top-Bar zeigt diesen Namen ausserhalb des Panels).
const SELBST_ID = 'u-selbst'
const NUTZER = { id: SELBST_ID, email: 'ich@example.com', username: 'ich' }

const GOBLIN = {
  id: 't-goblin',
  instanceId: 'i-tav',
  name: 'Goblin',
  color: '#3366ff',
  icon: null as string | null,
  size: 1,
  col: 3,
  row: 4,
  ownerId: null as string | null,
  hp: null as number | null,
  hpMax: null as number | null,
  tempHp: null as number | null,
  ac: null as number | null,
  initiative: null as number | null,
  conditions: [] as string[],
  shares: null as unknown,
}
const ORK = { ...GOBLIN, id: 't-ork', name: 'Ork' }

function gmFetch(code = 'ABC234'): void {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions/s1/maps', antwort: antwort(200, []) },
    { pfad: '/api/maps', antwort: antwort(200, []) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code }]) },
  ])
}

function spielerFetch(): void {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]) },
  ])
}

function enterAck(
  role: 'spieler' | 'spielleiter',
  extras: { participants?: unknown[]; tokens?: unknown[]; code?: string } = {},
): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: {
      id: 's1',
      name: 'Freitagsrunde',
      status: 'geoeffnet',
      role,
      ...(role === 'spielleiter' ? { code: extras.code ?? 'ABC234' } : {}),
    },
    participants: extras.participants ?? [{ userId: SELBST_ID, username: 'ich', role, online: true }],
    map: null,
    tokens: extras.tokens ?? [],
    fog: null,
  })
}

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

/** Rendert die Anwendung, betritt den Raum und aktiviert den Reiter `Teilnehmer` (design.md D10). */
async function raumUndReiter(): Promise<void> {
  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Sitzung' })
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Teilnehmer' }))
  })
}

/** Das sichtbare Reiterpanel `Teilnehmer`. */
function teilnehmerPanel(): HTMLElement {
  return screen.getByRole('tabpanel', { name: 'Teilnehmer' })
}

/** Die Karte eines Mitglieds, ueber seinen Anzeigenamen bestimmt (design.md D7): zum
 * umschliessenden `article.participant-card` hochgehen. */
function karteMit(name: string): HTMLElement {
  const nameEl = within(teilnehmerPanel()).getByText(name)
  return must(nameEl.closest('article.participant-card') as HTMLElement | null, `die Karte für ${name}`)
}

// MODIFIED (#98): Der Spieler hat keinen Reiter `Teilnehmer`; seine Teilnehmerkarten liegen im
// Teilnehmer-Modal der Spieler-Leiste, das der Trigger `Teilnehmer` oeffnet (player-bar,
// „On-Demand-Modals"). Rendert, betritt als Spieler und gibt den Dialog `Teilnehmer` zurueck.
async function raumUndTeilnehmerModal(): Promise<HTMLElement> {
  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Sitzung' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Teilnehmer' }))
  })
  return screen.findByRole('dialog', { name: 'Teilnehmer' })
}

/** Die Karte eines Mitglieds innerhalb eines Containers (Dialog/Panel), ueber seinen Namen. */
function karteIn(scope: HTMLElement, name: string): HTMLElement {
  const nameEl = within(scope).getByText(name)
  return must(nameEl.closest('article.participant-card') as HTMLElement | null, `die Karte für ${name}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
})

// --- Requirement: Teilnehmerkarten ----------------------------------------------------------

test('Karte zeigt Rolle und Präsenz', async () => {
  // GIVEN: Spielleiter `meister` (online) betreten; die Liste nennt `meister` (spielleiter,
  // online) und `sam` (spieler, offline).
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'u-sam', username: 'sam', role: 'spieler', online: false },
    ],
  })
  await raumUndReiter()

  // THEN: zwei Karten; die Karte `meister` mit Pill `Spielleiter` und Praesenz `anwesend`
  // (Klasse `presence--online`), die Karte `sam` mit Pill `Spieler` und `abwesend`
  // (Klasse `presence--offline`).
  const panel = teilnehmerPanel()
  expect(panel.querySelectorAll('article.participant-card')).toHaveLength(2)

  const meister = karteMit('meister')
  within(meister).getByText('Spielleiter')
  const meisterPresence = must(within(meister).getByText('anwesend').closest('.presence'), 'das Präsenzkennzeichen der Karte meister')
  expect(meisterPresence.classList.contains('presence--online')).toBe(true)

  const sam = karteMit('sam')
  within(sam).getByText('Spieler')
  const samPresence = must(within(sam).getByText('abwesend').closest('.presence'), 'das Präsenzkennzeichen der Karte sam')
  expect(samPresence.classList.contains('presence--offline')).toBe(true)
})

test('Zugewiesene Tokens erscheinen als Chips', async () => {
  // GIVEN: Spielleiter betreten; Spieler `sam` (userId `U`); Token `Goblin` (ownerId `U`) und
  // Token `Ork` (ownerId null).
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'U', username: 'sam', role: 'spieler', online: true },
    ],
    tokens: [
      { ...GOBLIN, ownerId: 'U' },
      { ...ORK, ownerId: null },
    ],
  })
  await raumUndReiter()

  // THEN: die Karte `sam` traegt einen Chip `Goblin` und keinen Chip `Ork`.
  const sam = karteMit('sam')
  within(sam).getByText('Goblin')
  expect(within(sam).queryByText('Ork')).toBeNull()
})

test('Eigene Karte trägt Alias ändern, fremde nicht', async () => {
  // GIVEN: Spielleiter `meister` (userId `M` = eigene Karte) betreten; Liste nennt `meister`
  // und `sam`.
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'u-sam', username: 'sam', role: 'spieler', online: true },
    ],
  })
  await raumUndReiter()

  // THEN: die eigene Karte `meister` traegt `Alias ändern`, die Karte `sam` nicht.
  expect(within(karteMit('meister')).getByRole('button', { name: 'Alias ändern' })).toBeTruthy()
  expect(within(karteMit('sam')).queryByRole('button', { name: 'Alias ändern' })).toBeNull()
})

test('Alias ändern öffnet das Modal', async () => {
  // GIVEN: Raumansicht eines Nutzers `sam` ohne Alias; das Teilnehmer-Modal der Spieler-Leiste
  // ist geoeffnet (player-bar, „On-Demand-Modals").
  spielerFetch()
  enterAck('spieler', {
    participants: [{ userId: SELBST_ID, username: 'sam', role: 'spieler', online: true }],
  })
  const modal = await raumUndTeilnehmerModal()
  const eigene = karteIn(modal, 'sam')

  // WHEN: `Alias ändern` auf der eigenen Karte ausloesen (schliesst das Teilnehmer-Modal und
  // oeffnet das Alias-Modal, design.md D5).
  await act(async () => {
    fireEvent.click(within(eigene).getByRole('button', { name: 'Alias ändern' }))
  })

  // THEN: Dialog `Alias ändern` mit leerem Feld `Alias` und Schaltflaeche `Alias setzen`.
  const dialog = screen.getByRole('dialog', { name: 'Alias ändern' })
  expect((within(dialog).getByLabelText('Alias') as HTMLInputElement).value).toBe('')
  expect(within(dialog).getByRole('button', { name: 'Alias setzen' })).toBeTruthy()
})

test('Menü der fremden Spielerkarte bietet Zuweisen und Entfernen', async () => {
  // GIVEN: Raumansicht des Spielleiters `meister`; Liste nennt zusaetzlich `sam`, Reiter aktiv.
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'u-sam', username: 'sam', role: 'spieler', online: true },
    ],
  })
  await raumUndReiter()

  // WHEN: das ⋮-Menue `Aktionen für sam` der Karte `sam` oeffnen.
  await act(async () => {
    fireEvent.click(within(karteMit('sam')).getByRole('button', { name: 'Aktionen für sam' }))
  })

  // THEN: Eintraege `Tokens zuweisen` und `Entfernen`, kein `Austreten`.
  const menu = screen.getByRole('menu', { name: 'Aktionen für sam' })
  within(menu).getByRole('menuitem', { name: 'Tokens zuweisen' })
  within(menu).getByRole('menuitem', { name: 'Entfernen' })
  expect(within(menu).queryByRole('menuitem', { name: 'Austreten' })).toBeNull()
})

test('Spieler sieht an fremder Karte kein Menü', async () => {
  // GIVEN: Raumansicht des Spielers `sam`; Liste nennt Spielleiter `meister` und `sam`, aktiv.
  spielerFetch()
  enterAck('spieler', {
    participants: [
      { userId: 'u-meister', username: 'meister', role: 'spielleiter', online: true },
      { userId: SELBST_ID, username: 'sam', role: 'spieler', online: true },
    ],
  })
  const modal = await raumUndTeilnehmerModal()

  // THEN: die fremde Karte `meister` traegt keinen Trigger `Aktionen für meister`, und keine
  // fremde Karte bietet `Entfernen` oder `Tokens zuweisen`.
  expect(within(karteIn(modal, 'meister')).queryByRole('button', { name: 'Aktionen für meister' })).toBeNull()
  expect(within(modal).queryByRole('button', { name: 'Entfernen' })).toBeNull()
  expect(within(modal).queryByRole('button', { name: 'Tokens zuweisen' })).toBeNull()
})

test('Abbrechen im Entfernen-Dialog sendet nichts', async () => {
  // GIVEN: Raumansicht des Spielleiters; Spieler `sam` (userId `U`), Reiter aktiv.
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'U', username: 'sam', role: 'spieler', online: true },
    ],
  })
  await raumUndReiter()

  // WHEN: im ⋮-Menue der Karte `sam` `Entfernen` ausloesen und im Dialog `Abbrechen`.
  await act(async () => {
    fireEvent.click(within(karteMit('sam')).getByRole('button', { name: 'Aktionen für sam' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Entfernen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'sam entfernen?' })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  })

  // THEN: kein DELETE …/members/U gesendet, die Karte `sam` weiterhin vorhanden.
  expect(deleteAufrufe().some((u) => u.includes('/api/sessions/s1/members/U'))).toBe(false)
  expect(karteMit('sam')).toBeTruthy()
})

test('Einladen-Popover zeigt maskierten Code und kopiert', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })

  try {
    // GIVEN: Raumansicht des Spielleiters (Code `ABC234`), Zwischenablage bestaetigt, Reiter aktiv.
    gmFetch('ABC234')
    enterAck('spielleiter', {
      code: 'ABC234',
      participants: [{ userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true }],
    })
    await raumUndReiter()

    // WHEN: `Einladen` ausloesen.
    await act(async () => {
      fireEvent.click(within(teilnehmerPanel()).getByRole('button', { name: 'Einladen' }))
    })

    // THEN: Dialog `Einladen` mit Maske `••••••` und ohne Textknoten `ABC234`.
    const popover = screen.getByRole('dialog', { name: 'Einladen' })
    expect(within(popover).getByLabelText('Sitzungscode').textContent).toBe('••••••')
    expect(within(popover).queryByText('ABC234')).toBeNull()

    // WHEN: `Code kopieren` im Popover ausloesen.
    await act(async () => {
      fireEvent.click(within(popover).getByRole('button', { name: 'Code kopieren' }))
    })

    // THEN: genau `ABC234` geschrieben, Toast `Sitzungscode kopiert`, Maske bleibt, kein Klartext.
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC234'))
    await waitFor(() => expect(within(toastHost()).getByText('Sitzungscode kopiert')).toBeTruthy())
    const popoverDanach = screen.getByRole('dialog', { name: 'Einladen' })
    expect(within(popoverDanach).getByLabelText('Sitzungscode').textContent).toBe('••••••')
    expect(within(popoverDanach).queryByText('ABC234')).toBeNull()
  } finally {
    Object.defineProperty(globalThis.navigator, 'clipboard', original ?? { value: undefined, configurable: true })
  }
})

test('Spieler bekommt kein Einladen', async () => {
  // GIVEN: Raumansicht eines Spielers, Reiter `Teilnehmer` aktiv.
  spielerFetch()
  enterAck('spieler', {
    participants: [{ userId: SELBST_ID, username: 'sam', role: 'spieler', online: true }],
  })
  const modal = await raumUndTeilnehmerModal()

  // THEN: keine Schaltflaeche `Einladen` und kein Dialog `Einladen` (der Spieler hat keinen Code, §9.2).
  expect(within(modal).queryByRole('button', { name: 'Einladen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Einladen' })).toBeNull()
  expect(screen.queryByRole('dialog', { name: 'Einladen' })).toBeNull()
})

test('Zuweisen-Modal spiegelt die aktuelle Zuweisung', async () => {
  // GIVEN: Spielleiter; Spieler `sam` (userId `U`); Token `Goblin` (ownerId `U`), `Ork` (null).
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'U', username: 'sam', role: 'spieler', online: true },
    ],
    tokens: [
      { ...GOBLIN, ownerId: 'U' },
      { ...ORK, ownerId: null },
    ],
  })
  await raumUndReiter()

  // WHEN: im ⋮-Menue der Karte `sam` `Tokens zuweisen` ausloesen.
  await act(async () => {
    fireEvent.click(within(karteMit('sam')).getByRole('button', { name: 'Aktionen für sam' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tokens zuweisen' }))
  })

  // THEN: Dialog `Tokens für sam` mit angehakter Checkbox `Goblin` und nicht angehakter `Ork`.
  const dialog = screen.getByRole('dialog', { name: 'Tokens für sam' })
  expect((within(dialog).getByRole('checkbox', { name: 'Goblin' }) as HTMLInputElement).checked).toBe(true)
  expect((within(dialog).getByRole('checkbox', { name: 'Ork' }) as HTMLInputElement).checked).toBe(false)
})

test('Umschalten im Zuweisen-Modal sendet die Zuweisung', async () => {
  // GIVEN: Dialog `Tokens für sam` (Spieler `sam`, userId `U`); Token `Goblin` (`t1`, ownerId
  // `U`) und `Ork` (`t2`, ownerId null).
  gmFetch()
  enterAck('spielleiter', {
    participants: [
      { userId: SELBST_ID, username: 'meister', role: 'spielleiter', online: true },
      { userId: 'U', username: 'sam', role: 'spieler', online: true },
    ],
    tokens: [
      { ...GOBLIN, id: 't1', name: 'Goblin', ownerId: 'U' },
      { ...ORK, id: 't2', name: 'Ork', ownerId: null },
    ],
  })
  socketMock.__facade.assignToken.mockResolvedValue({ ok: true })
  await raumUndReiter()

  await act(async () => {
    fireEvent.click(within(karteMit('sam')).getByRole('button', { name: 'Aktionen für sam' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tokens zuweisen' }))
  })
  const dialog = screen.getByRole('dialog', { name: 'Tokens für sam' })

  // WHEN: Checkbox `Ork` anhaken, danach `Goblin` abhaken.
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Ork' }))
  })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Goblin' }))
  })

  // THEN: zuerst `session:token-assign` mit `t2`/`U`, danach mit `t1`/null (Fassade positional,
  // wie die bestehenden Token-Szenarien in tests/session-token-ui.unit.test.tsx).
  await waitFor(() => expect(socketMock.__facade.assignToken).toHaveBeenCalledTimes(2))
  expect(socketMock.__facade.assignToken.mock.calls).toEqual([
    ['s1', 't2', 'U'],
    ['s1', 't1', null],
  ])
})
