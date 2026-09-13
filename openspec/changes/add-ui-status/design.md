## Context

Vorhanden: die Socket-Fassade `src/client/session/socket.ts` bietet `on('disconnect',
(reason) => …)` (Drahtereignis `disconnect` von socket.io-client, Grund als Text, z. B.
`transport close`, `io server disconnect`, `io client disconnect`) und `on('reconnect',
() => …)` (feuert bei jeder vom Server angenommenen Verbindung außer der ersten). Die
Raumansicht `src/client/session/SessionRoom.tsx` verdrahtet in `wireSocket` die Ereignisse
`participants`, `status`, `map`, `tokens`, `fog`, `annotations`, `replaced`, `ended` und
`reconnect` — nicht `disconnect`. `replaced` setzt `replacedRef`/`replaced` und die Ansicht
kehrt früh mit `<p role="alert">` plus Schaltfläche `Hier weiterspielen` zurück
(`handleReconnect`: neue Fassade, Sperren zurücksetzen). `ended` ruft sofort
`onEnded(ENDED_MESSAGE)`; `App` setzt daraus den Shell-Hinweis und wechselt zur Liste.
`wireSocket` ist ein `useCallback` mit den Abhängigkeiten `sessionId`, `currentUserId`,
`onEnded`; der Mount-Effekt hängt an `wireSocket` — `App` übergibt `onEnded` als inline
Pfeilfunktion, jedes Rendern von `App` (etwa ein Sprachwechsel) erzeugt damit heute eine
neue Fassade. Die Kartenansicht steht in einem `<div style={{ width: '100%', height: 480 }}>`.
`session-status.ts` liefert `SESSION_STATUS_PRESENTATION` (Zustand → Textschlüssel, Icon,
Pillen-Klasse). `ui-dialog` liefert `Modal` (`title`, `onClose`, `role`, `description`;
Schließen-X `Schließen`, Esc auf `document`, `modal-actions`); `ui-feedback` liefert
`useToasts().push`; `ui-text` liefert `t`/`useT`; `ui-theme` hat `.empty-state` (Startansicht:
`<p class="empty-state"><strong>…</strong><span>…</span></p>`), `.app-shell-hinweis` (amber),
`.modal-backdrop` (`color-mix(in srgb, var(--gray-1) 55%, transparent)`, `blur(2px)`) und den
Format-Vertrag (kein Farbwert außerhalb `:root`, `@media` nur der Bewegungsblock am
Dateiende). Die Icon-Registry kennt `warning`, `pause`, `players`. Der Server trennt nach
`session:replaced` die alte Verbindung (`io server disconnect`); nach `session:ended` nimmt
er den Spieler nur aus dem Raum, die Verbindung bleibt. Der Server lehnt Token-, Fog- und
Anmerkungsaktionen in `pausiert`/`geoeffnet` nicht ab.

Listen ohne Leerzustand: `TokenPanel` (`<ul>` nach dem Formular `Tokens`),
`PlayerTokenList` (`<ul>` unter `Tokenwerte`), `FogPanel` (`<ul>` der Bereiche nach
`Auswahl leeren`), `AnnotationPanel` (`<ul>` vor `Meine entfernen`), `MapPanel` (`<ul>` der
Instanzen unter `Karten`, `instances` startet als `[]`), `MapLibrary` (`<ul>` unter
`Kartenbibliothek`). Die Entscheidungen der Explore-Runde stehen in proposal.md; Verhalten in
`specs/ui-status/spec.md` und den Deltas. Bindend und nicht wiederholt: `constitution.md` §9 —
Banner, Overlay und Dialoge zeigen ausschließlich, was Socket und Server gemeldet haben.

## Goals / Non-Goals

**Goals:**
- **Ein Modul, drei Komponenten.** `StatusBanner`, `MapOverlay`, `EmptyState` in
  `src/client/ui/status.tsx`; keine Bibliothek.
- **Jeder Zustand hat genau eine Form.** Verbindung → Banner, Sitzungszustand auf der Karte →
  Overlay, Sitzungsende und Ersetzen → `alertdialog`, gelungene Wiederverbindung → Toast,
  leere Liste → Leerzustand.
