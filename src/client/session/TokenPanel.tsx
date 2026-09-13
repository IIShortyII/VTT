import { useState, type FormEvent } from 'react'

import {
  CreateTokenInputSchema,
  TOKEN_ICONS,
  TokenIconSchema,
  type CreateTokenInput,
  type Token,
  type TokenIcon,
  type TokenStatsPatch,
} from '../../shared/token.js'
import { useT } from '../i18n/locale.js'
import { Field, SubmitButton } from '../ui/form.js'
import { Icon, IconButton } from '../ui/Icon.js'
import { ActionMenu, MenuTrigger, useFloating, type MenuEntry } from '../ui/menu.js'
import { EmptyState } from '../ui/status.js'
import { CONDITION_CATALOG, conditionIcon } from './conditions.js'
import { TokenStatsText } from './TokenStats.js'
import { TOKEN_ICON_LABELS } from './token-icons.js'

// Token-Verwaltung des Spielleiters im Raum (design.md D7/D9, spec.md Requirement
// "Tokenansicht im Raum"). Kein eigener Ladepfad - der Bestand kommt vom Raum
// (`SessionRoom`, D5); nur der Spielleiter rendert diese Komponente.
//
// add-token-stats (#61, design.md D9): je Token eine eigene `TokenRow` (lokaler
// Formularzustand fuer die Wertefelder, die Aenderung und die freie Markierung). Die
// angezeigte Markierungsliste kommt IMMER vom Server (`token.conditions`), nie aus einem
// lokalen Zwischenstand.
//
// add-icon-registry (#85, design.md D6): die Symbolauswahl ist eine Optionsgruppe (Radio)
// statt eines `<select>` - ein `<option>` kann kein SVG zeigen. Die Markierungsliste zeigt
// je Eintrag das Icon des Katalogeintrags (sonst keins) und eine Icon-only-Schaltflaeche
// `Entfernen`.
//
// ui-form (#90, design.md D7): das Formular `Tokens` folgt dem Formularmuster ohne
// Feldfehler - `onCreate` liefert jetzt `Promise<boolean>` (bestaetigendes Acknowledgement),
// die Schaltflaeche `Anlegen` ist eine `SubmitButton` und gesperrt, solange
// `CreateTokenInputSchema` ohne `sessionId` den Zustand nicht akzeptiert oder das
// Acknowledgement aussteht; nur ein bestaetigendes Acknowledgement leert `Name`.
//
// ui-menu (#92, design.md D5): `Entfernen`, das Auswahlfeld `<Name> zuweisen` und die
// Freigabe-Kaestchen entfallen aus der Zeile - ein eigenes ⋮-Menue (`Aktionen für <Name>`)
// deckt `Bearbeiten`/`Zuweisen…`/`Freigeben…`/`Entfernen` ab, gebaut vom Aufrufer
// (`SessionRoom`, `token-menu.ts`) und hier nur ueber `menuEntries` durchgereicht. Ein
// Rechtsklick auf die Zeile ausserhalb eines Formularfelds oeffnet dasselbe Menue
// (`floating.onContextMenu`).

export interface TokenPanelProps {
  sessionId: string
  tokens: Token[]
  onCreate: (input: Omit<CreateTokenInput, 'sessionId'>) => Promise<boolean>
  onSetStats: (tokenId: string, patch: TokenStatsPatch) => void
  onSetConditions: (tokenId: string, conditions: string[]) => void
  menuEntries: (token: Token) => MenuEntry[]
}

const DEFAULT_COLOR = '#3366ff'
const DEFAULT_SIZE = '1'
const DEFAULT_CELL = '0'
const NO_CONDITION_PICK_VALUE = ''
const NO_ICON_VALUE = ''

// design.md D3: als Modulkonstante angelegt, nicht je Render.
const CreateTokenPayloadSchema = CreateTokenInputSchema.omit({ sessionId: true })

function toStatField(value: string): number | null {
  return value === '' ? null : Number(value)
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** Typzusicherung ohne `as` (design.md D6): `value` ist ein Symbolkatalog-Name genau dann,
 * wenn `TokenIconSchema` ihn akzeptiert - die Radio-Werte kommen ausschliesslich aus
 * `TOKEN_ICONS`, ein Fehlschlag ist praktisch nur bei manipuliertem DOM moeglich. */
function isTokenIcon(value: string): value is TokenIcon {
  return TokenIconSchema.safeParse(value).success
}

interface TokenRowProps {
  token: Token
  onSetStats: (tokenId: string, patch: TokenStatsPatch) => void
  onSetConditions: (tokenId: string, conditions: string[]) => void
  menuEntries: (token: Token) => MenuEntry[]
}

function TokenRow({ token, onSetStats, onSetConditions, menuEntries }: TokenRowProps) {
  const t = useT()
  const floating = useFloating()
  const [hp, setHp] = useState(token.hp === null ? '' : String(token.hp))
  const [hpMax, setHpMax] = useState(token.hpMax === null ? '' : String(token.hpMax))
  const [tempHp, setTempHp] = useState(token.tempHp === null ? '' : String(token.tempHp))
  const [ac, setAc] = useState(token.ac === null ? '' : String(token.ac))
  const [initiative, setInitiative] = useState(token.initiative === null ? '' : String(token.initiative))
  const [delta, setDelta] = useState('')
  const [conditionInput, setConditionInput] = useState('')
  const [conditionPick, setConditionPick] = useState(NO_CONDITION_PICK_VALUE)

  const rowLabel = t('menu.rowActions', { name: token.name })

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
    <li onContextMenu={floating.onContextMenu}>
      <span>{token.name}</span>
      <MenuTrigger floating={floating} label={rowLabel} />

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

      {/* add-icon-registry (#85, design.md D6/D8): Markierungsliste als Chips - ein
          Katalogeintrag zeigt sein Icon (dekorativ), eine freie Markierung keins; die
          Schaltflaeche behaelt ihren bisherigen zugaenglichen Namen. */}
      <ul aria-label={`${token.name} Markierungen`}>
        {token.conditions.map((label) => {
          const icon = conditionIcon(label)
          return (
            <li key={label} className="chip">
              {icon !== null && <Icon name={icon} />}
              <span>{label}</span>
              <IconButton name="delete" label={`${token.name} Markierung ${label} entfernen`} onClick={() => handleRemoveCondition(label)} />
            </li>
          )
        })}
      </ul>

      <TokenStatsText token={token} />

      <ActionMenu floating={floating} label={rowLabel} entries={menuEntries(token)} />
    </li>
  )
}

