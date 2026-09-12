// Unit-Tests zum Requirement "Messgeometrie" aus
// openspec/changes/add-measure-draw/specs/session-annotation/spec.md (tasks.md 1.1). Ein Test
// je GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname (11 Szenarien).
//
// Geprueft werden die reinen Funktionen aus design.md D2 (`cellDistance`, `snapToCellCenter`,
// `distanceInFields`, `angleDegrees`, `annotationLabel`) — dieselbe Art wie die
// Rastergeometrie-Szenarien (#49). Bildkoordinaten mit `toBeCloseTo` (Hex-Zellmitten sind
// irrational), Etiketten als exakte Zeichenketten (Mittelpunkt `·`, Durchmesserzeichen `⌀`,
// Gradzeichen `°`, Komma als Dezimaltrenner).
//
// Rote Phase (constitution.md §3.1, tasks.md 1.1): das Modul `src/shared/annotation.ts` existiert
// noch nicht — der Import scheitert, die Suite laedt nicht. Das ist der erwartete rote Grund,
// kein Setup-/Tippfehler im Test.

import type { Grid } from '../src/shared/map.js'
import {
  angleDegrees,
  annotationLabel,
  cellDistance,
  distanceInFields,
  snapToCellCenter,
  type Annotation,
} from '../src/shared/annotation.js'

type Pt = { x: number; y: number }
function P(x: number, y: number): Pt {
  return { x, y }
}
function cell(col: number, row: number): { col: number; row: number } {
  return { col, row }
}
function grid(type: Grid['type'], size: number, offsetX: number, offsetY: number): Grid {
  return { type, size, offsetX, offsetY }
}

/** Baut eine Anmerkungsdarstellung nach "Begriffe" (design.md D2) fuer die Etikett-Szenarien. */
function ann(kind: Annotation['kind'], mode: Annotation['mode'], points: Pt[]): Annotation {
  return {
    id: 'a',
    instanceId: 'i',
    kind,
    mode,
    visibility: 'geteilt',
    color: kind === 'zeichnung' ? 'rot' : null,
    points,
    authorId: 'u',
  }
}

test('Zellabstand im Quadratraster', () => {
  expect(cellDistance('quadrat', cell(0, 0), cell(3, 2))).toBe(3)
})

test('Zellabstand im Raster hex-spitz', () => {
  expect(cellDistance('hex-spitz', cell(0, 0), cell(2, 3))).toBe(4)
})

test('Zellabstand im Raster hex-flach', () => {
  expect(cellDistance('hex-flach', cell(0, 0), cell(3, 2))).toBe(4)
})

test('Einrasten auf die Zellmitte', () => {
  const ergebnis = snapToCellCenter(grid('quadrat', 50, 10, 20), P(134, 94))
  expect(ergebnis.x).toBeCloseTo(135)
  expect(ergebnis.y).toBeCloseTo(95)
})

test('Freie Länge in Feldern', () => {
  expect(distanceInFields(grid('quadrat', 50, 0, 0), 'frei', P(0, 0), P(150, 100))).toBeCloseTo(3.6)
})

test('Gerasterte Länge in Feldern', () => {
  expect(distanceInFields(grid('quadrat', 70, 0, 0), 'gerastert', P(105, 105), P(245, 35))).toBe(2)
})

test('Winkel zwischen zwei Schenkeln', () => {
  expect(angleDegrees(P(0, 0), P(100, 0), P(100, 100))).toBe(45)
})

test('Etikett einer gerasterten Strecke in Metern', () => {
  const a = ann('strecke', 'gerastert', [P(35, 35), P(245, 35)])
  expect(annotationLabel(a, grid('quadrat', 70, 0, 0), 'meter')).toBe('3 Felder (4,5 m)')
})

test('Etikett einer freien Strecke in Fuß', () => {
  const a = ann('strecke', 'frei', [P(0, 0), P(150, 100)])
  expect(annotationLabel(a, grid('quadrat', 50, 0, 0), 'fuss')).toBe('3,6 Felder (18 ft)')
})

test('Etikett eines Kreises und Einzahl bei einem Feld', () => {
  const g = grid('quadrat', 70, 0, 0)
  const kreis = ann('kreis', 'gerastert', [P(35, 35), P(175, 35)])
  const strecke = ann('strecke', 'gerastert', [P(35, 35), P(105, 35)])
  expect(annotationLabel(kreis, g, 'meter')).toBe('r 2 Felder (3 m) · ⌀ 4 Felder (6 m)')
  expect(annotationLabel(strecke, g, 'meter')).toBe('1 Feld (1,5 m)')
})

test('Etikett eines Winkels und einer Zeichnung', () => {
  const g = grid('quadrat', 70, 0, 0)
  const winkel = ann('winkel', 'frei', [P(0, 0), P(100, 0), P(100, 100)])
  const zeichnung = ann('zeichnung', 'frei', [P(1, 1), P(2, 2), P(3, 1)])
  expect(annotationLabel(winkel, g, 'meter')).toBe('45°')
  expect(annotationLabel(zeichnung, g, 'meter')).toBe('')
})
