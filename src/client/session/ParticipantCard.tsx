import type { FormEvent } from 'react'

import { displayName, type Participant } from '../../shared/session.js'
import type { Token } from '../../shared/token.js'
import { useT } from '../i18n/locale.js'
import { Field, SubmitButton } from '../ui/form.js'
import { IconButton } from '../ui/Icon.js'
import { ActionMenu, MenuTrigger, useFloating, type MenuEntry } from '../ui/menu.js'

// add-participant-cards (#97, design.md D1/D2/D6, spec.md Requirement "Teilnehmerkarten"):
// `ParticipantCard` ersetzt die bisherige Zeile des Reiters `Teilnehmer` - Kopf (Avatar, Name,
// Rollen-Pill), Praesenzkennzeichen, Token-Chips und Aktions-Bereich (`Alias ändern` auf der
// eigenen Karte, ⋮-Menü je Rolle). `AliasForm` und `AssignTokensForm` sind die Formulare der
// beiden Modals, von `SessionRoom` aufgerufen (Muster `AssignTokenDialog`/`EditTokenDialog`
// dort). Diese Datei importiert nur Typen aus `shared/session.ts`/`shared/token.ts`,
// `../i18n/locale.js`, `../ui/form.js`, `../ui/Icon.js` und `../ui/menu.js`.

export interface ParticipantCardProps {
  participant: Participant
  isOwn: boolean
  tokens: Token[]
  menuEntries: MenuEntry[]
  onEditAlias: () => void
}

/** Praesentationale Teilnehmerkarte (design.md D1, spec.md Requirement "Teilnehmerkarten"):
 * `article.participant-card`, Rolle `listitem` - wie `TokenCard` kein separates `<li>`. */
export function ParticipantCard({ participant, isOwn, tokens, menuEntries, onEditAlias }: ParticipantCardProps) {
  const t = useT()
  const floating = useFloating()
  const rowLabel = t('menu.rowActions', { name: displayName(participant) })
  const roleLabel = participant.role === 'spielleiter' ? t('session.role.gm') : t('session.role.player')
  const presenceLabel = participant.online ? t('presence.online') : t('presence.offline')
  const presenceClass = participant.online ? 'presence presence--online' : 'presence presence--offline'
  const ownedTokens = tokens.filter((token) => token.ownerId === participant.userId)
  const hasMenu = menuEntries.length > 0

  return (
    <article className="participant-card" role="listitem">
      <span className="participant-card__avatar" aria-hidden="true" />
      <span className="participant-card__name">{displayName(participant)}</span>
      <span className="chip participant-card__role">{roleLabel}</span>
      <span className={presenceClass}>
        <span className="presence__dot" aria-hidden="true" />
        {presenceLabel}
      </span>
      <span className="participant-card__tokens">
        {ownedTokens.map((token) => (
          <span key={token.id} className="chip">
            {token.name}
          </span>
        ))}
      </span>
      <div className="participant-card__actions">
        {isOwn && <IconButton name="edit" label={t('alias.edit')} onClick={onEditAlias} />}
        {hasMenu && <MenuTrigger floating={floating} label={rowLabel} />}
      </div>
      {hasMenu && <ActionMenu floating={floating} label={rowLabel} entries={menuEntries} />}
    </article>
  )
}

export interface AliasFormProps {
  value: string
  onChange: (value: string) => void
  error: string | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

/** Formular des Alias-Modals (design.md D2, spec.md Requirement "Teilnehmerkarten"): Feld
 * `Alias` (Attribut `name="alias"`), Absende-Schaltflaeche `Alias setzen`, Fehler als
 * `role="alert"` (`Field`, `ui-form`). */
export function AliasForm({ value, onChange, error, onSubmit }: AliasFormProps) {
  const t = useT()
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field id="alias-input" label={t('alias.label')} error={error}>
        {(control) => <input {...control} name="alias" value={value} onChange={(event) => onChange(event.target.value)} autoFocus />}
      </Field>
      <div className="form-actions">
        <SubmitButton pending={false}>{t('alias.submit')}</SubmitButton>
      </div>
    </form>
  )
}

export interface AssignTokensFormProps {
  tokens: Token[]
  participantId: string
  onToggle: (tokenId: string, checked: boolean) => void
  error: string | null
}

/** Formular des Zuweisen-Modals (design.md D6, spec.md Requirement "Teilnehmerkarten"): je
 * Token eine Checkbox mit dem Tokennamen als zugaenglichem Namen (Label umschliesst das
 * Steuerelement), angehakt genau dann, wenn `token.ownerId` der `participantId` entspricht -
 * der Zustand folgt ausschliesslich `tokens` (constitution.md §9.1), kein lokaler Optimismus.
 * Ohne Tokens der Sitzung der Hinweis `Keine Tokens in dieser Sitzung.` statt einer Liste. */
export function AssignTokensForm({ tokens, participantId, onToggle, error }: AssignTokensFormProps) {
  const t = useT()
  if (tokens.length === 0) {
    return <p>{t('participant.assign.empty')}</p>
  }
  return (
    <div className="form-grid">
      {tokens.map((token) => (
        <label key={token.id} className="checkbox-field">
          <input type="checkbox" checked={token.ownerId === participantId} onChange={(event) => onToggle(token.id, event.target.checked)} />
          {token.name}
        </label>
      ))}
      {error !== null && <p role="alert">{error}</p>}
    </div>
  )
}
