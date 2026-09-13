## Context

Vorhanden: `SessionRoom.tsx` rendert im Zustand `bereit` nacheinander `<h1>` mit
`state.name`, einen Absatz `.session-room-status` mit der Zustandspille
(`SESSION_STATUS_PRESENTATION` aus `session-status.ts`: Textschlüssel, Icon,
Varianten-Klasse), für den Spielleiter ein `<div class="session-room-code">` mit `Code:`,
Maske (`•` je Zeichen, Konstante `CODE_MASK_CHAR`), `MenuTrigger` (Variante `icon`, Icon
`info`, `haspopup` `dialog`) und `Popover` mit `<code>` und `Kopieren`
(`handleCopyCode`: Zwischenablage, Toast nur bei Erfolg), dann die Teilnehmerliste und für
den Spielleiter ein `<div>` mit den Textschaltflächen aus `allowedActions(status)` und
`TRANSITION_LABELS`. `handleTransition(action)` ruft `socket.transition` und verwirft das
Acknowledgement. `wireSocket` verdrahtet `participants`, `status`, `replaced`, `ended`,
`map`, `tokens`, `fog`, `annotations`, `disconnect`, `reconnect`; der `status`-Handler
setzt `state.sessionStatus`, wenn `sessionId` passt. `onEnded`/`onLeave` liegen in Refs;
`leave()` ruft `onLeaveRef.current()`. `useConfirm`, `useToasts`, `Modal`, `Field`,
`SubmitButton`, `Icon`, `ActionMenu`, `useFloating` sind bereits importiert.

`src/shared/session.ts`: `CreateSessionInputSchema` trimmt den Namen und prüft 1–60
Zeichen (Meldungen `Der Name muss mindestens 1 Zeichen lang sein.` /
`Der Name darf höchstens 60 Zeichen lang sein.`); `TRANSITION_ACTIONS` in der Reihenfolge
`oeffnen`, `starten`, `pausieren`, `beenden`; `allowedActions(status)`; `SESSION_EVENTS`
mit `enter`, `transition`, `alias`, `participants`, `status`, `replaced`, `ended`;
`AliasInputSchema`/`AliasAck` als Muster für ein Ereignis mit Acknowledgement.
`src/server/session/socket.ts`: `handleAlias` = Payload parsen → `authorizeAction` →
DB → Broadcast → Acknowledgement; `handleActivateMap` zeigt die Rollenanforderung
`{ role: 'spielleiter' }`; `roomName(sessionId)` aus `room.ts` benennt den Raum.
`src/client/session/socket.ts`: Fassade mit je einer Promise-Methode pro Client-Ereignis
und `on(event, handler)` über `wireEventFor`.

`ui-icons`: `IconButton` (`<button class="icon-button" aria-label>` mit benanntem Icon)
reicht alle übrigen Button-Attribute durch — auch `aria-pressed`, `disabled`, `className`
(wird an `icon-button` angehängt). Registry-Namen `edit`, `reveal`, `hide`, `settings`,
`library`, `logout`, `players`, `start`, `pause`, `end` vorhanden; `copy` fehlt.
`ui-menu`: `ActionMenuButton` (Variante `icon` mit `icon`, `label` = Name von Trigger und
Menü, Einträge mit `disabled`). `ui-dialog`: `Modal` (Fokus auf ein `autoFocus`-Kind,
Fokusrückgabe an den beim ersten Render gemerkten Auslöser), `useConfirm().confirm({ title,
message, confirmLabel, danger })`. `ui-form`: `Field` (Render-Funktion mit `id`,
`aria-invalid`, `aria-describedby`; Feldfehler als `<p class="field-error" role="alert">`),
`SubmitButton` (`pending`), Formularfehler als `<p class="form-error" role="alert">`.
`ui-theme`: Format-Vertrag (kein Farbwert außerhalb `:root`, `@media` nur die
Bewegungsabfrage am Dateiende, `animation`/`transition` nur darin); `.status-pill` hat
bereits `min-width: 8.5rem`. Bindend und nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Eine Steuerzeile, ein Vertrag.** Die Bar zeigt Name, Code, Zustand, Übergänge und Menü
  aus dem, was der Server gemeldet hat; Sperren kommen aus `allowedActions`, die Rolle aus
  dem Enter-Acknowledgement. Keine zweite Regel im Client.
