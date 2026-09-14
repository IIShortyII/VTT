import { useState, type FormEvent } from 'react'

import type { Participant } from '../../shared/session.js'
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
import { Icon } from '../ui/Icon.js'
import type { MenuEntry } from '../ui/menu.js'
import { Modal } from '../ui/Modal.js'
import { EmptyState } from '../ui/status.js'
import { TokenCard, tokenOwnerLabel } from './TokenStats.js'
import { TOKEN_ICON_LABELS } from './token-icons.js'

// Token-Verwaltung des Spielleiters im Raum (design.md D7/D9, spec.md Requirement
// "Tokenansicht im Raum"). Kein eigener Ladepfad - der Bestand kommt vom Raum
// (`SessionRoom`, D5); nur der Spielleiter rendert diese Komponente.
//
// add-icon-registry (#85, design.md D6): die Symbolauswahl ist eine Optionsgruppe (Radio)
// statt eines `<select>` - ein `<option>` kann kein SVG zeigen.
//
// ui-form (#90, design.md D7): das Formular `Tokens` folgt dem Formularmuster ohne
// Feldfehler - `onCreate` liefert jetzt `Promise<boolean>` (bestaetigendes Acknowledgement),
// die Schaltflaeche `Anlegen` ist eine `SubmitButton` und gesperrt, solange
// `CreateTokenInputSchema` ohne `sessionId` den Zustand nicht akzeptiert oder das
// Acknowledgement aussteht; nur ein bestaetigendes Acknowledgement leert `Name`.
//
// ui-menu (#92, design.md D5): `Entfernen`, das Auswahlfeld `<Name> zuweisen` und die
// Freigabe-Kaestchen entfallen aus der Zeile - ein eigenes ⋮-Menue (`Aktionen für <Name>`)
// deckt `Bearbeiten`/`Zuweisen…`/`Freigeben…`/`Auf Karte zentrieren`/`Entfernen` ab, gebaut
// vom Aufrufer (`SessionRoom`, `token-menu.ts`).
//
// add-token-cards (#95, design.md D1/D2/D9): das Anlege-Formular wandert in ein Modal
// (Kopf-Knopf `Token anlegen`); je Token rendert `TokenCard` (`TokenStats.tsx`) die
// praesentationale Karte, hier nur noch die Schaden/Heilung-Eingabe als deren Kind
// (`onSetStats`). Die Werte-/Conditions-Bearbeitung liegt jetzt vollstaendig im
// Bearbeiten-Modal (`SessionRoom.tsx`, `EditTokenDialog`) - `onSetConditions` ist deshalb
// keine Prop dieser Datei mehr.

export interface TokenPanelProps {
  sessionId: string
  tokens: Token[]
  participants: Participant[]
  onCreate: (input: Omit<CreateTokenInput, 'sessionId'>) => Promise<boolean>
  onSetStats: (tokenId: string, patch: TokenStatsPatch) => void
  menuEntries: (token: Token) => MenuEntry[]
}

const DEFAULT_COLOR = '#3366ff'
const DEFAULT_SIZE = '1'
const DEFAULT_CELL = '0'
const NO_ICON_VALUE = ''

// design.md D3: als Modulkonstante angelegt, nicht je Render.
const CreateTokenPayloadSchema = CreateTokenInputSchema.omit({ sessionId: true })

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** Typzusicherung ohne `as` (design.md D6): `value` ist ein Symbolkatalog-Name genau dann,
 * wenn `TokenIconSchema` ihn akzeptiert - die Radio-Werte kommen ausschliesslich aus
 * `TOKEN_ICONS`, ein Fehlschlag ist praktisch nur bei manipuliertem DOM moeglich. */
function isTokenIcon(value: string): value is TokenIcon {
  return TokenIconSchema.safeParse(value).success
}

interface TokenDamageControlsProps {
  token: Token
  onSetStats: (tokenId: string, patch: TokenStatsPatch) => void
}

/** Kompakte Schaden/Heilung-Eingabe auf der Karte (design.md D2): haeufigste Kampfaktion,
 * bewusst kein Modal. Rechenregel unveraendert seit `add-token-stats` (#61). */
function TokenDamageControls({ token, onSetStats }: TokenDamageControlsProps) {
  const [delta, setDelta] = useState('')

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

  return (
    <div className="token-card__delta">
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
    </div>
  )
}

export function TokenPanel({ tokens, participants, onCreate, onSetStats, menuEntries }: TokenPanelProps) {
  const t = useT()
  const [createOpen, setCreateOpen] = useState(false)
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
          setCreateOpen(false)
        }
      })
      .finally(() => setPending(false))
  }

  return (
    <div className="panel panel--wide">
      <div className="token-panel__head">
        <h2>Tokens</h2>
        <button type="button" onClick={() => setCreateOpen(true)}>
          Token anlegen
        </button>
      </div>

      {createOpen && (
        <Modal title="Token anlegen" onClose={() => setCreateOpen(false)}>
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field id="token-panel-name" label="Name">
              {(control) => <input {...control} name="name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />}
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
        </Modal>
      )}

      {tokens.length === 0 ? (
        <EmptyState title={t('empty.tokens.title')} hint={t('empty.tokens.hint')} />
      ) : (
        <ul className="token-card-list">
          {tokens.map((token) => (
            <TokenCard key={token.id} token={token} ownerName={tokenOwnerLabel(token, participants)} menuEntries={menuEntries(token)}>
              <TokenDamageControls token={token} onSetStats={onSetStats} />
            </TokenCard>
          ))}
        </ul>
      )}
    </div>
  )
}
