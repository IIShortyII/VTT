/** @jest-environment jsdom */
// Komponententests zum Capability `ui-toolbar` aus
// openspec/changes/add-ui-toolbar/specs/ui-toolbar/spec.md (Issue #96). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname, gruppiert per
// `describe` je Requirement (Werkzeugleiste, Tastenkuerzel, Umschalt-Chips, Farbchips).
//
// Geprueft wird der oeffentliche Vertrag der drei Komponenten aus `src/client/ui/toolbar.tsx`
// (design.md D1-D3): `Toolbar` (`role="toolbar"`, Icon-Werkzeugbuttons mit `aria-pressed`/
// `title`/`aria-label`, bereichsweite Tastenkuerzel), `ChipGroup` (`role="group"`,
// aria-pressed-Umschalter) und `ColorChipGroup` (Farbchips). Elemente ausschliesslich ueber
// getByRole mit zugaenglichem Namen (kein `querySelector`).
//
// Rote Phase (constitution.md §3.1): das Modul `src/client/ui/toolbar.tsx` existiert noch nicht.
// Es wird per dynamischem Import ueber eine als `string` typisierte Pfad-Variable geladen (kein
// statischer Import — der wuerde die ganze Suite am Modul-Ladefehler scheitern lassen, also am
// falschen Grund) und faellt bei Fehlschlag auf `null` zurueck. Fehlt die Komponente, rendert
// der Test ein `<div>`; die THEN-Abfragen (`getByRole('toolbar')`, `aria-pressed`, `onSelect`)
// scheitern dann an SICH SELBST — die erwartete Assertion, kein Setup-/Compile-Fehler.

import { createElement, type ComponentType } from 'react'

import { fireEvent, render, screen } from '@testing-library/react'

// --- Dynamischer Import ueber Pfad-Variable -------------------------------------------------
// `: string` weitet den Typ, damit TypeScript den Import nicht statisch aufloest.
const TOOLBAR_PATH: string = '../src/client/ui/toolbar.js'

async function loadModule(path: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(path)) as Record<string, unknown>
  } catch {
    return null
  }
}

// Lose Prop-Typen (design.md D1-D3) — die echten Interfaces liegen im noch fehlenden Modul.
type ToolbarComponent = ComponentType<{
  label: string
  tools: Array<{ id: string; icon: string; label: string; shortcut?: string }>
  active: string
  onSelect: (id: string) => void
}>
type ChipGroupComponent = ComponentType<{
  label: string
  options: Array<{ id: string; label: string }>
  value: string
  onSelect: (id: string) => void
  disabled?: boolean
}>
type ColorChipGroupComponent = ComponentType<{
  label: string
  colors: Array<{ id: string; label: string }>
  value: string
  onSelect: (id: string) => void
  disabled?: boolean
}>

async function loadExport<T>(name: string): Promise<T | null> {
  const mod = await loadModule(TOOLBAR_PATH)
  return (mod?.[name] as T | undefined) ?? null
}

function pressed(el: Element): string | null {
  return el.getAttribute('aria-pressed')
}

// --- Requirement: Werkzeugleiste ------------------------------------------------------------

