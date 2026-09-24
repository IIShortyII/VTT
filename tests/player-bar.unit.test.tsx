/** @jest-environment jsdom */
// Komponententests zur neuen Capability `player-bar` aus
// openspec/changes/add-player-bar/specs/player-bar/spec.md (#98). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname, gruppiert per
// `describe` je Requirement. Das Stylesheet-Szenario „Leisten-Selektoren vorhanden" liegt in
// tests/player-bar-theme.unit.test.ts (reine Textpruefung, kein jsdom).
//
// Geprueft wird, *was* die Spieler-Raumansicht anbietet — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Adressen nach design.md D5: die Leiste
// `getByRole('group', { name: 'Sitzung' })`, Avatar/Verbindung `getByRole('img', { name })`,
// Name `getByRole('heading', { level: 1 })`, Trigger `getByRole('button', { name })`, Modals
// `getByRole('dialog', { name })`, Inhalt gescoped per `within`. Das Badge und seine
// Farbklasse (`badge`/`badge--gold`/`badge--teal`) tragen keine ARIA-Rolle — wie
// `token-card__hp-bar` in der Token-Suite werden sie ueber die Klasse am Trigger-Element
// gelesen; ebenso `<code>` (kein Role). `App` wird mit gemocktem `fetch`, gemockter Socket-
// und Canvas-Fassade gerendert (Muster der bestehenden Raum-Suiten session-token-ui/session-ui).
//
// Rote Phase (constitution.md §3.1): die Spieler-Leiste `PlayerBar` mit Avatar, Rollen-Pille,
// den drei Triggern, dem Tokens-Badge, der Verbindungsanzeige und den drei On-Demand-Modals
// existiert noch nicht; der Spieler traegt heute die gemeinsame Session-Bar und die
// Reiterliste. Die Szenarien scheitern an ihrer Assertion (fehlender Avatar/Trigger/Badge/
// Modal, fehlende Klasse), nicht an einem Setup-/Compile-Fehler.

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

// --- Mock der Canvas-Fassade (PixiJS laeuft nicht in jsdom) ---------------------------------
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
    centerOn: jest.fn(),
    destroy: jest.fn(),
  }
  return { createMapCanvas: jest.fn(async () => handle), __handle: handle }
})

// --- fetch-Mock (nach Pfad, wie session-ui) -------------------------------------------------

const originalFetch = globalThis.fetch
// Der angemeldete Spieler hat die `userId` `U` (Enter-Acknowledgement + Token-`ownerId`).
const NUTZER = { id: 'U', email: 'sam@example.com', username: 'sam' }
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
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
  ownerId: 'U' as string | null,
  hp: null as number | null,
  hpMax: null as number | null,
  tempHp: null as number | null,
  ac: null as number | null,
  initiative: null as number | null,
  conditions: [] as string[],
  shares: null as unknown,
}

const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING

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

/** Standard-fetch fuer einen Spieler: `auth/me` (userId U) und eine Sitzungskarte `Freitagsrunde`. */
function spielerFetch(status = 'gestartet'): void {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions', antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status, role: 'spieler' }]) },
  ])
}

/** Setzt das Enter-Acknowledgement fuer einen Spieler (kein Feld `code`, §9.2). */
function enterAck(
  status: string,
  extras: { name?: string; map?: unknown; tokens?: unknown[]; participants?: unknown[]; fog?: unknown } = {},
): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: extras.name ?? 'Freitagsrunde', status, role: 'spieler' },
    participants: extras.participants ?? [{ userId: 'U', username: 'sam', role: 'spieler', online: true }],
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

/** Rendert die Anwendung, betritt den Raum und wartet auf die Gruppe `Sitzung`. */
async function raumBetreten(): Promise<void> {
  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Sitzung' })
}

function leiste(): HTMLElement {
  return screen.getByRole('group', { name: 'Sitzung' })
}

