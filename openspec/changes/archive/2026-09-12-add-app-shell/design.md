## Context

Vorhanden: `App.tsx` mit `AuthState` (`unbekannt` · `anonym` · `angemeldet`) und
`SessionView` (`liste` · `raum` · `bibliothek`), ohne Router; `main.tsx` importiert
`theme.css` und rendert `<App />` in `StrictMode`. Die Sitzungsliste zeigt „Angemeldet als
<E-Mail>", `Abmelden`, `Kartenbibliothek`, den globalen Hinweis und die Passwortänderung.
Die Raumansicht hat zwei Schaltflächen „Zurück zur Liste" (Fehlerzustand und Normalfall),
die Kartenbibliothek „Zurück zur Sitzungsliste" (Liste) und „Zurück" (Kartenansicht →
Liste). `theme.css` (`ui-theme`) liefert Tokens (`--content-max: 55rem`, `--font-display`,
`--gold-text`, `--gold-border`, `--panel-grad`, …) und die Grundelemente `button.link`
usw.; sein Format-Vertrag (ui-theme design.md D7) wird von Tests als Text geprüft.
Vite 7 kennt `define`; Jest kennt keine Vite-Defines.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten: `specs/ui-shell/spec.md`
und die MODIFIED-Deltas zu `user-auth`, `game-session`, `map-library`. Bindend und nicht
wiederholt: `constitution.md` §9 — hier nur insofern berührt, als der Wechsel in den anonymen
Zustand weiterhin der Bestätigung des Servers folgt (bestehende Logik in `App.tsx`).

## Goals / Non-Goals

**Goals:**
- **Eine Komponente ist die Hülle.** `AppShell` rendert Header, Main, Footer; `App`
  entscheidet nur, was hinein kommt. Keine Ansicht weiß von der Shell.
- **Ein Zurück-Pfad, ein Abmelden.** Beides nur in der Top-Bar; die Ansichten verlieren
  ihre Duplikate und die zugehörigen Props.
- **Adressen für die Tests stehen hier** (D6): Landmarks, Beschriftungen, Textknoten.
- **Build-Angaben ohne Jest-Magie:** Defines werden nur in `main.tsx` gelesen; überall sonst
  ist `BuildInfo` ein gewöhnlicher Wert mit Rückfall.
- Keine bestehende Assertion bricht, außer den drei in proposal.md genannten (MODIFIED).

