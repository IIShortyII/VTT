/** @jest-environment jsdom */
// Komponententests zur neuen Capability `session-tabs` aus
// openspec/changes/add-session-tabs/specs/session-tabs/spec.md (#94). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname, gruppiert per
// `describe` je Requirement. Das Stylesheet-Szenario liegt in tests/session-tabs-theme.unit.test.ts,
// das Shell-Szenario „Raumansicht hebt die Breitenbegrenzung auf" in tests/ui-shell.unit.test.tsx.
//
// Geprueft wird, *was* die Raumansicht in Reitern anordnet — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Adressen ausschliesslich nach design.md D9:
// Reiterliste `getByRole('tablist', { name: 'Bereiche' })`, Reiter `getByRole('tab', { name })`,
// Reiterpanel `getByRole('tabpanel', { name })` (versteckt: `queryByRole` ist `null`,
// `getByRole(..., { hidden: true })` traegt `hidden`), Inhalt gescoped per `within`. Die einzige
// Klassenabfrage ist `.map-stage` (D9); `.panel`-Pruefungen laufen ueber `classList`/`closest`.
// `App` wird mit gemocktem `fetch`, gemockter Socket- und Canvas-Fassade gerendert (Muster der
// bestehenden Raum-Suiten session-token-ui/session-map-ui).
//
// Rote Phase (constitution.md §3.1): weder `ui/tabs.tsx` noch die Reiter der Raumansicht, die
// `hidden`-Panels, die Rasterklassen oder das Cluster existieren. Die Szenarien scheitern an
// ihrer Assertion (fehlende Reiterliste/-panel, fehlendes `hidden`, fehlende Klasse, fehlender
// Selektor), nicht an einem Setup-/Compile-Fehler.

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
    alias: jest.fn(),
    rename: jest.fn(),
    activateMap: jest.fn(),
    createToken: jest.fn(),
    moveToken: jest.fn(),
    removeToken: jest.fn(),
    assignToken: jest.fn(),
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

import * as sessionSocketModule from '../src/client/session/socket.js'

type SocketTestApi = {
  __facade: Record<string, jest.Mock>
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- Mock der Canvas-Fassade (aufloesbarer Modulschluessel mit `.js`, D9) --------------------
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

// --- fetch-Mock (nach Pfad und Methode, wie session-token-ui) -------------------------------

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
    calls.push({ method, url })
    const route = routes.find((r) => r.method === method && r.match(url))
    return must(route, `eine gemockte Antwort fuer ${method} ${url}`).make()
  }) as unknown as typeof fetch
}

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

// Standard-Aufbau fuer den Spielleiter: Instanz- und eigene Kartenliste beim Betreten.
function spielleiterFetch(instanzen: unknown[] = [], eigene: unknown[] = []): void {
  installFetch([
    instanzRoute('s1', () => antwort(200, instanzen)),
    eigeneKartenRoute(() => antwort(200, eigene)),
    ...basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
  ])
}

// --- Testdaten ------------------------------------------------------------------------------

const AKTIVE_KARTE = { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: false, grid: QUADRAT }
const FOG_LEER = { instanceId: 'i-tav', version: 0, revealed: [], areas: [] }
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

function enterAck(
  role: 'spieler' | 'spielleiter',
  status: string,
  extras: { map?: unknown; tokens?: unknown[]; participants?: unknown[]; fog?: unknown } = {},
): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status, role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: extras.participants ?? [{ userId: 'u-selbst', username: 'ich', role, online: true }],
    map: 'map' in extras ? extras.map : null,
    tokens: extras.tokens ?? [],
    fog: 'fog' in extras ? extras.fog : null,
  })
}

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}

/** Rendert die Anwendung, betritt den Raum und wartet, bis die Session-Bar (Gruppe `Sitzung`)
 * steht — der Anker, der auch ohne die Reiter schon existiert. */
async function raumBetreten(): Promise<void> {
  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Sitzung' })
}

/** Aktiviert einen Reiter per Klick (design.md D9). */
async function klickReiter(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name }))
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

// --- Requirement: Bereiche der Raumansicht --------------------------------------------------

