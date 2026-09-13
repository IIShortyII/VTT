/** @jest-environment jsdom */
// Komponententests zur neuen Capability `ui-feedback` aus
// openspec/changes/add-toast-feedback/specs/ui-feedback/spec.md (#88). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Diese Datei traegt die Szenarien, die KEINEN direkten Import des noch fehlenden Toast-Moduls
// brauchen: die Auslöser im Raum (rendern `App` mit gemocktem `fetch`, gemockter Socket- und
// Canvas-Fassade nach dem Muster der Raum-Suiten) und das Stylesheet (liest `theme.css` als
// Text, wie tests/ui-theme.unit.test.ts). So bleibt die Datei ladbar und jedes Szenario wird an
// SEINER Assertion rot — nicht an einem nicht aufloesbaren Import. Die Provider-/Timer-/Ohne-
// Provider-Szenarien, die `ToastProvider`/`useToasts`/`TOAST_TTL_MS`/`TOAST_MAX` aus
// `src/client/ui/toast.tsx` importieren muessen, liegen in
// tests/ui-feedback-provider.unit.test.tsx (design.md D6: das Modul existiert noch nicht, der
// Import scheitert bis zur Implementierung — dort scheitern alle Provider-Szenarien gemeinsam
// am fehlenden Modul, ohne diese Datei mitzureissen).
//
// Elemente ausschliesslich ueber Testing-Library-Abfragen (`getByRole`, `getByLabelText`,
// `within`) und den Toast-Host `getByRole('status')` (design.md D6); keine `must()`-Helfer mit
// Kurzmeldung fuer Bedienelemente — die DOM-Ausgabe der Library ist das Gate-Feedback des
// implementers.
//
// Rote Phase (constitution.md §3.1): `App` ist noch nicht vom Toast-Provider umschlossen, es
// gibt kein `role="status"` und die Auslöser rufen keinen Toast; das Stylesheet kennt weder
// `.toast-host` noch `.toast` noch `@keyframes toast-in`. Die Szenarien scheitern an der
// fehlenden Rueckmeldung bzw. am fehlenden Selektor — der erwartete rote Grund.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'
import { setLocale } from '../src/client/i18n/locale.js'

// --- Mock der Socket-Fassade (Muster der Raum-Suiten) ---------------------------------------
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
    setFog: jest.Mock
    createFogArea: jest.Mock
    deleteFogArea: jest.Mock
    createAnnotation: jest.Mock
    deleteAnnotation: jest.Mock
    on: jest.Mock
  }
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
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

// --- fetch-Mock (nach Pfad und Methode, wie die Raum-Suiten) --------------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }
const QUADRAT = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }
const AKTIVE_KARTE = { instanceId: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }
const MAP = { instanceId: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT }
const FOG = { instanceId: 'i-tav', version: 0, revealed: [], areas: [] as unknown[] }

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

function instanzRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/sessions/s1/maps'), make }
}
function eigeneKartenRoute(make: () => Response): Route {
  return { method: 'GET', match: (u) => u.includes('/api/maps') && !u.includes('/image'), make }
}
function basis(role: 'spieler' | 'spielleiter', selbst: { id: string; username: string }): Route[] {
  return [
    { method: 'GET', match: (u) => u.includes('/api/auth/me'), make: () => antwort(200, { id: selbst.id, email: 'ich@example.com', username: selbst.username }) },
    {
      method: 'GET',
      match: (u) => /\/api\/sessions(\?|$)/.test(u) || u.endsWith('/api/sessions'),
      make: () => antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) }]),
    },
  ]
}

type EnterExtras = { map?: unknown; tokens?: unknown[]; annotations?: unknown[]; participants?: unknown[]; fog?: unknown }
function enterAck(role: 'spieler' | 'spielleiter', extras: EnterExtras = {}): void {
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role, ...(role === 'spielleiter' ? { code: 'ABC234' } : {}) },
    participants: extras.participants ?? [{ userId: NUTZER.id, username: 'ich', role, online: true }],
    map: 'map' in extras ? extras.map : null,
    tokens: extras.tokens ?? [],
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

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  calls = []
  localStorage.clear()
  setLocale('de')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  setLocale('de')
  jest.restoreAllMocks()
})

