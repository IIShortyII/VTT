/** @jest-environment jsdom */
// Komponenten- und Modultests zum neuen Capability `ui-text` aus
// openspec/changes/add-ui-text-keys/specs/ui-text/spec.md (13 Szenarien). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname: zwei zu
// „Wörterbücher und Textschlüssel", sechs zu „Sprachwahl", vier zu „Sprachschalter in der
// Top-Bar", eins zum „Stylesheet des Sprachschalters".
//
// Geprueft wird, *was* die Anwendung anbietet und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Adressen ausschliesslich nach design.md D8:
// Testing-Library-Abfragen ueber Rolle/Name/Label (`getByRole`, `getByLabelText`, `within`),
// die Sprachschalter-Gruppe `Sprache`/`Language` im `<header>` (`banner`), die Zustandspille
// ueber ihren Text und `closest('.status-pill')`, das `<html lang>` ueber
// `document.documentElement`, die gespeicherte Wahl ueber `localStorage.getItem('vtt.locale')`.
// `App` wird ohne Props gerendert; `fetch`, Socket- und Canvas-Fassade sind nach dem Muster der
// bestehenden Auth-/Sitzungs-/Shell-/Start-Tests gemockt (Helfer dort dupliziert). Vor jedem
// Szenario `localStorage.clear()` und `setLocale('de')` — das Modul haelt die Sprache ueber
// Tests derselben Datei hinweg (design.md D8).
//
// Rote Phase: das i18n-Fundament (`src/client/i18n/de.ts`, `en.ts`, `locale.ts`), der
// Sprachschalter und die umgestellten Ansichten existieren noch nicht — der Import von
// `de.js`/`en.js`/`locale.js` schlaegt fehl, die Suite scheitert am Laden. Das ist rot aus dem
// richtigen Grund (fehlende Module, constitution.md §3.1), nicht ein Setup-/Tippfehler.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// --- Mock der Socket-Fassade (wie tests/session-ui.unit.test.tsx) ---------------------------
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

// --- Mock der PixiJS-Fassade (wie tests/ui-shell.unit.test.tsx) ------------------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = { setGrid: jest.fn(), setImage: jest.fn(), destroy: jest.fn() }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

import * as sessionSocketModule from '../src/client/session/socket.js'
import { App } from '../src/client/app/App.js'
import { de } from '../src/client/i18n/de.js'
import { en } from '../src/client/i18n/en.js'
import { setLocale, t } from '../src/client/i18n/locale.js'

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

// --- fetch-Mock (wie tests/ui-shell.unit.test.tsx) ------------------------------------------

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

// Normalisiert Textknoten fuer den exakten Footer-Vergleich (mehrere Textknoten aus
// `Version {version} · Build {sha}`).
function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

const MITTELPUNKT = '·'

const ANMELDEN_401 = { pfad: '/api/auth/me', antwort: antwort(401, { message: 'nicht angemeldet' }) }

// Der Sprachschalter liegt im `<header>` (`banner`). Seine Gruppe traegt in der aktiven Sprache
// den Namen `Sprache` bzw. `Language` (design.md D8).
function spracheGruppe(name: string): HTMLElement {
  return within(screen.getByRole('banner')).getByRole('group', { name })
}

function schalterKnopf(name: string): HTMLButtonElement {
  return within(screen.getByRole('banner')).getByRole('button', { name }) as HTMLButtonElement
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(socketMock.__handlers)) delete socketMock.__handlers[key]
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spieler' },
    participants: [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
  })
  localStorage.clear()
  setLocale('de')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.restoreAllMocks()
})

// --- Requirement: Wörterbücher und Textschlüssel --------------------------------------------

test('Beide Wörterbücher tragen dieselben Schlüssel', () => {
  const deKeys = Object.keys(de).sort()
  const enKeys = Object.keys(en).sort()
  expect(enKeys).toEqual(deKeys)

  for (const wert of [...Object.values(de), ...Object.values(en)]) {
    expect(typeof wert).toBe('string')
    expect((wert as string).length).toBeGreaterThanOrEqual(1)
  }
})

