// Stylesheet-Szenario „Leisten-Selektoren vorhanden" der Capability `player-bar` aus
// openspec/changes/add-player-bar/specs/player-bar/spec.md (#98), Requirement „Stylesheet der
// Spieler-Leiste". Testname = Szenarioname (constitution.md §4.1).
//
// Das Stylesheet wird als Text gelesen und geparst — dieselben Helfer wie in den bestehenden
// Stylesheet-Suiten (tests/session-tabs-theme.unit.test.ts, tests/ui-theme.unit.test.ts):
// Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media` per
// Klammerzaehlung (design.md D5). Ein Unit-Test ohne DOM, daher kein jsdom-Docblock.
//
// Rote Phase (constitution.md §3.1): der Abschnitt „Spieler-Leiste" des Stylesheets (design.md
// D4) mit den zwoelf Leisten-Selektoren existiert noch nicht; die Assertion listet die
// fehlenden Selektoren.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STYLESHEET = 'src/client/app/theme.css'

const LEISTEN_SELEKTOREN = [
  '.player-bar',
  '.player-bar__group',
  '.player-bar__identity',
  '.player-bar__avatar',
  '.player-bar__name',
  '.player-bar__triggers',
  '.player-bar__trigger',
  '.player-bar__connection',
  '.player-bar__badge-note',
  '.badge',
  '.badge--gold',
  '.badge--teal',
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

test('Leisten-Selektoren vorhanden', () => {
  const stripped = stripComments(readText(STYLESHEET))
  const norm = normalizeWs(stripped)

  // Jeder der zwoelf Leisten-Selektoren ist vorhanden.
  const fehlend = LEISTEN_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))
  expect(fehlend).toEqual([])

  // Die Datei enthaelt genau ein `@media`, und das ist die Bewegungsabfrage.
  const medien = stripped.match(/@media/g) ?? []
  expect(medien).toHaveLength(1)
  expect(stripped).toMatch(/@media[^{]*prefers-reduced-motion/)
})
