## Context

Vorhanden: `AppShell` (`ui-shell`) mit Top-Bar (`Zurück`, Marke, Konto mit `Abmelden`),
Hinweis und Footer `Version {version} · Build {sha}`; `Hero` (`ui-start`) mit Overline
`Deine Runde`; `App.tsx` mit anonymem Hero und Ladehinweis; `LoginForm`, `RegisterForm`,
`ChangePasswordForm` mit Modulkonstanten für Fehlermeldungen; `SessionList` mit Hero,
Aufklapp-Formularen, Sitzungskarten, Leerzustand und `<details>`; `session-status.ts` mit
`SESSION_STATUS_PRESENTATION` (`label: string`, `icon`, `modifier`) und `ROLE_LABELS`;
`SessionRoom` rendert `<p>Zustand: {state.sessionStatus}</p>` und die Übergangs-Schaltflächen
mit dem Aktionsnamen (`allowedActions(status)` aus `shared/session.ts`, Werte `oeffnen`,
`starten`, `pausieren`, `beenden`). `theme.css` (`ui-theme`) liefert `.status-pill` mit
Varianten, `button.link`, `button:disabled { opacity: 0.5 }`, die Shell-Selektoren
(`.app-shell-topbar` als Grid mit drei Spalten, `.app-shell-account` in Spalte 3) und den
Format-Vertrag (D7 von `ui-theme`: kein Farbwert außerhalb `:root`, `@media` nur für
Bewegung). `index.html` trägt statisch `lang="de"`. Es gibt keinen Router; `App` hält
Auth- und Ansichtszustand.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/ui-text/spec.md` und die MODIFIED-Deltas zu `game-session`, `ui-shell`, `ui-start`.
Bindend und nicht wiederholt: `constitution.md` §9 — die Sprache ist eine Darstellung des
Clients; Zustand, Rolle und erlaubte Übergänge kommen weiterhin ausschließlich vom Server.

## Goals / Non-Goals

**Goals:**
- **Ein Modul, drei Funktionen.** `getLocale`/`setLocale`/`t` in `locale.ts`; ein Hook
  `useT` für Komponenten. Kein Provider, kein Kontext, keine Bibliothek.
- **Compile-Zeit-Vollständigkeit.** `de` definiert die Schlüssel (`as const`), `en` ist
  `Record<TextKey, string>` als Objektliteral — fehlende und überzählige Schlüssel sind
  Typfehler. Der Laufzeit-Test der Spec ist die zweite Sicherung.
- **Buchstabengleich unter Deutsch.** Jeder deutsche Wörterbucheintrag ist der heutige
  Text; Adressen (Rollen, Namen, `name`-Attribute, Klassen) bleiben. Nur die in den
  Deltas genannten Szenarien ändern ihre Anker.
- **Tabellen statt `if`.** Zustand → Schlüssel, Rolle → Schlüssel, Aktion → Schlüssel sind
  `Record<…, TextKey>`; der Typecheck wird rot, sobald `shared/session.ts` einen Wert
  bekommt, den die Tabelle nicht kennt.

**Non-Goals:**
- Keine Übersetzung der Servertexte (Folge-Issue #109), des Zustandskatalogs
  (`conditions.ts`, Daten), der Panels der Raumansicht (Teilnehmer, Alias, Karte, Tokens,
  Fog, Anmerkungen, `Lädt …`/`Hier weiterspielen` im Raum) oder der Kartenbibliothek —
  diese Texte bleiben Rohstrings bis Epic C/D.
- Keine Icons auf den Übergangs-Schaltflächen (kommt mit #93 Session-Bar).
- Keine Änderung an `index.html`, Server, `shared/`, Prisma.
- Keine Pluralisierung, keine Datums-/Zahlenformate.

## Decisions

### D1 — Modul `src/client/i18n/locale.ts`

```ts
import { useSyncExternalStore } from 'react'
import { de, type TextKey } from './de.js'
import { en } from './en.js'

