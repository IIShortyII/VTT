## Context

Vorhanden: sieben Formulare im Client. `LoginForm`, `RegisterForm` (`src/client/auth/`),
`ChangePasswordForm` (im `<details class="start-account">` der Startansicht) und die
beiden Formulare in `SessionList` (`src/client/session/SessionList.tsx`, je in einem
`Modal`) tragen `.field-label`-Labels, halten je einen `error`/`message`-State als Text,
zeigen ihn als `<p role="alert" class="field-error">` unter allen Feldern und sperren die
Absende-Schaltfläche nur während `submitting`/`creating`/`joining`. Das Formular „Neue
Karte" in `MapLibrary` (`src/client/map/MapLibrary.tsx`) und das Formular `Tokens` in
`TokenPanel` (`src/client/session/TokenPanel.tsx`) sind Rohstring-Formulare ohne Klassen;
`TokenPanel.onCreate` ist `(input) => void`, `SessionRoom.handleTokenCreate` sendet
`createToken` über die Socket-Fassade, schreibt die Ablehnung in `tokenError` (Raum-Meldung)
und pusht bei Erfolg den Toast `Token angelegt`; das Panel leert das Namensfeld sofort beim
Absenden. Die Client-API-Module (`auth/api.ts`, `session/api.ts`, `map/api.ts`) liefern
bei Ablehnung `{ ok: false, message, field? }` — `field` ist das Antwortfeld des Servers
bzw. der oberste zod-Pfad einer clientseitigen Vorprüfung. Der Server nennt `field` bei
Validierungsfehlern (zod-Pfad), beim vergebenen Nutzernamen (`username`), beim falschen
bisherigen Passwort (`currentPassword`), bei ungültigem Sitzungsnamen (`name`) und Code
(`code`), beim ungültigen Kartennamen (`name`); nicht bei `401` der Anmeldung, `409` der
vergebenen E-Mail und `404` des Beitritts. `ui-text` (#87) liefert `t`/`useT`; `ui-theme`
hat `.field-label` und `.field-error` als Grundelemente sowie den Format-Vertrag (kein
Farbwert außerhalb `:root`, `@media` nur der Bewegungsblock, jede `@keyframes`-Regel und
jede `animation`-Deklaration darin) mit genau einem Bewegungsblock am Dateiende. Die
Icon-Registry kennt kein Lade-Icon. `ui-start` führt `.auth-panel` und `.panel-actions`
als Start-Selektoren, die im Stylesheet vorhanden sein müssen.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/ui-form/spec.md` und die MODIFIED-Deltas. Bindend und nicht wiederholt:
`constitution.md` §9 — die clientseitige Gültigkeit sperrt die Schaltfläche, sie ersetzt
keine Prüfung an der Grenze; was ein Server ablehnt, zeigt der Client, er erklärt nichts
selbst für gelungen.

## Goals / Non-Goals

**Goals:**
- **Eine Datei, zwei Komponenten, eine Konstante.** `Field`, `SubmitButton` und
  `SLOW_AFTER_MS` in `src/client/ui/form.tsx`. Keine Bibliothek, kein `cloneElement`, kein
  Formular-Framework.
- **Fehler am Feld.** Jede Ablehnung mit `field`, das ein Feld des Formulars benennt, steht
  als Feldfehler an diesem Feld; alles andere als Formularfehler unter dem letzten Feld.
- **Sperre aus dem gemeinsamen Schema.** `gültig` ist `safeParse(...).success` des
  Schemas aus `src/shared/`, das der Server für dieselbe Anfrage benutzt.
- **Buchstabengleich unter Deutsch.** Beschriftungen, `name`-Attribute, `autoFocus`,
  Formularnamen und Handler-Abläufe bleiben; nur die in den Deltas genannten Szenarien
  ändern ihre Erwartung.

**Non-Goals:**
- Keine clientseitigen Fehlertexte für Validierungsregeln (die Schaltfläche sperrt nur;
  Trade-off aus dem Issue, siehe Risks).
- Keine Umformulierung von Servertexten außer der Beitrittsmeldung (#109).
- Kein Umbau des Rasterformulars der Kartenansicht, des Alias-Formulars im Raum, der
  Wertefelder je Token, der Fog- und Anmerkungs-Panels (Epic C).
- Keine Übersetzung der Rohstrings in `MapLibrary` und `TokenPanel` (Epic C); der
  Rückversicherungstext kommt trotzdem übersetzt, weil der Baustein ihn selbst zieht.
- Keine Feldfehler im Token-Formular (Ablehnung bleibt Raum-Meldung, #95).
- Kein Entfernen der Regel `.panel-actions` aus dem Stylesheet (Start-Selektor-Vertrag von
  `ui-start`; das Markup benutzt sie nicht mehr).

## Decisions

### D1 — Modul `src/client/ui/form.tsx`

Exporte (verbindlich):

```ts
export const SLOW_AFTER_MS = 4000

export interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}
export interface FieldProps {
  id: string
  label: string
  error?: string | null
  children: (control: FieldControlProps) => ReactNode
}
export function Field(props: FieldProps): JSX.Element

