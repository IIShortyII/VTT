import {
  ANNOTATION_COLORS,
  ANNOTATION_TOOLS,
  annotationLabel,
  canDeleteAnnotation,
  type Annotation,
  type AnnotationColor,
  type AnnotationMode,
  type AnnotationViewer,
  type AnnotationVisibility,
  type CanvasTool,
  type DeleteAnnotationTarget,
  type DistanceUnit,
} from '../../shared/annotation.js'
import type { Grid } from '../../shared/map.js'
import { displayName, type Participant } from '../../shared/session.js'

// Panel "Messen & Zeichnen" (add-measure-draw #11, design.md D6, spec.md Requirement
// "Anmerkungsansicht im Raum"). Reine React-Komponente ohne Pixi-Import, kein lokaler
// Zustand - alles folgt den Props (Muster `FogPanel`). Bei jeder Rolle gerendert, nur wenn
// eine Karte aktiv ist (`SessionRoom.tsx`).

export interface AnnotationPanelProps {
  annotations: Annotation[]
  grid: Grid
  participants: Participant[]
  viewer: AnnotationViewer
  tool: CanvasTool
  mode: AnnotationMode
  visibility: AnnotationVisibility
  color: AnnotationColor
  unit: DistanceUnit
  onToolChange: (tool: CanvasTool) => void
  onModeChange: (mode: AnnotationMode) => void
  onVisibilityChange: (visibility: AnnotationVisibility) => void
  onColorChange: (color: AnnotationColor) => void
  onUnitChange: (unit: DistanceUnit) => void
  // design.md D6: ein Handler, parametriert ueber das Ziel - dasselbe Ziel, das
  // `session:annotation-delete` erwartet (Muster `deleteAnnotation` der Socket-Fassade).
  onDelete: (target: DeleteAnnotationTarget) => void
}

const TOOL_VALUES = ['schwenken', ...ANNOTATION_TOOLS] as const
type PanelTool = (typeof TOOL_VALUES)[number]

const TOOL_LABELS: Record<PanelTool, string> = {
  schwenken: 'Bewegen',
  strecke: 'Strecke',
  kreis: 'Kreis',
  winkel: 'Winkel',
  zeichnung: 'Zeichnen',
}

const MODE_VALUES = ['gerastert', 'frei'] as const
const MODE_LABELS: Record<AnnotationMode, string> = { gerastert: 'Gerastert', frei: 'Frei' }

const VISIBILITY_VALUES = ['privat', 'geteilt'] as const
const VISIBILITY_LABELS: Record<AnnotationVisibility, string> = { privat: 'Privat', geteilt: 'Geteilt' }

const COLOR_LABELS: Record<AnnotationColor, string> = {
  rot: 'Rot',
  orange: 'Orange',
  gelb: 'Gelb',
  gruen: 'Grün',
  blau: 'Blau',
  weiss: 'Weiß',
}

const UNIT_VALUES = ['meter', 'fuss'] as const
const UNIT_LABELS: Record<DistanceUnit, string> = { meter: 'Meter', fuss: 'Fuß' }

const KIND_LABELS: Record<Annotation['kind'], string> = {
  strecke: 'Strecke',
  kreis: 'Kreis',
  winkel: 'Winkel',
  zeichnung: 'Zeichnung',
}

/** Eintragstext einer Anmerkung (spec.md "Anmerkungsansicht im Raum", design.md D6): fuer
 * eine Zeichnung ohne Etikett (`annotationLabel` liefert dafuer die leere Zeichenkette),
 * sonst "<Art>: <Etikett> · <Sichtbarkeit> · <Urheber>". Der Urhebername kommt aus der
 * Teilnehmerliste (`displayName`), sonst "unbekannt". */
function entryText(annotation: Annotation, grid: Grid, unit: DistanceUnit, participants: Participant[]): string {
  const author = participants.find((participant) => participant.userId === annotation.authorId)
  const authorName = author ? displayName(author) : 'unbekannt'
  if (annotation.kind === 'zeichnung') {
    return `Zeichnung · ${annotation.visibility} · ${authorName}`
  }
  const label = annotationLabel(annotation, grid, unit)
  return `${KIND_LABELS[annotation.kind]}: ${label} · ${annotation.visibility} · ${authorName}`
}

export function AnnotationPanel({
  annotations,
  grid,
  participants,
  viewer,
  tool,
  mode,
  visibility,
  color,
  unit,
  onToolChange,
  onModeChange,
  onVisibilityChange,
  onColorChange,
  onUnitChange,
  onDelete,
}: AnnotationPanelProps) {
  // design.md D6: die Moduswahl ist nur bei den drei Messwerkzeugen aktiviert, die Farbwahl
  // nur beim Zeichenwerkzeug.
  const modeDisabled = tool !== 'strecke' && tool !== 'kreis' && tool !== 'winkel'
  const colorDisabled = tool !== 'zeichnung'

  return (
    <fieldset>
      <legend>Messen & Zeichnen</legend>

      {TOOL_VALUES.map((value) => (
        <label key={value}>
          <input type="radio" name="annotation-tool" value={value} checked={tool === value} onChange={() => onToolChange(value)} />
          {TOOL_LABELS[value]}
        </label>
      ))}

      {MODE_VALUES.map((value) => (
        <label key={value}>
          <input
            type="radio"
            name="annotation-mode"
            value={value}
            checked={mode === value}
            disabled={modeDisabled}
            onChange={() => onModeChange(value)}
          />
          {MODE_LABELS[value]}
        </label>
      ))}

      {VISIBILITY_VALUES.map((value) => (
        <label key={value}>
          <input
            type="radio"
            name="annotation-visibility"
            value={value}
            checked={visibility === value}
            onChange={() => onVisibilityChange(value)}
          />
          {VISIBILITY_LABELS[value]}
        </label>
      ))}

      {ANNOTATION_COLORS.map((value) => (
        <label key={value}>
          <input
            type="radio"
            name="annotation-color"
            value={value}
            checked={color === value}
            disabled={colorDisabled}
            onChange={() => onColorChange(value)}
          />
          {COLOR_LABELS[value]}
        </label>
      ))}

      {UNIT_VALUES.map((value) => (
        <label key={value}>
          <input type="radio" name="annotation-unit" value={value} checked={unit === value} onChange={() => onUnitChange(value)} />
          {UNIT_LABELS[value]}
        </label>
      ))}

      <ul>
        {annotations.map((annotation) => (
          <li key={annotation.id}>
            <span>{entryText(annotation, grid, unit, participants)}</span>
            {canDeleteAnnotation(annotation, viewer) && (
              <button type="button" onClick={() => onDelete({ kind: 'eine', annotationId: annotation.id })}>
                Entfernen
              </button>
            )}
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => onDelete({ kind: 'meine' })}>
        Meine entfernen
      </button>
      {viewer.role === 'spielleiter' && (
        <button type="button" onClick={() => onDelete({ kind: 'geteilte' })}>
          Alle geteilten entfernen
        </button>
      )}
    </fieldset>
  )
}
