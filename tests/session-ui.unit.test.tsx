/** @jest-environment jsdom */
// Komponententests zum Requirement "Sitzungsoberfläche" aus
// openspec/changes/add-game-session/specs/game-session/spec.md und den Deltas
// openspec/changes/add-username-and-alias/specs/game-session/spec.md (#45) sowie
// openspec/changes/reenter-room-after-reconnect/specs/game-session/spec.md (#46; tasks.md 1.1/1.2).
// Ein Test je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anbietet und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). `fetch` ist gemockt (`/api/auth/me` liefert
// einen Nutzer, `/api/sessions` die Liste). Die Socket-Fassade
// `src/client/session/socket.ts` ist per `jest.mock` ersetzt; Server-Ereignisse werden durch
// Aufruf der registrierten Handler ausgeloest (design.md D10/D11).
//
// Ab #45 tragen Teilnehmer `username`/`alias` statt `email`; benannt wird ueber `displayName`
// (Alias, sonst Nutzername). Ab #46 meldet die Fassade eine Wiederverbindung als eigenes
// Ereignis `reconnect` (Handler ohne Argument) ueber denselben Handler-Mechanismus wie
// `participants` oder `replaced` (design.md D2).
//
// add-start-view (#86, tasks.md 1.2): Die Startansicht zeigt die Spielsitzungen als Karten mit
// Beschriftung (`Spielleiter`/`Geschlossen`) statt Rohwerten; Erstellen- und Beitreten-Formular
// erscheinen erst auf Anforderung (`Sitzung leiten` / `Beitreten`). Zwei Szenarien sind darauf
// umgestellt; die Rueckkehr zur Liste wird am Anker `Sitzung leiten` erkannt.
//
// add-ui-text-keys (#87, MODIFIED game-session): Die Raumansicht zeigt den Zustand als
// Zustandspille (`Geöffnet`/`Läuft` … mit `closest('.status-pill')`) statt als Rohwert
// `Zustand: geoeffnet`, und die Uebergangs-Schaltflaechen tragen die Verben `Starten`/`Beenden`
// statt der Aktionsnamen `starten`/`beenden`. Die Raumansicht wird an der Ueberschrift der Ebene
// 1 (Sitzungsname) erkannt; kein Textknoten traegt mehr den Rohwert (design.md D8). Vier
// Szenarien sind darauf umgestellt (Testnamen bleiben); die Suite importiert das i18n-Modul
// nicht — die Szenarien laufen in der Standardsprache Deutsch.
//
// add-toast-feedback (#88, MODIFIED game-session): Neben dem Sitzungscode bietet die Raumansicht
// dem Spielleiter eine Schaltfläche `Kopieren`; einem Spieler nicht. Gelingt das Kopieren, löst
// die Anwendung den Toast `Sitzungscode kopiert` im Toast-Host (`role="status"`, `ui-feedback`)
// aus; scheitert die Zwischenablage, erscheint kein Toast. Die beiden Raumansicht-Szenarien sind
// um die An-/Abwesenheit der Schaltfläche ergaenzt; zwei neue Szenarien pruefen Kopieren und
// Scheitern (Zwischenablage-Ersatz per `Object.defineProperty`, design.md D6).
//
// add-ui-status (#91, MODIFIED "Sitzungsoberfläche" + ADDED "Verbindungs- und Sitzungszustand
// im Raum"): `session:replaced` und `session:ended` erscheinen als `alertdialog` (`ui-dialog`)
// mit definierten Schliesswegen (Esc, `Schließen`, Timer 4 s); ein `disconnect`-Ereignis der
// Fassade zeigt ein Zustandsbanner (`ui-status`, `role="status"`, Klasse `status-banner`), eine
// gemeldete Wiederverbindung entfernt es und loest den Toast `Verbindung wiederhergestellt` aus;
// ein Spieler sieht in `pausiert`/`geoeffnet` ein Karten-Overlay (`ui-status`, Rolle `region`).
// Die Szenarien "Ersetzte Verbindung verbindet sich nicht neu" und "Beendete Spielsitzung führt
// zur Liste zurück" aendern ihre Erwartung (Namen bleiben). Fuer die Overlay-Szenarien ist die
// Canvas-Fassade gemockt (jsdom hat kein WebGL).
//
// Rote Phase (constitution.md §3.1): `SessionRoom` verdrahtet `disconnect` nicht, rendert weder
// Banner noch Overlay, und `replaced`/`ended` sind kein `alertdialog`. Die neuen/geaenderten
// Szenarien scheitern an ihrer Assertion (fehlendes Element/Verhalten), kein Setup-Fehler.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade ----------------------------------------------------------------
// Die Fassade ist die Mock-Grenze (design.md D10). `createSessionSocket` liefert ein Objekt mit
// connect/disconnect/enter/transition/alias/on; `on` merkt sich die Handler, `__emit` ruft sie
// auf.
jest.mock('../src/client/session/socket.js', () => {
  const handlers: Record<string, (payload: unknown) => void> = {}
  const facade = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    enter: jest.fn(),
    transition: jest.fn(),
    alias: jest.fn(),
    rename: jest.fn(),
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

// --- Mock der Canvas-Fassade (add-ui-status #91) --------------------------------------------
// Die Overlay-Szenarien rendern einen Raum mit aktiver Karte; `MapCanvas` laedt `./canvas.js`
// dynamisch. Ohne Mock zoege das `pixi.js` in die Testumgebung (jsdom hat kein WebGL). Das
// Handle traegt alle Setter der Fassade. Fuer alle uebrigen Szenarien (ohne Karte) ist der Mock
// inert — `createMapCanvas` wird dort nie aufgerufen.
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
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

type CanvasMock = { createMapCanvas: jest.Mock }
const canvasMock = jest.requireMock('../src/client/map/canvas.js') as CanvasMock

// --- fetch-Mock (wie tests/auth-ui.unit.test.tsx) -------------------------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }
// Eine aktive Karte fuer die Overlay-Szenarien (#91); die Canvas-Fassade ist gemockt.
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
const AKTIVE_KARTE = { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }
const FOG_LEER = { instanceId: 'i-tav', version: 0, revealed: [], areas: [] }

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

// Eingabefelder werden ueber Bedeutung gesucht (name/id/aria-label/placeholder), nicht ueber
// eine bestimmte Beschriftung — wie in tests/auth-ui.unit.test.tsx.
function nameFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector(
    'input[name="name"], input#name, input[name="sessionName"], input[aria-label*="ame" i], input[placeholder*="ame" i]',
  )
}

function codeFeld(container: HTMLElement): HTMLElement | null {
  return container.querySelector(
    'input[name="code"], input#code, input[aria-label*="ode" i], input[placeholder*="ode" i]',
  )
}

// Das Alias-Eingabefeld der eigenen Zeile (#45, design.md D6). Die Spec verlangt „ein
// Eingabefeld fuer den Alias" ohne Attributvorgabe; die zugaengliche Standardform ist ein per
// <label> zugeordnetes Feld. Zuerst ueber die Beschriftung (Text „Alias") suchen, sonst auf
// die bisherigen Selektoren zurueckfallen.
function aliasFeld(container: HTMLElement): HTMLElement | null {
  const perLabel = screen.queryByLabelText(/alias/i)
  if (perLabel) return perLabel as HTMLElement
  return container.querySelector(
    'input[name="alias"], input#alias, input[aria-label*="lias" i], input[placeholder*="lias" i]',
  )
}

// Der Toast-Host (`ui-feedback`) traegt `role="status"` UND die Klasse `toast-host`; das
// Zustandsbanner (`ui-status`) traegt ebenfalls `role="status"`, aber die Klasse
// `status-banner`. Unterschieden wird ueber die Klasse (design.md D9).
function toastHost(): HTMLElement {
  const host = screen.getAllByRole('status').find((el) => el.classList.contains('toast-host'))
  return must(host, 'der Toast-Host (role=status, Klasse toast-host)')
}

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

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Runde', status: 'geoeffnet', role: 'spieler' },
    participants: [],
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.useRealTimers()
  jest.restoreAllMocks()
})