// --- Requirement: Auslöser im Raum ----------------------------------------------------------

test('Angelegtes Token wird gemeldet', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis('spielleiter', NUTZER),
  ])
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })
  socketMock.__facade.createToken.mockResolvedValue({ ok: true, token: { id: 't-goblin', name: 'Goblin' } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Goblin' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
  })

  const host = await screen.findByRole('status')
  await waitFor(() => expect(within(host).getByText('Token angelegt')).toBeTruthy())
}, 15000)

test('Abgelehntes Token zeigt keinen Toast', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis('spielleiter', NUTZER),
  ])
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })
  socketMock.__facade.createToken.mockResolvedValue({ ok: false, message: 'Kein Platz.' })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Goblin' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
  })

  // Die Ablehnung des Servers wird als Meldung sichtbar …
  expect(await screen.findByText('Kein Platz.')).toBeTruthy()
  // … und der Toast-Host bleibt leer (kein Toast bei einem abgelehnten Acknowledgement).
  const host = screen.getByRole('status')
  expect(within(host).queryByText('Token angelegt')).toBeNull()
  expect(host.children.length).toBe(0)
}, 15000)

test('Eingehängte Karte wird gemeldet', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-wald', name: 'Wald', hasImage: false, grid: QUADRAT }])),
    { method: 'POST', match: (u) => u.includes('/api/sessions/s1/maps'), make: () => antwort(201, { id: 'i-wald', mapId: 'm-wald', name: 'Wald', hasImage: false, grid: QUADRAT, position: 1 }) },
    ...basis('spielleiter', NUTZER),
  ])
  enterAck('spielleiter', { map: null })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  const auswahl = (await screen.findByLabelText('Karte aus der Bibliothek')) as HTMLSelectElement
  await act(async () => {
    fireEvent.change(auswahl, { target: { value: 'm-wald' } })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /einhängen|einhaengen/i }))
  })

  const host = await screen.findByRole('status')
  await waitFor(() => expect(within(host).getByText('Karte eingehängt')).toBeTruthy())
}, 15000)

test('Entfernte Anmerkung wird gemeldet', async () => {
  const a1 = {
    id: 'a1',
    instanceId: 'i-tav',
    kind: 'strecke',
    mode: 'gerastert',
    visibility: 'geteilt',
    color: null,
    authorId: 'u-selbst',
    points: [{ x: 35, y: 35 }, { x: 245, y: 35 }],
  }
  installFetch(basis('spieler', { id: 'u-selbst', username: 'sam' }))
  enterAck('spieler', {
    map: MAP,
    annotations: [a1],
    participants: [{ userId: 'u-selbst', username: 'sam', role: 'spieler', online: true }],
  })
  socketMock.__facade.deleteAnnotation.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  const eintrag = screen.getByText('Strecke: 3 Felder (4,5 m) · geteilt · sam').closest('li')
  expect(eintrag).not.toBeNull()
  await act(async () => {
    fireEvent.click(within(eintrag as HTMLElement).getByRole('button', { name: 'Entfernen' }))
  })

  const host = await screen.findByRole('status')
  await waitFor(() => expect(within(host).getByText('Anmerkung entfernt')).toBeTruthy())
})

test('Entfernte eigene Anmerkungen werden gemeldet', async () => {
  installFetch([
    instanzRoute(() => antwort(200, [{ id: 'i-tav', mapId: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm1', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis('spielleiter', NUTZER),
  ])
  enterAck('spielleiter', { map: MAP })
  socketMock.__facade.deleteAnnotation.mockResolvedValue({ ok: true })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()
  await screen.findByRole('group', { name: 'Messen & Zeichnen' })

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Meine entfernen' }))
  })

  const host = await screen.findByRole('status')
  await waitFor(() => expect(within(host).getByText('Anmerkungen entfernt')).toBeTruthy())
})

test('Toast-Text folgt der aktiven Sprache', async () => {
  // Den Raum in Deutsch betreten (die Chrome-Beschriftungen wie „Betreten" sind uebersetzt);
  // erst danach auf Englisch umschalten, sodass der Toast in der aktiven Sprache erscheint. Die
  // Rohstrings des Token-Panels (`Name`, `Anlegen`) bleiben bis Epic C unuebersetzt (proposal.md).
  installFetch([
    instanzRoute(() => antwort(200, [{ id: 'i-tav', mapId: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT, position: 1 }])),
    eigeneKartenRoute(() => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: QUADRAT }])),
    ...basis('spielleiter', NUTZER),
  ])
  enterAck('spielleiter', { map: AKTIVE_KARTE, tokens: [] })
  socketMock.__facade.createToken.mockResolvedValue({ ok: true, token: { id: 't-goblin', name: 'Goblin' } })

  render(<App />)
  await screen.findByText(/Freitagsrunde/)
  await betreten()

  await act(async () => {
    setLocale('en')
  })

  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Goblin' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
  })

  const host = await screen.findByRole('status')
  await waitFor(() => expect(within(host).getByText('Token created')).toBeTruthy())
  expect(within(host).queryByText('Token angelegt')).toBeNull()
}, 15000)

