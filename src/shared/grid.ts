import type { Grid } from './map.js'

// Rastergeometrie (design.md D6, spec.md Requirement "Rastergeometrie"): reine Funktionen
// ohne Seiteneffekt, damit Einrasten (#8), Fog of War (#9) und Messen (#11) dieselbe Quelle
// benutzen wie die Kartenansicht hier. Keine Prisma-, kein Fastify-, kein PixiJS-Import
// (design.md D1).

export interface Point {
  x: number
  y: number
}

export interface Cell {
  col: number
  row: number
}

export interface CellRange {
  minCol: number
  maxCol: number
  minRow: number
  maxRow: number
}

const SQRT3 = Math.sqrt(3)

/** Umkreisradius einer Hex-Zelle (design.md D6/spec.md Requirement "Rastergeometrie"):
 * `size / sqrt(3)` fuer beide Hex-Ausrichtungen. */
function circumradius(size: number): number {
  return size / SQRT3
}

/** Ob eine Reihen-/Spaltennummer "ungerade" ist - per Bitmaske, damit auch negative Zahlen
 * korrekt behandelt werden (spec.md "Begriffe": "-1 ist ungerade"). */
function isOdd(n: number): boolean {
  return (n & 1) !== 0
}

/** Mittelpunkt einer Zelle in Bildkoordinaten (design.md D6, Requirement
 * "Rastergeometrie"). */
export function cellCenter(grid: Grid, cell: Cell): Point {
  const { type, size, offsetX, offsetY } = grid
  if (type === 'quadrat') {
    return {
      x: offsetX + cell.col * size + size / 2,
      y: offsetY + cell.row * size + size / 2,
    }
  }

  const r = circumradius(size)
  if (type === 'hex-spitz') {
    // "odd-r": Zeilen versetzt, ungerade Zeile um eine halbe Zellbreite nach rechts.
    const w = size
    const h = 2 * r
    const x = offsetX + w * (cell.col + 0.5 + (isOdd(cell.row) ? 0.5 : 0))
    const y = offsetY + r + cell.row * 0.75 * h
    return { x, y }
  }

  // 'hex-flach': "odd-q", Spalten versetzt, ungerade Spalte um eine halbe Zellhoehe nach unten.
  const h = size
  const w = 2 * r
  const x = offsetX + r + cell.col * 0.75 * w
  const y = offsetY + h * (cell.row + 0.5 + (isOdd(cell.col) ? 0.5 : 0))
  return { x, y }
}

/** Rundet fraktionale Wuerfelkoordinaten auf die naechstliegende ganzzahlige Zelle (Red
 * Blob Games "Hex grids: rounding"). `x + y + z` bleibt dabei exakt 0. */
function cubeRound(x: number, y: number, z: number): { x: number; y: number; z: number } {
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)

  const xDiff = Math.abs(rx - x)
  const yDiff = Math.abs(ry - y)
  const zDiff = Math.abs(rz - z)

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz
  } else if (yDiff > zDiff) {
    ry = -rx - rz
  } else {
    rz = -rx - ry
  }

  return { x: rx, y: ry, z: rz }
}

/** Zelle, in der ein Bildpunkt liegt (design.md D6, Requirement "Rastergeometrie"). Bei
 * Quadraten `Math.floor` je Achse; bei Hex ueber Axialkoordinaten und Wuerfelrundung
 * (Red Blob Games), danach Umrechnung in odd-r ("hex-spitz") bzw. odd-q ("hex-flach"). */
export function cellAt(grid: Grid, point: Point): Cell {
  const { type, size, offsetX, offsetY } = grid
  if (type === 'quadrat') {
    return {
      col: Math.floor((point.x - offsetX) / size),
      row: Math.floor((point.y - offsetY) / size),
    }
  }

  const r = circumradius(size)
  if (type === 'hex-spitz') {
    // Lokale Koordinaten relativ zum Mittelpunkt der Zelle (0, 0) - siehe design.md D6.
    const localX = point.x - offsetX - size / 2
    const localY = point.y - offsetY - r
    const rowF = localY / (1.5 * r)
    const colF = localX / (r * SQRT3) - rowF / 2
    const rounded = cubeRound(colF, -colF - rowF, rowF)
    const row = rounded.z
    const col = rounded.x + (row - (row & 1)) / 2
    return { col, row }
  }

  // 'hex-flach'
  const localX = point.x - offsetX - r
  const localY = point.y - offsetY - size / 2
  const colF = localX / (1.5 * r)
  const rowF = localY / (r * SQRT3) - colF / 2
  const rounded = cubeRound(rowF, -rowF - colF, colF)
  const col = rounded.z
  const row = rounded.x + (col - (col & 1)) / 2
  return { col, row }
}

const HEX_SPITZ_CORNER_ANGLES_DEG = [30, 90, 150, 210, 270, 330]
const HEX_FLACH_CORNER_ANGLES_DEG = [0, 60, 120, 180, 240, 300]

/** Ecken einer Zelle in Zeichenreihenfolge (design.md D6, Requirement "Rastergeometrie"):
 * vier bei `quadrat`, sechs bei Hex. Bei `hex-spitz` beginnt die Folge rechts unten (30°)
 * und laeuft im Uhrzeigersinn (y nach unten); bei `hex-flach` beginnt sie rechts (0°). */
export function cellCorners(grid: Grid, cell: Cell): Point[] {
  const { type, size, offsetX, offsetY } = grid
  if (type === 'quadrat') {
    const left = offsetX + cell.col * size
    const top = offsetY + cell.row * size
    const right = left + size
    const bottom = top + size
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ]
  }

  const r = circumradius(size)
  const center = cellCenter(grid, cell)
  const angles = type === 'hex-spitz' ? HEX_SPITZ_CORNER_ANGLES_DEG : HEX_FLACH_CORNER_ANGLES_DEG
  return angles.map((deg) => {
    const rad = (deg * Math.PI) / 180
    return { x: center.x + r * Math.cos(rad), y: center.y + r * Math.sin(rad) }
  })
}

/** Zellbereich, der ein Rechteck von (0, 0) bis (width, height) abdeckt (design.md D6,
 * Requirement "Rastergeometrie"). Bei Quadraten exakt (Zelle der beiden Eckpunkte), bei Hex
 * grosszuegig (Eckpunkte plus eine Zelle Rand je Richtung) - Vollstaendigkeit vor
 * Minimalitaet. */
export function cellRange(grid: Grid, width: number, height: number): CellRange {
  const topLeft = cellAt(grid, { x: 0, y: 0 })
  const bottomRight = cellAt(grid, { x: width, y: height })

  const minCol = Math.min(topLeft.col, bottomRight.col)
  const maxCol = Math.max(topLeft.col, bottomRight.col)
  const minRow = Math.min(topLeft.row, bottomRight.row)
  const maxRow = Math.max(topLeft.row, bottomRight.row)

  if (grid.type === 'quadrat') {
    return { minCol, maxCol, minRow, maxRow }
  }

  return { minCol: minCol - 1, maxCol: maxCol + 1, minRow: minRow - 1, maxRow: maxRow + 1 }
}
