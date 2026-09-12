/** @jest-environment jsdom */
// Komponententests zum Requirement "Anmerkungsansicht im Raum" aus
// openspec/changes/add-measure-draw/specs/session-annotation/spec.md (tasks.md 1.4). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname (19 Szenarien).
//
// Geprueft wird, *was* die Anwendung anbietet, anfordert und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). Drei Mock-Grenzen (design.md D7):
//  - die Socket-Fassade `src/client/session/socket.ts` mit aufzeichnenden
//    `createAnnotation`/`deleteAnnotation` (Standard `{ ok: true, annotation }` bzw.
//    `{ ok: true }`) und einem von aussen ausloesbaren `annotations`-Handler; das
//    `enter`-Acknowledgement traegt `map`, `tokens`, `fog` und `annotations`,
//  - die Canvas-Fassade `src/client/map/canvas.ts` — ueber den *aufloesbaren* Modulschluessel mit
//    `.js`-Endung; `createMapCanvas` zeichnet `options` (inkl. `tool`, `annotations`,
//    `annotationOptions`, `onAnnotationDrawn`) auf und liefert ein Handle mit
//    `setGrid`/`setImage`/`setTokens`/`setFog`/`setTool`/`setSelection`/`setAnnotations`/
//    `setAnnotationOptions`/`destroy`; kein Test importiert `pixi.js`,
//  - `fetch`, nach Pfad und Methode.
// Elemente ausschliesslich ueber getByRole/getByLabelText/getByText mit `within` fuer den
// Entfernen-Knopf eines Eintrags (D6-Schnittstellentabelle); keine `must()`-Helfer fuer
// Bedienelemente. `localStorage.clear()` in `beforeEach`.
//
// Rote Phase (tasks.md 1.4): `SessionRoom` kennt weder das Panel "Messen & Zeichnen" noch die
// Anmerkungen im Zustand noch die Fassaden-Methoden `setAnnotations`/`setAnnotationOptions`,
// und die Fassade kennt `createAnnotation`/`deleteAnnotation`/`on('annotations')` nicht. Die
// Szenarien scheitern daher am fehlenden Bedienelement/Aufruf — der erwartete rote Grund, kein
// Compile-/Setup-Fehler.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

type Pt = { x: number; y: number }

// --- Mock der Socket-Fassade (design.md D7) -------------------------------------------------
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
  __facade: {
    enter: jest.Mock
    activateMap: jest.Mock
    createAnnotation: jest.Mock
    deleteAnnotation: jest.Mock
    on: jest.Mock
  }
  __handlers: Record<string, (payload: unknown) => void>
  __emit: (event: string, payload: unknown) => void
  createSessionSocket: jest.Mock
}
const socketMock = sessionSocketModule as unknown as SocketTestApi

// --- Mock der Canvas-Fassade (design.md D7) -------------------------------------------------
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
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

type CanvasMock = {
  createMapCanvas: jest.Mock
  __handle: {
    setGrid: jest.Mock
    setImage: jest.Mock
    setTokens: jest.Mock
    setFog: jest.Mock
    setTool: jest.Mock
    setSelection: jest.Mock
    setAnnotations: jest.Mock
    setAnnotationOptions: jest.Mock
    destroy: jest.Mock
  }
}
const canvasMock = jest.requireMock('../src/client/map/canvas.js') as CanvasMock

/** Optionen, mit denen `createMapCanvas` zuletzt erzeugt wurde (2. Argument, design.md D4). */
function letzteCanvasOptions(): Record<string, unknown> {
  const calls = canvasMock.createMapCanvas.mock.calls
  if (calls.length === 0) throw new Error('createMapCanvas wurde nicht aufgerufen')
  return calls[calls.length - 1][1] as Record<string, unknown>
}
function onAnnotationDrawn(): (kind: string, points: Pt[]) => void {
  const fn = letzteCanvasOptions().onAnnotationDrawn
  if (typeof fn !== 'function') throw new Error('onAnnotationDrawn fehlt in den Canvas-Optionen')
  return fn as (kind: string, points: Pt[]) => void
}

