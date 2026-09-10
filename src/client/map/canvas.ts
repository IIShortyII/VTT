import { Application, Assets, Container, Graphics, Sprite, type FederatedPointerEvent, type Texture } from 'pixi.js'

import { cellCorners, cellRange } from '../../shared/grid.js'
import type { Grid } from '../../shared/map.js'
import { panBy, zoomAt, type View } from './viewport.js'

// Die einzige Datei, die `pixi.js` importiert (design.md D8) - die Mock-Grenze der
// Komponententests (spec.md "Testinfrastruktur"): ein Test ersetzt dieses Modul, statt
// PixiJS-Interna nachzubilden. Alle Rechnung liegt in `shared/grid.ts` und
// `client/map/viewport.ts` und ist dort getestet; hier steht nur das Zeichnen und die
// Ereignisverdrahtung, die der menschliche App-Test abnimmt (constitution.md §3.4).

export interface MapCanvasOptions {
  imageUrl: string | null
  grid: Grid
}

export interface MapCanvasHandle {
  setGrid(grid: Grid): void
  setImage(url: string | null): void
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

/**
 * Erzeugt die Kartenansicht: Bild und Raster auf einem Canvas mit Schwenken und Zoomen
 * (design.md D8, spec.md Requirement "Sicht mit Schwenken und Zoomen"). `container` bekommt
 * das erzeugte `<canvas>` angehaengt.
 */
export async function createMapCanvas(container: HTMLElement, options: MapCanvasOptions): Promise<MapCanvasHandle> {
  const app = new Application()
  await app.init({ resizeTo: container, background: BACKGROUND_COLOR, antialias: true })
  container.appendChild(app.canvas)

  const root = new Container()
  app.stage.addChild(root)

  const gridGraphics = new Graphics()
  root.addChild(gridGraphics)

  let sprite: Sprite | null = null
  let currentGrid: Grid = options.grid
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
    const texture: Texture = await Assets.load(versionedUrl)
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

  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen

  let dragging = false
  let lastPoint = { x: 0, y: 0 }

  function onPointerDown(event: FederatedPointerEvent): void {
    dragging = true
    lastPoint = { x: event.global.x, y: event.global.y }
  }

  function onPointerMove(event: FederatedPointerEvent): void {
    if (!dragging) {
      return
    }
    const point = { x: event.global.x, y: event.global.y }
    view = panBy(view, point.x - lastPoint.x, point.y - lastPoint.y)
    lastPoint = point
    applyView()
  }

  function onPointerUp(): void {
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
  await applyImage(options.imageUrl)

  return {
    setGrid(grid: Grid): void {
      currentGrid = grid
      drawGrid()
    },
    setImage(url: string | null): void {
      void applyImage(url)
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
      app.destroy(true, { children: true, texture: true })
    },
  }
}