export interface SubmitButtonProps {
  pending: boolean
  disabled?: boolean
  className?: string
  children: ReactNode
}
export function SubmitButton(props: SubmitButtonProps): JSX.Element
```

- **`Field`-Markup** (verbindlich; `errorId` ist `` `${id}-error` ``, `hasError` ist
  `typeof error === 'string' && error !== ''`):
  ```
  <div className="form-field">
    <label className="field-label" htmlFor={id}>{label}</label>
    {children(hasError ? { id, 'aria-invalid': true, 'aria-describedby': errorId } : { id })}
    {hasError && <p id={errorId} className="field-error" role="alert">{error}</p>}
  </div>
  ```
  Ohne Fehler bekommt das Steuerelement nur `id` — kein `aria-invalid="false"`, kein leeres
  `aria-describedby`. Der Aufrufer breitet die Steuerelement-Props auf sein `<input>` /
  `<select>` aus und setzt daneben `name`, `type`, `value`, `onChange`, `autoComplete`,
  `autoFocus`, `required`, `minLength`/`maxLength` wie bisher (die HTML-Constraints bleiben
  als Browser-Hinweis, die Sperre kommt aus D3).
- **`SubmitButton`-Markup** (verbindlich):
  ```
  <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending ? 'true' : undefined}>
    {pending && <span className="spinner" aria-hidden="true" />}
    {pending && slow ? t('form.stillWorking') : children}
  </button>
  ```
  `t` aus `useT()`; `className` wird nur gesetzt, wenn übergeben (sonst kein
  `class`-Attribut). Der Spinner ist ein leeres `<span>`, gezeichnet allein per CSS (D9).
- **Timer** (`slow`): `useState(false)` plus ein `useEffect` mit Abhängigkeit `[pending]`.
  Ist `pending` wahr: `setTimeout` auf `SLOW_AFTER_MS`, der `slow` auf `true` setzt;
  Cleanup ruft `clearTimeout` und setzt `slow` auf `false`. Ist `pending` falsch: `slow`
  auf `false`, kein Timer. Damit zählt jedes neue `pending` von vorn, das Ende von `pending`
  stellt die Beschriftung sofort wieder her, und beim Unmount räumt das Cleanup den Timer,
  bevor die Zeit weiterläuft (Requirement „Absende-Schaltfläche").
- Die Datei importiert `react` und `../i18n/locale.js`, sonst nichts.

### D2 — Formularfehler und Fehlerzuordnung

Jedes Formular (D4–D7) hält zwei Zustände: `fieldErrors` als partielles Objekt
„Feldname → Meldung" (Feldnamen sind die `name`-Attribute des Formulars, gleichzeitig die
`field`-Werte des Servers) und `formError` als Text oder `null`. Ablauf im Submit-Handler,
für alle Formulare gleich:

1. `event.preventDefault()`. Ist das Formular nicht gültig (D3) oder `pending`: nichts
   weiter (Schutz gegen ein programmatisches `submit`; die Schaltfläche ist ohnehin
   gesperrt).
2. `pending` auf `true`, `fieldErrors` auf `{}`, `formError` auf `null`.
3. Anfrage. Bei `ok`: bisheriger Erfolgspfad. Bei Ablehnung: ist `result.field` einer der
   Feldnamen des Formulars, `fieldErrors[field] = message`; sonst `formError = message`.
   Im `catch`: `formError` = der bisherige generische Text (`t('auth.login.failed')` usw.).
4. `finally`: `pending` auf `false`.

Fehler bleiben bis zum nächsten Absenden stehen; ein Tippen im Feld löscht sie nicht. Der
Formularfehler wird als `<p className="form-error" role="alert">{formError}</p>` nach dem
letzten `Field` und vor der Buttonleiste gerendert, nur wenn `formError` nicht `null` ist.
Jedes `Field` bekommt `error={fieldErrors.<name> ?? null}`.

Die Zuordnung ist in jedem Formular vier Zeilen und bleibt dort — keine dritte Komponente,
kein Hook (Entscheidung „zwei Komponenten in einer Datei").

### D3 — Gültigkeit aus dem gemeinsamen Schema

`valid` ist ein per Render berechneter Wahrheitswert (kein State):

| Formular | Ausdruck |
|---|---|
| Anmelden | `LoginInputSchema.safeParse({ email, password }).success` |
| Registrieren | `RegisterInputSchema.safeParse({ username, email, password }).success` |
| Passwort ändern | `ChangePasswordInputSchema.safeParse({ currentPassword, newPassword }).success` |
| Sitzung erstellen | `CreateSessionInputSchema.safeParse({ name }).success` |
| Beitreten | `JoinSessionInputSchema.safeParse({ code }).success` |
| Neue Karte | `CreateMapInputSchema.safeParse({ name }).success` |
| Token anlegen | `CreateTokenInputSchema.omit({ sessionId: true }).safeParse(payload).success`, wobei `payload` genau das Objekt ist, das `onCreate` erhält (Name, Farbe, Symbol oder `null`, `Number(size)`, `Number(col)`, `Number(row)`) |

Die Schemata kommen aus `src/shared/auth.ts`, `session.ts`, `map.ts`, `token.ts` (bereits
exportiert; `CreateTokenInputSchema.omit` als Modulkonstante außerhalb der Komponente
anlegen, nicht je Render). Die Absende-Schaltfläche bekommt `disabled={!valid}` und
`pending={pending}`. Ein `LoginInputSchema`-Fehlschlag sperrt also auch bei syntaktisch
ungültiger E-Mail; ein `RegisterInputSchema`-Fehlschlag bei zu kurzem Passwort oder
Nutzernamen — ohne Text (Risks).

### D4 — Auth-Formulare (`LoginForm`, `RegisterForm`, `ChangePasswordForm`)

- `<form className="form-grid" …>` (bisheriges `onSubmit`); `<h2>` bleibt, wo eines ist.
- Je Feld ein `Field` mit `id` wie bisher (`login-email`, `login-password`,
  `register-username`, `register-email`, `register-password`, `change-password-current`,
  `change-password-new`), `label` wie bisher (`t('auth.…')`), `error` aus `fieldErrors`
  unter dem Feldnamen `email`/`password`/`username`/`currentPassword`/`newPassword`; das
  Steuerelement ist das bisherige `<input>` mit den Steuerelement-Props ausgebreitet.
- Formularfehler nach dem letzten `Field` (D2). Die Zustände `error`/`message` entfallen
  zugunsten von `fieldErrors`/`formError`; `submitting` heißt `pending`.
- Buttonleiste `<div className="form-actions">` mit `SubmitButton` (`className="primary"`
  bei Anmelden und Registrieren, ohne `className` bei Passwort ändern) und — bei Anmelden und
  Registrieren — der bisherigen Link-Schaltfläche (`className="link"`, `type="button"`).
- Passwort ändern: Erfolg wie bisher (Toast, Felder leeren, kein Fehler); Ablehnung mit
  `field` `currentPassword` landet am Feld `Bisheriges Passwort`.

### D5 — Startformulare in `SessionList`

- Beide Formulare: `className="form-grid"`, `Field` für `Name` (`id` `session-name`, Feldname
  `name`) bzw. `Sitzungscode` (`id` `session-code`, Feldname `code`) mit den bisherigen
  `<input>`-Attributen (`autoFocus`, `required`), Formularfehler (D2), dann
  `<div className="form-actions">` mit `SubmitButton className="primary"` (`Erstellen` bzw.
  `Beitreten`) und der bisherigen Schaltfläche `Abbrechen` (`type="button"`, ohne
  `disabled`). `panel-actions` wird im Markup durch `form-actions` ersetzt.
- `createError`/`joinError` werden zu je einem Paar `createFieldErrors`/`createFormError`
  bzw. `joinFieldErrors`/`joinFormError`; `open` und `close` leeren alle vier.
  `creating`/`joining` bleiben als `pending`-Quelle.

### D6 — Formular „Neue Karte" in `MapLibrary`

- Nur das Formular unter `<h2>Neue Karte</h2>`: `className="form-grid"`, `Field` `Name`
  (`id` `map-name`, Feldname `name`, `required` bleibt) und `Field` `Bilddatei` (`id`
  `map-file`, kein Fehler — der Upload hat kein Feld, seine Ablehnung ist Formularfehler),
  Formularfehler, `<div className="form-actions">` mit `SubmitButton` `Anlegen` (ohne
  `className`). Beschriftungen bleiben Rohstrings.
- `createError` wird zu `createFieldErrors`/`createFormError`; `creating` ist `pending`.
  Ablauf wie D2: Ablehnung von `createMap` mit `field` `name` → Feldfehler; Ablehnung von
  `uploadMapImage` und `catch` → Formularfehler (`GENERIC_CREATE_ERROR_MESSAGE` bleibt).
- Das Rasterformular der Kartenansicht bleibt unverändert.

### D7 — Formular `Tokens` in `TokenPanel` und `SessionRoom`

- `TokenPanelProps.onCreate` wird `(input) => Promise<boolean>`. `SessionRoom.handleTokenCreate`
  gibt die Kette zurück: ohne Socket `Promise.resolve(false)`; sonst `createToken(...).then(ack
  => { …wie bisher (tokenError, Toast)…; return ack.ok }).catch(error => { console.error(error);
  return false })`.
- `TokenPanel` hält `pending`; `handleSubmit`: `preventDefault`, bei nicht gültig oder
  `pending` nichts; sonst `pending` auf `true`, `await onCreate(payload)`, bei `true`
  `setName('')` (Farbe, Symbol, Größe, Spalte, Zeile bleiben), `finally` `pending` auf
  `false`. Der Name wird nicht mehr vor dem Acknowledgement geleert.
- Markup: `<form className="form-grid" …>`; `Field` für `Name` (`id` `token-panel-name`),
  `Farbe` (`token-panel-color`), `Größe` (`token-panel-size`, Steuerelement ist das
  `<select>`), `Spalte` (`token-panel-col`), `Zeile` (`token-panel-row`) — je ohne `error`;
  die Symbol-Optionsgruppe wird `<fieldset className="form-field form-field--row">` mit
  `<legend className="field-label">Symbol</legend>` und den bisherigen Optionsfeldern; zum
  Schluss `<div className="form-actions">` mit `SubmitButton` `Anlegen` (ohne `className`,
  `disabled={!valid}`, `pending={pending}`). Labels, `name`-Attribute und Optionstexte bleiben
  buchstabengleich.
- Die Ablehnung bleibt `tokenError` in der Raumansicht; das Panel rendert keinen
  Formularfehler.

### D8 — Server

- `src/server/session/routes.ts`: `JOIN_FAILURE_MESSAGE` wird
  `'Sitzungscode prüfen und ob die Spielleitung die Sitzung geöffnet hat.'`; der `404`-Aufruf
  von `sendError` für unbekannten Code bzw. geschlossene Sitzung bekommt als fünftes Argument
  `'code'`. Beide Fälle bleiben dieselbe Zeile (§9.2).
- `src/server/auth/routes.ts`: beide `409`-Aufrufe mit `EMAIL_TAKEN_MESSAGE` (Vorprüfung
  und Unique-Verletzung) bekommen als fünftes Argument `'email'`. Texte unverändert.
- Keine Änderung an `shared/` — `ErrorOutputSchema` hat `field` bereits optional.

### D9 — Wörterbücher (`de.ts`, `en.ts`)

Ein neuer Schlüssel am Ende der Tabelle (verbindlich, buchstabengleich; Auslassungspunkte
als ein Zeichen `…`):

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `form.stillWorking` | Verbinde noch… das kann einen Moment dauern. | Still connecting… this may take a moment. |

### D10 — Stylesheet (Abschnitt „Formulare" in `theme.css`)

Nach dem Abschnitt „Dialoge" und vor dem Bewegungsblock ein Kommentar
`/* Formulare (ui-form, #90) */` und diese Regeln — nur `var(--…)`, kein Farbwert, kein
neues `@media`, keine Bewegungsdeklaration außerhalb des Bewegungsblocks:

- `.form-grid`: `display: grid`, `gap: var(--space-3)`, `margin: 0`.
- `.form-field`: `display: grid`, `gap: var(--space-1)`, `margin: 0`, `padding: 0`,
  `border: 0`, `min-width: 0` (die Regel gilt auch für das `<fieldset>` der Optionszeile;
  `border`/`padding` heben die Browser-Vorgaben des Fieldsets auf).
- `.form-field--row`: `grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr))`,
  `column-gap: var(--space-2)`; `.form-field--row > legend { grid-column: 1 / -1; }`;
  `.form-field--row > label { display: inline-flex; align-items: center; gap: var(--space-1); }`.
- `.form-actions`: `display: flex`, `flex-wrap: wrap`, `gap: var(--space-2)`,
  `align-items: center`, `margin-top: var(--space-2)`.
- `.form-error`: `margin: 0`, `font-size: var(--font-size-1)`, `color: var(--red)`.
- `.spinner`: `display: inline-block`, `width: 1em`, `height: 1em`, `margin-right: var(--space-1)`,
  `vertical-align: -0.15em`, `border: 2px solid var(--color-border)`,
  `border-top-color: var(--accent-9)`, `border-radius: 50%` — ohne `animation`.
- Die Regeln `.auth-panel form { … }` und `.start-account form { … }` entfallen (das Raster
  übernimmt); `.auth-panel { … }`, `.start-account > summary { … }` und `.panel-actions { … }`
  bleiben.

Im bestehenden Bewegungsblock (`@media (prefers-reduced-motion: no-preference) { … }`)
werden ergänzt — innerhalb der Klammern des Blocks, kein zweiter Block:

- `@keyframes spin { to { transform: rotate(360deg); } }`
- `.spinner { animation: spin 0.8s linear infinite; }`

### D11 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle, Label und Namen, nie über `id`/`querySelector`;
Formulare über ihren zugänglichen Namen bzw. `within` des Dialogs/Panels scopen):

| Element | Adresse |
|---|---|
| Feld | Steuerelement über sein Label (`Sitzungscode`, `E-Mail`, `Name`, …); Attribute `aria-invalid`, `aria-describedby`, `id` per `getAttribute`; Feldhülle = `parentElement` des Steuerelements (Klasse `form-field`); das Label = das `<label>` mit `for` gleich der `id` (Klasse `field-label`) |
| Feldfehler | das Element, dessen `id` dem `aria-describedby` des Steuerelements entspricht: Rolle `alert`, Klasse `field-error`, Text = Meldung; „nicht im Label" = sein `parentElement` ist die Feldhülle; „nach dem Textfeld" = `compareDocumentPosition` oder Reihenfolge der Kinder der Feldhülle |
| Formularfehler | innerhalb des Formulars das Element mit Rolle `alert` und Klasse `form-error`; „kein Formularfehler" = kein Element mit Klasse `form-error` im Formular |
| Absende-Schaltfläche | Schaltfläche beim Namen (`Anmelden`, `Registrieren`, `Passwort ändern`, `Erstellen`, `Beitreten` innerhalb des Formulars, `Anlegen`); `disabled` als Property, `aria-busy` per `getAttribute`; Spinner = erstes Kind mit Klasse `spinner` und `aria-hidden="true"`; der Text der Schaltfläche = `textContent` (der Spinner ist leer) |
| Ladezustand | `fetch`-Mock, dessen Promise für die Anfrage erst im Test aufgelöst wird (Deferred), unter `jest.useFakeTimers()`; Vorrücken per `act` um die angegebenen Millisekunden; „kein Timer mehr aus" = `jest.getTimerCount()` ist 0 unmittelbar nach `unmount()` |
| Sprache | `setLocale('en')` aus `src/client/i18n/locale.ts` vor dem Rendern, im Cleanup zurück auf `de` |
| Baustein-Szenarien | rendern `Field` bzw. `SubmitButton` (Exporte aus `src/client/ui/form.tsx`) in einer kleinen Testkomponente ohne `App`: für „Gesperrt, solange ungültig" ein `<form onSubmit>` mit Zähler, dessen Schaltfläche geklickt wird — ein Klick auf eine gesperrte Schaltfläche löst in React kein Submit aus |
| Formular-Szenarien | rendern `App` mit gemocktem `fetch` (und Socket-/Canvas-Fassade für den Raum) nach dem Muster der bestehenden Auth-, Start-, Bibliotheks- und Token-Suiten; „das Formular abgeschickt wird" = Klick auf die Schaltfläche **und** ein Submit-Ereignis auf dem Formular — beides darf keine Anfrage auslösen |
| Server-Szenarien | Integrationstests gegen die Wegwerf-DB wie bisher; `field` und `message` aus dem JSON-Body |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben Helfer wie in der Theme-/Dialog-Suite, sie können dupliziert werden |

Szenarien, die Exporte des noch fehlenden Moduls `form.tsx` importieren, gehören in eine
eigene Datei, damit ein Ladefehler die bestehenden Suiten nicht mitreißt. Bestehende
Szenarien, die ein Formular mit leeren Pflichtfeldern absenden (z. B. Anmelden ohne
Eingabe), müssen die Felder künftig gültig füllen: `LoginInputSchema` verlangt eine
syntaktisch gültige E-Mail und ein nicht leeres Passwort, `RegisterInputSchema` zusätzlich
Nutzername 3–24 Zeichen und Passwort 15–128 Zeichen, `ChangePasswordInputSchema` ein neues
Passwort von 15–128 Zeichen, `JoinSessionInputSchema` einen Code aus sechs Zeichen
(`SESSION_CODE_PATTERN`), `CreateTokenInputSchema` eine Farbe `#rrggbb`. Beispielwerte wie
`ABC234`, `spieler@example.com`, `Gandalf` und ein Passwort von mindestens 15 Zeichen sind
schemakonform.