describe('Bereiche der Raumansicht', () => {
  test('Reiter des Spielleiters', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: null })
    await raumBetreten()

    // Genau eine Reiterliste `Bereiche`.
    expect(screen.getAllByRole('tablist', { name: 'Bereiche' })).toHaveLength(1)
    const liste = screen.getByRole('tablist', { name: 'Bereiche' })
    const reiter = within(liste).getAllByRole('tab')
    expect(reiter.map((r) => r.textContent)).toEqual(['Karte', 'Tokens', 'Karten & Nebel', 'Teilnehmer'])

    // `Karte` aktiv, die drei anderen nicht.
    expect(within(liste).getByRole('tab', { name: 'Karte' }).getAttribute('aria-selected')).toBe('true')
    for (const name of ['Tokens', 'Karten & Nebel', 'Teilnehmer']) {
      expect(within(liste).getByRole('tab', { name }).getAttribute('aria-selected')).toBe('false')
    }

    // Panel `Karte` sichtbar mit dem Kartenhinweis; die anderen Panels tragen `hidden`.
    within(screen.getByRole('tabpanel', { name: 'Karte' })).getByText('Keine Karte aktiv')
    for (const name of ['Tokens', 'Karten & Nebel', 'Teilnehmer']) {
      expect(screen.queryByRole('tabpanel', { name })).toBeNull()
      expect(screen.getByRole('tabpanel', { name, hidden: true }).hasAttribute('hidden')).toBe(true)
    }

    // Die Gruppe `Sitzung` liegt im Dokument vor der Reiterliste.
    const bar = screen.getByRole('group', { name: 'Sitzung' })
    expect(bar.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('Reiter des Spielers', async () => {
    installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spieler' }]))
    enterAck('spieler', 'gestartet', { map: null })
    await raumBetreten()

    const liste = screen.getByRole('tablist', { name: 'Bereiche' })
    const reiter = within(liste).getAllByRole('tab')
    expect(reiter.map((r) => r.textContent)).toEqual(['Karte', 'Tokens', 'Teilnehmer'])
    expect(within(liste).queryByRole('tab', { name: 'Karten & Nebel' })).toBeNull()
    expect(within(liste).getByRole('tab', { name: 'Karte' }).getAttribute('aria-selected')).toBe('true')
  })

  test('Reiter Karte zeigt nur seine Panels', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', {
      map: AKTIVE_KARTE,
      fog: FOG_LEER,
      tokens: [GOBLIN],
      participants: [
        { userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true },
        { userId: 'u-a', username: 'alrik', role: 'spieler', online: true },
      ],
    })
    await raumBetreten()

    const karte = screen.getByRole('tabpanel', { name: 'Karte' })
    within(karte).getByText('Aktive Karte: Taverne')
    expect(karte.querySelector('.map-stage')).not.toBeNull()
    within(karte).getByRole('group', { name: 'Messen & Zeichnen' })
    within(karte).getByRole('group', { name: 'Fog of War' })

    // Ueber die Standardabfragen sind die Inhalte der versteckten Reiter nicht auffindbar.
    expect(screen.queryByRole('heading', { name: 'Tokens' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Karten' })).toBeNull()
    expect(screen.queryByLabelText('Alias')).toBeNull()

    for (const name of ['Tokens', 'Karten & Nebel', 'Teilnehmer']) {
      expect(screen.getByRole('tabpanel', { name, hidden: true }).hasAttribute('hidden')).toBe(true)
    }
  })

  test('Klick auf einen Reiter wechselt den Bereich', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: null, tokens: [GOBLIN] })
    await raumBetreten()

    // Referenzstand: `enter` genau einmal, aktuelle fetch-Zahl festhalten.
    await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1))
    const fetchVorher = (globalThis.fetch as jest.Mock).mock.calls.length

    await klickReiter('Tokens')

    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: 'Karte' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Karte' }).getAttribute('tabindex')).toBe('-1')

    const tokens = screen.getByRole('tabpanel', { name: 'Tokens' })
    within(tokens).getByRole('heading', { level: 2, name: 'Tokens' })
    within(tokens).getByRole('spinbutton', { name: 'Goblin HP' })
    expect(screen.getByRole('tabpanel', { name: 'Karte', hidden: true }).hasAttribute('hidden')).toBe(true)

    expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1)
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(fetchVorher)
  })

  test('Server-Update erhält den aktiven Reiter', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: null, tokens: [GOBLIN] })
    await raumBetreten()
    await klickReiter('Tokens')

    await act(async () => {
      socketMock.__emit('tokens', { sessionId: 's1', tokens: [ORK] })
    })
    await act(async () => {
      socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
    })

    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('aria-selected')).toBe('true')
    const tokens = screen.getByRole('tabpanel', { name: 'Tokens' })
    within(tokens).getByRole('spinbutton', { name: 'Ork HP' })
    expect(screen.getByRole('tabpanel', { name: 'Karte', hidden: true }).hasAttribute('hidden')).toBe(true)
  })

  test('Reiter Teilnehmer zeigt Liste und Alias', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', {
      map: null,
      participants: [
        { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true },
        { userId: 'u-sam', username: 'sam', role: 'spieler', online: true },
      ],
    })
    await raumBetreten()
    await klickReiter('Teilnehmer')

    const panel = screen.getByRole('tabpanel', { name: 'Teilnehmer' })
    within(panel).getByRole('heading', { level: 2, name: 'Teilnehmer' })
    const liste = within(panel).getByRole('list')
    within(liste).getByText(/meister/)
    within(liste).getByText(/sam/)
    within(panel).getByLabelText('Alias')
  })

  test('Reiter Tokens beim Spieler zeigt die Tokenwerte', async () => {
    const MEIN_GOBLIN = { ...GOBLIN, ownerId: 'u-selbst' }
    installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
    enterAck('spieler', 'geoeffnet', { map: AKTIVE_KARTE, tokens: [MEIN_GOBLIN] })
    await raumBetreten()
    await klickReiter('Tokens')

    const panel = screen.getByRole('tabpanel', { name: 'Tokens' })
    within(panel).getByRole('heading', { level: 2, name: 'Tokenwerte' })
    within(panel).getByText('Goblin')
    expect(within(panel).queryByRole('heading', { level: 2, name: 'Tokens' })).toBeNull()
  })
})

