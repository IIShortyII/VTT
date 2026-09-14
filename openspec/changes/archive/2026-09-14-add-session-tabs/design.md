## Context

Vorhanden: `SessionRoom.tsx` rendert im Zustand `bereit` ein Fragment aus `SessionBar`,
dann `<ul>` der Teilnehmer (je `<li>` Anzeigename, ` – anwesend`/` – abwesend`, in der
eigenen Zeile das Alias-Formular mit `<label for="alias-input">Alias</label>`, `<input
id="alias-input">`, `Alias setzen`), `aliasError` als `<p role="alert">`, den Kartenhinweis
(`<p>` mit `Aktive Karte: <Name>` bzw. `NO_ACTIVE_MAP_MESSAGE`), bei aktiver Karte die
Bühne `<div class="map-stage" style="width: 100%; height: 480px">` (Konstante
`MAP_CANVAS_HEIGHT`) mit `MapCanvas` und — für Spieler in `pausiert`/`geoeffnet` — dem
`MapOverlay`, das Karten-Token-Menü (`ActionMenu` mit `mapMenu`), die Meldungen
`tokenError`/`fogError`/`annotationError` als `<p role="alert">`, dann für den Spielleiter
`MapPanel`, bei Fog `FogPanel`, bei aktiver Karte für jede Rolle `AnnotationPanel`, für den
Spielleiter `TokenPanel`, für Spieler `PlayerTokenList` (in `SessionRoom.tsx`, `<div>` mit
`<h2>Tokenwerte</h2>`). `MapPanel` (`<div>` mit `<h2>Karten</h2>`) rendert Meldungen,
Leerzustand oder `<ul>` der Instanzen, das Formular `<label for="map-panel-mapId">Karte aus
der Bibliothek</label>` + `<select>` + `Einhängen`, danach `Keine Karte anzeigen`;
`FogPanel` und `AnnotationPanel` sind `<fieldset>` mit `<legend>Fog of War</legend>` bzw.
`<legend>Messen & Zeichnen</legend>`; `TokenPanel` ein `<div>` mit `<h2>Tokens</h2>`.
`MapCanvas.tsx` erzeugt die Fassade per dynamischem `import('./canvas.js')` einmal beim
Mount (`createMapCanvas(container, …)`, `resizeTo: container` in `app.init`), hält das Handle
in `handleRef` und ruft Setter tolerant (`handle.setFog?.()`), weil ältere Mocks sie nicht
kennen. `MapCanvasHandle` (`canvas.ts`) hat `setGrid`, `setImage`, `setTokens`, `setFog`,
`setTool`, `setSelection`, `setAnnotations`, `setAnnotationOptions`, `destroy`.

