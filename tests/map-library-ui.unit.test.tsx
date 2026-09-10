/** @jest-environment jsdom */
// Komponententests zum Requirement "Bibliotheksoberfläche" aus
// openspec/changes/add-map-library/specs/map-library/spec.md (tasks.md 1.3). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anbietet, anfordert und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). `fetch` ist gemockt (Antworten nach
// Pfad und Methode; PUT-Body und Content-Type werden festgehalten). Die PixiJS-Fassade
// ist per Modul-Mock ersetzt — kein Test importiert `pixi.js` (design.md D8/D10). Der Mock
// trifft den *aufloesbaren* Modulschluessel `../src/client/map/canvas.js` mit `.js`-Endung,
// so wie `MapCanvas` die Fassade importiert (der `moduleNameMapper` loest ihn auf die
// `.ts`-Datei auf); ein virtueller Mock unter einem anderen Schluessel greift nicht, sobald
// `canvas.ts` existiert (design.md D10). Der Einstieg laeuft ueber die gerenderte `App`.
//
// Rote Phase: `App` kennt weder den Zustand `bibliothek` noch die Schaltflaeche
// „Kartenbibliothek"; MapLibrary/MapCanvas/Fassade fehlen. Die Szenarien scheitern daher am
// fehlenden Bedienelement bzw. Verhalten — der erwartete rote Grund (tasks.md 1.3), kein
// Compile-/Setup-Fehler (die Fassade wird nur ueber `jest.requireMock` angesprochen, nie
// statisch importiert).

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der PixiJS-Fassade (design.md D8/D10) ---------------------------------------------
jest.mock('../src/client/map/canvas.js', () => {
  const handle = { setGrid: jest.fn(), setImage: jest.fn(), destroy: jest.fn() }
  return {
    createMapCanvas: jest.fn(async () => handle),
    __handle: handle,
  }
})

type CanvasMock = {
  createMapCanvas: jest.Mock
  __handle: { setGrid: jest.Mock; setImage: jest.Mock; destroy: jest.Mock }
}
const canvasMock = jest.requireMock('../src/client/map/canvas.js') as CanvasMock

// --- fetch-Mock (wie tests/session-ui.unit.test.tsx) ----------------------------------------

const originalFetch = globalThis.fetch
const NUTZER = { id: 'u-selbst', email: 'ich@example.com', username: 'ich' }
const DEFAULT_GRID = { type: 'quadrat', size: 70, offsetX: 0, offsetY: 0 }

type Call = { method: string; url: string; json?: Record<string, unknown>; rawBody?: unknown; contentType?: string }
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
    const headers = (init?.headers ?? {}) as Record<string, string>
    const contentType = headers['Content-Type'] ?? headers['content-type']
    let json: Record<string, unknown> | undefined
    if (typeof init?.body === 'string') {
      try {
        json = JSON.parse(init.body) as Record<string, unknown>
      } catch {
        json = undefined
      }
    }
    calls.push({ method, url, json, rawBody: init?.body, contentType })
    const route = routes.find((r) => r.method === method && r.match(url))
    return must(route, `eine gemockte Antwort fuer ${method} ${url}`).make()
  }) as unknown as typeof fetch
}

// Basisrouten, ohne die die angemeldete Ansicht nicht erscheint.
function basis(): Route[] {
  return [
    { method: 'GET', match: (u) => u.includes('/api/auth/me'), make: () => antwort(200, NUTZER) },
    { method: 'GET', match: (u) => u.includes('/api/sessions'), make: () => antwort(200, []) },
  ]
}

// --- Feld-Hilfen (Bedeutung, nicht Beschriftung) --------------------------------------------

