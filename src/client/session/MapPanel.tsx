import { useEffect, useState, type FormEvent } from 'react'

import type { MapSummary } from '../../shared/map.js'
import type { MapInstance } from '../../shared/session-map.js'
import { useT } from '../i18n/locale.js'
import { listMaps } from '../map/api.js'
import { useToasts } from '../ui/toast.js'
import { listSessionMaps, mountMap, unmountMap } from './maps-api.js'

// Kartenverwaltung des Spielleiters im Raum (design.md D7, spec.md Requirement
// "Kartenansicht im Raum"). Nur der Spielleiter rendert diese Komponente - fuer Spieler gibt
// es damit keinen Aufrufer der Instanz- und Kartenliste (constitution.md §9.2); dass der
// Server sie ihm ohnehin verweigert, ist die eigentliche Grenze (`findLedSession`).
// ui-feedback (#88, design.md D4): nach erfolgreichem Einhaengen loest `handleMount` einen
// Toast `Karte eingehängt` aus - Aushaengen und Aktivieren bleiben ohne Toast. Die uebrigen
// Texte dieser Ansicht bleiben Rohstrings (Epic C).

export interface MapPanelProps {
  sessionId: string
  activeInstanceId: string | null
  onActivate: (instanceId: string | null) => void
  activateError: string | null
}

const LOAD_FAILURE_MESSAGE = 'Die Karten konnten nicht geladen werden.'
const GENERIC_MOUNT_ERROR_MESSAGE = 'Die Karte konnte nicht eingehängt werden. Bitte versuche es erneut.'
const GENERIC_UNMOUNT_ERROR_MESSAGE = 'Die Karte konnte nicht ausgehängt werden. Bitte versuche es erneut.'

export function MapPanel({ sessionId, activeInstanceId, onActivate, activateError }: MapPanelProps) {
  const t = useT()
  const { push } = useToasts()
  const [instances, setInstances] = useState<MapInstance[]>([])
  const [libraryMaps, setLibraryMaps] = useState<MapSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mountError, setMountError] = useState<string | null>(null)
  const [unmountError, setUnmountError] = useState<string | null>(null)
  const [selectedMapId, setSelectedMapId] = useState('')
  const [mounting, setMounting] = useState(false)

  const reloadInstances = async () => {
    const result = await listSessionMaps(sessionId)
    if (result.ok) {
      setInstances(result.instances)
      setLoadError(null)
    } else {
      setLoadError(result.message)
    }
  }

  const reloadLibrary = async () => {
    const result = await listMaps()
    if (result.ok) {
      setLibraryMaps(result.maps)
    }
  }

  useEffect(() => {
    reloadInstances().catch((error: unknown) => {
      console.error(error)
      setLoadError(LOAD_FAILURE_MESSAGE)
    })
    reloadLibrary().catch((error: unknown) => {
      console.error(error)
    })
  }, [sessionId])

  const mountedMapIds = new Set(instances.map((instance) => instance.mapId))
  const availableMaps = libraryMaps.filter((map) => !mountedMapIds.has(map.id))

  useEffect(() => {
    if (availableMaps.length === 0) {
      if (selectedMapId !== '') {
        setSelectedMapId('')
      }
      return
    }
    if (!availableMaps.some((map) => map.id === selectedMapId)) {
      setSelectedMapId(availableMaps[0].id)
    }
  }, [availableMaps, selectedMapId])

  const handleMount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedMapId) {
      return
    }
    setMounting(true)
    setMountError(null)
    mountMap(sessionId, selectedMapId)
      .then(async (result) => {
        if (result.ok) {
          await reloadInstances()
          push(t('toast.mapMounted'))
        } else {
          setMountError(result.message)
        }
      })
      .catch((error: unknown) => {
        console.error(error)
        setMountError(GENERIC_MOUNT_ERROR_MESSAGE)
      })
      .finally(() => {
        setMounting(false)
      })
  }

  const handleUnmount = (instanceId: string) => {
    setUnmountError(null)
    unmountMap(sessionId, instanceId)
      .then(async (result) => {
        if (result.ok) {
          await reloadInstances()
        } else {
          setUnmountError(result.message)
        }
      })
      .catch((error: unknown) => {
        console.error(error)
        setUnmountError(GENERIC_UNMOUNT_ERROR_MESSAGE)
      })
  }

  return (
    <div>
      <h2>Karten</h2>
      {loadError !== null && <p role="alert">{loadError}</p>}
      {activateError !== null && <p role="alert">{activateError}</p>}
      {mountError !== null && <p role="alert">{mountError}</p>}
      {unmountError !== null && <p role="alert">{unmountError}</p>}

      <ul>
        {instances.map((instance) => (
          <li key={instance.id} aria-current={instance.id === activeInstanceId ? 'true' : undefined}>
            <span>{instance.name}</span>
            <button type="button" aria-label={`${instance.name} aktivieren`} onClick={() => onActivate(instance.id)}>
              Aktivieren
            </button>
            <button type="button" aria-label={`${instance.name} aushängen`} onClick={() => handleUnmount(instance.id)}>
              Aushängen
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleMount}>
        <label htmlFor="map-panel-mapId">Karte aus der Bibliothek</label>
        <select id="map-panel-mapId" name="mapId" value={selectedMapId} onChange={(event) => setSelectedMapId(event.target.value)}>
          {availableMaps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={mounting || !selectedMapId}>
          Einhängen
        </button>
      </form>

      <button type="button" onClick={() => onActivate(null)}>
        Keine Karte anzeigen
      </button>
    </div>
  )
}
