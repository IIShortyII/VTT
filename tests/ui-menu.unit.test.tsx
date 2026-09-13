/** @jest-environment jsdom */
// Komponententests zur neuen Capability `ui-menu` aus
// openspec/changes/add-ui-menu/specs/ui-menu/spec.md (#92). Ein Test je GIVEN/WHEN/THEN-
// Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Diese Datei importiert die Exporte des noch fehlenden Moduls `src/client/ui/menu.tsx`
// (useFloating, MenuTrigger, ActionMenu, ActionMenuButton, Popover). Sie liegt bewusst
// getrennt, damit ein Ladefehler des Moduls die bestehenden Suiten nicht mitreisst
// (Delegationsvorgabe). Adressen ueber Testing-Library-Abfragen nach Rolle, Namen und Text
// (design.md D12); Icon-SVGs und Inline-Stil werden per DOM-Attribut geprueft, weil dafuer
// keine Rolle existiert.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'

import {
  ActionMenu,
  ActionMenuButton,
  MenuTrigger,
  Popover,
  useFloating,
  type Anchor,
  type MenuEntry,
} from '../src/client/ui/menu.js'

// --- Harness-Komponenten --------------------------------------------------------------------

// Menue an einem festen Anker, geoeffnet ueber eine schlichte Schaltflaeche.
function AnchoredMenu({
  entries,
  label = 'Aktionen für Goblin',
  anchor = { x: 40, y: 50 },
}: {
  entries: MenuEntry[]
  label?: string
  anchor?: Anchor
}) {
  const floating = useFloating()
  return (
    <div>
      <button type="button" onClick={() => floating.openAt(anchor)}>
        auslösen
      </button>
      <ActionMenu floating={floating} label={label} entries={entries} />
    </div>
  )
}

// Zeile mit Rechtsklick-Uebergabe an den Schwebezustand, Trigger und Menue am selben Zustand.
function RowMenu({ entries, children }: { entries: MenuEntry[]; children?: React.ReactNode }) {
  const floating = useFloating()
  const label = 'Aktionen für Goblin'
  return (
    <ul>
      <li onContextMenu={floating.onContextMenu}>
        <span>Goblin</span>
        {children}
        <MenuTrigger floating={floating} label={label} />
        <ActionMenu floating={floating} label={label} entries={entries} />
      </li>
    </ul>
  )
}

// Einzelner Trigger (fuer die Varianten-Szenarien ohne Menue-Interaktion).
function SoloTrigger(props: {
  variant?: 'more' | 'text' | 'icon'
  icon?: 'info'
  label: string
  haspopup?: 'menu' | 'dialog'
}) {
  const floating = useFloating()
  return <MenuTrigger floating={floating} {...props} />
}

// Trigger und Popover am selben Schwebezustand.
function CodePopover() {
  const floating = useFloating()
  return (
    <div>
      <MenuTrigger floating={floating} variant="icon" icon="info" haspopup="dialog" label="Sitzungscode anzeigen" />
      <Popover floating={floating} label="Sitzungscode">
        <code>ABC234</code>
        <button type="button">Kopieren</button>
      </Popover>
    </div>
  )
}

function eintrag(id: string, label: string, extra: Partial<MenuEntry> = {}): MenuEntry {
  return { id, label, onSelect: jest.fn(), ...extra }
}

const rectSpies: Array<() => void> = []

function spyMenuRect(width: number, height: number): void {
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    const groesse = this.getAttribute('role') === 'menu' || this.getAttribute('role') === 'dialog' ? { width, height } : { width: 0, height: 0 }
    return { x: 0, y: 0, top: 0, left: 0, right: groesse.width, bottom: groesse.height, ...groesse, toJSON: () => ({}) } as DOMRect
  }
  rectSpies.push(() => {
    HTMLElement.prototype.getBoundingClientRect = original
  })
}

const originalInnerWidth = window.innerWidth
const originalInnerHeight = window.innerHeight

afterEach(() => {
  while (rectSpies.length > 0) rectSpies.pop()!()
  window.innerWidth = originalInnerWidth
  window.innerHeight = originalInnerHeight
})

