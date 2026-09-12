import { Application, Assets, Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Texture } from 'pixi.js'

import { cellKey, cellsInRange, type FogTool } from '../../shared/fog.js'
import { cellAt, cellCenter, cellCorners, cellRange, type Cell } from '../../shared/grid.js'
import type { Grid } from '../../shared/map.js'
import type { Token } from '../../shared/token.js'
import { conditionSymbol } from '../session/conditions.js'
import { panBy, zoomAt, type View } from './viewport.js'

// Die einzige Datei, die `pixi.js` importiert (design.md D8) - die Mock-Grenze der
// Komponententests (spec.md "Testinfrastruktur"): ein Test ersetzt dieses Modul, statt
// PixiJS-Interna nachzubilden. Alle Rechnung liegt in `shared/grid.ts`, `shared/fog.ts` und
// `client/map/viewport.ts` und ist dort getestet; hier steht nur das Zeichnen und die
// Ereignisverdrahtung, die der menschliche App-Test abnimmt (constitution.md §3.4).

/** Fog-Ebene der Kartenansicht (add-fog-of-war #16, design.md D6): die aufgedeckten Zellen
 * und ob die Verdeckung deckend ist (`opaque` - fuer einen Spieler `true`, fuer den
 * Spielleiter `false`). `null` zeichnet keine Fog-Ebene (ohne aktive Karte). */
export interface FogLayer {
  revealed: Cell[]
  opaque: boolean
}

export interface MapCanvasOptions {
  imageUrl: string | null
  grid: Grid
  // session-token (#14, design.md D6): der Anfangsbestand und der Rueckruf beim Loslassen
  // eines gezogenen Tokens. add-token-assignment (#15, design.md D5): fuer JEDE Rolle
  // uebergeben, greifbar ist ein Token nur, wenn zusaetzlich `canMoveToken` fehlt oder
  // `true` liefert - dieselbe Regel, die der Server anwendet (`shared/token.ts`,
  // `canMoveToken`). Beide werden nur beim Erzeugen gelesen (Rolle und eigene `userId`
  // aendern sich im Raum nicht); eine spaetere Aenderung wirkt nicht direkt, sondern erst
  // mit dem naechsten `setTokens` (der Bestand vom Server), weil `drawTokens` alle
  // Container ohnehin neu baut.
  tokens: Token[]
  onTokenMove?: (tokenId: string, cell: Cell) => void
  canMoveToken?: (token: Token) => boolean
  // add-fog-of-war (#16, design.md D6): Fog-Ebene, aktuelles Werkzeug und gespeicherte
  // Auswahl beim Erzeugen; `onCellsSelected` wie `onTokenMove` nur beim Erzeugen gelesen.
  fog?: FogLayer | null
  tool?: FogTool
  selection?: Cell[]
  onCellsSelected?: (cells: Cell[]) => void
}

export interface MapCanvasHandle {
  setGrid(grid: Grid): void
  setImage(url: string | null): void
  setTokens(tokens: Token[]): void
  setFog(fog: FogLayer | null): void
  setTool(tool: FogTool): void
  setSelection(cells: Cell[]): void
  destroy(): void
}

/** Feste Rasterflaeche ohne Bild, damit das Raster auch vor dem ersten Upload sichtbar ist
 * (design.md D8). */
const FALLBACK_WIDTH = 1000
const FALLBACK_HEIGHT = 1000

const ZOOM_IN_FACTOR = 1.1
const ZOOM_OUT_FACTOR = 1 / 1.1
const GRID_LINE_COLOR = 0xffffff
const GRID_LINE_WIDTH = 1
const BACKGROUND_COLOR = 0x202020