// --- Szenarien ------------------------------------------------------------------------------

test('Sitzungsliste mit Erstellen und Beitreten', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geschlossen', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])

  const { container } = render(<App />)

  await screen.findByText(/Freitagsrunde/)
  // Die Karte zeigt Rolle und Zustand als Beschriftung (`ui-start`, „Sitzungskarten"), nicht als
  // Rohwert des Servers.
  expect(screen.getByText('Spielleiter')).toBeTruthy()
  expect(screen.getByText('Geschlossen')).toBeTruthy()

  // Die Aktionen `Sitzung leiten` und `Beitreten` sind vorhanden; die Formulare erscheinen erst
  // auf Anforderung (`ui-start`, „Erstellen und Beitreten auf Anforderung").
  const sitzungLeiten = screen.getByRole('button', { name: 'Sitzung leiten' })
  expect(screen.getByRole('button', { name: 'Beitreten' })).toBeTruthy()

  // Das Namensfeld erscheint erst nach Auslösen von `Sitzung leiten`.
  expect(nameFeld(container)).toBeNull()
  await act(async () => {
    fireEvent.click(sitzungLeiten)
  })
  expect(nameFeld(container)).not.toBeNull()

  // Das Codefeld erscheint erst nach Auslösen von `Beitreten`.
  expect(codeFeld(container)).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Beitreten' }))
  })
  expect(codeFeld(container)).not.toBeNull()

  // Abmeldung liegt im Kontomenue der Top-Bar (ui-shell, „Top-Bar“): aussen nur die
  // Menue-Schaltflaeche mit dem Nutzernamen, keine Schaltflaeche `Abmelden`; Startansicht ohne Zurueck.
  const header = screen.getByRole('banner')
  const konto = within(header).getByRole('button', { name: 'ich' })
  expect(konto.getAttribute('aria-haspopup')).toBe('menu')
  expect(within(header).queryByRole('button', { name: /abmelden/i })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull()
})

