// Unit-Tests zum Requirement "Rastergeometrie" aus
// openspec/changes/add-map-library/specs/map-library/spec.md (tasks.md 1.2). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname. Reine Logik ->
// Unit-Test (AGENTS.md). Vergleich auf zwei Nachkommastellen (`toBeCloseTo(…, 2)`, design.md
// D10), wie die Spec es fuer numerische Aussagen vorgibt.
//
// Rote Phase: src/shared/grid.ts (und der Typ Grid aus src/shared/map.ts) existieren noch
// nicht -> die Imports scheitern ("Cannot find module"). Das ist der erwartete rote Grund
// (fehlendes Modul, tasks.md 1.2), kein Tippfehler im Test.

import { cellAt, cellCenter, cellCorners, cellRange } from '../src/shared/grid.js'
import type { Grid } from '../src/shared/map.js'

// --- Hilfen ---------------------------------------------------------------------------------

function expectPoint(point: { x: number; y: number }, x: number, y: number): void {
  expect(point.x).toBeCloseTo(x, 2)
  expect(point.y).toBeCloseTo(y, 2)
}

function containsPoint(corners: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  return corners.some((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.y - y) < 0.01)
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

const QUADRAT: Grid = { type: 'quadrat', size: 50, offsetX: 10, offsetY: 20 }
const HEX_SPITZ: Grid = { type: 'hex-spitz', size: 60, offsetX: 0, offsetY: 0 }
const HEX_FLACH: Grid = { type: 'hex-flach', size: 60, offsetX: 0, offsetY: 0 }

// --- Quadrat --------------------------------------------------------------------------------

test('Mittelpunkt einer Quadratzelle', () => {
  expectPoint(cellCenter(QUADRAT, { col: 2, row: 1 }), 135, 95)
})

test('Zelle zu einem Punkt im Quadratraster', () => {
  expect(cellAt(QUADRAT, { x: 134, y: 94 })).toEqual({ col: 2, row: 1 })
  expect(cellAt(QUADRAT, { x: 9, y: 19 })).toEqual({ col: -1, row: -1 })
})

test('Ecken einer Quadratzelle', () => {
  const ecken = cellCorners(QUADRAT, { col: 0, row: 0 })
  expect(ecken).toHaveLength(4)
  expectPoint(ecken[0], 10, 20)
  expectPoint(ecken[1], 60, 20)
  expectPoint(ecken[2], 60, 70)
  expectPoint(ecken[3], 10, 70)
})

// --- hex-spitz (odd-r) ----------------------------------------------------------------------

test('Mittelpunkte im Raster hex-spitz', () => {
  expectPoint(cellCenter(HEX_SPITZ, { col: 0, row: 0 }), 30, 34.64)
  expectPoint(cellCenter(HEX_SPITZ, { col: 1, row: 0 }), 90, 34.64)
  expectPoint(cellCenter(HEX_SPITZ, { col: 1, row: 1 }), 120, 86.6)
})

test('Zelle zu einem Punkt im Raster hex-spitz', () => {
  expect(cellAt(HEX_SPITZ, { x: 60, y: 60 })).toEqual({ col: 0, row: 1 })
  expect(cellAt(HEX_SPITZ, { x: 120, y: 86 })).toEqual({ col: 1, row: 1 })
})

test('Ecken einer Zelle im Raster hex-spitz', () => {
  const mitte = { x: 30, y: 34.64 }
  const ecken = cellCorners(HEX_SPITZ, { col: 0, row: 0 })
  expect(ecken).toHaveLength(6)
  expect(containsPoint(ecken, 30, 0)).toBe(true)
  expect(containsPoint(ecken, 30, 69.28)).toBe(true)
  expect(containsPoint(ecken, 0, 17.32)).toBe(true)
  expect(containsPoint(ecken, 60, 51.96)).toBe(true)
  for (const ecke of ecken) expect(distance(ecke, mitte)).toBeCloseTo(34.64, 2)
})

// --- hex-flach (odd-q) ----------------------------------------------------------------------

test('Mittelpunkte im Raster hex-flach', () => {
  expectPoint(cellCenter(HEX_FLACH, { col: 0, row: 0 }), 34.64, 30)
  expectPoint(cellCenter(HEX_FLACH, { col: 0, row: 1 }), 34.64, 90)
  expectPoint(cellCenter(HEX_FLACH, { col: 1, row: 1 }), 86.6, 120)
})

test('Zelle zu einem Punkt im Raster hex-flach', () => {
  expect(cellAt(HEX_FLACH, { x: 86, y: 120 })).toEqual({ col: 1, row: 1 })
})

test('Ecken einer Zelle im Raster hex-flach', () => {
  const mitte = { x: 34.64, y: 30 }
  const ecken = cellCorners(HEX_FLACH, { col: 0, row: 0 })
  expect(ecken).toHaveLength(6)
  expect(containsPoint(ecken, 0, 30)).toBe(true)
  expect(containsPoint(ecken, 69.28, 30)).toBe(true)
  expect(containsPoint(ecken, 17.32, 0)).toBe(true)
  expect(containsPoint(ecken, 51.96, 60)).toBe(true)
  for (const ecke of ecken) expect(distance(ecke, mitte)).toBeCloseTo(34.64, 2)
})

// --- Zellbereich ----------------------------------------------------------------------------

test('Zellbereich eines Bildes im Quadratraster', () => {
  expect(cellRange(QUADRAT, 200, 100)).toEqual({ minCol: -1, maxCol: 3, minRow: -1, maxRow: 1 })
})

test('Zellbereich eines Bildes im Raster hex-spitz', () => {
  const range = cellRange(HEX_SPITZ, 200, 100)
  // enthaelt (0, 0)
  expect(range.minCol).toBeLessThanOrEqual(0)
  expect(range.maxCol).toBeGreaterThanOrEqual(0)
  expect(range.minRow).toBeLessThanOrEqual(0)
  expect(range.maxRow).toBeGreaterThanOrEqual(0)
  // enthaelt (2, 1)
  expect(range.maxCol).toBeGreaterThanOrEqual(2)
  expect(range.maxRow).toBeGreaterThanOrEqual(1)
  // enthaelt NICHT (0, 4)
  expect(range.maxRow).toBeLessThan(4)
})
