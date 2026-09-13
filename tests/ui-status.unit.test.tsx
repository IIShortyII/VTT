/** @jest-environment jsdom */
// Komponententests zum Capability `ui-status` aus
// openspec/changes/add-ui-status/specs/ui-status/spec.md (Issue #91). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname.
//
// Geprueft wird, *was* die Bausteine rendern — nicht, wie sie aussehen (AGENTS.md: Rendering
// nimmt der menschliche App-Test ab). Die drei Bausteine `StatusBanner`, `MapOverlay` und
// `EmptyState` werden direkt aus `src/client/ui/status.tsx` gerendert, ohne `App`
// (design.md D9 „Baustein-Szenarien"). Das Stylesheet-Szenario liest `theme.css` als Text
// von der Platte (dieselben Helfer wie die Theme-/Formular-Suite, design.md D9 „Stylesheet").
//
// Diese Datei liegt bewusst getrennt: importiert der noch fehlende Modulpfad
// `src/client/ui/status.tsx` nicht, reisst der Ladefehler nur diese Suite, nicht die
// bestehenden Raum-Suiten (design.md D9, Delegationsauftrag).
//
// Rote Phase (constitution.md §3.1): das Modul `src/client/ui/status.tsx` existiert noch nicht,
// und der Stylesheet-Abschnitt „Zustandsanzeigen" fehlt in `theme.css`. Die Baustein-Szenarien
// scheitern am fehlenden Modul, das Stylesheet-Szenario an der Selektor-Assertion — der
// erwartete rote Grund, kein Tippfehler im Test.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'

import { EmptyState, MapOverlay, StatusBanner } from '../src/client/ui/status.js'

// --- Requirement: Zustandsbanner ------------------------------------------------------------

test('Banner rendert Text mit Rolle status', () => {
  render(<StatusBanner>Verbindung unterbrochen — verbinde neu…</StatusBanner>)

  // Genau ein Element mit `role="status"`, das die Klasse `status-banner` traegt.
  const stati = screen.getAllByRole('status')
  expect(stati).toHaveLength(1)
  const banner = stati[0]
  expect(banner.classList.contains('status-banner')).toBe(true)

  // Der uebergebene Text steht darin.
  expect(within(banner).getByText('Verbindung unterbrochen — verbinde neu…')).toBeTruthy()

  // Ein `<svg>` ohne zugaenglichen Namen (dekoratives Icon `warning`, `aria-hidden`) —
  // es taucht daher nicht als benannte Grafik im Zugaenglichkeitsbaum auf.
  expect(banner.querySelector('svg')).not.toBeNull()
  expect(within(banner).queryByRole('img')).toBeNull()

  // Kein Element traegt `role="alert"`.
  expect(screen.queryByRole('alert')).toBeNull()
})

// --- Requirement: Karten-Overlay ------------------------------------------------------------

test('Overlay ist eine benannte Region mit Titel und Subline', () => {
  render(<MapOverlay title="Pausiert" subline="Die Spielleitung hat die Sitzung angehalten." icon="pause" />)

  // Region, benannt nach dem Titel (`aria-labelledby`), mit der Klasse `map-overlay`.
  const region = screen.getByRole('region', { name: 'Pausiert' })
  expect(region.classList.contains('map-overlay')).toBe(true)

  // Titel in `map-overlay-title`, Subline in `map-overlay-subline`.
  const titel = within(region).getByText('Pausiert')
  expect(titel.classList.contains('map-overlay-title')).toBe(true)
  const subline = within(region).getByText('Die Spielleitung hat die Sitzung angehalten.')
  expect(subline.classList.contains('map-overlay-subline')).toBe(true)

  // Ein `<svg>` (das uebergebene Icon), und kein `pointer-events` im Inline-Stil.
  expect(region.querySelector('svg')).not.toBeNull()
  expect(region.getAttribute('style') ?? '').not.toContain('pointer-events')
})

// --- Requirement: Leerzustand ---------------------------------------------------------------