export function TokenPanel({ tokens, onCreate, onSetStats, onSetConditions, menuEntries }: TokenPanelProps) {
  const t = useT()
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [icon, setIcon] = useState(NO_ICON_VALUE)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [col, setCol] = useState(DEFAULT_CELL)
  const [row, setRow] = useState(DEFAULT_CELL)
  const [pending, setPending] = useState(false)

  const payload = {
    name,
    color,
    icon: icon !== NO_ICON_VALUE && isTokenIcon(icon) ? icon : null,
    size: Number(size),
    col: Number(col),
    row: Number(row),
  }
  const valid = CreateTokenPayloadSchema.safeParse(payload).success

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || pending) {
      return
    }
    setPending(true)
    onCreate(payload)
      .then((confirmed) => {
        if (confirmed) {
          setName('')
        }
      })
      .finally(() => setPending(false))
  }

  return (
    <div>
      <h2>Tokens</h2>

      <form className="form-grid" onSubmit={handleSubmit}>
        <Field id="token-panel-name" label="Name">
          {(control) => <input {...control} name="name" value={name} onChange={(event) => setName(event.target.value)} />}
        </Field>

        <Field id="token-panel-color" label="Farbe">
          {(control) => <input {...control} type="color" name="color" value={color} onChange={(event) => setColor(event.target.value)} />}
        </Field>

        {/* add-icon-registry (#85, design.md D6): Optionsgruppe statt `<select>` - ein
            `<option>` kann kein SVG zeigen. Zugaenglicher Name jedes Optionsfelds ist der
            Text seines Labels; das Icon ist dekorativ. */}
        <fieldset className="form-field form-field--row">
          <legend className="field-label">Symbol</legend>
          <label>
            <input type="radio" name="icon" value={NO_ICON_VALUE} checked={icon === NO_ICON_VALUE} onChange={(event) => setIcon(event.target.value)} />
            Kein Symbol
          </label>
          {TOKEN_ICONS.map((tokenIcon) => (
            <label key={tokenIcon}>
              <input type="radio" name="icon" value={tokenIcon} checked={icon === tokenIcon} onChange={(event) => setIcon(event.target.value)} />
              <Icon name={tokenIcon} /> {TOKEN_ICON_LABELS[tokenIcon]}
            </label>
          ))}
        </fieldset>

        <Field id="token-panel-size" label="Größe">
          {(control) => (
            <select {...control} name="size" value={size} onChange={(event) => setSize(event.target.value)}>
              <option value="1">1×1</option>
              <option value="2">2×2</option>
              <option value="3">3×3</option>
              <option value="4">4×4</option>
            </select>
          )}
        </Field>

        <Field id="token-panel-col" label="Spalte">
          {(control) => <input {...control} type="number" name="col" value={col} onChange={(event) => setCol(event.target.value)} />}
        </Field>

        <Field id="token-panel-row" label="Zeile">
          {(control) => <input {...control} type="number" name="row" value={row} onChange={(event) => setRow(event.target.value)} />}
        </Field>

        <div className="form-actions">
          <SubmitButton pending={pending} disabled={!valid}>
            Anlegen
          </SubmitButton>
        </div>
      </form>

      {tokens.length === 0 ? (
        <EmptyState title={t('empty.tokens.title')} hint={t('empty.tokens.hint')} />
      ) : (
        <ul>
          {tokens.map((token) => (
            <TokenRow
              // add-token-stats (#61, design.md D9): `key` aus den fuenf Werten - ein
              // geaenderter Bestand setzt die Zeile neu auf, ohne dass eine Bewegung (andere
              // Felder) den Formularzustand verwirft.
              key={`${token.id}-${token.hp}-${token.hpMax}-${token.tempHp}-${token.ac}-${token.initiative}`}
              token={token}
              onSetStats={onSetStats}
              onSetConditions={onSetConditions}
              menuEntries={menuEntries}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