test('Raumansicht des Spielleiters', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [
      { userId: 'u-a', username: 'alrik', role: 'spieler', online: true },
      { userId: 'u-b', username: 'borgil', role: 'spieler', online: false },
    ],
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  // Anker: die Bar (Gruppe `Sitzung`) mit dem Namen als Ueberschrift der Ebene 1.
  const bar = await screen.findByRole('group', { name: 'Sitzung' })
  within(bar).getByRole('heading', { level: 1, name: 'Freitagsrunde' })

  // Zustandspille `Geöffnet` (Klasse `status-pill`).
  expect(screen.getByText('Geöffnet').closest('.status-pill')).not.toBeNull()

  // MODIFIED (#93): Sitzungscode maskiert (`••••••`) mit Auge-Umschalter `Sitzungscode
  // anzeigen` (`aria-pressed="false"`) und `Sitzungscode kopieren`; kein Klartext `ABC234`.
  expect(screen.getByText('••••••')).toBeTruthy()
  const umschalter = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  expect(umschalter.getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: 'Sitzungscode kopieren' })).toBeTruthy()
  expect(screen.queryByText(/ABC234/)).toBeNull()

  // MODIFIED (#94): unter der Gruppe die Reiterliste `Bereiche` mit den vier Reitern des
  // Spielleiters (game-session-Delta „Raumansicht des Spielleiters"). Die Teilnehmerliste liegt
  // jetzt im Reiter `Teilnehmer` und wird in diesem Szenario nicht mehr geprueft.
  const reiterliste = screen.getByRole('tablist', { name: 'Bereiche' })
  expect(within(reiterliste).getAllByRole('tab').map((r) => r.textContent)).toEqual([
    'Karte',
    'Tokens',
    'Karten & Nebel',
    'Teilnehmer',
  ])

  // MODIFIED (#93): alle vier Uebergaenge gerendert; in `geoeffnet` sind `Starten`/`Beenden`
  // frei, `Öffnen`/`Pausieren` gesperrt (disabled, nicht ausgeblendet).
  const oeffnen = screen.getByRole('button', { name: 'Öffnen' }) as HTMLButtonElement
  const starten = screen.getByRole('button', { name: 'Starten' }) as HTMLButtonElement
  const pausieren = screen.getByRole('button', { name: 'Pausieren' }) as HTMLButtonElement
  const beenden = screen.getByRole('button', { name: 'Beenden' }) as HTMLButtonElement
  expect(starten.disabled).toBe(false)
  expect(beenden.disabled).toBe(false)
  expect(oeffnen.disabled).toBe(true)
  expect(pausieren.disabled).toBe(true)

  // Kein Textknoten traegt den Rohwert des Zustands oder den Aktionsnamen.
  expect(screen.queryByText('geoeffnet')).toBeNull()
  expect(screen.queryByText('starten')).toBeNull()
  expect(screen.queryByText('beenden')).toBeNull()
})

test('Raumansicht des Spielers', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
    participants: [
      { userId: 'u-sl', username: 'leiter', role: 'spielleiter', online: true },
      { userId: 'u-selbst', username: 'ich', role: 'spieler', online: true },
    ],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()

  // Gruppe `Sitzung` mit Name als Ueberschrift der Ebene 1; Zustandspille `Läuft`.
  const bar = await screen.findByRole('group', { name: 'Sitzung' })
  within(bar).getByRole('heading', { level: 1, name: 'Abendrunde' })
  const pille = screen.getByText('Läuft').closest('.status-pill')
  expect(pille).not.toBeNull()
  expect(pille?.classList.contains('status-pill--active')).toBe(true)

  // MODIFIED (#94): darunter die Reiterliste `Bereiche` mit den drei Reitern des Spielers
  // (kein Reiter `Karten & Nebel`); die Teilnehmerliste liegt jetzt im Reiter `Teilnehmer`.
  const reiterliste = screen.getByRole('tablist', { name: 'Bereiche' })
  expect(within(reiterliste).getAllByRole('tab').map((r) => r.textContent)).toEqual(['Karte', 'Tokens', 'Teilnehmer'])
  expect(within(reiterliste).queryByRole('tab', { name: 'Karten & Nebel' })).toBeNull()

  // MODIFIED (#93): einem Spieler weder Maske noch Umschalter, Kopieren, Umbenennen oder ein
  // Uebergang.
  expect(screen.queryByText('••••••')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sitzungscode anzeigen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sitzungscode kopieren' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Umbenennen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Öffnen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Starten' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Pausieren' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Beenden' })).toBeNull()

  // Kein Textknoten traegt den Rohwert des Zustands.
  expect(screen.queryByText('gestartet')).toBeNull()
})