// --- Requirement: Menü-Baustein -------------------------------------------------------------

test('Menü rendert Einträge mit Icon, Gefahr und Sperre', () => {
  render(
    <AnchoredMenu
      entries={[
        eintrag('bearbeiten', 'Bearbeiten', { icon: 'edit' }),
        eintrag('zuweisen', 'Zuweisen…', { disabled: true }),
        eintrag('entfernen', 'Entfernen', { icon: 'delete', danger: true }),
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))

  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  const items = within(menu).getAllByRole('menuitem')
  expect(items.map((el) => el.textContent)).toEqual(['Bearbeiten', 'Zuweisen…', 'Entfernen'])

  const [bearbeiten, zuweisen, entfernen] = items
  expect(bearbeiten.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  expect(zuweisen.getAttribute('aria-disabled')).toBe('true')
  expect(entfernen.classList.contains('menu-item--danger')).toBe(true)

  expect(document.activeElement).toBe(bearbeiten)
  expect(bearbeiten.getAttribute('tabindex')).toBe('0')
  expect(zuweisen.getAttribute('tabindex')).toBe('-1')
  expect(entfernen.getAttribute('tabindex')).toBe('-1')
})

test('Geschlossenes Menü rendert nichts', () => {
  render(
    <AnchoredMenu
      entries={[eintrag('a', 'Bearbeiten'), eintrag('b', 'Zuweisen…'), eintrag('c', 'Entfernen')]}
    />,
  )
  // Der Schwebezustand wird nicht geoeffnet.
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
})

test('Menü nahe am rechten und unteren Rand bleibt im sichtbaren Bereich', () => {
  window.innerWidth = 300
  window.innerHeight = 200
  spyMenuRect(120, 90)

  render(
    <AnchoredMenu
      anchor={{ x: 250, y: 180 }}
      entries={[eintrag('a', 'Bearbeiten'), eintrag('b', 'Zuweisen…'), eintrag('c', 'Entfernen')]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))

  const menu = screen.getByRole('menu')
  expect(menu.style.left).toBe('172px')
  expect(menu.style.top).toBe('102px')
})

test('Menü mit Platz bleibt am Anker', () => {
  window.innerWidth = 300
  window.innerHeight = 200
  spyMenuRect(120, 90)

  render(
    <AnchoredMenu
      anchor={{ x: 40, y: 50 }}
      entries={[eintrag('a', 'Bearbeiten'), eintrag('b', 'Zuweisen…'), eintrag('c', 'Entfernen')]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))

  const menu = screen.getByRole('menu')
  expect(menu.style.left).toBe('40px')
  expect(menu.style.top).toBe('50px')
})

// --- Requirement: Tastaturbedienung des Menüs -----------------------------------------------

test('Pfeil abwärts überspringt gesperrte Einträge und wrappt', () => {
  render(
    <AnchoredMenu
      entries={[
        eintrag('bearbeiten', 'Bearbeiten'),
        eintrag('zuweisen', 'Zuweisen…', { disabled: true }),
        eintrag('entfernen', 'Entfernen'),
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))
  const menu = screen.getByRole('menu')
  const entfernen = within(menu).getByRole('menuitem', { name: 'Entfernen' })
  const bearbeiten = within(menu).getByRole('menuitem', { name: 'Bearbeiten' })

  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(entfernen)

  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(bearbeiten)
})

test('Pfeil aufwärts wrappt zum letzten Eintrag', () => {
  render(
    <AnchoredMenu
      entries={[
        eintrag('bearbeiten', 'Bearbeiten'),
        eintrag('zuweisen', 'Zuweisen…', { disabled: true }),
        eintrag('entfernen', 'Entfernen'),
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))
  const menu = screen.getByRole('menu')

  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Entfernen' }))
})

test('Home und End springen an die Ränder', () => {
  render(
    <AnchoredMenu
      entries={[eintrag('bearbeiten', 'Bearbeiten'), eintrag('zuweisen', 'Zuweisen…'), eintrag('entfernen', 'Entfernen')]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))
  const menu = screen.getByRole('menu')
  const zuweisen = within(menu).getByRole('menuitem', { name: 'Zuweisen…' })
  // GIVEN: `Zuweisen…` ist der aktive Eintrag — per Pfeil abwärts vom ersten Eintrag (echter Fokus).
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(zuweisen)

  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Entfernen' }))

  fireEvent.keyDown(document.activeElement!, { key: 'Home' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Bearbeiten' }))
})

test('Enter wählt den aktiven Eintrag und gibt den Fokus vorher zurück', () => {
  let festgehalten: Element | null = null
  const onSelect = jest.fn(() => {
    festgehalten = document.activeElement
  })
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect }]} />)

  const trigger = screen.getByRole('button', { name: 'Aktionen für Goblin' })
  fireEvent.click(trigger)
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(festgehalten).toBe(trigger)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
})

test('Leertaste wählt den aktiven Eintrag', () => {
  const onSelect = jest.fn()
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect }]} />)

  fireEvent.click(screen.getByRole('button', { name: 'Aktionen für Goblin' }))
  fireEvent.keyDown(document.activeElement!, { key: ' ' })

  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).toBeNull()
})

