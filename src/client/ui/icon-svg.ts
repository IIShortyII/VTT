import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ICON_REGISTRY, type IconName } from './icons.js'

// add-icon-registry (#85, design.md D5): SVG-String einer Registry-Komponente fuer die Karte
// (`client/map/canvas.ts`, `Graphics.svg()`) - dieselbe Form wie im DOM, ohne Texturen zu
// laden. NUR `canvas.ts` importiert dieses Modul: `react-dom/server` haengt damit nicht in
// der statischen Importkette von `App` (Jest mockt die Canvas-Fassade in Komponententests).

const cache = new Map<string, string>()

/** `color` ist ein Hex-String (`#rrggbb`); Lucide setzt ihn als `stroke`-Attribut, das der
 * Pixi-SVG-Parser liest. `size: 24` haelt den Koordinatenraum bei `0...24` (= `viewBox`). Ein
 * Cache mit Schluessel `${name}:${color}` vermeidet wiederholtes Rendern (design.md D5). */
export function iconSvg(name: IconName, color: string): string {
  const key = `${name}:${color}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  const markup = renderToStaticMarkup(createElement(ICON_REGISTRY[name], { color, size: 24, strokeWidth: 2 }))
  // fix-icon-arc-flags (#124, design.md D1): Pixi 8 liest kompakte Arc-Flags nicht - jedes
  // `d`-Attribut wird vor dem Cache normalisiert, alle uebrigen Attribute bleiben unveraendert.
  const svg = markup.replace(/(\sd=")([^"]*)(")/g, (_match, open: string, d: string, close: string) =>
    [open, normalizeArcFlags(d), close].join(''),
  )
  cache.set(key, svg)
  return svg
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/

/** fix-icon-arc-flags (#124, design.md D2): trennt Large-Arc- und Sweep-Flag jedes
 * Arc-Segments durch ein Leerzeichen von ihren Nachbarparametern, wo dort kein Trenner steht
 * (Leerzeichen, Komma oder Vorzeichen `-` des Folgeparameters). Innerhalb eines Arc-Befehls
 * zaehlt sie Parameter modulo 7 und liest an Position 4 und 5 genau ein Zeichen als Flag.
 * Jedes andere Zeichen bleibt erhalten; die Funktion ist idempotent. */
export function normalizeArcFlags(d: string): string {
  let out = ''
  let command = ''
  let paramIndex = 0
  // true, wenn unmittelbar zuvor ein Parameter ohne folgenden Trenner stand
  let adjacent = false
  let i = 0
  while (i < d.length) {
    const ch = d.charAt(i)
    if (/[A-Za-z]/.test(ch)) {
      command = ch
      paramIndex = 0
      adjacent = false
      out += ch
      i += 1
      continue
    }
    if (/[\s,]/.test(ch)) {
      adjacent = false
      out += ch
      i += 1
      continue
    }
    const isArc = command === 'a' || command === 'A'
    const position = paramIndex % 7
    if (isArc && (position === 3 || position === 4) && (ch === '0' || ch === '1')) {
      if (adjacent) {
        out += ' '
      }
      out += ch
      i += 1
      paramIndex += 1
      adjacent = true
      continue
    }
    const match = NUMBER.exec(d.slice(i))
    if (match === null) {
      out += ch
      i += 1
      adjacent = false
      continue
    }
    const number = match[0]
    const signed = number.startsWith('-') || number.startsWith('+')
    if (isArc && position === 5 && adjacent && !signed) {
      out += ' '
    }
    out += number
    i += number.length
    paramIndex += 1
    adjacent = true
  }
  return out
}
