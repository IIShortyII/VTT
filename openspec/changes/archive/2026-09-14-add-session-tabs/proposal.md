## Why

Unter der Session-Bar (#93) reiht `SessionRoom.tsx` die Raumansicht weiterhin linear
untereinander: Teilnehmerliste mit Alias-Formular, Kartenhinweis, Kartenbühne mit fest
480 px Höhe, drei Fehlerzeilen, Kartenverwaltung, Fog-Verwaltung, `Messen & Zeichnen`,
Token-Verwaltung. Um an ein Token zu kommen, scrollt die Spielleitung an der Karte vorbei —
obwohl die Karte das zentrale Werkzeug der Sitzung ist. Die Karte ist auf 480 px Höhe und
die 55-rem-Inhaltsspalte der Shell begrenzt, während auf einem Desktop-Monitor rechts und
unten Platz ungenutzt bleibt. Einrichtungsaufgaben (Karte aus der Bibliothek einhängen)
stehen gleichberechtigt neben dem laufenden Bestand. Dieser Change (Issue #94, zweites Kind
des Epics #103) hängt Bereichs-Reiter unter die Bar und ordnet die Panels als Raster.

Entscheidungen aus dem Issue-Text (#94, #103) und der Explore-Runde (2026-09-14):
- **Neue Capability `session-tabs`** für Reiterliste, Tastaturbedienung, Sichtbarkeit der
  Panels, Panel-Raster, das Cluster `Bibliothek & Einrichtung` und das Stylesheet. Die
  Fach-Capabilities (`game-session`, `session-map`, `session-token`, `session-bar`) bekommen
  nur den Verweis, in welchem Reiter ihre Panels liegen, plus die Konvention für den
  Testaufbau; `ui-shell` bekommt die breite Variante des Inhaltsbereichs. #95–#97 verweisen
  damit auf eine Capability statt auf verstreute Absätze.
- **Alle Reiter bleiben gemountet, inaktive tragen `hidden`.** Der Pixi-Canvas wird beim
  Reiterwechsel nicht zerstört und neu aufgebaut (kein Bild-Reload, kein Flackern),
  Formularzustände und geladene Instanzlisten bleiben erhalten. Dafür passt die
  Kartenansicht den Renderer beim Sichtbarwerden an die Bühne an (`ResizeObserver`).
  Verworfen: nur den aktiven Reiter rendern — jeder Wechsel weg von `Karte` würde das
  Pixi-App zerstören und Eingaben verwerfen.
- **Werkzeuge bleiben bei der Karte.** Der Reiter `Karte` enthält Bühne, Kartenhinweis,
  `Messen & Zeichnen` und `Fog of War` — alles, was auf dem Canvas wirkt, liegt neben dem
  Canvas; Nebelpinsel wählen und Zellen markieren braucht keinen Reiterwechsel. `Karten &
  Nebel` enthält die Kartenverwaltung (Instanzen, Aktivieren, Einhängen). #96 baut die
  Werkzeuge zur Icon-Leiste um. Verworfen: das Fog-Panel wörtlich nach `Karten & Nebel` (bis
  zu drei Reiterwechsel je Bereich) oder es in #94 aufzuteilen (doppelte Arbeit mit #96).
- **Reiter für beide Rollen.** Dieselbe Komponente; die Reiterliste ist rollenabhängig:
  Spieler sehen `Karte`, `Tokens`, `Teilnehmer` — `Karten & Nebel` nur die Spielleitung.
  Ein Layout, ein Testaufbau; #98 baut nur die Bar um.
- **Der Raum sprengt die Inhaltsspalte.** `AppShell` bekommt die Prop `wide`, `App` setzt sie
  für die Ansicht `raum`; `main.app-shell--wide` hebt `max-width` auf und behält das
  Seitenpolster. Die Kartenbühne wird Viewport minus Chrome hoch (Stylesheet, kein
  Inline-Stil). Start, Bibliothek und Formulare bleiben bei 55 rem.
- **Cluster `Bibliothek & Einrichtung`** als zugeklapptes `<details>` in der Kartenverwaltung:
  Einhänge-Formular und Schaltfläche `Kartenbibliothek öffnen`. Instanzliste, Aktivieren und
  `Keine Karte anzeigen` bleiben außerhalb, immer sichtbar — der laufende Bestand hat Vorrang.
  Das Token-Anlege-Formular bleibt offen im Reiter `Tokens`; #95 entscheidet seine Form.
- **Manuelle Aktivierung per Tastatur** (Issue): ←/→/Home/End bewegen nur den Fokus (roving
  tabindex), Enter/Leertaste oder Klick wählen aus. Der aktive Reiter ist Komponentenzustand
  der Raumansicht; kein Server-Ereignis ändert ihn, kein Speicher im Browser.
- **Konvention für bestehende Szenarien statt Massen-MODIFIED:** Szenarien der
  Fach-Capabilities, die Elemente eines Reiters adressieren, setzen voraus, dass der
  Testaufbau diesen Reiter vorher per Klick aktiviert hat. Nur die Szenarien, deren THEN
  heute die Teilnehmerliste neben der Bar verlangt, werden benannt geändert.

## What Changes

- **Neu: `src/client/ui/tabs.tsx`** — `TabList` (`role="tablist"`, Reiter als
  `<button role="tab">` mit `aria-selected`, `aria-controls`, roving tabindex, Tastatur) und
  `TabPanel` (`role="tabpanel"`, `aria-labelledby`, `hidden` wenn inaktiv, Klasse
  `tab-panel`).
- **Raumansicht** (`SessionRoom.tsx`): Reiterliste `Bereiche` unter Bar und Raum-Meldungen;
  vier bzw. drei Reiterpanels als Raster; Teilnehmerliste und Alias-Formular in einem Panel
  `Teilnehmer`; die feste Höhe `MAP_CANVAS_HEIGHT` entfällt zugunsten des Stylesheets.
- **Kartenverwaltung** (`MapPanel.tsx`): Prop `onOpenLibrary`; Einhänge-Formular und
  `Kartenbibliothek öffnen` im zugeklappten Cluster `Bibliothek & Einrichtung`.
- **Panel-Wurzeln** tragen `panel` (Fog, Messen & Zeichnen, Karten, Tokens, Tokenwerte,
  Teilnehmer); `Tokens` und `Teilnehmer` zusätzlich `panel--wide`.
- **Kartenansicht** (`MapCanvas.tsx`, `canvas.ts`): `MapCanvasHandle.resize()`; ein
  `ResizeObserver` auf dem Container ruft ihn bei sichtbarer Größe auf.
- **Shell** (`AppShell.tsx`, `App.tsx`): Prop `wide`, Klasse `app-shell--wide` für den Raum.
- **Wörterbücher:** `tabs.*` und `setup.*` in `de.ts`/`en.ts`.
- **Stylesheet:** Abschnitt „Bereiche (session-tabs, #94)" in `theme.css`.
- **Specs:** neue Capability `session-tabs`; MODIFIED in `game-session`
  („Sitzungsoberfläche"), `session-bar` („Aufbau der Session-Bar"), `session-map`
  („Kartenansicht im Raum"), `session-token` („Tokenansicht im Raum"), `ui-shell`
  („Inhaltsbereich und Footer").

## Capabilities

### New Capabilities
- `session-tabs`: Bereichs-Reiter der Raumansicht — Reiterliste je Rolle, Tastaturbedienung,
  Sichtbarkeit der Panels, Panel-Raster, Cluster `Bibliothek & Einrichtung`, Stylesheet.

### Modified Capabilities
- `game-session`: „Sitzungsoberfläche" — unter der Bar die Reiterliste statt der
  Teilnehmerliste; Teilnehmerliste und Alias im Reiter `Teilnehmer`; Testaufbau-Konvention.
- `session-bar`: „Aufbau der Session-Bar" — die Bar liegt vor der Reiterliste `Bereiche`.
- `session-map`: „Kartenansicht im Raum" — Kartenhinweis und Bühne im Reiter `Karte`,
  Kartenverwaltung im Reiter `Karten & Nebel`, Einhängen im Cluster; Testaufbau-Konvention.
- `session-token`: „Tokenansicht im Raum" — Token-Verwaltung und `Tokenwerte` im Reiter
  `Tokens`; Testaufbau-Konvention.
- `ui-shell`: „Inhaltsbereich und Footer" — Prop `wide`, Klasse `app-shell--wide` in der
  Raumansicht.

## Impact

- Client: `src/client/ui/tabs.tsx` (neu), `src/client/session/SessionRoom.tsx`,
  `src/client/session/MapPanel.tsx`, `src/client/session/FogPanel.tsx`,
  `src/client/session/AnnotationPanel.tsx`, `src/client/session/TokenPanel.tsx`,
  `src/client/map/MapCanvas.tsx`, `src/client/map/canvas.ts`, `src/client/app/AppShell.tsx`,
  `src/client/app/App.tsx`, `src/client/i18n/de.ts`, `src/client/i18n/en.ts`,
  `src/client/app/theme.css`.
- Server: unverändert. Kein neues Ereignis, keine Route, kein Schema.
- Bestehende Tests: Suiten, die Teilnehmerliste, Token-Verwaltung, `Tokenwerte` oder
  Kartenverwaltung adressieren, aktivieren den jeweiligen Reiter im Aufbau; das
  Session-Bar-Szenario „vier Gruppen" prüft die Lage vor der Reiterliste statt vor der
  Teilnehmerliste; Szenarien im Reiter `Karte` (Fog, Anmerkungen, Kartenansicht) bleiben
  unberührt.
- Keine neue Dependency.
