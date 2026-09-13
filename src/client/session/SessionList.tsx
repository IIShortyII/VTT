import { useEffect, useState, type FormEvent } from 'react'

import { CreateSessionInputSchema, JoinSessionInputSchema, type SessionSummary } from '../../shared/session.js'
import { Hero } from '../app/Hero.js'
import { useT } from '../i18n/locale.js'
import { Icon } from '../ui/Icon.js'
import { Field, SubmitButton } from '../ui/form.js'
import { Modal } from '../ui/Modal.js'
import { EmptyState } from '../ui/status.js'
import { createSession, joinSession, listSessions } from './api.js'
import { ROLE_LABELS, SESSION_STATUS_PRESENTATION } from './session-status.js'

// Sitzungsliste der angemeldeten Ansicht (add-start-view #86, design.md D4). panel haelt,
// welches Formular (falls ueberhaupt eines) offen ist. Abmeldung und der globale Hinweis
// liegen in der App-Shell (ui-shell #84) - diese Ansicht kennt beides nicht mehr. Prop user
// entfaellt (design.md D4, Nachlese aus #84) - die angemeldete Ansicht braucht ihn nirgends.
// ui-text (#87, design.md D6): Hero-Texte, die drei Aktionen, beide Formulare, Leerzustand,
// aria-label der Liste, Betreten und die frueher als Modulkonstanten gehaltenen
// Fehlermeldungen laufen jetzt ueber t(start.*); Pillentext und Rolle der Karten ueber
// t(status.label)/t(ROLE_LABELS[session.role]).
// ui-dialog (#89, design.md D7): die Erstellen- und Beitreten-Formulare stehen jetzt in einem
// `Modal` statt als Aufklapp-Panel; die Hero-Aktionen tragen `aria-haspopup="dialog"` statt
// `aria-expanded`. `toggle` entfaellt zugunsten von `open` (setzt `panel` direkt, statt zu
// schalten) - hoechstens ein Dialog ist ueberhaupt erreichbar, weil ein offener Dialog den
// Hintergrund per Backdrop verdeckt.
// ui-menu (#92, design.md D8): das details-Element mit der Passwortaenderung entfaellt -
// das Formular liegt jetzt in einem Modal, erreichbar ueber das Kontomenue der Shell
// (ui-shell, AppShell); diese Ansicht importiert ChangePasswordForm nicht mehr.
// ui-form (#90, design.md D5): beide Formulare folgen dem Formularmuster -
// `createError`/`joinError` weichen je einem Paar `createFieldErrors`/`createFormError` bzw.
// `joinFieldErrors`/`joinFormError`; `open`/`close` leeren alle vier. `panel-actions` weicht
// `form-actions`; `Abbrechen` ist nie gesperrt.

export interface SessionListProps {
  onEnter: (sessionId: string) => void
  onOpenLibrary: () => void
}

type Panel = 'none' | 'erstellen' | 'beitreten'