test('Sitzungscode wird kopiert', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
  })
  // Zwischenablage bestaetigt das Schreiben (design.md D10). `navigator.clipboard` fehlt in
  // jsdom, daher per `Object.defineProperty` einsetzen und danach wiederherstellen.
  const writeText = jest.fn().mockResolvedValue(undefined)
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })

  try {
    render(<App />)
    await screen.findByText(/Freitagsrunde/)
    await betreten()
    await screen.findByRole('group', { name: 'Sitzung' })

    // MODIFIED (#93): der Code ist maskiert (`••••••`); `Sitzungscode kopieren` kopiert ohne
    // Aufdecken.
    expect(screen.getByText('••••••')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sitzungscode kopieren' }))
    })

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC234'))
    await waitFor(() => expect(within(toastHost()).getByText('Sitzungscode kopiert')).toBeTruthy())
    expect(screen.getByText('••••••')).toBeTruthy()
    expect(screen.queryByText(/ABC234/)).toBeNull()
  } finally {
    Object.defineProperty(globalThis.navigator, 'clipboard', original ?? { value: undefined, configurable: true })
  }
})

test('Gescheitertes Kopieren zeigt keinen Toast', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
  })
  // Die Zwischenablage lehnt das Schreiben ab.
  const writeText = jest.fn().mockRejectedValue(new Error('Zwischenablage nicht verfügbar'))
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })

  try {
    render(<App />)
    await screen.findByText(/Freitagsrunde/)
    await betreten()
    await screen.findByRole('group', { name: 'Sitzung' })

    // MODIFIED (#93): `Sitzungscode kopieren` ausloesen, die Zwischenablage lehnt ab.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sitzungscode kopieren' }))
    })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC234'))
    // Mikrotasks abfliessen lassen, damit ein faelschlicher Toast Zeit haette zu erscheinen.
    await act(async () => {
      await Promise.resolve()
    })

    // Kein Toast im Toast-Host, die Ansicht bleibt maskiert.
    expect(toastHost().children.length === 0).toBe(true)
    expect(screen.getByText('••••••')).toBeTruthy()
  } finally {
    Object.defineProperty(globalThis.navigator, 'clipboard', original ?? { value: undefined, configurable: true })
  }
})

test('Sitzungscode-Popover zeigt den Klartext', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
  })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Sitzung' })

  // MODIFIED (#93): GIVEN die Maske `••••••` steht, der Auge-Umschalter ist nicht gedrueckt.
  const umschalter = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  const code = screen.getByLabelText('Sitzungscode')
  expect(code.textContent).toBe('••••••')
  expect(umschalter.getAttribute('aria-pressed')).toBe('false')

  // WHEN: den Umschalter ausloesen.
  await act(async () => {
    fireEvent.click(umschalter)
  })

  // THEN: das `<code>`-Element zeigt den Klartext, keine Maske, `aria-pressed="true"`, kein
  // Element der Rolle `dialog`.
  expect(screen.getByLabelText('Sitzungscode').textContent).toBe('ABC234')
  expect(screen.queryByText('••••••')).toBeNull()
  expect(umschalter.getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('dialog')).toBeNull()

  // Erneutes Ausloesen maskiert wieder.
  await act(async () => {
    fireEvent.click(umschalter)
  })
  expect(screen.getByLabelText('Sitzungscode').textContent).toBe('••••••')
  expect(screen.queryByText(/ABC234/)).toBeNull()
  expect(umschalter.getAttribute('aria-pressed')).toBe('false')
})

test('Zustand folgt dem Server', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // GIVEN: die Raumansicht eines Spielers zeigt die Zustandspille `Geöffnet`.
  await screen.findByRole('heading', { level: 1, name: 'Abendrunde' })
  expect(screen.getByText('Geöffnet').closest('.status-pill')).not.toBeNull()

  await act(async () => {
    socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
  })

  // THEN: die Pille `Läuft` mit `status-pill--active`; kein Rohwert als Textknoten.
  const pille = (await screen.findByText('Läuft')).closest('.status-pill')
  expect(pille).not.toBeNull()
  expect(pille?.classList.contains('status-pill--active')).toBe(true)
  expect(screen.queryByText('gestartet')).toBeNull()
  expect(screen.queryByText('geoeffnet')).toBeNull()
})