// --- fetch-Mock (nach Pfad und Methode) -----------------------------------------------------

const originalFetch = globalThis.fetch
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
const MAP = { instanceId: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT }

type Call = { method: string; url: string; json?: Record<string, unknown> }
let calls: Call[] = []
type Route = { method: string; match: (url: string) => boolean; make: () => Response }

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Erwartet, aber nicht vorhanden: ${what}`)
  return value
}
function antwort(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
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
function instanzRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/sessions/s1/maps'), make }
}
function eigeneKartenRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/maps') && !u.includes('/image'), make }
}
function basis(role: 'spieler' | 'spielleiter', selbst: { id: string; username: string }): Route[] {
  return [
    { method: 'GET', match: (u) => u.includes('/api/auth/me'), make: () => antwort(200, { id: selbst.id, email: 'ich@example.com', username: selbst.username }) },
    { method: 'GET', match: (u) => /\/api\/sessions(\?|$)/.test(u) || u.endsWith('/api/sessions'), make: () => antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) }]) },
  ]
}
/** Vollstaendiger fetch-Aufbau; fuer den Spielleiter mit den Listen, die das MapPanel abfragt. */
function fetchFuer(role: 'spieler' | 'spielleiter', selbst: { id: string; username: string } = { id: 'u-selbst', username: 'ich' }): void {
  if (role === 'spieler') {
    installFetch(basis('spieler', selbst))
    return
  }
  installFetch([
    instanzRoute(() => antwort(200, [{ id: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis('spielleiter', selbst),
  ])
}

// --- Teilnehmer und Anmerkungen -------------------------------------------------------------

type Participant = { userId: string; username: string; alias?: string; role: 'spieler' | 'spielleiter'; online: boolean }
type Annotation = { id: string; instanceId: string; kind: string; mode: string; visibility: string; color: string | null; points: Pt[]; authorId: string | null }

function ann(fields: Partial<Annotation> & Pick<Annotation, 'id' | 'kind' | 'visibility' | 'authorId' | 'points'>): Annotation {
  return {
    instanceId: 'i-tav',
    mode: fields.kind === 'zeichnung' ? 'frei' : 'gerastert',
    color: fields.kind === 'zeichnung' ? 'rot' : null,
    ...fields,
  }
}

const FOG = { instanceId: 'i-tav', version: 0, revealed: [], areas: [] as unknown[] }

function enterAck(
  role: 'spieler' | 'spielleiter',
  extras: { map?: unknown; annotations?: Annotation[]; participants?: Participant[]; fog?: unknown },
): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: extras.participants ?? [{ userId: 'u-selbst', username: 'ich', role, online: true }],
    map: 'map' in extras ? extras.map : null,
    tokens: [],
    fog: 'fog' in extras ? extras.fog : role === 'spielleiter' ? FOG : null,
    annotations: extras.annotations ?? [],
  })
}

async function betreten(): Promise<void> {
  const knopf = (await screen.findAllByRole('button', { name: /betreten/i }))[0]
  await act(async () => {
    fireEvent.click(knopf)
  })
}
async function klick(name: string | RegExp, rolle: 'radio' | 'button' = 'radio'): Promise<void> {
  await act(async () => {
    fireEvent.click(await screen.findByRole(rolle, { name }))
  })
}
function radio(name: string): HTMLInputElement {
  return screen.getByRole('radio', { name }) as HTMLInputElement
}
/** Das `<li>` eines Listeneintrags ueber seinen Text — fuer `within` (D6). */
function eintrag(text: string): HTMLElement {
  const span = screen.getByText(text)
  return must(span.closest('li'), `das <li> zum Eintrag "${text}"`)
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  calls = []
  localStorage.clear()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- Bestand und Optionen an die Kartenansicht ----------------------------------------------

test('Raumansicht übergibt Bestand und Optionen an die Kartenansicht', async () => {
  const a1 = ann({ id: 'a1', kind: 'strecke', visibility: 'geteilt', authorId: 'u-sam', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] })
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP, annotations: [a1], participants: [{ userId: 'u-sam', username: 'sam', role: 'spieler', online: true }] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const opts = letzteCanvasOptions()
  expect(opts.tool).toBe('schwenken')
  expect(opts.annotationOptions).toEqual({ mode: 'gerastert', color: 'rot', unit: 'meter' })
  const annotations = opts.annotations as Annotation[]
  expect(annotations).toHaveLength(1)
  expect(annotations[0]).toMatchObject({ id: 'a1', kind: 'strecke', visibility: 'geteilt', authorId: 'u-sam' })
})

test('Spieler sieht das Panel', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  expect(radio('Bewegen').checked).toBe(true)
  for (const name of ['Strecke', 'Kreis', 'Winkel', 'Zeichnen']) expect(radio(name).checked).toBe(false)
  expect(radio('Gerastert').checked).toBe(true)
  expect(radio('Gerastert').disabled).toBe(true)
  expect(radio('Frei').disabled).toBe(true)
  expect(radio('Privat').checked).toBe(true)
  expect(radio('Rot').checked).toBe(true)
  for (const name of ['Rot', 'Orange', 'Gelb', 'Grün', 'Blau', 'Weiß']) expect(radio(name).disabled).toBe(true)
  expect(radio('Meter').checked).toBe(true)
  expect(screen.getByRole('button', { name: 'Meine entfernen' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Alle geteilten entfernen' })).toBeNull()
})

test('Spielleiter sieht zusätzlich die Sammelaktion für geteilte', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  expect(screen.getByRole('button', { name: 'Meine entfernen' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Alle geteilten entfernen' })).toBeTruthy()
})

test('Ohne aktive Karte kein Panel', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: null, fog: null })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByText('Keine Karte aktiv')

  expect(screen.queryByRole('radio', { name: 'Strecke' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Meine entfernen' })).toBeNull()
})

// --- Werkzeug, Modus, Farbe -----------------------------------------------------------------

test('Werkzeugwahl erreicht die Kartenansicht', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await klick('Strecke')

  await waitFor(() => expect(canvasMock.__handle.setTool).toHaveBeenCalledWith('strecke'))
  expect(radio('Strecke').checked).toBe(true)
  expect(radio('Bewegen').checked).toBe(false)
  expect(radio('Gerastert').disabled).toBe(false)
  expect(radio('Rot').disabled).toBe(true)
})

test('Mess- und Fog-Werkzeug teilen sich den Zustand', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await klick('Aufdecken')
  await klick('Strecke')
  expect(radio('Aufdecken').checked).toBe(false)
  await klick('Schwenken')

  expect(canvasMock.__handle.setTool.mock.calls.map((c) => c[0])).toEqual(['aufdecken', 'strecke', 'schwenken'])
  expect(radio('Bewegen').checked).toBe(true)
  expect(radio('Strecke').checked).toBe(false)
})

test('Zeichnen aktiviert die Farbwahl', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await klick('Zeichnen')

  await waitFor(() => expect(canvasMock.__handle.setTool).toHaveBeenCalledWith('zeichnung'))
  expect(radio('Rot').disabled).toBe(false)
  expect(radio('Gerastert').disabled).toBe(true)
})

// --- Gesten melden, Anwendung sendet --------------------------------------------------------

test('Gemessene Strecke wird gesendet', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await klick('Strecke')
  await klick('Frei')
  await klick('Geteilt')

  await act(async () => {
    onAnnotationDrawn()('strecke', [{ x: 10, y: 20 }, { x: 160, y: 120 }])
  })

  await waitFor(() =>
    expect(socketMock.__facade.createAnnotation).toHaveBeenCalledWith('s1', {
      kind: 'strecke',
      mode: 'frei',
      visibility: 'geteilt',
      color: null,
      points: [{ x: 10, y: 20 }, { x: 160, y: 120 }],
    }),
  )
  // Der angezeigte Bestand aendert sich erst mit `session:annotations` (constitution.md §9.1).
  for (const call of canvasMock.__handle.setAnnotations.mock.calls) {
    expect(call[0] as Annotation[]).toEqual([])
  }
})

test('Gerasterte Messung wird eingerastet gesendet', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await klick('Kreis')

  await act(async () => {
    onAnnotationDrawn()('kreis', [{ x: 100, y: 100 }, { x: 250, y: 30 }])
  })

  await waitFor(() =>
    expect(socketMock.__facade.createAnnotation).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ kind: 'kreis', mode: 'gerastert', points: [{ x: 105, y: 105 }, { x: 245, y: 35 }] }),
    ),
  )
})

test('Zeichnung wird mit Farbe gesendet', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await klick('Zeichnen')
  await klick('Blau')

  await act(async () => {
    onAnnotationDrawn()('zeichnung', [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }])
  })

  await waitFor(() =>
    expect(socketMock.__facade.createAnnotation).toHaveBeenCalledWith('s1', {
      kind: 'zeichnung',
      mode: 'frei',
      visibility: 'privat',
      color: 'blau',
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }],
    }),
  )
})

// --- Bestand folgt dem Server und Liste -----------------------------------------------------

test('Bestand folgt dem Server', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP, annotations: [], participants: [{ userId: 'u-sam', username: 'sam', role: 'spieler', online: true }] })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const a1 = ann({ id: 'a1', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-sam', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] })
  await act(async () => {
    socketMock.__emit('annotations', { sessionId: 's1', annotations: [a1] })
  })

  await waitFor(() => expect(canvasMock.__handle.setAnnotations).toHaveBeenCalled())
  const letzte = canvasMock.__handle.setAnnotations.mock.calls.at(-1)?.[0] as Annotation[]
  expect(letzte).toHaveLength(1)
  expect(letzte[0]).toMatchObject({ id: 'a1', kind: 'strecke', authorId: 'u-sam' })
  expect(screen.getByText('Strecke: 3 Felder (4,5 m) · geteilt · sam')).toBeTruthy()
})

test('Liste zeigt Art, Etikett, Sichtbarkeit und Urheber', async () => {
  const teilnehmer: Participant[] = [
    { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true },
    { userId: 'u-sam', username: 'sam', role: 'spieler', online: true },
  ]
  const annotations: Annotation[] = [
    ann({ id: 'a1', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-sam', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] }),
    ann({ id: 'a2', kind: 'kreis', mode: 'gerastert', visibility: 'privat', authorId: 'u-selbst', points: [{ x: 35, y: 35 }, { x: 175, y: 35 }] }),
    ann({ id: 'a3', kind: 'winkel', mode: 'frei', visibility: 'geteilt', authorId: 'u-sam', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }),
    ann({ id: 'a4', kind: 'zeichnung', visibility: 'privat', authorId: 'u-selbst', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }] }),
  ]
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, annotations, participants: teilnehmer })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  const gruppe = await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  const liste = within(gruppe).getByRole('list')
  const eintraege = within(liste).getAllByRole('listitem').map((li) => (li.textContent ?? '').replace(/Entfernen$/, '').trim())
  expect(eintraege).toEqual([
    'Strecke: 3 Felder (4,5 m) · geteilt · sam',
    'Kreis: r 2 Felder (3 m) · ⌀ 4 Felder (6 m) · privat · meister',
    'Winkel: 45° · geteilt · sam',
    'Zeichnung · privat · meister',
  ])
})

test('Entfernen nur wo erlaubt', async () => {
  const teilnehmer: Participant[] = [
    { userId: 'u-selbst', username: 'sam', role: 'spieler', online: true },
    { userId: 'u-meister', username: 'meister', role: 'spielleiter', online: true },
  ]
  const annotations: Annotation[] = [
    ann({ id: 'a1', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-selbst', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] }),
    ann({ id: 'a2', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-meister', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] }),
  ]
  fetchFuer('spieler', { id: 'u-selbst', username: 'sam' })
  enterAck('spieler', { map: MAP, annotations, participants: teilnehmer })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  expect(within(eintrag('Strecke: 3 Felder (4,5 m) · geteilt · sam')).queryByRole('button', { name: 'Entfernen' })).toBeTruthy()
  expect(within(eintrag('Strecke: 3 Felder (4,5 m) · geteilt · meister')).queryByRole('button', { name: 'Entfernen' })).toBeNull()
})

test('Spielleiter darf fremde geteilte entfernen', async () => {
  const teilnehmer: Participant[] = [
    { userId: 'u-selbst', username: 'meister', role: 'spielleiter', online: true },
    { userId: 'u-sam', username: 'sam', role: 'spieler', online: true },
  ]
  const annotations: Annotation[] = [
    ann({ id: 'a1', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-sam', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] }),
  ]
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP, annotations, participants: teilnehmer })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  expect(within(eintrag('Strecke: 3 Felder (4,5 m) · geteilt · sam')).getByRole('button', { name: 'Entfernen' })).toBeTruthy()
})

// --- Absichten senden -----------------------------------------------------------------------

test('Entfernen sendet die Absicht', async () => {
  const teilnehmer: Participant[] = [{ userId: 'u-selbst', username: 'sam', role: 'spieler', online: true }]
  const a1 = ann({ id: 'a1', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-selbst', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] })
  fetchFuer('spieler', { id: 'u-selbst', username: 'sam' })
  enterAck('spieler', { map: MAP, annotations: [a1], participants: teilnehmer })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  const li = eintrag('Strecke: 3 Felder (4,5 m) · geteilt · sam')
  await act(async () => {
    fireEvent.click(within(li).getByRole('button', { name: 'Entfernen' }))
  })

  await waitFor(() => expect(socketMock.__facade.deleteAnnotation).toHaveBeenCalledWith('s1', { kind: 'eine', annotationId: 'a1' }))
  // Bis session:annotations eintrifft, bleibt der Eintrag gelistet (constitution.md §9.1).
  expect(screen.getByText('Strecke: 3 Felder (4,5 m) · geteilt · sam')).toBeTruthy()
})

test('Sammelaktionen senden die Absicht', async () => {
  fetchFuer('spielleiter')
  enterAck('spielleiter', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  await klick('Meine entfernen', 'button')
  await klick('Alle geteilten entfernen', 'button')

  const aufrufe = socketMock.__facade.deleteAnnotation.mock.calls
  expect(aufrufe[0]).toEqual(['s1', { kind: 'meine' }])
  expect(aufrufe[1]).toEqual(['s1', { kind: 'geteilte' }])
})

// --- Einheit und Fehlermeldung --------------------------------------------------------------

test('Einheit umschalten wirkt sofort und wird gemerkt', async () => {
  const teilnehmer: Participant[] = [{ userId: 'u-sam', username: 'sam', role: 'spieler', online: true }]
  const a1 = ann({ id: 'a1', kind: 'strecke', mode: 'gerastert', visibility: 'geteilt', authorId: 'u-sam', points: [{ x: 35, y: 35 }, { x: 245, y: 35 }] })
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP, annotations: [a1], participants: teilnehmer })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByText('Strecke: 3 Felder (4,5 m) · geteilt · sam')

  await klick('Fuß')

  await waitFor(() => expect(screen.getByText('Strecke: 3 Felder (15 ft) · geteilt · sam')).toBeTruthy())
  expect(canvasMock.__handle.setAnnotationOptions).toHaveBeenCalledWith({ mode: 'gerastert', color: 'rot', unit: 'fuss' })
  expect(localStorage.getItem('vtt.distanceUnit')).toBe('fuss')
})

test('Einheit wird aus dem Browser übernommen', async () => {
  localStorage.setItem('vtt.distanceUnit', 'fuss')
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  expect(radio('Fuß').checked).toBe(true)
  expect((letzteCanvasOptions().annotationOptions as { unit: string }).unit).toBe('fuss')
})

test('Abgelehntes Anlegen wird angezeigt', async () => {
  fetchFuer('spieler')
  enterAck('spieler', { map: MAP })
  socketMock.__facade.createAnnotation.mockResolvedValue({ ok: false, message: 'Keine Karte aktiv.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  await klick('Strecke')

  await act(async () => {
    onAnnotationDrawn()('strecke', [{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })

  expect(await screen.findByText('Keine Karte aktiv.')).toBeTruthy()
  for (const call of canvasMock.__handle.setAnnotations.mock.calls) {
    expect(call[0] as Annotation[]).toEqual([])
  }
})
