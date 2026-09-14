## Context

Vorhanden in `SessionRoom.tsx` (Zweig `state.status === 'bereit'`): eine gemeinsame
`<SessionBar …>` für beide Rollen, danach die Raum-Meldungen (`tokenError`, `fogError`,
`annotationError` je als `<p role="alert">`), die `<TabList label={t('tabs.label')} …>` und
die `<TabPanel>`-Blöcke `karte` (Kartenhinweis, `map-stage` mit `<MapCanvas>` und — nur für
den Spieler — `<MapOverlay>`; darunter `<AnnotationPanel>` bei aktiver Karte, `<FogPanel>` nur
Spielleiter), `tokens` (Spielleiter `<TokenPanel>`, sonst `<PlayerTokenList>`), `karten` (nur
Spielleiter) und `teilnehmer` (`<ul class="participant-card-list">` mit `<ParticipantCard>`,
Kopf mit Einladen-Popover nur für den Spielleiter mit Code). Die Reiterliste kommt aus
`ROOM_TABS` gefiltert nach `state.role`; `activeTab` ist Komponentenzustand (Standard
`karte`).

Relevante Bausteine und Zustände:
- `state.role` (`'spielleiter' | 'spieler'`), `state.sessionStatus`, `state.name`,
  `state.tokens`, `state.participants`, `state.map`, `state.annotations`, `state.fog`,
  `currentUserId`; `self = state.participants.find(p => p.userId === currentUserId)`;
  `displayName(self)` liefert Alias, sonst Nutzernamen (`shared/session.ts`).
- `disconnected: 'unterbrochen' | 'getrennt' | null` (State, gesetzt im `disconnect`-Handler,
  auf `null` im `reconnect`). Verbindung besteht ⇔ `disconnected === null`.
- Der einzige Token-Handler ist `socket.on('tokens', ({ tokens }) => setState(prev =>
  prev.status === 'bereit' ? { ...prev, tokens } : prev))`. Der Server sendet die volle,
  pro Empfänger redaktierte Liste; ein für den Spieler nicht freigegebener Wert kommt als
  `null` an (`redactToken`, §9.2).
- `openAliasModal()` (ohne Argument): prefilled Alias der eigenen Karte, `setAliasModalOpen(true)`.
- `SESSION_STATUS_PRESENTATION[status]` → `{ label: TextKey, icon: IconName, modifier }`
  für die Zustandspille (`<span className="status-pill status-pill--<modifier>"><Icon
  name=… /> {t(label)}</span>`). `SESSION_OVERLAY[status]` (nur für einen Spieler gerendert)
  → Overlay-Texte; `MapOverlay` (`ui-status`).
- `PlayerTokenList` (`TokenStats.tsx`): rendert `<div class="panel"><h2>Tokenwerte</h2>…`,
  Props `tokens`, `participants`, `menuEntries`; unverändert. `AnnotationPanel` (Props wie im
  bestehenden `karte`-Reiter). `ParticipantCard` (Props `participant`, `isOwn`, `tokens`,
  `menuEntries`, `onEditAlias`). `Modal` (`ui-dialog`): Titel = zugänglicher Name, Fokus auf
  `autoFocus`-Kind, Fokusrückgabe an den beim ersten Render gemerkten Auslöser.
- `ui-icons`, `ui-menu`, `chip`, `status-pill` vorhanden; `.badge`, `.player-bar*` und eine
  visuell verborgene Utility gibt es noch **nicht** (dieser Change legt sie an, kapselt in der
  Spieler-Leiste, keine globale sr-only-Klasse).
- `theme.css`: Tokens `--teal`, `--red`, `--gold-grad`, `--gold-dark`, `--gold-text`,
  `--gold-border`, `--teal-bg`, `--teal-border`, `--space-*`, `--radius-pill`, `--font-size-*`,
  `--color-border(-faint)`, `--panel-grad`, `--shadow-panel`; genau **ein** `@media`
  (Bewegungsabfrage am Dateiende). Bindend und nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Eine eigene Spieler-Leiste**, die die Session-Bar und die Reiterliste des Spielers
  ersetzt: Identität, Zustand, drei On-Demand-Trigger, Verbindungspunkt.