test('Wiederverbindung betritt den Raum erneut', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  // Zwei vorbereitete Acknowledgements (design.md D5): das erste beim Oeffnen des Raums, das
  // zweite auf die gemeldete Wiederverbindung hin — mit anderem Zustand und anderer Anwesenheit,
  // damit der frische Server-Stand beobachtbar ist (§9.1).
  socketMock.__facade.enter
    .mockResolvedValueOnce({
      ok: true,
      session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
      participants: [
        { userId: 'u-selbst', username: 'ich', role: 'spieler', online: true },
        { userId: 'u-meister', username: 'meister', role: 'spielleiter', online: true },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
      participants: [
        { userId: 'u-selbst', username: 'ich', role: 'spieler', online: true },
        { userId: 'u-meister', username: 'meister', role: 'spielleiter', online: false },
      ],
    })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // Anker: die Raumansicht ist gerendert, Zustandspille `Geöffnet`.
  await screen.findByRole('heading', { level: 1, name: 'Abendrunde' })
  expect(screen.getByText('Geöffnet').closest('.status-pill')).not.toBeNull()

  // Die Socket-Fassade meldet eine Wiederverbindung (Ereignis `reconnect`, Handler ohne
  // Argument) ueber denselben Mechanismus wie die uebrigen Server-Ereignisse (design.md D2).
  await act(async () => {
    socketMock.__emit('reconnect', undefined)
  })

  // Erneutes Betreten ueber dieselbe Fassade: `enter` genau zweimal mit der `sessionId` des
  // Raums, genau eine erzeugte Fassade, genau ein `connect` (design.md D2/D3, §9.1 — keine
  // neue Verbindung).
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(2))
  expect(socketMock.__facade.enter).toHaveBeenNthCalledWith(1, 's1')
  expect(socketMock.__facade.enter).toHaveBeenNthCalledWith(2, 's1')
  expect(socketMock.createSessionSocket).toHaveBeenCalledTimes(1)
  expect(socketMock.__facade.connect).toHaveBeenCalledTimes(1)

  // Zustand und Anwesenheit folgen dem frischen Acknowledgement: Pille `Läuft`, `meister` abwesend.
  await screen.findByText('Läuft')
  expect(screen.getByText(/\bmeister\b/)).toBeTruthy()
  expect(screen.getByText(/abwesend/i)).toBeTruthy()
})

test('Ersetzte Verbindung verbindet sich nicht neu', async () => {
  // MODIFIED (add-ui-status #91): `session:replaced` erscheint als `alertdialog` (`ui-dialog`)
  // mit Titel `An anderer Stelle geöffnet`, Beschreibung und den Schaltflaechen `Hier
  // weiterspielen`/`Zur Übersicht`; die Raumansicht bleibt dahinter gerendert; solange ersetzt,
  // erscheint KEIN Zustandsbanner (der Server hat bewusst getrennt), und es wird weder neu
  // verbunden noch neu betreten (§9.1, design.md D3).
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1))

  const connectRufeVorher = socketMock.__facade.connect.mock.calls.length

  // Nach `replaced` und der Trennung meldet die Fassade zusaetzlich eine Wiederverbindung —
  // die neue Automatik darf sie NICHT in ein erneutes Betreten uebersetzen (design.md D3).
  await act(async () => {
    socketMock.__emit('replaced', { sessionId: 's1' })
    socketMock.__emit('disconnect', 'io server disconnect')
    socketMock.__emit('reconnect', undefined)
  })

  const dialog = await screen.findByRole('alertdialog', { name: 'An anderer Stelle geöffnet' })
  expect(within(dialog).getByText('Diese Spielsitzung wurde an anderer Stelle geöffnet.')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Hier weiterspielen' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Zur Übersicht' })).toBeTruthy()
  // Die Raumansicht bleibt dahinter gerendert (Ueberschrift der Ebene 1 mit dem Namen).
  expect(screen.getByRole('heading', { level: 1, name: 'Abendrunde' })).toBeTruthy()
  // Kein Zustandsbanner, obwohl getrennt wurde.
  expect(screen.queryByText('Verbindung vom Server getrennt.')).toBeNull()
  expect(screen.queryByText('Verbindung unterbrochen — verbinde neu…')).toBeNull()
  // Kein selbsttaetiger Wiederaufbau, kein erneutes Betreten (§9.1): `enter` genau einmal,
  // kein weiteres `connect`.
  expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1)
  expect(socketMock.__facade.connect.mock.calls.length).toBe(connectRufeVorher)
})

