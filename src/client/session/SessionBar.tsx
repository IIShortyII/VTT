import { useState, type FormEvent } from 'react'

import { allowedActions, SessionNameSchema, TRANSITION_ACTIONS, type GameSessionStatus, type MemberRole, type RenameAck, type TransitionAction } from '../../shared/session.js'
import { useT } from '../i18n/locale.js'
import { Field, SubmitButton } from '../ui/form.js'
import { Icon, IconButton } from '../ui/Icon.js'
import { ActionMenuButton, type MenuEntry } from '../ui/menu.js'
import { SESSION_STATUS_PRESENTATION, TRANSITION_ICONS, TRANSITION_LABELS } from './session-status.js'

// session-bar (#93, design.md D5, D11): die Steuerzeile am Kopf der Raumansicht - Identitaet,
// Sitzungscode-Gruppe (nur Spielleiter), Zustandsgruppe mit Steuerung (nur Spielleiter),
// Verwaltungsmenue. Praesentational: `revealed` (Maskenzustand) ist der einzige lokale
// Zustand, alles Uebrige kommt als Prop aus `SessionRoom.tsx` (constitution.md §9.1) - #98
// kann diese Komponente fuer die Spieleransicht wiederverwenden. Diese Datei importiert
// `react`, `shared/session.ts`, `session-status.ts`, `../i18n/locale.js`, `../ui/Icon.js`,
// `../ui/menu.js`, `../ui/form.js` - nichts sonst (design.md D11).

export interface SessionBarProps {
  name: string
  status: GameSessionStatus
  role: MemberRole
  code?: string
  transitionError: string | null
  onTransition: (action: TransitionAction) => void
  onCopyCode: () => void
  onRename: () => void
  onOpenLibrary: () => void
  onLeave: () => void
}

export function SessionBar({ name, status, role, code, transitionError, onTransition, onCopyCode, onRename, onOpenLibrary, onLeave }: SessionBarProps) {
  const t = useT()
  const [revealed, setRevealed] = useState(false)
  const allowed = allowedActions(status)
  const isGm = role === 'spielleiter'
  const presentation = SESSION_STATUS_PRESENTATION[status]

  const menuEntries: MenuEntry[] = [
    { id: 'rename', label: t('menu.rename'), icon: 'edit', disabled: !isGm, onSelect: onRename },
    { id: 'library', label: t('menu.library'), icon: 'library', onSelect: onOpenLibrary },
    { id: 'leave', label: t('menu.leave'), icon: 'logout', onSelect: onLeave },
  ]

  return (
    <>
      <div className="session-bar" role="group" aria-label={t('bar.label')}>
        <div className="session-bar__group session-bar__identity">
          <h1 className="session-bar__name">{name}</h1>
          {isGm && <IconButton name="edit" label={t('bar.rename')} onClick={onRename} />}
        </div>

        {code !== undefined && (
          <div className="session-bar__group">
            <code className="session-bar__code" aria-label={t('session.code')}>
              {revealed ? code : '•'.repeat(code.length)}
            </code>
            <IconButton
              name={revealed ? 'hide' : 'reveal'}
              label={t('session.showCode')}
              aria-pressed={revealed}
              onClick={() => setRevealed((prev) => !prev)}
            />
            <IconButton name="copy" label={t('bar.copyCode')} onClick={onCopyCode} />
          </div>
        )}

        <div className="session-bar__group">
          <span className={presentation.modifier ? `status-pill ${presentation.modifier}` : 'status-pill'}>
            <Icon name={presentation.icon} /> {t(presentation.label)}
          </span>
          {isGm && (
            <div className="session-bar__transport" role="group" aria-label={t('bar.transport')}>
              {TRANSITION_ACTIONS.map((action) => (
                <IconButton
                  key={action}
                  name={TRANSITION_ICONS[action]}
                  label={t(TRANSITION_LABELS[action])}
                  className={action === 'beenden' ? 'transport-button transport-button--danger' : 'transport-button'}
                  disabled={!allowed.includes(action)}
                  onClick={() => onTransition(action)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="session-bar__group">
          <ActionMenuButton variant="icon" icon="settings" label={t('bar.settings')} entries={menuEntries} />
        </div>
      </div>
      {transitionError !== null && (
        <p role="alert" className="session-bar-error">
          {transitionError}
        </p>
      )}
    </>
  )
}

export interface RenameSessionFormProps {
  initialName: string
  onSubmit: (name: string) => Promise<RenameAck>
  onDone: () => void
}

/** Formular des Umbenennen-Modals (design.md D5): dieselbe Namensregel wie der Vertrag
 * (`SessionNameSchema`) - ein ungueltiger Wert bleibt ein Feldfehler, nichts wird gesendet
 * (constitution.md §9.1, "Absichten senden, nicht Zustand"). */
export function RenameSessionForm({ initialName, onSubmit, onDone }: RenameSessionFormProps) {
  const t = useT()
  const [value, setValue] = useState(initialName)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFieldError(null)
    setFormError(null)

    const parsed = SessionNameSchema.safeParse(value)
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? '')
      return
    }

    setPending(true)
    try {
      const ack = await onSubmit(parsed.data)
      if (ack.ok) {
        onDone()
        return
      }
      setFormError(ack.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
      <Field id="session-rename-name" label={t('session.rename.name')} error={fieldError}>
        {(control) => <input {...control} name="name" value={value} autoFocus onChange={(event) => setValue(event.target.value)} />}
      </Field>
      {formError !== null && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <SubmitButton pending={pending}>{t('session.rename.submit')}</SubmitButton>
      </div>
    </form>
  )
}
