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
import type { TextKey } from '../i18n/de.js'
import { useT } from '../i18n/locale.js'
import type { IconName } from '../ui/icons.js'
import { ActionMenuButton } from '../ui/menu.js'
import { EmptyState } from '../ui/status.js'
import { ChipGroup, ColorChipGroup, Toolbar, type ChipOption, type ColorChip, type ToolbarTool } from '../ui/toolbar.js'
import { displayName, type Participant } from '../../shared/session.js'

// Panel "Messen & Zeichnen" (add-measure-draw #11, design.md D6, spec.md Requirement
// "Anmerkungsansicht im Raum"). Reine React-Komponente ohne Pixi-Import, kein lokaler
// Zustand - alles folgt den Props (Muster `FogPanel`). Bei jeder Rolle gerendert, nur wenn
// eine Karte aktiv ist (`SessionRoom.tsx`).
// session-tabs (#94, design.md D4): das Wurzelelement traegt jetzt die Klasse `panel` (das
// umgebende Reiterpanel `Karte` ist ein Raster, `.panel` spannt darin eine Spalte).
// ui-toolbar (#96, design.md D5): die Werkzeugwahl ist jetzt eine `Toolbar` (statt fuenf
// Radios) mit Kuerzeln V/M/D; Modus/Sichtbarkeit/Einheit sind `ChipGroup`s, Farbe eine
// `ColorChipGroup`; je Zeile mit Loeschrecht ein ⋮-Menue `Aktionen für <Eintrag>` (statt
// Entfernen-Button). Beschriftungen und die komponierten Chrome-Woerter laufen ueber `t()`.

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

const TOOL_LABEL_KEYS: Record<PanelTool, TextKey> = {
  schwenken: 'tool.move',
  strecke: 'annotation.tool.line',
  kreis: 'annotation.tool.circle',
  winkel: 'annotation.tool.angle',
  zeichnung: 'annotation.tool.draw',
}

const TOOL_ICONS: Record<PanelTool, IconName> = {
  schwenken: 'move',
  strecke: 'measure',
  kreis: 'circle',
  winkel: 'angle',
  zeichnung: 'draw',
}

const TOOL_SHORTCUTS: Partial<Record<PanelTool, string>> = {
  schwenken: 'V',
  strecke: 'M',
  zeichnung: 'D',
}

const MODE_VALUES = ['gerastert', 'frei'] as const
const MODE_LABEL_KEYS: Record<AnnotationMode, TextKey> = { gerastert: 'annotation.mode.grid', frei: 'annotation.mode.free' }

const VISIBILITY_VALUES = ['privat', 'geteilt'] as const
const VISIBILITY_LABEL_KEYS: Record<AnnotationVisibility, TextKey> = {
  privat: 'annotation.visibility.privat',
  geteilt: 'annotation.visibility.geteilt',
}
const ENTRY_VISIBILITY_KEYS: Record<AnnotationVisibility, TextKey> = {
  privat: 'annotation.entryVisibility.privat',
  geteilt: 'annotation.entryVisibility.geteilt',
}

const COLOR_LABEL_KEYS: Record<AnnotationColor, TextKey> = {
  rot: 'annotation.color.rot',
  orange: 'annotation.color.orange',
  gelb: 'annotation.color.gelb',
  gruen: 'annotation.color.gruen',
  blau: 'annotation.color.blau',
  weiss: 'annotation.color.weiss',
}

const UNIT_VALUES = ['meter', 'fuss'] as const
const UNIT_LABEL_KEYS: Record<DistanceUnit, TextKey> = { meter: 'annotation.unit.meter', fuss: 'annotation.unit.fuss' }

const KIND_LABEL_KEYS: Record<Annotation['kind'], TextKey> = {
  strecke: 'annotation.kind.strecke',
  kreis: 'annotation.kind.kreis',
  winkel: 'annotation.kind.winkel',
  zeichnung: 'annotation.kind.zeichnung',
}

type Translate = ReturnType<typeof useT>

/** Eintragstext einer Anmerkung (spec.md "Anmerkungsansicht im Raum", design.md D6): fuer
 * eine Zeichnung ohne Etikett (`annotationLabel` liefert dafuer die leere Zeichenkette),
 * sonst "<Art>: <Etikett> · <Sichtbarkeit> · <Urheber>". Der Urhebername kommt aus der
 * Teilnehmerliste (`displayName`), sonst `t('annotation.unknownAuthor')`. Art-Praefix und
 * Sichtbarkeitswort laufen ueber `t()` (design.md D6, Entscheidung: getrennte Schluessel fuer
 * Chip-Label und Eintrags-Wort). */
