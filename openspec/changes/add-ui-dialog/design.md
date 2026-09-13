## Context

Vorhanden: `App` (`src/client/app/App.tsx`) gibt `ToastProvider` → `AppShell` → Inhalt
zurück; `SessionList` (`src/client/session/SessionList.tsx`) hält `panel` (`none` |
`erstellen` | `beitreten`) und rendert das Erstellen- bzw. Beitreten-Formular als
`<form class="panel" aria-labelledby=…>` unter dem Hero, die Hero-Aktionen tragen
`aria-expanded`; `MapLibrary` (`src/client/map/MapLibrary.tsx`) hält `confirmingDelete` und
beschriftet denselben Knopf mit `Löschen` bzw. `Wirklich löschen`, die Rohstrings der
Bibliothek sind Modulkonstanten ohne `useT`. `ui-text` (#87) liefert `t`/`useT` mit
`{platzhalter}`-Ersetzung und die Wörterbücher `de`/`en` (Schlüsselgleichheit ist Typfehler
und Test). `ui-icons` hat `close` (X) und die Komponente `IconButton` (`aria-label` gleich
`label`, Klasse `icon-button`). `theme.css` (`ui-theme`) hat den Format-Vertrag (kein
Farbwert außerhalb `:root`, `@media` nur der Bewegungsblock, jede `@keyframes`-Regel und
jede `animation`-Deklaration darin) und genau einen Bewegungsblock am Dateiende; der
Fokusring nutzt bereits `color-mix(in srgb, var(--accent-9) 35%, transparent)`. Kein
Element im Layout trägt `transform` oder `filter` außer Schaltflächen im Hover und dem
Toast-Host selbst. Es gibt in `src/client` kein Element mit `role="dialog"` oder
`role="alertdialog"`.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/ui-dialog/spec.md` und die MODIFIED-Deltas zu `map-library` und `ui-start`.
Bindend und nicht wiederholt: `constitution.md` §9 — ein Dialog fragt eine Absicht ab; ob
gelöscht, erstellt oder beigetreten wurde, entscheidet weiterhin allein die Antwort des
Servers.

## Goals / Non-Goals

**Goals:**
- **Zwei Dateien, vier Exporte.** `Modal` in `src/client/ui/Modal.tsx`; `ConfirmProvider`,
  `useConfirm` und der Typ `ConfirmOptions` in `src/client/ui/confirm.tsx`. Keine Bibliothek,
  kein Portal, kein natives `<dialog>`.
- **Fokus ist deterministisch.** Beim Öffnen genau eine Regel (D2), Tab-Zyklus in der Box,
  Rückgabe an das Element, das beim Öffnen den Fokus hatte — sofern es noch im DOM steht.
- **Einsätze bleiben minimal.** In `MapLibrary` ersetzt ein `await confirm(…)` den
  Zwei-Klick-Zustand; in `SessionList` wandern die zwei vorhandenen Formulare unverändert
  (Felder, `name`-Attribute, Beschriftungen, Handler) in ein `Modal`.
- **Buchstabengleich unter Deutsch.** Vorhandene Beschriftungen und Anker bleiben; nur die
  in den Deltas genannten Szenarien ändern ihre Erwartung.

**Non-Goals:**
- Kein Stapeln mehrerer Dialoge, kein `inert` auf dem Rest der Seite, keine Scroll-Sperre
  auf `body`, keine Größenvarianten außer `wide`.
- Keine Rückfrage vor `Sitzung beenden`, `Token entfernen`, `Bereich löschen`,
  Anmerkungen entfernen (Epic C); kein Dialog für `session:replaced` oder das Sitzungsende
  (#91); kein Kontomenü, kein Popover (#92).
- Keine Umstellung des Passwortformulars, keine Änderung an `AppShell`, `Hero`, Toast,
  Server, `shared/`, Prisma.
- Keine Übersetzung der übrigen Rohstrings der Kartenbibliothek (Epic C).

## Decisions

### D1 — Modul `src/client/ui/Modal.tsx`

Export (verbindlich):

```ts
export interface ModalProps {
  title: string
  onClose: () => void
  role?: 'dialog' | 'alertdialog' // Standard 'dialog'
  description?: string
  wide?: boolean
  children: ReactNode
}
export function Modal(props: ModalProps): JSX.Element
```

- **Markup** (verbindlich; `titleId`/`descriptionId` aus `useId()`):
  ```
  <div className="modal-backdrop" onClick={handleBackdropClick}>
    <div
      ref={boxRef}
      className={wide ? 'modal modal--wide' : 'modal'}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <IconButton name="close" label={t('dialog.close')} className="modal-close" onClick={onClose} />
      <h2 id={titleId} className="modal-title">{title}</h2>
      {description && <p id={descriptionId} className="modal-description">{description}</p>}
      {children}
    </div>
  </div>
  ```
  Die Schließen-Schaltfläche ist das erste Element in der Box (Requirement
  „Modal-Baustein"); `t` kommt aus `useT()`. Kein `tabIndex` auf Backdrop oder Box.
- **Backdrop-Klick:** `handleBackdropClick` ruft `onClose` nur, wenn `event.target ===
  event.currentTarget` — ein Klick in die Box (auch auf ihren Rand) schließt nicht.
- **Escape:** ein `useEffect` registriert auf `document` einen `keydown`-Handler, der bei
  `event.key === 'Escape'` `event.preventDefault()` und `onClose()` ruft; Cleanup entfernt
  ihn. Der Handler liest `onClose` über einen `useRef`, der bei jedem Render aktualisiert
  wird, damit der Effekt nur einmal registriert.
- **Tab-Zyklus:** `onKeyDown` auf der Box. Bei `Tab`: fokussierbare Elemente der Box per
  `querySelectorAll` mit dem Selektor
  `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),
  textarea:not([disabled]), [tabindex]:not([tabindex="-1"])` in Dokumentreihenfolge
  sammeln; ist die Liste leer, `preventDefault` und nichts weiter. Sonst: liegt
  `document.activeElement` auf dem letzten Element (oder außerhalb der Box) und `shiftKey`
  ist falsch → `preventDefault`, erstes Element fokussieren; liegt er auf dem ersten
  Element (oder außerhalb) und `shiftKey` ist wahr → `preventDefault`, letztes Element
  fokussieren. In allen anderen Fällen nichts (der Browser rückt selbst vor).
- **Auslöser merken — beim ersten Render, nicht im Effekt** (D2): ein
  `useRef<HTMLElement | null>`, das während des **Renderns** befüllt wird, solange es noch
  `null` ist: `document.activeElement`, falls es ein `HTMLElement` ist. Grund: React ruft
  `focus()` für Kinder mit `autoFocus` in der Commit-Phase auf, also **vor** jedem Effekt
  des Modals — ein im Effekt gelesenes `activeElement` wäre bereits das Eingabefeld bzw.
  `Abbrechen` in der Box, nicht der Auslöser. Nur der Render-Zeitpunkt liegt sicher davor.
- **Fokus beim Öffnen und Rückgabe** (D2): ein `useEffect` mit leerer Abhängigkeitsliste.
  Beim Mount: liegt der aktuelle Fokus **nicht** innerhalb der Box
  (`boxRef.current.contains(document.activeElement)` ist falsch), das erste fokussierbare
  Element der Box (Selektor wie oben) fokussieren — das ist in der Regel die
  Schließen-Schaltfläche. Cleanup: ist der gemerkte Auslöser vorhanden und sein
  `isConnected` wahr, `focus()` auf ihm; sonst nichts.
- Die Datei importiert `react`, `./Icon.js` und `../i18n/locale.js`.

### D2 — Fokusregel in einem Satz

Beim Öffnen erhält das erste fokussierbare Element der Box den Fokus, **außer** ein Kind
hat ihn bereits (React ruft `focus()` für Kinder mit `autoFocus` in der Commit-Phase, vor
dem Effekt des Modals). Damit setzt jeder Aufrufer seinen Startpunkt durch `autoFocus` auf
genau einem Kind: der Bestätigungsdialog auf `Abbrechen`, die Startformulare auf ihrem
Eingabefeld. Keine `initialFocus`-Prop. Dieselbe Reihenfolge zwingt dazu, den Auslöser
**beim Rendern** zu merken (D1): im Effekt trägt bereits das `autoFocus`-Kind den Fokus,
und die Rückgabe ginge an ein Element, das mit dem Modal verschwindet.

### D3 — Modul `src/client/ui/confirm.tsx`

Exporte (verbindlich):

```ts
export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}
export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean> }
```

- **Kontext:** `createContext<{ confirm: (options: ConfirmOptions) => Promise<boolean> }>`
  mit Standardwert `{ confirm: () => Promise.resolve(false) }` — Aufrufer außerhalb des
  Providers bekommen sofort `false` (Requirement „Ohne Provider").
- **Zustand:** `useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } |
  null>` für den offenen Dialog. `confirm(options)` (per `useCallback`, stabil): steht
  bereits ein Dialog offen, dessen `resolve(false)` rufen; dann ein neues Promise anlegen,
  dessen `resolve` mit den `options` in den State schreiben, das Promise zurückgeben.
  `settle(value)`: den State auf `null` setzen und `resolve(value)` rufen. Beim Unmount des
  Providers ein offenes Promise mit `false` auflösen (Effekt-Cleanup über einen `useRef`
  auf den aktuellen State).
- **Markup** (verbindlich):
  ```
  <ConfirmContext.Provider value={value}>
    {children}
    {pending && (
      <Modal role="alertdialog" title={pending.options.title} description={pending.options.message} onClose={() => settle(false)}>
        <div className="modal-actions">
          <button type="button" autoFocus onClick={() => settle(false)}>{t('dialog.cancel')}</button>
          <button type="button" className={pending.options.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {pending.options.confirmLabel}
          </button>
        </div>
      </Modal>
    )}
  </ConfirmContext.Provider>
  ```
  `value` ist `useMemo(() => ({ confirm }), [confirm])`. `Abbrechen` steht vor der
  bestätigenden Schaltfläche und trägt `autoFocus` (D2). Esc, Backdrop und
  Schließen-Schaltfläche laufen über `onClose` des Modals → `false`.
- Die Datei importiert `react`, `./Modal.js` und `../i18n/locale.js`.

### D4 — `App` umschließt die Shell

`App` gibt `<ToastProvider><ConfirmProvider><AppShell …>{content}</AppShell></ConfirmProvider></ToastProvider>`
zurück. Der Bestätigungsdialog steht damit als Geschwister nach dem `<footer>` und vor dem
Toast-Host, außerhalb von `main`; `ui-shell` („Header, Main und Footer in dieser
Reihenfolge") bleibt erfüllt. `App` importiert `../ui/confirm.js`. `main.tsx` und `AppShell`
bleiben unverändert.

### D5 — Wörterbücher (`de.ts`, `en.ts`)

Neue Schlüssel, in beiden Dateien am Ende der Tabelle (verbindlich, buchstabengleich;
Anführungszeichen wie im Repo üblich: `„` öffnend, ASCII `"` schließend):

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `dialog.close` | Schließen | Close |
| `dialog.cancel` | Abbrechen | Cancel |
| `map.delete.title` | Karte „{name}" löschen? | Delete map "{name}"? |
| `map.delete.message` | Die Karte wird aus der Bibliothek entfernt und kann nicht wiederhergestellt werden. | The map is removed from the library and cannot be restored. |
| `map.delete.confirm` | Löschen | Delete |

`start.cancel` (`Abbrechen`) bleibt die Beschriftung der Formular-Schaltfläche in der
Startansicht; `dialog.cancel` ist die des Bestätigungsdialogs.

### D6 — `MapLibrary`: Confirm statt Zwei-Klick

- `confirmingDelete` und `handleDeleteClick` entfallen. Neu: `const { confirm } =
  useConfirm()` und `const t = useT()` (nur für die drei `map.delete.*`-Schlüssel; alle
  übrigen Rohstrings der Datei bleiben).
- `handleDelete` (async): ohne `current` nichts tun; `const ok = await confirm({ title:
  t('map.delete.title', { name: current.name }), message: t('map.delete.message'),
  confirmLabel: t('map.delete.confirm'), danger: true })`; bei `false` zurück, sonst der
  bisherige Ablauf von `handleConfirmedDelete` (`DELETE`, bei `ok` `backToList()` +
  `reload()`, sonst `setDetailError(result.message)`; Netzfehler wie bisher).
- Die Schaltfläche in der Kartenansicht: `<button type="button" className="danger"
  onClick={() => void handleDelete()}>Löschen</button>` — Text fest `Löschen` wie bisher
  (Rohstring, Epic C). Kein zweiter Zustand, kein zweiter Text.

### D7 — `SessionList`: Formulare im Modal

- Die Hero-Aktionen `Sitzung leiten` und `Beitreten` tragen `aria-haspopup="dialog"` statt
  `aria-expanded`; `onClick` ist `open('erstellen')` bzw. `open('beitreten')` (setzt
  `panel`, löscht beide Fehlermeldungen). `toggle` entfällt; `close` bleibt (`panel` auf
  `none`, Fehlermeldungen löschen).
- Statt der zwei `<form class="panel">`-Blöcke:
  ```
  {panel === 'erstellen' && (
    <Modal title={t('start.create.title')} onClose={close}>
      <form aria-label={t('start.create.title')} onSubmit={…handleCreate…}>
        … Feld `Name` (`name="name"`, `autoFocus`, `required`), Fehlermeldung, panel-actions mit `Erstellen` und `Abbrechen` …
      </form>
    </Modal>
  )}
  ```
  und ebenso für `beitreten` mit `t('start.join.title')`, Feld `Sitzungscode`
  (`name="code"`), `Beitreten`, `Abbrechen`. Das Formular verliert die Klasse `panel` und
  die eigene `<h2>` (der Titel ist jetzt die Überschrift des Modals) und bekommt seinen
  zugänglichen Namen per `aria-label` — Formularname, Feldbeschriftungen, `name`-Attribute,
  `autoFocus`, `required`, Fehlermeldung (`<p role="alert" class="field-error">`),
  `panel-actions` und die Schaltflächentexte bleiben buchstabengleich. `Abbrechen` ruft
  `close`.
- `handleCreate`/`handleJoin` unverändert: bei `ok` Feld leeren, `setPanel('none')`,
  `reload()`; bei Ablehnung Meldung setzen, Dialog bleibt offen.
- Import `../ui/Modal.js`.

### D8 — Stylesheet (Abschnitt „Dialoge" in `theme.css`)

Nach dem Abschnitt „Rückmeldungen" und vor dem Bewegungsblock ein Kommentar
`/* Dialoge (ui-dialog, #89) */` und diese Regeln — nur `var(--…)`, kein Farbwert, kein
neues `@media`, keine Bewegungsdeklaration außerhalb des Bewegungsblocks:

- `.modal-backdrop`: `position: fixed`, `inset: 0`, `z-index: 30`, `display: flex`,
  `align-items: center`, `justify-content: center`, `padding: var(--space-4)`,
  `background: color-mix(in srgb, var(--gray-1) 55%, transparent)`,
  `backdrop-filter: blur(2px)`.
- `.modal`: `position: relative`, `width: 100%`, `max-width: 22rem`,
  `padding: var(--space-5)`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-5)`, `background: var(--panel-grad)`,
  `box-shadow: var(--shadow-panel)`.
- `.modal--wide`: `max-width: 36rem`.
- `.modal-close`: `position: absolute`, `top: var(--space-2)`, `right: var(--space-2)`.
- `.modal-title`: `margin: 0 var(--space-6) var(--space-2) 0`, `font-size: var(--font-size-4)`.
- `.modal-description`: `margin: 0 0 var(--space-4)`, `color: var(--color-text-muted)`.
- `.modal-actions`: `display: flex`, `justify-content: flex-end`, `gap: var(--space-2)`,
  `margin-top: var(--space-4)`.

Im bestehenden Bewegungsblock (`@media (prefers-reduced-motion: no-preference) { … }`)
werden ergänzt — innerhalb der Klammern des Blocks, kein zweiter Block:

- `@keyframes modal-in { from { opacity: 0; transform: translateY(var(--space-2)); } to { opacity: 1; transform: none; } }`
- `.modal { animation: modal-in 0.16s ease-out; }`

`backdrop-filter` und `inset` sind keine Bewegungsdeklarationen im Sinne von `ui-theme`
(nur `transition*`, `animation*`, `@keyframes` zählen).

### D9 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle und Namen, nie über `id`/`querySelector`;
Gruppen gescoped über `within`):

| Element | Adresse |
|---|---|
| Dialog | Rolle `dialog` bzw. `alertdialog` mit dem Titel als Namen; Attribute `aria-modal`, `aria-labelledby`, `aria-describedby` per `getAttribute`; die Beschreibung ist das Element mit der `aria-describedby`-Id, geprüft über seinen Text |
| Box und Backdrop | die Box ist das Dialog-Element (Klasse `modal`, mit `wide` zusätzlich `modal--wide`); der Backdrop ist `parentElement` der Box (Klasse `modal-backdrop`) |
| Schließen | innerhalb des Dialogs die Schaltfläche `Schließen`; „erstes Element in der Box" = erstes Kind des Dialog-Elements ist diese Schaltfläche, bzw. die erste Schaltfläche der Box (per `getAllByRole` innerhalb des Dialogs) trägt den Namen `Schließen` |
| Titel | Überschrift der Ebene 2 innerhalb des Dialogs |
| Fokus | `document.activeElement` |
| Tasten | Keydown-Ereignis mit `key: 'Tab'` (bei Umschalt zusätzlich `shiftKey: true`) auf dem Element, das den Fokus hat; `key: 'Escape'` auf dem Dialog-Element (bubbelt zu `document`) |
| Backdrop-Klick | Klick-Ereignis auf dem Backdrop-Element selbst; „Klick in die Box" = Klick-Ereignis auf dem Dialog-Element |
| Auslöser und Fokusrückgabe | ein Testszenario rendert eine kleine Komponente mit einer Schaltfläche `Öffnen`, die den Fokus trägt und beim Klick ein `Modal` rendert; Schließen über `onClose` (setzt den State zurück) bzw. über `unmount()`; „Auslöser verschwunden" = die Komponente rendert nach dem Schließen weder Schaltfläche noch Modal |
| Bestätigungsdialog | ein Testszenario rendert innerhalb von `ConfirmProvider` eine Komponente mit einer Schaltfläche `Rückfrage`, die `confirm(…)` ruft und das Ergebnis als Text `bestätigt` bzw. `abgelehnt` rendert (vorher kein Ergebnistext); Schaltflächen `Abbrechen` und die bestätigende (Name = `confirmLabel`, Klasse `danger` bzw. `primary`) innerhalb des `alertdialog` |
| Ohne Provider | dieselbe Komponente ohne `ConfirmProvider`: nach dem Klick sofort `abgelehnt`, kein `alertdialog` im Dokument |
| Exporte | `Modal` aus `src/client/ui/Modal.tsx`; `ConfirmProvider`, `useConfirm`, `ConfirmOptions` aus `src/client/ui/confirm.tsx` |
| Startansicht | Hero-Aktionen wie bisher beim Namen; `aria-haspopup` per `getAttribute`; Dialog `Neue Spielsitzung` bzw. `Spielsitzung beitreten` über Rolle `dialog` und Namen, das Formular gleichen Namens über Rolle `form` innerhalb des Dialogs; Felder über Label, `Abbrechen`/`Erstellen`/`Beitreten` innerhalb des Formulars |
| Kartenbibliothek | Schaltfläche `Löschen` in der Kartenansicht **vor** dem Öffnen des Dialogs beim Namen; danach der `alertdialog` `Karte „Taverne" löschen?` und darin `Abbrechen` bzw. `Löschen` — die bestätigende Schaltfläche nur innerhalb des Dialogs adressieren, weil die Kartenansicht ebenfalls eine Schaltfläche `Löschen` trägt |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben Helfer wie in der Theme-/Shell-/Start-/Feedback-Suite, sie können dupliziert werden |