/** Der Tokens-Trigger (Name beginnt mit `Tokens`, ggf. gefolgt von Badge-Zahl und `neue Werte`). */
function tokensTrigger(): HTMLElement {
  return within(leiste()).getByRole('button', { name: /^Tokens/ })
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- Requirement: Aufbau der Spieler-Leiste -------------------------------------------------

describe('Aufbau der Spieler-Leiste', () => {
  test('Leiste des Spielers trägt Identität, Zustand und drei Trigger', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet', { participants: [{ userId: 'U', username: 'sam', alias: 'Gandalf', role: 'spieler', online: true }] })
    await raumBetreten()

    const gruppe = leiste()
    // Name (Ebene 1), Rollen-Pille `Spieler` (chip), Zustandspille `Läuft` (status-pill).
    within(gruppe).getByRole('heading', { level: 1, name: 'Freitagsrunde' })
    expect(within(gruppe).getByText('Spieler').classList.contains('chip')).toBe(true)
    expect(within(gruppe).getByText('Läuft').closest('.status-pill')).not.toBeNull()

    // Die drei Trigger in dieser Reihenfolge und die Verbindungsanzeige.
    const tokens = tokensTrigger()
    const anmerkungen = within(gruppe).getByRole('button', { name: 'Anmerkungen' })
    const teilnehmer = within(gruppe).getByRole('button', { name: 'Teilnehmer' })
    within(gruppe).getByRole('img', { name: 'Verbindung aktiv' })
    expect(tokens.compareDocumentPosition(anmerkungen) & FOLLOWING).toBeTruthy()
    expect(anmerkungen.compareDocumentPosition(teilnehmer) & FOLLOWING).toBeTruthy()

    // Kein Avatar (#137): kein img mit dem Anzeigenamen; einziges img ist die Verbindungsanzeige.
    expect(within(gruppe).queryByRole('img', { name: 'Gandalf' })).toBeNull()
    const bilder = within(gruppe).getAllByRole('img')
    expect(bilder).toHaveLength(1)
    expect(bilder[0]).toBe(within(gruppe).getByRole('img', { name: 'Verbindung aktiv' }))

    // Keine Reiterliste, kein Code, keine Steuerungs-Schaltflaechen.
    expect(screen.queryByRole('tablist', { name: 'Bereiche' })).toBeNull()
    expect(gruppe.querySelector('code')).toBeNull()
    for (const name of ['Sitzungscode anzeigen', 'Sitzungscode kopieren', 'Umbenennen', 'Öffnen', 'Starten', 'Pausieren', 'Beenden']) {
      expect(within(gruppe).queryByRole('button', { name })).toBeNull()
    }

    // Die Gruppe `Sitzung` liegt im Dokument vor der Kartenansicht (Kartenhinweis).
    const caption = screen.getByText('Keine Karte aktiv')
    expect(gruppe.compareDocumentPosition(caption) & FOLLOWING).toBeTruthy()
  })
})

// --- Requirement: Verbindungsanzeige --------------------------------------------------------

describe('Verbindungsanzeige', () => {
  test('Verbindungsanzeige folgt der Trennung', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet')
    await raumBetreten()

    const aktiv = within(leiste()).getByRole('img', { name: 'Verbindung aktiv' })
    expect(aktiv.getAttribute('data-connected')).toBe('true')

    await act(async () => {
      socketMock.__emit('disconnect', 'transport close')
    })

    const getrennt = within(leiste()).getByRole('img', { name: 'Verbindung getrennt' })
    expect(getrennt.getAttribute('data-connected')).toBe('false')
  })
})

// --- Requirement: Tokens-Trigger und Badge --------------------------------------------------

