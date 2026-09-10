import { useEffect, useState } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import { fetchCurrentUser, logout } from '../auth/api.js'
import { LoginForm } from '../auth/LoginForm.js'
import { RegisterForm } from '../auth/RegisterForm.js'
import { SessionList } from '../session/SessionList.js'
import { SessionRoom } from '../session/SessionRoom.js'

// Kein Router: der Auth-Zustand entscheidet, welche Ansicht erscheint (design.md D7/D10).
// "unbekannt" ist kein Detail, sondern verhindert, dass beim Reload fuer einen Moment das
// Loginformular aufblitzt. Innerhalb der angemeldeten Ansicht entscheidet `sessionView`
// zwischen der Sitzungsliste und der Raumansicht (design.md D10, Non-Goal "kein Router").
type AuthState = { status: 'unbekannt' } | { status: 'anonym' } | { status: 'angemeldet'; user: UserOutput }

type AuthView = 'login' | 'register'

type SessionView = { view: 'liste' } | { view: 'raum'; sessionId: string }

const SERVER_UNREACHABLE_MESSAGE = 'Der Server ist nicht erreichbar.'

function logoutFailureMessage(error: unknown): string {
  const cause = error instanceof Error ? error.message : String(error)
  return `Abmelden fehlgeschlagen: ${cause}`
}

export function App() {
  const [state, setState] = useState<AuthState>({ status: 'unbekannt' })
  const [view, setView] = useState<AuthView>('login')
  // Fehler, die keine Antwort des Servers sind (Netzfehler, kaputte Antwortform) - kommt hier
  // eine Antwort an, entscheidet der Server (constitution.md §9.1); scheitert die Anfrage
  // selbst, bleibt nur dieser Hinweis (design.md D4). Traegt nach `session:ended` auch den
  // entsprechenden Hinweis der Sitzungsliste (Requirement "Sitzungsoberflaeche").
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [sessionView, setSessionView] = useState<SessionView>({ view: 'liste' })

  useEffect(() => {
    let cancelled = false
    fetchCurrentUser()
      .then((user) => {
        if (cancelled) {
          return
        }
        setState(user ? { status: 'angemeldet', user } : { status: 'anonym' })
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        // Keine Antwort des Servers - "angemeldet" waere hier eine unbelegte Behauptung,
        // "anonym" die einzige ehrliche Wahl (§9.1); der Hinweis erklaert dem Besucher, warum
        // er trotz vorhandener Sitzung ein Formular sieht (design.md D4).
        console.error(error)
        setHinweis(SERVER_UNREACHABLE_MESSAGE)
        setState({ status: 'anonym' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleAuthenticated = (user: UserOutput) => {
    setHinweis(null)
    setState({ status: 'angemeldet', user })
  }

  const handleLogout = async () => {
    // Der Server entscheidet, ob abgemeldet wurde (constitution.md §9.1) - scheitert die
    // Anfrage, lebt die Sitzung serverseitig weiter; der Client fragt dann den tatsaechlichen
    // Stand erneut ab, statt sich selbst als abgemeldet zu erklaeren (Review-Runde 2). Wirft
    // einer der beiden Aufrufe (kein Netz, kaputte Antwort), bleibt der Zustand unveraendert
    // und ein Hinweis zeigt den Fehler (design.md D4).
    try {
      const success = await logout()
      if (success) {
        setState({ status: 'anonym' })
        setSessionView({ view: 'liste' })
        return
      }
      const user = await fetchCurrentUser()
      setState(user ? { status: 'angemeldet', user } : { status: 'anonym' })
    } catch (error) {
      console.error(error)
      setHinweis(logoutFailureMessage(error))
    }
  }

  if (state.status === 'unbekannt') {
    return <p>Lädt …</p>
  }

  if (state.status === 'angemeldet') {
    if (sessionView.view === 'raum') {
      return (
        <SessionRoom
          sessionId={sessionView.sessionId}
          onLeave={() => setSessionView({ view: 'liste' })}
          onEnded={(message) => {
            setHinweis(message)
            setSessionView({ view: 'liste' })
          }}
        />
      )
    }
    return (
      <SessionList
        user={state.user}
        hinweis={hinweis}
        onEnter={(sessionId) => {
          setHinweis(null)
          setSessionView({ view: 'raum', sessionId })
        }}
        onLogout={() => void handleLogout()}
      />
    )
  }

  return (
    <div>
      {hinweis !== null && <p role="alert">{hinweis}</p>}
      {view === 'login' ? (
        <LoginForm onSuccess={handleAuthenticated} onSwitchToRegister={() => setView('register')} />
      ) : (
        <RegisterForm onSuccess={handleAuthenticated} onSwitchToLogin={() => setView('login')} />
      )}
    </div>
  )
}
