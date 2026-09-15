## 1. Wörterbücher

- [x] 1.1 `src/client/i18n/de.ts` und `en.ts` nach design.md D3: Gruppe `playerBar.*`
  (`label`, `annotations`, `tokensTitle`, `connected`, `disconnected`, `newValues`) in beiden
  Sprachen ergänzen; prüfen: Schlüsselgleichheit per Typecheck, Texte buchstabengleich zur
  Tabelle

## 2. Komponente

- [x] 2.1 `src/client/session/PlayerBar.tsx` nach design.md D1 anlegen: `PlayerBar` mit
  Identität (Avatar `role="img"` mit Anzeigenamen, `<h1>`, Rollen-Pille), Zustandsgruppe
  (Zustandspille wie `SessionBar`), Trigger-Gruppe (`Tokens` mit Badge `badge--gold`/
  `badge--teal` und verborgenem `neue Werte`, `Anmerkungen` mit `disabled`, `Teilnehmer`,
  Verbindungspunkt mit `data-connected`); prüfen: Importliste nach D6, `pnpm lint` grün

## 3. Raumansicht

- [x] 3.1 `SessionRoom.tsx` nach design.md D2: Spieler-Zweig mit `PlayerBar` statt
  `SessionBar` und dauerhafter Kartenansicht statt `TabList`/`TabPanel`; `tokensOpen`/
  `annotationsOpen`/`participantsOpen`/`tokenEvent`-State plus `tokensOpenRef`; Erkennung des
  neu freigegebenen Werts im `tokens`-Handler (null → nicht `null` auf einem schon vorhandenen
  eigenen Token, nur bei geschlossenem Modal); die drei Modals (Tokenwerte, Anmerkungen nur
  bei aktiver Karte, Teilnehmer ohne Code) und `onEditAlias`, das erst das Teilnehmer-Modal
  schließt; prüfen: der Spielleiter-Zweig (`SessionBar` + Reiter) unverändert, für den Spieler
  keine Reiterliste, kein inline `PlayerTokenList`/`AnnotationPanel`/Teilnehmerliste

## 4. Stylesheet

- [x] 4.1 Abschnitt „Spieler-Leiste (player-bar, #98)" nach design.md D4 vor dem
  Bewegungsblock in `theme.css` ergänzen (zwölf Selektoren, `.player-bar__badge-note` visuell
  verborgen); prüfen: kein Farbwert außerhalb `:root`, genau ein `@media`, keine
  `animation`/`transition` außerhalb des Bewegungsblocks, `pnpm lint` grün

## 5. Abschluss

- [x] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings;
  prüfen: `pnpm harness gate 98` meldet grün
- [x] 5.2 App-Test: als Spieler betreten — Leiste am Kopf mit Avatar (Anzeigename), Name,
  Rollen-Pille `Spieler`, Zustandspille, drei Trigger und Verbindungspunkt; Karte dauerhaft
  sichtbar, keine Reiter; `Tokens` öffnet die Tokenwerte im Modal, Badge zeigt die Anzahl
  zugewiesener Tokens (gold), wird teal bei einem neu freigegebenen Wert und wieder gold nach
  dem Öffnen; `Anmerkungen` öffnet `Messen & Zeichnen` (ohne aktive Karte gesperrt);
  `Teilnehmer` öffnet die Karten ohne Code, `Alias ändern` schließt das Teilnehmer-Modal und
  öffnet das Alias-Modal; Verbindungspunkt wechselt bei Trennung; Spielleiter-Ansicht
  unverändert; Sprache EN; prüfen: menschliche Freigabe (`constitution.md` §3.4)
