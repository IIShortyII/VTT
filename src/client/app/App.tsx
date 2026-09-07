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

export function App() {
  const [state, setState] = useState<AuthState>({ status: 'unbekannt' })
  const [view, setView] = useState<AuthView>('login')

  useEffect(() => {
    let cancelled = false
    void fetchCurrentUser().then((user) => {
      if (cancelled) {
        return
      }
      setState(user ? { status: 'angemeldet', user } : { status: 'anonym' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleAuthenticated = (user: UserOutput) => {
    setState({ status: 'angemeldet', user })
  }

  const handleLogout = async () => {
    // Der Server entscheidet, ob abgemeldet wurde (constitution.md §9.1) - scheitert die
    // Anfrage, lebt die Sitzung serverseitig weiter; der Client fragt dann den tatsaechlichen
    // Stand erneut ab, statt sich selbst als abgemeldet zu erklaeren (Review-Runde 2).
    const success = await logout()
    if (success) {
      setState({ status: 'anonym' })
      return
    }
    const user = await fetchCurrentUser()
    setState(user ? { status: 'angemeldet', user } : { status: 'anonym' })
  }

  if (state.status === 'unbekannt') {
    return <p>Lädt …</p>
  }

  if (state.status === 'angemeldet') {
    return (
      <div>
        <p>Angemeldet als {state.user.email}</p>
        <button type="button" onClick={() => void handleLogout()}>
          Abmelden
        </button>
      </div>
    )
  }

  return view === 'login' ? (
    <LoginForm onSuccess={handleAuthenticated} onSwitchToRegister={() => setView('register')} />
  ) : (
    <RegisterForm onSuccess={handleAuthenticated} onSwitchToLogin={() => setView('login')} />
  )
}