- **Buchstabengleich unter Deutsch** für alles, was nicht in den Deltas genannt ist:
  Beschriftungen, Rollen, Handler-Abläufe, der Hinweis `Die Spielsitzung wurde beendet.`
- **Keine neue Fassade bei einem Rendern von `App`.** Rückrufe wandern in Refs.

**Non-Goals:**
- Keine Ablehnung von Spieleraktionen im Pausenzustand auf dem Server (Folge-Issue, falls
  gewünscht); das Overlay ist Oberfläche.
- Keine Wiederverbindungs-Schaltfläche im Banner; nach `io server disconnect` bleibt der
  Weg über `Zurück` (Top-Bar) und `Betreten`.
- Keine Übersetzung der übrigen Rohstrings der Panels (Epic C/D); nur die neuen Texte
  laufen über `t()`.
- Kein Leerzustand für Teilnehmerliste und Markierungen je Token.
- Kein Overlay für die Spielleitung, keines in `gestartet` oder `geschlossen`.

## Decisions

### D1 — Modul `src/client/ui/status.tsx`

Exporte (verbindlich):

```ts
export interface StatusBannerProps { children: ReactNode }
export function StatusBanner(props: StatusBannerProps): JSX.Element

export interface MapOverlayProps { title: string; subline: string; icon: IconName }
export function MapOverlay(props: MapOverlayProps): JSX.Element

export interface EmptyStateProps { title: string; hint: string }
export function EmptyState(props: EmptyStateProps): JSX.Element
```

- **`StatusBanner`-Markup** (verbindlich):
  ```
  <div className="status-banner" role="status">
    <Icon name="warning" />
    <span>{children}</span>
  </div>
  ```
  `Icon` aus `../ui/Icon.js` (rendert `aria-hidden`). Kein `aria-live`-Attribut zusätzlich —
  `role="status"` trägt es implizit.
