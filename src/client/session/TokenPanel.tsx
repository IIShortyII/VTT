import { useState, type FormEvent } from 'react'

import { displayName, type Participant } from '../../shared/session.js'
import { TOKEN_ICONS, type CreateTokenInput, type Token } from '../../shared/token.js'

// Token-Verwaltung des Spielleiters im Raum (design.md D7, spec.md Requirement
// "Tokenansicht im Raum"). Kein eigener Ladepfad - der Bestand kommt vom Raum
// (`SessionRoom`, D5); nur der Spielleiter rendert diese Komponente.
//
// add-token-assignment (#15, design.md D7): je Token ein Auswahlfeld zur Zuweisung
// (`aria-label` genau "<Name> zuweisen", spec.md "Schnittstelle"). Die Meldung abgelehnter
// Aktionen ist von hier in die Raumansicht gewandert (D6) - diese Komponente rendert keine
// mehr.

export interface TokenPanelProps {
  sessionId: string
  tokens: Token[]
  participants: Participant[]
  onCreate: (input: Omit<CreateTokenInput, 'sessionId'>) => void
  onRemove: (tokenId: string) => void
  onAssign: (tokenId: string, ownerId: string | null) => void
}

const DEFAULT_COLOR = '#3366ff'
const DEFAULT_SIZE = '1'
const DEFAULT_CELL = '0'
const NO_OWNER_VALUE = ''
const NO_OWNER_LABEL = 'Spielleiter'

export function TokenPanel({ tokens, participants, onCreate, onRemove, onAssign }: TokenPanelProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [icon, setIcon] = useState('')
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [col, setCol] = useState(DEFAULT_CELL)
  const [row, setRow] = useState(DEFAULT_CELL)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onCreate({
      name,
      color,
      icon: icon === '' ? null : (icon as CreateTokenInput['icon']),
      size: Number(size),
      col: Number(col),
      row: Number(row),
    })
    setName('')
  }

  // add-token-assignment (#15, design.md D7): nur Mitglieder mit Rolle `spieler` sind
  // waehlbar - der Spielleiter selbst erscheint nicht als Eintrag (er waere serverseitig
  // ohnehin "Spieler nicht gefunden.").
  const players = participants.filter((participant) => participant.role === 'spieler')

  return (
    <div>
      <h2>Tokens</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="token-panel-name">Name</label>
        <input id="token-panel-name" name="name" value={name} onChange={(event) => setName(event.target.value)} />

        <label htmlFor="token-panel-color">Farbe</label>
        <input
          id="token-panel-color"
          type="color"
          name="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />

        <label htmlFor="token-panel-icon">Symbol</label>
        <select id="token-panel-icon" name="icon" value={icon} onChange={(event) => setIcon(event.target.value)}>
          <option value="">Kein Symbol</option>
          {TOKEN_ICONS.map((tokenIcon) => (
            <option key={tokenIcon} value={tokenIcon}>
              {tokenIcon}
            </option>
          ))}
        </select>

        <label htmlFor="token-panel-size">Größe</label>
        <select id="token-panel-size" name="size" value={size} onChange={(event) => setSize(event.target.value)}>
          <option value="1">1×1</option>
          <option value="2">2×2</option>
          <option value="3">3×3</option>
          <option value="4">4×4</option>
        </select>

        <label htmlFor="token-panel-col">Spalte</label>
        <input id="token-panel-col" type="number" name="col" value={col} onChange={(event) => setCol(event.target.value)} />

        <label htmlFor="token-panel-row">Zeile</label>
        <input id="token-panel-row" type="number" name="row" value={row} onChange={(event) => setRow(event.target.value)} />

        <button type="submit">Anlegen</button>
      </form>

      <ul>
        {tokens.map((token) => (
          <li key={token.id}>
            <span>{token.name}</span>
            <button type="button" aria-label={`${token.name} entfernen`} onClick={() => onRemove(token.id)}>
              Entfernen
            </button>

            <select
              name="owner"
              aria-label={`${token.name} zuweisen`}
              value={token.ownerId ?? NO_OWNER_VALUE}
              onChange={(event) => onAssign(token.id, event.target.value === NO_OWNER_VALUE ? null : event.target.value)}
            >
              <option value={NO_OWNER_VALUE}>{NO_OWNER_LABEL}</option>
              {players.map((player) => (
                <option key={player.userId} value={player.userId}>
                  {displayName(player)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}