// App-Test Runde 3 (#14): modulweiter Zaehler fuer eine je Canvas-Instanz eindeutige
// Cache-Kennung. React-StrictMode (Dev) erzeugt eine Kartenansicht kurzzeitig doppelt; ohne
// diese Kennung laden beide Instanzen dasselbe Bild unter derselben Query ("?v=1") und
// teilen sich dieselbe Textur im `Assets`-Cache - zerstoert die zuerst abgeraeumte Instanz
// beim Unmount ihre (geteilte) Textur, wirft der Render-Loop der zweiten Instanz
// ("textureSource is null"). Die Kennung macht den Cache-Schluessel je Instanz eindeutig,
// unabhaengig vom (je Instanz bei 1 startenden) Ladezaehler.
let instanceCounter = 0

// session-token (#14, design.md D6): Radiusanteil der Zellgroesse und Textfarben/-groessen
// der Tokendarstellung.
const TOKEN_RADIUS_FACTOR = 0.9
const TOKEN_STROKE_COLOR = 0xffffff
const TOKEN_STROKE_WIDTH = 2
const TOKEN_SYMBOL_COLOR = 0xffffff
const TOKEN_NAME_COLOR = 0xffffff
const TOKEN_NAME_FONT_SIZE = 12
const TOKEN_NAME_GAP = 4

// add-token-assignment (#15, design.md D5): Kennzeichnung greifbarer Tokens - ein zweiter
// Kreisrand ausserhalb des weissen Rands in einer festen Akzentfarbe. Aussehen nimmt der
// App-Test ab, kein Test haengt daran.
const TOKEN_MOVABLE_RING_COLOR = 0x33ff99
const TOKEN_MOVABLE_RING_WIDTH = 2
const TOKEN_MOVABLE_RING_GAP = 3

// add-token-stats (#61, design.md D7): Healthbar unter dem Namen, nur wenn hp UND hpMax
// gesetzt sind - tempHp als eigener (blauer) Abschnitt am linken Rand, halbe Hoehe.
const TOKEN_BAR_HEIGHT = 5
const TOKEN_BAR_BACKGROUND_COLOR = 0x000000
const TOKEN_BAR_GREEN_COLOR = 0x33cc33
const TOKEN_BAR_YELLOW_COLOR = 0xffcc00
const TOKEN_BAR_RED_COLOR = 0xcc3333
const TOKEN_BAR_TEMP_COLOR = 0x3399ff

// add-token-stats (#61, design.md D7): bis zu drei Markierungssymbole am oberen Rand, ab der
// vierten Markierung ersetzt das dritte Symbol ein "+N".
const TOKEN_CONDITION_MAX_SYMBOLS = 3
const TOKEN_CONDITION_SYMBOL_COLOR = 0xffffff

// add-fog-of-war (#16, design.md D6): Farbe/Alpha der Fog-Ebene (deckend fuer Spieler,
// halbtransparent fuer den Spielleiter) und der Auswahl-Ebene (Aussehen frei, App-Test).
const FOG_COLOR = 0x000000
const FOG_OPAQUE_ALPHA = 1
const FOG_TRANSLUCENT_ALPHA = 0.55
const SELECTION_COLOR = 0x3399ff
const SELECTION_FILL_ALPHA = 0.35
const SELECTION_STROKE_WIDTH = 2

/** Parst einen Hex-Farbwert (`#rrggbb`, aus `shared/token.ts` bereits validiert) in die von
 * PixiJS erwartete Zahl. */
function parseColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16)
}

/** Vereinigung zweier Zelllisten ohne Doppelte (add-fog-of-war #16, design.md D6) - benutzt
 * fuer das Vorschau-Rechteck zusaetzlich zur gespeicherten Auswahl. */
function mergeCells(a: Cell[], b: Cell[]): Cell[] {
  const byKey = new Map<string, Cell>()
  for (const cell of a) {
    byKey.set(cellKey(cell), cell)
  }
  for (const cell of b) {
    byKey.set(cellKey(cell), cell)
  }
  return [...byKey.values()]
}

