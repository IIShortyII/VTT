import { useEffect, useState, type FormEvent } from 'react'

import type { SessionSummary } from '../../shared/session.js'
import { ChangePasswordForm } from '../auth/ChangePasswordForm.js'
import { Hero } from '../app/Hero.js'
import { Icon } from '../ui/Icon.js'
import { createSession, joinSession, listSessions } from './api.js'
import { ROLE_LABELS, SESSION_STATUS_PRESENTATION } from './session-status.js'

// Sitzungsliste der angemeldeten Ansicht (add-start-view #86, design.md D4). Erstellen- und
// Beitreten-Formular sind Aufklapp-Panels statt dauerhaft offener Formulare (proposal.md
// "Aufklapp-Panels statt Modal") - `panel` haelt, welches (falls ueberhaupt eines) offen ist.
// ChangePasswordForm bleibt hier, aber zugeklappt in einem `<details>` (proposal.md,
// user-auth "Passwortänderung in der Oberfläche"). Abmeldung und der globale Hinweis liegen
// in der App-Shell (ui-shell #84) - diese Ansicht kennt beides nicht mehr. Prop `user` entfaellt
// (design.md D4, Nachlese aus #84) - die angemeldete Ansicht braucht ihn nirgends.

export interface SessionListProps {
  onEnter: (sessionId: string) => void
  onOpenLibrary: () => void
}

type Panel = 'none' | 'erstellen' | 'beitreten'

const LOAD_FAILURE_MESSAGE = 'Die Spielsitzungen konnten nicht geladen werden.'
const GENERIC_CREATE_ERROR_MESSAGE = 'Die Spielsitzung konnte nicht erstellt werden. Bitte versuche es erneut.'
const GENERIC_JOIN_ERROR_MESSAGE = 'Der Beitritt ist fehlgeschlagen. Bitte versuche es erneut.'

export function SessionList({ onEnter, onOpenLibrary }: SessionListProps) {
  // `null` bis `GET /api/sessions` geantwortet hat (design.md D4, "ausstehend") - erst danach
  // darf zwischen Leerzustand und Liste entschieden werden (Requirement "Leerzustand").
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

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
      setLoadError(LOAD_FAILURE_MESSAGE)
    })
  }, [])

  const toggle = (target: Panel) => () => {
    setCreateError(null)
    setJoinError(null)
    setPanel((current) => (current === target ? 'none' : target))
  }

  const close = () => {
    setCreateError(null)
    setJoinError(null)
    setPanel('none')
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const result = await createSession({ name })
      if (result.ok) {
        setName('')
        setPanel('none')
        await reload()
      } else {
        setCreateError(result.message)
      }
    } catch (error) {
      console.error(error)
      setCreateError(GENERIC_CREATE_ERROR_MESSAGE)
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setJoining(true)
    setJoinError(null)
    try {
      const result = await joinSession({ code })
      if (result.ok) {
        setCode('')
        setPanel('none')
        await reload()
      } else {
        setJoinError(result.message)
      }
    } catch (error) {
      console.error(error)
      setJoinError(GENERIC_JOIN_ERROR_MESSAGE)
    } finally {
      setJoining(false)
    }
  }

  return (
    <>
      <Hero
        title="Meine Spielsitzungen"
        subline="Leite eine Sitzung oder tritt mit einem Code bei."
        actions={
          <>
            <button type="button" className="primary" aria-expanded={panel === 'erstellen'} onClick={toggle('erstellen')}>
              <Icon name="add" /> Sitzung leiten
            </button>
            <button type="button" aria-expanded={panel === 'beitreten'} onClick={toggle('beitreten')}>
              <Icon name="players" /> Beitreten
            </button>
            <button type="button" className="link" onClick={onOpenLibrary}>
              <Icon name="library" /> Kartenbibliothek
            </button>
          </>
        }
      />

      {panel === 'erstellen' && (
        <form className="panel" aria-labelledby="create-session-heading" onSubmit={(event) => void handleCreate(event)}>
          <h2 id="create-session-heading">Neue Spielsitzung</h2>
          <label className="field-label" htmlFor="session-name">
            Name
          </label>
          <input
            id="session-name"
            name="name"
            type="text"
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {createError !== null && (
            <p role="alert" className="field-error">
              {createError}
            </p>
          )}
          <div className="panel-actions">
            <button type="submit" className="primary" disabled={creating}>
              Erstellen
            </button>
            <button type="button" onClick={close}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {panel === 'beitreten' && (
        <form className="panel" aria-labelledby="join-session-heading" onSubmit={(event) => void handleJoin(event)}>
          <h2 id="join-session-heading">Spielsitzung beitreten</h2>
          <label className="field-label" htmlFor="session-code">
            Sitzungscode
          </label>
          <input
            id="session-code"
            name="code"
            type="text"
            autoFocus
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {joinError !== null && (
            <p role="alert" className="field-error">
              {joinError}
            </p>
          )}
          <div className="panel-actions">
            <button type="submit" className="primary" disabled={joining}>
              Beitreten
            </button>
            <button type="button" onClick={close}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {loadError !== null && <p role="alert">{loadError}</p>}

      {sessions !== null && sessions.length === 0 && loadError === null && (
        <p className="empty-state">
          <strong>Noch keine Sitzungen</strong>
          <span>Erstelle eine Sitzung oder tritt mit einem Code bei.</span>
        </p>
      )}

      {sessions !== null && sessions.length > 0 && (
        <ul className="session-cards" aria-label="Meine Spielsitzungen">
          {sessions.map((session) => {
            const status = SESSION_STATUS_PRESENTATION[session.status]
            return (
              <li key={session.id} className="session-card">
                <h3 className="session-card-name">{session.name}</h3>
                <div className="session-card-meta">
                  <span className={status.modifier ? `status-pill ${status.modifier}` : 'status-pill'}>
                    <Icon name={status.icon} /> {status.label}
                  </span>
                  <span>
                    <Icon name="user" /> {ROLE_LABELS[session.role]}
                  </span>
                </div>
                <button type="button" onClick={() => onEnter(session.id)}>
                  Betreten
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <details className="start-account">
        <summary>Passwort ändern</summary>
        <ChangePasswordForm />
      </details>
    </>
  )
}