describe('Werkzeugleiste', () => {
  test('Aktives Werkzeug trägt aria-pressed true', async () => {
    const Toolbar = await loadExport<ToolbarComponent>('Toolbar')
    render(
      Toolbar
        ? createElement(Toolbar, {
            label: 'Nebelwerkzeug',
            active: 'pan',
            onSelect: () => {},
            tools: [
              { id: 'pan', icon: 'move', label: 'Schwenken' },
              { id: 'reveal', icon: 'reveal', label: 'Aufdecken', shortcut: 'R' },
            ],
          })
        : createElement('div'),
    )

    expect(pressed(screen.getByRole('button', { name: 'Schwenken' }))).toBe('true')
    expect(pressed(screen.getByRole('button', { name: 'Aufdecken' }))).toBe('false')
  })

  test('Kürzel steht im Titel', async () => {
    const Toolbar = await loadExport<ToolbarComponent>('Toolbar')
    render(
      Toolbar
        ? createElement(Toolbar, {
            label: 'Nebelwerkzeug',
            active: 'pan',
            onSelect: () => {},
            tools: [
              { id: 'reveal', icon: 'reveal', label: 'Aufdecken', shortcut: 'R' },
              { id: 'pan', icon: 'move', label: 'Schwenken' },
            ],
          })
        : createElement('div'),
    )

    expect(screen.getByRole('button', { name: 'Aufdecken' }).getAttribute('title')).toBe('Aufdecken (R)')
    expect(screen.getByRole('button', { name: 'Schwenken' }).getAttribute('title')).toBe('Schwenken')
  })

  test('Klick meldet das Werkzeug', async () => {
    const Toolbar = await loadExport<ToolbarComponent>('Toolbar')
    const onSelect = jest.fn()
    render(
      Toolbar
        ? createElement(Toolbar, {
            label: 'Nebelwerkzeug',
            active: 'pan',
            onSelect,
            tools: [
              { id: 'pan', icon: 'move', label: 'Schwenken' },
              { id: 'reveal', icon: 'reveal', label: 'Aufdecken', shortcut: 'R' },
            ],
          })
        : createElement('div'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aufdecken' }))
    expect(onSelect).toHaveBeenCalledWith('reveal')
  })
})

// --- Requirement: Tastenkürzel der Werkzeugleiste -------------------------------------------

describe('Tastenkürzel der Werkzeugleiste', () => {
  test('Kürzel im Bereich wechselt das Werkzeug', async () => {
    const Toolbar = await loadExport<ToolbarComponent>('Toolbar')
    const onSelect = jest.fn()
    render(
      Toolbar
        ? createElement(Toolbar, {
            label: 'Nebelwerkzeug',
            active: 'pan',
            onSelect,
            tools: [
              { id: 'pan', icon: 'move', label: 'Schwenken' },
              { id: 'reveal', icon: 'reveal', label: 'Aufdecken', shortcut: 'R' },
            ],
          })
        : createElement('div'),
    )

    // Fokus liegt auf einer Schaltflaeche der Werkzeugleiste (diese Abfrage scheitert in der
    // roten Phase — die Werkzeugleiste existiert noch nicht).
    const button = screen.getByRole('button', { name: 'Schwenken' })
    button.focus()
    fireEvent.keyDown(button, { key: 'r' })

    expect(onSelect).toHaveBeenCalledWith('reveal')
  })

  test('Taste ohne Kürzel meldet nichts', async () => {
    const Toolbar = await loadExport<ToolbarComponent>('Toolbar')
    const onSelect = jest.fn()
    render(
      Toolbar
        ? createElement(Toolbar, {
            label: 'Nebelwerkzeug',
            active: 'pan',
            onSelect,
            tools: [
              { id: 'reveal', icon: 'reveal', label: 'Aufdecken', shortcut: 'R' },
              { id: 'hide', icon: 'hide', label: 'Verdecken', shortcut: 'H' },
            ],
          })
        : createElement('div'),
    )

    // Fokus in die Werkzeugleiste (Abfrage rot ohne Implementierung), dann eine Taste ohne Kuerzel.
    const button = screen.getByRole('button', { name: 'Aufdecken' })
    button.focus()
    fireEvent.keyDown(button, { key: 'x' })

    expect(onSelect).not.toHaveBeenCalled()
  })
})

// --- Requirement: Umschalt-Chips ------------------------------------------------------------

describe('Umschalt-Chips', () => {
  test('Ausgewählter Chip trägt aria-pressed true', async () => {
    const ChipGroup = await loadExport<ChipGroupComponent>('ChipGroup')
    render(
      ChipGroup
        ? createElement(ChipGroup, {
            label: 'Modus',
            value: 'gerastert',
            onSelect: () => {},
            options: [
              { id: 'gerastert', label: 'Gerastert' },
              { id: 'frei', label: 'Frei' },
            ],
          })
        : createElement('div'),
    )

    expect(pressed(screen.getByRole('button', { name: 'Gerastert' }))).toBe('true')
    expect(pressed(screen.getByRole('button', { name: 'Frei' }))).toBe('false')
  })

  test('Deaktivierte Gruppe deaktiviert jede Schaltfläche', async () => {
    const ChipGroup = await loadExport<ChipGroupComponent>('ChipGroup')
    render(
      ChipGroup
        ? createElement(ChipGroup, {
            label: 'Modus',
            value: 'gerastert',
            onSelect: () => {},
            disabled: true,
            options: [
              { id: 'gerastert', label: 'Gerastert' },
              { id: 'frei', label: 'Frei' },
            ],
          })
        : createElement('div'),
    )

    const gruppe = screen.getByRole('group', { name: 'Modus' })
    const knoepfe = screen.getAllByRole('button')
    expect(knoepfe.length).toBeGreaterThan(0)
    for (const knopf of knoepfe) {
      expect(gruppe.contains(knopf)).toBe(true)
      expect((knopf as HTMLButtonElement).disabled).toBe(true)
    }
  })

  test('Klick auf einen Chip meldet die Option', async () => {
    const ChipGroup = await loadExport<ChipGroupComponent>('ChipGroup')
    const onSelect = jest.fn()
    render(
      ChipGroup
        ? createElement(ChipGroup, {
            label: 'Modus',
            value: 'gerastert',
            onSelect,
            options: [
              { id: 'gerastert', label: 'Gerastert' },
              { id: 'frei', label: 'Frei' },
            ],
          })
        : createElement('div'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Frei' }))
    expect(onSelect).toHaveBeenCalledWith('frei')
  })
})

// --- Requirement: Farbchips -----------------------------------------------------------------

describe('Farbchips', () => {
  test('Ausgewählter Farbchip trägt aria-pressed true', async () => {
    const ColorChipGroup = await loadExport<ColorChipGroupComponent>('ColorChipGroup')
    render(
      ColorChipGroup
        ? createElement(ColorChipGroup, {
            label: 'Farbe',
            value: 'rot',
            onSelect: () => {},
            colors: [
              { id: 'rot', label: 'Rot' },
              { id: 'blau', label: 'Blau' },
            ],
          })
        : createElement('div'),
    )

    expect(pressed(screen.getByRole('button', { name: 'Rot' }))).toBe('true')
    expect(pressed(screen.getByRole('button', { name: 'Blau' }))).toBe('false')
  })

  test('Klick auf einen Farbchip meldet die Farbe', async () => {
    const ColorChipGroup = await loadExport<ColorChipGroupComponent>('ColorChipGroup')
    const onSelect = jest.fn()
    render(
      ColorChipGroup
        ? createElement(ColorChipGroup, {
            label: 'Farbe',
            value: 'rot',
            onSelect,
            colors: [
              { id: 'rot', label: 'Rot' },
              { id: 'blau', label: 'Blau' },
            ],
          })
        : createElement('div'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Blau' }))
    expect(onSelect).toHaveBeenCalledWith('blau')
  })

  test('Deaktivierte Farbgruppe deaktiviert jede Schaltfläche', async () => {
    const ColorChipGroup = await loadExport<ColorChipGroupComponent>('ColorChipGroup')
    render(
      ColorChipGroup
        ? createElement(ColorChipGroup, {
            label: 'Farbe',
            value: 'rot',
            onSelect: () => {},
            disabled: true,
            colors: [
              { id: 'rot', label: 'Rot' },
              { id: 'blau', label: 'Blau' },
            ],
          })
        : createElement('div'),
    )

    const gruppe = screen.getByRole('group', { name: 'Farbe' })
    const knoepfe = screen.getAllByRole('button')
    expect(knoepfe.length).toBeGreaterThan(0)
    for (const knopf of knoepfe) {
      expect(gruppe.contains(knopf)).toBe(true)
      expect((knopf as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