test('Platzhalter werden ersetzt', () => {
  // Aktive Sprache Deutsch (beforeEach `setLocale('de')`); `shell.footer` traegt zwei Platzhalter.
  expect(t('shell.footer', { version: '1.2.3', sha: 'abc1234' })).toBe(`Version 1.2.3 ${MITTELPUNKT} Build abc1234`)
})

// --- Requirement: Sprachwahl ----------------------------------------------------------------

test('Ohne gespeicherte Wahl gilt Deutsch', async () => {
  localStorage.removeItem('vtt.locale')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  expect(screen.getByRole('heading', { level: 2, name: 'Anmelden' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Noch kein Konto? Registrieren' })).toBeTruthy()
  expect(screen.getByText('Deine Runde')).toBeTruthy()
  expect(document.documentElement.getAttribute('lang')).toBe('de')
  expect(localStorage.getItem('vtt.locale')).toBeNull()
})

test('Gespeicherte Wahl gilt beim Start', async () => {
  localStorage.setItem('vtt.locale', 'en')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  expect(await screen.findByRole('heading', { level: 2, name: 'Sign in' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'No account yet? Register' })).toBeTruthy()
  expect(screen.getByText('Your party')).toBeTruthy()
  expect(document.documentElement.getAttribute('lang')).toBe('en')
  expect(screen.queryByText('Anmelden')).toBeNull()
})

test('Ungültige gespeicherte Wahl fällt auf Deutsch zurück', async () => {
  localStorage.setItem('vtt.locale', 'fr')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  expect(screen.getByRole('heading', { level: 2, name: 'Anmelden' })).toBeTruthy()
  expect(document.documentElement.getAttribute('lang')).toBe('de')
})

test('Umschalten auf Englisch wirkt sofort und wird gespeichert', async () => {
  localStorage.removeItem('vtt.locale')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())
  // GIVEN: ohne gespeicherte Wahl zeigt die Anwendung `Anmelden`.
  expect(screen.getByRole('heading', { level: 2, name: 'Anmelden' })).toBeTruthy()

  // WHEN: der Besucher loest `English` aus.
  await act(async () => {
    fireEvent.click(schalterKnopf('English'))
  })

  // THEN: ohne Neuladen erscheinen die englischen Texte, das `<html>` traegt `lang="en"`, und
  // die Wahl ist gespeichert.
  expect(screen.getByRole('heading', { level: 2, name: 'Sign in' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'No account yet? Register' })).toBeTruthy()
  expect(screen.getByLabelText('Email')).toBeTruthy()
  expect(screen.getByLabelText('Password')).toBeTruthy()
  expect(screen.getByText('Your party')).toBeTruthy()
  expect(screen.queryByText('Anmelden')).toBeNull()
  expect(document.documentElement.getAttribute('lang')).toBe('en')
  expect(localStorage.getItem('vtt.locale')).toBe('en')
})

test('Zurück auf Deutsch', async () => {
  localStorage.removeItem('vtt.locale')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())
  // GIVEN: die aktive Sprache ist Englisch (Ueberschrift `Sign in`).
  await act(async () => {
    fireEvent.click(schalterKnopf('English'))
  })
  expect(screen.getByRole('heading', { level: 2, name: 'Sign in' })).toBeTruthy()

  // WHEN: der Besucher loest `Deutsch` aus.
  await act(async () => {
    fireEvent.click(schalterKnopf('Deutsch'))
  })

  // THEN: die deutschen Texte kehren zurueck, `<html lang="de">`, Wahl `de` gespeichert.
  expect(screen.getByRole('heading', { level: 2, name: 'Anmelden' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Noch kein Konto? Registrieren' })).toBeTruthy()
  expect(screen.queryByText('Sign in')).toBeNull()
  expect(document.documentElement.getAttribute('lang')).toBe('de')
  expect(localStorage.getItem('vtt.locale')).toBe('de')
})

test('Nicht verfügbarer Browserspeicher bricht die Sprachwahl nicht ab', async () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
  // GIVEN: jeder Zugriff auf `localStorage` wirft.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('localStorage nicht verfügbar')
    },
  })

  try {
    mockFetch([ANMELDEN_401])
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())
    expect(screen.getByRole('heading', { level: 2, name: 'Anmelden' })).toBeTruthy()

    // WHEN: der Besucher loest `English` aus — trotz werfenden Speichers.
    await act(async () => {
      fireEvent.click(schalterKnopf('English'))
    })

    // THEN: die Sprachwahl gilt fuer die laufende Seite, ohne dass ein Fehler nach aussen dringt.
    expect(screen.getByRole('heading', { level: 2, name: 'Sign in' })).toBeTruthy()
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  } finally {
    if (original) Object.defineProperty(window, 'localStorage', original)
  }
})

