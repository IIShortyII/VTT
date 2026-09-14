import type { CSSProperties, ReactNode } from 'react'

import { displayName, type Participant } from '../../shared/session.js'
import type { Token } from '../../shared/token.js'
import { useT } from '../i18n/locale.js'
import { Icon } from '../ui/Icon.js'
import { ActionMenu, MenuTrigger, useFloating, type MenuEntry } from '../ui/menu.js'
import { EmptyState } from '../ui/status.js'
import { conditionIcon } from './conditions.js'

// add-token-stats (#61, design.md D8, spec.md Requirement "Tokenansicht im Raum"): die
// sichtbaren Werte je Token - jede Rolle sieht dasselbe Format, nur die Menge der Werte
// unterscheidet sich (Server-Filterung, `redactToken`).
//
// add-token-cards (#95, design.md D3-D5/D9): `TokenCard` ersetzt die bisherige Zeile
// (`TokenStatsText`) - Kopf (Symbol, Name, Zuweisungs-Pill, ⋮-Menü), HP-Balken (`--pct`,
// Low-Klasse ab höchstens 25 %), Werte als Beschreibungsliste (`dl`), Markierungen als Chips.
// Dieselbe Karte fuer Spielleiter-Verwaltung (`TokenPanel`) und Spieler-Liste (hier,
// `PlayerTokenList`) - `children` traegt die Spielleiter-only Schaden/Heilung-Eingabe
// (design.md D9).

const UNASSIGNED_LABEL = 'Unzugewiesen'

/** Anzeigename des Besitzers, oder `Unzugewiesen` bei `ownerId` `null` bzw. einem nicht (mehr)
 * gefundenen Teilnehmer (design.md D5). */
export function tokenOwnerLabel(token: Token, participants: Participant[]): string {
  if (token.ownerId === null) {
    return UNASSIGNED_LABEL
  }
  const owner = participants.find((participant) => participant.userId === token.ownerId)
  return owner ? displayName(owner) : UNASSIGNED_LABEL
}

export interface TokenCardProps {
  token: Token
  ownerName: string
  menuEntries: MenuEntry[]
  // add-token-cards (#95, design.md D2): Schaden/Heilung bleibt inline auf der Karte, nur
  // fuer den Spielleiter - der Aufrufer (`TokenPanel`) reicht die Eingabe als Kind durch,
  // die Spieler-Karte (`PlayerTokenList`) laesst sie weg.
  children?: ReactNode
}

/** Praesentationale Tokenkarte (design.md D3-D5/D9, spec.md Requirement "Tokenansicht im
 * Raum"): `article.token-card`, Rolle `listitem`. */
export function TokenCard({ token, ownerName, menuEntries, children }: TokenCardProps) {
  const t = useT()
  const floating = useFloating()
  const rowLabel = t('menu.rowActions', { name: token.name })

  const hasHpBar = token.hp !== null && token.hpMax !== null
  const pct = hasHpBar ? Math.max(0, Math.min(100, Math.round((token.hp! / token.hpMax!) * 100))) : 0
  const hpBarClass = pct <= 25 ? 'token-card__hp-bar token-card__hp-bar--low' : 'token-card__hp-bar'

  const hasStats = hasHpBar || token.tempHp !== null || token.ac !== null || token.initiative !== null

  return (
    <article className="token-card" role="listitem" onContextMenu={floating.onContextMenu}>
      <div className="token-card__head">
        {token.icon !== null ? <Icon name={token.icon} /> : <span aria-hidden="true">{token.name.charAt(0).toUpperCase()}</span>}
        <span className="token-card__name">{token.name}</span>
        <span className="chip">{ownerName}</span>
        <MenuTrigger floating={floating} label={rowLabel} />
      </div>

      {hasHpBar && <div className={hpBarClass} style={{ '--pct': pct } as CSSProperties} />}

      {hasStats && (
        <dl>
          {hasHpBar && (
            <>
              <dt>HP</dt>
              <dd>{`${token.hp}/${token.hpMax}`}</dd>
            </>
          )}
          {token.tempHp !== null && (
            <>
              <dt>Temp-HP</dt>
              <dd>{token.tempHp}</dd>
            </>
          )}
          {token.ac !== null && (
            <>
              <dt>RK</dt>
              <dd>{token.ac}</dd>
            </>
          )}
          {token.initiative !== null && (
            <>
              <dt>Initiative</dt>
              <dd>{token.initiative}</dd>
            </>
          )}
        </dl>
      )}

      {token.conditions.length > 0 && (
        <div className="token-card__conditions">
          {token.conditions.map((label) => {
            const icon = conditionIcon(label)
            return (
              <span key={label} className="chip">
                {icon !== null && <Icon name={icon} />}
                <span>{label}</span>
              </span>
            )
          })}
        </div>
      )}

      {children}

      <ActionMenu floating={floating} label={rowLabel} entries={menuEntries} />
    </article>
  )
}

export interface PlayerTokenListProps {
  tokens: Token[]
  participants: Participant[]
  // ui-menu (#92, design.md D5): je Zeile ein eigenes ⋮-Menue statt eingebetteter
  // Freigabe-Kaestchen - dieselben Eintraege wie in der Token-Verwaltung, gebaut vom
  // Aufrufer (`SessionRoom`, `token-menu.ts`).
  menuEntries: (token: Token) => MenuEntry[]
}

/** Tokenliste fuer Spieler (design.md D8/D9, spec.md Requirement "Tokenansicht im Raum"): die
 * Ueberschrift ist bewusst NICHT "Tokens" - das Szenario "Spieler sieht keine
 * Token-Verwaltung" verbietet diese Ueberschrift beim Spieler. session-tabs (#94, design.md
 * D2/D4): das Wurzelelement traegt die Klasse `panel` (nicht `panel--wide` - anders als die
 * Token-Verwaltung des Spielleiters). */
export function PlayerTokenList({ tokens, participants, menuEntries }: PlayerTokenListProps) {
  const t = useT()
  return (
    <div className="panel">
      <h2>Tokenwerte</h2>
      {tokens.length === 0 ? (
        <EmptyState title={t('empty.tokens.title')} hint={t('empty.tokenValues.hint')} />
      ) : (
        <ul className="token-card-list">
          {tokens.map((token) => (
            <TokenCard key={token.id} token={token} ownerName={tokenOwnerLabel(token, participants)} menuEntries={menuEntries(token)} />
          ))}
        </ul>
      )}
    </div>
  )
}