test('Leerzustand rendert Titel und Hinweis', () => {
  render(<EmptyState title="Noch keine Tokens" hint="Lege ein Token an, um es auf der Karte zu sehen." />)

  // Ein Absatz `empty-state`, dessen erstes Kind ein `<strong>` mit dem Titel …
  const titel = screen.getByText('Noch keine Tokens')
  expect(titel.tagName).toBe('STRONG')
  const absatz = titel.closest('.empty-state') as HTMLElement | null
  expect(absatz).not.toBeNull()
  expect(absatz?.tagName).toBe('P')
  expect(absatz?.children[0]).toBe(titel)

  // … und dessen zweites Kind ein `<span>` mit dem Hinweis ist.
  const hinweis = screen.getByText('Lege ein Token an, um es auf der Karte zu sehen.')
  expect(hinweis.tagName).toBe('SPAN')
  expect(absatz?.children[1]).toBe(hinweis)
})

// --- Requirement: Stylesheet der Zustandsanzeigen -------------------------------------------
// Helfer wie in tests/ui-form-theme.unit.test.ts (design.md D9: duerfen dupliziert werden).

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

// Ein Selektor ist vorhanden, wenn die normalisierte CSS die Zeichenfolge `<selektor> {`
// enthaelt; die Grenze davor verhindert Teiltreffer (`.map-overlay` vs. `.map-overlay-title`).
function selectorPresent(normalizedCss: string, selector: string): boolean {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  return re.test(normalizedCss)
}

// Der Regelkoerper eines Selektors per Klammerzaehlung (die erste passende Regel).
function ruleBody(strippedCss: string, selector: string): string | null {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  const m = re.exec(strippedCss)
  if (m === null) return null
  const braceStart = strippedCss.indexOf('{', m.index)
  let depth = 1
  let i = braceStart + 1
  for (; i < strippedCss.length && depth > 0; i++) {
    if (strippedCss[i] === '{') depth++
    else if (strippedCss[i] === '}') depth--
  }
  return strippedCss.slice(braceStart + 1, i - 1)
}

// Der Tokenblock reicht von `:root {` bis zur naechsten `}`.
function rootBlock(strippedCss: string): { start: number; end: number } {
  const start = strippedCss.search(/:root\s*\{/)
  if (start < 0) return { start: -1, end: -1 }
  const braceStart = strippedCss.indexOf('{', start)
  const braceEnd = strippedCss.indexOf('}', braceStart)
  return { start, end: braceEnd }
}

const ZUSTANDS_SELEKTOREN = ['.status-banner', '.map-stage', '.map-overlay', '.map-overlay-title', '.map-overlay-subline']

test('Stylesheet enthält die Selektoren und hält den Vertrag', () => {
  const stripped = stripComments(readText(STYLESHEET))
  const norm = normalizeWs(stripped)

  // Je eine Regel fuer die fuenf Selektoren.
  const fehlend = ZUSTANDS_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))

  // `.map-stage` setzt `position: relative`, `.map-overlay` `position: absolute`.
  const stageBody = normalizeWs(ruleBody(stripped, '.map-stage') ?? '')
  const overlayBody = normalizeWs(ruleBody(stripped, '.map-overlay') ?? '')

  // Ausserhalb des Tokenblocks kein Hex-, `rgb(`- oder `hsl(`-Farbwert.
  const { start, end } = rootBlock(stripped)
  let ausserhalb = stripped
  if (start >= 0 && end >= 0) {
    ausserhalb = stripped.slice(0, start) + stripped.slice(end + 1)
  }
  const hexWerte = ausserhalb.match(/#[0-9a-f]{3,8}/gi) ?? []
  const farbFunktionen = ausserhalb.match(/\b(rgba?|hsla?)\s*\(/gi) ?? []

  // Genau ein `@media`-Block im gesamten Stylesheet.
  const mediaZahl = (stripped.match(/@media/g) ?? []).length

  // Keine der fuenf Regeln enthaelt `animation` oder `transition`.
  const bewegungInRegeln = ZUSTANDS_SELEKTOREN.filter((sel) => {
    const body = ruleBody(stripped, sel) ?? ''
    return /\b(animation|transition)\b/.test(body)
  })

  expect({
    fehlendeSelektoren: fehlend,
    stageRelative: /position:\s*relative/.test(stageBody),
    overlayAbsolute: /position:\s*absolute/.test(overlayBody),
    farbwerteAusserhalb: [...hexWerte, ...farbFunktionen],
    mediaBloecke: mediaZahl,
    regelnMitBewegung: bewegungInRegeln,
  }).toEqual({
    fehlendeSelektoren: [],
    stageRelative: true,
    overlayAbsolute: true,
    farbwerteAusserhalb: [],
    mediaBloecke: 1,
    regelnMitBewegung: [],
  })
})