function selectTyp(c: HTMLElement): HTMLSelectElement | null {
  return c.querySelector('select[name*="typ" i], select[name*="type" i], select#gridType, select')
}
function feldGroesse(c: HTMLElement): HTMLInputElement | null {
  return c.querySelector('input[name*="size" i], input[name*="groe" i], input#gridSize')
}
function feldOffsetX(c: HTMLElement): HTMLInputElement | null {
  return c.querySelector('input[name*="offsetx" i], input#gridOffsetX')
}
function feldOffsetY(c: HTMLElement): HTMLInputElement | null {
  return c.querySelector('input[name*="offsety" i], input#gridOffsetY')
}
function dateiFeld(c: HTMLElement): HTMLInputElement | null {
  return c.querySelector('input[type="file"]')
}
function zeileMit(name: string): HTMLElement {
  const text = screen.getByText(name)
  return (text.closest('li, tr, [data-map]') as HTMLElement | null) ?? must(text.parentElement, `die Zeile zu ${name}`)
}

async function oeffneBibliothek(): Promise<void> {
  const knopf = await screen.findByRole('button', { name: /kartenbibliothek/i })
  await act(async () => {
    fireEvent.click(knopf)
  })
  await screen.findByText(/neue karte/i)
}

async function oeffneKarte(name: RegExp): Promise<void> {
  const knopf = await screen.findByRole('button', { name })
  await act(async () => {
    fireEvent.click(knopf)
  })
}

function pngDatei(): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'karte.png', { type: 'image/png' })
}

beforeEach(() => {
  jest.clearAllMocks()
  calls = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// --- Szenarien ------------------------------------------------------------------------------

test('Einstieg aus der Sitzungsliste', async () => {
  installFetch([...basis(), { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, []) }])

  render(<App />)
  await oeffneBibliothek()

  expect(screen.getByText(/neue karte/i)).toBeTruthy()
  expect(calls.some((c) => c.method === 'GET' && c.url.includes('/api/maps'))).toBe(true)
})

test('Liste zeigt eigene Karten mit Bildstatus', async () => {
  installFetch([
    ...basis(),
    {
      method: 'GET',
      match: (u) => u.includes('/api/maps'),
      make: () =>
        antwort(200, [
          { id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID },
          { id: 'm-wald', name: 'Wald', hasImage: false, grid: DEFAULT_GRID },
        ]),
    },
  ])

  render(<App />)
  await oeffneBibliothek()

  expect(screen.getByText('Taverne')).toBeTruthy()
  expect(screen.getByText('Wald')).toBeTruthy()
  expect(zeileMit('Wald').textContent ?? '').toMatch(/ohne bild|kein bild/i)
  expect(zeileMit('Taverne').textContent ?? '').not.toMatch(/ohne bild|kein bild/i)
})

test('Neue Karte mit Bild anlegen', async () => {
  installFetch([
    ...basis(),
    { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, []) },
    {
      method: 'POST',
      match: (u) => u.endsWith('/api/maps'),
      make: () => antwort(201, { id: 'm-krypta', name: 'Krypta', hasImage: false, grid: DEFAULT_GRID }),
    },
    {
      method: 'PUT',
      match: (u) => u.includes('/api/maps/m-krypta/image'),
      make: () => antwort(200, { id: 'm-krypta', name: 'Krypta', hasImage: true, grid: DEFAULT_GRID }),
    },
  ])

  const { container } = render(<App />)
  await oeffneBibliothek()

  const datei = pngDatei()
  const fileInput = must(dateiFeld(container), 'das Dateifeld im Formular „Neue Karte"')
  const form = must(fileInput.closest('form'), 'das Formular „Neue Karte"')
  const nameFeld = must(
    form.querySelector('input[name="name"], input#name, input[type="text"]') as HTMLInputElement | null,
    'das Namensfeld',
  )

  await act(async () => {
    fireEvent.change(nameFeld, { target: { value: 'Krypta' } })
    fireEvent.change(fileInput, { target: { files: [datei] } })
  })
  await act(async () => {
    fireEvent.submit(form)
  })

  const postCall = await waitFor(() => must(calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/maps')), 'den POST-Aufruf'))
  expect(postCall.json).toEqual({ name: 'Krypta' })

  const putCall = await waitFor(() =>
    must(calls.find((c) => c.method === 'PUT' && c.url.includes('/api/maps/m-krypta/image')), 'den PUT-Aufruf'),
  )
  expect(putCall.contentType).toBe('image/png')
  expect(putCall.rawBody).toBe(datei)

  await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/api/maps')).length).toBeGreaterThanOrEqual(2))
})

test('Karte öffnen zeigt Kartenansicht und Rasterformular', async () => {
  installFetch([
    ...basis(),
    {
      method: 'GET',
      match: (u) => u.includes('/api/maps'),
      make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]),
    },
  ])

  const { container } = render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/taverne/i)

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ imageUrl: '/api/maps/m-tav/image', grid: DEFAULT_GRID }),
  )

  expect(must(selectTyp(container), 'das Typ-Auswahlfeld').value).toBe('quadrat')
  expect(Number(must(feldGroesse(container), 'das Zellgroessenfeld').value)).toBe(70)
  expect(Number(must(feldOffsetX(container), 'das Versatz-X-Feld').value)).toBe(0)
  expect(Number(must(feldOffsetY(container), 'das Versatz-Y-Feld').value)).toBe(0)
})

