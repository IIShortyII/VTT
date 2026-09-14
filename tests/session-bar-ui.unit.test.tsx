/** @jest-environment jsdom */
// Komponententests zur neuen Capability `session-bar` aus
// openspec/changes/add-session-bar/specs/session-bar/spec.md (#93). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname, gruppiert per
// `describe` je Requirement.
//
// Geprueft wird, *was* die Anwendung anbietet und anzeigt — nicht, wie es aussieht (AGENTS.md:
// Rendering nimmt der menschliche App-Test ab). Adressen ausschliesslich nach design.md D10:
// Testing-Library-Abfragen ueber Rolle/Name/Label (`getByRole`, `getByLabelText`, `within`);
// die Bar ist die Gruppe `Sitzung`, die Steuerung die Gruppe `Steuerung`, das
// Verwaltungsmenue der Trigger `Sitzungsverwaltung`. Kein `querySelector` ueber name/id, keine
// eigenen Helfer mit eigener Fehlermeldung fuer die Bar-Adressen (die Testing-Library-Ausgabe
// bleibt im Fehlerfall erhalten). `App` wird mit gemocktem `fetch` und gemockter Socket-/
// Canvas-Fassade gerendert (Muster der bestehenden Raum-Suiten); die gemockte Fassade bekommt
// `rename`, und ihr `on` speichert auch den Handler fuer `renamed` (design.md D3/D10).
//
// Rote Phase (constitution.md §3.1): weder die Komponente `SessionBar` noch das
// Umbenennen-Modal, die Bestaetigung vor `beenden`, die Bar-Meldung, der Auge-Umschalter,
// das Verwaltungsmenue oder die neuen Texte/Selektoren existieren. Die Szenarien scheitern an
// ihrer Assertion (fehlendes Element/Verhalten: die Gruppe `Sitzung` gibt es noch nicht, die
// Bar-Selektoren fehlen im Stylesheet), kein Setup-Fehler.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from '../src/client/app/App.js'

// --- Mock der Socket-Fassade (Muster tests/session-ui.unit.test.tsx, plus `rename`) ----------
// `on` merkt sich jeden Handler unter seinem Ereignisnamen — auch `renamed` (design.md D3/D10);
// `__emit` ruft sie auf. `rename` ist eine weitere `jest.fn`-Methode mit Acknowledgement ueber
// den Rueckgabewert.
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

// --- Mock der Canvas-Fassade (inert, solange keine Karte aktiv ist) -------------------------
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

// --- fetch-Mock (wie tests/session-ui.unit.test.tsx) ----------------------------------------

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

// Der Toast-Host (`ui-feedback`) traegt `role="status"` UND die Klasse `toast-host`.
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

function meAndSessions(session: Record<string, unknown>): Array<{ pfad: string; antwort: Response }> {
  // Reihenfolge zaehlt: `mockFetch` nimmt den ERSTEN Treffer (`url.includes`). Die
  // Kartenverwaltung des Raums ruft `GET /api/sessions/<id>/maps` — diese spezifischere Route
  // (und `/api/maps` der Bibliothek) stehen vor der allgemeinen `/api/sessions`, damit die
  // Karten-Route eine leere Instanzliste liefert und keine Fehlermeldung entsteht (Muster wie
  // in tests/session-ui.unit.test.tsx).
  return [
    { pfad: '/api/auth/me', antwort: antwort(200, NUTZER) },
    { pfad: `/api/sessions/${String(session.id)}/maps`, antwort: antwort(200, []) },
    { pfad: '/api/maps', antwort: antwort(200, []) },
    { pfad: '/api/sessions', antwort: antwort(200, [session]) },
  ]
}

/** Rendert die Anwendung und betritt den Raum mit dem vorbereiteten Acknowledgement. */
async function raumBetreten(session: Record<string, unknown>, participants: Array<Record<string, unknown>>): Promise<void> {
  mockFetch(meAndSessions(session))
  socketMock.__facade.enter.mockResolvedValue({ ok: true, session, participants })
  render(<App />)
  await screen.findByText(new RegExp(String(session.name)))
  await betreten()
}

const SELBST = { userId: 'u-selbst', username: 'ich', role: 'spielleiter', online: true }

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

// --- Requirement: Aufbau der Session-Bar ----------------------------------------------------