test('Beendete Spielsitzung führt zur Liste zurück', async () => {
  // MODIFIED (add-ui-status #91): `session:ended` erscheint als `alertdialog` mit Titel
  // `Sitzung beendet`, Beschreibung und der Schaltflaeche `Zur Übersicht`; erst deren Ausloesen
  // fuehrt zur Liste mit dem Hinweis `Die Spielsitzung wurde beendet.` (design.md D4).
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalled())

  await act(async () => {
    socketMock.__emit('ended', { sessionId: 's1' })
  })

  // Nach `session:ended` zuerst der Dialog `Sitzung beendet` …
  const dialog = await screen.findByRole('alertdialog', { name: 'Sitzung beendet' })
  expect(within(dialog).getByText('Die Spielleitung hat die Sitzung beendet. Du wirst zur Übersicht geleitet.')).toBeTruthy()
  const knopf = within(dialog).getByRole('button', { name: 'Zur Übersicht' })

  await act(async () => {
    fireEvent.click(knopf)
  })

  // … danach die Sitzungsliste (Anker `Sitzung leiten`) samt Hinweis.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy())
  expect(screen.getByText('Die Spielsitzung wurde beendet.')).toBeTruthy()
})

// --- Ersetzt- und Sitzungsende-Dialog: Schliesswege und Timer (add-ui-status #91) -----------

test('Hier weiterspielen baut eine neue Verbindung auf', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1))

  // GIVEN: nach `session:replaced` und der Trennung zeigt die Ansicht den Dialog.
  await act(async () => {
    socketMock.__emit('replaced', { sessionId: 's1' })
    socketMock.__emit('disconnect', 'io server disconnect')
  })
  const dialog = await screen.findByRole('alertdialog', { name: 'An anderer Stelle geöffnet' })

  // WHEN: `Hier weiterspielen`.
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hier weiterspielen' }))
  })

  // THEN: kein Dialog mehr, eine zweite Fassade, ein zweites `connect`, `session:enter` ein
  // zweites Mal mit der `sessionId`; die Ueberschrift der Ebene 1 ist wieder da.
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(socketMock.createSessionSocket).toHaveBeenCalledTimes(2)
  expect(socketMock.__facade.connect).toHaveBeenCalledTimes(2)
  expect(socketMock.__facade.enter).toHaveBeenNthCalledWith(1, 's1')
  expect(socketMock.__facade.enter).toHaveBeenNthCalledWith(2, 's1')
  expect(screen.getByRole('heading', { level: 1, name: 'Abendrunde' })).toBeTruthy()
})

test('Zur Übersicht verlässt den ersetzten Raum', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1))

  await act(async () => {
    socketMock.__emit('replaced', { sessionId: 's1' })
    socketMock.__emit('disconnect', 'io server disconnect')
  })
  const dialog = await screen.findByRole('alertdialog', { name: 'An anderer Stelle geöffnet' })

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zur Übersicht' }))
  })

  await waitFor(() => expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy())
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1)
})

test('Esc verlässt den ersetzten Raum', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1))

  await act(async () => {
    socketMock.__emit('replaced', { sessionId: 's1' })
    socketMock.__emit('disconnect', 'io server disconnect')
  })
  await screen.findByRole('alertdialog', { name: 'An anderer Stelle geöffnet' })

  await act(async () => {
    fireEvent.keyDown(document, { key: 'Escape' })
  })

  await waitFor(() => expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy())
  expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1)
})

test('Sitzungsende leitet nach vier Sekunden weiter', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalled())

  // GIVEN: falsche Timer gelten ab jetzt (der Raum ist bereits betreten, echte Timer waren
  // nur fuer `findBy` noetig).
  jest.useFakeTimers()

  // WHEN: `session:ended`.
  await act(async () => {
    socketMock.__emit('ended', { sessionId: 's1' })
  })

  // Vor Ablauf (3999 ms) bleibt der Dialog und die Ueberschrift der Ebene 1.
  act(() => {
    jest.advanceTimersByTime(3999)
  })
  expect(screen.getByRole('alertdialog', { name: 'Sitzung beendet' })).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1, name: 'Abendrunde' })).toBeTruthy()

  // Eine weitere Millisekunde → Sitzungsliste samt Hinweis.
  act(() => {
    jest.advanceTimersByTime(1)
  })
  expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy()
  expect(screen.getByText('Die Spielsitzung wurde beendet.')).toBeTruthy()
})

test('Schließen des Sitzungsende-Dialogs führt zur Übersicht', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'gestartet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalled())

  jest.useFakeTimers()
  await act(async () => {
    socketMock.__emit('ended', { sessionId: 's1' })
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Sitzung beendet' })

  // WHEN: `Schließen` (das X von `ui-dialog`) und danach 4000 ms.
  act(() => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  })
  act(() => {
    jest.advanceTimersByTime(4000)
  })

  // THEN: die Sitzungsliste mit genau einem Element der Rolle `alert` und dem Hinweis.
  expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy()
  const alerts = screen.getAllByRole('alert')
  expect(alerts).toHaveLength(1)
  expect(alerts[0].textContent).toContain('Die Spielsitzung wurde beendet.')
})

