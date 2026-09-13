## Context

Vorhanden: `App` (`src/client/app/App.tsx`) rendert `AppShell` mit `header`/`main`/`footer`
und hält den globalen Hinweis (`hinweis`, `<p role="alert" class="app-shell-hinweis">` am
Anfang von `main`); `ChangePasswordForm` hält einen State `message`, der Erfolg
(`t('auth.password.changed')`) und Ablehnung (`result.message`) in demselben
`<p role="alert">` zeigt; `SessionRoom` zeigt dem Spielleiter `<p>Code: {state.code}</p>`
und setzt nach jedem Acknowledgement nur die Fehlermeldung (`setTokenError(ack.ok ? null :
ack.message)`, ebenso `setAnnotationError`); `MapPanel` ruft `mountMap` und lädt bei `ok`
die Instanzen neu. `ui-text` (#87) liefert `t`/`useT` und die Wörterbücher `de`/`en`
(Schlüsselgleichheit ist Typfehler und Test). `theme.css` (`ui-theme`) hat den
Format-Vertrag D7 (kein Farbwert außerhalb `:root`, `@media` nur der Bewegungsblock, jede
`@keyframes`-Regel und jede `animation`-Deklaration darin) und genau einen Bewegungsblock
am Dateiende. Die Icon-Registry (`ui-icons`) hat 54 feste Namen ohne `copy`. Es gibt in
`src/client` kein Element mit `role="status"`.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/ui-feedback/spec.md` und die MODIFIED-Deltas zu `user-auth` und `game-session`.
Bindend und nicht wiederholt: `constitution.md` §9 — ein Toast meldet, was der Server
bestätigt hat; er ändert nie den angezeigten Bestand und wird nie vor dem Acknowledgement
ausgelöst.

## Goals / Non-Goals

**Goals:**
- **Eine Datei, drei Exporte.** `ToastProvider`, `useToasts`, die Konstanten
  `TOAST_TTL_MS`/`TOAST_MAX` in `src/client/ui/toast.tsx`. Kein Kontext-Objekt nach außen,
  keine Bibliothek.
- **Timer gehören dem Provider.** Jeder Toast hat genau einen `setTimeout`; Dedupe ersetzt
  ihn, Verdrängen und Unmount räumen ihn. Nach dem Unmount steht kein Timer mehr aus.
- **Auslöser bleiben minimal.** An jeder Stelle genau eine Zeile im `ok`-Zweig; keine
  Änderung an Fehlerpfaden, Fassaden oder Bestandsanzeige.
- **Buchstabengleich unter Deutsch.** Vorhandene Beschriftungen und Anker bleiben; nur die
  in den Deltas genannten Szenarien ändern ihre Erwartung.

**Non-Goals:**
- Keine Toast-Varianten (Dauer, Typ, Icon), kein Schließen per Klick, kein Anhalten bei
  Hover, keine Aktion im Toast.
- Keine Umstellung von Fehlermeldungen, des globalen Hinweises (`session:ended`,
  Servererreichbarkeit) oder von `session:replaced` — das sind #90/#91.
- Kein `copy`-Icon in der Registry; keine Änderung an `AppShell`, Server, `shared/`, Prisma.
- Keine Übersetzung der übrigen Rohstrings in Raum-Panels und Bibliothek (Epic C).

## Decisions

### D1 — Modul `src/client/ui/toast.tsx`

Exporte:

```ts
export const TOAST_TTL_MS = 2800
export const TOAST_MAX = 3
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element
export function useToasts(): { push: (text: string) => void }
```

- **Kontext:** `createContext<{ push: (text: string) => void }>({ push: () => {} })` —
  der Standardwert ist der No-Op für Aufrufer außerhalb des Providers (Requirement
  „Auslösen ohne Provider"). `useToasts()` ist `useContext` dieses Kontexts.
- **Zustand des Providers:** ein `useState<Toast[]>` (`Toast = { id: number; text: string }`)
  für das Rendern und ein `useRef<Toast[]>` als maßgebliche Liste, die `push` synchron
  liest und schreibt (Dedupe muss den *aktuellen* Stand sehen, ohne einen Timer in einem
  `setState`-Updater zu starten — Updater laufen unter StrictMode doppelt). Nach jeder
  Änderung `setToasts([...listRef.current])`. Timer in einem
  `useRef<Map<number, ReturnType<typeof setTimeout>>>`; `id` aus einem `useRef`-Zähler.
- **`push(text)`** (per `useCallback` mit leerer Abhängigkeitsliste — stabil, damit
  Auslöser es in Effekten nutzen könnten):
  1. Leerer Text (`text === ''`): nichts tun.
  2. Steht ein Toast mit `toast.text === text` in der Liste: seinen Timer per `clearTimeout`
     abbrechen, neuen Timer über `TOAST_TTL_MS` starten, in der Map ersetzen, Liste
     unverändert lassen, **kein** `setToasts` (Requirement „Dedupe gleicher Texte").
  3. Sonst: neues `{ id, text }` hinten anhängen; ist die Länge danach größer als
     `TOAST_MAX`, das erste Element entfernen und dessen Timer abbrechen (Requirement
     „Stapelgrenze"); Timer über `TOAST_TTL_MS` starten, der den Toast per `id` aus der
     Liste und der Map entfernt und `setToasts` ruft; `setToasts`.
- **Unmount:** ein `useEffect` mit leerer Abhängigkeitsliste, dessen Cleanup alle Timer der
  Map abbricht, die Map leert und `listRef.current = []` setzt (Requirement „Räumen beim
  Unmount"). Kein `setToasts` im Cleanup.
- **Markup** (verbindlich):
  ```
  <ToastContext.Provider value={value}>
    {children}
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} className="toast">{toast.text}</div>)}
    </div>
  </ToastContext.Provider>
  ```
  Der Host wird immer gerendert, auch leer — eine Live-Region muss im DOM stehen, bevor
  sich ihr Inhalt ändert, sonst lesen Screenreader den ersten Toast nicht. `value` ist
  `useMemo(() => ({ push }), [push])`. Keine Schaltfläche, kein `tabIndex`, kein Handler im
  Toast.
- Die Datei importiert nur `react`. Kein Import aus `i18n` — der Text kommt fertig
  übersetzt vom Aufrufer.

### D2 — `App` umschließt die Shell

`App` gibt `<ToastProvider><AppShell …>{content}</AppShell></ToastProvider>` zurück. Damit
steht der Host als Geschwister nach dem `<footer>`; `ui-shell` („Header, Main und Footer in
dieser Reihenfolge") bleibt erfüllt, und der Host liegt außerhalb von `main`. `App`
importiert `../ui/toast.js`. `main.tsx` und `AppShell` bleiben unverändert.

### D3 — Wörterbücher (`de.ts`, `en.ts`)

Neue Schlüssel, in beiden Dateien am Ende der Tabelle (verbindlich, buchstabengleich):

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `session.copyCode` | Kopieren | Copy |
| `toast.codeCopied` | Sitzungscode kopiert | Session code copied |
| `toast.tokenCreated` | Token angelegt | Token created |
| `toast.mapMounted` | Karte eingehängt | Map mounted |
| `toast.annotationRemoved` | Anmerkung entfernt | Annotation removed |
| `toast.annotationsRemoved` | Anmerkungen entfernt | Annotations removed |

`auth.password.changed` (`Passwort geändert.` / `Password changed.`) bleibt und wird zum
Toast-Text.

### D4 — Auslöser

Jede Stelle holt `const { push } = useToasts()` (und, falls noch nicht vorhanden,
`const t = useT()`), und ruft `push(t('<schlüssel>'))` genau im Erfolgszweig. Nichts
Optimistisches: der Aufruf steht *nach* dem `ok`-Test des Acknowledgements bzw. der
Antwort.

- **`ChangePasswordForm.tsx`:** im `result.ok`-Zweig `push(t('auth.password.changed'))`
  und `setMessage(null)` statt `setMessage(t('auth.password.changed'))`; Felder werden
  wie bisher geleert. `message` trägt nur noch Ablehnung (`result.message`) und den
  Netzfehler (`t('auth.password.failed')`); das `<p role="alert">` bleibt für diese Fälle
  unverändert.
- **`SessionRoom.tsx`, Sitzungscode:** die Zeile `<p>Code: {state.code}</p>` wird zu
  ```
  <p>
    Code: {state.code}{' '}
    <button type="button" onClick={handleCopyCode}>{t('session.copyCode')}</button>
  </p>
  ```
  (nur gerendert, wenn `state.code !== undefined` — also nur für den Spielleiter, wie
  bisher). `handleCopyCode` liest `state.code`, ruft `navigator.clipboard.writeText(code)`
  und löst im `then` `push(t('toast.codeCopied'))` aus; im `catch` `console.error(error)`,
  kein Toast, kein State. Fehlt `navigator.clipboard` (kein sicherer Kontext), wird der
  Aufruf als abgelehnt behandelt (`Promise.reject(new Error('Zwischenablage nicht
  verfügbar'))` in denselben `catch`) — kein Absturz, kein Toast.
- **`SessionRoom.tsx`, Token:** in `handleTokenCreate` nach `setTokenError(ack.ok ? null :
  ack.message)` zusätzlich `if (ack.ok) push(t('toast.tokenCreated'))`. Die übrigen
  Token-Handler (verschieben, entfernen, zuweisen, Werte, Markierungen, Freigaben) bleiben
  ohne Toast — nicht im Issue.
- **`SessionRoom.tsx`, Anmerkungen:** in `handleAnnotationDelete` nach
  `setAnnotationError(…)` zusätzlich `if (ack.ok) push(t(target.kind === 'eine' ?
  'toast.annotationRemoved' : 'toast.annotationsRemoved'))`. Anlegen einer Anmerkung
  bleibt ohne Toast (Zeichnen ist Dauerhandlung, jede Bestätigung würde stören).
- **`MapPanel.tsx`:** im `result.ok`-Zweig von `handleMount` nach `await reloadInstances()`
  `push(t('toast.mapMounted'))`. `MapPanel` importiert dafür `../ui/toast.js` und
  `../i18n/locale.js`; seine übrigen Texte bleiben Rohstrings (Epic C). Aushängen und
  Aktivieren bleiben ohne Toast — nicht im Issue.

### D5 — Stylesheet (Abschnitt „Rückmeldungen" in `theme.css`)

Nach dem Abschnitt „Textschlüssel" und vor dem Bewegungsblock ein Kommentar
`/* Rückmeldungen (ui-feedback, #88) */` und diese Regeln — nur `var(--…)`, kein Farbwert,
kein neues `@media`, keine Bewegungsdeklaration außerhalb des Bewegungsblocks:

- `.toast-host`: `position: fixed`, `left: 50%`, `bottom: var(--space-5)`,
  `transform: translateX(-50%)`, `z-index: 20`, `display: flex`,
  `flex-direction: column`, `align-items: center`, `gap: var(--space-2)`,
  `max-width: min(90vw, 30rem)`, `pointer-events: none`.
- `.toast`: `padding: var(--space-2) var(--space-4)`, `border: 1px solid var(--gold-border)`,
  `border-radius: var(--radius-pill)`, `background: var(--panel-grad)`,
  `color: var(--color-text)`, `font-size: var(--font-size-2)`,
  `box-shadow: var(--shadow-panel)`, `text-align: center`.

Im bestehenden Bewegungsblock (`@media (prefers-reduced-motion: no-preference) { … }`)
werden ergänzt — innerhalb der Klammern des Blocks, kein zweiter Block:

- `@keyframes toast-in { from { opacity: 0; transform: translateY(var(--space-2)); } to { opacity: 1; transform: none; } }`
- `.toast { animation: toast-in 0.18s ease-out; }`

`transform` außerhalb von `@keyframes`/`transition` ist keine Bewegungsdeklaration im Sinne
von `ui-theme` (nur `transition*`, `animation*`, `@keyframes` zählen) — `.toast-host` darf
`transform: translateX(-50%)` also außerhalb des Blocks tragen.

### D6 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle und Namen, nie über `id`/`querySelector`;
Listen und Formulare gescoped über `within`):

| Element | Adresse |
|---|---|
| Toast-Host | `getByRole('status')` — genau eines im Dokument; Attribute `aria-live` per `getAttribute`, Klasse `toast-host` per `classList` |
| Toasts | Kinder des Hosts: `host.children` (Länge, Reihenfolge, `textContent`, `classList` enthält `toast`); ein bestimmter Text per `within(host).getByText('…')` bzw. `queryByText` für Abwesenheit |
| Kein Toast | `host.children.length` ist `0` bzw. `within(host).queryByText('…')` ist `null` |
| Konstanten | Exporte `TOAST_TTL_MS` und `TOAST_MAX` aus `src/client/ui/toast.tsx` |
| Provider und Hook | Exporte `ToastProvider` und `useToasts` aus derselben Datei; ein Testszenario rendert dafür eine eigene kleine Komponente, die `useToasts()` holt und `push` auf einen Klick oder direkt im Effekt aufruft |
| Zeit | Jest-Fake-Timer (`jest.useFakeTimers()` vor dem Rendern); Vorrücken in `act(…)`; „kein Timer steht aus" = `jest.getTimerCount()` ist `0` nach `unmount()` und Vorrücken |
| Zwischenablage | vor dem Szenario `navigator.clipboard` per `Object.defineProperty` (mit `configurable: true`) durch ein Objekt mit einer `writeText`-Jest-Funktion ersetzen, die ein aufgelöstes bzw. abgelehntes Promise liefert; danach wiederherstellen. Geprüft wird der eine Aufruf mit genau `ABC234` |
| Schaltfläche Kopieren | `getByRole('button', { name: 'Kopieren' })` innerhalb von `main`; Abwesenheit per `queryByRole` |
| Passwortformular | wie bisher (Felder über Label, Absenden über das Formular); nach Erfolg: `within(form).queryByRole('alert')` ist `null`, Toast `Passwort geändert.` im Host |
| Token anlegen | Formular und Schaltfläche `Anlegen` wie in der Token-Suite (`session-token`, „Tokenansicht im Raum"); der gemockte `createToken` der Socket-Fassade liefert `{ ok: true, token }` bzw. `{ ok: false, message }` |
| Karte einhängen | Kartenverwaltung wie in der Suite zu `session-map` („Kartenansicht im Raum"): Auswahl `Karte aus der Bibliothek`, Absenden des Einhängen-Formulars; gemocktes `fetch` antwortet auf `POST /api/sessions/<id>/maps` mit `201` und einer Instanz |
| Anmerkung entfernen | Schaltflächen `Entfernen` (im Listeneintrag) und `Meine entfernen` wie in der Suite zu `session-annotation`; gemocktes `deleteAnnotation` liefert `{ ok: true }` |
| Englisch | `setLocale('en')` aus `src/client/i18n/locale.ts` vor dem Rendern, danach zurück auf `de` (Muster aus `ui-text`) |

Die Szenarien der Requirements „Toast-Host und Auslösen", „Lebensdauer", „Stapelgrenze",
„Dedupe", „Räumen beim Unmount" und „Ohne Provider" brauchen keine `App`: sie rendern den
Provider (bzw. bewusst keinen) um eine kleine Testkomponente. Die Szenarien „Auslöser im
Raum" und die MODIFIED-Szenarien rendern `App` mit gemocktem `fetch` und gemockter
Socket-Fassade nach dem Muster der bestehenden Raum-Suiten. Bestehende Suiten, deren
Szenarien in den Deltas geändert sind (`user-auth` „Erfolgreiche Passwortänderung wird
bestätigt", „Abgelehnte Passwortänderung wird angezeigt"; `game-session` „Raumansicht des
Spielleiters", „Raumansicht des Spielers"), werden auf die neuen Erwartungen umgestellt —
die Testnamen bleiben. Ein bestehender Test, der nach dem Passwortwechsel `/geändert/i`
sucht, bleibt auch mit dem Toast grün.

Stylesheet-Szenarien: `theme.css` als Text lesen (Kommentare entfernen, Whitespace
normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben
Helfer wie in der Theme-/Shell-/Start-/Text-Suite, sie können dupliziert werden.

### D7 — Reihenfolge der Kopplungen

`toast.tsx` importiert nur `react`. `App` importiert zusätzlich `toast.tsx`.
`ChangePasswordForm`, `SessionRoom`, `MapPanel` importieren `toast.tsx` (und `MapPanel`
neu `locale.ts`). `pixi.js` bleibt außerhalb der statischen Importkette von `App`
(unverändert: `canvas.ts` nur dynamisch aus `MapCanvas`).

## Risks / Trade-offs

- **`aria-live="polite"` liest gestapelte Toasts nacheinander vor** → gewollt: es sind
  kurze Texte; ein `assertive` wäre für Gelungenes zu laut.
- **Kein Schließen per Klick, `pointer-events: none`** → gewollt (proposal.md): Toasts sind
  nie interaktiv, damit sie nichts verdecken, worauf man klicken müsste. Wer länger lesen
  muss, bekommt Inline oder Banner.
- **Dedupe nur bei zeichengleichem Text** → `Token angelegt` zweimal in Folge zeigt einen
  Toast mit verlängerter Lebensdauer, nicht „2×". Ein Zähler käme erst mit einem Anlass.
- **`navigator.clipboard` fehlt außerhalb sicherer Kontexte (HTTP ohne localhost)** → der
  Knopf ist dann wirkungslos ohne Meldung; im Dev-Setup (localhost) und hinter TLS
  vorhanden. Eine Inline-Meldung für diesen Fall ist #90-Material.
- **Gespeicherte Meldung im Passwortformular wird beim Sprachwechsel nicht neu übersetzt**
  → wie #87; der Toast ist ohnehin nach 2,8 s weg.
- **`role="status"` ist neu im Dokument** → keine bestehende Abfrage nutzt diese Rolle;
  die Zustandspille ist ein `span` ohne Rolle.
- **StrictMode ruft Effekte doppelt** → der Unmount-Cleanup räumt eine leere Map; beim
  zweiten Mount ist nichts verloren, weil vor dem ersten `push` keine Timer existieren.
