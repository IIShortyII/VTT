## Context

Vorhanden: `App.tsx` rendert je Auth-Zustand `LoginForm`/`RegisterForm` (mit eigener `<h1>`
und zwei ungestylten Schaltflächen) oder `SessionList` (Schaltfläche `Kartenbibliothek`,
`<h1>Meine Spielsitzungen</h1>`, `<ul>` mit „Name – Rolle – Status", zwei offene Formulare
`Neue Spielsitzung` / `Spielsitzung beitreten`, `ChangePasswordForm` mit `<h2>`), alles in
der Shell (`AppShell`, `ui-shell`). `theme.css` (`ui-theme`) liefert `.panel`, `.status-pill`
mit `--active/--paused/--ended`, `.field-label`, `.field-error`, `.empty-state`,
`button.primary/.link`; sein Format-Vertrag (ui-theme design.md D7) wird als Text geprüft.
`ui-icons` liefert `Icon` mit den Namen `add`, `back`, `library`, `lock`, `pause`,
`players`, `start`, `user`. `SessionSummary` (`shared/session.ts`) trägt `id`, `name`,
`status` (`geschlossen|geoeffnet|gestartet|pausiert`), `role` (`spielleiter|spieler`),
optional `code`.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/ui-start/spec.md` und die MODIFIED-Deltas zu `game-session`, `ui-shell`,
`user-auth`. Bindend und nicht wiederholt: `constitution.md` §9 — Zustand, Rolle und der
Erfolg von Erstellen/Beitreten kommen ausschließlich aus Antworten des Servers.

## Goals / Non-Goals

**Goals:**
- **Ein Hero, zwei Zustände.** Dieselbe Komponente rendert Overline, Titel und Subline für
  anonym und angemeldet; nur Texte und Aktionen unterscheiden sich.
- **Formulare bleiben, Auslöser kommen dazu.** Erstellen- und Beitreten-Formular behalten
  Felder, `name`-Attribute, Beschriftungen und API-Aufrufe; neu sind Sichtbarkeit,
  `Abbrechen`, Fokus und `aria-expanded`.
- **Adressen für die Tests stehen hier** (D8): Beschriftungen, Landmark-/Rollen-Namen,
  Klassen der Pille.
- **Mechanik in einer Tabelle** (D3): Zustand → Text/Icon/Klasse ist Daten, kein `if`.
- Keine bestehende Assertion bricht, außer den in proposal.md genannten (MODIFIED).

**Non-Goals:**
- Kein Modal, kein Focus-Trap, kein Esc (#89). Kein Kontomenü (#92).
- Keine Umbenennung von Schaltflächen, die bestehende Tests adressieren (`Betreten`,
  `Erstellen`, `Beitreten`, `Kartenbibliothek`, `Noch kein Konto? Registrieren`,
  `Ich habe schon ein Konto`, `Passwort ändern`).
- Keine Änderung an `SessionRoom`, `MapLibrary`, Server oder Schema.
- Keine Responsive-Regeln (#100); die Karten stapeln sich in einer Spalte.

## Decisions

### D1 — `Hero` (`src/client/app/Hero.tsx`)

```ts
export interface HeroProps {
  title: string
  subline: string
  actions?: ReactNode
}
```

Markup (verbindlich):

```
<section className="hero">
  <p className="hero-overline">Deine Runde</p>
  <h1 className="hero-title">{title}</h1>
  <p className="hero-subline">{subline}</p>
  {actions && <div className="hero-actions">{actions}</div>}
</section>
```

Die Gedankenstriche der Overline kommen aus dem Stylesheet (`.hero-overline::before`,
`::after` mit `content: '—'`), nicht aus dem Textknoten — der Text der Overline ist exakt
`Deine Runde`. Keine eigene `<h1>` in `LoginForm`, `RegisterForm` oder `SessionList`: der
Hero-Titel ist die einzige Überschrift der Ebene 1 der Startansicht. `Hero` importiert nur
`react`.

### D2 — Anonyme Startansicht (`App.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`)

- `App` rendert im Zustand `anonym`:
  ```
  <Hero title="Karten, Tokens, Nebel" subline="Leite deine Runde am virtuellen Tisch oder tritt einer bei." />
  <div className="panel auth-panel">{LoginForm | RegisterForm}</div>
  ```
  Beide Formulare bleiben Kinder von `App` mit denselben Props wie heute.
- `LoginForm`: `<h1>Anmelden</h1>` wird `<h2>Anmelden</h2>`; Labels bekommen
  `className="field-label"`; die Fehlermeldung bleibt `<p role="alert">` und bekommt
  `className="field-error"`; Absenden `<button type="submit" className="primary">Anmelden`;
  Umschalter `<button type="button" className="link">Noch kein Konto? Registrieren`.
- `RegisterForm`: `<h1>Registrierung</h1>` wird `<h2>Registrierung</h2>`; Labels
  `field-label`, Fehlermeldung `field-error`, Absenden `primary`, Umschalter `link` mit dem
  unveränderten Text `Ich habe schon ein Konto`.
- Sonst keine Änderung an Feldern (`name`, `autoComplete`, `required`) oder Verhalten.

### D3 — Zustandstabelle (`src/client/session/session-status.ts`, neu)

```ts
import type { GameSessionStatus, MemberRole } from '../../shared/session.js'
import type { IconName } from '../ui/icons.js'