`AppShell.tsx` rendert `<main className="app-shell">`; `App.tsx` kennt `SessionView`
(`liste` | `raum` | `bibliothek`) und übergibt `canGoBack`, `onBack`, `account`, `onLogout`,
`onChangePassword`, `hinweis`, `build`. `theme.css`: `main.app-shell { max-width:
var(--content-max); margin: 0 auto; padding: var(--space-5) var(--space-4) }`; `.panel`
(Flex-Spalte, Rand, `--panel-grad`, `--shadow-panel`) und `.panel h2` vorhanden;
`.map-stage { position: relative }` (Abschnitt „Zustandsanzeigen"); generisches `button`
mit Rand, `min-height: 36px`, `--color-surface`; kein `[hidden]`-Selektor. Format-Vertrag
von `ui-theme`: kein Farbwert außerhalb `:root` (geprüft werden Hex und `rgb`/`hsl`; das
Schlüsselwort `transparent` ist erlaubt), genau ein `@media` (Bewegungsblock am Dateiende),
`animation`/`transition` nur darin. Wörterbücher `de.ts`/`en.ts` (`ui-text`): `de` definiert
die Schlüsselmenge, Gruppen `shell`, `app`, `hero`, `auth`, `start`, `session`, `bar`,
`toast`, `dialog`, `map`, `status`, `overlay`, `empty`, `menu`, `token`, `form`. Bindend
und nicht wiederholt: `constitution.md` §9 — die Reiter sind reine Anordnung; welche Panels
eine Rolle überhaupt bekommt, entscheidet weiterhin die bestehende Rollenprüfung.

## Goals / Non-Goals

**Goals:**
- **Karte als Held:** Reiter `Karte` beim Betreten aktiv; Bühne über die volle Breite der
  Raumansicht, Höhe Viewport minus Chrome aus dem Stylesheet.
- **Ein Reiterbaustein, eine Tastaturregel** (`ui/tabs.tsx`), wiederverwendbar für #95–#100.
- **Nichts wird neu gebaut:** alle Panels bleiben gemountet; ein Reiterwechsel ändert
  ausschließlich das `hidden`-Attribut der Panels. Kein Fetch, kein Canvas-Neuaufbau.
- **Der aktive Reiter gehört dem Nutzer:** Komponentenzustand, kein Server-Ereignis und
  kein Speicher greift ein.
- **Bestehende Adressen bleiben:** Beschriftungen, Rollen, Feldnamen der Panels ändern sich
  nicht; nur ihre Lage im Dokument.

**Non-Goals:**
- Keine neue Form für Token-Zeilen (#95), Werkzeugleisten (#96), Teilnehmer-Karten (#97).
- Keine Aufteilung von `FogPanel`; keine Verschiebung der Werkzeugwahl.
- Kein Merken des aktiven Reiters über Neuladen hinweg.
- Keine Übersetzung bestehender Rohstrings der Panels; nur neue Texte laufen über `t()`.
- Keine automatische Aktivierung beim Pfeil-Fokus (manuelle Aktivierung nach Issue).
- Keine Änderung an Server, Routen oder Ereignissen.

## Decisions

### D1 — Reiterbausteine (`src/client/ui/tabs.tsx`)

Neue Datei, importiert nur `react`. Exporte (verbindlich):

```ts
export interface TabItem<Id extends string> { id: Id; label: string }
export interface TabListProps<Id extends string> {
  label: string                    // aria-label der Reiterliste
  tabs: readonly TabItem<Id>[]
  active: Id
  onSelect: (id: Id) => void
  idPrefix: string                 // Reiter `${idPrefix}-tab-${id}`, Panel `${idPrefix}-panel-${id}`
}
export function TabList<Id extends string>(props: TabListProps<Id>): JSX.Element
export interface TabPanelProps<Id extends string> {
  id: Id
  active: Id
  idPrefix: string
  className?: string               // wird an `tab-panel` angehängt
  children: ReactNode
}
export function TabPanel<Id extends string>(props: TabPanelProps<Id>): JSX.Element
```

`TabList` rendert `<div role="tablist" class="tab-list" aria-label={label}>` und je Eintrag
in Reihenfolge von `tabs` ein `<button type="button" role="tab" class="tab"
id={`${idPrefix}-tab-${id}`} aria-selected={id === active} aria-controls={`${idPrefix}-panel-${id}`}
tabIndex={id === active ? 0 : -1}>` mit `label` als Text. Klick → `onSelect(id)`.
Tastatur (`onKeyDown` auf dem Reiter; die Reiter-Elemente liegen in einem
`useRef<Map<Id, HTMLButtonElement>>`):

| Taste | Wirkung |
|---|---|
| `ArrowRight` | Fokus auf den nächsten Reiter; nach dem letzten der erste |
| `ArrowLeft` | Fokus auf den vorigen Reiter; vor dem ersten der letzte |
| `Home` | Fokus auf den ersten Reiter |
| `End` | Fokus auf den letzten Reiter |
| `Enter`, ` ` (Leertaste) | `onSelect(id)` des fokussierten Reiters |

Jede dieser Tasten ruft `preventDefault()`; alle anderen Tasten bleiben unberührt. Der
Fokus wird per `.focus()` auf das Element bewegt; die Auswahl ändert sich dabei nicht
(manuelle Aktivierung). `onSelect` mit dem bereits aktiven Reiter ist erlaubt und wirkt
nicht.

`TabPanel` rendert `<div role="tabpanel" id={`${idPrefix}-panel-${id}`}
aria-labelledby={`${idPrefix}-tab-${id}`} class="tab-panel [className]" hidden={id !== active}>`
mit `children` — immer gerendert, nie bedingt. `tabIndex` bekommt das Panel nicht (der
erste Inhalt ist fokussierbar).

### D2 — Raumansicht (`SessionRoom.tsx`)

- **Typ und Zustand:** `type RoomTab = 'karte' | 'tokens' | 'karten' | 'teilnehmer'`;
  `const [activeTab, setActiveTab] = useState<RoomTab>('karte')`. Kein Effekt, kein Handler
  von `wireSocket` und kein `setState` des Raumzustands berührt `activeTab`; er bleibt beim
  Wiederverbinden (`reconnect` → erneutes `enter`) erhalten, weil die Komponente gemountet
  bleibt. `MAP_CANVAS_HEIGHT` entfällt; die Bühne bekommt kein `style`-Attribut mehr
  (`<div className="map-stage">`).
- **Reiterliste je Rolle** (Reihenfolge verbindlich; Texte über `t()`):

  | `id` | Label-Schlüssel | Spielleiter | Spieler |
  |---|---|---|---|
  | `karte` | `tabs.map` | ja | ja |
  | `tokens` | `tabs.tokens` | ja | ja |
  | `karten` | `tabs.mapsFog` | ja | nein |
  | `teilnehmer` | `tabs.participants` | ja | ja |

  `idPrefix` ist `room`. Die Liste entsteht aus `state.role` (`ROOM_TABS` filtern).
- **Reihenfolge im Fragment `bereit`:** `SessionBar` → die drei Raum-Meldungen
  `tokenError`, `fogError`, `annotationError` (unverändert `<p role="alert">`, jetzt vor den
  Reitern, damit sie in jedem Reiter sichtbar sind) → `<TabList label={t('tabs.label')}
  tabs={…} active={activeTab} onSelect={setActiveTab} idPrefix="room" />` → die
  `TabPanel`s in Reiter-Reihenfolge (das Panel `karten` nur für den Spielleiter) → das
  Karten-Token-Menü (`ActionMenu` mit `mapMenu`, unverändert am Ende).
- **Inhalt der Panels:**
  - `karte`: `<p className="map-caption">` mit dem bisherigen Kartenhinweis (`Aktive Karte:
    <Name>` bzw. `NO_ACTIVE_MAP_MESSAGE`, Texte unverändert); bei aktiver Karte die Bühne
    `<div className="map-stage">` mit `MapCanvas` und ggf. `MapOverlay` (Inhalt unverändert);
    bei aktiver Karte `AnnotationPanel` (jede Rolle); für den Spielleiter bei Fog `FogPanel`.
    Reihenfolge: Hinweis, Bühne, `AnnotationPanel`, `FogPanel`.
  - `tokens`: Spielleiter `TokenPanel`, Spieler `PlayerTokenList` (Props unverändert).
  - `karten` (nur Spielleiter): `MapPanel` mit der neuen Prop `onOpenLibrary={() =>
    onOpenLibraryRef.current()}` (übrige Props unverändert).
  - `teilnehmer`: `<div className="panel panel--wide">` mit `<h2>{t('tabs.participants')}</h2>`,
    dem bisherigen `<ul>` der Teilnehmer samt Alias-Formular (Markup unverändert) und
    danach `aliasError` als `<p role="alert">` (unverändert).
- Alles Übrige (Handler, `wireSocket`, Dialoge, Banner, Overlay-Regel, Token-Menüs,
  Confirm vor `beenden`) bleibt unverändert. `PlayerTokenList` bekommt `className="panel"`
  auf seinem `<div>`.

### D3 — Kartenverwaltung (`MapPanel.tsx`)

`MapPanelProps` bekommt `onOpenLibrary: () => void`. Das Wurzelelement wird `<div
className="panel">`. Reihenfolge der Kinder: `<h2>Karten</h2>`, die vier Meldungen, Leerzustand
oder Instanzliste, die Schaltfläche `Keine Karte anzeigen`, dann das Cluster:

```tsx
<details className="setup-cluster">
  <summary>{t('setup.title')}</summary>
  <form onSubmit={handleMount}>…unverändert (Label `Karte aus der Bibliothek`, `<select name="mapId">`, `Einhängen`)…</form>
  <button type="button" onClick={onOpenLibrary}>{t('setup.openLibrary')}</button>
</details>
```

Kein `open`-Attribut (zugeklappt beim Rendern); der Zustand des Clusters ist dem Browser
überlassen (kein React-State). `t = useT()` ist in `MapPanel` bereits vorhanden.

### D4 — Panel-Klassen

| Komponente | Wurzel | Klasse |
|---|---|---|
| `FogPanel` | `<fieldset>` | `panel` |
| `AnnotationPanel` | `<fieldset>` | `panel` |
| `MapPanel` | `<div>` | `panel` |
| `TokenPanel` | `<div>` | `panel panel--wide` |
| `PlayerTokenList` | `<div>` | `panel` |
| Teilnehmer (D2) | `<div>` | `panel panel--wide` |

Bühne und Kartenhinweis sind keine `.panel`; sie spannen über `grid-column` (D8).

### D5 — Kartenansicht passt sich der Bühne an (`canvas.ts`, `MapCanvas.tsx`)

`MapCanvasHandle` bekommt `resize(): void`; die Implementierung ruft `app.resize()` (Pixi
`ResizePlugin`, misst `resizeTo` = Container neu), sofern nicht `destroyed`. `MapCanvas`
legt im Mount-Effekt nach dem Setzen von `handleRef` einen `ResizeObserver` auf den
Container an — nur wenn `typeof ResizeObserver !== 'undefined'` (jsdom kennt ihn nicht) —,
dessen Rückruf `handleRef.current?.resize?.()` ruft, wenn `container.clientWidth > 0 &&
container.clientHeight > 0` (ein verstecktes Panel misst 0×0 und wird übersprungen). Der
Cleanup ruft `observer.disconnect()` vor `destroy()`. Damit zeichnet der Canvas nach dem
Rückwechsel auf `Karte` in Bühnengröße, auch wenn zwischendurch das Fenster verändert
wurde. Tolerante Form `resize?.()` wie bei den übrigen Settern (Mocks ohne `resize`).

### D6 — Breite Raumansicht (`AppShell.tsx`, `App.tsx`)

`AppShellProps` bekommt `wide?: boolean` (Standard `false`); `<main>` bekommt
`className={wide ? 'app-shell app-shell--wide' : 'app-shell'}`. `App` übergibt
`wide={sessionView.view === 'raum'}` im angemeldeten Zweig (anonym: nicht gesetzt).
Sonst nichts an der Shell.

### D7 — Wörterbücher (`de.ts`, `en.ts`)

Neue Gruppen `tabs.*` und `setup.*` nach `bar.*`; das englische Wörterbuch spiegelt die
Menge (Schlüsselgleichheit ist Typfehler). Texte buchstabengleich:

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `tabs.label` | Bereiche | Areas |
| `tabs.map` | Karte | Map |
| `tabs.tokens` | Tokens | Tokens |
| `tabs.mapsFog` | Karten & Nebel | Maps & Fog |
| `tabs.participants` | Teilnehmer | Participants |
| `setup.title` | Bibliothek & Einrichtung | Library & setup |
| `setup.openLibrary` | Kartenbibliothek öffnen | Open map library |

### D8 — Stylesheet (Abschnitt „Bereiche" in `theme.css`)

Nach dem Abschnitt „Session-Bar" und vor dem Bewegungsblock ein Kommentar
`/* Bereiche (session-tabs, #94) */` und diese Regeln — nur `var(--…)` und
`transparent`, kein Farbwert, kein neues `@media`, keine `animation`/`transition`:

- `main.app-shell--wide`: `max-width: none`.
- `.tab-list`: `display: flex`, `flex-wrap: wrap`, `gap: var(--space-1)`,
  `margin: 0 0 var(--space-4)`, `border-bottom: 1px solid var(--color-border)`. Kein
  `overflow` — App-Test Runde 1: `overflow-x: auto` machte die Liste zusammen mit dem um
  1 px überstehenden Unterstrich der Reiter zu einem Scroll-Container (Scroll-Effekt am
  Mausrad); schmale Fenster brechen die Reiter stattdessen um.
- `.tab`: `min-height: 0`, `padding: var(--space-2) var(--space-3)`, `border: 0`,
  `border-bottom: 2px solid transparent`, `margin-bottom: -1px`, `border-radius: 0`,
  `background: transparent`, `color: var(--color-text-muted)`,
  `font-size: var(--font-size-2)`, `white-space: nowrap`.
- `.tab:hover:not(:disabled)`: `border-color: transparent`, `color: var(--color-text)`,
  `background: transparent` (hebt die generischen `button:hover`-Regeln auf).
- `.tab[aria-selected="true"]`: `color: var(--gold-text)`,
  `border-bottom-color: var(--gold-2)` (der Gold-Unterstrich).
- `.tab-panel`: `display: grid`, `grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr))`,
  `gap: var(--space-4)`, `align-items: start`.
- `.tab-panel[hidden]`: `display: none` (das `display: grid` würde das Attribut sonst
  überstimmen).
- `.panel--wide`: `grid-column: 1 / -1`.
- `.map-caption`: `grid-column: 1 / -1`, `margin: 0`.
- `.map-stage` (zweite Regel, zusätzlich zur bestehenden): `grid-column: 1 / -1`,
  `height: calc(100dvh - 15rem)`, `min-height: 20rem`, `overflow: hidden`.
- `.setup-cluster`: `margin-top: var(--space-2)`.
- `.setup-cluster > summary`: `cursor: pointer`, `font-size: var(--font-size-1)`,
  `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.16em`,
  `color: var(--color-text-muted)`.
- `.setup-cluster[open] > summary`: `margin-bottom: var(--space-2)`.

Die Bereichs-Selektoren im Sinne des Requirements „Stylesheet der Bereiche" sind
`main.app-shell--wide`, `.tab-list`, `.tab`, `.tab[aria-selected="true"]`, `.tab-panel`,
`.tab-panel[hidden]`, `.panel--wide`, `.map-caption`, `.map-stage`, `.setup-cluster`.

### D9 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen; Raum-Szenarien rendern `App` mit gemocktem `fetch`,
gemockter Socket- und Canvas-Fassade nach dem Muster der bestehenden Raum-Suiten):

| Element | Adresse |
|---|---|
| Reiterliste | `getByRole('tablist', { name: 'Bereiche' })`; Reiter darin `within(...).getAllByRole('tab')` in Dokumentreihenfolge mit den Namen `Karte`, `Tokens`, `Karten & Nebel`, `Teilnehmer` (Spieler ohne `Karten & Nebel`) |
| Reiter | `getByRole('tab', { name: 'Tokens' })`; aktiv = Attribut `aria-selected="true"`; Tab-Reihenfolge = Attribut `tabindex` (`"0"` / `"-1"`); `aria-controls` gleich der `id` des Panels |
| Reiterwechsel | `fireEvent.click(tab)`; Tastatur `fireEvent.keyDown(tab, { key: 'ArrowRight' })` usw. auf dem fokussierten Reiter (`tab.focus()` vorher); Fokus = `document.activeElement`; Auswahl per `{ key: 'Enter' }` bzw. `{ key: ' ' }` |
| Reiterpanel | sichtbar: `getByRole('tabpanel', { name: 'Tokens' })` (Name über `aria-labelledby`); versteckt: `queryByRole('tabpanel', { name: 'Tokens' })` ist `null`. **Ein verstecktes Panel hat keinen zugänglichen Namen** (Accessible-Name-Algorithmus, Schritt 2A: `hidden` ohne Referenz → leer) — daher nie `getByRole('tabpanel', { name, hidden: true })`, sondern `getAllByRole('tabpanel', { hidden: true })` und das Panel über sein Attribut `aria-labelledby` (gleich der `id` des Reiters, z. B. `room-tab-tokens`) oder seine `id` (`room-panel-tokens`) herausgreifen; dort dann das Attribut `hidden` prüfen. „Nicht im sichtbaren DOM-Pfad" = **Rollenabfragen** (`queryByRole('heading', { name: 'Tokens', level: 2 })`, `queryByRole('textbox', { name: 'Alias' })`, `queryByRole('list', …)`) liefern `null`, weil nur die `*ByRole`-Abfragen `hidden`-Teilbäume ausschließen — `*ByLabelText`/`*ByText` tun das nicht und sind für Negativprüfungen ungeeignet |
| Inhalt eines Reiters | innerhalb des Panels per `within(getByRole('tabpanel', { name: … }))`: `Karte` → Text `Aktive Karte: …`/`Keine Karte aktiv`, Gruppen `Messen & Zeichnen` und `Fog of War` (`getByRole('group', { name })`); `Tokens` → Überschrift der Ebene 2 `Tokens` bzw. `Tokenwerte`; `Karten & Nebel` → Überschrift der Ebene 2 `Karten`; `Teilnehmer` → Überschrift der Ebene 2 `Teilnehmer`, `getByRole('list')`, Feld `getByLabelText('Alias')` |
| Server-Update | den beim `on('tokens', …)`/`on('status', …)`/`on('participants', …)` registrierten Handler der gemockten Fassade aufrufen, wie in den bestehenden Raum-Szenarien |
| Bühne | `document.querySelector('.map-stage')` (einzig zulässige Klassenabfrage, wie in `ui-status`): kein `style`-Attribut bzw. `style` ohne `height` |
| Panel-Klassen | Gruppe `Fog of War`/`Messen & Zeichnen` per `getByRole('group', { name })` → `classList` enthält `panel`; Überschrift `Tokens` → `closest('.panel')` trägt `panel--wide` |
| Cluster | `<details>` = `getByText('Bibliothek & Einrichtung').closest('details')`; zugeklappt = kein Attribut `open`; darin (`within`) `getByLabelText('Karte aus der Bibliothek')`, `getByRole('button', { name: 'Einhängen' })`, `getByRole('button', { name: 'Kartenbibliothek öffnen' })`; „außerhalb" = `Keine Karte anzeigen` liegt im Dokument vor dem `<details>` (`compareDocumentPosition`); Bibliothek = Überschrift der Ebene 1 `Kartenbibliothek` (lädt `GET /api/maps` — im Mock beantworten) |
| Shell | `document.querySelector('main')` → `classList` enthält `app-shell--wide` nur in der Raumansicht; in der Sitzungsliste nicht |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen) — dieselben Helfer wie in der Session-Bar-Suite |
| Sprache | `setLocale('en')` aus `src/client/i18n/locale.ts` vor dem Rendern, im Cleanup zurück auf `de` |

