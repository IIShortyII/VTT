import { useEffect, useState } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import { fetchCurrentUser, logout } from '../auth/api.js'
import { LoginForm } from '../auth/LoginForm.js'
import { RegisterForm } from '../auth/RegisterForm.js'

// Kein Router: der Auth-Zustand entscheidet, welche Ansicht erscheint (design.md D7). Drei
// Zustaende - "unbekannt" ist kein Detail, sondern verhindert, dass beim Reload fuer einen
// Moment das Loginformular aufblitzt.
type AuthState = { status: 'unbekannt' } | { status: 'anonym' } | { status: 'angemeldet'; user: UserOutput }

type AuthView = 'login' | 'register'

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
  // selbst, bleibt nur dieser Hinweis (design.md D4).
  const [hinweis, setHinweis] = useState<string | null>(null)

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
    return (
      <div>
        <p>Angemeldet als {state.user.email}</p>
        {hinweis !== null && <p role="alert">{hinweis}</p>}
        <button type="button" onClick={() => void handleLogout()}>
          Abmelden
        </button>
      </div>
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
