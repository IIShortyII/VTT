import type { ReactNode } from 'react'

import type { BuildInfo } from './build-info.js'

// Gemeinsame Huelle um alle Ansichten (ui-shell #84, design.md D1/D7). Reine
// Praesentationsschicht ohne eigenen Serverzustand oder Effekte - `App` entscheidet, was in
// `children` steht, `AppShell` weiss nichts von Auth-Zustand oder `SessionView` (Goals "Eine
// Komponente ist die Huelle"). Importiert absichtlich nur `react` und `build-info.ts`
// (design.md D7) - keine Ansicht importiert diese Datei.

export interface AppShellProps {
  canGoBack: boolean
  onBack: () => void
  account: { username: string } | null
  onLogout: () => void
  hinweis: string | null
  build: BuildInfo
  children: ReactNode
}

export function AppShell({ canGoBack, onBack, account, onLogout, hinweis, build, children }: AppShellProps) {
  return (
    <>
      <header className="app-shell-topbar">
        {canGoBack && (
          // `autoFocus` zieht beim Einhaengen den Fokus auf diese Schaltflaeche - sie ist das
          // erste Kind des Headers, der wiederum vor `<main>` steht, also das erste
          // fokussierbare Element im Dokument (design.md D1, Requirement "Top-Bar").
          <button type="button" className="link app-shell-back" autoFocus onClick={onBack}>
            <span aria-hidden="true">‹</span> Zurück
          </button>
        )}
        <span className="app-shell-brand">
          <span aria-hidden="true">◆</span>
          <span>VTT</span>
        </span>
        {account && (
          <div className="app-shell-account">
            <span>{account.username}</span>
            <button type="button" className="link" onClick={onLogout}>
              Abmelden
            </button>
          </div>
        )}
      </header>
      <main className="app-shell">
        {hinweis !== null && (
          <p role="alert" className="app-shell-hinweis">
            {hinweis}
          </p>
        )}
        {children}
      </main>
      <footer className="app-shell-footer">
        Version {build.version} · Build {build.sha}
      </footer>
    </>
  )
}
