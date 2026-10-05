// Unit-Tests zum Requirement "Icon-Markup für die Karte" aus
// openspec/changes/fix-icon-arc-flags/specs/ui-icons/spec.md (Issue #124). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname. Reine Logik ohne
// Pixi -> Unit-Test unter der node-Umgebung (design.md D5).
//
// Rote Phase: `normalizeArcFlags` ist in src/client/ui/icon-svg.ts noch nicht exportiert. Die
// Funktion wird deshalb ueber eine als `string` typisierte Pfad-Variable dynamisch geladen
// (Muster aus tests/map-viewport.unit.test.ts), damit ein fehlender Export nicht als
// ts-jest-Compile-Fehler endet, sondern an der Assertion "keine normalizeArcFlags-Funktion"
// rot wird (§3.1).

import { iconSvg } from '../src/client/ui/icon-svg.js'
import { ICON_NAMES } from '../src/client/ui/icons.js'

type NormalizeArcFlags = (d: string) => string

const ICON_SVG_PATH: string = '../src/client/ui/icon-svg.js'

async function loadNormalizeArcFlags(): Promise<NormalizeArcFlags> {
  const mod = (await import(ICON_SVG_PATH)) as Record<string, unknown>
  const normalizeArcFlags = mod.normalizeArcFlags
  expect(typeof normalizeArcFlags).toBe('function')
  return normalizeArcFlags as NormalizeArcFlags
}

test('Kompakte Arc-Flags werden getrennt', async () => {
  const normalizeArcFlags = await loadNormalizeArcFlags()

  const eingaben = ['M9 16a5 5 0 016 0', 'A2 2 0 0021 5.172', 'a1.6 1.6 0 012.277 0', 'a1.5 1.5 0 00-2.474-1.561']

  expect(eingaben.map((d) => normalizeArcFlags(d))).toEqual([
    'M9 16a5 5 0 0 1 6 0',
    'A2 2 0 0 0 21 5.172',
    'a1.6 1.6 0 0 1 2.277 0',
    'a1.5 1.5 0 0 0-2.474-1.561',
  ])
})

test('Folgesegmente eines Arc-Befehls werden getrennt', async () => {
  const normalizeArcFlags = await loadNormalizeArcFlags()

  expect(normalizeArcFlags('a1 1 0 011 1 1 1 0 012 2')).toBe('a1 1 0 0 1 1 1 1 1 0 0 1 2 2')
})

test('Getrennte Pfaddaten bleiben unverändert', async () => {
  const normalizeArcFlags = await loadNormalizeArcFlags()

  const eingaben = ['M3 11a10 10 0 0 1 10 10', 'M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18']

  for (const d of eingaben) {
    expect(normalizeArcFlags(d)).toBe(d)
  }
})

test('Jedes Registry-Icon liefert getrennte Arc-Flags', async () => {
  const normalizeArcFlags = await loadNormalizeArcFlags()

  for (const name of ICON_NAMES) {
    const markup = iconSvg(name, '#ffffff')
    const dWerte = [...markup.matchAll(/\sd="([^"]*)"/g)].map((treffer) => treffer[1] ?? '')

    // Icons nur aus circle/rect/line haben kein d-Attribut und tragen nichts bei (Spec-THEN).
    for (const d of dWerte) {
      expect({ name, d: normalizeArcFlags(d) }).toEqual({ name, d })
    }
  }

  expect(iconSvg('frightened', '#ffffff')).toContain('d="M9 16a5 5 0 0 1 6 0"')
})