// --- Requirement: Tastaturbedienung der Reiter ----------------------------------------------

describe('Tastaturbedienung der Reiter', () => {
  test('Pfeil rechts bewegt den Fokus, Enter wählt aus', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: null })
    await raumBetreten()
    await klickReiter('Tokens')
    screen.getByRole('tab', { name: 'Tokens' }).focus()

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Tokens' }), { key: 'ArrowRight' })
    })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Karten & Nebel' }))
    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Karten & Nebel' }).getAttribute('aria-selected')).toBe('false')

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Karten & Nebel' }), { key: 'Enter' })
    })
    expect(screen.getByRole('tab', { name: 'Karten & Nebel' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Karten & Nebel' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('tabindex')).toBe('-1')
    within(screen.getByRole('tabpanel', { name: 'Karten & Nebel' })).getByRole('heading', { level: 2, name: 'Karten' })
  })

  test('Pfeil rechts am letzten Reiter springt zum ersten', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: null })
    await raumBetreten()
    await klickReiter('Teilnehmer')
    screen.getByRole('tab', { name: 'Teilnehmer' }).focus()

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Teilnehmer' }), { key: 'ArrowRight' })
    })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Karte' }))
    expect(screen.getByRole('tab', { name: 'Teilnehmer' }).getAttribute('aria-selected')).toBe('true')
  })

  test('Pfeil links, Home und End', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: null })
    await raumBetreten()
    screen.getByRole('tab', { name: 'Karte' }).focus()

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Karte' }), { key: 'ArrowLeft' })
    })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Teilnehmer' }))
    expect(screen.getByRole('tab', { name: 'Karte' }).getAttribute('aria-selected')).toBe('true')

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Teilnehmer' }), { key: 'Home' })
    })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Karte' }))
    expect(screen.getByRole('tab', { name: 'Karte' }).getAttribute('aria-selected')).toBe('true')

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Karte' }), { key: 'End' })
    })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Teilnehmer' }))
    expect(screen.getByRole('tab', { name: 'Karte' }).getAttribute('aria-selected')).toBe('true')
  })

  test('Leertaste wählt den fokussierten Reiter aus', async () => {
    installFetch(basis([{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' }]))
    enterAck('spieler', 'geoeffnet', { map: null })
    await raumBetreten()
    screen.getByRole('tab', { name: 'Karte' }).focus()

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Karte' }), { key: 'End' })
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Teilnehmer' }), { key: ' ' })
    })

    expect(screen.getByRole('tab', { name: 'Teilnehmer' }).getAttribute('aria-selected')).toBe('true')
    screen.getByRole('tabpanel', { name: 'Teilnehmer' })
    expect(screen.getByRole('tabpanel', { name: 'Karte', hidden: true }).hasAttribute('hidden')).toBe(true)
  })
})

