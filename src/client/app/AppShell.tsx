import type { ReactNode } from 'react'

import type { BuildInfo } from './build-info.js'
import { LocaleSwitch } from './LocaleSwitch.js'
import { useT } from '../i18n/locale.js'
import { Icon } from '../ui/Icon.js'
import { ActionMenuButton } from '../ui/menu.js'

// Gemeinsame Huelle um alle Ansichten (ui-shell #84, design.md D1/D7). Reine
// Praesentationsschicht ohne eigenen Serverzustand oder Effekte - `App` entscheidet, was in
// `children` steht, `AppShell` weiss nichts von Auth-Zustand oder `SessionView` (Goals "Eine
// Komponente ist die Huelle"). Importiert absichtlich nur `react`, `build-info.ts`, `Icon`,
// `LocaleSwitch`, `../ui/menu.js` und `../i18n/locale.js` (design.md D7/D9, ui-menu #92
// design.md D8) - keine Ansicht importiert diese Datei.
// ui-text (#87, design.md D5): die rechte Zone ist jetzt ein Wrapper (`.app-shell-tools`), der
// Konto und Sprachschalter traegt; der Schalter ist in jeder Ansicht gerendert, auch anonym.
// ui-menu (#92, design.md D8): das Konto ist jetzt eine Menü-Schaltfläche (`ActionMenuButton`,
// Variante `text`) mit dem Nutzernamen als Namen statt Nutzername-Text plus `Abmelden`-Knopf;
// `Passwort ändern` öffnet das Modal aus `user-auth` über die neue Prop `onChangePassword`.
// session-tabs (#94, design.md D6): die neue Prop `wide` (Standard `false`) haengt in der
// Raumansicht die Klasse `app-shell--wide` an - sie hebt die Breitenbegrenzung der
// Inhaltsspalte auf (`session-tabs`, "Stylesheet der Bereiche"), damit die Kartenbuehne den
// vollen Desktop-Monitor nutzt. Jede andere Ansicht laesst die Prop weg (`App.tsx`).

export interface AppShellProps {
  canGoBack: boolean
  onBack: () => void
  account: { username: string } | null
  onLogout: () => void
  onChangePassword: () => void
  hinweis: string | null
  build: BuildInfo
  wide?: boolean
  children: ReactNode
}

export function AppShell({ canGoBack, onBack, account, onLogout, onChangePassword, hinweis, build, wide = false, children }: AppShellProps) {
  const t = useT()
  return (
    <>
      <header className="app-shell-topbar">
        {canGoBack && (
          // `autoFocus` zieht beim Einhaengen den Fokus auf diese Schaltflaeche - sie ist das
          // erste Kind des Headers, der wiederum vor `<main>` steht, also das erste
          // fokussierbare Element im Dokument (design.md D1, Requirement "Top-Bar"). Das
          // Chevron ist ein dekoratives Icon aus der Registry statt eines Textzeichens
          // (add-start-view #86, design.md D6) - der zugaengliche Name bleibt "Zurück".
          <button type="button" className="link app-shell-back" autoFocus onClick={onBack}>
            <Icon name="back" /> {t('shell.back')}
          </button>
        )}
        <span className="app-shell-brand">
          <span aria-hidden="true">◆</span>
          <span>VTT</span>
        </span>
        <div className="app-shell-tools">
          {account && (
            <div className="app-shell-account">
              <ActionMenuButton
                variant="text"
                label={account.username}
                entries={[
                  { id: 'password', label: t('shell.changePassword'), icon: 'lock', onSelect: onChangePassword },
                  { id: 'logout', label: t('shell.logout'), icon: 'logout', onSelect: onLogout },
                ]}
              />
            </div>
          )}
          <LocaleSwitch />
        </div>
      </header>
      <main className={wide ? 'app-shell app-shell--wide' : 'app-shell'}>
        {hinweis !== null && (
          <p role="alert" className="app-shell-hinweis">
            {hinweis}
          </p>
        )}
        {children}
      </main>
      <footer className="app-shell-footer">{t('shell.footer', { version: build.version, sha: build.sha })}</footer>
    </>
  )
}