describe('Tokens-Trigger und Badge', () => {
  test('Zwei zugewiesene Tokens zeigen das goldene Badge', async () => {
    const ORK = { ...GOBLIN, id: 't-ork', name: 'Ork', ownerId: 'U' }
    const DRACHE = { ...GOBLIN, id: 't-drache', name: 'Drache', ownerId: null }
    spielerFetch('gestartet')
    enterAck('gestartet', { tokens: [GOBLIN, ORK, DRACHE] })
    await raumBetreten()

    const badge = must(tokensTrigger().querySelector('.badge'), 'das Badge des Tokens-Triggers') as HTMLElement
    expect(badge.textContent).toContain('2')
    expect(badge.classList.contains('badge--gold')).toBe(true)
    expect(badge.classList.contains('badge--teal')).toBe(false)
  })

  test('Neu freigegebener Wert färbt das Badge teal bis zum Öffnen', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet', { tokens: [GOBLIN] })
    await raumBetreten()

    // GIVEN: Badge `1` gold, Modal geschlossen.
    const badgeVorher = must(tokensTrigger().querySelector('.badge'), 'das Badge des Tokens-Triggers') as HTMLElement
    expect(badgeVorher.textContent).toContain('1')
    expect(badgeVorher.classList.contains('badge--gold')).toBe(true)

    // WHEN: `session:tokens` liefert einen zuvor herausgefilterten Wert (null -> nicht null).
    await act(async () => {
      socketMock.__emit('tokens', { sessionId: 's1', tokens: [{ ...GOBLIN, hp: 18, hpMax: 24 }] })
    })

    // THEN: Badge `1` teal, der zugaengliche Name des Triggers enthaelt `neue Werte`.
    const badgeTeal = must(tokensTrigger().querySelector('.badge'), 'das Badge des Tokens-Triggers') as HTMLElement
    expect(badgeTeal.textContent).toContain('1')
    expect(badgeTeal.classList.contains('badge--teal')).toBe(true)
    expect(within(leiste()).getByRole('button', { name: /neue Werte/ })).toBeTruthy()

    // WHEN: der Trigger wird ausgeloest -> das Ereignis ist quittiert.
    await act(async () => {
      fireEvent.click(tokensTrigger())
    })

    // THEN: wieder gold, `neue Werte` verschwindet aus dem Namen.
    const badgeGold = must(tokensTrigger().querySelector('.badge'), 'das Badge des Tokens-Triggers') as HTMLElement
    expect(badgeGold.classList.contains('badge--gold')).toBe(true)
    expect(within(leiste()).queryByRole('button', { name: /neue Werte/ })).toBeNull()
  })

  test('Ein schon freigegebener Wert lässt das Badge gold', async () => {
    const GOBLIN_HP = { ...GOBLIN, hp: 20, hpMax: 40 }
    spielerFetch('gestartet')
    enterAck('gestartet', { tokens: [GOBLIN_HP] })
    await raumBetreten()

    // WHEN: ein bloss geaenderter, schon zuvor freigegebener Wert (nicht null -> nicht null).
    await act(async () => {
      socketMock.__emit('tokens', { sessionId: 's1', tokens: [{ ...GOBLIN_HP, hp: 10 }] })
    })

    // THEN: das Badge bleibt `1` und gold, nicht teal.
    const badge = must(tokensTrigger().querySelector('.badge'), 'das Badge des Tokens-Triggers') as HTMLElement
    expect(badge.textContent).toContain('1')
    expect(badge.classList.contains('badge--gold')).toBe(true)
    expect(badge.classList.contains('badge--teal')).toBe(false)
  })
})

// --- Requirement: On-Demand-Modals ----------------------------------------------------------

