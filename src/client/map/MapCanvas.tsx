import { useEffect, useRef } from 'react'

import type { Cell } from '../../shared/grid.js'
import type { Grid } from '../../shared/map.js'
import type { Token } from '../../shared/token.js'
import type { MapCanvasHandle } from './canvas.js'

// Duenner React-Rahmen um die PixiJS-Fassade (design.md D9, D8): erzeugt den Canvas einmal
// im `ref`-Element, reagiert auf Aenderungen von `grid`/`imageUrl`/`tokens` per
// `setGrid`/`setImage`/`setTokens` und gibt die Canvas-Ressourcen im Cleanup genau einmal
// frei (spec.md Requirement "Bibliotheksoberflaeche", Szenario "Verlassen gibt die
// Kartenansicht frei").
//
// Die Fassade (`./canvas.js`) wird erst beim Mounten per dynamischem `import()` geladen, nie
// statisch am Modulanfang (design.md D9): ein statischer Import wuerde `pixi.js` samt
// `earcut` (reines ES-Modul) in die Importkette jeder Ansicht ziehen, die `App` rendert -
// im Browser ein unnoetig grosses Startbuendel, unter Jest ein Ladefehler in jeder Suite,
// die die `App` rendert. Nur der Typ `MapCanvasHandle` wird statisch bezogen (`import type`
// erzeugt keinen Laufzeit-Import).
//
// session-token (#14, design.md D6): `onTokenMove` wird nur beim Erzeugen uebergeben (wie
// `imageUrl`/`grid` beim ersten Mount) - eine Aenderung des Rueckrufs nach dem Mount muss
// nicht wirken, weil sich die Rolle im Raum nicht aendert.

export interface MapCanvasProps {
  imageUrl: string | null
  grid: Grid
  tokens: Token[]
  onTokenMove?: (tokenId: string, cell: Cell) => void
}

export function MapCanvas({ imageUrl, grid, tokens, onTokenMove }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<MapCanvasHandle | null>(null)
  // App-Test Runde 2 (#14): `createMapCanvas` laeuft asynchron (`app.init`) - trifft waehrend
  // dieser Zeit ein neuer Wert ein (z. B. `session:tokens`), laeuft kein Effekt unten dafuer
  // erneut (das Handle stand ja noch nicht). Dieser Ref haelt die jeweils aktuellsten Props,
  // damit der Mount-Effekt sie nach dem Erzeugen einmalig nachziehen kann.
  const latestPropsRef = useRef({ grid, imageUrl, tokens })
  latestPropsRef.current = { grid, imageUrl, tokens }

  // Nur beim Mounten erzeugen - spaetere Aenderungen von `grid`/`imageUrl`/`tokens` gehen
  // ueber die Effekte darunter (`setGrid`/`setImage`/`setTokens`), nicht ueber eine
  // Neuerzeugung.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    // `app.init` ist asynchron (design.md Risiko) - ein Unmount vor Aufloesung darf keinen
    // verwaisten Canvas hinterlassen: das `cancelled`-Flag laesst die dann verspaetet
    // ankommende Instanz sofort wieder zerstoeren, statt sie zu behalten.
    let cancelled = false
    const initialGrid = grid
    const initialImageUrl = imageUrl
    const initialTokens = tokens
    import('./canvas.js')
      .then(({ createMapCanvas }) =>
        createMapCanvas(container, { imageUrl: initialImageUrl, grid: initialGrid, tokens: initialTokens, onTokenMove }),
      )
      .then((handle) => {
        if (cancelled) {
          handle.destroy()
          return
        }
        handleRef.current = handle
        // App-Test Runde 2 (#14): nur nachziehen, was sich waehrend des Aufbaus tatsaechlich
        // geaendert hat - sonst laedt `setImage` dasselbe Bild ein zweites Mal.
        const latest = latestPropsRef.current
        if (latest.grid !== initialGrid) {
          handle.setGrid(latest.grid)
        }
        if (latest.imageUrl !== initialImageUrl) {
          handle.setImage(latest.imageUrl)
        }
        if (latest.tokens !== initialTokens) {
          handle.setTokens?.(latest.tokens)
        }
      })
      .catch((error: unknown) => {
        console.error(error)
      })
    return () => {
      cancelled = true
      handleRef.current?.destroy()
      handleRef.current = null
    }
  }, [])

  useEffect(() => {
    handleRef.current?.setGrid(grid)
  }, [grid])

  useEffect(() => {
    handleRef.current?.setImage(imageUrl)
  }, [imageUrl])

  // session-token (#14, Gate-Nacharbeit Runde 1): `?.` auch auf dem Methodennamen - eine
  // Canvas-Fassade, die vor dieser Aenderung gemockt wurde (#49/#50), kennt `setTokens`
  // nicht; "Keine bestehende Assertion bricht" (design.md Goals) gilt auch fuer solche Mocks.
  useEffect(() => {
    handleRef.current?.setTokens?.(tokens)
  }, [tokens])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
