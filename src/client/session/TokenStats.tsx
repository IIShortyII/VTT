import type { Participant } from '../../shared/session.js'
import type { Token, TokenAudience, TokenStat } from '../../shared/token.js'
import { TokenShareControls } from './TokenShare.js'

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
  // add-token-sharing (#62, design.md D6): fuer die Freigabe-Schalter der eigenen Tokens -
  // `TokenShareControls` rendert selbst nichts, wenn `token.shares` `null` ist (fremdes
  // Token aus Sicht dieses Spielers).
  participants: Participant[]
  onShare: (tokenId: string, stat: TokenStat, audience: TokenAudience) => void
}

/** Tokenliste fuer Spieler (design.md D8, spec.md Requirement "Tokenansicht im Raum"): die
 * Ueberschrift ist bewusst NICHT "Tokens" - das Szenario "Spieler sieht keine
 * Token-Verwaltung" verbietet diese Ueberschrift beim Spieler. */
export function PlayerTokenList({ tokens, participants, onShare }: PlayerTokenListProps) {
  return (
    <div>
      <h2>Tokenwerte</h2>
      <ul>
        {tokens.map((token) => (
          <li key={token.id}>
            <span>{token.name}</span>
            <TokenStatsText token={token} />
            <TokenShareControls token={token} participants={participants} onShare={onShare} />
          </li>
        ))}
      </ul>
    </div>
  )
}
