import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'

import { DEFAULT_GRID, GRID_TYPES, IMAGE_MIME_TYPES, type Grid, type GridType, type MapSummary } from '../../shared/map.js'
import { createMap, deleteMap, listMaps, mapImageUrl, updateMap, uploadMapImage } from './api.js'
import { MapCanvas } from './MapCanvas.js'

// Kartenbibliothek der angemeldeten Ansicht (design.md D9, spec.md Requirement
// "Bibliotheksoberflaeche"). Zustand `liste` (eigene Karten, Formular "Neue Karte") und
// `detail` (Kartenansicht mit Canvas, Rasterformular, Bild ersetzen, Loeschen nach
// Bestaetigung, Zurueck zur Liste) - kein Router (Muster wie `SessionList`/`SessionRoom`).
// ui-shell (#84, design.md D4): die Rueckkehr zur Sitzungsliste liegt ausschliesslich in der
// Top-Bar der App-Shell - keine Prop `onBack`, keine eigene Schaltflaeche dafuer. Die innere
// Schaltflaeche der Kartenansicht (zurueck zur Kartenliste) heisst `Zur Bibliothek`, damit es
// im Dokument nie zwei Schaltflaechen mit dem Namen "Zurueck" gibt.

type LibraryView = { view: 'liste' } | { view: 'detail'; mapId: string }

const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',')

const LOAD_FAILURE_MESSAGE = 'Die Karten konnten nicht geladen werden.'
const GENERIC_CREATE_ERROR_MESSAGE = 'Die Karte konnte nicht angelegt werden. Bitte versuche es erneut.'
const GENERIC_SAVE_ERROR_MESSAGE = 'Die Karte konnte nicht gespeichert werden. Bitte versuche es erneut.'
const GENERIC_UPLOAD_ERROR_MESSAGE = 'Das Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.'
const GENERIC_DELETE_ERROR_MESSAGE = 'Die Karte konnte nicht gelöscht werden. Bitte versuche es erneut.'

function gridsEqual(a: Grid, b: Grid): boolean {
  return a.type === b.type && a.size === b.size && a.offsetX === b.offsetX && a.offsetY === b.offsetY
}

