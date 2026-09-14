import { useEffect, useRef, useState } from 'react'

import type { UserOutput } from '../../shared/auth.js'
import { fetchCurrentUser, logout } from '../auth/api.js'
import { ChangePasswordForm } from '../auth/ChangePasswordForm.js'
import { LoginForm } from '../auth/LoginForm.js'
import { RegisterForm } from '../auth/RegisterForm.js'
import { syncLocale, useT } from '../i18n/locale.js'
import { MapLibrary } from '../map/MapLibrary.js'
import { SessionList } from '../session/SessionList.js'
import { SessionRoom } from '../session/SessionRoom.js'
import { ConfirmProvider } from '../ui/confirm.js'
import { Modal } from '../ui/Modal.js'
import { ToastProvider } from '../ui/toast.js'
import { AppShell } from './AppShell.js'
import { FALLBACK_BUILD, type BuildInfo } from './build-info.js'
import { Hero } from './Hero.js'

// Kein Router: der Auth-Zustand entscheidet, welche Ansicht erscheint (design.md D7/D10).
// "unbekannt" ist kein Detail, sondern verhindert, dass beim Reload fuer einen Moment das
// Loginformular aufblitzt. Innerhalb der angemeldeten Ansicht entscheidet `sessionView`
// zwischen Sitzungsliste, Raumansicht und Kartenbibliothek (design.md D9, map-library #49) -
// kein Router (design.md D10, Non-Goal "kein Router").
// ui-text (#87, design.md D6): die Rohstrings dieser Datei (Ladehinweis, nicht erreichbarer
// Server, Abmeldefehler, anonymer Hero) laufen jetzt ueber `t(...)`. `logoutFailureMessage`
// wird zu `t('app.logoutFailed', { cause })` an der Verwendungsstelle, damit die Meldung die
// aktive Sprache zum Zeitpunkt des Fehlers traegt (design.md D1). Der gespeicherte Hinweis
// (`hinweis`) wird beim Umschalten nicht neu uebersetzt (design.md "Risks") - hinnehmbar, die
// naechste Aktion erzeugt ihn in der neuen Sprache.
// ui-feedback (#88, design.md D2): `App` wird vom Toast-Provider umschlossen - der Host steht
// als Geschwister nach dem `<footer>`, damit jede Ansicht auslösen kann.
// ui-dialog (#89, design.md D4): `App` ist zusaetzlich vom `ConfirmProvider` umschlossen
// (innerhalb des Toast-Providers) - der Bestaetigungsdialog steht damit als Geschwister nach
// dem `<footer>` und vor dem Toast-Host, ausserhalb von `main`.
// ui-status (#91, design.md D4): `SessionRoom` ruft `onEnded` nicht mehr mit einer Meldung auf
// - der Hinweis der Liste kommt aus `t('session.ended.hint')`, buchstabengleich dem bisherigen
// Text. `onLeave` fuehrt (wie bisher nur `onEnded`) zur Sitzungsliste, ausgeloest durch den
// Ersetzt-Dialog ("Zur Übersicht", Esc, `Schließen`).
// ui-menu (#92, design.md D8): das Passwort-Formular liegt jetzt in einem Modal, erreichbar
// ueber das Kontomenue der Shell (`AppShellProps.onChangePassword`) statt eines `<details>` in
// der Sitzungsliste; `passwordOpen` steuert das Modal, `ChangePasswordForm.onSuccess` schliesst
// es nach einem Erfolg.
// session-bar (#93, design.md D6): `SessionRoom` bekommt `onOpenLibrary` - denselben Setter
// wie `onOpenLibrary` der Sitzungsliste - fuer den Menueeintrag `Kartenbibliothek` der Bar.
// session-tabs (#94, design.md D6): `AppShell` bekommt `wide={sessionView.view === 'raum'}` im
// angemeldeten Zweig - die Raumansicht sprengt die Inhaltsspalte (`session-tabs`, "Stylesheet
// der Bereiche"); jede andere Ansicht (auch anonym) laesst die Prop weg.
// add-session-leave (#70, design.md D5): `SessionRoom` bekommt zusaetzlich `onRemoved` - nach
// demselben Muster wie `onEnded` (Hinweis setzen, zur Liste zurueck), aber mit dem Hinweis
// `t('session.removed')` statt `t('session.ended.hint')`.
type AuthState = { status: 'unbekannt' } | { status: 'anonym' } | { status: 'angemeldet'; user: UserOutput }

type AuthView = 'login' | 'register'

type SessionView = { view: 'liste' } | { view: 'raum'; sessionId: string } | { view: 'bibliothek' }

export interface AppProps {
  build?: BuildInfo
}