// --- Requirement: Panel-Raster --------------------------------------------------------------

describe('Panel-Raster', () => {
  test('Panels tragen die Rasterklassen', async () => {
    spielleiterFetch()
    enterAck('spielleiter', 'geoeffnet', { map: AKTIVE_KARTE, fog: FOG_LEER, tokens: [GOBLIN] })
    await raumBetreten()

    // `Karte` aktiv: Gruppen `Fog of War` und `Messen & Zeichnen` tragen `panel`, die Buehne
    // traegt keine Inline-Hoehe.
    expect(screen.getByRole('group', { name: 'Fog of War' }).classList.contains('panel')).toBe(true)
    expect(screen.getByRole('group', { name: 'Messen & Zeichnen' }).classList.contains('panel')).toBe(true)
    const stage = document.querySelector('.map-stage')
    expect(stage).not.toBeNull()
    const stil = stage?.getAttribute('style') ?? ''
    expect(stil).not.toMatch(/height/)

    // Jedes Reiterpanel traegt `tab-panel`.
    for (const panel of screen.getAllByRole('tabpanel', { hidden: true })) {
      expect(panel.classList.contains('tab-panel')).toBe(true)
    }

    // `Tokens` geklickt: das Panel mit der Ueberschrift `Tokens` traegt `panel` und `panel--wide`.
    await klickReiter('Tokens')
    const tokensHeading = within(screen.getByRole('tabpanel', { name: 'Tokens' })).getByRole('heading', { level: 2, name: 'Tokens' })
    const tokensPanel = must(tokensHeading.closest('.panel'), 'das Panel der Token-Verwaltung')
    expect(tokensPanel.classList.contains('panel--wide')).toBe(true)
  })
})

// --- Requirement: Bibliothek und Einrichtung ------------------------------------------------

describe('Bibliothek und Einrichtung', () => {
  test('Cluster ist zugeklappt und enthält das Einhängen', async () => {
    spielleiterFetch(
      [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }],
      [
        { id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT },
        { id: 'm-keller', name: 'Keller', hasImage: false, grid: QUADRAT },
      ],
    )
    enterAck('spielleiter', 'geoeffnet', { map: null })
    await raumBetreten()
    await klickReiter('Karten & Nebel')

    const panel = screen.getByRole('tabpanel', { name: 'Karten & Nebel' })
    within(panel).getByRole('heading', { level: 2, name: 'Karten' })
    within(within(panel).getByRole('list')).getByText('Taverne')
    const keineKarte = within(panel).getByRole('button', { name: /keine karte anzeigen/i })

    const details = must(within(panel).getByText('Bibliothek & Einrichtung').closest('details'), 'das Cluster <details>')
    expect(details.hasAttribute('open')).toBe(false)
    const auswahl = within(details as HTMLElement).getByLabelText('Karte aus der Bibliothek')
    within(auswahl).getByRole('option', { name: 'Keller' })
    within(details as HTMLElement).getByRole('button', { name: /einhängen|einhaengen/i })
    within(details as HTMLElement).getByRole('button', { name: 'Kartenbibliothek öffnen' })

    // `Keine Karte anzeigen` liegt im Dokument vor dem Cluster.
    expect(keineKarte.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('Kartenbibliothek öffnen wechselt zur Bibliothek', async () => {
    spielleiterFetch(
      [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }],
      [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }],
    )
    enterAck('spielleiter', 'geoeffnet', { map: null })
    await raumBetreten()
    await klickReiter('Karten & Nebel')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kartenbibliothek öffnen' }))
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kartenbibliothek' })).toBeTruthy()
    expect(screen.queryByRole('tablist', { name: 'Bereiche' })).toBeNull()
  })
})
