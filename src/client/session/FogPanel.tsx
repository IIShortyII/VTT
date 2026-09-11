import { useState, type FormEvent } from 'react'

import { FOG_TOOLS, type FogState, type FogTool } from '../../shared/fog.js'

// Fog-Verwaltung des Spielleiters im Raum (add-fog-of-war #16, design.md D8, spec.md
// Requirement "Fog-Ansicht im Raum"). Reine React-Komponente ohne Pixi-Import - ein lokaler
// Zustand nur fuer das Namensfeld (eine Absicht, kein Serverzustand), alles andere folgt den
// Props. Nur `role === 'spielleiter'` und bei vorhandenem Fog gerendert (`SessionRoom.tsx`).

export interface FogPanelProps {
  fog: FogState
  tool: FogTool
  selectionCount: number
  onToolChange: (tool: FogTool) => void
  onRevealAll: () => void
  onHideAll: () => void
  onAreaCreate: (name: string) => void
  onClearSelection: () => void
  onAreaToggle: (areaId: string, revealed: boolean) => void
  onAreaDelete: (areaId: string) => void
}

const TOOL_LABELS: Record<FogTool, string> = {
  schwenken: 'Schwenken',
  aufdecken: 'Aufdecken',
  verdecken: 'Verdecken',
  bereich: 'Bereich markieren',
}

export function FogPanel({
  fog,
  tool,
  selectionCount,
  onToolChange,
  onRevealAll,
  onHideAll,
  onAreaCreate,
  onClearSelection,
  onAreaToggle,
  onAreaDelete,
}: FogPanelProps) {
  const [name, setName] = useState('')

  const handleAreaCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAreaCreate(name)
    setName('')
  }

  return (
    <fieldset>
      <legend>Fog of War</legend>

      {FOG_TOOLS.map((value) => (
        <label key={value}>
          <input type="radio" name="fog-tool" value={value} checked={tool === value} onChange={() => onToolChange(value)} />
          {TOOL_LABELS[value]}
        </label>
      ))}

      <button type="button" onClick={onRevealAll}>
        Alles aufdecken
      </button>
      <button type="button" onClick={onHideAll}>
        Alles verdecken
      </button>

      <form onSubmit={handleAreaCreate}>
        <label htmlFor="fog-panel-area-name">Bereichsname</label>
        <input id="fog-panel-area-name" name="area-name" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={selectionCount === 0}>
          Bereich speichern
        </button>
      </form>

      <p>{`Auswahl: ${selectionCount} Zellen`}</p>
      <button type="button" onClick={onClearSelection}>
        Auswahl leeren
      </button>

      <ul>
        {(fog.areas ?? []).map((area) => (
          <li key={area.id}>
            <span>{area.name}</span>
            <input
              type="checkbox"
              name={`area-${area.id}`}
              aria-label={`${area.name} aufgedeckt`}
              checked={area.revealed}
              onChange={(event) => onAreaToggle(area.id, event.target.checked)}
            />
            <button type="button" onClick={() => onAreaDelete(area.id)}>
              {`${area.name} löschen`}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
