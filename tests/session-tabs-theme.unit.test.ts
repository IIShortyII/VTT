// Stylesheet-Szenario „Bereichs-Selektoren vorhanden" der Capability `session-tabs` aus
// openspec/changes/add-session-tabs/specs/session-tabs/spec.md (#94), Requirement „Stylesheet
// der Bereiche". Testname = Szenarioname (constitution.md §4.1).
//
// Das Stylesheet wird als Text gelesen und geparst — dieselben Helfer wie in der Session-Bar-Suite
// (tests/session-bar-ui.unit.test.tsx) bzw. tests/ui-theme.unit.test.ts: Kommentare entfernen,
// Whitespace normalisieren, `<selektor> {` suchen (spec.md „Begriffe"). Ein Unit-Test ohne DOM
// (reine Textpruefung), daher kein jsdom-Docblock.
//
// Rote Phase (constitution.md §3.1): der Abschnitt „Bereiche" des Stylesheets (design.md D8) mit
// den zehn Bereichs-Selektoren existiert noch nicht; die Assertion listet die fehlenden Selektoren.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STYLESHEET = 'src/client/app/theme.css'

const BEREICHS_SELEKTOREN = [
  'main.app-shell--wide',
  '.tab-list',
  '.tab',
  '.tab[aria-selected="true"]',
  '.tab-panel',
  '.tab-panel[hidden]',
  '.panel--wide',
  '.map-caption',
  '.map-stage',
  '.setup-cluster',
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

function ruleBody(normalizedCss: string, selector: string): string | null {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  const idx = normalizedCss.search(re)
  if (idx < 0) return null
  const braceStart = normalizedCss.indexOf('{', idx)
  const braceEnd = normalizedCss.indexOf('}', braceStart)
  if (braceStart < 0 || braceEnd < 0) return null
  return normalizedCss.slice(braceStart + 1, braceEnd)
}

test('Bereichs-Selektoren vorhanden', () => {
  const stripped = stripComments(readText(STYLESHEET))
  const norm = normalizeWs(stripped)

  // Jeder der zehn Bereichs-Selektoren ist vorhanden.
  const fehlend = BEREICHS_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))
  expect(fehlend).toEqual([])

  // `.tab-panel[hidden]` enthaelt `display: none`.
  expect(normalizeWs(ruleBody(norm, '.tab-panel[hidden]') ?? '')).toMatch(/display:\s*none/)

  // Die Datei enthaelt weiterhin genau ein `@media` (die Bewegungsabfrage).
  const medien = stripped.match(/@media/g) ?? []
  expect(medien).toHaveLength(1)
  expect(stripped).toMatch(/@media[^{]*prefers-reduced-motion/)
})
