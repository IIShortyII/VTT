/** @jest-environment jsdom */
// Komponententests zum Requirement "Bibliotheksoberfläche" aus
// openspec/changes/add-map-library/specs/map-library/spec.md (tasks.md 1.3). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Anwendung anbietet, anfordert und anzeigt — nicht, wie es aussieht
// (AGENTS.md: Rendering nimmt der menschliche App-Test ab). `fetch` ist gemockt (Antworten nach
// Pfad und Methode; PUT-Body und Content-Type werden festgehalten). Die PixiJS-Fassade
// ist per Modul-Mock ersetzt — kein Test importiert `pixi.js` (design.md D8/D10).
//
// add-ui-dialog (#89, MODIFIED map-library): Das Loeschen laeuft ueber den Bestaetigungsdialog
// von `ui-dialog`.
//
// add-ui-form (#90, MODIFIED map-library): Das Formular „Neue Karte" folgt dem Formularmuster
// von `ui-form` (design.md D6): `Anlegen` ist gesperrt, solange `CreateMapInputSchema` den
// Zustand nicht akzeptiert; eine Ablehnung von `POST /api/maps` mit `field` gleich `name`
// erscheint als Feldfehler des Feldes `Name`, eine Upload-Ablehnung als Formularfehler.
// „Einstieg aus der Sitzungsliste" bekommt die Sperr-Assertion (Name leer → `Anlegen`
// gesperrt), „Abgelehntes Anlegen zeigt den Fehler am Namen" ist neu.
//
// Rote Phase: das Formular „Neue Karte" traegt noch keine gesperrte Absende-Schaltflaeche aus
// dem Schema und keinen Feldfehler nach dem Formularmuster — die Szenarien scheitern an der
// erwarteten Assertion (constitution.md §3.1), kein Lade- oder Typfehler.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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

/** Der Feldfehler eines Steuerelements: das `role="alert"`-Element, auf das `aria-describedby`
 * zeigt (design.md D11). */
function feldFehlerVon(control: HTMLElement): HTMLElement | null {
  const id = control.getAttribute('aria-describedby')
  return id ? document.getElementById(id) : null
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
  // MODIFIED (#90): `Anlegen` ist gesperrt, solange `Name` leer ist.
  expect((screen.getByRole('button', { name: 'Anlegen' }) as HTMLButtonElement).disabled).toBe(true)
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
    form.querySelector('input[name="name"], input#name, input#map-name, input[type="text"]') as HTMLInputElement | null,
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

test('Abgelehntes Anlegen zeigt den Fehler am Namen', async () => {
  const MELDUNG = 'Der Name ist bereits vergeben.'
  installFetch([
    ...basis(),
    { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, []) },
    { method: 'POST', match: (u) => u.endsWith('/api/maps'), make: () => antwort(400, { message: MELDUNG, field: 'name' }) },
  ])

  render(<App />)
  await oeffneBibliothek()

  const nameFeld = screen.getByLabelText('Name')
  fireEvent.change(nameFeld, { target: { value: 'Krypta' } })
  const form = must(nameFeld.closest('form'), 'das Formular „Neue Karte"')

  await act(async () => {
    fireEvent.submit(form)
  })

  // Der Fehler steht am Feld `Name`.
  await waitFor(() => expect(nameFeld.getAttribute('aria-invalid')).toBe('true'))
  const fehler = must(feldFehlerVon(nameFeld), 'ein Feldfehler am Feld „Name"')
  expect(fehler.getAttribute('role')).toBe('alert')
  expect(fehler.textContent).toContain(MELDUNG)
  // Kein Bild-Upload, keine erneute Abfrage der Liste (nur der Einstiegs-GET).
  expect(calls.some((c) => c.method === 'PUT' && /\/api\/maps\/.*\/image/.test(c.url))).toBe(false)
  expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/api/maps')).length).toBe(1)
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
  await oeffneKarte(/^Taverne$/)

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
  await oeffneKarte(/^Taverne$/)
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
  await oeffneKarte(/^Taverne$/)
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

  render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/^Taverne$/)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  // `Löschen` in der Kartenansicht oeffnet den Bestaetigungsdialog (kein Zwei-Klick-Knopf mehr).
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
  })

  const dialog = screen.getByRole('alertdialog', { name: 'Karte „Taverne" löschen?' })
  const descId = dialog.getAttribute('aria-describedby') ?? ''
  expect(document.getElementById(descId)?.textContent).toBe(
    'Die Karte wird aus der Bibliothek entfernt und kann nicht wiederhergestellt werden.',
  )
  expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeTruthy()
  const bestaetigen = within(dialog).getByRole('button', { name: 'Löschen' })
  expect(bestaetigen.classList.contains('danger')).toBe(true)
  // Vor der Bestaetigung wurde noch kein DELETE gesendet.
  expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(false)

  // Nach dem Entfernen aus der DB liefert die Liste keine Karte mehr.
  maps.length = 0
  await act(async () => {
    fireEvent.click(bestaetigen)
  })

  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(true))
  await screen.findByText(/neue karte/i)
  expect(screen.queryByText('Taverne')).toBeNull()
}, 15000)

