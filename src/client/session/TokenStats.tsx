import { useT } from '../i18n/locale.js'
import type { Token } from '../../shared/token.js'
import { ActionMenu, MenuTrigger, useFloating, type MenuEntry } from '../ui/menu.js'
import { EmptyState } from '../ui/status.js'

// add-token-stats (#61, design.md D8, spec.md Requirement "Tokenansicht im Raum"): die
// sichtbaren Werte als Text - jede Rolle sieht dasselbe Format, nur die Menge der Werte
// unterscheidet sich (Server-Filterung, `redactToken`). Genau ein `<span>` je gesetztem Wert,
// kein Praefix, kein Doppelpunkt (die Szenarien pruefen den genauen Text).

export interface TokenStatsTextProps {
  token: Token
}

/** Werte und Markierungen eines Tokens als Text (design.md D8). Kein `<li>`-Wrapper hier -
 * der Aufrufer (`TokenPanel`, `PlayerTokenList`) entscheidet ueber die Einbettung. */
export function TokenStatsText({ token }: TokenStatsTextProps) {
  return (
    <>
      {token.hp !== null && token.hpMax !== null && <span>{`HP ${token.hp}/${token.hpMax}`}</span>}
      {token.tempHp !== null && <span>{`Temp ${token.tempHp}`}</span>}
      {token.ac !== null && <span>{`RK ${token.ac}`}</span>}
      {token.initiative !== null && <span>{`Ini ${token.initiative}`}</span>}
      {token.conditions.length > 0 && (
        <ul>
          {token.conditions.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}
    </>
  )
}

export interface PlayerTokenListProps {
  tokens: Token[]
  // ui-menu (#92, design.md D5): je Zeile ein eigenes ⋮-Menue statt eingebetteter
  // Freigabe-Kaestchen - dieselben Eintraege wie in der Token-Verwaltung, gebaut vom
  // Aufrufer (`SessionRoom`, `token-menu.ts`).
  menuEntries: (token: Token) => MenuEntry[]
}

interface PlayerTokenRowProps {
  token: Token
  menuEntries: (token: Token) => MenuEntry[]
}

/** Eigene Komponente statt eines einfachen `<li>` (design.md D5) - sie braucht einen eigenen
 * Schwebezustand (`useFloating`) fuer das ⋮-Menue und den Rechtsklick auf die Zeile. */
function PlayerTokenRow({ token, menuEntries }: PlayerTokenRowProps) {
  const t = useT()
  const floating = useFloating()
  const rowLabel = t('menu.rowActions', { name: token.name })
  return (
    <li onContextMenu={floating.onContextMenu}>
      <span>{token.name}</span>
      <MenuTrigger floating={floating} label={rowLabel} />
      <TokenStatsText token={token} />
      <ActionMenu floating={floating} label={rowLabel} entries={menuEntries(token)} />
    </li>
  )
}

/** Tokenliste fuer Spieler (design.md D8, spec.md Requirement "Tokenansicht im Raum"): die
 * Ueberschrift ist bewusst NICHT "Tokens" - das Szenario "Spieler sieht keine
 * Token-Verwaltung" verbietet diese Ueberschrift beim Spieler. */
export function PlayerTokenList({ tokens, menuEntries }: PlayerTokenListProps) {
  const t = useT()
  return (
    <div>
      <h2>Tokenwerte</h2>
      {tokens.length === 0 ? (
        <EmptyState title={t('empty.tokens.title')} hint={t('empty.tokenValues.hint')} />
      ) : (
        <ul>
          {tokens.map((token) => (
            <PlayerTokenRow key={token.id} token={token} menuEntries={menuEntries} />
          ))}
        </ul>
      )}
    </div>
  )
}