export interface StatusPresentation {
  label: string
  icon: IconName
  modifier: 'status-pill--active' | 'status-pill--paused' | 'status-pill--ended' | null
}

export const SESSION_STATUS_PRESENTATION: Record<GameSessionStatus, StatusPresentation> = {
  gestartet: { label: 'Läuft', icon: 'start', modifier: 'status-pill--active' },
  pausiert: { label: 'Pausiert', icon: 'pause', modifier: 'status-pill--paused' },
  geoeffnet: { label: 'Geöffnet', icon: 'players', modifier: null },
  geschlossen: { label: 'Geschlossen', icon: 'lock', modifier: 'status-pill--ended' },
}

export const ROLE_LABELS: Record<MemberRole, string> = { spielleiter: 'Spielleiter', spieler: 'Spieler' }
```

Der Schlüssel ist der vom Server gemeldete `status`; es gibt keinen anderen Weg in die
Tabelle (§9.1). `Record<GameSessionStatus, …>` lässt den Typecheck rot werden, sobald
`shared/session.ts` einen Zustand bekommt, den die Tabelle nicht kennt.

### D4 — Angemeldete Startansicht (`SessionList.tsx`)

Props: `onEnter(sessionId)`, `onOpenLibrary()` — Prop `user` entfällt (in `App` nicht mehr
übergeben). State wie heute (`name`, `code`, `createError`, `joinError`, `creating`,
`joining`, `loadError`) plus:

- `sessions: SessionSummary[] | null` — `null` bis `GET /api/sessions` geantwortet hat
  (**ausstehend**). `reload()` setzt bei `ok` die Liste, sonst `loadError`; ein geworfener
  Fehler setzt `loadError` auf die bestehende `LOAD_FAILURE_MESSAGE`. In beiden
  Fehlerfällen bleibt `sessions` unverändert (beim ersten Laden also `null`).
- `panel: 'none' | 'erstellen' | 'beitreten'` — genau eines der beiden Formulare ist
  gerendert, oder keines.

Markup (verbindlich, Beschriftungen exakt):

```
<Hero title="Meine Spielsitzungen" subline="Leite eine Sitzung oder tritt mit einem Code bei."
  actions={<>
    <button type="button" className="primary" aria-expanded={panel === 'erstellen'} onClick={toggle('erstellen')}>
      <Icon name="add" /> Sitzung leiten
    </button>
    <button type="button" aria-expanded={panel === 'beitreten'} onClick={toggle('beitreten')}>
      <Icon name="players" /> Beitreten
    </button>
    <button type="button" className="link" onClick={onOpenLibrary}>
      <Icon name="library" /> Kartenbibliothek
    </button>
  </>}
/>

{panel === 'erstellen' && (
  <form className="panel" aria-labelledby="create-session-heading" onSubmit={…}>
    <h2 id="create-session-heading">Neue Spielsitzung</h2>
    <label className="field-label" htmlFor="session-name">Name</label>
    <input id="session-name" name="name" type="text" autoFocus required value={name} onChange={…} />
    {createError !== null && <p role="alert" className="field-error">{createError}</p>}
    <div className="panel-actions">
      <button type="submit" className="primary" disabled={creating}>Erstellen</button>
      <button type="button" onClick={close}>Abbrechen</button>
    </div>
  </form>
)}

{panel === 'beitreten' && (
  <form className="panel" aria-labelledby="join-session-heading" onSubmit={…}>
    <h2 id="join-session-heading">Spielsitzung beitreten</h2>
    <label className="field-label" htmlFor="session-code">Sitzungscode</label>
    <input id="session-code" name="code" type="text" autoFocus required value={code} onChange={…} />
    {joinError !== null && <p role="alert" className="field-error">{joinError}</p>}
    <div className="panel-actions">
      <button type="submit" className="primary" disabled={joining}>Beitreten</button>
      <button type="button" onClick={close}>Abbrechen</button>
    </div>
  </form>
)}