test('Escape schließt ohne Auswahl und gibt den Fokus zurück', () => {
  const onSelect = jest.fn()
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect }]} />)

  const trigger = screen.getByRole('button', { name: 'Aktionen für Goblin' })
  fireEvent.click(trigger)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Tab schließt ohne Auswahl und gibt den Fokus zurück', () => {
  const onSelect = jest.fn()
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect }]} />)

  const trigger = screen.getByRole('button', { name: 'Aktionen für Goblin' })
  fireEvent.click(trigger)
  const nichtUnterdrueckt = fireEvent.keyDown(document.activeElement!, { key: 'Tab' })

  expect(onSelect).not.toHaveBeenCalled()
  expect(nichtUnterdrueckt).toBe(false)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Gesperrter Eintrag lässt sich nicht auswählen', () => {
  const onSelect = jest.fn()
  render(<AnchoredMenu entries={[eintrag('zuweisen', 'Zuweisen…', { disabled: true, onSelect })]} />)
  fireEvent.click(screen.getByRole('button', { name: 'auslösen' }))

  const zuweisen = within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Zuweisen…' })
  fireEvent.click(zuweisen)
  fireEvent.keyDown(zuweisen, { key: 'Enter' })

  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.queryByRole('menu')).not.toBeNull()
})

// --- Requirement: Öffnen und Schließen per Zeiger -------------------------------------------

test('Trigger öffnet und schließt das Menü', () => {
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect: jest.fn() }]} />)

  const trigger = screen.getByRole('button', { name: 'Aktionen für Goblin' })
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.click(trigger)
  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Bearbeiten' }))

  fireEvent.click(trigger)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('Klick auf einen Eintrag wählt ihn aus', () => {
  const onSelect = jest.fn()
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect }]} />)

  const trigger = screen.getByRole('button', { name: 'Aktionen für Goblin' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Klick außerhalb schließt das Menü und gibt den Fokus zurück', () => {
  const onSelect = jest.fn()
  render(<ActionMenuButton label="Aktionen für Goblin" variant="more" entries={[{ id: 'bearbeiten', label: 'Bearbeiten', onSelect }]} />)

  const trigger = screen.getByRole('button', { name: 'Aktionen für Goblin' })
  fireEvent.click(trigger)
  fireEvent.mouseDown(document.body)

  expect(screen.queryByRole('menu')).toBeNull()
  expect(onSelect).not.toHaveBeenCalled()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
})

test('Rechtsklick auf eine Zeile öffnet das Menü am Zeiger', () => {
  render(<RowMenu entries={[eintrag('bearbeiten', 'Bearbeiten')]} />)

  const unterdrueckt = fireEvent.contextMenu(screen.getByText('Goblin'), { clientX: 120, clientY: 80 })
  expect(unterdrueckt).toBe(false)

  const menu = screen.getByRole('menu', { name: 'Aktionen für Goblin' })
  expect(menu.style.left).toBe('120px')
  expect(menu.style.top).toBe('80px')
  expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Bearbeiten' }))
})

