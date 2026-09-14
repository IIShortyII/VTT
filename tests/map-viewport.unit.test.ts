// Unit-Tests zum Requirement "Sicht mit Schwenken und Zoomen" aus
// openspec/changes/add-map-library/specs/map-library/spec.md (tasks.md 1.2). Ein Test je
// GIVEN/WHEN/THEN-Szenario (constitution.md §4.1), Testname = Szenarioname. Die Sichtmathematik
// ist eine reine Funktion (design.md D7) -> Unit-Test, direkt gegen src/client/map/viewport.ts.
//
// Rote Phase: src/client/map/viewport.ts existiert noch nicht -> der Import scheitert ("Cannot
// find module"). Das ist der erwartete rote Grund (fehlendes Modul, tasks.md 1.2).
//
// add-token-cards (#95, MODIFIED "Sicht mit Schwenken und Zoomen", design.md D7): neue reine
// Funktion `centerOn(view, world, screen)`. Sie wird ueber eine als `string` typisierte
// Pfad-Variable dynamisch geladen (nicht statisch neben `panBy`/`zoomAt`), damit die drei
// bereits gruenen Szenarien nicht am fehlenden Export scheitern; die neue Assertion wird an
// SICH SELBST rot ("keine centerOn-Funktion"), nicht an einem Lade-/Typfehler (§3.1).

import { panBy, zoomAt } from '../src/client/map/viewport.js'

test('Zoom hält den Punkt unter dem Zeiger fest', () => {
  const sicht = zoomAt({ x: 0, y: 0, scale: 1 }, { x: 100, y: 100 }, 2)
  expect(sicht.scale).toBeCloseTo(2, 2)
  expect(sicht.x).toBeCloseTo(-100, 2)
  expect(sicht.y).toBeCloseTo(-100, 2)
})

test('Zoom ist nach oben begrenzt', () => {
  const sicht = zoomAt({ x: 0, y: 0, scale: 6 }, { x: 0, y: 0 }, 2)
  expect(sicht.scale).toBeCloseTo(8, 2)
  expect(sicht.x).toBeCloseTo(0, 2)
  expect(sicht.y).toBeCloseTo(0, 2)
})

test('Schwenken verschiebt die Sicht', () => {
  const sicht = panBy({ x: -100, y: -100, scale: 2 }, 30, -10)
  expect(sicht.x).toBeCloseTo(-70, 2)
  expect(sicht.y).toBeCloseTo(-110, 2)
  expect(sicht.scale).toBeCloseTo(2, 2)
})

// --- add-token-cards (#95): Zentrieren auf einen Weltpunkt ----------------------------------

type View = { x: number; y: number; scale: number }
type CenterOn = (view: View, world: { x: number; y: number }, screen: { width: number; height: number }) => View

const VIEWPORT_PATH: string = '../src/client/map/viewport.js'

async function loadCenterOn(): Promise<CenterOn | null> {
  try {
    const mod = (await import(VIEWPORT_PATH)) as Record<string, unknown>
    return (mod.centerOn as CenterOn | undefined) ?? null
  } catch {
    return null
  }
}

test('Zentrieren rückt den Weltpunkt in die Mitte', async () => {
  const centerOn = await loadCenterOn()
  expect(typeof centerOn).toBe('function')

  const sicht = (centerOn as CenterOn)({ x: 0, y: 0, scale: 2 }, { x: 100, y: 50 }, { width: 800, height: 600 })
  expect(sicht.x).toBeCloseTo(200, 2)
  expect(sicht.y).toBeCloseTo(200, 2)
  expect(sicht.scale).toBeCloseTo(2, 2)
})
