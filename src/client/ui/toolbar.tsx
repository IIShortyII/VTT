import type { KeyboardEvent } from 'react'

import { IconButton } from './Icon.js'
import type { IconName } from './icons.js'

// ui-toolbar (#96, design.md D1-D3): die wiederverwendbare Mechanik barrierefreier
// Werkzeugleisten, Umschalt-Chips und Farbchips - `session-fog`/`session-annotation`
// benennen nur, welche Werkzeuge/Chips sie zeigen (Muster `ui-menu`, `ui-form`,
// `session-tabs` -> `ui/tabs.tsx`). Diese Datei importiert nur `react`, `./Icon.js` und den
// Typ `IconName` aus `./icons.js` - keine weitere Abhaengigkeit.

const FORM_FIELD_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA'])

export interface ToolbarTool {
  id: string
  icon: IconName
  label: string
  shortcut?: string
}

export interface ToolbarProps {
  label: string
  tools: ToolbarTool[]
  active: string
  onSelect(id: string): void
}

/** Barrierefreie Werkzeugleiste (design.md D1, spec.md "Werkzeugleiste"/"Tastenkürzel der
 * Werkzeugleiste"): `role="toolbar"`, je Werkzeug ein Icon-only-Button mit `aria-pressed`
 * und `title` (Label plus Kürzel), bereichsweite Tastenkürzel ueber `onKeyDown` an der
 * Wurzel - kein `document`-Listener, wirkt also nur, waehrend der Fokus in dieser Leiste
 * liegt. Ein Tastendruck auf einem Formularfeld (`input`/`select`/`textarea`) wird
 * ignoriert. */
export function Toolbar({ label, tools, active, onSelect }: ToolbarProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const target = event.target
    if (target instanceof HTMLElement && FORM_FIELD_TAGS.has(target.tagName)) {
      return
    }
    const tool = tools.find((candidate) => candidate.shortcut !== undefined && candidate.shortcut.toLowerCase() === event.key.toLowerCase())
    if (!tool) {
      return
    }
    event.preventDefault()
    onSelect(tool.id)
  }

  return (
    <div role="toolbar" aria-label={label} className="toolbar" onKeyDown={handleKeyDown}>
      {tools.map((tool) => (
        <IconButton
          key={tool.id}
          name={tool.icon}
          label={tool.label}
          aria-pressed={tool.id === active}
          title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
          className={tool.id === active ? 'tool-button tool-button--active' : 'tool-button'}
          onClick={() => onSelect(tool.id)}
        />
      ))}
    </div>
  )
}

export interface ChipOption {
  id: string
  label: string
}

export interface ChipGroupProps {
  label: string
  options: ChipOption[]
  value: string
  onSelect(id: string): void
  disabled?: boolean
}

/** Umschalt-Chipgruppe (design.md D2, spec.md "Umschalt-Chips"): `role="group"`, je Option
 * eine Schaltflaeche mit `aria-pressed`, deaktiviert wenn `disabled` gesetzt ist. Sichtbarer
 * Text und zugaenglicher Name sind identisch (`label`). */
export function ChipGroup({ label, options, value, onSelect, disabled }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="chip-group">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          disabled={disabled}
          className={option.id === value ? 'chip chip--active' : 'chip'}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export interface ColorChip {
  id: string
  label: string
}

export interface ColorChipGroupProps {
  label: string
  colors: ColorChip[]
  value: string
  onSelect(id: string): void
  disabled?: boolean
}

/** Farbchipgruppe (design.md D3, spec.md "Farbchips"): `role="group"`, je Farbe eine
 * Schaltflaeche, deren zugaenglicher Name der Farbname ist; die Farbe selbst kommt aus der
 * CSS-Klasse `color-chip--<id>`, das Swatch-Element ist dekorativ (`aria-hidden`). */
export function ColorChipGroup({ label, colors, value, onSelect, disabled }: ColorChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="chip-group">
      {colors.map((color) => (
        <button
          key={color.id}
          type="button"
          aria-label={color.label}
          aria-pressed={color.id === value}
          disabled={disabled}
          className={color.id === value ? `color-chip color-chip--${color.id} color-chip--active` : `color-chip color-chip--${color.id}`}
          onClick={() => onSelect(color.id)}
        >
          <span className="color-chip-swatch" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
