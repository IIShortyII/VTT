// Unit-Tests zum Capability `ui-theme` aus
// openspec/changes/add-ui-theme/specs/ui-theme/spec.md (tasks.md 1.1). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname, gruppiert per
// `describe` je Requirement. Umgebung `node`, kein jsdom: die Dateien werden als Text von der
// Platte gelesen, nicht gerendert (design.md D7).
//
// Rote Phase: `src/client/app/theme.css` existiert noch nicht und `src/client/main.tsx`
// enthaelt die Import-Zeile noch nicht. Die Dateien werden mit Fallback auf '' gelesen
// (design.md D7 Nr. 9), damit jedes Szenario an SEINER Assertion rot wird — nicht an einem
// ENOENT oder Typfehler (constitution.md §3.1). Kein CSS-Parser, keine neue Dependency:
// die Helfer unten werten den Text selbst aus.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// --- Dateien lesen --------------------------------------------------------------------------

function readText(relPath: string): string {
  try {
    return readFileSync(resolve(process.cwd(), relPath), 'utf8')
  } catch {
    return ''
  }
}

const STYLESHEET = 'src/client/app/theme.css'
const ENTRY = 'src/client/main.tsx'
const INDEX_HTML = 'index.html'

// --- Textaufbereitung -----------------------------------------------------------------------

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- Tokenblock -----------------------------------------------------------------------------

interface RootBlock {
  count: number
  block: string
  start: number
  end: number
}

// Der Tokenblock reicht von `:root {` bis zur naechsten `}` (D7 Nr. 2, keine verschachtelten
// Klammern). `count` zaehlt, wie oft `:root {` vorkommt (Szenario "Tokens vollstaendig").
function rootBlockInfo(strippedCss: string): RootBlock {
  const matches = strippedCss.match(/:root\s*\{/g) ?? []
  const start = strippedCss.search(/:root\s*\{/)
  if (start < 0) {
    return { count: 0, block: '', start: -1, end: -1 }
  }
  const braceStart = strippedCss.indexOf('{', start)
  const braceEnd = strippedCss.indexOf('}', braceStart)
  const block = braceEnd >= 0 ? strippedCss.slice(braceStart + 1, braceEnd) : ''
  return { count: matches.length, block, start, end: braceEnd }
}

// Deklarationen `--name: wert;` im Tokenblock in eine Map. Werte, die selbst `var(--x)`
// oder ein Verlauf sind, bleiben als Text stehen und werden bei Bedarf aufgeloest.
function parseTokens(block: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    if (!map.has(m[1])) {
      map.set(m[1], m[2].trim())
    }
  }
  return map
}

// Alle deklarierten Token-Namen (mit Mehrfachnennungen), um "genau einmal" zu pruefen. Ein
// `var(--x)` im Wert wird nicht mitgezaehlt: dort folgt auf den Namen `)`, kein `:`.
function tokenNames(block: string): string[] {
  const names: string[] = []
  const re = /(--[a-z0-9-]+)\s*:/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    names.push(m[1])
  }
  return names
}

const HEX6 = /^#[0-9a-f]{6}$/i

// Loest ein Token bis zum sechsstelligen Hex-Wert auf; die `var(--…)`-Kette wird verfolgt.
// Gibt den Hex-Wert und die Zahl der `var`-Schritte zurueck (Direkter Hex = 0 Schritte).
function resolveWithSteps(
  map: Map<string, string>,
  name: string,
): { hex: string | null; steps: number } {
  let current = name
  for (let steps = 0; steps <= 8; steps++) {
    const value = map.get(current)
    if (value === undefined) {
      return { hex: null, steps }
    }
    if (HEX6.test(value)) {
      return { hex: value, steps }
    }
    const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value)
    if (!varMatch) {
      return { hex: null, steps }
    }
    current = varMatch[1]
  }
  return { hex: null, steps: 9 }
}

function resolveHex(map: Map<string, string>, name: string): string | null {
  return resolveWithSteps(map, name).hex
}

// --- Kontrast nach WCAG 2.1 (spec.md "Begriffe") --------------------------------------------