Testaufbau bestehender Suiten: Szenarien, die Teilnehmerliste/Alias, Token-Verwaltung,
`Tokenwerte` oder Kartenverwaltung adressieren, klicken nach dem Betreten den Reiter
`Teilnehmer`, `Tokens` bzw. `Karten & Nebel` (ein Helfer je Suite); Szenarien im Reiter
`Karte` (Kartenansicht, Fog-Verwaltung, `Messen & Zeichnen`, Overlay) brauchen keinen
Klick. Die gemockte Canvas-Fassade braucht kein `resize` (toleranter Aufruf, D5).

### D10 — Reihenfolge der Kopplungen

`ui/tabs.tsx` importiert nur `react`. `SessionRoom.tsx` importiert `ui/tabs.tsx` (beide
Exporte) und verliert `MAP_CANVAS_HEIGHT`. `MapPanel.tsx` bekommt eine Prop, keinen neuen
Import. `MapCanvas.tsx` bleibt bei `import type` aus `canvas.ts`; `pixi.js` bleibt außerhalb
der statischen Importkette von `App`. `AppShell.tsx` bekommt eine Prop, keinen neuen
Import. `App.tsx` reicht nur `wide` durch.

## Risks / Trade-offs

- **Hidden-Panels und Testing Library** → jede bestehende Suite, die ein Panel außerhalb
  von `Karte` adressiert, braucht einen Reiterklick im Aufbau (Teilnehmer, Tokens,
  Kartenverwaltung, Leerzustände). Bewusst in Kauf genommen; die Konvention steht in den
  Deltas.