// --- ADDED: Verbindungs- und Sitzungszustand im Raum (add-ui-status #91) ---------------------

test('Verbindungsabbruch zeigt das Zustandsbanner', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await screen.findByRole('heading', { level: 1, name: 'Abendrunde' })

  await act(async () => {
    socketMock.__emit('disconnect', 'transport close')
  })

  const banner = screen.getByText('Verbindung unterbrochen — verbinde neu…')
  const region = banner.closest('[role="status"]')
  expect(region).not.toBeNull()
  expect(region?.classList.contains('status-banner')).toBe(true)
  expect(screen.getByRole('heading', { level: 1, name: 'Abendrunde' })).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('Wiederverbindung entfernt das Banner und zeigt den Toast', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await screen.findByRole('heading', { level: 1, name: 'Abendrunde' })

  // GIVEN: nach `disconnect` (`transport close`) zeigt die Ansicht das Banner.
  await act(async () => {
    socketMock.__emit('disconnect', 'transport close')
  })
  expect(screen.getByText('Verbindung unterbrochen — verbinde neu…')).toBeTruthy()

  // WHEN: die Fassade meldet eine Wiederverbindung.
  await act(async () => {
    socketMock.__emit('reconnect', undefined)
  })

  // THEN: kein Banner mehr, der Toast `Verbindung wiederhergestellt`, `enter` genau zweimal.
  await waitFor(() => expect(socketMock.__facade.enter).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Verbindung unterbrochen — verbinde neu…')).toBeNull()
  expect(screen.queryByText('Verbindung vom Server getrennt.')).toBeNull()
  await waitFor(() => expect(within(toastHost()).getByText('Verbindung wiederhergestellt')).toBeTruthy())
})

test('Trennung durch den Server zeigt das Banner ohne Wiederverbindungsversprechen', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await screen.findByRole('heading', { level: 1, name: 'Abendrunde' })

  await act(async () => {
    socketMock.__emit('disconnect', 'io server disconnect')
  })

  const banner = screen.getByText('Verbindung vom Server getrennt.')
  const region = banner.closest('[role="status"]')
  expect(region).not.toBeNull()
  expect(region?.classList.contains('status-banner')).toBe(true)
  expect(screen.queryByText('Verbindung unterbrochen — verbinde neu…')).toBeNull()
})

test('Trennung durch den Client zeigt kein Banner', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await screen.findByRole('heading', { level: 1, name: 'Abendrunde' })

  await act(async () => {
    socketMock.__emit('disconnect', 'io client disconnect')
  })

  expect(screen.queryByText('Verbindung unterbrochen — verbinde neu…')).toBeNull()
  expect(screen.queryByText('Verbindung vom Server getrennt.')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: 'Abendrunde' })).toBeTruthy()
})

test('Pausierte Sitzung zeigt dem Spieler das Overlay', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'pausiert', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'pausiert', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: AKTIVE_KARTE,
    fog: FOG_LEER,
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()

  const region = await screen.findByRole('region', { name: 'Pausiert' })
  expect(region.classList.contains('map-overlay')).toBe(true)
  expect(within(region).getByText('Die Spielleitung hat die Sitzung angehalten.')).toBeTruthy()
  expect(region.parentElement?.classList.contains('map-stage')).toBe(true)
}, 15000)

test('Nicht gestartete Sitzung zeigt dem Spieler das Overlay', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: AKTIVE_KARTE,
    fog: FOG_LEER,
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()

  const region = await screen.findByRole('region', { name: 'Noch nicht gestartet' })
  expect(within(region).getByText('Die Spielleitung hat die Sitzung noch nicht gestartet.')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Pausiert' })).toBeNull()
}, 15000)

test('Spielleiter sieht kein Overlay', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: '/api/sessions/s1/maps', antwort: antwort(200, []) },
    { pfad: '/api/maps', antwort: antwort(200, []) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'pausiert', role: 'spielleiter', code: 'ABC234' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'pausiert', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }],
    map: AKTIVE_KARTE,
    fog: FOG_LEER,
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()

  // Die Kartenansicht ist gerendert (die gemockte Fassade wurde erzeugt) …
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  // … aber der Spielleiter sieht kein Overlay (kein Element der Rolle `region`).
  expect(screen.queryByRole('region', { name: 'Pausiert' })).toBeNull()
  expect(screen.queryByRole('region')).toBeNull()
}, 15000)

