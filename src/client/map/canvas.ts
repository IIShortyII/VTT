import { Application, Assets, Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Texture } from 'pixi.js'

import { cellAt, cellCenter, cellCorners, cellRange, type Cell } from '../../shared/grid.js'
import type { Grid } from '../../shared/map.js'
import type { Token } from '../../shared/token.js'
import { panBy, zoomAt, type View } from './viewport.js'

// Die einzige Datei, die `pixi.js` importiert (design.md D8) - die Mock-Grenze der
// Komponententests (spec.md "Testinfrastruktur"): ein Test ersetzt dieses Modul, statt
// PixiJS-Interna nachzubilden. Alle Rechnung liegt in `shared/grid.ts` und
// `client/map/viewport.ts` und ist dort getestet; hier steht nur das Zeichnen und die
// Ereignisverdrahtung, die der menschliche App-Test abnimmt (constitution.md §3.4).

export interface MapCanvasOptions {
  imageUrl: string | null
  grid: Grid
  // session-token (#14, design.md D6): der Anfangsbestand und - nur fuer den Spielleiter -
  // der Rueckruf beim Loslassen eines gezogenen Tokens. `onTokenMove` wird nur beim Erzeugen
  // gelesen (kein Ziehen fuer Spieler); eine spaetere Aenderung wirkt nicht, weil sich die
  // Rolle im Raum nicht aendert.
  tokens: Token[]
  onTokenMove?: (tokenId: string, cell: Cell) => void
}

export interface MapCanvasHandle {
  setGrid(grid: Grid): void
  setImage(url: string | null): void
  setTokens(tokens: Token[]): void
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

// session-token (#14, design.md D6): Radiusanteil der Zellgroesse und Textfarben/-groessen
// der Tokendarstellung.
const TOKEN_RADIUS_FACTOR = 0.9
const TOKEN_STROKE_COLOR = 0xffffff
const TOKEN_STROKE_WIDTH = 2
const TOKEN_SYMBOL_COLOR = 0xffffff
const TOKEN_NAME_COLOR = 0xffffff
const TOKEN_NAME_FONT_SIZE = 12
const TOKEN_NAME_GAP = 4

/** Parst einen Hex-Farbwert (`#rrggbb`, aus `shared/token.ts` bereits validiert) in die von
 * PixiJS erwartete Zahl. */
function parseColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16)
}

/**
 * Erzeugt die Kartenansicht: Bild und Raster auf einem Canvas mit Schwenken und Zoomen
 * (design.md D8, spec.md Requirement "Sicht mit Schwenken und Zoomen"), sowie die
 * Tokenebene darueber (session-token #14, design.md D6). `container` bekommt das erzeugte
 * `<canvas>` angehaengt.
 *
 * App-Test Runde 2 (#14): scheitert der Aufbau, nachdem das `<canvas>` bereits angehaengt
 * ist, wird die Application wieder zerstoert (`removeView`) - kein verwaistes Element im
 * `container`. Ein fehlgeschlagenes Bild allein reisst diesen Aufbau nicht mit
 * (`applyImage` faengt seinen eigenen Fehler ab, siehe dort).
 */
