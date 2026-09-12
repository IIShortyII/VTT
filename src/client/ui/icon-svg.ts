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
  const svg = renderToStaticMarkup(createElement(ICON_REGISTRY[name], { color, size: 24, strokeWidth: 2 }))
  cache.set(key, svg)
  return svg
}