function entryText(annotation: Annotation, grid: Grid, unit: DistanceUnit, participants: Participant[], t: Translate): string {
  const author = participants.find((participant) => participant.userId === annotation.authorId)
  const authorName = author ? displayName(author) : t('annotation.unknownAuthor')
  const visibilityWord = t(ENTRY_VISIBILITY_KEYS[annotation.visibility])
  if (annotation.kind === 'zeichnung') {
    return `${t(KIND_LABEL_KEYS.zeichnung)} · ${visibilityWord} · ${authorName}`
  }
  const label = annotationLabel(annotation, grid, unit)
  return `${t(KIND_LABEL_KEYS[annotation.kind])}: ${label} · ${visibilityWord} · ${authorName}`
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
  const t = useT()
  // design.md D6: die Moduswahl ist nur bei den drei Messwerkzeugen aktiviert, die Farbwahl
  // nur beim Zeichenwerkzeug.
  const modeDisabled = tool !== 'strecke' && tool !== 'kreis' && tool !== 'winkel'
  const colorDisabled = tool !== 'zeichnung'

  const tools: ToolbarTool[] = TOOL_VALUES.map((value) => ({
    id: value,
    icon: TOOL_ICONS[value],
    label: t(TOOL_LABEL_KEYS[value]),
    shortcut: TOOL_SHORTCUTS[value],
  }))

  const modeOptions: ChipOption[] = MODE_VALUES.map((value) => ({ id: value, label: t(MODE_LABEL_KEYS[value]) }))
  const visibilityOptions: ChipOption[] = VISIBILITY_VALUES.map((value) => ({ id: value, label: t(VISIBILITY_LABEL_KEYS[value]) }))
  const unitOptions: ChipOption[] = UNIT_VALUES.map((value) => ({ id: value, label: t(UNIT_LABEL_KEYS[value]) }))
  const colorChips: ColorChip[] = ANNOTATION_COLORS.map((value) => ({ id: value, label: t(COLOR_LABEL_KEYS[value]) }))

  return (
    <fieldset className="panel">
      <legend>{t('annotation.legend')}</legend>

      <Toolbar label={t('annotation.toolbar')} tools={tools} active={tool} onSelect={(id) => onToolChange(id as CanvasTool)} />

      <ChipGroup
        label={t('annotation.mode')}
        options={modeOptions}
        value={mode}
        disabled={modeDisabled}
        onSelect={(id) => onModeChange(id as AnnotationMode)}
      />

      <ChipGroup
        label={t('annotation.visibility')}
        options={visibilityOptions}
        value={visibility}
        onSelect={(id) => onVisibilityChange(id as AnnotationVisibility)}
      />

      <ColorChipGroup
        label={t('annotation.color')}
        colors={colorChips}
        value={color}
        disabled={colorDisabled}
        onSelect={(id) => onColorChange(id as AnnotationColor)}
      />

      <ChipGroup label={t('annotation.unit')} options={unitOptions} value={unit} onSelect={(id) => onUnitChange(id as DistanceUnit)} />

      {annotations.length === 0 ? (
        <EmptyState title={t('empty.annotations.title')} hint={t('empty.annotations.hint')} />
      ) : (
        <ul>
          {annotations.map((annotation) => {
            const text = entryText(annotation, grid, unit, participants, t)
            return (
              <li key={annotation.id}>
                <span>{text}</span>
                {canDeleteAnnotation(annotation, viewer) && (
                  <ActionMenuButton
                    label={t('menu.rowActions', { name: text })}
                    entries={[
                      {
                        id: 'delete',
                        label: t('annotation.remove'),
                        icon: 'delete',
                        onSelect: () => onDelete({ kind: 'eine', annotationId: annotation.id }),
                      },
                    ]}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={() => onDelete({ kind: 'meine' })}>
        {t('annotation.removeMine')}
      </button>
      {viewer.role === 'spielleiter' && (
        <button type="button" onClick={() => onDelete({ kind: 'geteilte' })}>
          {t('annotation.removeShared')}
        </button>
      )}
    </fieldset>
  )
}
