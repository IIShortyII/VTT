import { useState, type FormEvent } from 'react'

import { displayName, type Participant } from '../../shared/session.js'
import { TOKEN_ICONS, type CreateTokenInput, type Token, type TokenStatsPatch } from '../../shared/token.js'
import { CONDITION_CATALOG } from './conditions.js'
import { TokenStatsText } from './TokenStats.js'

// Token-Verwaltung des Spielleiters im Raum (design.md D7/D9, spec.md Requirement
// "Tokenansicht im Raum"). Kein eigener Ladepfad - der Bestand kommt vom Raum
// (`SessionRoom`, D5); nur der Spielleiter rendert diese Komponente.
//
// add-token-assignment (#15, design.md D7): je Token ein Auswahlfeld zur Zuweisung
// (`aria-label` genau "<Name> zuweisen", spec.md "Schnittstelle"). Die Meldung abgelehnter
// Aktionen ist von hier in die Raumansicht gewandert (D6) - diese Komponente rendert keine
// mehr.
//
// add-token-stats (#61, design.md D9): je Token eine eigene `TokenRow` (lokaler
// Formularzustand fuer die Wertefelder, die Aenderung und die freie Markierung). Die
// angezeigte Markierungsliste kommt IMMER vom Server (`token.conditions`), nie aus einem
// lokalen Zwischenstand.

export interface TokenPanelProps {
  sessionId: string
  tokens: Token[]
  participants: Participant[]
  onCreate: (input: Omit<CreateTokenInput, 'sessionId'>) => void
  onRemove: (tokenId: string) => void
  onAssign: (tokenId: string, ownerId: string | null) => void
  onSetStats: (tokenId: string, patch: TokenStatsPatch) => void
  onSetConditions: (tokenId: string, conditions: string[]) => void
}

const DEFAULT_COLOR = '#3366ff'
const DEFAULT_SIZE = '1'
const DEFAULT_CELL = '0'
const NO_OWNER_VALUE = ''
const NO_OWNER_LABEL = 'Spielleiter'
const NO_CONDITION_PICK_VALUE = ''