export function SessionList({ onEnter, onOpenLibrary }: SessionListProps) {
  const t = useT()
  // `null` bis `GET /api/sessions` geantwortet hat (design.md D4, "ausstehend") - erst danach
  // darf zwischen Leerzustand und Liste entschieden werden (Requirement "Leerzustand").
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [createFieldErrors, setCreateFieldErrors] = useState<{ name?: string }>({})
  const [createFormError, setCreateFormError] = useState<string | null>(null)
  const [joinFieldErrors, setJoinFieldErrors] = useState<{ code?: string }>({})
  const [joinFormError, setJoinFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const createValid = CreateSessionInputSchema.safeParse({ name }).success
  const joinValid = JoinSessionInputSchema.safeParse({ code }).success

  const reload = async () => {
    const result = await listSessions()
    if (result.ok) {
      setSessions(result.sessions)
      setLoadError(null)
    } else {
      setLoadError(result.message)
    }
  }

  // Einmaliges Laden beim Mounten - danach haelt reload() (bei Erstellen/Beitreten) den Stand
  // aktuell.
  useEffect(() => {
    reload().catch((error: unknown) => {
      console.error(error)
      setLoadError(t('start.loadFailed'))
    })
  }, [t])

  const open = (target: Panel) => () => {
    setCreateFieldErrors({})
    setCreateFormError(null)
    setJoinFieldErrors({})
    setJoinFormError(null)
    setPanel(target)
  }

  const close = () => {
    setCreateFieldErrors({})
    setCreateFormError(null)
    setJoinFieldErrors({})
    setJoinFormError(null)
    setPanel('none')
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createValid || creating) {
      return
    }
    setCreating(true)
    setCreateFieldErrors({})
    setCreateFormError(null)
    try {
      const result = await createSession({ name })
      if (result.ok) {
        setName('')
        setPanel('none')
        await reload()
      } else if (result.field === 'name') {
        setCreateFieldErrors({ name: result.message })
      } else {
        setCreateFormError(result.message)
      }
    } catch (error) {
      console.error(error)
      setCreateFormError(t('start.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!joinValid || joining) {
      return
    }
    setJoining(true)
    setJoinFieldErrors({})
    setJoinFormError(null)
    try {
      const result = await joinSession({ code })
      if (result.ok) {
        setCode('')
        setPanel('none')
        await reload()
      } else if (result.field === 'code') {
        setJoinFieldErrors({ code: result.message })
      } else {
        setJoinFormError(result.message)
      }
    } catch (error) {
      console.error(error)
      setJoinFormError(t('start.joinFailed'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <>
      <Hero
        title={t('start.title')}
        subline={t('start.subline')}
        actions={
          <>
            <button type="button" className="primary" aria-haspopup="dialog" onClick={open('erstellen')}>
              <Icon name="add" /> {t('start.actions.lead')}
            </button>
            <button type="button" aria-haspopup="dialog" onClick={open('beitreten')}>
              <Icon name="players" /> {t('start.actions.join')}
            </button>
            <button type="button" className="link" onClick={onOpenLibrary}>
              <Icon name="library" /> {t('start.actions.library')}
            </button>
          </>
        }
      />

      {panel === 'erstellen' && (
        <Modal title={t('start.create.title')} onClose={close}>
          <form className="form-grid" aria-label={t('start.create.title')} onSubmit={(event) => void handleCreate(event)}>
            <Field id="session-name" label={t('start.create.name')} error={createFieldErrors.name ?? null}>
              {(control) => (
                <input
                  {...control}
                  name="name"
                  type="text"
                  autoFocus
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            {createFormError !== null && (
              <p className="form-error" role="alert">
                {createFormError}
              </p>
            )}
            <div className="form-actions">
              <SubmitButton className="primary" pending={creating} disabled={!createValid}>
                {t('start.create.submit')}
              </SubmitButton>
              <button type="button" onClick={close}>
                {t('start.cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {panel === 'beitreten' && (
        <Modal title={t('start.join.title')} onClose={close}>
          <form className="form-grid" aria-label={t('start.join.title')} onSubmit={(event) => void handleJoin(event)}>
            <Field id="session-code" label={t('start.join.code')} error={joinFieldErrors.code ?? null}>
              {(control) => (
                <input
                  {...control}
                  name="code"
                  type="text"
                  autoFocus
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              )}
            </Field>
            {joinFormError !== null && (
              <p className="form-error" role="alert">
                {joinFormError}
              </p>
            )}
            <div className="form-actions">
              <SubmitButton className="primary" pending={joining} disabled={!joinValid}>
                {t('start.join.submit')}
              </SubmitButton>
              <button type="button" onClick={close}>
                {t('start.cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {loadError !== null && <p role="alert">{loadError}</p>}

      {sessions !== null && sessions.length === 0 && loadError === null && (
        <EmptyState title={t('start.empty.title')} hint={t('start.empty.hint')} />
      )}

      {sessions !== null && sessions.length > 0 && (
        <ul className="session-cards" aria-label={t('start.list')}>
          {sessions.map((session) => {
            const status = SESSION_STATUS_PRESENTATION[session.status]
            return (
              <li key={session.id} className="session-card">
                <h3 className="session-card-name">{session.name}</h3>
                <div className="session-card-meta">
                  <span className={status.modifier ? `status-pill ${status.modifier}` : 'status-pill'}>
                    <Icon name={status.icon} /> {t(status.label)}
                  </span>
                  <span>
                    <Icon name="user" /> {t(ROLE_LABELS[session.role])}
                  </span>
                </div>
                <button type="button" onClick={() => onEnter(session.id)}>
                  {t('start.enter')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
