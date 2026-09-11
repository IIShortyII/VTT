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
    import('./canvas.js')
      .then(({ createMapCanvas }) => createMapCanvas(container, { imageUrl, grid, tokens, onTokenMove }))
      .then((handle) => {
        if (cancelled) {
          handle.destroy()
          return
        }
        handleRef.current = handle
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

  useEffect(() => {
    handleRef.current?.setTokens(tokens)
  }, [tokens])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