describe('Aufbau der Session-Bar', () => {
  test('Bar des Spielleiters trägt vier Gruppen in fester Reihenfolge', async () => {
    await raumBetreten(
      { id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' },
      [
        SELBST,
        { userId: 'u-a', username: 'alrik', role: 'spieler', online: true },
      ],
    )

    // Genau eine Gruppe `Sitzung`.
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Sitzung' })).toHaveLength(1))
    const bar = screen.getByRole('group', { name: 'Sitzung' })

    // Die Bar traegt Identitaet, Sitzungscode-Gruppe, Zustandsgruppe mit Steuerung und
    // Verwaltungsmenue.
    within(bar).getByRole('heading', { level: 1, name: 'Freitagsrunde' })
    within(bar).getByRole('button', { name: 'Umbenennen' })
    within(bar).getByLabelText('Sitzungscode')
    within(bar).getByRole('button', { name: 'Sitzungscode anzeigen' })
    within(bar).getByRole('button', { name: 'Sitzungscode kopieren' })
    within(bar).getByText('Geöffnet')

    const steuerung = within(bar).getByRole('group', { name: 'Steuerung' })
    const transport = within(steuerung).getAllByRole('button')
    expect(transport.map((b) => b.getAttribute('aria-label'))).toEqual(['Öffnen', 'Starten', 'Pausieren', 'Beenden'])

    const menü = within(bar).getByRole('button', { name: 'Sitzungsverwaltung' })
    expect(menü.getAttribute('aria-haspopup')).toBe('menu')

    // MODIFIED (#94): die Gruppe `Sitzung` liegt im Dokument vor der Reiterliste `Bereiche`
    // (session-bar-Delta „Bar des Spielleiters traegt vier Gruppen in fester Reihenfolge").
    const reiterliste = screen.getByRole('tablist', { name: 'Bereiche' })
    expect(bar.compareDocumentPosition(reiterliste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('Bar des Spielers ohne Code und Steuerung', async () => {
    await raumBetreten(
      { id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spieler' },
      [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    )

    const bar = await screen.findByRole('group', { name: 'Sitzung' })
    within(bar).getByRole('heading', { level: 1, name: 'Freitagsrunde' })
    within(bar).getByText('Läuft')
    within(bar).getByRole('button', { name: 'Sitzungsverwaltung' })

    expect(within(bar).queryByRole('button', { name: 'Umbenennen' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Sitzungscode anzeigen' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Sitzungscode kopieren' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Öffnen' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Starten' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Pausieren' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Beenden' })).toBeNull()
    expect(within(bar).queryByRole('group', { name: 'Steuerung' })).toBeNull()
    expect(within(bar).queryByLabelText('Sitzungscode')).toBeNull()
  })
})

// --- Requirement: Sitzungscode --------------------------------------------------------------

describe('Sitzungscode', () => {
  test('Kopieren bei aufgedecktem Code lässt den Klartext stehen', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })

    try {
      await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
      const bar = await screen.findByRole('group', { name: 'Sitzung' })

      // GIVEN: die Umschalt-Schaltflaeche ist gedrueckt, das `<code>`-Element zeigt `ABC234`.
      const umschalter = within(bar).getByRole('button', { name: 'Sitzungscode anzeigen' })
      await act(async () => {
        fireEvent.click(umschalter)
      })
      const code = within(bar).getByLabelText('Sitzungscode')
      expect(code.textContent).toBe('ABC234')
      expect(umschalter.getAttribute('aria-pressed')).toBe('true')

      // WHEN: `Sitzungscode kopieren`.
      await act(async () => {
        fireEvent.click(within(bar).getByRole('button', { name: 'Sitzungscode kopieren' }))
      })

      // THEN: genau `ABC234` geschrieben, Toast, Klartext bleibt, Maske bleibt aufgedeckt.
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC234'))
      await waitFor(() => expect(within(toastHost()).getByText('Sitzungscode kopiert')).toBeTruthy())
      expect(within(bar).getByLabelText('Sitzungscode').textContent).toBe('ABC234')
      expect(within(bar).getByRole('button', { name: 'Sitzungscode anzeigen' }).getAttribute('aria-pressed')).toBe('true')
    } finally {
      Object.defineProperty(globalThis.navigator, 'clipboard', original ?? { value: undefined, configurable: true })
    }
  })
})

// --- Requirement: Übergänge -----------------------------------------------------------------

describe('Übergänge', () => {
  test('Laufende Sitzung sperrt Öffnen und Starten', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const steuerung = await screen.findByRole('group', { name: 'Steuerung' })

    expect((within(steuerung).getByRole('button', { name: 'Öffnen' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(steuerung).getByRole('button', { name: 'Starten' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(steuerung).getByRole('button', { name: 'Pausieren' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(steuerung).getByRole('button', { name: 'Beenden' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('Starten sendet den Übergang und die Pille folgt dem Server', async () => {
    socketMock.__facade.transition.mockResolvedValue({ ok: true, status: 'gestartet' })
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const steuerung = await screen.findByRole('group', { name: 'Steuerung' })

    await act(async () => {
      fireEvent.click(within(steuerung).getByRole('button', { name: 'Starten' }))
    })

    await waitFor(() => expect(socketMock.__facade.transition).toHaveBeenCalledWith('s1', 'starten'))
    expect(socketMock.__facade.transition).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // Die Pille folgt dem Server, nicht der Schaltflaeche: weiterhin `Geöffnet`.
    expect(screen.getByText('Geöffnet').closest('.status-pill')).not.toBeNull()

    // Nach `session:status` mit `gestartet`: Pille `Läuft`, `Starten` gesperrt, `Pausieren` frei.
    await act(async () => {
      socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
    })
    await screen.findByText('Läuft')
    const steuerung2 = screen.getByRole('group', { name: 'Steuerung' })
    expect((within(steuerung2).getByRole('button', { name: 'Starten' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(steuerung2).getByRole('button', { name: 'Pausieren' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('Beenden fragt vor dem Senden nach', async () => {
    socketMock.__facade.transition.mockResolvedValue({ ok: true, status: 'geschlossen' })
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const steuerung = await screen.findByRole('group', { name: 'Steuerung' })

    await act(async () => {
      fireEvent.click(within(steuerung).getByRole('button', { name: 'Beenden' }))
    })

    const dialog = await screen.findByRole('alertdialog', { name: 'Sitzung beenden?' })
    within(dialog).getByText('Alle Spieler werden aus dem Raum entfernt.')
    within(dialog).getByRole('button', { name: 'Abbrechen' })
    within(dialog).getByRole('button', { name: 'Beenden' })
    expect(socketMock.__facade.transition).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Beenden' }))
    })

    await waitFor(() => expect(socketMock.__facade.transition).toHaveBeenCalledWith('s1', 'beenden'))
    expect(socketMock.__facade.transition).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('Abbrechen der Bestätigung sendet nichts', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const steuerung = await screen.findByRole('group', { name: 'Steuerung' })

    // GIVEN: der Dialog `Sitzung beenden?` ist ueber die Steuerung geoeffnet. Der Auslöser
    // erhaelt zuvor den Fokus (jsdom fokussiert bei `click` nicht von selbst — Muster wie
    // tests/map-library-ui.unit.test.tsx und tests/ui-dialog.unit.test.tsx), damit der Modal
    // ihn als Rueckgabeziel merkt.
    const beenden = within(steuerung).getByRole('button', { name: 'Beenden' })
    beenden.focus()
    await act(async () => {
      fireEvent.click(beenden)
    })
    const dialog = await screen.findByRole('alertdialog', { name: 'Sitzung beenden?' })

    // WHEN: `Abbrechen`.
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    })

    // THEN: kein `alertdialog` mehr, nichts gesendet, Fokus auf `Beenden` der Steuerung.
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(socketMock.__facade.transition).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(within(steuerung).getByRole('button', { name: 'Beenden' }))
  })

  test('Abgelehnter Übergang erscheint als Bar-Meldung', async () => {
    socketMock.__facade.transition.mockResolvedValue({ ok: false, message: 'Dafür fehlt die Berechtigung.' })
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const steuerung = await screen.findByRole('group', { name: 'Steuerung' })

    await act(async () => {
      fireEvent.click(within(steuerung).getByRole('button', { name: 'Starten' }))
    })

    // THEN: die Bar-Meldung — das Element der Rolle `alert` mit der Klasse `session-bar-error`
    // (design.md D10) — traegt den Text; Pille weiterhin `Geöffnet`.
    const meldungen = await screen.findAllByRole('alert')
    const barMeldung = meldungen.find((el) => el.classList.contains('session-bar-error'))
    expect(barMeldung?.textContent).toContain('Dafür fehlt die Berechtigung.')
    expect(screen.getByText('Geöffnet').closest('.status-pill')).not.toBeNull()

    // Nach `session:status` mit `gestartet` existiert kein Element mit der Klasse
    // `session-bar-error` mehr.
    await act(async () => {
      socketMock.__emit('status', { sessionId: 's1', status: 'gestartet' })
    })
    await waitFor(() =>
      expect(screen.queryAllByRole('alert').some((el) => el.classList.contains('session-bar-error'))).toBe(false),
    )
  })
})

// --- Requirement: Verwaltungsmenü -----------------------------------------------------------

describe('Verwaltungsmenü', () => {
  test('Menü des Spielleiters', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Sitzungsverwaltung' }))
    })

    const menü = screen.getByRole('menu', { name: 'Sitzungsverwaltung' })
    const einträge = within(menü).getAllByRole('menuitem')
    expect(einträge.map((e) => e.textContent)).toEqual(['Umbenennen…', 'Kartenbibliothek', 'Verlassen'])
    for (const eintrag of einträge) {
      expect(eintrag.getAttribute('aria-disabled')).toBeNull()
    }
  })

  test('Menü des Spielers sperrt Umbenennen', async () => {
    await raumBetreten(
      { id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spieler' },
      [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    )
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Sitzungsverwaltung' }))
    })

    const menü = screen.getByRole('menu', { name: 'Sitzungsverwaltung' })
    const umbenennen = within(menü).getByRole('menuitem', { name: 'Umbenennen…' })
    expect(umbenennen.getAttribute('aria-disabled')).toBe('true')
    expect(within(menü).getByRole('menuitem', { name: 'Kartenbibliothek' }).getAttribute('aria-disabled')).toBeNull()
    expect(within(menü).getByRole('menuitem', { name: 'Verlassen' }).getAttribute('aria-disabled')).toBeNull()

    await act(async () => {
      fireEvent.click(umbenennen)
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Verlassen führt zur Sitzungsliste', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Sitzungsverwaltung' }))
    })
    const menü = screen.getByRole('menu', { name: 'Sitzungsverwaltung' })
    await act(async () => {
      fireEvent.click(within(menü).getByRole('menuitem', { name: 'Verlassen' }))
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sitzung leiten' })).toBeTruthy())
    expect(screen.queryByRole('group', { name: 'Sitzung' })).toBeNull()
    expect(socketMock.__facade.disconnect).toHaveBeenCalled()
  })

  test('Kartenbibliothek öffnet die Bibliothek', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Sitzungsverwaltung' }))
    })
    const menü = screen.getByRole('menu', { name: 'Sitzungsverwaltung' })
    await act(async () => {
      fireEvent.click(within(menü).getByRole('menuitem', { name: 'Kartenbibliothek' }))
    })

    await screen.findByRole('heading', { level: 1, name: 'Kartenbibliothek' })
    expect(screen.queryByRole('group', { name: 'Sitzung' })).toBeNull()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('button', { name: 'Zurück' })).toBeTruthy()
  })
})

// --- Requirement: Umbenennen ----------------------------------------------------------------

describe('Umbenennen', () => {
  test('Umbenennen öffnet das Modal mit dem aktuellen Namen', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Umbenennen' }))
    })

    const dialog = await screen.findByRole('dialog', { name: 'Sitzung umbenennen' })
    const feld = within(dialog).getByLabelText('Name') as HTMLInputElement
    expect(feld.value).toBe('Freitagsrunde')
    within(dialog).getByRole('button', { name: 'Umbenennen' })
    expect(document.activeElement).toBe(feld)
  })

  test('Umbenennen sendet die Absicht und folgt dem Server', async () => {
    socketMock.__facade.rename.mockResolvedValue({ ok: true, name: 'Samstagsrunde' })
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Umbenennen' }))
    })
    const dialog = await screen.findByRole('dialog', { name: 'Sitzung umbenennen' })
    const feld = within(dialog).getByLabelText('Name')
    fireEvent.change(feld, { target: { value: '  Samstagsrunde  ' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Umbenennen' }))
    })

    // Die Absicht wird mit dem getrimmten Namen gesendet …
    await waitFor(() => expect(socketMock.__facade.rename).toHaveBeenCalledWith('s1', 'Samstagsrunde'))
    expect(socketMock.__facade.rename).toHaveBeenCalledTimes(1)
    // … das Modal schliesst, der Toast erscheint, der angezeigte Name bleibt vorerst `Freitagsrunde`.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sitzung umbenennen' })).toBeNull())
    await waitFor(() => expect(within(toastHost()).getByText('Sitzung umbenannt')).toBeTruthy())
    expect(screen.getByRole('heading', { level: 1, name: 'Freitagsrunde' })).toBeTruthy()

    // Erst `session:renamed` aendert den Namen der Bar (§9.1).
    await act(async () => {
      socketMock.__emit('renamed', { sessionId: 's1', name: 'Samstagsrunde' })
    })
    await screen.findByRole('heading', { level: 1, name: 'Samstagsrunde' })
  })

  test('Leerer Name wird nicht gesendet', async () => {
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Umbenennen' }))
    })
    const dialog = await screen.findByRole('dialog', { name: 'Sitzung umbenennen' })
    const feld = within(dialog).getByLabelText('Name')
    fireEvent.change(feld, { target: { value: '   ' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Umbenennen' }))
    })

    const dialog2 = screen.getByRole('dialog', { name: 'Sitzung umbenennen' })
    const feldfehler = within(dialog2).getByText('Der Name muss mindestens 1 Zeichen lang sein.')
    expect(feldfehler.classList.contains('field-error')).toBe(true)
    expect(socketMock.__facade.rename).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Sitzung umbenennen' })).toBeTruthy()
  })

  test('Abgelehntes Umbenennen bleibt im Modal', async () => {
    socketMock.__facade.rename.mockResolvedValue({ ok: false, message: 'Dafür fehlt die Berechtigung.' })
    await raumBetreten({ id: 's1', name: 'Freitagsrunde', status: 'geoeffnet', role: 'spielleiter', code: 'ABC234' }, [SELBST])
    const bar = await screen.findByRole('group', { name: 'Sitzung' })

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Umbenennen' }))
    })
    const dialog = await screen.findByRole('dialog', { name: 'Sitzung umbenennen' })
    const feld = within(dialog).getByLabelText('Name')
    fireEvent.change(feld, { target: { value: 'Samstagsrunde' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Umbenennen' }))
    })

    const dialog2 = await screen.findByRole('dialog', { name: 'Sitzung umbenennen' })
    const formfehler = within(dialog2).getByRole('alert')
    expect(formfehler.classList.contains('form-error')).toBe(true)
    expect(formfehler.textContent).toContain('Dafür fehlt die Berechtigung.')
    expect(toastHost().children.length).toBe(0)
    expect(screen.getByRole('heading', { level: 1, name: 'Freitagsrunde' })).toBeTruthy()
  })

  test('Umbenennung erreicht den Spieler', async () => {
    await raumBetreten(
      { id: 's1', name: 'Freitagsrunde', status: 'gestartet', role: 'spieler' },
      [{ userId: 'u-selbst', username: 'ich', role: 'spieler', online: true }],
    )
    await screen.findByRole('heading', { level: 1, name: 'Freitagsrunde' })

    await act(async () => {
      socketMock.__emit('renamed', { sessionId: 's1', name: 'Samstagsrunde' })
    })

    await screen.findByRole('heading', { level: 1, name: 'Samstagsrunde' })
    expect(screen.queryByText('Freitagsrunde')).toBeNull()
  })
})

// --- Requirement: Stylesheet der Session-Bar ------------------------------------------------
// Das Stylesheet wird als Text gelesen (Helfer wie in tests/ui-theme.unit.test.ts). Ein
// Selektor ist vorhanden, wenn die normalisierte CSS die Zeichenfolge `<selektor> {` enthaelt
// (spec.md „Begriffe").

const BAR_SELECTORS = [
  '.session-bar',
  '.session-bar__group',
  '.session-bar__name',
  '.session-bar__code',
  '.transport-button',
  '.transport-button--danger',
  '.session-bar-error',
]

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

describe('Stylesheet der Session-Bar', () => {
  test('Bar-Selektoren vorhanden', () => {
    const stripped = stripComments(readText('src/client/app/theme.css'))
    const norm = normalizeWs(stripped)

    for (const selektor of BAR_SELECTORS) {
      expect(selectorPresent(norm, selektor)).toBe(true)
    }

    // Genau eine `@media`-Abfrage, und sie ist die Bewegungsabfrage.
    const medien = stripped.match(/@media/g) ?? []
    expect(medien).toHaveLength(1)
    expect(stripped).toMatch(/@media[^{]*prefers-reduced-motion/)
  })
})
