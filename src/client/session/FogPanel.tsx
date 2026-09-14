import { useState, type FormEvent } from 'react'

import type { CanvasTool } from '../../shared/annotation.js'
import { FOG_TOOLS, type FogState, type FogTool } from '../../shared/fog.js'
import type { TextKey } from '../i18n/de.js'
import { useT } from '../i18n/locale.js'
import { Icon } from '../ui/Icon.js'
import type { IconName } from '../ui/icons.js'
import { ActionMenuButton } from '../ui/menu.js'
import { EmptyState } from '../ui/status.js'
import { Toolbar, type ToolbarTool } from '../ui/toolbar.js'

// Fog-Verwaltung des Spielleiters im Raum (add-fog-of-war #16, design.md D8, spec.md
// Requirement "Fog-Ansicht im Raum"). Reine React-Komponente ohne Pixi-Import - ein lokaler
// Zustand nur fuer das Namensfeld (eine Absicht, kein Serverzustand), alles andere folgt den
// Props. Nur `role === 'spielleiter'` und bei vorhandenem Fog gerendert (`SessionRoom.tsx`).
// session-tabs (#94, design.md D4): das Wurzelelement traegt jetzt die Klasse `panel` (das
// umgebende Reiterpanel `Karte` ist ein Raster, `.panel` spannt darin eine Spalte).
// ui-toolbar (#96, design.md D4): die Werkzeugwahl ist jetzt eine `Toolbar` (statt vier
// Radios) mit Kuerzeln R/H; der Auswahlzaehler eine `role="status"`-Live-Region; je Bereich
// ein Inline-Umschalter `<Name> aufgedeckt` und ein ⋮-Menue `Aktionen für <Name>` mit
// `Löschen` (statt Checkbox/Loeschen-Button). Beschriftungen laufen ueber `t()`.

export interface FogPanelProps {
  fog: FogState
  tool: CanvasTool
  selectionCount: number
  onToolChange: (tool: FogTool) => void
  onRevealAll: () => void
  onHideAll: () => void
  onAreaCreate: (name: string) => void
  onClearSelection: () => void
  onAreaToggle: (areaId: string, revealed: boolean) => void
  onAreaDelete: (areaId: string) => void
}

const FOG_TOOL_LABELS: Record<FogTool, TextKey> = {
  schwenken: 'tool.pan',
  aufdecken: 'fog.tool.reveal',
  verdecken: 'fog.tool.hide',
  bereich: 'fog.tool.area',
}

const FOG_TOOL_ICONS: Record<FogTool, IconName> = {
  schwenken: 'move',
  aufdecken: 'reveal',
  verdecken: 'hide',
  bereich: 'area',
}

const FOG_TOOL_SHORTCUTS: Partial<Record<FogTool, string>> = {
  aufdecken: 'R',
  verdecken: 'H',
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
  const t = useT()
  const [name, setName] = useState('')

  const handleAreaCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAreaCreate(name)
    setName('')
  }

  const tools: ToolbarTool[] = FOG_TOOLS.map((value) => ({
    id: value,
    icon: FOG_TOOL_ICONS[value],
    label: t(FOG_TOOL_LABELS[value]),
    shortcut: FOG_TOOL_SHORTCUTS[value],
  }))

  return (
    <fieldset className="panel">
      <legend>{t('fog.legend')}</legend>

      <Toolbar label={t('fog.toolbar')} tools={tools} active={tool} onSelect={(id) => onToolChange(id as FogTool)} />

      <button type="button" onClick={onRevealAll}>
        {t('fog.revealAll')}
      </button>
      <button type="button" onClick={onHideAll}>
        {t('fog.hideAll')}
      </button>

      <form onSubmit={handleAreaCreate}>
        <label htmlFor="fog-panel-area-name">{t('fog.areaName')}</label>
        <input id="fog-panel-area-name" name="area-name" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={selectionCount === 0}>
          {t('fog.saveArea')}
        </button>
      </form>

      <p role="status">{t('fog.selectionCount', { count: selectionCount })}</p>
      <button type="button" onClick={onClearSelection}>
        {t('fog.clearSelection')}
      </button>

      {(fog.areas ?? []).length === 0 ? (
        <EmptyState title={t('empty.fogAreas.title')} hint={t('empty.fogAreas.hint')} />
      ) : (
        <ul>
          {(fog.areas ?? []).map((area) => (
            <li key={area.id}>
              <span>{area.name}</span>
              <button
                type="button"
                aria-pressed={area.revealed}
                aria-label={t('fog.areaRevealed', { name: area.name })}
                className={area.revealed ? 'chip chip--active' : 'chip'}
                onClick={() => onAreaToggle(area.id, !area.revealed)}
              >
                <Icon name={area.revealed ? 'reveal' : 'hide'} />
              </button>
              <ActionMenuButton
                label={t('menu.rowActions', { name: area.name })}
                entries={[{ id: 'delete', label: t('menu.delete'), icon: 'delete', onSelect: () => onAreaDelete(area.id) }]}
              />
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