// --- Requirement: Stylesheet der Toasts -----------------------------------------------------
// Dieselben Textwerkzeuge wie tests/ui-theme.unit.test.ts (design.md D6): Kommentare entfernen,
// Whitespace normalisieren, `@media`-Bloecke per Klammerzaehlung.

const STYLESHEET = 'src/client/app/theme.css'
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)'

function readText(relPath: string): string {
  try {
    return readFileSync(resolve(process.cwd(), relPath), 'utf8')
  } catch {
    return ''
  }
}
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}
function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function selectorPresent(normalizedCss: string, selector: string): boolean {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  return re.test(normalizedCss)
}
function ruleBody(normalizedCss: string, selector: string): string | null {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  const idx = normalizedCss.search(re)
  if (idx < 0) return null
  const braceStart = normalizedCss.indexOf('{', idx)
  const braceEnd = normalizedCss.indexOf('}', braceStart)
  if (braceStart < 0 || braceEnd < 0) return null
  return normalizedCss.slice(braceStart + 1, braceEnd)
}

interface MediaBlock {
  query: string
  contentStart: number
  end: number
}
function mediaBlocks(strippedCss: string): MediaBlock[] {
  const blocks: MediaBlock[] = []
  const re = /@media([^{]*)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(strippedCss)) !== null) {
    const query = normalizeWs(m[1])
    let depth = 1
    let i = m.index + m[0].length
    for (; i < strippedCss.length && depth > 0; i++) {
      if (strippedCss[i] === '{') depth++
      else if (strippedCss[i] === '}') depth--
    }
    blocks.push({ query, contentStart: m.index + m[0].length, end: i })
  }
  return blocks
}

test('Toast-Selektoren vorhanden', () => {
  const normalized = normalizeWs(stripComments(readText(STYLESHEET)))

  expect(selectorPresent(normalized, '.toast-host')).toBe(true)
  expect(selectorPresent(normalized, '.toast')).toBe(true)
  const hostBody = ruleBody(normalized, '.toast-host')
  expect(hostBody).not.toBeNull()
  expect((hostBody ?? '').includes('position: fixed;')).toBe(true)
})

test('Einblenden nur im Bewegungsblock', () => {
  const stripped = stripComments(readText(STYLESHEET))
  const blocks = mediaBlocks(stripped)
  const motionBlocks = blocks.filter((b) => b.query === MOTION_QUERY)

  const keyframes = [...stripped.matchAll(/@keyframes\s+toast-in\b/gi)]
  const alleAnimationen = [...stripped.matchAll(/animation(-[a-z-]+)?\s*:/gi)]
  const animationenAusserhalb = alleAnimationen
    .filter((m) => !motionBlocks.some((b) => m.index! > b.contentStart && m.index! < b.end))
    .map((m) => normalizeWs(m[0]))
  const keyframeImBewegungsblock =
    keyframes.length === 1 && motionBlocks.some((b) => keyframes[0].index! > b.contentStart && keyframes[0].index! < b.end)

  expect({
    keyframeToastIn: keyframes.length,
    imBewegungsblock: keyframeImBewegungsblock,
    animationenAusserhalb,
  }).toEqual({
    keyframeToastIn: 1,
    imBewegungsblock: true,
    animationenAusserhalb: [],
  })
})