- **Karte dauerhaft, Rest on-demand** (Epic #104): Tokenwerte, Anmerkungen, Teilnehmer nur im
  Modal.
- **Badge und Verbindung spiegeln den Server** (§9.1): Anzahl aus dem Bestand, teal aus einem
  neu freigegebenen Wert, Verbindung aus `disconnect`/`reconnect`.
- **Kein Code beim Spieler** (§9.2): der Avatar trägt den Anzeigenamen, kein Popover.
- **Der Spielleiter bleibt unberührt**: `SessionBar` + Reiter wie heute.

**Non-Goals:**
- Keine Tokenwerte-Karten mit Puls (#99), kein Responsive/Touch (#100).
- Kein neuer Drawer-Baustein; keine Änderung an `PlayerTokenList`, `AnnotationPanel`,
  `ParticipantCard`, `SessionBar`, dem Vertrag oder dem Server.
- Kein Verwaltungsmenü in der Spieler-Leiste; `Zurück`/`Austreten` bleiben die Wege hinaus.
- Keine Übersetzung weiterer Rohstrings; nur neue Texte laufen über `t()`.

## Decisions

### D1 — Komponente `PlayerBar` (`src/client/session/PlayerBar.tsx`)

Props (verbindlich):

```ts
export interface PlayerBarProps {
  name: string                 // Sitzungsname (Überschrift Ebene 1)
  ownName: string              // Anzeigename des Spielers (Avatar-Label + Initiale)
  status: GameSessionStatus
  connected: boolean           // disconnected === null
  tokenCount: number           // Anzahl zugewiesener Tokens (ownerId === userId)
  tokenEvent: boolean          // neu freigegebener Wert unbeachtet → teal
  annotationsDisabled: boolean // keine aktive Karte
  onOpenTokens: () => void
  onOpenAnnotations: () => void
  onOpenParticipants: () => void
}
export function PlayerBar(props: PlayerBarProps): JSX.Element
```

Rein präsentational (kein eigener State). `t = useT()`. Gerendert wird ein `<div
className="player-bar" role="group" aria-label={t('playerBar.label')}>` mit drei Gruppen in
dieser Reihenfolge:

1. **Identität** `<div className="player-bar__group player-bar__identity">`:
   - `<span className="player-bar__avatar" role="img" aria-label={ownName}>{initial}</span>`
     mit `initial = ownName.charAt(0).toUpperCase()` (leerer `ownName` → `'?'`).
   - `<h1 className="player-bar__name">{name}</h1>`.
   - `<span className="chip">{t('session.role.player')}</span>`.
2. **Zustand** `<div className="player-bar__group">`: die Zustandspille exakt wie in
   `SessionBar` (`SESSION_STATUS_PRESENTATION[status]`: `<span className={`status-pill
   status-pill--${modifier}`}><Icon name={icon} /> {t(label)}</span>`).
3. **Trigger** `<div className="player-bar__group player-bar__triggers">`:
   - `<button type="button" className="player-bar__trigger" onClick={onOpenTokens}>` mit dem
     Text `t('tabs.tokens')`; ist `tokenCount > 0`, folgt ein Badge:
     `<span className={`badge ${tokenEvent ? 'badge--teal' : 'badge--gold'}`}>{tokenCount}
     {tokenEvent && <span className="player-bar__badge-note"> {t('playerBar.newValues')}</span>}
     </span>`. Bei `tokenCount === 0` **kein** Badge. (Der zugängliche Name des Triggers wird
     so bei `tokenEvent` „Tokens <n> neue Werte" — die Farbe trägt die Bedeutung nicht allein.)
   - `<button type="button" className="player-bar__trigger" onClick={onOpenAnnotations}
     disabled={annotationsDisabled}>{t('playerBar.annotations')}</button>`.
   - `<button type="button" className="player-bar__trigger" onClick={onOpenParticipants}>
     {t('tabs.participants')}</button>`.
   - `<span className="player-bar__connection" role="img" data-connected={connected ? 'true'
     : 'false'} aria-label={connected ? t('playerBar.connected') : t('playerBar.disconnected')}
     />`.

`PlayerBar.tsx` importiert `react`, `shared/session.ts` (Typen `GameSessionStatus`),
`session-status.ts` (`SESSION_STATUS_PRESENTATION`), `locale.ts`, `ui/Icon.tsx` — nichts
sonst. `pixi.js` bleibt außerhalb.

### D2 — Raumansicht (`SessionRoom.tsx`)

**Neuer State/Refs:**
- `const [tokensOpen, setTokensOpen] = useState(false)`,
  `const [annotationsOpen, setAnnotationsOpen] = useState(false)`,
  `const [participantsOpen, setParticipantsOpen] = useState(false)`.
- `const [tokenEvent, setTokenEvent] = useState(false)`.
- `const tokensOpenRef = useRef(false); tokensOpenRef.current = tokensOpen` (der
  `tokens`-Handler liest den aktuellen Öffnungszustand ohne Neuverdrahtung).

**`tokens`-Handler erweitern** (Erkennung des neu freigegebenen Werts, §9.1):
Im bestehenden `socket.on('tokens', ({ tokens }) => …)` vor dem `setState` prüfen — nur wenn
die Rolle `spieler` ist und `tokensOpenRef.current === false`:
für jedes eingehende Token mit `ownerId === currentUserId`, das mit derselben `id` bereits
im vorigen Bestand (`prev.tokens`) vorhanden war, ob ein Wertefeld aus `['hp','hpMax',
'tempHp','ac','initiative']` im vorigen Token `null` und im neuen nicht `null` ist. Trifft das
für mindestens ein Feld zu, `setTokenEvent(true)`. (Ein neu hinzugekommenes Token — nicht im
vorigen Bestand — löst **kein** teal aus; nur ein *freigegebener* Wert eines schon
vorhandenen eigenen Tokens.) Die Prüfung braucht den vorigen Bestand — sie im
`setState(prev => …)`-Updater durchführen und `setTokenEvent` daraus per `queueMicrotask`
bzw. direkt danach aufrufen, oder den Vergleich vor dem `setState` gegen den in einer Ref
gehaltenen letzten Bestand fahren. Der Handler bleibt frei von Testinhalt.

**Ableitungen im `bereit`-Zweig:**
- `const ownedTokenCount = state.tokens.filter(tk => tk.ownerId === currentUserId).length`.
- `const ownName = self ? displayName(self) : ''` (`self` wie an anderer Stelle berechnet).
- `const annotationsDisabled = state.map === null`.

**Rollenverzweigung des Inhalts:** Der `content` teilt sich nach `state.role`:
- **Spielleiter:** unverändert `<SessionBar …/>` + Raum-Meldungen + `<TabList>` + die
  `<TabPanel>`-Blöcke wie heute.
- **Spieler:**
  ```
  <PlayerBar name={state.name} ownName={ownName} status={state.sessionStatus}
    connected={disconnected === null} tokenCount={ownedTokenCount} tokenEvent={tokenEvent}
    annotationsDisabled={annotationsDisabled}
    onOpenTokens={() => { setTokenEvent(false); setTokensOpen(true) }}
    onOpenAnnotations={() => setAnnotationsOpen(true)}
    onOpenParticipants={() => setParticipantsOpen(true)} />
  ```
  danach die Raum-Meldungen (`tokenError`, `annotationError` je `<p role="alert">` — wie
  heute, für jede Rolle), danach **dauerhaft** die Kartenansicht: der Kartenhinweis (`<p
  className="map-caption">Aktive Karte: <Name></p>` bzw. `Keine Karte aktiv`) und, bei
  `state.map !== null`, die `<div className="map-stage">` mit `<MapCanvas …/>` (dieselben
  Props wie heute) und dem `<MapOverlay>` (Bedingung `overlay !== undefined`, wie heute nur
  für den Spieler). **Keine** `TabList`, **keine** `TabPanel`, **kein** inline gerendertes
  `PlayerTokenList`/`AnnotationPanel`/Teilnehmerliste.

**Drei Modals** (im `dialogs`-Fragment, jeweils `state.role === 'spieler' && state.status ===
'bereit' && <flag>`):
- Tokenwerte: `<Modal title={t('playerBar.tokensTitle')} onClose={() => setTokensOpen(false)}>
  <PlayerTokenList tokens={state.tokens} participants={state.participants}
  menuEntries={menuEntries} /></Modal>`.
- Anmerkungen: nur zusätzlich bei `state.map !== null` (der Trigger ist sonst gesperrt):
  `<Modal title={t('playerBar.annotations')} onClose={() => setAnnotationsOpen(false)}>
  <AnnotationPanel …dieselben Props wie im heutigen karte-Reiter… /></Modal>`.
- Teilnehmer: `<Modal title={t('tabs.participants')} onClose={() => setParticipantsOpen(false)}>
  <ul className="participant-card-list">{state.participants.map(p => <ParticipantCard
  key={p.userId} participant={p} isOwn={p.userId === currentUserId} tokens={state.tokens}
  menuEntries={participantMenuEntries(p, state.role, currentUserId, t,
  handleParticipantMenuAction)} onEditAlias={() => { setParticipantsOpen(false);
  openAliasModal() }} />)}</ul></Modal>`. **Kein** Einladen-Popover, **kein** `<code>` (der
  Spieler hat keinen Code, §9.2).

`onEditAlias` schließt zuerst das Teilnehmer-Modal und öffnet dann das bestehende
Alias-Modal (nur ein Modal zugleich). Das Alias-Modal (`aliasModalOpen`) bleibt wie heute.

Die Refs/Props `onOpenLibrary`/`onLeave` bleiben unverändert für den Spielleiter-Zweig und
die Top-Bar; die Spieler-Leiste nutzt sie nicht.

### D3 — Wörterbücher (`de.ts`, `en.ts`)

Neue Schlüssel (verbindlich, buchstabengleich), Gruppe `playerBar.*` als neue Gruppe nach
`tabs.*`; das englische spiegelt die Menge:

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `playerBar.label` | Sitzung | Session |
| `playerBar.annotations` | Anmerkungen | Annotations |
| `playerBar.tokensTitle` | Tokenwerte | Token values |
| `playerBar.connected` | Verbindung aktiv | Connected |
| `playerBar.disconnected` | Verbindung getrennt | Disconnected |
| `playerBar.newValues` | neue Werte | new values |

Wiederverwendet (keine neuen Schlüssel): `tabs.tokens` (`Tokens`), `tabs.participants`
(`Teilnehmer`), `session.role.player` (`Spieler`).

### D4 — Stylesheet (Abschnitt „Spieler-Leiste" in `theme.css`)

Nach dem Abschnitt „Session-Bar" und **vor** dem Bewegungsblock ein Kommentar
`/* Spieler-Leiste (player-bar, #98) */` und Regeln für jeden der zwölf Selektoren — nur
`var(--…)`, kein Farbwert, kein neues `@media`, keine `animation`/`transition`:

- `.player-bar`: `display: flex`, `align-items: center`, `gap: var(--space-3)`,
  `min-width: 0`, `overflow: hidden`, `margin: 0 0 var(--space-4)`,
  `padding: var(--space-2) var(--space-3)`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-pill)`, `background: var(--panel-grad)`,
  `box-shadow: var(--shadow-panel)`.
- `.player-bar__group`: `display: flex`, `align-items: center`, `gap: var(--space-2)`,
  `flex: 0 0 auto`, `min-width: 0`.
- `.player-bar__identity`: `flex: 1 1 auto` (schiebt die Trigger nach rechts).
- `.player-bar__avatar`: feste Größe (`width`/`height` z. B. `1.9rem`),
  `border-radius: var(--radius-pill)`, `display: inline-flex`, zentrierte Initiale,
  `background: var(--gold-grad)`, `color: var(--gold-dark)`, `flex: 0 0 auto`.
- `.player-bar__name`: `margin: 0`, `min-width: 0`, `overflow: hidden`,
  `text-overflow: ellipsis`, `white-space: nowrap`, `font-size: var(--font-size-4)`,
  `line-height: 1.2`.
- `.player-bar__triggers`: `display: inline-flex`, `gap: var(--space-2)`,
  `margin-left: auto`, `align-items: center`.
- `.player-bar__trigger`: Textknopf im Stil der übrigen sekundären Knöpfe
  (`display: inline-flex`, `align-items: center`, `gap: var(--space-1)`,
  `padding: var(--space-1) var(--space-3)`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-pill)`, Hintergrund/Text über Tokens).
- `.player-bar__connection`: kleiner Punkt (`width`/`height` `0.6rem`,
  `border-radius: var(--radius-pill)`, `flex: 0 0 auto`, `background: var(--teal)`);
  `.player-bar__connection[data-connected="false"]` `background: var(--red)`.
- `.player-bar__badge-note`: visuell verborgen (`position: absolute`, `width: 1px`,
  `height: 1px`, `padding: 0`, `margin: -1px`, `overflow: hidden`, `clip-path: inset(50%)`,
  `white-space: nowrap`, `border: 0`).
- `.badge`: `display: inline-flex`, `align-items: center`, `justify-content: center`,
  `min-width: 1.25rem`, `padding: 0 var(--space-1)`, `border-radius: var(--radius-pill)`,
  `font-size: var(--font-size-1)`, `margin-left: var(--space-1)`.
- `.badge--gold`: `background: var(--gold-grad)`, `color: var(--gold-dark)`,
  `border: 1px solid var(--gold-border)`.
- `.badge--teal`: `background: var(--teal-bg)`, `color: var(--teal)`,
  `border: 1px solid var(--teal-border)`.

`.player-bar__connection[data-connected="false"]` zählt nicht als eigener Pflicht-Selektor;
Pflicht sind die zwölf oben in der Spec genannten. Für `.badge` reicht die Basisregel; Farbe
kommt aus `--gold-*`/`--teal-*`.

### D5 — Schnittstelle für die Tests

Testaufbau: `App` rendern mit gemocktem `fetch` und gemockter Socket-/Canvas-Fassade nach dem
Muster der bestehenden Raum-Suiten (der Spieler betritt über `Enter` der Sitzungskarte; das
Enter-Acknowledgement nennt `role: "spieler"` und kein `code`). Adressen (Testing-Library
über Rolle, Namen, Text; innerhalb der Leiste per `within` der Gruppe `Sitzung`):

| Element | Adresse |
|---|---|
| Leiste | `getByRole('group', { name: 'Sitzung' })` (unter EN `Session`); Reihenfolge über die Dokumentreihenfolge der Kinder; „vor der Kartenansicht" = die Gruppe steht vor `map-caption`/`map-stage` |
| Avatar | `getByRole('img', { name: <Anzeigename> })` |
| Name | `getByRole('heading', { level: 1 })` |
| Rollen-Pille | `getByText('Spieler')` mit Klasse `chip` |
| Zustandspille | `getByText('Läuft')` (bzw. `Running`) mit Klasse `status-pill` |
| Trigger | `getByRole('button', { name: /^Tokens/ })` (Name enthält Badge-Text und ggf. `neue Werte`), `getByRole('button', { name: 'Anmerkungen' })`, `getByRole('button', { name: 'Teilnehmer' })`; gesperrt = Eigenschaft `disabled` |
| Badge | innerhalb des Tokens-Triggers ein Element der Klasse `badge`; Farbe = Klasse `badge--gold`/`badge--teal`; Text = Zahl; „kein Badge" = kein `.badge` im Trigger |
| Verbindung | `getByRole('img', { name: 'Verbindung aktiv' })` bzw. `Verbindung getrennt`; Attribut `data-connected` (`"true"`/`"false"`) |
| `session:tokens` | den beim `on('tokens', …)` der Fassade registrierten Handler mit `{ tokens }` aufrufen (wie in den bestehenden Token-Szenarien) |
| Trennung/Wiederverbindung | den `disconnect`- bzw. `reconnect`-Rückruf der Fassade auslösen, wie in den bestehenden Verbindungs-Szenarien |
| Tokenwerte-Modal | `getByRole('dialog', { name: 'Tokenwerte' })`, darin Überschrift `Tokenwerte` der Ebene 2 und die Token-Karten (`within`) |
| Anmerkungs-Modal | `getByRole('dialog', { name: 'Anmerkungen' })`, darin die Gruppe `Messen & Zeichnen` |
| Teilnehmer-Modal | `getByRole('dialog', { name: 'Teilnehmer' })`, darin die Teilnehmerkarten (`within`); „kein Code" = kein `<code>` und keine Schaltfläche `Einladen`/`Sitzungscode kopieren` im Dialog; `Alias ändern` = Schaltfläche auf der eigenen Karte |
| Alias-Modal | nach `Alias ändern`: `queryByRole('dialog', { name: 'Teilnehmer' })` ist `null`, `getByRole('dialog', { name: 'Alias ändern' })` existiert |
| Kartenhinweis/Bühne | Text `Aktive Karte: <Name>` bzw. `Keine Karte aktiv`; Bühne = Element der Klasse `map-stage`; Overlay = wie in `ui-status` |
| „keine Reiterliste" | `queryByRole('tablist', { name: 'Bereiche' })` ist `null` |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben Helfer wie in den bestehenden Stylesheet-Suiten |
| Sprache | `setLocale('en')` vor dem Rendern, im Cleanup zurück auf `de` |

Die gemockte Fassade braucht `on('tokens', …)`, `on(...)` für `disconnect`/`reconnect` wie
bisher; für PixiJS gilt der bestehende Modul-Mock (`MapCanvas`).

### D6 — Reihenfolge der Kopplungen

`PlayerBar.tsx` importiert nur `react`, `shared/session.ts`, `session-status.ts`, `locale.ts`,
`ui/Icon.tsx`. `SessionRoom.tsx` importiert zusätzlich `PlayerBar` (aus `./PlayerBar.js`) und
verzweigt den `bereit`-Inhalt nach `state.role`; `SessionBar`, `TabList`, `TabPanel`,
`PlayerTokenList`, `AnnotationPanel`, `ParticipantCard` bleiben importiert (Spielleiter- bzw.
Modal-Nutzung). `de.ts`/`en.ts` bekommen die `playerBar.*`-Schlüssel. `theme.css` bekommt den
Abschnitt „Spieler-Leiste". Kein Server-, Vertrags- oder `shared/`-Import ändert sich.
`pixi.js` bleibt außerhalb der statischen Importkette von `App`.

## Risks / Trade-offs

- **Spieler verliert die Reiterliste und das Verwaltungsmenü.** Bewusste Epic-Entscheidung
  (#104); `Zurück`/`Austreten` bleiben die Wege hinaus, Tokenwerte/Anmerkungen/Teilnehmer über
  Trigger. Bestehende `session-tabs`/`session-token`/`game-session`-Spieler-Tests brechen und
  werden in der Pause über den test-author angeglichen.
- **Badge-Anzahl = zugewiesene Tokens, das Modal zeigt den vollen sichtbaren Bestand.** Der
  Issue-Wortlaut („zwei zugewiesene Tokens → 2") bindet die Zahl an `ownerId`; das
  Tokenwerte-Modal zeigt weiter alle für den Spieler sichtbaren Tokens. Im App-Test beurteilbar.
- **Teal nur bei null → Wert eines schon vorhandenen eigenen Tokens.** Ein neu zugewiesenes
  Token mit Werten färbt nicht teal (nur die Zahl steigt); ein bloß geänderter Wert ebenfalls
  nicht (Puls liegt bei #99). Klare, server-getriebene Regel statt einer Heuristik.
- **Avatar ohne Popover.** Der Issue skizzierte ein Code-Popover; da der Spieler keinen Code
  hat (§9.2), trägt der Avatar den Anzeigenamen als zugänglichen Namen. Aussehen im App-Test.
- **`AnnotationPanel` im Modal, gezeichnet wird auf der dauerhaften Karte.** Der Spieler
  öffnet `Anmerkungen`, wählt ein Werkzeug, zeichnet auf der darunterliegenden Karte. Ohne
  aktive Karte ist der Trigger gesperrt.