test('Gespeichertes Raster kommt vom Server', async () => {
  const serverGrid = { type: 'hex-spitz', size: 55, offsetX: 0, offsetY: 0 }
  installFetch([
    ...basis(),
    {
      method: 'GET',
      match: (u) => u.includes('/api/maps'),
      make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]),
    },
    {
      method: 'PATCH',
      match: (u) => u.includes('/api/maps/m-tav'),
      make: () => antwort(200, { id: 'm-tav', name: 'Taverne', hasImage: true, grid: serverGrid }),
    },
  ])

  const { container } = render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/taverne/i)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const typ = must(selectTyp(container), 'das Typ-Auswahlfeld')
  const groesse = must(feldGroesse(container), 'das Zellgroessenfeld')
  await act(async () => {
    fireEvent.change(typ, { target: { value: 'hex-spitz' } })
    fireEvent.change(groesse, { target: { value: '50' } })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }))
  })

  const patchCall = await waitFor(() => must(calls.find((c) => c.method === 'PATCH' && c.url.includes('/api/maps/m-tav')), 'den PATCH-Aufruf'))
  expect(patchCall.json).toEqual({ grid: { type: 'hex-spitz', size: 50, offsetX: 0, offsetY: 0 } })

  await waitFor(() => expect(canvasMock.__handle.setGrid).toHaveBeenCalledWith(serverGrid))
})

test('Abgelehnter Upload wird angezeigt', async () => {
  installFetch([
    ...basis(),
    {
      method: 'GET',
      match: (u) => u.includes('/api/maps'),
      make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]),
    },
    {
      method: 'PUT',
      match: (u) => u.includes('/api/maps/m-tav/image'),
      make: () => antwort(413, { statusCode: 413, error: 'Payload Too Large', message: 'Das Bild ist zu groß.' }),
    },
  ])

  const { container } = render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/taverne/i)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  const ersetzen = must(dateiFeld(container), 'das Dateifeld „Bild ersetzen"')
  await act(async () => {
    fireEvent.change(ersetzen, { target: { files: [pngDatei()] } })
  })

  expect(await screen.findByText(/das bild ist zu groß/i)).toBeTruthy()
})

test('Löschen nach Bestätigung', async () => {
  const maps = [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]
  installFetch([
    ...basis(),
    // Nach dem Loeschen liefert die Liste keine Karte mehr.
    { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, maps.slice()) },
    { method: 'DELETE', match: (u) => u.includes('/api/maps/m-tav'), make: () => antwort(204, {}) },
  ])

  const { container } = render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/taverne/i)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /löschen|loeschen/i }))
  })
  // Nach dem Entfernen aus der DB liefert die Liste keine Karte mehr.
  maps.length = 0
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /wirklich/i }))
  })

  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(true))
  await screen.findByText(/neue karte/i)
  expect(screen.queryByText('Taverne')).toBeNull()
  void container
})

test('Verlassen gibt die Kartenansicht frei', async () => {
  installFetch([
    ...basis(),
    {
      method: 'GET',
      match: (u) => u.includes('/api/maps'),
      make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]),
    },
  ])

  render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/taverne/i)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /zurück|zurueck/i }))
  })

  await waitFor(() => expect(canvasMock.__handle.destroy).toHaveBeenCalledTimes(1))
})