/**
 * Erzeugt die Kartenansicht: Bild und Raster auf einem Canvas mit Schwenken und Zoomen
 * (design.md D8, spec.md Requirement "Sicht mit Schwenken und Zoomen"), die Tokenebene
 * darueber (session-token #14, design.md D6) und die Fog-/Auswahl-Ebenen dazwischen
 * (add-fog-of-war #16, design.md D6). `container` bekommt das erzeugte `<canvas>` angehaengt.
 *
 * App-Test Runde 2 (#14): scheitert der Aufbau, nachdem das `<canvas>` bereits angehaengt
 * ist, wird die Application wieder zerstoert (`removeView`) - kein verwaistes Element im
 * `container`. Ein fehlgeschlagenes Bild allein reisst diesen Aufbau nicht mit
 * (`applyImage` faengt seinen eigenen Fehler ab, siehe dort).
 */
export async function createMapCanvas(container: HTMLElement, options: MapCanvasOptions): Promise<MapCanvasHandle> {
  const instanceId = ++instanceCounter
  const app = new Application()
  await app.init({ resizeTo: container, background: BACKGROUND_COLOR, antialias: true })
  container.appendChild(app.canvas)

  try {
    const root = new Container()
    app.stage.addChild(root)

    const gridGraphics = new Graphics()
    root.addChild(gridGraphics)

    // add-fog-of-war (#16, design.md D6): Fog-Ebene ueber Bild und Raster, Auswahl-Ebene
    // darueber, beide unter der Tokenebene - Tokens bleiben sichtbar (#17, Nicht im Umfang).
    const fogGraphics = new Graphics()
    root.addChild(fogGraphics)

    const selectionGraphics = new Graphics()
    root.addChild(selectionGraphics)

    const tokenLayer = new Container()
    root.addChild(tokenLayer)

    let sprite: Sprite | null = null
    let currentGrid: Grid = options.grid
    let currentTokens: Token[] = options.tokens
    let tokenContainers: Container[] = []
    const onTokenMove = options.onTokenMove
    const canMoveTokenOption = options.canMoveToken
    let currentFog: FogLayer | null = options.fog ?? null
    let currentTool: FogTool = options.tool ?? 'schwenken'
    let currentSelection: Cell[] = options.selection ?? []
    const onCellsSelected = options.onCellsSelected
    let loadedUrl: string | null = null
    let imageCounter = 0
    let loadToken = 0
    let destroyed = false
    let view: View = { x: 0, y: 0, scale: 1 }

    function applyView(): void {
      root.position.set(view.x, view.y)
      root.scale.set(view.scale)
    }

    function currentSize(): { width: number; height: number } {
      return { width: sprite?.texture.width ?? FALLBACK_WIDTH, height: sprite?.texture.height ?? FALLBACK_HEIGHT }
    }

    function drawGrid(): void {
      gridGraphics.clear()
      const { width, height } = currentSize()
      const range = cellRange(currentGrid, width, height)
      for (let row = range.minRow; row <= range.maxRow; row++) {
        for (let col = range.minCol; col <= range.maxCol; col++) {
          const corners = cellCorners(currentGrid, { col, row })
          if (corners.length === 0) {
            continue
          }
          gridGraphics.moveTo(corners[0].x, corners[0].y)
          for (let i = 1; i < corners.length; i++) {
            gridGraphics.lineTo(corners[i].x, corners[i].y)
          }
          gridGraphics.closePath()
        }
      }
      gridGraphics.stroke({ width: GRID_LINE_WIDTH, color: GRID_LINE_COLOR })
    }

    /** add-fog-of-war (#16, design.md D6): jede Zelle des Zellbereichs der Karte, die nicht
     * aufgedeckt ist, als dunkle Flaeche - deckend fuer Spieler (`opaque`), sonst
     * halbtransparent. Ohne Fog-Darstellung (`currentFog === null`) bleibt die Ebene leer. */
    function drawFog(): void {
      fogGraphics.clear()
      if (!currentFog) {
        return
      }
      const { width, height } = currentSize()
      const range = cellRange(currentGrid, width, height)
      const revealedKeys = new Set(currentFog.revealed.map(cellKey))
      let hasSegment = false
      for (let row = range.minRow; row <= range.maxRow; row++) {
        for (let col = range.minCol; col <= range.maxCol; col++) {
          if (revealedKeys.has(cellKey({ col, row }))) {
            continue
          }
          const corners = cellCorners(currentGrid, { col, row })
          if (corners.length === 0) {
            continue
          }
          hasSegment = true
          fogGraphics.moveTo(corners[0].x, corners[0].y)
          for (let i = 1; i < corners.length; i++) {
            fogGraphics.lineTo(corners[i].x, corners[i].y)
          }
          fogGraphics.closePath()
        }
      }
      if (hasSegment) {
        fogGraphics.fill({ color: FOG_COLOR, alpha: currentFog.opaque ? FOG_OPAQUE_ALPHA : FOG_TRANSLUCENT_ALPHA })
      }
    }

    /** add-fog-of-war (#16, design.md D6): die gespeicherte Auswahl plus ein waehrend des
     * Ziehens aktives Vorschau-Rechteck (`toolPreview`) als halbtransparente Akzentflaeche
     * mit Rand. */
    function drawSelection(): void {
      selectionGraphics.clear()
      const cells = toolPreview.length > 0 ? mergeCells(currentSelection, toolPreview) : currentSelection
      let hasSegment = false
      for (const cell of cells) {
        const corners = cellCorners(currentGrid, cell)
        if (corners.length === 0) {
          continue
        }
        hasSegment = true
        selectionGraphics.moveTo(corners[0].x, corners[0].y)
        for (let i = 1; i < corners.length; i++) {
          selectionGraphics.lineTo(corners[i].x, corners[i].y)
        }
        selectionGraphics.closePath()
      }
      if (hasSegment) {
        selectionGraphics.fill({ color: SELECTION_COLOR, alpha: SELECTION_FILL_ALPHA })
        selectionGraphics.stroke({ width: SELECTION_STROKE_WIDTH, color: SELECTION_COLOR })
      }
    }

    /**
     * Laedt (oder entfernt) das Kartenbild. Ein `loadToken` verwirft eine veraltete Antwort,
     * wenn zwischenzeitlich ein neuer Aufruf oder `destroy()` erfolgte.
     *
     * App-Test Runde 5 (#14, Kartenwechsel liess Bild/Raster verschwinden): erst die neue
     * Textur laden, danach das alte Sprite entfernen/zeichnen, und ERST DANACH die alte URL
     * bei `Assets` entladen - nicht umgekehrt. Vorher wurde die alte Textur zuerst entladen
     * (`Assets.unload`), waehrend das alte Sprite noch im Szenengraph haengt; der Ticker
     * rendert es dann mit bereits zerstoerter Textur ("textureSource is null"), der Renderer
     * stirbt, das Canvas bleibt leer. Eine waehrenddessen veraltete Ladung (ein neuerer
     * Aufruf oder `destroy()` kam dazwischen) fasst weder Sprite noch die aktuelle
     * `loadedUrl` an - sie entlaedt nur ihre eigene, dann ueberfluessige Textur.
     */
    async function applyImage(url: string | null): Promise<void> {
      const token = ++loadToken
      const previousUrl = loadedUrl

      if (url === null) {
        if (sprite) {
          root.removeChild(sprite)
          sprite.destroy()
          sprite = null
        }
        loadedUrl = null
        drawGrid()
        drawFog()
        if (previousUrl) {
          await Assets.unload(previousUrl).catch(() => undefined)
        }
        return
      }

      imageCounter += 1
      const versionedUrl = `${url}${url.includes('?') ? '&' : '?'}v=${instanceId}-${imageCounter}`

      let texture: Texture
      try {
        // App-Test Runde 2 (#14): die Bild-URL (`GET /api/maps/:id/image`) traegt aus
        // Sicherheitsgruenden keine Dateiendung - ohne expliziten Parser findet `Assets.load`
        // keinen Lader, liefert `null` statt einer Textur, und `new Sprite(null)` wirft. Der
        // explizite Parser macht das Laden unabhaengig von der Dateiendung.
        texture = await Assets.load<Texture>({ src: versionedUrl, parser: 'loadTextures' })
      } catch (error) {
        // Ein fehlgeschlagenes Bild reisst die Kartenansicht nicht mit (Erwartung aus dem
        // App-Test): das alte Sprite bleibt stehen, `loadedUrl` bleibt unveraendert.
        console.error(error)
        return
      }

      if (destroyed || token !== loadToken) {
        // Veraltete Ladung: weder das Sprite noch die aktuelle `loadedUrl` anfassen - nur die
        // eigene, jetzt ueberfluessige Textur wieder freigeben.
        await Assets.unload(versionedUrl).catch(() => undefined)
        return
      }

      if (sprite) {
        root.removeChild(sprite)
        sprite.destroy()
      }
      sprite = new Sprite(texture)
      root.addChildAt(sprite, 0)
      loadedUrl = versionedUrl
      drawGrid()
      drawFog()

      if (previousUrl) {
        await Assets.unload(previousUrl).catch(() => undefined)
      }
    }

    // session-token (#14, design.md D6): Mittelpunkt der Ankerzelle, bei `quadrat` und
    // `size > 1` um die halbe zusaetzliche Kantenlaenge je Achse verschoben (Ankerzelle oben
    // links, das Token deckt `size x size` Zellen); bei Hex bleibt der Mittelpunkt auf der
    // Ankerzelle.
    function tokenCenter(token: Token): { x: number; y: number } {
      const center = cellCenter(currentGrid, { col: token.col, row: token.row })
      if (currentGrid.type !== 'quadrat' || token.size <= 1) {
        return center
      }
      const offset = ((token.size - 1) * currentGrid.size) / 2
      return { x: center.x + offset, y: center.y + offset }
    }

    // Ziehen (nur bei Greifbarkeit, design.md D6/D5): `pointerdown` auf einem Token-Container
    // merkt sich die gezogene `id` und stoppt die Propagation, damit die Buehne nicht
    // schwenkt; `pointermove`/`pointerup` der Buehne verschieben nur den Container
    // (Vorschau) bzw. rechnen die Zielzelle aus und setzen den Container danach zurueck - die
    // neue Position kommt mit `setTokens` vom Server (constitution.md §9.1).
    let dragTokenId: string | null = null
    let dragContainer: Container | null = null
    let dragOrigin: { x: number; y: number } | null = null

    // add-fog-of-war (#16, design.md D6): Ziehen mit einem Fog-Werkzeug waehlt statt zu
    // schwenken einen Zellbereich - Startzelle und laufendes Vorschau-Rechteck.
    let toolDragStart: Cell | null = null
    let toolPreview: Cell[] = []

    function buildTokenContainer(token: Token): Container {
      const tokenContainer = new Container()
      const center = tokenCenter(token)
      tokenContainer.position.set(center.x, center.y)

      const radius = (token.size * currentGrid.size * TOKEN_RADIUS_FACTOR) / 2
      const circle = new Graphics()
      circle.circle(0, 0, radius)
      circle.fill(parseColor(token.color))
      circle.stroke({ width: TOKEN_STROKE_WIDTH, color: TOKEN_STROKE_COLOR })
      tokenContainer.addChild(circle)

      const symbolText = new Text({
        text: token.icon ?? token.name.charAt(0).toUpperCase(),
        style: { fill: TOKEN_SYMBOL_COLOR, fontSize: Math.max(radius, TOKEN_NAME_FONT_SIZE) },
      })
      symbolText.anchor.set(0.5)
      tokenContainer.addChild(symbolText)

      const nameText = new Text({
        text: token.name,
        style: { fill: TOKEN_NAME_COLOR, fontSize: TOKEN_NAME_FONT_SIZE },
      })
      nameText.anchor.set(0.5, 0)
      nameText.position.set(0, radius + TOKEN_NAME_GAP)
      tokenContainer.addChild(nameText)

      // add-token-assignment (#15, design.md D5): greifbar ist ein Token genau dann, wenn
      // `onTokenMove` gesetzt ist UND `canMoveToken` fehlt oder fuer dieses Token `true`
      // liefert - dieselbe Regel wie am Server (`shared/token.ts`, `canMoveToken`). Nur dann
      // Zieh-Interaktion und Kennzeichnung.
      const movable = Boolean(onTokenMove) && (canMoveTokenOption ? canMoveTokenOption(token) : true)

      if (movable) {
        const ring = new Graphics()
        ring.circle(0, 0, radius + TOKEN_MOVABLE_RING_GAP)
        ring.stroke({ width: TOKEN_MOVABLE_RING_WIDTH, color: TOKEN_MOVABLE_RING_COLOR })
        tokenContainer.addChild(ring)

        tokenContainer.eventMode = 'static'
        tokenContainer.cursor = 'grab'
        tokenContainer.on('pointerdown', (event: FederatedPointerEvent) => {
          // add-fog-of-war (#16, design.md D6): bei einem Fog-Werkzeug weder
          // `stopPropagation` noch Ziehen - die Buehne bekommt das Ereignis und beginnt
          // stattdessen eine Zellauswahl.
          if (currentTool !== 'schwenken') {
            return
          }
          event.stopPropagation()
          dragTokenId = token.id
          dragContainer = tokenContainer
          dragOrigin = { x: tokenContainer.position.x, y: tokenContainer.position.y }
        })
      }

      // add-token-stats (#61, design.md D7): Healthbar unter dem Namen, nur wenn hp UND
      // hpMax gesetzt sind - "nicht gesetzt" und "fuer diesen Empfaenger verborgen" sind
      // serverseitig ununterscheidbar (redactToken), die Karte zeigt also fuer beide nichts.
      if (token.hp !== null && token.hpMax !== null) {
        const barY = radius + TOKEN_NAME_GAP + TOKEN_NAME_FONT_SIZE + 2
        const barWidth = radius * 2
        const hpRatio = token.hpMax > 0 ? Math.max(0, Math.min(1, token.hp / token.hpMax)) : 0
        const hpColor = hpRatio >= 0.5 ? TOKEN_BAR_GREEN_COLOR : hpRatio >= 0.25 ? TOKEN_BAR_YELLOW_COLOR : TOKEN_BAR_RED_COLOR

        const bar = new Graphics()
        bar.rect(-radius, barY, barWidth, TOKEN_BAR_HEIGHT)
        bar.fill(TOKEN_BAR_BACKGROUND_COLOR)
        bar.rect(-radius, barY, barWidth * hpRatio, TOKEN_BAR_HEIGHT)
        bar.fill(hpColor)

        if (token.tempHp !== null && token.tempHp > 0 && token.hpMax > 0) {
          const tempRatio = Math.max(0, Math.min(1, Math.min(token.tempHp, token.hpMax) / token.hpMax))
          bar.rect(-radius, barY, barWidth * tempRatio, TOKEN_BAR_HEIGHT / 2)
          bar.fill(TOKEN_BAR_TEMP_COLOR)
        }

        tokenContainer.addChild(bar)
      }

      // add-token-stats (#61, design.md D7): bis zu drei Markierungssymbole am oberen Rand,
      // ab der vierten Markierung ersetzt das dritte Symbol ein "+N".
      if (token.conditions.length > 0) {
        const count = Math.min(token.conditions.length, TOKEN_CONDITION_MAX_SYMBOLS)
        const symbols =
          token.conditions.length <= TOKEN_CONDITION_MAX_SYMBOLS
            ? token.conditions.slice(0, count).map(conditionSymbol)
            : [conditionSymbol(token.conditions[0]), conditionSymbol(token.conditions[1]), `+${token.conditions.length - 2}`]

        symbols.forEach((symbol, index) => {
          const conditionText = new Text({
            text: symbol,
            style: { fill: TOKEN_CONDITION_SYMBOL_COLOR, fontSize: TOKEN_NAME_FONT_SIZE },
          })
          conditionText.anchor.set(0.5)
          conditionText.position.set((index - (count - 1) / 2) * (TOKEN_NAME_FONT_SIZE + 2), -radius - TOKEN_NAME_GAP)
          tokenContainer.addChild(conditionText)
        })
      }

      return tokenContainer
    }

    function drawTokens(): void {
      for (const tokenContainer of tokenContainers) {
        tokenLayer.removeChild(tokenContainer)
        tokenContainer.destroy({ children: true })
      }
      tokenContainers = currentTokens.map(buildTokenContainer)
      for (const tokenContainer of tokenContainers) {
        tokenLayer.addChild(tokenContainer)
      }
    }

    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen

    let dragging = false
    let lastPoint = { x: 0, y: 0 }

    function onPointerDown(event: FederatedPointerEvent): void {
      // add-fog-of-war (#16, design.md D6): bei einem Fog-Werkzeug beginnt das Ziehen eine
      // Zellauswahl statt eine Schwenkbewegung.
      if (currentTool !== 'schwenken') {
        const point = root.toLocal(event.global)
        toolDragStart = cellAt(currentGrid, point)
        toolPreview = [toolDragStart]
        drawSelection()
        return
      }
      dragging = true
      lastPoint = { x: event.global.x, y: event.global.y }
    }

    function onPointerMove(event: FederatedPointerEvent): void {
      if (toolDragStart) {
        const point = root.toLocal(event.global)
        const current = cellAt(currentGrid, point)
        toolPreview = cellsInRange(toolDragStart, current)
        drawSelection()
        return
      }
      if (dragTokenId !== null) {
        if (dragContainer) {
          const point = root.toLocal(event.global)
          dragContainer.position.set(point.x, point.y)
        }
        return
      }
      if (!dragging) {
        return
      }
      const point = { x: event.global.x, y: event.global.y }
      view = panBy(view, point.x - lastPoint.x, point.y - lastPoint.y)
      lastPoint = point
      applyView()
    }

    function onPointerUp(event: FederatedPointerEvent): void {
      if (toolDragStart) {
        const point = root.toLocal(event.global)
        const current = cellAt(currentGrid, point)
        const cells = cellsInRange(toolDragStart, current)
        toolDragStart = null
        toolPreview = []
        drawSelection()
        onCellsSelected?.(cells)
        return
      }
      if (dragTokenId !== null) {
        const tokenId = dragTokenId
        const draggedContainer = dragContainer
        const origin = dragOrigin
        dragTokenId = null
        dragContainer = null
        dragOrigin = null
        if (draggedContainer && origin) {
          const point = root.toLocal(event.global)
          const cell = cellAt(currentGrid, point)
          draggedContainer.position.set(origin.x, origin.y)
          onTokenMove?.(tokenId, cell)
        }
        return
      }
      dragging = false
    }

    function onWheel(event: WheelEvent): void {
      event.preventDefault()
      const rect = app.canvas.getBoundingClientRect()
      const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const factor = event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR
      view = zoomAt(view, cursor, factor)
      applyView()
    }

    function onResize(): void {
      app.stage.hitArea = app.screen
    }

    app.stage.on('pointerdown', onPointerDown)
    app.stage.on('pointermove', onPointerMove)
    app.stage.on('pointerup', onPointerUp)
    app.stage.on('pointerupoutside', onPointerUp)
    app.canvas.addEventListener('wheel', onWheel, { passive: false })
    app.renderer.on('resize', onResize)

    drawGrid()
    drawFog()
    drawSelection()
    drawTokens()
    await applyImage(options.imageUrl)

    return {
      setGrid(grid: Grid): void {
        currentGrid = grid
        drawGrid()
        drawFog()
        drawSelection()
        // Mittelpunkte haengen am Raster - ein Rasterwechsel zeichnet die Tokens neu
        // (design.md D6).
        drawTokens()
      },
      setImage(url: string | null): void {
        void applyImage(url)
      },
      setTokens(tokens: Token[]): void {
        currentTokens = tokens
        drawTokens()
      },
      setFog(fog: FogLayer | null): void {
        currentFog = fog
        drawFog()
      },
      setTool(tool: FogTool): void {
        currentTool = tool
        // Werkzeugwechsel bricht eine laufende Auswahlbewegung ab (design.md D6).
        toolDragStart = null
        toolPreview = []
        drawSelection()
      },
      setSelection(cells: Cell[]): void {
        currentSelection = cells
        drawSelection()
      },
      destroy(): void {
        if (destroyed) {
          return
        }
        destroyed = true
        app.stage.off('pointerdown', onPointerDown)
        app.stage.off('pointermove', onPointerMove)
        app.stage.off('pointerup', onPointerUp)
        app.stage.off('pointerupoutside', onPointerUp)
        app.canvas.removeEventListener('wheel', onWheel)
        app.renderer.off('resize', onResize)
        // App-Test Runde 5 (#14): erst das Sprite aus dem Szenengraph nehmen und OHNE
        // Textur-Option zerstoeren (die Textur selbst bleibt am Leben) - erst danach die von
        // `Assets` verwaltete Textur ueber `Assets.unload` entladen. Nie eine von `Assets`
        // verwaltete Textur direkt zerstoeren (weder ueber `sprite.destroy({ texture: true
        // })` noch ueber das rekursive `app.destroy(..., { texture: true })`, das sonst noch
        // ein angehaengtes Sprite miterwischen wuerde) - sonst "A Texture managed by Assets
        // was destroyed instead of unloaded".
        if (sprite) {
          root.removeChild(sprite)
          sprite.destroy()
          sprite = null
        }
        if (loadedUrl) {
          void Assets.unload(loadedUrl).catch(() => undefined)
          loadedUrl = null
        }
        for (const tokenContainer of tokenContainers) {
          tokenContainer.destroy({ children: true })
        }
        tokenLayer.destroy({ children: true })
        // App-Test Runde 4 (#14): nicht "true" als erstes Argument - Pixi setzt damit intern
        // "releaseGlobalResources" und leert den GLOBALEN TexturePool (Singleton, von allen
        // Renderern/Canvas-Instanzen geteilt). Die von React StrictMode sofort wieder
        // abgebaute erste Instanz zerstoerte darueber den Pool, den die zweite, sichtbare
        // Instanz noch braucht - das naechste "Text.destroy()" einer Tokenaenderung wirft
        // dann "this._texturePool[key] is undefined". "{ removeView: true }" entfernt nur das
        // eigene Canvas, ohne renderer-uebergreifende, globale Ressourcen anzufassen. Die
        // Fog-/Auswahl-Ebenen sind wie die Rastergrafik Kinder von `root` und werden hierueber
        // (mit `children: true`) mit zerstoert - kein eigener Aufruf noetig.
        app.destroy({ removeView: true }, { children: true, texture: true })
      },
    }
  } catch (error) {
    // (3) im Ablehnungsbefund aus dem App-Test: scheitert der Aufbau nach `appendChild`
    // dennoch (nicht durch `applyImage`, das seinen eigenen Fehler abfaengt), bleibt kein
    // verwaistes `<canvas>` im `container` zurueck. Wie bei `destroy()` oben: nicht "true"
    // als erstes Argument (globale Pixi-Ressourcen, siehe dort), sondern
    // "{ removeView: true }".
    app.destroy({ removeView: true }, { children: true, texture: true })
    throw error
  }
}