function toStatField(value: string): number | null {
  return value === '' ? null : Number(value)
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

interface TokenRowProps {
  token: Token
  players: Participant[]
  onRemove: (tokenId: string) => void
  onAssign: (tokenId: string, ownerId: string | null) => void
  onSetStats: (tokenId: string, patch: TokenStatsPatch) => void
  onSetConditions: (tokenId: string, conditions: string[]) => void
}

function TokenRow({ token, players, onRemove, onAssign, onSetStats, onSetConditions }: TokenRowProps) {
  const [hp, setHp] = useState(token.hp === null ? '' : String(token.hp))
  const [hpMax, setHpMax] = useState(token.hpMax === null ? '' : String(token.hpMax))
  const [tempHp, setTempHp] = useState(token.tempHp === null ? '' : String(token.tempHp))
  const [ac, setAc] = useState(token.ac === null ? '' : String(token.ac))
  const [initiative, setInitiative] = useState(token.initiative === null ? '' : String(token.initiative))
  const [delta, setDelta] = useState('')
  const [conditionInput, setConditionInput] = useState('')
  const [conditionPick, setConditionPick] = useState(NO_CONDITION_PICK_VALUE)

  const handleSaveStats = () => {
    onSetStats(token.id, {
      hp: toStatField(hp),
      hpMax: toStatField(hpMax),
      tempHp: toStatField(tempHp),
      ac: toStatField(ac),
      initiative: toStatField(initiative),
    })
  }

  const handleDamage = () => {
    const amount = Number(delta)
    if (token.hp === null || token.hpMax === null || !isPositiveInteger(amount)) {
      return
    }
    onSetStats(token.id, { hp: Math.max(0, token.hp - amount) })
  }

  const handleHeal = () => {
    const amount = Number(delta)
    if (token.hp === null || token.hpMax === null || !isPositiveInteger(amount)) {
      return
    }
    onSetStats(token.id, { hp: Math.min(token.hpMax, token.hp + amount) })
  }

  const handleConditionPick = (label: string) => {
    setConditionPick(NO_CONDITION_PICK_VALUE)
    if (label === NO_CONDITION_PICK_VALUE || token.conditions.includes(label)) {
      return
    }
    onSetConditions(token.id, [...token.conditions, label])
  }

  const handleAddCondition = () => {
    const trimmed = conditionInput.trim()
    if (trimmed === '' || token.conditions.includes(trimmed)) {
      return
    }
    onSetConditions(token.id, [...token.conditions, trimmed])
    setConditionInput('')
  }

  const handleRemoveCondition = (label: string) => {
    onSetConditions(
      token.id,
      token.conditions.filter((condition) => condition !== label),
    )
  }

  return (
    <li>
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

      <label htmlFor={`token-panel-hp-${token.id}`}>{`${token.name} HP`}</label>
      <input
        id={`token-panel-hp-${token.id}`}
        type="number"
        name="hp"
        aria-label={`${token.name} HP`}
        value={hp}
        onChange={(event) => setHp(event.target.value)}
      />

      <label htmlFor={`token-panel-hpmax-${token.id}`}>{`${token.name} HP-Maximum`}</label>
      <input
        id={`token-panel-hpmax-${token.id}`}
        type="number"
        name="hpMax"
        aria-label={`${token.name} HP-Maximum`}
        value={hpMax}
        onChange={(event) => setHpMax(event.target.value)}
      />

      <label htmlFor={`token-panel-temphp-${token.id}`}>{`${token.name} Temp-HP`}</label>
      <input
        id={`token-panel-temphp-${token.id}`}
        type="number"
        name="tempHp"
        aria-label={`${token.name} Temp-HP`}
        value={tempHp}
        onChange={(event) => setTempHp(event.target.value)}
      />

      <label htmlFor={`token-panel-ac-${token.id}`}>{`${token.name} RK`}</label>
      <input
        id={`token-panel-ac-${token.id}`}
        type="number"
        name="ac"
        aria-label={`${token.name} RK`}
        value={ac}
        onChange={(event) => setAc(event.target.value)}
      />

      <label htmlFor={`token-panel-initiative-${token.id}`}>{`${token.name} Initiative`}</label>
      <input
        id={`token-panel-initiative-${token.id}`}
        type="number"
        name="initiative"
        aria-label={`${token.name} Initiative`}
        value={initiative}
        onChange={(event) => setInitiative(event.target.value)}
      />

      <button type="button" aria-label={`${token.name} Werte speichern`} onClick={handleSaveStats}>
        Werte speichern
      </button>

      <label htmlFor={`token-panel-delta-${token.id}`}>{`${token.name} Änderung`}</label>
      <input
        id={`token-panel-delta-${token.id}`}
        type="number"
        name="delta"
        aria-label={`${token.name} Änderung`}
        value={delta}
        onChange={(event) => setDelta(event.target.value)}
      />
      <button type="button" aria-label={`${token.name} Schaden`} onClick={handleDamage}>
        Schaden
      </button>
      <button type="button" aria-label={`${token.name} Heilung`} onClick={handleHeal}>
        Heilung
      </button>

      <label htmlFor={`token-panel-condition-pick-${token.id}`}>{`${token.name} Markierung wählen`}</label>
      <select
        id={`token-panel-condition-pick-${token.id}`}
        name="conditionPick"
        aria-label={`${token.name} Markierung wählen`}
        value={conditionPick}
        onChange={(event) => handleConditionPick(event.target.value)}
      >
        <option value={NO_CONDITION_PICK_VALUE}>Markierung wählen</option>
        {CONDITION_CATALOG.map((entry) => (
          <option key={entry.label} value={entry.label}>
            {entry.label}
          </option>
        ))}
      </select>

      <label htmlFor={`token-panel-condition-${token.id}`}>{`${token.name} Markierung`}</label>
      <input
        id={`token-panel-condition-${token.id}`}
        name="condition"
        aria-label={`${token.name} Markierung`}
        value={conditionInput}
        onChange={(event) => setConditionInput(event.target.value)}
      />
      <button type="button" aria-label={`${token.name} Markierung hinzufügen`} onClick={handleAddCondition}>
        Markierung hinzufügen
      </button>

      {token.conditions.map((label) => (
        <button
          key={label}
          type="button"
          aria-label={`${token.name} Markierung ${label} entfernen`}
          onClick={() => handleRemoveCondition(label)}
        >
          Entfernen
        </button>
      ))}

      <TokenStatsText token={token} />
    </li>
  )
}

export function TokenPanel({ tokens, participants, onCreate, onRemove, onAssign, onSetStats, onSetConditions }: TokenPanelProps) {
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
          <TokenRow
            // add-token-stats (#61, design.md D9): `key` aus den fuenf Werten - ein
            // geaenderter Bestand setzt die Zeile neu auf, ohne dass eine Bewegung (andere
            // Felder) den Formularzustand verwirft.
            key={`${token.id}-${token.hp}-${token.hpMax}-${token.tempHp}-${token.ac}-${token.initiative}`}
            token={token}
            players={players}
            onRemove={onRemove}
            onAssign={onAssign}
            onSetStats={onSetStats}
            onSetConditions={onSetConditions}
          />
        ))}
      </ul>
    </div>
  )
}
