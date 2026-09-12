/** @jest-environment jsdom */
// Komponenten- und Katalogtests zum Capability `ui-icons` aus
// openspec/changes/add-icon-registry/specs/ui-icons/spec.md (tasks.md 1.1). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname, gruppiert per
// `describe` je Requirement.
//
// Rote Phase (design.md D8): die neuen Module `src/client/ui/icons.ts` und
// `src/client/ui/Icon.tsx` existieren noch nicht. Sie werden per dynamischem Import ueber eine
// als `string` typisierte Pfad-Variable geladen (kein statischer Import — der wuerde die Suite
// am Typfehler scheitern lassen) und fallen bei Fehlschlag auf `null` zurueck. Jede Assertion
// wird dann an SICH SELBST rot ("keine Registry", "kein svg"), nicht an einem Lade- oder
// Typfehler (constitution.md §3.1). Die bestehenden Module (`conditions.ts`, `token.ts`)
// werden statisch importiert; Felder, die es noch nicht gibt (`icon`), ueber
// `Record<string, unknown>` gelesen; `TokenIconSchema` ueber `safeParse`. Das
// Stylesheet-Szenario liest `theme.css` als Text (Helfer wie in der Theme-Suite dupliziert,
// die Theme-Suite selbst bleibt unangetastet). Die Canvas-Fassade wird nicht beruehrt.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen } from '@testing-library/react'
import { createElement, type ComponentType } from 'react'

import { CONDITION_CATALOG } from '../src/client/session/conditions.js'
import { TOKEN_ICONS, TokenIconSchema } from '../src/shared/token.js'

// --- Dynamischer Import ueber Pfad-Variablen (design.md D8) ---------------------------------
// `: string` weitet den Typ, damit TypeScript den Import nicht statisch aufloest.
const ICONS_PATH: string = '../src/client/ui/icons.js'
const ICON_PATH: string = '../src/client/ui/Icon.js'

async function loadModule(path: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(path)) as Record<string, unknown>
  } catch {
    return null
  }
}

type IconComponent = ComponentType<{ name: string; label?: string }>
type IconButtonComponent = ComponentType<{ name: string; label: string }>

async function loadIcon(): Promise<IconComponent | null> {
  const mod = await loadModule(ICON_PATH)
  return (mod?.Icon as IconComponent | undefined) ?? null
}

async function loadIconButton(): Promise<IconButtonComponent | null> {
  const mod = await loadModule(ICON_PATH)
  return (mod?.IconButton as IconButtonComponent | undefined) ?? null
}

// --- Erwartete Registry-Namen (spec.md "Registry-Namen", 54 in dieser Reihenfolge) ----------
const EXPECTED_ICON_NAMES: readonly string[] = [
  // Oberflaeche (29)
  'add', 'back', 'ban', 'check', 'chevronDown', 'close', 'delete', 'draw', 'edit', 'end',
  'fog', 'help', 'hide', 'info', 'library', 'lock', 'logout', 'map', 'measure', 'more',
  'pause', 'players', 'reveal', 'settings', 'start', 'token', 'upload', 'user', 'warning',
  // Symbolkatalog (10)
  'fighter', 'guardian', 'undead', 'dragon', 'mage', 'archer', 'royal', 'beast', 'vermin', 'fire',
  // Zustandskatalog (15)
  'blinded', 'charmed', 'deafened', 'exhausted', 'frightened', 'grappled', 'incapacitated',
  'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
]

// --- Erwartete Kataloge (spec.md "Begriffe") ------------------------------------------------
const EXPECTED_CONDITIONS: ReadonlyArray<{ label: string; icon: string }> = [
  { label: 'Blind', icon: 'blinded' },
  { label: 'Bezaubert', icon: 'charmed' },
  { label: 'Taub', icon: 'deafened' },
  { label: 'Erschöpft', icon: 'exhausted' },
  { label: 'Verängstigt', icon: 'frightened' },
  { label: 'Gepackt', icon: 'grappled' },
  { label: 'Kampfunfähig', icon: 'incapacitated' },
  { label: 'Unsichtbar', icon: 'invisible' },
  { label: 'Gelähmt', icon: 'paralyzed' },
  { label: 'Versteinert', icon: 'petrified' },
  { label: 'Vergiftet', icon: 'poisoned' },
  { label: 'Liegend', icon: 'prone' },
  { label: 'Festgehalten', icon: 'restrained' },
  { label: 'Betäubt', icon: 'stunned' },
  { label: 'Bewusstlos', icon: 'unconscious' },
]

const EXPECTED_TOKEN_ICONS: readonly string[] = [
  'fighter', 'guardian', 'undead', 'dragon', 'mage', 'archer', 'royal', 'beast', 'vermin', 'fire',
]

// --- Stylesheet-Helfer (dupliziert aus tests/ui-theme.unit.test.ts, design.md D8) -----------
const STYLESHEET = 'src/client/app/theme.css'

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

