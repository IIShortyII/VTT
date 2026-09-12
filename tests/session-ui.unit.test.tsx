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
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- fetch-Mock (wie tests/auth-ui.unit.test.tsx) -------------------------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }

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

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
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

  // Abmeldung in der Top-Bar (ui-shell), nicht mehr in der Liste; Startansicht ohne Zurueck.
  const header = screen.getByRole('banner')
  expect(within(header).getByRole('button', { name: /abmelden/i })).toBeTruthy()
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

  const { container } = render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await screen.findByText(/ABC234/)
  expect(screen.getAllByText(/geoeffnet|geöffnet/i).length).toBeGreaterThan(0)
  // Beide Teilnehmer werden mit ihrem Nutzernamen benannt (keiner traegt einen Alias).
  expect(screen.getByText(/alrik/)).toBeTruthy()
  expect(screen.getByText(/borgil/)).toBeTruthy()
  // Anwesenheit muss unterscheidbar sein (Text, title oder aria-label — daher innerHTML).
  expect(container.innerHTML).toMatch(/online|anwesend/i)
  expect(container.innerHTML).toMatch(/offline|abwesend/i)
  // Erlaubte Uebergaenge in "geoeffnet": starten, beenden — nicht oeffnen/pausieren.
  expect(screen.getByRole('button', { name: /starten/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /beenden/i })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /öffnen|oeffnen/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /pausieren/i })).toBeNull()
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

  await waitFor(() => expect(screen.getAllByText(/gestartet/i).length).toBeGreaterThan(0))
  // Teilnehmer stehen in der Liste im Inhaltsbereich (main), nicht in der Top-Bar (banner).
  const main = screen.getByRole('main')
  expect(within(main).getByText(/\bleiter\b/)).toBeTruthy()
  expect(within(main).getByText(/\bich\b/)).toBeTruthy()
  // Kein Sitzungscode und keine Schaltflaeche fuer einen Zustandsuebergang.
  expect(screen.queryByText(/code/i)).toBeNull()
  expect(screen.queryByRole('button', { name: /starten|beenden|öffnen|oeffnen|pausieren/i })).toBeNull()
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

  const { container } = render(<App />)
  await screen.findByText(/Abendrunde/)
  await betreten()
  await waitFor(() => expect(container.innerHTML).toMatch(/geoeffnet|geöffnet/i))

  await act(async () => {
    socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
  })

  await waitFor(() => expect(container.innerHTML).toMatch(/gestartet/i))
  expect(container.innerHTML).not.toMatch(/geoeffnet|geöffnet/i)
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
  await screen.findByText(/Zustand: geoeffnet|Zustand: geöffnet/i)

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

  // Zustand und Anwesenheit folgen dem frischen Acknowledgement: `gestartet`, `meister` abwesend.
  await screen.findByText(/Zustand: gestartet/i)
  expect(screen.getByText(/\bmeister\b/)).toBeTruthy()
  expect(screen.getByText(/abwesend/i)).toBeTruthy()
})

test('Ersetzte Verbindung verbindet sich nicht neu', async () => {
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
  // die neue Automatik darf sie NICHT in ein erneutes Betreten uebersetzen (design.md D3,
  // Requirement "Sitzungsoberflaeche").
  await act(async () => {
    socketMock.__emit('replaced', { sessionId: 's1' })
    socketMock.__emit('disconnect', 'io server disconnect')
    socketMock.__emit('reconnect', undefined)
  })

  await waitFor(() => expect(screen.getByText(/an anderer stelle/i)).toBeTruthy())
  // Kein selbsttaetiger Wiederaufbau, kein erneutes Betreten (constitution.md §9.1, design.md D3):
  // `enter` genau einmal, kein weiteres `connect`.
  expect(socketMock.__facade.enter).toHaveBeenCalledTimes(1)
  expect(socketMock.__facade.connect.mock.calls.length).toBe(connectRufeVorher)
})

test('Beendete Spielsitzung führt zur Liste zurück', async () => {
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

  // Zurueck zur Sitzungsliste (Anker `Sitzung leiten`, `ui-start`) samt Hinweis.
  await waitFor(() => expect(screen.getByText(/beendet/i)).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy()
})

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