export const LOCALES = ['de', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'de'
export const LOCALE_STORAGE_KEY = 'vtt.locale'

const dictionaries: Record<Locale, Record<TextKey, string>> = { de, en }
```

- **Zustand:** eine Modulvariable `current: Locale`, beim Laden des Moduls aus dem Speicher
  gelesen: `readStoredLocale()` liest `localStorage.getItem(LOCALE_STORAGE_KEY)` in
  `try/catch`; ist der Wert `de` oder `en`, gilt er, sonst `DEFAULT_LOCALE`. Ein
  geworfener Zugriff (kein `window`, Speicher gesperrt) liefert `DEFAULT_LOCALE`. Danach
  `applyLang(current)`.
- `getLocale(): Locale` liefert `current`.
- `setLocale(locale: Locale): void` setzt `current`, schreibt `localStorage.setItem(
  LOCALE_STORAGE_KEY, locale)` in `try/catch` (ein Fehler wird ignoriert — die Wahl gilt für
  die laufende Seite), ruft `applyLang(locale)` und benachrichtigt alle Abonnenten. Gleiche
  Sprache wie bisher: kein Schreiben, keine Benachrichtigung.
- `applyLang(locale)` setzt `document.documentElement.lang = locale`, wenn `document`
  existiert.
- `subscribe(listener: () => void): () => void` — Menge von Listenern, Rückgabe entfernt.
- `t(key: TextKey, params?: Record<string, string | number>): string` liest
  `dictionaries[current][key]` und ersetzt jedes `{name}` per
  `replace(/\{(\w+)\}/g, …)` durch `String(params[name])`, wenn `name` in `params` liegt;
  sonst bleibt der Platzhalter stehen.
- `useLocale(): Locale` = `useSyncExternalStore(subscribe, getLocale, getLocale)`.
- `useT()` ruft `useLocale()` (Abonnement, Neu-Render beim Umschalten) und gibt `t` zurück.
  Komponenten: `const t = useT()` — so bleibt kein ungenutztes `locale`.

Nicht-React-Module (heute: keines im Umfang — die `GENERIC_*`-Konstanten liegen in
Komponenten) rufen `t` direkt; Modulkonstanten mit Text werden zu Aufrufen an der
Verwendungsstelle (`setError(t('auth.login.failed'))`), damit sie die aktive Sprache zum
Zeitpunkt des Fehlers tragen. `logoutFailureMessage` in `App.tsx` wird zu
`t('app.logoutFailed', { cause })`.

Alternative React-Kontext: verworfen (proposal.md) — außerhalb von React kein `t`, jeder
Test bräuchte einen Provider.

### D2 — Wörterbücher (`src/client/i18n/de.ts`, `src/client/i18n/en.ts`)

`de.ts`:
```ts
export const de = { /* Tabelle unten, Spalte Deutsch */ } as const
export type TextKey = keyof typeof de
```
`en.ts`:
```ts
import type { TextKey } from './de.js'
export const en: Record<TextKey, string> = { /* Spalte Englisch */ }
```

Schlüssel, Texte (verbindlich, buchstabengleich — Deutsch ist der heutige Text):

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `shell.back` | Zurück | Back |
| `shell.logout` | Abmelden | Log out |
| `shell.language` | Sprache | Language |
| `shell.footer` | Version {version} · Build {sha} | Version {version} · Build {sha} |
| `app.loading` | Lädt … | Loading … |
| `app.serverUnreachable` | Der Server ist nicht erreichbar. | The server cannot be reached. |
| `app.logoutFailed` | Abmelden fehlgeschlagen: {cause} | Logout failed: {cause} |
| `hero.overline` | Deine Runde | Your party |
| `hero.anonymous.title` | Karten, Tokens, Nebel | Maps, tokens, fog |
| `hero.anonymous.subline` | Leite deine Runde am virtuellen Tisch oder tritt einer bei. | Run your game at the virtual table or join one. |
| `auth.login.title` | Anmelden | Sign in |
| `auth.login.email` | E-Mail | Email |
| `auth.login.password` | Passwort | Password |
| `auth.login.submit` | Anmelden | Sign in |
| `auth.login.toRegister` | Noch kein Konto? Registrieren | No account yet? Register |
| `auth.login.failed` | Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut. | Sign-in failed. Please try again. |
| `auth.register.title` | Registrierung | Registration |
| `auth.register.username` | Nutzername | Username |
| `auth.register.email` | E-Mail | Email |
| `auth.register.password` | Passwort | Password |
| `auth.register.submit` | Registrieren | Register |
| `auth.register.toLogin` | Ich habe schon ein Konto | I already have an account |
| `auth.register.failed` | Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut. | Registration failed. Please try again. |
| `auth.password.current` | Bisheriges Passwort | Current password |
| `auth.password.new` | Neues Passwort | New password |
| `auth.password.submit` | Passwort ändern | Change password |
| `auth.password.changed` | Passwort geändert. | Password changed. |
| `auth.password.failed` | Die Passwortänderung ist fehlgeschlagen. Bitte versuche es erneut. | Password change failed. Please try again. |
| `start.title` | Meine Spielsitzungen | My game sessions |
| `start.subline` | Leite eine Sitzung oder tritt mit einem Code bei. | Run a session or join one with a code. |
| `start.actions.lead` | Sitzung leiten | Run a session |
| `start.actions.join` | Beitreten | Join |
| `start.actions.library` | Kartenbibliothek | Map library |
| `start.create.title` | Neue Spielsitzung | New game session |
| `start.create.name` | Name | Name |
| `start.create.submit` | Erstellen | Create |
| `start.join.title` | Spielsitzung beitreten | Join a game session |
| `start.join.code` | Sitzungscode | Session code |
| `start.join.submit` | Beitreten | Join |
| `start.cancel` | Abbrechen | Cancel |
| `start.list` | Meine Spielsitzungen | My game sessions |
| `start.enter` | Betreten | Enter |
| `start.empty.title` | Noch keine Sitzungen | No sessions yet |
| `start.empty.hint` | Erstelle eine Sitzung oder tritt mit einem Code bei. | Create a session or join one with a code. |
| `start.account.password` | Passwort ändern | Change password |
| `start.loadFailed` | Die Spielsitzungen konnten nicht geladen werden. | The game sessions could not be loaded. |
| `start.createFailed` | Die Spielsitzung konnte nicht erstellt werden. Bitte versuche es erneut. | The game session could not be created. Please try again. |
| `start.joinFailed` | Der Beitritt ist fehlgeschlagen. Bitte versuche es erneut. | Joining failed. Please try again. |
| `session.status.active` | Läuft | Running |
| `session.status.paused` | Pausiert | Paused |
| `session.status.open` | Geöffnet | Open |
| `session.status.ended` | Geschlossen | Closed |
| `session.role.gm` | Spielleiter | Game master |
| `session.role.player` | Spieler | Player |
| `session.action.open` | Öffnen | Open |
| `session.action.start` | Starten | Start |
| `session.action.pause` | Pausieren | Pause |
| `session.action.end` | Beenden | End |

Nicht übersetzt (Daten bzw. Eigennamen): Marke `VTT`, Nutzername, Sitzungsname,
Sitzungscode, Alias, Servermeldungen (`result.message`), die zugänglichen Namen der
Schalter-Schaltflächen (`Deutsch`, `English` — jede in ihrer eigenen Sprache) und deren
Texte `DE`/`EN`.

### D3 — Zuordnungstabellen (`src/client/session/session-status.ts`)

```ts
export interface StatusPresentation {
  label: TextKey
  icon: IconName
  modifier: 'status-pill--active' | 'status-pill--paused' | 'status-pill--ended' | null
}
export const SESSION_STATUS_PRESENTATION: Record<GameSessionStatus, StatusPresentation> = {
  gestartet: { label: 'session.status.active', icon: 'start', modifier: 'status-pill--active' },
  pausiert: { label: 'session.status.paused', icon: 'pause', modifier: 'status-pill--paused' },
  geoeffnet: { label: 'session.status.open', icon: 'players', modifier: null },
  geschlossen: { label: 'session.status.ended', icon: 'lock', modifier: 'status-pill--ended' },
}
export const ROLE_LABELS: Record<MemberRole, TextKey> = { spielleiter: 'session.role.gm', spieler: 'session.role.player' }
export const TRANSITION_LABELS: Record<TransitionAction, TextKey> = {
  oeffnen: 'session.action.open', starten: 'session.action.start',
  pausieren: 'session.action.pause', beenden: 'session.action.end',
}
```

Die Datei importiert nur Typen (`TextKey` aus `../i18n/de.js`, `IconName`, die Typen aus
`shared/session.js`) — kein Laufzeitimport, damit sie weiterhin frei von Pixi und React
bleibt. Aufrufer schlagen nach: `t(status.label)`, `t(ROLE_LABELS[role])`,
`t(TRANSITION_LABELS[action])`.

### D4 — Sprachschalter (`src/client/app/LocaleSwitch.tsx`, neu)

Markup (verbindlich):

```
<div className="app-shell-locale" role="group" aria-label={t('shell.language')}>
  <button type="button" className="link" lang="de" aria-label="Deutsch"
          disabled={locale === 'de'} aria-current={locale === 'de' ? 'true' : undefined}
          onClick={() => setLocale('de')}>DE</button>
  <button type="button" className="link" lang="en" aria-label="English"
          disabled={locale === 'en'} aria-current={locale === 'en' ? 'true' : undefined}
          onClick={() => setLocale('en')}>EN</button>
</div>
```

`locale` kommt aus `useLocale()`, `t` aus `useT()`. Genau zwei Schaltflächen, Reihenfolge
DE, EN. `aria-current` fehlt bei der inaktiven Sprache ganz (kein `aria-current="false"`).
Die Komponente importiert nur `react` und `../i18n/locale.js`.

Warum `disabled` statt `aria-pressed`: Vorgabe des Issues (#87) — die aktive Sprache ist
nicht erneut wählbar; `aria-current="true"` macht die Markierung für Screenreader lesbar,
Gold macht sie sichtbar (D7), der Text `DE`/`EN` und `disabled` machen sie auch ohne Farbe
erkennbar (#101: nie Farbe allein).

### D5 — Shell (`AppShell.tsx`)

Die rechte Zone wird ein Wrapper, der Konto und Schalter trägt:

```
<header className="app-shell-topbar">
  {canGoBack && <button type="button" className="link app-shell-back" autoFocus onClick={onBack}><Icon name="back" /> {t('shell.back')}</button>}
  <span className="app-shell-brand"><span aria-hidden="true">◆</span><span>VTT</span></span>
  <div className="app-shell-tools">
    {account && (
      <div className="app-shell-account">
        <span>{account.username}</span>
        <button type="button" className="link" onClick={onLogout}>{t('shell.logout')}</button>
      </div>
    )}
    <LocaleSwitch />
  </div>
</header>
<main className="app-shell">…unverändert…</main>
<footer className="app-shell-footer">{t('shell.footer', { version: build.version, sha: build.sha })}</footer>
```

Der Footer-Text bleibt `Version 0.0.0-dev · Build dev` in beiden Sprachen. `AppShell`
importiert zusätzlich `./LocaleSwitch.js` und `../i18n/locale.js`; die Regel „keine
Ansicht importiert die Shell" (ui-shell D7) bleibt. Der Wrapper ist in jeder Ansicht
gerendert, auch anonym (dann nur mit dem Schalter).

### D6 — Ansichten im Umfang

Jede sichtbare Beschriftung wird durch `t('<schlüssel>')` aus D2 ersetzt; Struktur,
Rollen, `name`-Attribute, `id`s, Klassen und Verhalten bleiben. Konkret:

- **`Hero.tsx`:** Overline `{t('hero.overline')}`; `title`/`subline` bleiben Props (die
  Aufrufer übergeben nachgeschlagene Texte). `Hero` importiert jetzt auch
  `../i18n/locale.js`.
- **`App.tsx`:** `Lädt …` → `t('app.loading')`; `SERVER_UNREACHABLE_MESSAGE` →
  `t('app.serverUnreachable')` an der Setzstelle; `logoutFailureMessage(error)` →
  `t('app.logoutFailed', { cause })`; anonymer Hero mit `t('hero.anonymous.title')` /
  `t('hero.anonymous.subline')`. Der Hinweis (`hinweis`) bleibt ein gespeicherter String —
  er wird beim Umschalten nicht neu übersetzt (Trade-off, siehe Risks).
- **`LoginForm.tsx`, `RegisterForm.tsx`, `ChangePasswordForm.tsx`:** Überschrift, Labels,
  Schaltflächen und die `GENERIC_*`/`SUCCESS_MESSAGE`-Konstanten über die Schlüssel
  `auth.*`; die Konstanten entfallen, der Aufruf steht im `catch` bzw. Erfolgszweig.
- **`SessionList.tsx`:** Hero-Texte, drei Aktionen, beide Formulare (Überschrift, Label,
  Absenden, `Abbrechen`), Leerzustand, `aria-label` der Liste (`start.list`), `Betreten`,
  Summary `Passwort ändern`, `LOAD_FAILURE`/`GENERIC_CREATE`/`GENERIC_JOIN` über `start.*`.
  Karten: `t(status.label)` und `t(ROLE_LABELS[session.role])`.
- **`SessionRoom.tsx`** (nur zwei Stellen, sonst unverändert):
  - `<p>Zustand: {state.sessionStatus}</p>` wird
    ```
    <p className="session-room-status">
      <span className={status.modifier ? `status-pill ${status.modifier}` : 'status-pill'}>
        <Icon name={status.icon} /> {t(status.label)}
      </span>
    </p>
    ```
    mit `status = SESSION_STATUS_PRESENTATION[state.sessionStatus]`. Kein Textknoten trägt
    den Rohwert. `SessionRoom` importiert dafür `../ui/Icon.js`, `./session-status.js` und
    `../i18n/locale.js` (statisch — kein Pixi darin).
  - Die Übergangs-Schaltflächen: `{t(TRANSITION_LABELS[action])}` statt `{action}`;
    `key`, `onClick` und Reihenfolge (`allowedActions`) bleiben.
  - `<h1>{state.name}</h1>` bleibt — er ist der Anker „Raumansicht ist gerendert".

### D7 — Stylesheet (Abschnitt „Textschlüssel" in `theme.css`)

Nach dem Abschnitt „Startansicht" und vor dem Bewegungsblock ein Kommentar
`/* Textschlüssel (ui-text, #87) */` und diese Regeln — nur `var(--…)`, kein Farbwert,
kein neues `@media`, kein `@import`, keine Bewegungsdeklaration (ui-theme D7):

- `.app-shell-tools`: `grid-column: 3`, `justify-self: end`, `display: inline-flex`,
  `align-items: center`, `gap: var(--space-4)`.
- `.app-shell-locale`: `display: inline-flex`, `align-items: center`, `gap: var(--space-2)`,
  `font-size: var(--font-size-2)`, `letter-spacing: 0.08em`.
- `.app-shell-locale button`: `text-decoration: none`, `color: var(--color-text-muted)`.
- `.app-shell-locale button[aria-current='true']`: `color: var(--gold-text)`,
  `font-weight: 600`, `opacity: 1`, `cursor: default` (überschreibt `button:disabled`).
- `.session-room-status`: `margin: 0 0 var(--space-3)`.

Im bestehenden Abschnitt „Shell" verliert `.app-shell-account` die Deklarationen
`grid-column: 3` und `justify-self: end` (die trägt jetzt der Wrapper); `display`,
`align-items`, `gap`, `color` bleiben. Die sieben Shell-Selektoren aus `ui-shell` bleiben
vorhanden.

### D8 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle und Namen, nie über `id`/`querySelector`;
Listen und Formulare gescoped über `within`):

| Element | Adresse |
|---|---|
| Sprachschalter | `getByRole('group', { name: 'Sprache' })` bzw. `'Language'` innerhalb des `<header>` (`banner`) |
| Schaltflächen des Schalters | innerhalb der Gruppe `getByRole('button', { name: 'Deutsch' })` / `'English'`; `textContent` `DE`/`EN`; `disabled` per Property, `aria-current` per `getAttribute` (bei der inaktiven Sprache `null`) |
| `<html lang>` | `document.documentElement.lang` bzw. `getAttribute('lang')` |
| Gespeicherte Wahl | `localStorage.getItem('vtt.locale')`; vor jedem Szenario `localStorage.clear()` **und** die aktive Sprache auf Deutsch zurücksetzen (`setLocale('de')` aus `src/client/i18n/locale.js`) — das Modul hält die Sprache über Tests derselben Datei hinweg |
| Nicht verfügbarer Speicher | `localStorage` per `Object.defineProperty` auf `window` durch einen Getter ersetzen, der wirft; nach dem Szenario wiederherstellen |
| Wörterbücher | Export `de` aus `src/client/i18n/de.ts`, Export `en` aus `src/client/i18n/en.ts`; Schlüssel per `Object.keys`, sortiert vergleichen |
| Nachschlagen | Export `t` aus `src/client/i18n/locale.ts` |
| Raumansicht gerendert | `getByRole('heading', { level: 1, name: '<Sitzungsname>' })` — der Hero ist im Raum nicht gerendert, die Karten der Liste sind `h3` |
| Zustandspille im Raum | Text `Geöffnet`/`Läuft`/… (unter Englisch `Open`/`Running`/…) → `closest('.status-pill')`; Klassen per `classList` |
| Übergangs-Schaltflächen | `getByRole('button', { name: 'Starten' })` usw.; Abwesenheit per `queryByRole` |
| Rohwerte | `queryByText('geoeffnet')` / `'gestartet'` / `'starten'` exakt (Textknoten), erwartet `null` |
| Anonyme Texte unter Englisch | Überschrift `getByRole('heading', { level: 2, name: 'Sign in' })`, Schaltflächen `Sign in`, `No account yet? Register`, Labels `getByLabelText('Email')` / `'Password'`, Overline Text `Your party` |
| Angemeldete Texte unter Englisch | Überschrift Ebene 1 `My game sessions`; Schaltflächen `Run a session`, `Join`, `Map library`, `Log out`, `Enter`; Liste `getByRole('list', { name: 'My game sessions' })`; Texte `Running`, `Game master` innerhalb des Eintrags; Footer `getByRole('contentinfo')` |
| Raum unter Englisch | Schaltflächen `Back`, `Start`, `End`; Pille `Open`; Code-Text `ABC234` |

Die Szenarien rendern `App` ohne Props mit gemocktem `fetch` (Muster der bestehenden
Auth-/Sitzungs-/Shell-/Start-Tests); für den Raum gilt das Socket-Mock-Muster der
Sitzungstests (Fassade mit `enter`-Acknowledgement). Bestehende Suiten, deren Szenarien in
den Deltas geändert sind (`game-session` „Raumansicht des Spielleiters", „Raumansicht des
Spielers", „Zustand folgt dem Server", „Wiederverbindung betritt den Raum erneut";
`ui-shell` „Anonyme Ansicht zeigt nur die Marke", „Zurück führt aus dem Raum zur
Sitzungsliste"; `ui-start` „Betreten öffnet den Raum der Karte"), werden auf die neuen
Anker umgestellt — die Testnamen bleiben. Alle übrigen Suiten bleiben unverändert; der
Sprachschalter liegt im `<header>` und stört keine auf `main` gescopte Abfrage.

Stylesheet-Szenario: `theme.css` als Text lesen (Kommentare entfernen, Whitespace
normalisieren, `<selektor> {` suchen) — dieselben Helfer wie in der Theme-/Shell-/Start-
Suite; sie können in der neuen Suite dupliziert werden.

### D9 — Reihenfolge der Kopplungen

`de.ts` importiert nichts. `en.ts` importiert nur den Typ aus `de.ts`. `locale.ts`
importiert `react`, `de.ts`, `en.ts`. `session-status.ts` importiert nur Typen.
`LocaleSwitch` importiert `react` und `locale.ts`. `AppShell` importiert zusätzlich
`LocaleSwitch` und `locale.ts`. `Hero`, `App`, die Formulare, `SessionList`, `SessionRoom`
importieren `locale.ts`. `pixi.js` bleibt außerhalb der statischen Importkette von `App`
(unverändert: `canvas.ts` nur dynamisch aus `MapCanvas`).

## Risks / Trade-offs

- **Gemischtsprachiger Raum unter Englisch** (Teilnehmer, Karte, Tokens, Fog, Anmerkungen
  bleiben deutsch) → gewollt (proposal.md, Umfang); Epic C/D zieht die Texte beim Umbau
  über `ui-text`. Im App-Test bekannt.
- **Servermeldungen bleiben deutsch** (`result.message`, zod-Texte) → Folge-Issue #109.
- **Gespeicherte Meldungen werden beim Umschalten nicht neu übersetzt** (`hinweis` in
  `App`, `error`/`message` in den Formularen sind Strings im State) → hinnehmbar: die
  nächste Aktion erzeugt die Meldung in der neuen Sprache; ein Schlüssel im State hieße,
  Servermeldungen und eigene Meldungen unterschiedlich zu halten — erst mit #109 sinnvoll.
- **`useSyncExternalStore` mit Modulzustand über Tests hinweg** → D8 verlangt Reset auf
  Deutsch vor jedem Szenario; jede Testdatei bekommt ohnehin eine frische Modulinstanz.
- **`disabled` entzieht die aktive Sprache dem Tab-Fokus** → gewollt (Issue); die andere
  Schaltfläche bleibt erreichbar, der Zustand ist per `aria-current` und Text lesbar.
- **`aria-label` überdeckt den sichtbaren Text `DE`/`EN`** (zugänglicher Name `Deutsch`/
  `English`) → Absicht: Screenreader lesen den Sprachnamen statt zwei Buchstaben; der
  sichtbare Text bleibt kurz.
- **Zwei Schaltflächen `Beitreten`/`Join` und Pille `Open`/Schaltfläche `Open`** → wie bei
  #86 innerhalb des Formulars adressieren; `Open` als Pille und als Schaltfläche treten nie
  gleichzeitig auf (`oeffnen` ist nur in `geschlossen` erlaubt, dessen Pille `Closed` heißt).
- **`index.html` behält `lang="de"`** → das Modul setzt das Attribut beim Laden; vor dem
  ersten Skript ist die Seite ohnehin leer.