Die Szenarien der Requirements „Modal-Baustein", „Fokus beim Öffnen", „Tab-Zyklus",
„Schließen", „Fokusrückgabe", „Bestätigungsdialog" und „Ohne Provider" brauchen keine
`App`: sie rendern `Modal` bzw. `ConfirmProvider` um eine kleine Testkomponente. Die
MODIFIED-Szenarien rendern `App` mit gemocktem `fetch` und gemockter Socket-/Canvas-Fassade
nach dem Muster der bestehenden Start- und Bibliotheks-Suiten. Bestehende Suiten, deren
Szenarien in den Deltas geändert sind (`map-library` „Löschen nach Bestätigung"; `ui-start`
„Angemeldete Startansicht zeigt Hero mit Aktionen" und alle Szenarien von „Erstellen und
Beitreten auf Anforderung"), werden auf die neuen Erwartungen umgestellt — die Testnamen
bleiben, weil die Szenariennamen bleiben. Szenarien, die Exporte der
noch fehlenden Module `Modal.tsx`/`confirm.tsx` importieren, gehören in eine eigene Datei,
damit ein Ladefehler nicht die Start- und Bibliotheks-Suiten mitreißt.

jsdom bewegt den Fokus bei `Tab` nicht von selbst; deshalb prüfen die Tab-Szenarien
ausschließlich den Umbruch (letztes → erstes, erstes → letztes). `focus()` und
`document.activeElement` funktionieren in jsdom; `autoFocus` wird von React beim Mount
ausgeführt.

### D10 — Reihenfolge der Kopplungen

`Modal.tsx` importiert `react`, `Icon.tsx`, `locale.ts`. `confirm.tsx` importiert `react`,
`Modal.tsx`, `locale.ts`. `App` importiert zusätzlich `confirm.tsx`. `SessionList` importiert
`Modal.tsx`; `MapLibrary` importiert `confirm.tsx` und `locale.ts`. `pixi.js` bleibt
außerhalb der statischen Importkette von `App` (unverändert: `canvas.ts` nur dynamisch aus
`MapCanvas`).

## Risks / Trade-offs

- **Escape-Handler auf `document`** → schließt auch, wenn der Fokus die Box verlassen hat
  (z. B. per Mausklick auf den Backdrop-Rand ohne Schließen). Gewollt: Esc muss immer
  wirken. Bei zwei gleichzeitig offenen Modals würden beide schließen — Stapeln ist
  Non-Goal.
- **Kein `inert` auf dem Rest der Seite** → Screenreader mit virtuellem Cursor können
  hinter den Dialog lesen; `aria-modal="true"` weist moderne Screenreader an, das zu
  unterlassen. Ausreichend für diesen Schritt.
- **`backdrop-filter` ohne Präfix** → in älteren Safari-Versionen ohne Wirkung; der
  55-%-Backdrop bleibt lesbar. Kein Fallback nötig.
- **`aria-haspopup="dialog"` statt `aria-expanded`** → Screenreader kündigen „öffnet
  Dialog" an, aber nicht mehr „erweitert/reduziert"; für ein Modal ist das die richtige
  Ansage.
- **Fokusrückgabe an `document.activeElement` beim Öffnen** → wird das Modal aus einem
  Effekt ohne vorherigen Klick geöffnet, liegt der Fokus auf `body`; `body.focus()` ist
  wirkungslos, kein Fehler. Öffnet ein Confirm aus einer Schaltfläche, die nach dem Erfolg
  verschwindet (Karte gelöscht → Liste), greift der `isConnected`-Guard.
- **Zweiter `confirm()`-Aufruf bei offenem Dialog** → der erste löst mit `false` auf, der
  zweite ersetzt ihn. Definiert, damit kein Promise hängen bleibt; in der App gibt es
  keinen Pfad, der das auslöst.
- **StrictMode ruft Effekte doppelt** → das Modal gibt den Fokus an den Auslöser zurück und
  nimmt ihn im zweiten Durchlauf erneut; das Confirm-Cleanup findet kein offenes Promise.
  Kein sichtbarer Effekt.
- **Rohstring `Löschen` in der Kartenbibliothek neben `map.delete.confirm`** → unter
  Englisch heißt die Schaltfläche der Kartenansicht `Löschen`, die im Dialog `Delete`.
  Gewollt bis Epic C (wie in #87 entschieden: Bibliothek bleibt Rohstring).