{loadError !== null && <p role="alert" className="field-error">{loadError}</p>}

{sessions !== null && sessions.length === 0 && loadError === null && (
  <p className="empty-state">
    <strong>Noch keine Sitzungen</strong>
    <span>Erstelle eine Sitzung oder tritt mit einem Code bei.</span>
  </p>
)}

{sessions !== null && sessions.length > 0 && (
  <ul className="session-cards" aria-label="Meine Spielsitzungen">
    {sessions.map((session) => {
      const status = SESSION_STATUS_PRESENTATION[session.status]
      return (
        <li key={session.id} className="session-card">
          <h3 className="session-card-name">{session.name}</h3>
          <div className="session-card-meta">
            <span className={status.modifier ? `status-pill ${status.modifier}` : 'status-pill'}>
              <Icon name={status.icon} /> {status.label}
            </span>
            <span><Icon name="user" /> {ROLE_LABELS[session.role]}</span>
          </div>
          <button type="button" onClick={() => onEnter(session.id)}>Betreten</button>
        </li>
      )
    })}
  </ul>
)}

<details className="start-account">
  <summary>Passwort ändern</summary>
  <ChangePasswordForm />
</details>
```

Verhalten:
- `toggle(p)` setzt `panel` auf `p`, wenn es nicht schon `p` ist, sonst auf `'none'`;
  `close` setzt `'none'`. Beim Wechsel oder Schließen werden `createError`/`joinError`
  gelöscht; die Eingaben `name`/`code` bleiben erhalten (kein Datenverlust beim Umschalten).
- `autoFocus` auf dem Eingabefeld: React ruft `focus()` beim Mount auf, auch in jsdom —
  dieselbe Mechanik wie `Zurück` in der Shell.
- Erfolg von `createSession`/`joinSession` (`result.ok`): Feld leeren, `panel` auf
  `'none'`, `reload()`. Ablehnung (`ok: false`): Meldung in `createError`/`joinError`,
  `panel` bleibt. Geworfener Fehler: bestehende `GENERIC_*_ERROR_MESSAGE`, `panel` bleibt.
- Die Karte enthält keinen Rohwert von `status` oder `role`; `session.code` wird auf der
  Karte nicht gezeigt (er gehört in den Raum, wie bisher).

Ein gerendertes `<details>` ohne `open` hält seinen Inhalt im DOM — die bestehenden
Passwort-Tests finden die Felder per `querySelector` weiterhin; `<summary>` hat keine
ARIA-Rolle `button`, daher bleibt `getByRole('button', { name: /ändern/i })` eindeutig.

### D5 — `ChangePasswordForm.tsx`

`<h2>Passwort ändern</h2>` entfällt (die Summary ist die Überschrift; sonst stünde der Text
zweimal untereinander). Labels bekommen `className="field-label"`, die Meldung bleibt
`<p role="alert">`. Felder, `name`-Attribute, `autoComplete`, Schaltfläche
`Passwort ändern` und Verhalten unverändert.

### D6 — Shell (`AppShell.tsx`)

In der Schaltfläche `Zurück` wird `<span aria-hidden="true">‹</span>` durch
`<Icon name="back" />` ersetzt (dekorativ, `aria-hidden="true"`); der Textknoten ` Zurück`
bleibt, der zugängliche Name ist weiterhin `Zurück`. `AppShell` importiert damit zusätzlich
`../ui/Icon.js`; die Regel „keine Ansicht importiert die Shell" (ui-shell D7) bleibt.
Die Marke `◆` bleibt Text (kein passendes Registry-Icon; kein Anlass, die Registry zu
erweitern).

### D7 — Stylesheet (Abschnitt „Startansicht" in `theme.css`)

Nach dem Abschnitt „Icons" (`.chip .icon-button { … }`) und vor dem Bewegungsblock ein
Kommentar `/* Startansicht (ui-start, #86) */` und genau diese zwölf Regeln — nur
`var(--…)`, kein Farbwert, kein neues `@media`, kein `@import`, keine
Bewegungsdeklaration (ui-theme design.md D7):

- `.hero`: `display: flex`, `flex-direction: column`, `gap: var(--space-2)`,
  `margin: var(--space-4) 0 var(--space-6)`, `text-align: center`.
- `.hero-overline`: `margin: 0`, `font-size: var(--font-size-1)`, `font-weight: 600`,
  `letter-spacing: 0.22em`, `text-transform: uppercase`, `color: var(--gold-text)`; dazu
  `.hero-overline::before, .hero-overline::after { content: '—'; margin: 0 var(--space-2); }`
  (die Pseudo-Regel zählt nicht als eigener Start-Selektor).
- `.hero-title`: `margin: 0`, `font-family: var(--font-display)`,
  `font-size: var(--font-size-hero)`, `font-weight: 400`, `line-height: 1.1`,
  `color: var(--color-text)`.
- `.hero-subline`: `margin: 0`, `font-size: var(--font-size-3)`,
  `color: var(--color-text-muted)`.
- `.hero-actions`: `display: flex`, `flex-wrap: wrap`, `justify-content: center`,
  `align-items: center`, `gap: var(--space-3)`, `margin-top: var(--space-3)`; dazu
  `.hero-actions button { display: inline-flex; align-items: center; gap: var(--space-2); }`.
- `.auth-panel`: `max-width: 26rem`, `margin: 0 auto`; dazu `.auth-panel h2 { margin: 0;
  font-size: var(--font-size-4); }` und `.auth-panel form { display: flex; flex-direction:
  column; gap: var(--space-2); }`.
- `.panel-actions`: `display: flex`, `gap: var(--space-2)`, `margin-top: var(--space-2)`.
- `.session-cards`: `list-style: none`, `margin: 0`, `padding: 0`, `display: grid`,
  `gap: var(--space-3)`.
- `.session-card`: `display: grid`, `grid-template-columns: 1fr auto`,
  `grid-template-areas: 'name action' 'meta action'`, `align-items: center`,
  `gap: var(--space-1) var(--space-4)`, `padding: var(--space-3) var(--space-4)`,
  `border: 1px solid var(--color-border)`, `border-radius: var(--radius-5)`,
  `background: var(--panel-grad)`, `box-shadow: var(--shadow-panel)`; dazu
  `.session-card > button { grid-area: action; }`.
- `.session-card-name`: `grid-area: name`, `margin: 0`,
  `font-family: var(--font-display)`, `font-size: var(--font-size-4)`, `font-weight: 400`.
- `.session-card-meta`: `grid-area: meta`, `display: flex`, `flex-wrap: wrap`,
  `align-items: center`, `gap: var(--space-3)`, `font-size: var(--font-size-2)`,
  `color: var(--color-text-muted)`; dazu `.session-card-meta > span { display: inline-flex;
  align-items: center; gap: var(--space-1); }`.
- `.start-account`: `margin-top: var(--space-7)`, `color: var(--color-text-muted)`; dazu
  `.start-account > summary { cursor: pointer; font-size: var(--font-size-2); }` und
  `.start-account form { display: flex; flex-direction: column; gap: var(--space-2);
  margin-top: var(--space-3); }`.

Die `h2` im Erstellen-/Beitreten-`.panel` erbt `h1, h2` (Display-Serif) und bekommt
`.panel h2 { margin: 0; font-size: var(--font-size-4); }` als Teil derselben Sektion. Der
Bewegungsblock bleibt unverändert am Dateiende.

### D8 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle und Namen, nie über `id`/`querySelector`;
Listen und Formulare gescoped über `within`):

| Element | Adresse |
|---|---|
| Overline | Text `Deine Runde` (exakt; die Striche sind CSS) |
| Titel | `getByRole('heading', { level: 1 })` — genau eines; Text `Karten, Tokens, Nebel` bzw. `Meine Spielsitzungen` |
| Subline | Text `Leite deine Runde am virtuellen Tisch oder tritt einer bei.` bzw. `Leite eine Sitzung oder tritt mit einem Code bei.` |
| Aktionen | Schaltflächen `Sitzung leiten`, `Beitreten`, `Kartenbibliothek`; `aria-expanded` per `getAttribute` |
| Erstellen-Formular | `getByRole('form', { name: 'Neue Spielsitzung' })`; darin `getByLabelText('Name')`, Schaltflächen `Erstellen`, `Abbrechen`; Fehler `role="alert"` innerhalb des Formulars |
| Beitreten-Formular | `getByRole('form', { name: 'Spielsitzung beitreten' })`; darin `getByLabelText('Sitzungscode')`, **innerhalb** `getByRole('button', { name: 'Beitreten' })` (im Dokument gibt es sonst zwei), `Abbrechen` |
| Geschlossenes Formular | `queryByRole('form', { name: … })` ist `null` |
| Fokus | `document.activeElement` ist das Eingabefeld des geöffneten Formulars |
| Sitzungsliste | `getByRole('list', { name: 'Meine Spielsitzungen' })`; Einträge `within(list).getAllByRole('listitem')` |
| Karte | innerhalb des Eintrags: `getByRole('heading', { level: 3, name })`, Text `Läuft`/`Pausiert`/`Geöffnet`/`Geschlossen`, Text `Spielleiter`/`Spieler`, Schaltfläche `Betreten` |
| Zustandspille | Element mit Text `Läuft` usw. → nächstes `closest('.status-pill')`; Klassen per `classList`, Icon per `querySelector('svg[aria-hidden="true"]')` innerhalb der Pille |
| Leerzustand | Text `Noch keine Sitzungen` und `Erstelle eine Sitzung oder tritt mit einem Code bei.` |
| Ladefehler | `role="alert"` im `<main>` außerhalb eines Formulars |
| Passwortänderung | `container.querySelector('details.start-account')` mit `summary`-Text `Passwort ändern` und ohne `open`; Felder wie bisher |
| Anmeldekarte | Schaltflächen `Anmelden` (submit), `Noch kein Konto? Registrieren`; Registrierung: `Registrieren`, `Ich habe schon ein Konto` |
| Zurück-Icon | innerhalb der Schaltfläche `Zurück`: genau ein `svg[aria-hidden="true"]`, `textContent` enthält kein `‹` |
| Sitzungsliste erkannt an | Schaltfläche `Sitzung leiten` (ersetzt den bisherigen Anker `Neue Spielsitzung`) |

Die Szenarien rendern `App` ohne Props mit gemocktem `fetch` (Muster der bestehenden
Auth-/Sitzungs-/Shell-Tests); für den Raum gilt das Socket-Mock-Muster der Sitzungstests.
„Antwort steht noch aus" = ein `fetch`-Mock, dessen Promise für `/api/sessions` erst durch
den Test aufgelöst wird. `POST /api/sessions` und `POST /api/sessions/join` werden über den
Aufruf-Body des `fetch`-Mocks geprüft.

Stylesheet-Szenario: `theme.css` als Text lesen (Kommentare entfernen, Whitespace
normalisieren, `<selektor> {` suchen) — dieselben Helfer wie in der Theme-Suite; sie
können in der neuen Suite dupliziert werden, ohne die Theme-Suite anzufassen.

### D9 — Reihenfolge der Kopplungen

`Hero` importiert nur `react`. `SessionList` importiert `Hero`, `Icon`, `session-status`,
`ChangePasswordForm`, `api`. `App` importiert `Hero` für den anonymen Zweig. `AppShell`
importiert zusätzlich `Icon`. `pixi.js` bleibt außerhalb der statischen Importkette von
`App` (unverändert).

## Risks / Trade-offs

- **Zwei Schaltflächen `Beitreten`** (Hero + Absenden), solange das Beitreten-Formular
  offen ist → Tests adressieren das Absenden innerhalb des Formulars (D8); die
  Raum-Suiten nutzen `/betreten/i`, das `Beitreten` nicht matcht. Alternative
  (Umbenennung des Absendens in `Jetzt beitreten`) hätte eine bekannte Beschriftung
  geändert.
- **`aria-expanded` auf Schaltflächen, deren Ziel nicht direkt folgt** → Screenreader
  lesen „erweitert/reduziert"; das Formular folgt im Dokument unmittelbar auf den Hero,
  das reicht ohne `aria-controls`.
- **`<details>` für die Passwortänderung ist ein Provisorium** bis #92 → bewusst; die
  Mechanik ist nativ und barrierefrei, kein Eigenbau.
- **`sessions === null` während des Ladens** heißt: kurzzeitig nur Hero und Aktionen,
  keine Ladeanzeige → gewollt (kein Aufblitzen des Leerzustands; ein Spinner käme mit
  #91).
- **Formular-Überschriften werden `<h2>`** → Tests, die `Registrierung` per Text suchen,
  bleiben grün; die Überschriftenhierarchie ist jetzt korrekt (eine `h1`).
- **Stylesheet-Wachstum:** zwölf neue Selektoren plus Hilfsregeln in einer Datei → wie bei
  #84/#85; eine Aufteilung in mehrere Dateien wäre eine Änderung des ui-theme-Vertrags
  (ein Stylesheet als Text) und gehört nicht in diesen Change.