**Non-Goals:**
- Kein Router, keine URL-Synchronisation.
- Keine Icons (Chevron bleibt Text bis #86), kein Kontomenü, keine Passwortänderung in der
  Top-Bar.
- Keine Responsive-Regeln (#100), keine Session-Bar im Raum (#93).
- Kein Umbau der Ansichten über das Entfernen der Duplikate hinaus.

## Decisions

### D1 — `AppShell` (`src/client/app/AppShell.tsx`)

Props:

```ts
export interface AppShellProps {
  canGoBack: boolean
  onBack: () => void
  account: { username: string } | null
  onLogout: () => void
  hinweis: string | null
  build: BuildInfo
  children: ReactNode
}
```

Markup (verbindlich, Beschriftungen exakt):

- `<header className="app-shell-topbar">`
  - nur wenn `canGoBack`: `<button type="button" className="link app-shell-back" autoFocus
    onClick={onBack}>` mit Inhalt `<span aria-hidden="true">‹</span>` und dem Text ` Zurück`
    — zugänglicher Name `Zurück` (das Chevron ist versteckt). Das ist das erste Element mit
    Tab-Stop im Dokument, weil der Header vor `<main>` steht und die Schaltfläche das erste
    Kind des Headers ist; `autoFocus` setzt beim Einhängen den Fokus (React ruft `focus()`
    beim Mount auf, auch in jsdom).
  - `<span className="app-shell-brand">` mit `<span aria-hidden="true">◆</span>` und
    `<span>VTT</span>` — der Wortmarken-Text steht allein in seinem Element, damit ein
    exakter Textvergleich `VTT` trifft.
  - nur wenn `account`: `<div className="app-shell-account">` mit `<span>{username}</span>`
    und `<button type="button" className="link" onClick={onLogout}>Abmelden</button>`.
- `<main className="app-shell">`: zuerst, falls `hinweis !== null`,
  `<p role="alert" className="app-shell-hinweis">{hinweis}</p>`, dann `children`.
- `<footer className="app-shell-footer">` mit genau dem Text
  `Version {build.version} · Build {build.sha}` (Mittelpunkt U+00B7 mit Leerzeichen).

Keine `key`-Tricks, kein eigener State, keine Effekte. Die Shell wird in **jedem**
Auth-Zustand gerendert — auch um `Lädt …` und um Anmelde-/Registrierungsformular
(`account` `null`, `canGoBack` `false`).

### D2 — Build-Angaben

- `src/client/app/build-info.ts`: `export interface BuildInfo { version: string; sha: string }`
  und `export const FALLBACK_BUILD: BuildInfo = { version: '0.0.0-dev', sha: 'dev' }`.
- `src/client/vite-env.d.ts`: `declare const __APP_VERSION__: string` und
  `declare const __BUILD_SHA__: string` (globale Deklarationen; die Datei liegt in `src/` und
  wird von `tsconfig.json` und `tsconfig.src.json` über `src/**` erfasst).
- `src/client/main.tsx` liest beide mit `typeof`-Wächter (`typeof __APP_VERSION__ ===
  'string' ? __APP_VERSION__ : FALLBACK_BUILD.version`, ebenso für den SHA) und übergibt
  `<App build={…} />`. Nur hier werden die Defines angefasst.
- `App` bekommt `build?: BuildInfo` (Standard `FALLBACK_BUILD`) — Tests rendern `App` ohne
  Props und sehen die Rückfallwerte.
- **`vite.config.ts` und `package.json` ändert der Mensch** im Feature-Worktree, bevor der
  test-author startet (beide Dateien liegen außerhalb jedes Rollen-Pfadbereichs;
  constitution.md §2.4): `define: { __APP_VERSION__: JSON.stringify(<version aus
  package.json>), __BUILD_SHA__: JSON.stringify(<git rev-parse --short HEAD, sonst 'dev'>) }`
  und `"version": "0.1.0"` in `package.json`. Die fertige `vite.config.ts` liegt der
  Sitzung als Datei bereit; der Mensch kopiert sie, setzt die Version und committet
  (tasks.md 0.1). Ein fehlender Git-Checkout lässt den Build nicht scheitern (Rückfall
  `dev` mit Warnung auf der Konsole).

### D3 — Verdrahtung in `App.tsx`

- `canGoBack` ist `state.status === 'angemeldet' && sessionView.view !== 'liste'`.
- `onBack` setzt `sessionView` auf `{ view: 'liste' }` — dieselbe Funktion, die bisher
  `onLeave`/`onBack` der Ansichten bekamen. Der Raum räumt seine Socket-Verbindung wie
  bisher im Unmount-Effekt auf.
- `account` ist `{ username: state.user.username }` im Zustand `angemeldet`, sonst `null`.
- `onLogout` ist der bestehende `handleLogout` (Server bestätigt → `anonym` + Liste; sonst
  erneute Abfrage bzw. Hinweis). Unverändert.
- `hinweis` bleibt State von `App`; die Shell zeigt ihn. Der bisherige
  `<p role="alert">` im anonymen Zweig von `App` und die `hinweis`-Prop der Sitzungsliste
  entfallen. Der Hinweis wird wie bisher beim Betreten eines Raums und bei erfolgreicher
  Anmeldung gelöscht.
- Struktur des Renderings: `App` baut den Inhalt (`content`) je Zustand wie bisher und gibt
  genau einmal `<AppShell …>{content}</AppShell>` zurück.

### D4 — Ansichten ohne Duplikate

- `SessionList`: Props `onLogout` und `hinweis` entfallen; das `<p>Angemeldet als …</p>`, der
  `<p role="alert">{hinweis}</p>` und die Schaltfläche `Abmelden` werden entfernt. Bleiben:
  `Kartenbibliothek`, Überschrift, Liste, beide Formulare, `ChangePasswordForm`, `loadError`.
- `SessionRoom`: Prop `onLeave` entfällt; beide Schaltflächen „Zurück zur Liste" werden
  entfernt (Fehlerzustand zeigt nur noch die Meldung). `onEnded` bleibt.
- `MapLibrary`: Prop `onBack` entfällt; „Zurück zur Sitzungsliste" wird entfernt. Die innere
  Schaltfläche der Kartenansicht heißt `Zur Bibliothek` (Text exakt), Verhalten unverändert
  (`backToList`).
- Sonst keine Änderung an Markup oder Verhalten der Ansichten.

### D5 — Stylesheet (Abschnitt „Shell" in `theme.css`)

Direkt nach `.empty-state strong { … }` und vor dem Bewegungsblock ein Kommentar
`/* Shell (ui-shell, #84) */` und genau diese Regeln — nur `var(--…)`, kein Farbwert, kein
neues `@media`, kein `@import` (ui-theme design.md D7):

- `.app-shell-topbar`: `position: sticky`, `top: 0`, `z-index: 10`, `display: grid`,
  `grid-template-columns: 1fr auto 1fr`, `align-items: center`,
  `gap: var(--space-4)`, `padding: var(--space-2) var(--space-4)`,
  `background: var(--panel-grad)`, `border-bottom: 1px solid var(--gold-border)`.
- `.app-shell-back`: `grid-column: 1`, `justify-self: start`.
- `.app-shell-brand`: `grid-column: 2`, `display: inline-flex`, `align-items: center`,
  `gap: var(--space-2)`, `font-family: var(--font-display)`, `font-size: var(--font-size-3)`,
  `letter-spacing: 0.22em`, `text-transform: uppercase`, `color: var(--gold-text)`.
- `.app-shell-account`: `grid-column: 3`, `justify-self: end`, `display: inline-flex`,
  `align-items: center`, `gap: var(--space-3)`, `color: var(--color-text-muted)`.
- `main.app-shell`: `max-width: var(--content-max)`, `margin: 0 auto`,
  `padding: var(--space-5) var(--space-4)`.
- `.app-shell-hinweis`: `margin: 0 0 var(--space-4)`, `padding: var(--space-2) var(--space-3)`,
  `border: 1px solid var(--amber-border)`, `border-radius: var(--radius-3)`,
  `background: var(--amber-bg)`, `color: var(--amber)`.
- `.app-shell-footer`: `padding: var(--space-4)`, `border-top: 1px solid var(--color-border-faint)`,
  `font-size: var(--font-size-2)`, `color: var(--color-text-muted)`, `text-align: center`.

`grid-column` explizit, damit die Marke auch ohne `Zurück` und ohne Konto in der Mitte
bleibt. Der Bewegungsblock bleibt unverändert am Dateiende.

### D6 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle und Namen, nie über `id`/`querySelector`):

| Element | Adresse |
|---|---|
| Top-Bar | Landmark `banner` (`<header>`) |
| Inhaltsbereich | Landmark `main`; Klasse `app-shell` |
| Footer | Landmark `contentinfo` (`<footer>`); Text `Version 0.0.0-dev · Build dev` im Test |
| Zurück | Schaltfläche mit Namen `Zurück` (Chevron aria-hidden); „erste Schaltfläche in Dokumentreihenfolge" = erstes Element der Abfrage aller Schaltflächen; Fokus über `document.activeElement` |
| Marke | Text `VTT` (eigenes Element) innerhalb `banner` |
| Konto | Text des Nutzernamens innerhalb `banner`; Schaltfläche `Abmelden` innerhalb `banner` |
| Globaler Hinweis | `role="alert"` innerhalb `main` |
| Innere Schaltfläche der Kartenansicht | Schaltfläche `Zur Bibliothek` |
| Sitzungsliste erkannt an | Formular-Überschrift `Neue Spielsitzung` |

Die Szenarien rendern `App` ohne Props mit gemocktem `fetch` (Muster der bestehenden
Auth-/Sitzungs-/Bibliothekstests); für den Raum gilt das bestehende Socket-Mock-Muster der
Sitzungstests. `document.activeElement` ist in jsdom nach `autoFocus` die Schaltfläche.

Stylesheet-Szenario: `theme.css` als Text lesen (Kommentare entfernen, Whitespace
normalisieren, `<selektor> {` suchen) — dieselben Helfer wie in der Theme-Suite; sie können
in der neuen Suite dupliziert werden, ohne die Theme-Suite anzufassen.

### D7 — Reihenfolge der Kopplungen

`AppShell` importiert nur `react` und `build-info.ts`. `App` importiert `AppShell`. Keine
Ansicht importiert die Shell. `pixi.js` bleibt außerhalb der statischen Importkette von
`App` (dynamischer Import in `MapCanvas`, unverändert).

## Risks / Trade-offs

- **`autoFocus` bei jedem Wechsel in eine Unteransicht** zieht den Fokus in die Top-Bar,
  auch wenn der Nutzer gerade ein Formular öffnen wollte → gewollt (Issue-Vorgabe: erstes
  fokussierbares Element, Tastaturpfad zurück ist immer ein Tab entfernt). Screenreader
  lesen „Zurück, Schaltfläche".
- **Der Fehlerzustand des Raums verliert seine eigene Schaltfläche** → die Top-Bar zeigt
  `Zurück`, weil `sessionView` `raum` ist; kein Verlust an Bedienbarkeit.
- **Sticky Header über dem Canvas** — die Karte scrollt darunter; die Inline-Höhen der
  Canvas-Container bleiben (#96 ordnet das Layout des Raums).
- **Vite-Defines nur in `main.tsx`** → die Shell ist ohne Vite-Wissen testbar; Preis ist
  eine Prop, die durch `App` gereicht wird. Alternative (Modul liest Defines mit
  `typeof`-Wächter überall) hätte Jest-Globals gebraucht.
- **`package.json` bekommt eine `version`** — bisher gab es keine; `0.1.0` markiert den Stand
  nach der Roadmap (#5–#17). Bumps sind Menschensache beim Release.
- **Zwei parallele Changes berühren `theme.css`** (#84, #85) → beide hängen ihren Abschnitt
  vor dem Bewegungsblock an; ein Rebase-Konflikt ist mechanisch (beide Abschnitte behalten).
