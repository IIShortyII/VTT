import { useEffect, useState, type FormEvent } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import type { SessionSummary } from '../../shared/session.js'
import { ChangePasswordForm } from '../auth/ChangePasswordForm.js'
import { createSession, joinSession, listSessions } from './api.js'

// Sitzungsliste der angemeldeten Ansicht (design.md D10, Requirement "Sitzungsoberflaeche").
// Abmelden und ChangePasswordForm bleiben hier, damit die Szenarien der
// user-auth-Anmeldeoberflaeche weiter gelten. `onOpenLibrary` fuehrt zur Kartenbibliothek
// (map-library #49, spec.md Requirement "Bibliotheksoberflaeche") - die Requirements dieser
// Ansicht selbst aendern sich dadurch nicht.

export interface SessionListProps {
  user: UserOutput
  hinweis: string | null
  onEnter: (sessionId: string) => void
  onOpenLibrary: () => void
  onLogout: () => void
}

const LOAD_FAILURE_MESSAGE = 'Die Spielsitzungen konnten nicht geladen werden.'
const GENERIC_CREATE_ERROR_MESSAGE = 'Die Spielsitzung konnte nicht erstellt werden. Bitte versuche es erneut.'
const GENERIC_JOIN_ERROR_MESSAGE = 'Der Beitritt ist fehlgeschlagen. Bitte versuche es erneut.'

export function SessionList({ user, hinweis, onEnter, onOpenLibrary, onLogout }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const result = await createSession({ name })
      if (result.ok) {
        setName('')
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
    <div>
      <p>Angemeldet als {user.email}</p>
      {hinweis !== null && <p role="alert">{hinweis}</p>}
      <button type="button" onClick={onLogout}>
        Abmelden
      </button>
      <button type="button" onClick={onOpenLibrary}>
        Kartenbibliothek
      </button>

      <h1>Meine Spielsitzungen</h1>
      {loadError !== null && <p role="alert">{loadError}</p>}
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <span>{session.name}</span>
            <span> – {session.role}</span>
            <span> – {session.status}</span>
            <button type="button" onClick={() => onEnter(session.id)}>
              Betreten
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={(event) => void handleCreate(event)}>
        <h2>Neue Spielsitzung</h2>
        <label htmlFor="session-name">Name</label>
        <input id="session-name" name="name" type="text" value={name} onChange={(event) => setName(event.target.value)} required />
        {createError !== null && <p role="alert">{createError}</p>}
        <button type="submit" disabled={creating}>
          Erstellen
        </button>
      </form>

      <form onSubmit={(event) => void handleJoin(event)}>
        <h2>Spielsitzung beitreten</h2>
        <label htmlFor="session-code">Sitzungscode</label>
        <input id="session-code" name="code" type="text" value={code} onChange={(event) => setCode(event.target.value)} required />
        {joinError !== null && <p role="alert">{joinError}</p>}
        <button type="submit" disabled={joining}>
          Beitreten
        </button>
      </form>

      <ChangePasswordForm />
    </div>
  )
}
