## 1. Bausteine

- [ ] 1.1 `src/client/ui/tabs.tsx` nach design.md D1 anlegen: `TabList` (Reiterliste mit `role="tablist"`, Reiter als `<button role="tab">` mit `aria-selected`, `aria-controls`, roving tabindex; Klick wählt; `ArrowRight`/`ArrowLeft`/`Home`/`End` bewegen nur den Fokus mit Umlauf, `Enter`/Leertaste wählen) und `TabPanel` (`role="tabpanel"`, `aria-labelledby`, Klasse `tab-panel`, `hidden` wenn inaktiv, immer gerendert); prüfen: Datei importiert nur `react`, `pnpm lint` grün
- [ ] 1.2 Schlüssel aus design.md D7 (`tabs.*`, `setup.*`) in `src/client/i18n/de.ts` und `en.ts` ergänzen; prüfen: Schlüsselgleichheit per `pnpm typecheck:src`, Texte buchstabengleich zur Tabelle
- [ ] 1.3 `src/client/map/canvas.ts` und `MapCanvas.tsx` nach design.md D5: `MapCanvasHandle.resize()` (ruft `app.resize()`, nicht nach `destroy`), `ResizeObserver` auf dem Container nur wenn vorhanden, Rückruf `resize?.()` bei sichtbarer Größe, `disconnect` im Cleanup; prüfen: `pixi.js` bleibt außerhalb der statischen Importkette, tolerante Aufrufe

## 2. Panels und Shell

- [ ] 2.1 `src/client/session/MapPanel.tsx` nach design.md D3: Prop `onOpenLibrary`, Wurzel `panel`, Cluster `<details class="setup-cluster">` mit `<summary>` `Bibliothek & Einrichtung`, Einhänge-Formular und Schaltfläche `Kartenbibliothek öffnen` nach `Keine Karte anzeigen`; prüfen: Formular-Labels und `name="mapId"` unverändert, kein `open`-Attribut
- [ ] 2.2 Panel-Klassen nach design.md D4 auf `FogPanel`, `AnnotationPanel`, `TokenPanel` (`panel panel--wide`) und `PlayerTokenList` (`panel`); prüfen: Legenden und Überschriften unverändert
- [ ] 2.3 `src/client/app/AppShell.tsx` und `App.tsx` nach design.md D6: Prop `wide`, Klasse `app-shell--wide` genau in der Ansicht `raum`; prüfen: übrige Ansichten ohne die Klasse

## 3. Raumansicht

- [ ] 3.1 `SessionRoom.tsx` nach design.md D2: `activeTab`-Zustand (Start `karte`), Reiterliste je Rolle über `t()`, Raum-Meldungen vor der Reiterliste, vier bzw. drei `TabPanel`s mit den Inhalten aus D2 (Kartenhinweis als `<p class="map-caption">`, Bühne ohne Inline-Stil, `AnnotationPanel` und `FogPanel` bei `Karte`; Token-Verwaltung/`Tokenwerte` bei `Tokens`; `MapPanel` mit `onOpenLibrary` bei `Karten & Nebel`; Panel `Teilnehmer` mit Überschrift, Liste, Alias-Formular, `aliasError`), `MAP_CANVAS_HEIGHT` entfernt; prüfen: kein Handler setzt `activeTab`, Karten-Token-Menü und Dialoge unverändert, Spieler ohne Reiter `Karten & Nebel`

## 4. Stylesheet

- [ ] 4.1 Abschnitt „Bereiche (session-tabs, #94)" nach design.md D8 vor dem Bewegungsblock in `theme.css` ergänzen (zehn Bereichs-Selektoren, `.tab-panel[hidden]` mit `display: none`, `.map-stage` mit `calc(100dvh - 15rem)`); prüfen: kein Farbwert außerhalb `:root` (nur `var(--…)` und `transparent`), genau ein `@media`, keine `animation`/`transition` außerhalb des Bewegungsblocks, `pnpm lint` grün

## 5. Abschluss

- [ ] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 94` meldet grün
- [ ] 5.2 App-Test: Reiterliste unter der Bar mit Gold-Unterstrich, Karte beim Betreten aktiv und über die volle Fensterbreite, Höhe füllt den Viewport bis zum Footer (ohne Scrollen bis zur Bühne), Tokens/Karten & Nebel/Teilnehmer per Klick und per ←/→/Home/End + Enter/Leertaste, Wechsel Tokens → Fenstergröße ändern → Karte zeichnet in Bühnengröße, Formulareingabe im Tokens-Reiter überlebt einen Reiterwechsel, Cluster `Bibliothek & Einrichtung` zugeklappt mit Einhängen und `Kartenbibliothek öffnen`, `Keine Karte anzeigen` außerhalb, Spieler mit drei Reitern und Overlay in `Karte`, Sitzungsliste/Bibliothek weiterhin in 55 rem, Sprache EN; prüfen: menschliche Freigabe (`constitution.md` §3.4)