// --- Requirement: Sprachschalter in der Top-Bar ---------------------------------------------

test('Schalter zeigt die aktive Sprache', async () => {
  localStorage.removeItem('vtt.locale')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())

  const gruppe = spracheGruppe('Sprache')
  const knoepfe = within(gruppe).getAllByRole('button')
  expect(knoepfe).toHaveLength(2)

  const deutsch = within(gruppe).getByRole('button', { name: 'Deutsch' }) as HTMLButtonElement
  const english = within(gruppe).getByRole('button', { name: 'English' }) as HTMLButtonElement
  expect(deutsch.textContent).toBe('DE')
  expect(deutsch.disabled).toBe(true)
  expect(deutsch.getAttribute('aria-current')).toBe('true')
  expect(english.textContent).toBe('EN')
  expect(english.disabled).toBe(false)
  expect(english.getAttribute('aria-current')).toBeNull()
})

test('Nach dem Umschalten wandert die Markierung', async () => {
  localStorage.removeItem('vtt.locale')
  mockFetch([ANMELDEN_401])

  const { container } = render(<App />)
  await waitFor(() => expect(container.querySelector('input[type="email"]')).not.toBeNull())
  // GIVEN: die Gruppe `Sprache` zeigt `Deutsch` als aktive Sprache.
  expect(spracheGruppe('Sprache')).toBeTruthy()

  // WHEN: der Besucher loest `English` aus.
  await act(async () => {
    fireEvent.click(schalterKnopf('English'))
  })

  // THEN: die Gruppe heisst nun `Language`, und die Markierung ist gewandert.
  const gruppe = spracheGruppe('Language')
  const deutsch = within(gruppe).getByRole('button', { name: 'Deutsch' }) as HTMLButtonElement
  const english = within(gruppe).getByRole('button', { name: 'English' }) as HTMLButtonElement
  expect(english.disabled).toBe(true)
  expect(english.getAttribute('aria-current')).toBe('true')
  expect(deutsch.disabled).toBe(false)
  expect(deutsch.getAttribute('aria-current')).toBeNull()
})

test('Angemeldete Startansicht unter Englisch', async () => {
  localStorage.removeItem('vtt.locale')
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-1', email: 'g@example.com', username: 'Gandalf' }) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spielleiter' }]),
    },
  ])

  render(<App />)
  // GIVEN: die angemeldete Startansicht ist erschienen (Schaltflaeche `Sitzung leiten`).
  await screen.findByRole('button', { name: 'Sitzung leiten' })

  // WHEN: der Nutzer loest `English` in der Top-Bar aus.
  await act(async () => {
    fireEvent.click(schalterKnopf('English'))
  })

  // THEN: die Startansicht traegt die englischen Texte; Daten (Nutzername, Sitzungsname) bleiben.
  expect(screen.getByRole('heading', { level: 1, name: 'My game sessions' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Run a session' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Map library' })).toBeTruthy()
  expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Log out' })).toBeTruthy()

  const liste = screen.getByRole('list', { name: 'My game sessions' })
  const eintraege = within(liste).getAllByRole('listitem')
  expect(eintraege).toHaveLength(1)
  const eintrag = eintraege[0]
  expect(within(eintrag).getByRole('heading', { level: 3, name: 'Freitagsrunde' })).toBeTruthy()
  expect(within(eintrag).getByText('Running')).toBeTruthy()
  expect(within(eintrag).getByText('Game master')).toBeTruthy()
  expect(within(eintrag).getByRole('button', { name: 'Enter' })).toBeTruthy()

  expect(within(screen.getByRole('banner')).getByText('Gandalf')).toBeTruthy()
  expect(normalize(screen.getByRole('contentinfo').textContent)).toBe(`Version 0.0.0-dev ${MITTELPUNKT} Build dev`)

  expect(screen.queryByRole('button', { name: 'Sitzung leiten' })).toBeNull()
  expect(screen.queryByText('Läuft')).toBeNull()
})