- **`resizeTo` bei verstecktem Container** → verändert der Nutzer das Fenster, während
  `Karte` inaktiv ist, misst Pixi 0×0; der `ResizeObserver` korrigiert das beim
  Sichtbarwerden (D5). Wird im App-Test geprüft (Wechsel Tokens → Fenster ändern → Karte).
- **Feste Chrome-Höhe `15rem`** in `calc(100dvh - 15rem)` → bei Bar-Meldung oder Banner
  entsteht ein wenig Scrollweg; `min-height: 20rem` verhindert eine unbrauchbar kleine
  Bühne auf niedrigen Fenstern. Eine gemessene Höhe (JS) wäre genauer, aber ein zweiter
  Layout-Mechanismus. Wird im App-Test beurteilt.
- **`Fog of War` neben der Karte, nicht in `Karten & Nebel`** → der Reitername verspricht
  vorerst mehr, als drin ist; #96 baut die Werkzeuge um, danach passt der Zuschnitt.
- **Cluster-Zustand beim Browser** → nach einem Reiterwechsel bleibt das Cluster so, wie der
  Nutzer es gelassen hat (Panel bleibt gemountet); beim erneuten Betreten ist es zu.
- **`button`-Grundregeln müssen im Reiter aufgehoben werden** (Rand, Fläche, Hover) → drei
  Regeln mehr; alternativ ein `<a role="tab">` wäre ohne Formularsemantik, aber gegen die
  Konvention „kein Eigenbau von Basis-Elementen" spricht nichts, weil kein Baustein im
  Projekt Reiter mitbringt.
