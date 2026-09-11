import { displayName, type Participant } from '../../shared/session.js'
import { TOKEN_STATS, type Token, type TokenAudience, type TokenStat } from '../../shared/token.js'

// add-token-sharing (#62, design.md D5, spec.md Requirement "Tokenansicht im Raum",
// "Freigabe-Schalter"): Freigabe-Schalter als eigene Komponente, gerendert von `TokenRow`
// (Spielleiter, `TokenPanel.tsx`) und `PlayerTokenList` (Besitzer, `TokenStats.tsx`). Kein
// eigener Formularzustand (`useState`) - jedes Kaestchen zeigt den Serverstand
// (`token.shares`) und sendet bei Aenderung genau eine Absicht (constitution.md §9.1). Ob
// diese Komponente ueberhaupt etwas rendert, entscheidet `token.shares !== null` - der Server
// sendet `shares` genau an Spielleiter und Besitzer, dieselben, die `session:token-share`
// senden duerfen (design.md D7); der Client braucht darum keine zweite Berechtigungsregel.

/** Beschriftungen der Stats (design.md D5, D8, Schnittstellentabelle) - Reihenfolge wie
 * `TOKEN_STATS`. */
export const TOKEN_STAT_LABELS: Record<TokenStat, string> = {
  hp: 'HP',
  tempHp: 'Temp-HP',
  ac: 'RK',
  initiative: 'Initiative',
  conditions: 'Markierungen',
}

export interface TokenShareControlsProps {
  token: Token
  participants: Participant[]
  onShare: (tokenId: string, stat: TokenStat, audience: TokenAudience) => void
}

/** `<fieldset>` mit `<legend>` genau `<Name> Freigaben` (design.md D8) - `null`, wenn
 * `token.shares` `null` ist (fremdes Token aus Sicht dieses Empfaengers). `recipients` sind
 * die Spieler-Mitglieder ausser dem Besitzer (der sieht ohnehin alles; der Spielleiter ist
 * nie Empfaenger - der Server lehnt ihn ab). */
export function TokenShareControls({ token, participants, onShare }: TokenShareControlsProps) {
  if (token.shares === null) {
    return null
  }
  const shares = token.shares

  const recipients = participants.filter(
    (participant) => participant.role === 'spieler' && participant.userId !== token.ownerId,
  )

  const handleAllChange = (stat: TokenStat, checked: boolean) => {
    onShare(token.id, stat, checked ? 'alle' : 'keine')
  }

  const handleRecipientChange = (stat: TokenStat, userId: string, checked: boolean) => {
    const current = shares[stat]
    const list = Array.isArray(current) ? current : []
    if (checked) {
      onShare(token.id, stat, [...list, userId])
      return
    }
    const rest = list.filter((id) => id !== userId)
    onShare(token.id, stat, rest.length > 0 ? rest : 'keine')
  }

  return (
    <fieldset>
      <legend>{`${token.name} Freigaben`}</legend>
      {TOKEN_STATS.map((stat) => {
        const audience = shares[stat]
        const statLabel = TOKEN_STAT_LABELS[stat]
        return (
          <div key={stat}>
            <label htmlFor={`token-share-${token.id}-${stat}-alle`}>{`${token.name} ${statLabel} für alle`}</label>
            <input
              id={`token-share-${token.id}-${stat}-alle`}
              type="checkbox"
              name={`share-${stat}-alle`}
              aria-label={`${token.name} ${statLabel} für alle`}
              checked={audience === 'alle'}
              onChange={(event) => handleAllChange(stat, event.target.checked)}
            />
            {recipients.map((recipient) => {
              const name = displayName(recipient)
              return (
                <span key={recipient.userId}>
                  <label htmlFor={`token-share-${token.id}-${stat}-${recipient.userId}`}>
                    {`${token.name} ${statLabel} für ${name}`}
                  </label>
                  <input
                    id={`token-share-${token.id}-${stat}-${recipient.userId}`}
                    type="checkbox"
                    name={`share-${stat}-${recipient.userId}`}
                    aria-label={`${token.name} ${statLabel} für ${name}`}
                    checked={Array.isArray(audience) && audience.includes(recipient.userId)}
                    disabled={audience === 'alle'}
                    onChange={(event) => handleRecipientChange(stat, recipient.userId, event.target.checked)}
                  />
                </span>
              )
            })}
          </div>
        )
      })}
    </fieldset>
  )
}
