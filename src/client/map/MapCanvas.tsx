import { useEffect, useRef } from 'react'

import type { Annotation, AnnotationKind, CanvasTool } from '../../shared/annotation.js'
import type { Cell, Point } from '../../shared/grid.js'
import type { Grid } from '../../shared/map.js'
import type { Token } from '../../shared/token.js'
import type { AnnotationOptions, FogLayer, MapCanvasHandle } from './canvas.js'

// Duenner React-Rahmen um die PixiJS-Fassade (design.md D9, D8): erzeugt den Canvas einmal
// im `ref`-Element, reagiert auf Aenderungen von `grid`/`imageUrl`/`tokens`/`fog`/`tool`/
// `selection`/`annotations`/`annotationOptions` per `setGrid`/`setImage`/`setTokens`/
// `setFog`/`setTool`/`setSelection`/`setAnnotations`/`setAnnotationOptions` und gibt die
// Canvas-Ressourcen im Cleanup genau einmal frei (spec.md Requirement
// "Bibliotheksoberflaeche", Szenario "Verlassen gibt die Kartenansicht frei").
//
// Die Fassade (`./canvas.js`) wird erst beim Mounten per dynamischem `import()` geladen, nie
// statisch am Modulanfang (design.md D9): ein statischer Import wuerde `pixi.js` samt
// `earcut` (reines ES-Modul) in die Importkette jeder Ansicht ziehen, die `App` rendert -
// im Browser ein unnoetig grosses Startbuendel, unter Jest ein Ladefehler in jeder Suite,
// die die `App` rendert. Nur die Typen `MapCanvasHandle`/`FogLayer`/`AnnotationOptions`
// werden statisch bezogen (`import type` erzeugt keinen Laufzeit-Import).
//
// session-token (#14, design.md D6): `onTokenMove` wird nur beim Erzeugen uebergeben (wie
// `imageUrl`/`grid` beim ersten Mount) - eine Aenderung des Rueckrufs nach dem Mount muss
// nicht wirken, weil sich die Rolle im Raum nicht aendert. add-token-assignment (#15,
// design.md D5): `canMoveToken` ebenso - nur beim Erzeugen gelesen. add-fog-of-war (#16,
// design.md D6): `onCellsSelected` ebenso nur beim Erzeugen gelesen - Aufrufer, die das
// aktuelle Werkzeug brauchen (`SessionRoom.tsx`), lesen es ueber eine Ref, nicht ueber diesen
// Rueckruf. add-measure-draw (#11, design.md D4): `onAnnotationDrawn` ebenso nur beim
// Erzeugen gelesen (Muster `onCellsSelected`).

const DEFAULT_ANNOTATION_OPTIONS: AnnotationOptions = { mode: 'gerastert', color: 'rot', unit: 'meter' }

export interface MapCanvasProps {
  imageUrl: string | null
  grid: Grid
  tokens: Token[]
  onTokenMove?: (tokenId: string, cell: Cell) => void
  canMoveToken?: (token: Token) => boolean
  fog?: FogLayer | null
  tool?: CanvasTool
  selection?: Cell[]
  onCellsSelected?: (cells: Cell[]) => void
  annotations?: Annotation[]
  annotationOptions?: AnnotationOptions
  onAnnotationDrawn?: (kind: AnnotationKind, points: Point[]) => void
}

export function MapCanvas({
  imageUrl,
  grid,
  tokens,
  onTokenMove,
  canMoveToken,
  fog,
  tool,
  selection,
  onCellsSelected,
  annotations,
  annotationOptions,
  onAnnotationDrawn,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<MapCanvasHandle | null>(null)
  // App-Test Runde 2 (#14): `createMapCanvas` laeuft asynchron (`app.init`) - trifft waehrend
  // dieser Zeit ein neuer Wert ein (z. B. `session:tokens`), laeuft kein Effekt unten dafuer
  // erneut (das Handle stand ja noch nicht). Dieser Ref haelt die jeweils aktuellsten Props,
  // damit der Mount-Effekt sie nach dem Erzeugen einmalig nachziehen kann.
  const latestPropsRef = useRef({ grid, imageUrl, tokens, fog, tool, selection, annotations, annotationOptions })
  latestPropsRef.current = { grid, imageUrl, tokens, fog, tool, selection, annotations, annotationOptions }

  // Nur beim Mounten erzeugen - spaetere Aenderungen von `grid`/`imageUrl`/`tokens`/`fog`/
  // `tool`/`selection`/`annotations`/`annotationOptions` gehen ueber die Effekte darunter,
  // nicht ueber eine Neuerzeugung.
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
    const initialFog = fog ?? null
    const initialTool = tool ?? 'schwenken'
    const initialSelection = selection ?? []
    const initialAnnotations = annotations ?? []
    const initialAnnotationOptions = annotationOptions ?? DEFAULT_ANNOTATION_OPTIONS
    import('./canvas.js')
      .then(({ createMapCanvas }) =>
        createMapCanvas(container, {
          imageUrl: initialImageUrl,
          grid: initialGrid,
          tokens: initialTokens,
          onTokenMove,
          canMoveToken,
          fog: initialFog,
          tool: initialTool,
          selection: initialSelection,
          onCellsSelected,
          annotations: initialAnnotations,
          annotationOptions: initialAnnotationOptions,
          onAnnotationDrawn,
        }),
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
        // add-fog-of-war (#16, design.md D6): tolerante Aufrufe - Mocks aus #49/#50/#14
        // kennen `setFog`/`setTool`/`setSelection` nicht (Muster `setTokens`).
        if ((latest.fog ?? null) !== initialFog) {
          handle.setFog?.(latest.fog ?? null)
        }
        if ((latest.tool ?? 'schwenken') !== initialTool) {
          handle.setTool?.(latest.tool ?? 'schwenken')
        }
        if ((latest.selection ?? []) !== initialSelection) {
          handle.setSelection?.(latest.selection ?? [])
        }
        // add-measure-draw (#11, design.md D4): tolerante Aufrufe - dieselbe Begruendung wie
        // bei `setFog`/`setTool`/`setSelection`, fuer Mocks aus Changes vor #11.
        if ((latest.annotations ?? []) !== initialAnnotations) {
          handle.setAnnotations?.(latest.annotations ?? [])
        }
        if ((latest.annotationOptions ?? DEFAULT_ANNOTATION_OPTIONS) !== initialAnnotationOptions) {
          handle.setAnnotationOptions?.(latest.annotationOptions ?? DEFAULT_ANNOTATION_OPTIONS)
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

  // add-fog-of-war (#16, design.md D6): tolerante Aufrufe - dieselbe Begruendung wie bei
  // `setTokens` oben, fuer Mocks aus Changes vor #16.
  useEffect(() => {
    handleRef.current?.setFog?.(fog ?? null)
  }, [fog])

  useEffect(() => {
    handleRef.current?.setTool?.(tool ?? 'schwenken')
  }, [tool])

  useEffect(() => {
    handleRef.current?.setSelection?.(selection ?? [])
  }, [selection])

  // add-measure-draw (#11, design.md D4): tolerante Aufrufe - dieselbe Begruendung wie bei
  // `setTokens`/`setFog`, fuer Mocks aus Changes vor #11.
  useEffect(() => {
    handleRef.current?.setAnnotations?.(annotations ?? [])
  }, [annotations])

  useEffect(() => {
    handleRef.current?.setAnnotationOptions?.(annotationOptions ?? DEFAULT_ANNOTATION_OPTIONS)
  }, [annotationOptions])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