describe('On-Demand-Modals', () => {
  test('Tokens-Trigger öffnet das Tokenwerte-Modal', async () => {
    const MEIN_GOBLIN = { ...GOBLIN, hp: 23, hpMax: 40 }
    spielerFetch('gestartet')
    enterAck('gestartet', { map: AKTIVE_KARTE, fog: FOG_LEER, tokens: [MEIN_GOBLIN] })
    await raumBetreten()

    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => {
      fireEvent.click(tokensTrigger())
    })

    const dialog = await screen.findByRole('dialog', { name: 'Tokens' })
    within(dialog).getByRole('heading', { level: 2, name: 'Tokenwerte' })
    within(dialog).getByText('Goblin')
  })

  test('Anmerkungen-Trigger öffnet das Anmerkungs-Modal', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet', { map: AKTIVE_KARTE, fog: FOG_LEER })
    await raumBetreten()

    await act(async () => {
      fireEvent.click(within(leiste()).getByRole('button', { name: 'Anmerkungen' }))
    })

    const dialog = await screen.findByRole('dialog', { name: 'Anmerkungen' })
    within(dialog).getByRole('group', { name: 'Messen & Zeichnen' })
  })

  test('Anmerkungen-Trigger ist ohne aktive Karte gesperrt', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet', { map: null })
    await raumBetreten()

    expect((within(leiste()).getByRole('button', { name: 'Anmerkungen' }) as HTMLButtonElement).disabled).toBe(true)
    expect((tokensTrigger() as HTMLButtonElement).disabled).toBe(false)
    expect((within(leiste()).getByRole('button', { name: 'Teilnehmer' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('Teilnehmer-Trigger öffnet das Teilnehmer-Modal ohne Code', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet', {
      participants: [
        { userId: 'U', username: 'sam', role: 'spieler', online: true },
        { userId: 'm', username: 'meister', role: 'spielleiter', online: true },
      ],
    })
    await raumBetreten()

    await act(async () => {
      fireEvent.click(within(leiste()).getByRole('button', { name: 'Teilnehmer' }))
    })

    const dialog = await screen.findByRole('dialog', { name: 'Teilnehmer' })
    const eigene = must(within(dialog).getByText('sam').closest('article.participant-card') as HTMLElement | null, 'die Karte sam')
    within(dialog).getByText('meister')
    within(eigene).getByRole('button', { name: 'Alias ändern' })

    // Kein Einladen, kein Code, kein Kopieren (der Spieler hat keinen Code, §9.2).
    expect(within(dialog).queryByRole('button', { name: 'Einladen' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Sitzungscode kopieren' })).toBeNull()
    expect(dialog.querySelector('code')).toBeNull()
  })

  test('Alias ändern schließt das Teilnehmer-Modal und öffnet das Alias-Modal', async () => {
    spielerFetch('gestartet')
    enterAck('gestartet', { participants: [{ userId: 'U', username: 'sam', role: 'spieler', online: true }] })
    await raumBetreten()

    await act(async () => {
      fireEvent.click(within(leiste()).getByRole('button', { name: 'Teilnehmer' }))
    })
    const teilnehmerModal = await screen.findByRole('dialog', { name: 'Teilnehmer' })
    const eigene = must(within(teilnehmerModal).getByText('sam').closest('article.participant-card') as HTMLElement | null, 'die Karte sam')
    await act(async () => {
      fireEvent.click(within(eigene).getByRole('button', { name: 'Alias ändern' }))
    })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Teilnehmer' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Alias ändern' })).toBeTruthy()
  })
})

// --- Requirement: Spieler-Raumlayout --------------------------------------------------------

describe('Spieler-Raumlayout', () => {
  test('Karte ist dauerhaft sichtbar, Panels liegen hinter den Triggern', async () => {
    const MEIN_GOBLIN = { ...GOBLIN, hp: 12, hpMax: 20 }
    spielerFetch('gestartet')
    enterAck('gestartet', { map: AKTIVE_KARTE, fog: FOG_LEER, tokens: [MEIN_GOBLIN] })
    await raumBetreten()

    // Kartenhinweis und Buehne sind dauerhaft sichtbar.
    screen.getByText('Aktive Karte: Taverne')
    expect(document.querySelector('.map-stage')).not.toBeNull()

    // Ohne ausgeloesten Trigger keine Reiterliste, kein Tokenwerte-Panel, keine Anmerkungen,
    // keine Teilnehmerkarte.
    expect(screen.queryByRole('tablist', { name: 'Bereiche' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Tokenwerte' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Messen & Zeichnen' })).toBeNull()
    expect(document.querySelector('article.participant-card')).toBeNull()
  })

  test('Ohne aktive Karte zeigt der Spieler den Kartenhinweis und das Overlay im pausierten Zustand', async () => {
    spielerFetch('pausiert')
    enterAck('pausiert', { map: AKTIVE_KARTE, fog: FOG_LEER })
    await raumBetreten()

    const region = await screen.findByRole('region', { name: 'Pausiert' })
    expect(region.parentElement?.classList.contains('map-stage')).toBe(true)
    expect(screen.queryByRole('tablist', { name: 'Bereiche' })).toBeNull()
  })
})