export function App({ build = FALLBACK_BUILD }: AppProps) {
  // ui-text (#87, Nacharbeit Runde 1, Requirement "Sprachwahl"): eine gespeicherte Wahl SHALL
  // beim *Start der Anwendung* gelten - das ist der Mount von `App`, nicht (nur) der Import
  // des Moduls `i18n/locale.ts` (design.md D1 liest den Speicher beim Laden des Moduls, das
  // aber nur einmal pro Prozess geschieht). Ein `useRef`-Waechter gleicht die aktive Sprache
  // deshalb genau einmal beim allerersten Rendern erneut mit dem Speicher ab, bevor `useT()`
  // (unten) die Sprache abonniert oder irgendein Text nachgeschlagen wird - so liest die erste
  // `useSyncExternalStore`-Momentaufnahme bereits den abgeglichenen Stand, statt ihn erst nach
  // dem Lesen zu aendern.
  const syncedLocaleRef = useRef(false)
  if (!syncedLocaleRef.current) {
    syncedLocaleRef.current = true
    syncLocale()
  }
  const t = useT()
  const [state, setState] = useState<AuthState>({ status: 'unbekannt' })
  const [view, setView] = useState<AuthView>('login')
  // Fehler, die keine Antwort des Servers sind (Netzfehler, kaputte Antwortform) - kommt hier
  // eine Antwort an, entscheidet der Server (constitution.md §9.1); scheitert die Anfrage
  // selbst, bleibt nur dieser Hinweis (design.md D4). Traegt nach `session:ended` auch den
  // entsprechenden Hinweis der Sitzungsliste (Requirement "Sitzungsoberflaeche"). Wird von der
  // Shell gezeigt (ui-shell #84, design.md D3), nicht mehr von einer einzelnen Ansicht.
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [sessionView, setSessionView] = useState<SessionView>({ view: 'liste' })
  // ui-menu (#92, design.md D8): Startwert `false` - das Modal steht ausserhalb jeder Ansicht,
  // damit es aus jeder angemeldeten Ansicht ueber das Kontomenue erreichbar ist.
  const [passwordOpen, setPasswordOpen] = useState(false)

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
        setHinweis(t('app.serverUnreachable'))
        setState({ status: 'anonym' })
      })
    return () => {
      cancelled = true
    }
  }, [t])

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
      const cause = error instanceof Error ? error.message : String(error)
      setHinweis(t('app.logoutFailed', { cause }))
    }
  }

  // Ein Zurueck-Pfad, ausschliesslich in der Top-Bar (ui-shell #84, design.md D3): fuehrt aus
  // Raum und Bibliothek zur Sitzungsliste. `canGoBack` ist nur in einer Unteransicht wahr - die
  // Sitzungsliste selbst und jede Ansicht eines nicht angemeldeten Besuchers zeigen keine
  // Schaltflaeche `Zurueck`.
  const canGoBack = state.status === 'angemeldet' && sessionView.view !== 'liste'
  const onBack = () => setSessionView({ view: 'liste' })
  const account = state.status === 'angemeldet' ? { username: state.user.username } : null
  // session-tabs (#94, design.md D6): nur die Raumansicht eines angemeldeten Nutzers sprengt
  // die Inhaltsspalte - anonym oder in Liste/Bibliothek bleibt die Shell bei 55 rem.
  const wide = state.status === 'angemeldet' && sessionView.view === 'raum'

  let content
  if (state.status === 'unbekannt') {
    content = <p>{t('app.loading')}</p>
  } else if (state.status === 'angemeldet') {
    if (sessionView.view === 'raum') {
      content = (
        <SessionRoom
          sessionId={sessionView.sessionId}
          currentUserId={state.user.id}
          onEnded={() => {
            setHinweis(t('session.ended.hint'))
            setSessionView({ view: 'liste' })
          }}
          onLeave={() => setSessionView({ view: 'liste' })}
          onRemoved={() => {
            setHinweis(t('session.removed'))
            setSessionView({ view: 'liste' })
          }}
          onOpenLibrary={() => setSessionView({ view: 'bibliothek' })}
        />
      )
    } else if (sessionView.view === 'bibliothek') {
      content = <MapLibrary />
    } else {
      content = (
        <SessionList
          onEnter={(sessionId) => {
            setHinweis(null)
            setSessionView({ view: 'raum', sessionId })
          }}
          onOpenLibrary={() => setSessionView({ view: 'bibliothek' })}
        />
      )
    }
  } else {
    // Anonyme Startansicht (add-start-view #86, design.md D2): der Hero traegt hier die
    // einzige Ueberschrift der Ebene 1 - Anmelde- und Registrierungsformular bekommen nur
    // noch eine `<h2>`.
    content = (
      <>
        <Hero title={t('hero.anonymous.title')} subline={t('hero.anonymous.subline')} />
        <div className="panel auth-panel">
          {view === 'login' ? (
            <LoginForm onSuccess={handleAuthenticated} onSwitchToRegister={() => setView('register')} />
          ) : (
            <RegisterForm onSuccess={handleAuthenticated} onSwitchToLogin={() => setView('login')} />
          )}
        </div>
      </>
    )
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell
          canGoBack={canGoBack}
          onBack={onBack}
          account={account}
          onLogout={() => void handleLogout()}
          onChangePassword={() => setPasswordOpen(true)}
          hinweis={hinweis}
          build={build}
          wide={wide}
        >
          {content}
          {passwordOpen && (
            <Modal title={t('shell.changePassword')} onClose={() => setPasswordOpen(false)}>
              <ChangePasswordForm onSuccess={() => setPasswordOpen(false)} />
            </Modal>
          )}
        </AppShell>
      </ConfirmProvider>
    </ToastProvider>
  )
}