export function MapLibrary() {
  const [view, setView] = useState<LibraryView>({ view: 'liste' })
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [current, setCurrent] = useState<MapSummary | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [draftName, setDraftName] = useState('')
  const [draftGridType, setDraftGridType] = useState<GridType>(DEFAULT_GRID.type)
  const [draftSize, setDraftSize] = useState<number>(DEFAULT_GRID.size)
  const [draftOffsetX, setDraftOffsetX] = useState<number>(DEFAULT_GRID.offsetX)
  const [draftOffsetY, setDraftOffsetY] = useState<number>(DEFAULT_GRID.offsetY)

  const reload = async () => {
    const result = await listMaps()
    if (result.ok) {
      setMaps(result.maps)
      setLoadError(null)
    } else {
      setLoadError(result.message)
    }
  }

  useEffect(() => {
    reload().catch((error: unknown) => {
      console.error(error)
      setLoadError(LOAD_FAILURE_MESSAGE)
    })
  }, [])

  const applyDrafts = (map: MapSummary) => {
    setDraftName(map.name)
    setDraftGridType(map.grid.type)
    setDraftSize(map.grid.size)
    setDraftOffsetX(map.grid.offsetX)
    setDraftOffsetY(map.grid.offsetY)
  }

  const openMap = (map: MapSummary) => {
    setCurrent(map)
    applyDrafts(map)
    setDetailError(null)
    setUploadError(null)
    setConfirmingDelete(false)
    setView({ view: 'detail', mapId: map.id })
  }

  const backToList = () => {
    setView({ view: 'liste' })
    setCurrent(null)
    setConfirmingDelete(false)
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const result = await createMap({ name })
      if (!result.ok) {
        setCreateError(result.message)
        return
      }
      if (file) {
        const uploadResult = await uploadMapImage(result.map.id, file)
        if (!uploadResult.ok) {
          setCreateError(uploadResult.message)
        }
      }
      setName('')
      setFile(null)
      await reload()
    } catch (error) {
      console.error(error)
      setCreateError(GENERIC_CREATE_ERROR_MESSAGE)
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!current) {
      return
    }
    const draftGrid: Grid = { type: draftGridType, size: draftSize, offsetX: draftOffsetX, offsetY: draftOffsetY }
    const nameChanged = draftName !== current.name
    const gridChanged = !gridsEqual(draftGrid, current.grid)
    if (!nameChanged && !gridChanged) {
      // Nichts geaendert - kein Aufruf, `UpdateMapInputSchema` verlangt ohnehin mindestens
      // eines von beiden.
      return
    }

    setSaving(true)
    setDetailError(null)
    try {
      const result = await updateMap(current.id, {
        ...(nameChanged ? { name: draftName } : {}),
        ...(gridChanged ? { grid: draftGrid } : {}),
      })
      if (result.ok) {
        setCurrent(result.map)
        applyDrafts(result.map)
        await reload()
      } else {
        setDetailError(result.message)
      }
    } catch (error) {
      console.error(error)
      setDetailError(GENERIC_SAVE_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  const handleReplaceImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!selected || !current) {
      return
    }
    setUploadError(null)
    try {
      const result = await uploadMapImage(current.id, selected)
      if (result.ok) {
        setCurrent(result.map)
        await reload()
      } else {
        setUploadError(result.message)
      }
    } catch (error) {
      console.error(error)
      setUploadError(GENERIC_UPLOAD_ERROR_MESSAGE)
    }
  }

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    void handleConfirmedDelete()
  }

  const handleConfirmedDelete = async () => {
    if (!current) {
      return
    }
    setDetailError(null)
    try {
      const result = await deleteMap(current.id)
      if (result.ok) {
        backToList()
        await reload()
      } else {
        setDetailError(result.message)
        setConfirmingDelete(false)
      }
    } catch (error) {
      console.error(error)
      setDetailError(GENERIC_DELETE_ERROR_MESSAGE)
      setConfirmingDelete(false)
    }
  }

  if (view.view === 'detail' && current) {
    return (
      <div>
        <button type="button" onClick={backToList}>
          Zur Bibliothek
        </button>
        <h1>{current.name}</h1>
        {detailError !== null && <p role="alert">{detailError}</p>}

        <div style={{ width: '100%', height: 480 }}>
          <MapCanvas imageUrl={current.hasImage ? mapImageUrl(current.id) : null} grid={current.grid} tokens={[]} />
        </div>

        <form onSubmit={(event) => void handleSave(event)}>
          <h2>Raster und Name</h2>
          <label htmlFor="map-detail-name">Name</label>
          <input
            id="map-detail-name"
            name="name"
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            required
          />

          <label htmlFor="map-grid-type">Rastertyp</label>
          <select
            id="map-grid-type"
            name="gridType"
            value={draftGridType}
            onChange={(event) => setDraftGridType(event.target.value as GridType)}
          >
            {GRID_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <label htmlFor="map-grid-size">Zellgröße</label>
          <input
            id="map-grid-size"
            name="gridSize"
            type="number"
            value={draftSize}
            onChange={(event) => setDraftSize(Number(event.target.value))}
          />

          <label htmlFor="map-grid-offset-x">Versatz X</label>
          <input
            id="map-grid-offset-x"
            name="gridOffsetX"
            type="number"
            value={draftOffsetX}
            onChange={(event) => setDraftOffsetX(Number(event.target.value))}
          />

          <label htmlFor="map-grid-offset-y">Versatz Y</label>
          <input
            id="map-grid-offset-y"
            name="gridOffsetY"
            type="number"
            value={draftOffsetY}
            onChange={(event) => setDraftOffsetY(Number(event.target.value))}
          />

          <button type="submit" disabled={saving}>
            Speichern
          </button>
        </form>

        <div>
          <label htmlFor="map-replace-image">Bild ersetzen</label>
          <input id="map-replace-image" type="file" accept={IMAGE_ACCEPT} onChange={(event) => void handleReplaceImage(event)} />
          {uploadError !== null && <p role="alert">{uploadError}</p>}
        </div>

        <button type="button" onClick={handleDeleteClick}>
          {confirmingDelete ? 'Wirklich löschen' : 'Löschen'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1>Kartenbibliothek</h1>
      {loadError !== null && <p role="alert">{loadError}</p>}

      <ul>
        {maps.map((map) => (
          <li key={map.id}>
            {!map.hasImage && <span>{`${map.name} (ohne Bild)`}</span>}
            <button type="button" onClick={() => openMap(map)}>
              {map.name}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={(event) => void handleCreate(event)}>
        <h2>Neue Karte</h2>
        <label htmlFor="map-name">Name</label>
        <input id="map-name" name="name" type="text" value={name} onChange={(event) => setName(event.target.value)} required />
        <label htmlFor="map-file">Bilddatei</label>
        <input
          id="map-file"
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {createError !== null && <p role="alert">{createError}</p>}
        <button type="submit" disabled={creating}>
          Anlegen
        </button>
      </form>
    </div>
  )
}