### D12 — Reihenfolge der Kopplungen

`form.tsx` importiert `react` und `locale.ts`. Die sieben Formulare importieren `form.tsx`
und ihr Schema aus `src/shared/`. `SessionRoom` ändert nur die Rückgabe von
`handleTokenCreate`. `pixi.js` bleibt außerhalb der statischen Importkette von `App`
(unverändert). Server: nur `auth/routes.ts` und `session/routes.ts`, je zwei Zeilen.

## Risks / Trade-offs

- **Gesperrte Schaltfläche ohne Grund** → wer ein zu kurzes Passwort oder eine E-Mail ohne
  `@` tippt, sieht nur `disabled`; Browser-Tooltips der HTML-Constraints erscheinen erst beim
  Absenden, das nicht möglich ist. Entscheidung aus dem Issue; ein Folge-Issue kann
  Live-Hinweise am Feld ergänzen, der Baustein (`error`-Prop) trägt sie bereits.
- **Fehler bleiben beim Tippen stehen** → `aria-invalid` gilt, bis erneut abgesendet wird.
  Deterministisch und ohne zusätzlichen State; ein Löschen beim Tippen wäre ein späterer
  Schritt.
- **`field` aus einer clientseitigen Vorprüfung** (`api.ts` parst vor dem Senden) landet
  ebenfalls am Feld — gewollt: dieselbe Zuordnung wie vom Server, und durch D3 tritt der
  Fall praktisch nicht mehr ein.
- **Spinner ohne Bewegung** unter „Bewegung reduzieren" ist ein statischer Ring; die
  Rückversicherung nach 4 s bleibt als Text. Akzeptiert (#101: Bewegung opt-in).
- **`aria-busy` auf einer gesperrten Schaltfläche** → Screenreader lesen „beschäftigt",
  die Sperre verhindert Doppelklicks; kein `aria-live` nötig, weil die Rückversicherung
  denselben Knopf beschriftet.
- **Token-Formular wartet auf das Acknowledgement** → bei einer Socket-Ablehnung bleibt der
  Name stehen (vorher wurde er sofort geleert). Gewollt: der Spielleiter korrigiert statt neu
  zu tippen.
- **Beitrittsmeldung nennt „geöffnet"** → eine geöffnete Sitzung braucht keine anwesende
  Spielleitung; der Text ist damit genauer als „online" im Issue, verrät aber weiterhin nicht,
  welcher der beiden Fälle zutrifft.