test('Start entfernt das Overlay', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'pausiert', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'pausiert', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    map: AKTIVE_KARTE,
    fog: FOG_LEER,
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // GIVEN: das Overlay `Pausiert` liegt ueber der Karte.
  await screen.findByRole('region', { name: 'Pausiert' })

  // WHEN: `session:status` mit `gestartet`.
  await act(async () => {
    socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
  })

  // THEN: kein Overlay mehr, die Zustandspille zeigt `Läuft`.
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Pausiert' })).toBeNull())
  expect(screen.queryByRole('region')).toBeNull()
  expect(screen.getByText('Läuft').closest('.status-pill')).not.toBeNull()
}, 15000)

// --- Alias in der Raumansicht (#45) ---------------------------------------------------------

test('Teilnehmer werden mit Alias oder Nutzername benannt', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [
      { userId: 'u-a', username: 'sam', alias: 'Gandalf der Graue', role: 'spieler', online: true },
      { userId: 'u-b', username: 'meister', role: 'spielleiter', online: true },
    ],
  })

  render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // MODIFIED (#94): Teilnehmerliste liegt im Reiter `Teilnehmer` (session-tabs, Testaufbau-Konvention).
  await aktiviereReiter('Teilnehmer')

  await waitFor(() => expect(screen.getByText(/Gandalf der Graue/)).toBeTruthy())
  // Der Teilnehmer mit Alias wird mit dem Alias benannt, der ohne Alias mit dem Nutzernamen …
  expect(screen.getByText(/\bmeister\b/)).toBeTruthy()
  // … und der Nutzername des Alias-Traegers erscheint nicht.
  expect(screen.queryByText(/\bsam\b/)).toBeNull()
})

test('Eigener Alias wird als Absicht gesendet und folgt dem Server', async () => {
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'sam', role: 'spieler', online: true }],
  })
  socketMock.__facade.alias.mockResolvedValue({ ok: true, alias: 'Gandalf' })

  const { container } = render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // MODIFIED (#94): Alias-Formular liegt im Reiter `Teilnehmer` (session-tabs, Testaufbau-Konvention).
  await aktiviereReiter('Teilnehmer')
  await waitFor(() => expect(screen.getByText(/\bsam\b/)).toBeTruthy())

  const feld = must(aliasFeld(container), 'ein Alias-Eingabefeld in der eigenen Zeile')
  fireEvent.change(feld, { target: { value: 'Gandalf' } })
  await act(async () => {
    fireEvent.submit(must(feld.closest('form'), 'ein <form> um das Alias-Feld'))
  })

  // Die Anwendung sendet die Absicht an den Server (design.md D6) …
  await waitFor(() => expect(socketMock.__facade.alias).toHaveBeenCalledWith('s1', 'Gandalf'))
  // … zeigt den Nutzer aber weiterhin als `sam`, bis der Server die Liste aktualisiert (§9.1).
  expect(screen.getByText(/\bsam\b/)).toBeTruthy()

  await act(async () => {
    socketMock.__emit('participants', {
      sessionId: 's1',
      participants: [{ userId: 'u-selbst', username: 'sam', alias: 'Gandalf', role: 'spieler', online: true }],
    })
  })

  // Nach der Server-Liste wird er als `Gandalf` benannt.
  await waitFor(() => expect(screen.getByText(/Gandalf/)).toBeTruthy())
  expect(screen.queryByText(/\bsam\b/)).toBeNull()
})

test('Abgelehnter Alias wird angezeigt', async () => {
  const ABLEHNUNG = 'Dieser Alias ist ungültig.'
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Abendrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'sam', role: 'spieler', online: true }],
  })
  socketMock.__facade.alias.mockResolvedValue({ ok: false, message: ABLEHNUNG })

  const { container } = render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  // MODIFIED (#94): Alias-Formular und Fehlermeldung liegen im Reiter `Teilnehmer` (session-tabs).
  await aktiviereReiter('Teilnehmer')
  await waitFor(() => expect(screen.getByText(/\bsam\b/)).toBeTruthy())

  const feld = must(aliasFeld(container), 'ein Alias-Eingabefeld in der eigenen Zeile')
  fireEvent.change(feld, { target: { value: 'Gandalf' } })
  await act(async () => {
    fireEvent.submit(must(feld.closest('form'), 'ein <form> um das Alias-Feld'))
  })

  // Die Meldung des Servers wird angezeigt …
  await waitFor(() => expect(screen.getAllByText(ABLEHNUNG).length).toBeGreaterThan(0))
  // … und die Teilnehmerliste ist unveraendert (weiterhin `sam`, kein `Gandalf`).
  expect(screen.getByText(/\bsam\b/)).toBeTruthy()
  expect(screen.queryByText(/Gandalf/)).toBeNull()
})
