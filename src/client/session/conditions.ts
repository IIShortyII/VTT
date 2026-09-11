// add-token-stats (#61, design.md D6): fester 5e-Katalog als Schnellwahl des Clients - der
// Server prueft NICHT gegen diesen Katalog (`shared/token.ts`, `ConditionLabelSchema`
// erlaubt jeden Kurztext). Reine Client-Konstante ohne Pixi-Import, damit `canvas.ts` UND
// `TokenPanel` sie importieren koennen, ohne die Pixi-Mock-Grenze zu beruehren.

export interface ConditionCatalogEntry {
  label: string
  symbol: string
}

/** Reihenfolge und Schreibweise wie in design.md D6 festgelegt - die Reihenfolge der
 * Schnellwahl im Client. */
export const CONDITION_CATALOG: ReadonlyArray<ConditionCatalogEntry> = [
  { label: 'Blind', symbol: '🙈' },
  { label: 'Bezaubert', symbol: '💞' },
  { label: 'Taub', symbol: '🙉' },
  { label: 'Erschöpft', symbol: '😩' },
  { label: 'Verängstigt', symbol: '😱' },
  { label: 'Gepackt', symbol: '✊' },
  { label: 'Kampfunfähig', symbol: '💫' },
  { label: 'Unsichtbar', symbol: '👻' },
  { label: 'Gelähmt', symbol: '⚡' },
  { label: 'Versteinert', symbol: '🗿' },
  { label: 'Vergiftet', symbol: '☠️' },
  { label: 'Liegend', symbol: '⬇️' },
  { label: 'Festgehalten', symbol: '⛓️' },
  { label: 'Betäubt', symbol: '🌀' },
  { label: 'Bewusstlos', symbol: '😴' },
]

/** Liefert das Katalogsymbol einer Markierung, sonst die ersten zwei Grossbuchstaben des
 * Texts (design.md D6) - eine freie Markierung ausserhalb des Katalogs bekommt trotzdem ein
 * kurzes Zeichen am Token. */
export function conditionSymbol(label: string): string {
  const entry = CONDITION_CATALOG.find((candidate) => candidate.label === label)
  if (entry) {
    return entry.symbol
  }
  return label.slice(0, 2).toUpperCase()
}