// --- Requirement: Registry ------------------------------------------------------------------

describe('Registry', () => {
  test('Jeder Registry-Name rendert ein SVG', async () => {
    const iconsMod = await loadModule(ICONS_PATH)
    const Icon = await loadIcon()
    const names = (iconsMod?.ICON_NAMES as readonly string[] | undefined) ?? EXPECTED_ICON_NAMES

    const probleme: string[] = []
    for (const name of names) {
      if (!Icon) {
        probleme.push(`${name}: keine Icon-Komponente`)
        continue
      }
      const { container, unmount } = render(createElement(Icon, { name }))
      const svgs = container.querySelectorAll('svg')
      if (svgs.length !== 1) {
        probleme.push(`${name}: ${svgs.length} svg`)
      } else {
        const svg = svgs[0]
        if (svg.getAttribute('width') !== '1em' || svg.getAttribute('height') !== '1em') {
          probleme.push(`${name}: ${svg.getAttribute('width')}x${svg.getAttribute('height')}`)
        }
      }
      unmount()
    }
    expect(probleme).toEqual([])
  })

  test('Registry enthält die festgelegten Namen', async () => {
    const iconsMod = await loadModule(ICONS_PATH)
    const iconNames = (iconsMod?.ICON_NAMES as readonly string[] | undefined) ?? null
    const registry = (iconsMod?.ICON_REGISTRY as Record<string, unknown> | undefined) ?? null

    expect(iconNames ? [...iconNames] : null).toEqual([...EXPECTED_ICON_NAMES])
    expect(registry ? Object.keys(registry) : null).toEqual([...EXPECTED_ICON_NAMES])
  })
})

// --- Requirement: Zugänglichkeit der Icons --------------------------------------------------

describe('Zugänglichkeit der Icons', () => {
  test('Icon neben Text ist dekorativ', async () => {
    const Icon = await loadIcon()
    const { container } = render(Icon ? createElement(Icon, { name: 'check' }) : createElement('span'))
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.hasAttribute('role')).toBe(false)
    expect(svg?.hasAttribute('aria-label')).toBe(false)
  })

  test('Icon-only-Schaltfläche ist benannt', async () => {
    const IconButton = await loadIconButton()
    render(IconButton ? createElement(IconButton, { name: 'delete', label: 'Goblin entfernen' }) : createElement('span'))

    const button = screen.queryByRole('button', { name: 'Goblin entfernen' })
    expect(button).not.toBeNull()
    expect(button?.classList.contains('icon-button')).toBe(true)

    const svgs = button?.querySelectorAll('svg') ?? []
    expect(svgs.length).toBe(1)
    expect(svgs[0]?.getAttribute('role')).toBe('img')
    expect(svgs[0]?.getAttribute('aria-label')).toBe('Goblin entfernen')
    expect(button?.textContent).toBe('')
  })
})

// --- Requirement: Kataloge referenzieren die Registry ---------------------------------------

describe('Kataloge referenzieren die Registry', () => {
  test('Zustandskatalog referenziert bekannte Namen', () => {
    const entries = CONDITION_CATALOG as unknown as ReadonlyArray<Record<string, unknown>>

    expect(entries.length).toBe(15)
    const probleme: string[] = []
    EXPECTED_CONDITIONS.forEach((erwartet, index) => {
      const entry = entries[index]
      if (!entry) {
        probleme.push(`${erwartet.label}: Eintrag fehlt`)
        return
      }
      if (entry.label !== erwartet.label) probleme.push(`#${index}: label ${String(entry.label)}`)
      if (entry.icon !== erwartet.icon) probleme.push(`${erwartet.label}: icon ${String(entry.icon)}`)
      if (!EXPECTED_ICON_NAMES.includes(erwartet.icon)) probleme.push(`${erwartet.label}: icon nicht in ICON_NAMES`)
      if ('symbol' in entry) probleme.push(`${erwartet.label}: hat Feld symbol`)
    })
    expect(probleme).toEqual([])
  })

  test('Symbolkatalog referenziert bekannte Namen', () => {
    expect([...TOKEN_ICONS]).toEqual([...EXPECTED_TOKEN_ICONS])
    for (const name of EXPECTED_TOKEN_ICONS) {
      expect(EXPECTED_ICON_NAMES).toContain(name)
    }
    expect(TokenIconSchema.safeParse('undead').success).toBe(true)
    expect(TokenIconSchema.safeParse('💀').success).toBe(false)
  })
})

// --- Requirement: Stylesheet der Icons ------------------------------------------------------

describe('Stylesheet der Icons', () => {
  test('Icon-Selektoren vorhanden', () => {
    const css = normalizeWs(stripComments(readText(STYLESHEET)))

    expect(selectorPresent(css, '.icon')).toBe(true)
    expect(selectorPresent(css, '.icon-button')).toBe(true)
  })
})