test('Abgebrochenes Löschen sendet nichts', async () => {
  installFetch([
    ...basis(),
    {
      method: 'GET',
      match: (u) => u.includes('/api/maps'),
      make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]),
    },
    { method: 'DELETE', match: (u) => u.includes('/api/maps/m-tav'), make: () => antwort(204, {}) },
  ])

  render(<App />)
  await oeffneBibliothek()
  await oeffneKarte(/^Taverne$/)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  // GIVEN: der Loeschdialog ist ueber „Löschen" der Kartenansicht offen; der Auslöser traegt
  // den Fokus (im Browser fokussiert der Klick den Knopf; in jsdom von Hand gesetzt).
  const loeschenKnopf = screen.getByRole('button', { name: 'Löschen' })
  loeschenKnopf.focus()
  await act(async () => {
    fireEvent.click(loeschenKnopf)
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Karte „Taverne" löschen?' })

  // WHEN: der Nutzer bricht im Dialog ab.
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  })

  // THEN: kein Dialog mehr, kein DELETE, Kartenansicht „Taverne" weiterhin gerendert, Fokus
  // zurueck auf „Löschen" der Kartenansicht.
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(false)
  expect(screen.getByRole('button', { name: 'Zur Bibliothek' })).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Löschen' }))
}, 15000)

test('Öffnen aus dem Menü der Liste', async () => {
  installFetch([
    ...basis(),
    { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]) },
  ])

  render(<App />)
  await oeffneBibliothek()

  // Menü der Zeile öffnen und `Öffnen` wählen.
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Taverne' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Öffnen' }))
  })

  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())
  expect(canvasMock.createMapCanvas).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ imageUrl: '/api/maps/m-tav/image', grid: DEFAULT_GRID }),
  )
}, 15000)

test('Löschen aus der Liste nach Bestätigung', async () => {
  installFetch([
    ...basis(),
    { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]) },
    { method: 'DELETE', match: (u) => u.includes('/api/maps/m-tav'), make: () => antwort(204, {}) },
  ])

  render(<App />)
  await oeffneBibliothek()

  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Aktionen für Taverne' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Löschen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Karte „Taverne" löschen?' })
  // Vor der Bestätigung wurde kein DELETE gesendet.
  expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(false)

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }))
  })

  // Danach folgt `DELETE /api/maps/m-tav` und eine erneute Abfrage der Liste; die Bibliothek
  // zeigt weiterhin die Liste, nicht die Detailansicht.
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(true))
  await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/api/maps')).length).toBeGreaterThanOrEqual(2))
  expect(screen.getByText(/neue karte/i)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Zur Bibliothek' })).toBeNull()
}, 15000)

test('Abgebrochenes Löschen aus der Liste sendet nichts', async () => {
  installFetch([
    ...basis(),
    { method: 'GET', match: (u) => u.includes('/api/maps'), make: () => antwort(200, [{ id: 'm-tav', name: 'Taverne', hasImage: true, grid: DEFAULT_GRID }]) },
    { method: 'DELETE', match: (u) => u.includes('/api/maps/m-tav'), make: () => antwort(204, {}) },
  ])

  render(<App />)
  await oeffneBibliothek()

  const trigger = await screen.findByRole('button', { name: 'Aktionen für Taverne' })
  await act(async () => {
    fireEvent.click(trigger)
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Löschen' }))
  })
  const dialog = screen.getByRole('alertdialog', { name: 'Karte „Taverne" löschen?' })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  })

  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/maps/m-tav'))).toBe(false)
  // Der Fokus liegt wieder auf dem Trigger `Aktionen für Taverne`.
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Aktionen für Taverne' }))
}, 15000)

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
  await oeffneKarte(/^Taverne$/)
  await waitFor(() => expect(canvasMock.createMapCanvas).toHaveBeenCalled())

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Zur Bibliothek' }))
  })

  await waitFor(() => expect(canvasMock.__handle.destroy).toHaveBeenCalledTimes(1))
})
