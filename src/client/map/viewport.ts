// Sichtmathematik der Kartenansicht (design.md D7, spec.md Requirement "Sicht mit Schwenken
// und Zoomen"): reine Funktionen ohne PixiJS-Import, direkt testbar. Die Fassade (canvas.ts)
// wendet die Sicht nur auf den Wurzel-Container an (`position`, `scale`). Die Sicht ist
// lokal je Betrachter und wird nicht gespeichert oder uebertragen (Explore-Runde).

export interface View {
  x: number
  y: number
  scale: number
}

export interface CanvasPoint {
  x: number
  y: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 8

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Verschiebt die Sicht um den gezogenen Betrag (spec.md Requirement "Sicht mit Schwenken
 * und Zoomen"). */
export function panBy(view: View, dx: number, dy: number): View {
  return { x: view.x + dx, y: view.y + dy, scale: view.scale }
}

/**
 * Zoomt um einen Canvas-Punkt (design.md D7): der Bildpunkt unter `cursor` bleibt an Ort und
 * Stelle. `scale` wird auf [0.1, 8] begrenzt.
 */
export function zoomAt(view: View, cursor: CanvasPoint, factor: number): View {
  const imagePoint = { x: (cursor.x - view.x) / view.scale, y: (cursor.y - view.y) / view.scale }
  const nextScale = clampScale(view.scale * factor)
  return {
    x: cursor.x - imagePoint.x * nextScale,
    y: cursor.y - imagePoint.y * nextScale,
    scale: nextScale,
  }
}