test('Raumansicht unter Englisch', async () => {
  localStorage.setItem('vtt.locale', 'en')
  mockFetch([
    { pfad: '/api/auth/me', antwort: antwort(200, { id: 'u-1', email: 'g@example.com', username: 'Gandalf' }) },
    {
      pfad: '/api/sessions',
      antwort: antwort(200, [{ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter' }]),
    },
  ])
  socketMock.__facade.enter.mockResolvedValue({
    ok: true,
    session: { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
    participants: [{ userId: 'u-1', username: 'Gandalf', role: 'spielleiter', online: true }],
  })

  render(<App />)
  // GIVEN: gespeicherte Wahl `en`; die Karte traegt die Schaltflaeche `Enter`.
  const enter = (await screen.findAllByRole('button', { name: 'Enter' }))[0]

  // WHEN: der Nutzer loest `Enter` der Karte aus, die Raumansicht ist gerendert (Ueberschrift
  // der Ebene 1 `Freitagsrunde`).
  await act(async () => {
    fireEvent.click(enter)
  })
  await screen.findByRole('heading', { level: 1, name: 'Freitagsrunde' })

  // THEN: Top-Bar und Raum sind englisch; der Code bleibt als Datenwert unveraendert.
  const header = screen.getByRole('banner')
  expect(within(header).getByRole('button', { name: 'Back' })).toBeTruthy()
  expect(within(header).getByRole('group', { name: 'Language' })).toBeTruthy()

  const pille = screen.getByText('Open').closest('.status-pill')
  expect(pille).not.toBeNull()
  expect(screen.getByText(/ABC234/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'End' })).toBeTruthy()

  expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Starten' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Beenden' })).toBeNull()
  expect(screen.queryByText('Geöffnet')).toBeNull()
})

// --- Requirement: Stylesheet des Sprachschalters --------------------------------------------
// Das Stylesheet wird als Text gelesen (Helfer wie in tests/ui-theme.unit.test.ts, dort nichts
// geaendert). Ein Selektor ist vorhanden, wenn die normalisierte CSS (`\s+` → ein Leerzeichen,
// Kommentare entfernt) die Zeichenfolge `<selektor> {` enthaelt (spec.md „Begriffe"); ausserhalb
// des Tokenblocks (`:root { … }`) steht kein Farbwert.

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

interface RootBlock {
  count: number
  start: number
  end: number
}

function rootBlockInfo(strippedCss: string): RootBlock {
  const matches = strippedCss.match(/:root\s*\{/g) ?? []
  const start = strippedCss.search(/:root\s*\{/)
  if (start < 0) return { count: 0, start: -1, end: -1 }
  const braceStart = strippedCss.indexOf('{', start)
  const braceEnd = strippedCss.indexOf('}', braceStart)
  return { count: matches.length, start, end: braceEnd }
}

test('Schalter-Selektoren vorhanden', () => {
  const stripped = stripComments(readText('src/client/app/theme.css'))
  const norm = normalizeWs(stripped)

  expect(selectorPresent(norm, '.app-shell-tools')).toBe(true)
  expect(selectorPresent(norm, '.app-shell-locale')).toBe(true)

  // Ausserhalb des Tokenblocks steht kein Farbwert (`#`-Hex, `rgb(`, `hsl(`).
  const { count, start, end } = rootBlockInfo(stripped)
  let ausserhalb = stripped
  if (count >= 1 && start >= 0 && end >= 0) {
    ausserhalb = stripped.slice(0, start) + stripped.slice(end + 1)
  }
  const hexWerte = ausserhalb.match(/#[0-9a-f]{3,8}/gi) ?? []
  const farbFunktionen = ausserhalb.match(/\b(rgba?|hsla?)\s*\(/gi) ?? []
  expect([...hexWerte, ...farbFunktionen]).toEqual([])
})