export async function createMapCanvas(container: HTMLElement, options: MapCanvasOptions): Promise<MapCanvasHandle> {
  const app = new Application()
  await app.init({ resizeTo: container, background: BACKGROUND_COLOR, antialias: true })
  container.appendChild(app.canvas)

  try {
    const root = new Container()
    app.stage.addChild(root)

    const gridGraphics = new Graphics()
    root.addChild(gridGraphics)

    const tokenLayer = new Container()
    root.addChild(tokenLayer)

    let sprite: Sprite | null = null
    let currentGrid: Grid = options.grid
    let currentTokens: Token[] = options.tokens
    let tokenContainers: Container[] = []
    const onTokenMove = options.onTokenMove
    let loadedUrl: string | null = null
    let imageCounter = 0
    let loadToken = 0
    let destroyed = false
    let view: View = { x: 0, y: 0, scale: 1 }

    function applyView(): void {
      root.position.set(view.x, view.y)
      root.scale.set(view.scale)
    }

    function drawGrid(): void {
      gridGraphics.clear()
      const width = sprite?.texture.width ?? FALLBACK_WIDTH
      const height = sprite?.texture.height ?? FALLBACK_HEIGHT
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

    /** Laedt (oder entfernt) das Kartenbild. Ein `loadToken` verwirft eine veraltete Antwort,
     * wenn zwischenzeitlich ein neuer Aufruf oder `destroy()` erfolgte. */
    async function applyImage(url: string | null): Promise<void> {
      const token = ++loadToken

      // Der Server sendet `no-store`, aber `Assets` fuehrt einen eigenen Cache nach URL - ohne
      // `unload` der vorigen URL zeigte "Bild ersetzen" die alte Textur (design.md D8).
      if (loadedUrl) {
        await Assets.unload(loadedUrl).catch(() => undefined)
      }
      if (destroyed || token !== loadToken) {
        return
      }

      if (url === null) {
        loadedUrl = null
        if (sprite) {
          root.removeChild(sprite)
          sprite.destroy()
          sprite = null
        }
        drawGrid()
        return
      }

      imageCounter += 1
      const versionedUrl = `${url}${url.includes('?') ? '&' : '?'}v=${imageCounter}`

      let texture: Texture
      try {
        // App-Test Runde 2 (#14): die Bild-URL (`GET /api/maps/:id/image`) traegt aus
        // Sicherheitsgruenden keine Dateiendung - ohne expliziten Parser findet `Assets.load`
        // keinen Lader, liefert `null` statt einer Textur, und `new Sprite(null)` wirft. Der
        // explizite Parser macht das Laden unabhaengig von der Dateiendung.
        texture = await Assets.load<Texture>({ src: versionedUrl, parser: 'loadTextures' })
      } catch (error) {
        // Ein fehlgeschlagenes Bild reisst die Kartenansicht nicht mit (Erwartung aus dem
        // App-Test): Raster und Tokens bleiben, wie sie sind; nur das Bild bleibt aus.
        console.error(error)
        loadedUrl = null
        return
      }
      if (destroyed || token !== loadToken) {
        return
      }
      loadedUrl = versionedUrl

      if (sprite) {
        root.removeChild(sprite)
        sprite.destroy()
      }
      sprite = new Sprite(texture)
      root.addChildAt(sprite, 0)
      drawGrid()
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

    // Ziehen (nur mit `onTokenMove`, design.md D6): `pointerdown` auf einem Token-Container
    // merkt sich die gezogene `id` und stoppt die Propagation, damit die Buehne nicht
    // schwenkt; `pointermove`/`pointerup` der Buehne verschieben nur den Container
    // (Vorschau) bzw. rechnen die Zielzelle aus und setzen den Container danach zurueck - die
    // neue Position kommt mit `setTokens` vom Server (constitution.md §9.1).
    let dragTokenId: string | null = null
    let dragContainer: Container | null = null
    let dragOrigin: { x: number; y: number } | null = null

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

      if (onTokenMove) {
        tokenContainer.eventMode = 'static'
        tokenContainer.cursor = 'grab'
        tokenContainer.on('pointerdown', (event: FederatedPointerEvent) => {
          event.stopPropagation()
          dragTokenId = token.id
          dragContainer = tokenContainer
          dragOrigin = { x: tokenContainer.position.x, y: tokenContainer.position.y }
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
      dragging = true
      lastPoint = { x: event.global.x, y: event.global.y }
    }

    function onPointerMove(event: FederatedPointerEvent): void {
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
    drawTokens()
    await applyImage(options.imageUrl)

    return {
      setGrid(grid: Grid): void {
        currentGrid = grid
        drawGrid()
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
        if (loadedUrl) {
          void Assets.unload(loadedUrl).catch(() => undefined)
        }
        for (const tokenContainer of tokenContainers) {
          tokenContainer.destroy({ children: true })
        }
        tokenLayer.destroy({ children: true })
        app.destroy(true, { children: true, texture: true })
      },
    }
  } catch (error) {
    // (3) im Ablehnungsbefund aus dem App-Test: scheitert der Aufbau nach `appendChild`
    // dennoch (nicht durch `applyImage`, das seinen eigenen Fehler abfaengt), bleibt kein
    // verwaistes `<canvas>` im `container` zurueck.
    app.destroy(true, { children: true, texture: true })
    throw error
  }
}