- **`MapOverlay`-Markup** (verbindlich; `titleId` aus `useId()`):
  ```
  <div className="map-overlay" role="region" aria-labelledby={titleId}>
    <Icon name={icon} />
    <p className="map-overlay-title" id={titleId}>{title}</p>
    <p className="map-overlay-subline">{subline}</p>
  </div>
  ```
  Das Overlay ist ein gewöhnliches Element (kein `pointer-events: none`): es liegt über der
  Kartenansicht und fängt damit Zeigerereignisse ab (proposal.md „Overlay nur für
  Spieler"). Der Aufrufer stellt es als **letztes Kind** in die **Bühne**
  `<div className="map-stage">`, die auch die Kartenansicht enthält (D5).
- **`EmptyState`-Markup** (verbindlich, identisch mit dem bisherigen Leerzustand der
  Startansicht):
  ```
  <p className="empty-state">
    <strong>{title}</strong>
    <span>{hint}</span>
  </p>
  ```
- Die Datei importiert `react`, `./Icon.js` und den Typ `IconName` aus `./icons.js`, sonst
  nichts. Keine Texte, keine Timer, kein Kontext.

### D2 — Verbindungszustand in der Raumansicht

Neuer State in `SessionRoom`: `disconnected: 'unterbrochen' | 'getrennt' | null`
(Startwert `null`). Neue Refs: `endedRef` (Wahrheitswert, Startwert `false`), `pushRef`,
`tRef`, `onEndedRef`, `onLeaveRef` — die vier letzten werden bei jedem Rendern auf den
aktuellen Wert gesetzt (`pushRef.current = push` usw.), damit `wireSocket` sie lesen kann,
ohne sie als Abhängigkeit zu führen. `wireSocket` hängt danach nur noch an `sessionId` und
`currentUserId`; `onEnded`/`onLeave` kommen aus den Refs (Goal „keine neue Fassade bei einem
Rendern von `App`").

In `wireSocket`, zusätzlich zu den bestehenden Handlern:

- `socket.on('disconnect', (reason) => …)`: ist `isCancelled()`, `replacedRef.current` oder
  `endedRef.current` wahr oder lautet `reason` `io client disconnect`, nichts tun. Sonst:
  `reason === 'io server disconnect'` → `setDisconnected('getrennt')`, jeder andere Grund →
  `setDisconnected('unterbrochen')`. Begründung: `io client disconnect` entsteht durch
  `socket.disconnect()` der Anwendung selbst (Unmount, `handleReconnect`), nie durch ein
  Netzereignis; nach `replaced` hat der Server bewusst getrennt (Dialog, D3); nach `ended`
  ist der Raum verlassen (Dialog, D4).
- Der bestehende `reconnect`-Handler bleibt, prüft zusätzlich `endedRef.current` (dann
  nichts tun) und ruft **vor** `enter()`: `setDisconnected(null)` und
  `pushRef.current(tRef.current('toast.reconnected'))`. Der Toast kommt bei jeder gemeldeten
  Wiederverbindung — das Ereignis feuert nur, wenn der Server die Verbindung angenommen hat;
  ob das erneute Betreten gelingt, zeigt danach der bestehende Pfad (Fehlermeldung des
  Servers).
- `handleReconnect` („Hier weiterspielen") setzt zusätzlich `setDisconnected(null)`.

**Banner-Rendering.** Die Komponente rendert in jedem Zustand (`lädt`, `fehler`, `bereit`)
dasselbe Grundgerüst:

```
<div>
  {banner}
  {content}
  {dialogs}
</div>
```

`banner` ist `<StatusBanner>{t(key)}</StatusBanner>` genau dann, wenn `disconnected` nicht
`null`, `replaced` falsch und `ended` falsch ist — `key` ist `status.disconnected` für
`unterbrochen` und `status.disconnectedByServer` für `getrennt`; sonst `null`. `content` ist
der bisherige Inhalt des jeweiligen Zustands (`Lädt …`, Fehlermeldung, Raum) — der frühe
`return` für `replaced` entfällt (D3). `dialogs` siehe D3/D4.

### D3 — Ersetzt-Dialog

`replaced` wird nicht mehr als eigene Ansicht gerendert, sondern als Dialog über dem
unverändert gerenderten Inhalt (`dialogs` in D2):

```
<Modal role="alertdialog" title={t('session.replaced.title')} description={t('session.replaced.message')} onClose={leave}>
  <div className="modal-actions">
    <button type="button" onClick={leave}>{t('session.toList')}</button>
    <button type="button" className="primary" autoFocus onClick={handleReconnect}>{t('session.replaced.continue')}</button>
  </div>
</Modal>
```

`leave` ist `() => onLeaveRef.current()`. Damit führen `Zur Übersicht`, Esc und `Schließen`
(alle drei rufen `onClose`) zur Liste; `Hier weiterspielen` verhält sich wie bisher
(`handleReconnect`). Gerendert wird der Ersetzt-Dialog nur, wenn `replaced` wahr **und**
`ended` falsch ist — ist beides wahr, zeigt die Ansicht allein den Sitzungsende-Dialog (die
Sitzung ist vorbei, ein erneutes Betreten wäre sinnlos).

### D4 — Sitzungsende-Dialog und Timer

Neuer State `ended` (Wahrheitswert, Startwert `false`) neben `endedRef`. Der `ended`-Handler
in `wireSocket` setzt `endedRef.current = true` und `setEnded(true)` — er ruft `onEnded`
**nicht** mehr direkt. Modulkonstante `ENDED_REDIRECT_MS = 4000`.

```
<Modal role="alertdialog" title={t('session.ended.title')} description={t('session.ended.message')} onClose={finish}>
  <div className="modal-actions">
    <button type="button" className="primary" autoFocus onClick={finish}>{t('session.toList')}</button>
  </div>
</Modal>
```

`finish` ist `() => onEndedRef.current()`. Ein `useEffect` mit Abhängigkeit `[ended]`: ist
`ended` wahr, `setTimeout(finish, ENDED_REDIRECT_MS)`; Cleanup ruft `clearTimeout` — beim
Unmount (die Anwendung hat zur Liste gewechselt) räumt das den Timer, ein zweiter Aufruf von
`onEnded` bleibt aus. Gerendert wird der Dialog genau dann, wenn `ended` wahr ist, in jedem
Zustand von `state`.

**Props von `SessionRoom`** (verbindlich):

```ts
export interface SessionRoomProps {
  sessionId: string
  currentUserId: string
  onEnded: () => void
  onLeave: () => void
}
```

`ENDED_MESSAGE` und `REPLACED_MESSAGE` entfallen aus `SessionRoom` (die Texte kommen aus
D7). `App` übergibt `onEnded={() => { setHinweis(t('session.ended.hint')); setSessionView({ view: 'liste' }) }}`
und `onLeave={() => setSessionView({ view: 'liste' })}` — der Hinweis auf der Liste ist
buchstabengleich der bisherige (`Die Spielsitzung wurde beendet.`).

### D5 — Overlay in der Kartenansicht

In `session-status.ts` eine neue Tabelle (verbindlich):

```ts
export interface OverlayPresentation { title: TextKey; subline: TextKey }
export const SESSION_OVERLAY: Partial<Record<GameSessionStatus, OverlayPresentation>> = {
  pausiert: { title: 'overlay.paused.title', subline: 'overlay.paused.subline' },
  geoeffnet: { title: 'overlay.open.title', subline: 'overlay.open.subline' },
}
```

Das Icon des Overlays ist `SESSION_STATUS_PRESENTATION[status].icon` (also `pause` bzw.
`players`) — keine zweite Icon-Zuordnung. In `SessionRoom` (Zustand `bereit`, Karte
vorhanden) wird der Canvas-Container zur Bühne:

```
<div className="map-stage" style={{ width: '100%', height: MAP_CANVAS_HEIGHT }}>
  <MapCanvas … />
  {overlay !== undefined && state.role === 'spieler' && (
    <MapOverlay title={t(overlay.title)} subline={t(overlay.subline)} icon={SESSION_STATUS_PRESENTATION[state.sessionStatus].icon} />
  )}
</div>
```

mit `overlay = SESSION_OVERLAY[state.sessionStatus]`. Die Bühne ersetzt das bisherige
`<div style={{ width: '100%', height: MAP_CANVAS_HEIGHT }}>` (Größe bleibt). Ohne aktive
Karte gibt es keine Bühne und kein Overlay — der Hinweis `Keine Karte aktiv` bleibt. Das
Overlay folgt `state.sessionStatus`, also ausschließlich dem Enter-Acknowledgement und
`session:status` (§9.1); es hat keinen eigenen State.

### D6 — Leerzustände

Jede Liste rendert **statt** ihres `<ul>` den Baustein, wenn die Liste leer ist; das
`<ul>` wird dann nicht gerendert (Muster der Startansicht). Texte über `t(...)` mit `useT()`
in der jeweiligen Komponente (auch dort, wo die übrigen Texte Rohstrings bleiben):

| Komponente | Liste | Bedingung | Titel-Schlüssel | Hinweis-Schlüssel |
|---|---|---|---|---|
| `TokenPanel` | Tokens der Verwaltung | `tokens.length === 0` | `empty.tokens.title` | `empty.tokens.hint` |
| `PlayerTokenList` | Liste unter `Tokenwerte` | `tokens.length === 0` | `empty.tokens.title` | `empty.tokenValues.hint` |
| `FogPanel` | Bereiche | `(fog.areas ?? []).length === 0` | `empty.fogAreas.title` | `empty.fogAreas.hint` |
| `AnnotationPanel` | Anmerkungen | `annotations.length === 0` | `empty.annotations.title` | `empty.annotations.hint` |
| `MapPanel` | eingehängte Karten | `instances` ist `[]` (siehe unten) | `empty.mapInstances.title` | `empty.mapInstances.hint` |
| `MapLibrary` | Karten der Bibliothek | `maps` ist `[]` und `loadError` ist `null` (siehe unten) | `empty.library.title` | `empty.library.hint` |

- **Erst nach der ersten Antwort.** `MapPanel.instances` und `MapLibrary.maps` bekommen den
  Typ `… | null` mit Startwert `null`; solange `null`, rendert die Komponente weder `<ul>`
  noch Leerzustand (sonst blitzte „Noch keine …" vor jeder Antwort auf). Die Ableitungen in
  `MapPanel` (`mountedMapIds`, `availableMaps`) rechnen mit `instances ?? []`; die
  Absende-Sperre des Einhängen-Formulars bleibt. Ein Ladefehler (`loadError`) zeigt wie
  bisher die Meldung und keinen Leerzustand.
- Die Position des Bausteins ist die Position des bisherigen `<ul>` im Markup; alle
  Überschriften, Formulare und Schaltflächen bleiben.
- `SessionList` ersetzt sein eigenes `<p className="empty-state">…` durch
  `<EmptyState title={t('start.empty.title')} hint={t('start.empty.hint')} />` — gleiches
  Markup, gleicher Text.

### D7 — Wörterbücher (`de.ts`, `en.ts`)

Neue Schlüssel (verbindlich, buchstabengleich; Gedankenstrich als ein Zeichen `—`,
Auslassungspunkte als ein Zeichen `…`). Im deutschen Wörterbuch stehen `session.*` bei den
Sitzungsschlüsseln, `toast.reconnected` bei den Toasts, die übrigen als neue Gruppen vor
`form.stillWorking`; das englische Wörterbuch spiegelt die Menge (Typfehler bei Abweichung).

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `status.disconnected` | Verbindung unterbrochen — verbinde neu… | Connection lost — reconnecting… |
| `status.disconnectedByServer` | Verbindung vom Server getrennt. | Disconnected by the server. |
| `toast.reconnected` | Verbindung wiederhergestellt | Connection restored |
| `overlay.paused.title` | Pausiert | Paused |
| `overlay.paused.subline` | Die Spielleitung hat die Sitzung angehalten. | The game master has paused the session. |
| `overlay.open.title` | Noch nicht gestartet | Not started yet |
| `overlay.open.subline` | Die Spielleitung hat die Sitzung noch nicht gestartet. | The game master has not started the session yet. |
| `session.toList` | Zur Übersicht | To the overview |
| `session.ended.title` | Sitzung beendet | Session ended |
| `session.ended.message` | Die Spielleitung hat die Sitzung beendet. Du wirst zur Übersicht geleitet. | The game master has ended the session. You will be taken to the overview. |
| `session.ended.hint` | Die Spielsitzung wurde beendet. | The game session has ended. |
| `session.replaced.title` | An anderer Stelle geöffnet | Opened elsewhere |
| `session.replaced.message` | Diese Spielsitzung wurde an anderer Stelle geöffnet. | This game session was opened elsewhere. |
| `session.replaced.continue` | Hier weiterspielen | Continue here |
| `empty.tokens.title` | Noch keine Tokens | No tokens yet |
| `empty.tokens.hint` | Lege ein Token an, um es auf der Karte zu sehen. | Create a token to see it on the map. |
| `empty.tokenValues.hint` | Sobald die Spielleitung Tokens auf die Karte setzt, erscheinen sie hier. | Tokens appear here once the game master places them on the map. |
| `empty.fogAreas.title` | Noch keine Bereiche | No areas yet |
| `empty.fogAreas.hint` | Markiere Zellen auf der Karte und speichere sie als Bereich. | Select cells on the map and save them as an area. |
| `empty.annotations.title` | Noch keine Anmerkungen | No annotations yet |
| `empty.annotations.hint` | Miss eine Strecke oder zeichne auf der Karte. | Measure a distance or draw on the map. |
| `empty.mapInstances.title` | Noch keine Karten eingehängt | No maps mounted yet |
| `empty.mapInstances.hint` | Hänge eine Karte aus deiner Bibliothek ein. | Mount a map from your library. |
| `empty.library.title` | Noch keine Karten | No maps yet |
| `empty.library.hint` | Lege eine Karte mit Namen und Bild an. | Create a map with a name and an image. |

### D8 — Stylesheet (Abschnitt „Zustandsanzeigen" in `theme.css`)

Nach dem Abschnitt „Formulare" und vor dem Bewegungsblock ein Kommentar
`/* Zustandsanzeigen (ui-status, #91) */` und diese Regeln — nur `var(--…)` bzw.
`color-mix` über Tokens, kein Farbwert, kein neues `@media`, keine Bewegung:

- `.status-banner`: `display: flex`, `align-items: center`, `gap: var(--space-2)`,
  `margin: 0 0 var(--space-3)`, `padding: var(--space-2) var(--space-3)`,
  `border: 1px solid var(--amber-border)`, `border-radius: var(--radius-3)`,
  `background: var(--amber-bg)`, `color: var(--amber)`.
- `.map-stage`: `position: relative`.
- `.map-overlay`: `position: absolute`, `inset: 0`, `z-index: 1`, `display: flex`,
  `flex-direction: column`, `align-items: center`, `justify-content: center`,
  `gap: var(--space-1)`, `padding: var(--space-4)`, `text-align: center`,
  `background: color-mix(in srgb, var(--gray-1) 62%, transparent)`,
  `backdrop-filter: blur(1.5px)`, `color: var(--color-text)`.
- `.map-overlay-title`: `margin: 0`, `font-size: var(--font-size-4)`, `font-weight: 600`.
- `.map-overlay-subline`: `margin: 0`, `color: var(--color-text-muted)`.
- `.empty-state` bleibt unverändert (aus `ui-theme`).

Der Bewegungsblock bleibt unverändert (keine Animation für Banner oder Overlay).

### D9 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle, Namen und Text; Listen und Panels immer
gescoped):

| Element | Adresse |
|---|---|
| Trennung / Wiederverbindung | Mock der Socket-Fassade wie in den bestehenden Raum-Suiten: den bei `on('disconnect', …)` registrierten Handler mit dem Grund als einzigem Argument aufrufen (`transport close`, `io server disconnect`, `io client disconnect`); Wiederverbindung = den bei `on('reconnect', …)` registrierten Handler ohne Argument aufrufen, nachdem `enter` des Mocks für den zweiten Aufruf ein Acknowledgement liefert |
| Banner | `getByText(<Bannertext>)`; sein `closest('[role="status"]')` trägt die Klasse `status-banner`; „kein Banner" = `queryByText` beider Bannertexte liefert `null` |
| Toast | der Toast-Host ist das Element mit Rolle `status` **und** Klasse `toast-host` (Banner und Host tragen beide `role="status"` — `getAllByRole('status')` und nach der Klasse filtern); der Toast darin über `within(host).getByText(…)` |
| Overlay | `getByRole('region', { name: 'Pausiert' })` bzw. `{ name: 'Noch nicht gestartet' }`; die Subline über `within(overlay).getByText(…)`; „über der Karte" = `overlay.parentElement` trägt die Klasse `map-stage`; „kein Overlay" = `queryByRole('region', { name: … })` liefert `null`; Zustandswechsel über den registrierten `status`-Handler mit `{ sessionId, status }` |
| Dialoge | `getByRole('alertdialog', { name: 'Sitzung beendet' })` bzw. `{ name: 'An anderer Stelle geöffnet' }`; Beschreibung über `within(dialog).getByText(…)`; Schaltflächen `Zur Übersicht`, `Hier weiterspielen`, `Schließen` (das X, `ui-dialog`) über `within(dialog).getByRole('button', { name })`; Esc = `keydown` mit `key: 'Escape'` auf `document` |
| Liste danach | die Sitzungsliste an der Schaltfläche `Sitzung leiten`; der Hinweis `Die Spielsitzung wurde beendet.` per `getByText` (Rolle `alert`, `ui-shell`) |
| Timer | `jest.useFakeTimers()` vor dem Rendern; Vorrücken per `act` um 4000 Millisekunden; „vor Ablauf bleibt der Raum" = nach 3999 Millisekunden ist die Überschrift der Ebene 1 mit dem Sitzungsnamen noch da |
| Neue Verbindung | `createSessionSocket` des Mocks wurde ein zweites Mal aufgerufen, `connect` und `enter` je zweimal — beide Aufrufe liefern dieselbe Mock-Fassade, wie in der bestehenden Suite |
| Leerzustand | `getByText(<Titel>)` — das `<strong>`; sein `closest('.empty-state')` existiert; der Hinweis per `getByText(<Hinweis>)`; gescoped: Token-Verwaltung = Elternelement der Überschrift `Tokens`, Tokenwerte = Elternelement der Überschrift `Tokenwerte`, Fog-Verwaltung = Gruppe `Fog of War`, Anmerkungen = Gruppe `Messen & Zeichnen`, Kartenverwaltung = Elternelement der Überschrift `Karten`, Bibliothek = Elternelement der Überschrift `Kartenbibliothek`; „keine Liste" = `within(scope).queryByRole('list')` liefert `null` (in Panels, die keine andere Liste haben) bzw. `queryAllByRole('listitem')` ist leer |
| Baustein-Szenarien | rendern `StatusBanner`, `MapOverlay`, `EmptyState` (Exporte aus `src/client/ui/status.tsx`) direkt, ohne `App`; für „fängt Zeigerereignisse ab" genügt: das Overlay ist ein gerendertes Element ohne `pointer-events`-Inline-Stil und letztes Kind seines Elternelements |
| Sprache | `setLocale('en')` aus `src/client/i18n/locale.ts` vor dem Rendern, im Cleanup zurück auf `de` |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben Helfer wie in der Theme-/Dialog-/Formular-Suite, sie können dupliziert werden |

Szenarien, die Exporte des noch fehlenden Moduls `status.tsx` importieren, gehören in eine
eigene Datei, damit ein Ladefehler die bestehenden Suiten nicht mitreißt. Die Raum-Szenarien
rendern `App` mit gemocktem `fetch` und gemockter Socket-/Canvas-Fassade nach dem Muster der
bestehenden Raum-Suiten; die Mock-Fassade muss `on` für `disconnect` merken (bestehende Mocks
tun das für jedes Ereignis). `TokenPanel` und `PlayerTokenList` erhalten `tokens` als Prop —
für den Leerzustand ein Acknowledgement mit `tokens: []`.

### D10 — Reihenfolge der Kopplungen

`status.tsx` importiert `react`, `Icon.tsx` und den Typ aus `icons.ts`. `SessionRoom`
importiert `status.tsx`, `Modal.tsx`, `session-status.ts` (neu: `SESSION_OVERLAY`) und
weiterhin `toast.tsx`/`locale.ts`. Die sechs Listen-Komponenten importieren `status.tsx` und
`locale.ts`. `App` ändert nur die beiden Props. `pixi.js` bleibt außerhalb der statischen
Importkette von `App` (unverändert). Kein Server-Code.

## Risks / Trade-offs

- **Zwei Live-Regionen mit `role="status"`** (Banner, Toast-Host) → Screenreader lesen beide;
  gewollt, Banner und Toast treten nie im selben Moment auf (Banner verschwindet mit
  `reconnect`, der Toast folgt). Tests unterscheiden über die Klasse (D9).
- **Overlay sperrt Eingaben, der Server nicht** → ein Spieler mit Entwicklerwerkzeugen kann
  das Overlay entfernen und ziehen; der Server erlaubt es ohnehin. Entscheidung der
  Explore-Runde; eine Serverregel wäre ein eigener Change.
- **Toast bei jeder Wiederverbindung, auch wenn das erneute Betreten scheitert** → der Toast
  sagt „Verbindung wiederhergestellt", danach zeigt der Raum die Ablehnung des Servers. Beides
  stimmt; kein zweiter Zustand dafür.
- **Timer läuft auch in einem Hintergrund-Tab** → Browser drosseln `setTimeout` auf ≥ 1 s,
  der Wechsel kommt dann etwas später; der Dialog bleibt bis dahin stehen.
- **`Noch keine Tokens` für Spieler kann „Tokens außerhalb deiner Sicht" bedeuten** (Fog);
  der Hinweis sagt „auf die Karte setzt", nicht „anlegt" — bewusst vage, weil der Client die
  verborgene Menge nicht kennt (§9.2).
- **Rückrufe in Refs** → `onEnded`/`onLeave` sehen immer den aktuellen Wert; der
  `useCallback` von `wireSocket` verliert die Abhängigkeit — das ist der Zweck, keine
  Stale-Closure-Falle, weil die Refs bei jedem Rendern nachgezogen werden.
