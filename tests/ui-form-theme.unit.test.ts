// Unit-Tests zum Requirement „Stylesheet der Formulare" des Capability `ui-form` aus
// openspec/changes/add-ui-form/specs/ui-form/spec.md. Ein Test je GIVEN/WHEN/THEN-Szenario
// (constitution.md §4.1), Testname = Szenarioname. Umgebung `node`, kein jsdom: `theme.css`
// wird als Text von der Platte gelesen, nicht gerendert (design.md D11 „Stylesheet").
//
// Die Helfer (Kommentare entfernen, Whitespace normalisieren, Selektor-Praesenz,
// `@media`-Bloecke per Klammerzaehlung) sind dieselben wie in der Theme-/Start-Suite und
// duerfen dupliziert werden (design.md D11).
//
// Rote Phase (constitution.md §3.1): der Abschnitt „Formulare" fehlt in `theme.css`; die
// Selektoren `.form-grid`/`.form-field`/`.form-field--row`/`.form-actions`/`.form-error`/
// `.spinner` sind nicht vorhanden und `@keyframes spin` / die `animation`-Deklaration des
// Spinners fehlen. Jedes Szenario wird an SEINER Assertion rot, mit '' als Lese-Fallback —
// nicht an einem ENOENT.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
// enthaelt (spec.md „Begriffe"); die Grenze davor verhindert Teiltreffer.
function selectorPresent(normalizedCss: string, selector: string): boolean {
  const re = new RegExp('(^|[\\s{};,])' + escapeRegex(selector) + '\\s*\\{')
  return re.test(normalizedCss)
}

// Der Tokenblock reicht von `:root {` bis zur naechsten `}` (ui-theme D7 Nr. 2).
function rootBlock(strippedCss: string): { start: number; end: number } {
  const start = strippedCss.search(/:root\s*\{/)
  if (start < 0) return { start: -1, end: -1 }
  const braceStart = strippedCss.indexOf('{', start)
  const braceEnd = strippedCss.indexOf('}', braceStart)
  return { start, end: braceEnd }
}

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

const FORM_SELEKTOREN = ['.form-grid', '.form-field', '.form-field--row', '.form-actions', '.form-error', '.spinner']

// --- Requirement: Stylesheet der Formulare --------------------------------------------------

test('Formular-Selektoren vorhanden', () => {
  const stripped = stripComments(readText(STYLESHEET))
  const norm = normalizeWs(stripped)
  const fehlend = FORM_SELEKTOREN.filter((sel) => !selectorPresent(norm, sel))

  // Ausserhalb des Tokenblocks kein Hex-Wert und kein Farbfunktions-Aufruf.
  const { start, end } = rootBlock(stripped)
  let ausserhalb = stripped
  if (start >= 0 && end >= 0) {
    ausserhalb = stripped.slice(0, start) + stripped.slice(end + 1)
  }
  const hexWerte = ausserhalb.match(/#[0-9a-f]{3,8}/gi) ?? []
  const farbFunktionen = ausserhalb.match(/\b(rgba?|hsla?)\s*\(/gi) ?? []

  expect({
    fehlendeSelektoren: fehlend,
    farbwerteAusserhalb: [...hexWerte, ...farbFunktionen],
  }).toEqual({ fehlendeSelektoren: [], farbwerteAusserhalb: [] })
})

test('Spinner dreht nur opt-in', () => {
  const stripped = stripComments(readText(STYLESHEET))
  const blocks = mediaBlocks(stripped)
  const motionBlocks = blocks.filter((b) => b.query === MOTION_QUERY)

  const inMotionBlock = (index: number): boolean =>
    motionBlocks.some((b) => index > b.contentStart && index < b.end)

  const keyframes = [...stripped.matchAll(/@keyframes\s+spin\b/g)]
  const keyframesImBlock = keyframes.length > 0 && keyframes.every((m) => inMotionBlock(m.index!))

  // Eine `animation`-Deklaration, die `spin` einer `.spinner`-Regel zuweist, muss im
  // Bewegungsblock liegen; ausserhalb jedes Bewegungsblocks gibt es ueberhaupt keine
  // `animation`-Deklaration.
  const animationen = [...stripped.matchAll(/animation(-[a-z-]+)?\s*:/gi)]
  const animationenAusserhalb = animationen.filter((m) => !inMotionBlock(m.index!)).map((m) => m[0])
  const spinnerAnimationImBlock = animationen.some((m) => inMotionBlock(m.index!) && /spin/.test(stripped.slice(m.index!, m.index! + 60)))

  const fremdeAbfragen = blocks.filter((b) => b.query !== MOTION_QUERY).map((b) => b.query)

  expect({
    keyframesSpinImBewegungsblock: keyframesImBlock,
    spinnerAnimationImBewegungsblock: spinnerAnimationImBlock,
    animationenAusserhalb,
    fremdeMediaAbfragen: fremdeAbfragen,
  }).toEqual({
    keyframesSpinImBewegungsblock: true,
    spinnerAnimationImBewegungsblock: true,
    animationenAusserhalb: [],
    fremdeMediaAbfragen: [],
  })
})