- **Umbenennen nach dem Muster des Alias:** ein Ereignis mit Acknowledgement, ein Broadcast,
  ein Schema aus `shared/`. Der Name folgt dem Broadcast.
- **Disabled statt unsichtbar** für alle vier Übergänge (#103).
- **Buchstabengleich unter Deutsch** für alles, was nicht in den Deltas genannt ist.
- **Die Bar ist präsentational:** `SessionBar` hält nur den Maskenzustand; alles andere
  kommt als Prop aus `SessionRoom`. #98 kann sie für die Spieleransicht wiederverwenden.

**Non-Goals:**
- Kein Tab-Layout, keine Kartenhöhe (#94). Teilnehmerliste, Panels und Kartenbühne bleiben
  unter der Bar wie heute.
- Kein Eintrag `Teilnehmer` im Verwaltungsmenü (#94/#97).
- Kein Verlassen der Mitgliedschaft (kein Server-Ereignis dafür).
- Keine Umbenennung aus der Sitzungsliste heraus.
- Keine Übersetzung weiterer Rohstrings der Raumansicht; nur neue Texte laufen über `t()`.

## Decisions

### D1 — Vertrag (`src/shared/session.ts`)

Neue Exporte (verbindlich):

```ts
export const SessionNameSchema: z.ZodEffects<…>  // Trimmen, dann 1–60 Zeichen — der bisherige Namens-Pipe aus CreateSessionInputSchema, herausgezogen
export const RenameInputSchema = z.object({ sessionId: z.string(), name: SessionNameSchema })
export type RenameInput = z.infer<typeof RenameInputSchema>
export type RenameAck = { ok: true; name: string } | { ok: false; message: string }
export interface RenamedEvent { sessionId: string; name: string }
```

`CreateSessionInputSchema` benutzt fortan `SessionNameSchema` (gleiche Meldungen,
gleiches Verhalten). `SESSION_EVENTS` bekommt `rename: 'session:rename'` und
`renamed: 'session:renamed'`. Der Kommentar zum Drahtformat nennt beide Ereignisse.

### D2 — Server (`src/server/session/socket.ts`)

`handleRename(socket, payload, callback)` nach dem Muster von `handleAlias`, registriert
neben den übrigen `socket.on`-Zeilen:

1. `RenameInputSchema.safeParse(payload)`; ungültig → `{ ok: false, message:
   INVALID_PAYLOAD_MESSAGE }`.
2. `authorizeAction({ prisma, clock }, socket, sessionId, { role: 'spielleiter' })`; nicht
   ok → `{ ok: false, message }` des Ergebnisses.
3. `prisma.gameSession.update` mit `{ where: { id: sessionId }, data: { name } }` — `name`
   ist der geparste (getrimmte) Wert.
4. `io.to(roomName(sessionId)).emit(SESSION_EVENTS.renamed, { sessionId, name })` — der
   Raum schließt den Absender ein.
5. `callback({ ok: true, name })`.

Kein Zustandsfilter: Umbenennen ist in jedem Zustand erlaubt. Kein weiterer Broadcast; die
Sitzungsliste liest den Namen beim nächsten `GET /api/sessions` aus der Datenbank.

### D3 — Client-Fassade (`src/client/session/socket.ts`)

`SessionSocketFacade` bekommt `rename(sessionId: string, name: string): Promise<RenameAck>`
(emit `SESSION_EVENTS.rename` mit `{ sessionId, name }`, Muster `alias`) und die Überladung
`on(event: 'renamed', handler: (payload: RenamedEvent) => void)`; `wireEventFor` bildet
`renamed` wie `status` über `SESSION_EVENTS` ab (die Typliste des Casts wächst um
`'renamed'`).

### D4 — Icons der Übergänge (`src/client/session/session-status.ts`)

```ts
export const TRANSITION_ICONS: Record<TransitionAction, IconName> = {
  oeffnen: 'players',
  starten: 'start',
  pausieren: 'pause',
  beenden: 'end',
}
```

Nur Typimporte, wie bisher (Datei bleibt frei von React und Pixi).

### D5 — Komponente `SessionBar` (`src/client/session/SessionBar.tsx`)

Props (verbindlich):

```ts
export interface SessionBarProps {
  name: string
  status: GameSessionStatus
  role: MemberRole
  code?: string
  transitionError: string | null
  onTransition: (action: TransitionAction) => void
  onCopyCode: () => void
  onRename: () => void
  onOpenLibrary: () => void
  onLeave: () => void
}
export function SessionBar(props: SessionBarProps): JSX.Element
```

Lokaler State: `revealed` (Startwert `false`). `t = useT()`, `allowed =
allowedActions(status)`, `isGm = role === 'spielleiter'`. Gerendert wird ein Fragment aus
der Bar und — nur wenn `transitionError !== null` — der Bar-Meldung
`<p role="alert" class="session-bar-error">` mit dem Text.

Die Bar: `<div>` mit `className="session-bar"`, `role="group"`, `aria-label={t('bar.label')}`.
Darin in dieser Reihenfolge:

1. **Identität** — `<div class="session-bar__group session-bar__identity">`:
   `<h1 class="session-bar__name">{name}</h1>`; bei `isGm` ein `IconButton` mit `name`
   `edit`, `label` `t('bar.rename')`, `onClick` `onRename`.
2. **Sitzungscode-Gruppe** — nur wenn `code !== undefined`,
   `<div class="session-bar__group">`: `<code class="session-bar__code"
   aria-label={t('session.code')}>` mit `revealed ? code : '•'.repeat(code.length)`; ein
   `IconButton` mit `name` `revealed ? 'hide' : 'reveal'`, `label` `t('session.showCode')`,
   `aria-pressed={revealed}` (rendert `"true"`/`"false"`), `onClick` schaltet `revealed`
   um; ein `IconButton` mit `name` `copy`, `label` `t('bar.copyCode')`, `onClick`
   `onCopyCode`.
3. **Zustandsgruppe** — `<div class="session-bar__group">`: die Zustandspille genau wie
   heute (`<span class="status-pill [modifier]"><Icon/> {t(label)}</span>` aus
   `SESSION_STATUS_PRESENTATION[status]`); bei `isGm` die Steuerung
   `<div class="session-bar__transport" role="group" aria-label={t('bar.transport')}>` mit
   je einem `IconButton` pro Eintrag von `TRANSITION_ACTIONS` (Reihenfolge des Vertrags):
   `name` `TRANSITION_ICONS[action]`, `label` `t(TRANSITION_LABELS[action])`, `className`
   `transport-button` bzw. `transport-button transport-button--danger` für `beenden`,
   `disabled={!allowed.includes(action)}`, `onClick` → `onTransition(action)`.
4. **Verwaltungsmenü** — `<div class="session-bar__group">`: `ActionMenuButton` mit
   `variant="icon"`, `icon="settings"`, `label={t('bar.settings')}` und den Einträgen

   | `id` | `label` | `icon` | `disabled` | `onSelect` |
   |---|---|---|---|---|
   | `rename` | `t('menu.rename')` | `edit` | `!isGm` | `onRename` |
   | `library` | `t('menu.library')` | `library` | – | `onOpenLibrary` |
   | `leave` | `t('menu.leave')` | `logout` | – | `onLeave` |

Zweiter Export derselben Datei — das Formular des Umbenennen-Modals:

```ts
export interface RenameSessionFormProps {
  initialName: string
  onSubmit: (name: string) => Promise<RenameAck>
  onDone: () => void
}
export function RenameSessionForm(props: RenameSessionFormProps): JSX.Element
```

State: `value` (Startwert `initialName`), `fieldError: string | null`, `formError:
string | null`, `pending: boolean`. Markup: `<form class="form-grid">` mit `Field`
(`id` `session-rename-name`, `label` `t('session.rename.name')`, `error` `fieldError`), dessen
Steuerelement ein `<input>` mit den Kontroll-Props, `name="name"`, `value`, `autoFocus` und
`onChange` ist; danach bei `formError` ein `<p class="form-error" role="alert">`; dann
`<div class="form-actions">` mit `SubmitButton` (`pending`) und dem Text
`t('session.rename.submit')`. Absenden (`preventDefault`): `SessionNameSchema.safeParse(value)`;
scheitert es → `fieldError` = Meldung des ersten Issues, nichts senden. Sonst `pending`
setzen, `onSubmit(parsed.data)` abwarten; `ok` → `onDone()`; sonst `formError` =
`message`; `pending` zurücksetzen. Ein erneutes Absenden leert beide Fehler zuerst.

`SessionBar.tsx` importiert `react`, `shared/session.ts` (`allowedActions`,
`TRANSITION_ACTIONS`, `SessionNameSchema`, Typen), `session-status.ts`, `locale.ts`,
`ui/Icon.tsx`, `ui/menu.tsx`, `ui/form.tsx` — nichts sonst.

### D6 — Raumansicht (`SessionRoom.tsx`)

- **Props:** `SessionRoomProps` bekommt `onOpenLibrary: () => void`; `App` übergibt einen
  Wechsel nach `{ view: 'bibliothek' }` (derselbe Setter wie `onOpenLibrary` der
  Sitzungsliste). `onLeave` bleibt und dient auch `Verlassen`.
- **Bar statt Kopfzeilen:** Im Zweig `bereit` ersetzt `<SessionBar name={state.name}
  status={state.sessionStatus} role={state.role} code={state.code}
  transitionError={transitionError} onTransition={handleTransition}
  onCopyCode={handleCopyCode} onRename={() => setRenameOpen(true)}
  onOpenLibrary={onOpenLibraryRef.current-Aufruf} onLeave={leave} />` die `<h1>`, den
  Absatz `.session-room-status`, das `<div class="session-room-code">` samt Popover und das
  `<div>` der Übergangs-Schaltflächen. `codeFloating`, `CODE_MASK_CHAR`, `MenuTrigger`
  und `Popover` werden in dieser Datei nicht mehr gebraucht (`ActionMenu`/`useFloating`
  bleiben für das Karten-Menü). `onOpenLibrary` wandert wie `onLeave` in einen Ref.
- **Übergang mit Bestätigung und Meldung:** neuer State `transitionError: string | null`
  (Startwert `null`). `handleTransition(action)` wird `async`: bei `beenden` zuerst
  `confirm({ title: t('session.end.title'), message: t('session.end.message'),
  confirmLabel: t('session.end.confirm'), danger: true })` — `false` → Ende ohne Senden.
  Dann `socket.transition(sessionId, action)`; Acknowledgement `ok` →
  `setTransitionError(null)`, sonst `setTransitionError(ack.message)`. Der bestehende
  `status`-Handler in `wireSocket` setzt zusätzlich `setTransitionError(null)`. Ein
  verworfenes Promise wird weiter mit `console.error` gemeldet.
- **`renamed`:** `wireSocket` verdrahtet `socket.on('renamed', …)` wie `status`: passt die
  `sessionId`, wird `state.name` im Zustand `bereit` ersetzt; sonst nichts.
- **Umbenennen-Modal:** State `renameOpen` (Startwert `false`). Solange `renameOpen` und
  `state.status === 'bereit'`: `<Modal title={t('session.rename.title')} onClose={() =>
  setRenameOpen(false)}>` mit `<RenameSessionForm initialName={state.name}
  onSubmit={handleRename} onDone={…} />`. `handleRename(name)`: ohne Fassade →
  `Promise.resolve({ ok: false, message: t('session.rename.failed') })`, sonst
  `socket.rename(sessionId, name)`. `onDone`: `setRenameOpen(false)`, dann
  `push(t('toast.sessionRenamed'))`. Der Name der Bar ändert sich nicht in `onDone` —
  ausschließlich über `renamed` (§9.1). Auslöser des Modals sind `Umbenennen` (Bar) oder
  der Menüeintrag (`ui-menu` gibt den Fokus vor `onSelect` an den Trigger zurück) — nach
  dem Schließen liegt der Fokus wieder dort (`ui-dialog`).
- Alles Übrige der Raumansicht (Teilnehmerliste mit Alias, Karte, Panels, Dialoge, Banner,
  Overlay, Token-Menüs) bleibt unverändert an seiner Stelle unter der Bar.

### D7 — Registry (`src/client/ui/icons.ts`)

Benannter Import `Copy` aus `lucide-react`; `ICON_NAMES` bekommt `'copy'` unmittelbar nach
`'close'`, `ICON_REGISTRY` den Eintrag `copy: Copy` an derselben Stelle (55 Namen). Fehlt
der Export in der installierten Version, nächstliegende Form wählen und im Summary nennen.

### D8 — Wörterbücher (`de.ts`, `en.ts`)

Neue Schlüssel (verbindlich, buchstabengleich; Auslassungspunkte als ein Zeichen `…`).
`session.copyCode` entfällt in beiden Wörterbüchern. Gruppen im deutschen Wörterbuch:
`bar.*` als neue Gruppe nach `session.*`, `menu.rename`/`menu.library`/`menu.leave` am Ende
von `menu.*`, `session.rename.*`/`session.end.*` bei den Sitzungsschlüsseln,
`toast.sessionRenamed` bei den Toasts; das englische spiegelt die Menge.

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `bar.label` | Sitzung | Session |
| `bar.rename` | Umbenennen | Rename |
| `bar.copyCode` | Sitzungscode kopieren | Copy session code |
| `bar.transport` | Steuerung | Controls |
| `bar.settings` | Sitzungsverwaltung | Session settings |
| `menu.rename` | Umbenennen… | Rename… |
| `menu.library` | Kartenbibliothek | Map library |
| `menu.leave` | Verlassen | Leave |
| `session.rename.title` | Sitzung umbenennen | Rename session |
| `session.rename.name` | Name | Name |
| `session.rename.submit` | Umbenennen | Rename |
| `session.rename.failed` | Die Sitzung konnte nicht umbenannt werden. Bitte versuche es erneut. | The session could not be renamed. Please try again. |
| `session.end.title` | Sitzung beenden? | End session? |
| `session.end.message` | Alle Spieler werden aus dem Raum entfernt. | All players are removed from the room. |
| `session.end.confirm` | Beenden | End |
| `toast.sessionRenamed` | Sitzung umbenannt | Session renamed |

Bestehend und weiter genutzt: `session.code` (Name des `<code>`-Elements),
`session.showCode` (Umschalt-Schaltfläche), `session.action.*` (Übergänge),
`toast.codeCopied`, `dialog.cancel`.

### D9 — Stylesheet (Abschnitt „Session-Bar" in `theme.css`)

Nach dem Abschnitt „Menüs" und vor dem Bewegungsblock ein Kommentar
`/* Session-Bar (session-bar, #93) */` und diese Regeln — nur `var(--…)`, kein Farbwert,
kein neues `@media`, keine `animation`/`transition`:

- `.session-bar`: `display: flex`, `align-items: center`, `gap: var(--space-3)`,
  `min-width: 0`, `overflow: hidden`, `margin: 0 0 var(--space-4)`,
  `padding: var(--space-2) var(--space-3)`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-pill)`, `background: var(--panel-grad)`,
  `box-shadow: var(--shadow-panel)`.
- `.session-bar__group`: `display: flex`, `align-items: center`, `gap: var(--space-2)`,
  `flex: 0 0 auto`, `min-width: 0`.
- `.session-bar__group + .session-bar__group`: `padding-left: var(--space-3)`,
  `border-left: 1px solid var(--color-border-faint)` (die Haarlinie).
- `.session-bar__identity` (nach `.session-bar__group`, damit sie gewinnt):
  `flex: 1 1 auto`.
- `.session-bar__name`: `margin: 0`, `min-width: 0`, `overflow: hidden`,
  `text-overflow: ellipsis`, `white-space: nowrap`, `font-size: var(--font-size-4)`,
  `line-height: 1.2`.
- `.session-bar__code`: `font-family: var(--font-mono)`, `font-size: var(--font-size-3)`,
  `letter-spacing: 0.1em`, `min-width: 7ch` (Maske und Klartext gleich breit).
- `.session-bar__transport`: `display: inline-flex`, `gap: var(--space-1)`.
- `.transport-button`: `width: 1.7rem`, `height: 1.7rem`, `min-width: 0`,
  `min-height: 0`, `padding: 0`, `border-radius: var(--radius-pill)`,
  `font-size: var(--font-size-2)`.
- `.transport-button--danger:hover:not(:disabled)`: `color: var(--red)`,
  `border-color: var(--red-border)`, `background: var(--red-bg)`.
- `.session-bar-error`: `margin: 0 0 var(--space-3)`,
  `padding: var(--space-2) var(--space-3)`, `border: 1px solid var(--red-border)`,
  `border-radius: var(--radius-3)`, `background: var(--red-bg)`, `color: var(--red)`.

Die Regeln `.session-room-status` (Abschnitt „Textschlüssel") sowie `.session-room-code`,
`.session-code-mask` und `.session-code` (Abschnitt „Menüs") entfallen. Die fünf
Menü-Selektoren bleiben.

### D10 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle, Namen und Text; alles innerhalb der Bar per
`within` der Gruppe `Sitzung`):

| Element | Adresse |
|---|---|
| Bar | `getByRole('group', { name: 'Sitzung' })`; Reihenfolge der Kinder über `compareDocumentPosition` oder die Reihenfolge von `getAllByRole('button')` innerhalb der Gruppe; „vor der Teilnehmerliste" = die Gruppe steht im Dokument vor dem `<ul>` der Teilnehmer |
| Name | `getByRole('heading', { level: 1 })` |
| Umbenennen (Bar) | `getByRole('button', { name: 'Umbenennen' })` innerhalb der Gruppe `Sitzung` — der Menüeintrag heißt `Umbenennen…` (mit `…`) und ist erst im geöffneten Menü vorhanden; die Schaltfläche im Modal heißt ebenfalls `Umbenennen`, liegt aber im `dialog` (`within`) |
| Code | `<code>`-Element per `getByLabelText('Sitzungscode')` oder `getByText('••••••')`; Klartext = Text des `<code>`-Elements; „kein Textknoten `ABC234`" = `queryByText('ABC234')` ist `null` |
| Umschalter | `getByRole('button', { name: 'Sitzungscode anzeigen' })`, `aria-pressed` als Attribut (`"true"`/`"false"`); Kopieren = `getByRole('button', { name: 'Sitzungscode kopieren' })`; Zwischenablage wie in den bestehenden Raum-Szenarien (`navigator.clipboard.writeText` gemockt, Aufrufargumente prüfen) |
| Zustandspille | `getByText('Geöffnet')` mit Klasse `status-pill` (unverändert) |
| Steuerung | `getByRole('group', { name: 'Steuerung' })`, darin `getAllByRole('button')` in Dokumentreihenfolge mit den Namen `Öffnen`, `Starten`, `Pausieren`, `Beenden`; gesperrt = Eigenschaft `disabled` |
| Übergang gesendet | Aufrufe der Fassaden-Methode `transition` (gemockte Fassade, wie bisher) mit `(sessionId, action)`; Acknowledgement über den Rückgabewert des Mocks |
| Bestätigung | `getByRole('alertdialog', { name: 'Sitzung beenden?' })`, darin `Beenden` und `Abbrechen` (`within`); Fokus = `document.activeElement` |
| Bar-Meldung | `getByRole('alert')` mit Klasse `session-bar-error` (Textinhalt); `session:status` = den beim `on('status', …)` der Fassade registrierten Handler mit `{ sessionId, status }` aufrufen, wie in „Zustand folgt dem Server" |
| Verwaltungsmenü | Trigger `getByRole('button', { name: 'Sitzungsverwaltung' })` (`aria-haspopup="menu"`); Menü `getByRole('menu', { name: 'Sitzungsverwaltung' })`, Einträge `getAllByRole('menuitem')`; gesperrt = `aria-disabled="true"`; Auswahl per Klick auf den Eintrag |
| Verlassen/Bibliothek | Sitzungsliste = Schaltfläche `Sitzung leiten`; Bibliothek = Überschrift der Ebene 1 `Kartenbibliothek` (die Bibliothek lädt `GET /api/maps` — im Mock beantworten); „Fassade getrennt" = `disconnect` der gemockten Fassade wurde aufgerufen |
| Umbenennen-Modal | `getByRole('dialog', { name: 'Sitzung umbenennen' })`; Feld `getByLabelText('Name')` (Wert, Fokus, `change`-Ereignis); Absenden per `submit` des Formulars oder Klick auf `Umbenennen` im Dialog; Feldfehler = `role="alert"` mit Klasse `field-error`, Formularfehler = `role="alert"` mit Klasse `form-error` (beide `within` des Dialogs) |
| Umbenennen gesendet | Aufrufe der Fassaden-Methode `rename` mit `(sessionId, name)`; die gemockte Fassade braucht `rename` als weitere `jest.fn`-Methode, Acknowledgement über den Rückgabewert; `session:renamed` = den beim `on('renamed', …)` registrierten Handler aufrufen |
| Toast | Toast-Host `role="status"` wie in den bestehenden Toast-Szenarien |
| Server-Szenarien | Integrationstest mit zwei Socket-Clients (Spielleiter, Spieler) wie in den bestehenden Alias-Szenarien; `session:renamed` beim Spieler und beim Spielleiter per einmaligem Listener abwarten; DB-Stand per Prisma (`gameSession.findUnique`); „kein `session:renamed`" = Listener registriert, kurze Wartezeit, nicht ausgelöst |
| Registry | wie die bestehende Icons-Suite: `ICON_NAMES` als Liste vergleichen (55 Einträge) |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben Helfer wie in der Menü-Suite |
| Sprache | `setLocale('en')` aus `src/client/i18n/locale.ts` vor dem Rendern, im Cleanup zurück auf `de` |

Die Raum-Szenarien rendern `App` mit gemocktem `fetch` und gemockter Socket-/Canvas-Fassade
nach dem Muster der bestehenden Raum-Suiten; die gemockte Fassade bekommt `rename`, und ihr
`on` speichert auch den Handler für `renamed`. Bestehende Szenarien, die den Popover
`Sitzungscode` oder `Kopieren` im Raum adressieren, stellen auf Umschalter und
`Sitzungscode kopieren` um; Szenarien, die `queryByRole('button', { name: 'Öffnen' })` als
`null` erwarten, prüfen stattdessen `disabled`.

### D11 — Reihenfolge der Kopplungen

`shared/session.ts` bleibt frei von Server- und Client-Importen. `server/session/socket.ts`
importiert `RenameInputSchema`, `RenameAck` und `roomName`. `client/session/socket.ts`
importiert `RenameAck`, `RenamedEvent`. `SessionBar.tsx` importiert `shared/session.ts`,
`session-status.ts`, `locale.ts`, `ui/Icon.tsx`, `ui/menu.tsx`, `ui/form.tsx`, `react`.
`SessionRoom.tsx` importiert `SessionBar.tsx` (beide Exporte) und verliert `MenuTrigger`,
`Popover`. `App.tsx` reicht nur einen weiteren Rückruf durch. `pixi.js` bleibt außerhalb
der statischen Importkette von `App`.

## Risks / Trade-offs

- **`Öffnen`/`Pausieren` jetzt gerendert, aber gesperrt** → bestehende Erwartungen
  „keine Schaltfläche" werden zu „`disabled`" (in den Deltas benannt).
- **Rundschaltflächen mit 1,7 rem** unterschreiten die 36-px-Trefferfläche der Menüs
  (#92) — Vorgabe aus dem Issue; die Bar ist Werkzeug der Spielleitung am Desktop. Wird im
  App-Test beurteilt.
- **Name folgt nur dem Broadcast** → zwischen Acknowledgement und `session:renamed` zeigt
  die Bar kurz den alten Namen; im selben Prozess ist das nicht wahrnehmbar, und die Regel
  (§9.1) bleibt einheitlich zur Zustandspille.
- **`Verlassen` neben `Zurück`** → zwei Wege zur Liste; beide sind dieselbe Funktion, kein
  zweiter Zustand.
- **`session.copyCode` entfällt** → ein Test, der den Schlüssel liest, wird zum Typfehler;
  die `ui-text`-Suite prüft nur Schlüsselgleichheit beider Wörterbücher.
- **Bestätigung vor `beenden` auch in `geoeffnet`** (noch kein Spieler im Spiel) → eine
  Nachfrage mehr; gleiche Regel für jeden Zustand ist einfacher als eine Ausnahme.