function relativeLuminance(hex: string | null): number | null {
  if (hex === null || !HEX6.test(hex)) {
    return null
  }
  const int = parseInt(hex.slice(1), 16)
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(hexA: string | null, hexB: string | null): number {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  if (la === null || lb === null) {
    return NaN
  }
  const hell = Math.max(la, lb)
  const dunkel = Math.min(la, lb)
  return (hell + 0.05) / (dunkel + 0.05)
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

// --- Selektor-Praesenz (D7 Nr. 5) -----------------------------------------------------------

// Ein Selektor ist vorhanden, wenn die normalisierte CSS die Zeichenfolge `<selektor> {`
// enthaelt. Die Grenze davor (`(^|[\s{};,])`) verhindert, dass `:focus-visible {` faelschlich
// in `textarea:focus-visible {` oder `.chip {` in `.chip.is-active {` gefunden wird.
function selectorPresent(normalizedCss: string, selector: string): boolean {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  return re.test(normalizedCss)
}

function selectorIndex(normalizedCss: string, selector: string): number {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  return normalizedCss.search(re)
}

// Der Regelrumpf zwischen `{` und der naechsten `}` (Fokusregeln haben keine verschachtelten
// Klammern).
function ruleBody(normalizedCss: string, selector: string): string | null {
  const idx = selectorIndex(normalizedCss, selector)
  if (idx < 0) {
    return null
  }
  const braceStart = normalizedCss.indexOf('{', idx)
  const braceEnd = normalizedCss.indexOf('}', braceStart)
  if (braceStart < 0 || braceEnd < 0) {
    return null
  }
  return normalizedCss.slice(braceStart + 1, braceEnd)
}

// --- @media / Bewegung (D7 Nr. 7) -----------------------------------------------------------

interface MediaBlock {
  query: string
  contentStart: number
  end: number
}

// Alle `@media`-Bloecke per Klammerzaehlung, mit ihrer normalisierten Abfrage.
function mediaBlocks(strippedCss: string): MediaBlock[] {
  const blocks: MediaBlock[] = []
  const re = /@media([^{]*)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(strippedCss)) !== null) {
    const query = normalizeWs(m[1])
    let depth = 1
    let i = m.index + m[0].length
    for (; i < strippedCss.length && depth > 0; i++) {
      if (strippedCss[i] === '{') depth++
      else if (strippedCss[i] === '}') depth--
    }
    blocks.push({ query, contentStart: m.index + m[0].length, end: i })
  }
  return blocks
}

const MOTION_QUERY = '(prefers-reduced-motion: no-preference)'

// --- Externe URL (spec.md "Begriffe") -------------------------------------------------------

function isExternal(url: string): boolean {
  return /^\s*(https?:)?\/\//.test(url)
}

// --- Token-Listen aus spec.md "Begriffe" ----------------------------------------------------

const FARB_TOKENS = [
  '--gray-1',
  '--gray-2',
  '--gray-3',
  '--gray-4',
  '--gray-5',
  '--gray-6',
  '--gray-7',
  '--gray-8',
  '--gray-9',
  '--gray-10',
  '--gray-11',
  '--gray-12',
  '--color-bg',
  '--color-bg-subtle',
  '--color-panel',
  '--color-surface',
  '--color-surface-hover',
  '--color-border-faint',
  '--color-border',
  '--color-border-strong',
  '--color-text',
  '--color-text-muted',
  '--color-text-faint',
  '--input-bg',
  '--accent-9',
  '--gold-1',
  '--gold-2',
  '--gold-border',
  '--gold-inset',
  '--gold-text',
  '--gold-dark',
  '--teal',
  '--teal-bg',
  '--teal-border',
  '--amber',
  '--amber-bg',
  '--amber-border',
  '--red',
  '--red-bg',
  '--red-border',
  '--color-focus',
]

const WEITERE_TOKENS = [
  '--panel-grad',
  '--gold-grad',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
  '--radius-1',
  '--radius-2',
  '--radius-3',
  '--radius-5',
  '--radius-pill',
  '--font-display',
  '--font-sans',
  '--font-mono',
  '--font-size-1',
  '--font-size-2',
  '--font-size-3',
  '--font-size-4',
  '--font-size-hero',
  '--content-max',
  '--shadow-panel',
]

// Textpaare (Vordergrund, Hintergrund) — mind. 4.5
const TEXTPAARE: Array<[string, string]> = [
  ['--color-text', '--color-bg'],
  ['--color-text', '--color-panel'],
  ['--color-text', '--color-surface'],
  ['--color-text-muted', '--color-panel'],
  ['--color-text-muted', '--gray-5'],
  ['--teal', '--teal-bg'],
  ['--amber', '--amber-bg'],
  ['--red', '--red-bg'],
  ['--red', '--color-panel'],
  ['--gold-dark', '--gold-1'],
]

// Nicht-Text-Paare — mind. 3
const NICHTTEXTPAARE: Array<[string, string]> = [
  ['--color-focus', '--color-panel'],
  ['--color-focus', '--color-bg'],
  ['--accent-9', '--input-bg'],
  ['--color-text-faint', '--gray-5'],
]

// Grundelement-Selektoren (22, Reihenfolge innerhalb einer Selektorliste verbindlich)
const GRUNDELEMENT_SELEKTOREN = [
  'body',
  'h1, h2',
  'button',
  'button:hover:not(:disabled)',
  'button:disabled',
  'button.primary',
  'button.danger',
  'button.link',
  'input, select, textarea',
  'input:focus-visible, select:focus-visible, textarea:focus-visible',
  ':focus-visible',
  '.panel',
  '.panel h3',
  '.chip',
  '.chip.is-active',
  '.status-pill',
  '.status-pill--active',
  '.status-pill--paused',
  '.status-pill--ended',
  '.field-label',
  '.field-error',
  '.empty-state',
]

// ============================================================================================

describe('Design-Tokens', () => {
  test('Kontrast der Textpaare', () => {
    const css = readText(STYLESHEET)
    const { block } = rootBlockInfo(stripComments(css))
    const tokens = parseTokens(block)

    const ergebnisse = TEXTPAARE.map(([fg, bg]) => {
      const ratio = contrastRatio(resolveHex(tokens, fg), resolveHex(tokens, bg))
      return { paar: `${fg} auf ${bg}`, ratio: round2(ratio), ok: ratio >= 4.5 }
    })
    const zuNiedrig = ergebnisse.filter((e) => !e.ok)

    expect(zuNiedrig).toEqual([])
  })

  test('Kontrast der Nicht-Text-Paare', () => {
    const css = readText(STYLESHEET)
    const { block } = rootBlockInfo(stripComments(css))
    const tokens = parseTokens(block)

    const ergebnisse = NICHTTEXTPAARE.map(([fg, bg]) => {
      const ratio = contrastRatio(resolveHex(tokens, fg), resolveHex(tokens, bg))
      return { paar: `${fg} auf ${bg}`, ratio: round2(ratio), ok: ratio >= 3 }
    })
    const zuNiedrig = ergebnisse.filter((e) => !e.ok)

    expect(zuNiedrig).toEqual([])
  })

  test('Tokens vollständig und aufgelöst', () => {
    const css = readText(STYLESHEET)
    const { count, block } = rootBlockInfo(stripComments(css))
    const namen = tokenNames(block)
    const tokens = parseTokens(block)

    const alleTokens = [...FARB_TOKENS, ...WEITERE_TOKENS]
    const fehlendOderMehrfach = alleTokens.filter(
      (t) => namen.filter((n) => n === t).length !== 1,
    )
    // Jedes Farb-Token loest sich ueber hoechstens drei var(--…)-Schritte zu einem Hex auf.
    const nichtAufgeloest = FARB_TOKENS.filter((t) => {
      const { hex, steps } = resolveWithSteps(tokens, t)
      return hex === null || steps > 3
    })

    expect({
      rootGenauEinmal: count === 1,
      colorSchemeDark: /color-scheme\s*:\s*dark\s*;/.test(block),
      fehlendOderMehrfach,
      nichtAufgeloest,
    }).toEqual({
      rootGenauEinmal: true,
      colorSchemeDark: true,
      fehlendOderMehrfach: [],
      nichtAufgeloest: [],
    })
  })

  test('Farbwerte nur im Tokenblock', () => {
    const stripped = stripComments(readText(STYLESHEET))
    const { count, start, end } = rootBlockInfo(stripped)

    let ausserhalb = stripped
    if (count >= 1 && start >= 0 && end >= 0) {
      ausserhalb = stripped.slice(0, start) + stripped.slice(end + 1)
    }
    const hexWerte = ausserhalb.match(/#[0-9a-f]{3,8}/gi) ?? []
    const farbFunktionen = ausserhalb.match(/\b(rgba?|hsla?)\s*\(/gi) ?? []

    expect({
      hatTokenblock: count === 1,
      farbwerteAusserhalb: [...hexWerte, ...farbFunktionen],
    }).toEqual({ hatTokenblock: true, farbwerteAusserhalb: [] })
  })
})

describe('Schriften aus dem Bundle', () => {
  test('Schriftschnitte werden importiert', () => {
    const stripped = stripComments(readText(STYLESHEET))
    const importZeilen = (stripped.match(/@import[^;]*;/g) ?? []).map((z) => normalizeWs(z))
    const rootIdx = stripped.search(/:root\s*\{/)
    const letzterImport = stripped.lastIndexOf('@import')

    const erwartet = [
      "@import '@fontsource/marcellus/400.css';",
      "@import '@fontsource/sora/400.css';",
      "@import '@fontsource/sora/500.css';",
      "@import '@fontsource/sora/600.css';",
    ]

    expect({
      importZeilen,
      vorTokenblock: rootIdx >= 0 && letzterImport >= 0 && letzterImport < rootIdx,
    }).toEqual({ importZeilen: erwartet, vorTokenblock: true })
  })

  test('Keine externe Schriftquelle', () => {
    const css = stripComments(readText(STYLESHEET))
    const html = readText(INDEX_HTML)

    const urlExtern = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)]
      .map((m) => m[1])
      .filter(isExternal)
    const importExtern = [...css.matchAll(/@import\s+['"]?([^'";]+)['"]?/gi)]
      .map((m) => m[1].trim())
      .filter(isExternal)
    const linkExtern = [...html.matchAll(/<link\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter(isExternal)

    expect({
      stylesheetVorhanden: css.trim().length > 0,
      hatFontFace: /@font-face/.test(css),
      externeQuellen: [...urlExtern, ...importExtern, ...linkExtern],
    }).toEqual({ stylesheetVorhanden: true, hatFontFace: false, externeQuellen: [] })
  })
})

describe('Grundelemente', () => {
  test('Grundelemente vorhanden', () => {
    const norm = normalizeWs(stripComments(readText(STYLESHEET)))
    const fehlend = GRUNDELEMENT_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))

    expect(fehlend).toEqual([])
  })

  test('Sichtbarer Fokus', () => {
    const norm = normalizeWs(stripComments(readText(STYLESHEET)))
    const fokusBody = ruleBody(norm, ':focus-visible')
    const eingabeSelektor = 'input:focus-visible, select:focus-visible, textarea:focus-visible'
    const eingabeBody = ruleBody(norm, eingabeSelektor)
    const fokusIdx = selectorIndex(norm, ':focus-visible')
    const eingabeIdx = selectorIndex(norm, eingabeSelektor)

    expect({
      fokusOutline: fokusBody?.includes('outline: 2px solid var(--color-focus);') ?? false,
      fokusOffset: fokusBody?.includes('outline-offset: 2px;') ?? false,
      eingabeOutline: eingabeBody?.includes('outline: 2px solid var(--accent-9);') ?? false,
      fokusVorEingabe: fokusIdx >= 0 && eingabeIdx >= 0 && fokusIdx < eingabeIdx,
    }).toEqual({
      fokusOutline: true,
      fokusOffset: true,
      eingabeOutline: true,
      fokusVorEingabe: true,
    })
  })
})

describe('Bewegung nur opt-in', () => {
  test('Übergänge nur unter der Bewegungsabfrage', () => {
    const stripped = stripComments(readText(STYLESHEET))
    const blocks = mediaBlocks(stripped)
    const motionBlocks = blocks.filter((b) => b.query === MOTION_QUERY)

    const bewegung = [...stripped.matchAll(/(transition|animation)(-[a-z-]+)?\s*:|@keyframes\b/gi)]
    const ausserhalb = bewegung
      .filter((m) => !motionBlocks.some((b) => m.index! > b.contentStart && m.index! < b.end))
      .map((m) => normalizeWs(m[0]))
    const fremdeAbfragen = blocks.filter((b) => b.query !== MOTION_QUERY).map((b) => b.query)

    expect({
      ausserhalbDesBlocks: ausserhalb,
      fremdeMediaAbfragen: fremdeAbfragen,
      mindestensEineBewegung: bewegung.length >= 1,
    }).toEqual({
      ausserhalbDesBlocks: [],
      fremdeMediaAbfragen: [],
      mindestensEineBewegung: true,
    })
  })
})

describe('Einbindung', () => {
  test('Der Einstieg lädt das Theme', () => {
    const main = readText(ENTRY)
    const importIdx = main.search(/import\s+['"]\.\/app\/theme\.css['"]/)
    const createRootIdx = main.indexOf('createRoot')

    expect({
      hatThemeImport: importIdx >= 0,
      vorCreateRoot: importIdx >= 0 && createRootIdx >= 0 && importIdx < createRootIdx,
    }).toEqual({ hatThemeImport: true, vorCreateRoot: true })
  })
})