test('Rechtsklick auf ein Formularfeld lässt das Browser-Menü zu', () => {
  render(
    <RowMenu entries={[eintrag('bearbeiten', 'Bearbeiten')]}>
      <label>
        Goblin HP
        <input type="number" />
      </label>
    </RowMenu>,
  )

  const nichtUnterdrueckt = fireEvent.contextMenu(screen.getByLabelText('Goblin HP'))
  expect(nichtUnterdrueckt).toBe(true)
  expect(screen.queryByRole('menu')).toBeNull()
})

// --- Requirement: Trigger-Varianten ---------------------------------------------------------

test('Text-Trigger zeigt Namen und Chevron', () => {
  render(<ActionMenuButton label="Gandalf" variant="text" entries={[{ id: 'p', label: 'Passwort ändern', onSelect: jest.fn() }, { id: 'l', label: 'Abmelden', onSelect: jest.fn() }]} />)

  const trigger = screen.getByRole('button', { name: 'Gandalf' })
  expect(trigger.classList.contains('menu-trigger')).toBe(true)
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
  expect(trigger.textContent).toContain('Gandalf')
  expect(trigger.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
  expect(screen.queryByRole('menuitem')).toBeNull()
})

test('Icon-Trigger ist eine benannte Icon-only-Schaltfläche', () => {
  render(<SoloTrigger variant="icon" icon="info" label="Sitzungscode anzeigen" haspopup="dialog" />)

  const trigger = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  expect(trigger.classList.contains('icon-button')).toBe(true)
  expect(trigger.classList.contains('menu-trigger')).toBe(true)
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')

  const svgs = trigger.querySelectorAll('svg')
  expect(svgs).toHaveLength(1)
  expect(svgs[0].getAttribute('role')).toBe('img')
  expect(svgs[0].getAttribute('aria-label')).toBe('Sitzungscode anzeigen')
})

// --- Requirement: Popover -------------------------------------------------------------------

test('Popover öffnet mit Fokus in der Box', () => {
  render(<CodePopover />)

  const trigger = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  fireEvent.click(trigger)

  const dialog = screen.getByRole('dialog', { name: 'Sitzungscode' })
  expect(within(dialog).getByText('ABC234')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Kopieren' })).toBeTruthy()
  expect(dialog.getAttribute('tabindex')).toBe('-1')
  expect(dialog.getAttribute('aria-modal')).toBeNull()
  expect(document.activeElement).toBe(dialog)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(document.querySelector('.modal-backdrop')).toBeNull()
})

test('Escape schließt den Popover und gibt den Fokus zurück', () => {
  render(<CodePopover />)
  const trigger = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  fireEvent.click(trigger)

  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Sitzungscode' }), { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Klick außerhalb schließt den Popover', () => {
  render(<CodePopover />)
  const trigger = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  fireEvent.click(trigger)

  fireEvent.mouseDown(document.body)

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('Erneuter Klick auf den Trigger schließt den Popover', () => {
  render(<CodePopover />)
  const trigger = screen.getByRole('button', { name: 'Sitzungscode anzeigen' })
  fireEvent.click(trigger)
  fireEvent.click(trigger)

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

// --- Requirement: Stylesheet der Menüs ------------------------------------------------------
// Das Stylesheet als Text (Helfer wie in der Theme-/Dialog-Suite, dort dupliziert).

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

const MENU_SELEKTOREN = ['.menu', '.menu-item', '.menu-item--danger', '.menu-trigger', '.popover']
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)'

test('Menü-Selektoren vorhanden', () => {
  const css = stripComments(readText('src/client/app/theme.css'))
  const norm = normalizeWs(css)
  const fehlend = MENU_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))
  expect(fehlend).toEqual([])

  const medien = [...norm.matchAll(/@media([^{]*)\{/g)].map((m) => normalizeWs(m[1]))
  expect(medien).toHaveLength(1)
  expect(medien[0]).toBe(MOTION_QUERY)
})
