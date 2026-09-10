import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  allowedActions,
  displayName,
  type AliasAck,
  type EnterAck,
  type GameSessionStatus,
  type MemberRole,
  type Participant,
  type TransitionAction,
} from '../../shared/session.js'
import { createSessionSocket, type SessionSocketFacade } from './socket.js'

// Raumansicht (design.md D10, Requirement "Sitzungsoberflaeche"). Zustand und Teilnehmer
// kommen ausschliesslich aus dem Acknowledgement von `enter` und den nachfolgenden
// Server-Ereignissen - der angezeigte Zustand folgt dem Server, nie dem zuletzt geklickten
// Uebergang (constitution.md §9.1).

export interface SessionRoomProps {
  sessionId: string
  currentUserId: string
  onLeave: () => void
  onEnded: (message: string) => void
}

const ENDED_MESSAGE = 'Die Spielsitzung wurde beendet.'
const REPLACED_MESSAGE = 'Diese Spielsitzung wurde an anderer Stelle geöffnet.'
const ENTER_FAILURE_MESSAGE = 'Der Raum konnte nicht betreten werden. Bitte versuche es erneut.'

type RoomState =
  | { status: 'lädt' }
  | { status: 'fehler'; message: string }
  | {
      status: 'bereit'
      name: string
      sessionStatus: GameSessionStatus
      role: MemberRole
      code?: string
      participants: Participant[]
    }

export function SessionRoom({ sessionId, currentUserId, onLeave, onEnded }: SessionRoomProps) {
  const socketRef = useRef<SessionSocketFacade | null>(null)
  const [state, setState] = useState<RoomState>({ status: 'lädt' })
  const [replaced, setReplaced] = useState(false)
  // Eingabefeld der eigenen Zeile (design.md D6): einmal beim Betreten mit dem aktuell
  // gesetzten Alias vorbelegt, danach eine unabhaengige Absicht - die angezeigte Benennung
  // (`displayName`) folgt ausschliesslich `state.participants`, nicht dieser Eingabe
  // (constitution.md §9.1, Requirement "Eigener Alias wird als Absicht gesendet").
  const [aliasInput, setAliasInput] = useState('')
  const [aliasError, setAliasError] = useState<string | null>(null)

  // Betritt den Raum beim Mounten und bei einem Wechsel der `sessionId` - eine neue Fassade
  // je Betreten, getrennt beim Unmount (design.md D10: "Fassade beim Unmount trennen").
  useEffect(() => {
    const socket = createSessionSocket()
    socketRef.current = socket
    let cancelled = false

    socket.on('participants', ({ participants }) => {
      setState((prev) => (prev.status === 'bereit' ? { ...prev, participants } : prev))
    })
    socket.on('status', ({ status }) => {
      setState((prev) => (prev.status === 'bereit' ? { ...prev, sessionStatus: status } : prev))
    })
    // Nach `replaced` MUSS die Fassade sich nicht von selbst neu verbinden oder den Raum
    // erneut betreten (Requirement "Sitzungsoberflaeche") - nur der Hinweis erscheint, ein
    // erneutes Betreten erfolgt ausschliesslich durch "Hier weiterspielen".
    socket.on('replaced', () => {
      setReplaced(true)
    })
    socket.on('ended', () => {
      onEnded(ENDED_MESSAGE)
    })

    socket.connect()
    socket
      .enter(sessionId)
      .then((ack: EnterAck) => {
        if (cancelled) {
          return
        }
        applyEnterAck(ack)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        console.error(error)
        setState({ status: 'fehler', message: ENTER_FAILURE_MESSAGE })
      })

    function applyEnterAck(ack: EnterAck): void {
      if (!ack.ok) {
        setState({ status: 'fehler', message: ack.message })
        return
      }
      setState({
        status: 'bereit',
        name: ack.session.name,
        sessionStatus: ack.session.status,
        role: ack.session.role,
        code: ack.session.code,
        participants: ack.participants,
      })
      const self = ack.participants.find((participant) => participant.userId === currentUserId)
      setAliasInput(self?.alias ?? '')
    }

    return () => {
      cancelled = true
      socket.disconnect()
    }
  }, [sessionId, currentUserId, onEnded])

  const handleTransition = (action: TransitionAction) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket.transition(sessionId, action).catch((error: unknown) => {
      console.error(error)
    })
  }

  const handleAliasSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .alias(sessionId, aliasInput)
      .then((ack: AliasAck) => {
        setAliasError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleReconnect = () => {
    setReplaced(false)
    setState({ status: 'lädt' })

    const socket = createSessionSocket()
    socketRef.current = socket

    socket.on('participants', ({ participants }) => {
      setState((prev) => (prev.status === 'bereit' ? { ...prev, participants } : prev))
    })
    socket.on('status', ({ status }) => {
      setState((prev) => (prev.status === 'bereit' ? { ...prev, sessionStatus: status } : prev))
    })
    socket.on('replaced', () => {
      setReplaced(true)
    })
    socket.on('ended', () => {
      onEnded(ENDED_MESSAGE)
    })

    socket.connect()
    socket
      .enter(sessionId)
      .then((ack: EnterAck) => {
        if (!ack.ok) {
          setState({ status: 'fehler', message: ack.message })
          return
        }
        setState({
          status: 'bereit',
          name: ack.session.name,
          sessionStatus: ack.session.status,
          role: ack.session.role,
          code: ack.session.code,
          participants: ack.participants,
        })
        const self = ack.participants.find((participant) => participant.userId === currentUserId)
        setAliasInput(self?.alias ?? '')
      })
      .catch((error: unknown) => {
        console.error(error)
        setState({ status: 'fehler', message: ENTER_FAILURE_MESSAGE })
      })
  }

  if (replaced) {
    return (
      <div>
        <p role="alert">{REPLACED_MESSAGE}</p>
        <button type="button" onClick={handleReconnect}>
          Hier weiterspielen
        </button>
      </div>
    )
  }

  if (state.status === 'lädt') {
    return <p>Lädt …</p>
  }

  if (state.status === 'fehler') {
    return (
      <div>
        <p role="alert">{state.message}</p>
        <button type="button" onClick={onLeave}>
          Zurück zur Liste
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1>{state.name}</h1>
      <p>Zustand: {state.sessionStatus}</p>
      {state.code !== undefined && <p>Code: {state.code}</p>}
      <ul>
        {state.participants.map((participant) => (
          <li key={participant.userId}>
            {/* Kein Rollen-Text pro Teilnehmer (Requirement "Sitzungsoberflaeche" nennt nur
                Alias-oder-Nutzername und Anwesenheitskennzeichen) - "spielleiter" als
                sichtbarer Text wuerde jeden Nutzernamen ueberdecken, der "leiter" als
                Teilstring enthaelt. */}
            <span>{displayName(participant)}</span>
            <span> – {participant.online ? 'anwesend' : 'abwesend'}</span>
            {participant.userId === currentUserId && (
              <form onSubmit={handleAliasSubmit}>
                <label htmlFor="alias-input">Alias</label>
                <input id="alias-input" value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} />
                <button type="submit">Alias setzen</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {aliasError !== null && <p role="alert">{aliasError}</p>}
      {state.role === 'spielleiter' && (
        <div>
          {allowedActions(state.sessionStatus).map((action) => (
            <button key={action} type="button" onClick={() => handleTransition(action)}>
              {action}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={onLeave}>
        Zurück zur Liste
      </button>
    </div>
  )
}
