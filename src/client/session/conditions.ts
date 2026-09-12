// add-token-stats (#61, design.md D6): fester 5e-Katalog als Schnellwahl des Clients - der
// Server prueft NICHT gegen diesen Katalog (`shared/token.ts`, `ConditionLabelSchema`
// erlaubt jeden Kurztext). Reine Client-Konstante ohne Pixi-Import, damit `canvas.ts` UND
// `TokenPanel` sie importieren koennen, ohne die Pixi-Mock-Grenze zu beruehren.
//
// add-icon-registry (#85, design.md D4): Eintraege referenzieren einen Registry-Namen statt
// eines Emoji (`symbol` entfaellt). Nur `type IconName` wird importiert - ein Typ-Import,
// kein Laufzeitimport von `lucide-react` in die Pixi-Fassade hinein (`canvas.ts` importiert
// `icons.ts` selbst, siehe design.md D5).
import type { IconName } from '../ui/icons.js'

export interface ConditionCatalogEntry {
  label: string
  icon: IconName
}

/** Reihenfolge und Schreibweise wie in design.md D4/spec.md "Zustandskatalog" festgelegt -
 * die Reihenfolge der Schnellwahl im Client. */
export const CONDITION_CATALOG: ReadonlyArray<ConditionCatalogEntry> = [
  { label: 'Blind', icon: 'blinded' },
  { label: 'Bezaubert', icon: 'charmed' },
  { label: 'Taub', icon: 'deafened' },
  { label: 'Erschöpft', icon: 'exhausted' },
  { label: 'Verängstigt', icon: 'frightened' },
  { label: 'Gepackt', icon: 'grappled' },
  { label: 'Kampfunfähig', icon: 'incapacitated' },
  { label: 'Unsichtbar', icon: 'invisible' },
  { label: 'Gelähmt', icon: 'paralyzed' },
  { label: 'Versteinert', icon: 'petrified' },
  { label: 'Vergiftet', icon: 'poisoned' },
  { label: 'Liegend', icon: 'prone' },
  { label: 'Festgehalten', icon: 'restrained' },
  { label: 'Betäubt', icon: 'stunned' },
  { label: 'Bewusstlos', icon: 'unconscious' },
]

/** Liefert den Registry-Namen des Katalogeintrags einer Markierung, sonst `null` (design.md
 * D4) - eine freie Markierung ausserhalb des Katalogs hat kein Icon. */
export function conditionIcon(label: string): IconName | null {
  const entry = CONDITION_CATALOG.find((candidate) => candidate.label === label)
  return entry ? entry.icon : null
}

/** Die ersten zwei Zeichen in Grossbuchstaben (bisheriger Rueckfall von `conditionSymbol`,
 * design.md D4) - fuer Markierungen ausserhalb des Katalogs auf der Karte. */
export function conditionAbbreviation(label: string): string {
  return label.slice(0, 2).toUpperCase()
}
