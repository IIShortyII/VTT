## Why

Beim manuellen Test auf `main` (895b42c, 2026-09-21) blieb die Kartenansicht des Spielleiters
leer, sobald ein sichtbares Token das Symbol „Kämpfer" oder eine der Markierungen
„Verängstigt", „Unsichtbar" oder „Gelähmt" trug — kein Kartenbild, kein Raster, keine Tokens
(Issue #124).

Ursache: `src/client/map/canvas.ts` zeichnet Registry-Icons über
`new Graphics().svg(iconSvg(name, color))` (add-icon-registry #85, design.md D5). Lucide
serialisiert die Pfaddaten von vier Icons (`fighter`, `frightened`, `invisible`,
`paralyzed`) mit **kompakten Arc-Flags** — Large-Arc-Flag, Sweep-Flag und die folgende Zahl
ohne Trennzeichen, z. B. `a5 5 0 016 0`. Die SVG-Grammatik erlaubt das, der Pfad-Parser von
PixiJS 8 nicht: er wirft `malformed path data`. Die Ausnahme fällt aus `drawTokens()`, das in
`createMapCanvas` vor dem Laden des Kartenbilds läuft, und reißt den gesamten Canvas-Aufbau
mit. Kein Test bemerkt das: die Canvas-Fassade ist in allen Komponententests gemockt, und
`iconSvg` ist bisher nicht spezifiziert.

## What Changes

- **`ui-icons`** — neues Requirement „Icon-Markup für die Karte": `iconSvg` liefert für jeden
  Registry-Namen SVG-Markup, dessen Pfaddaten jedes Arc-Flag durch Leerzeichen von seinen
  Nachbarparametern trennen. Die Normalisierung übernimmt eine exportierte reine Funktion
  `normalizeArcFlags(d)`, die nur fehlende Trenner um Arc-Flags einfügt und sonst nichts an
  den Pfaddaten ändert.
- **Robustheit der Kartenansicht** (ohne Spec-Szenario, Entscheidung im Dialog zu #124):
  `iconGraphics` in `canvas.ts` fängt einen Parserfehler eines einzelnen Icons ab, meldet ihn
  per `console.error` und zeichnet an dessen Stelle nichts — Bild, Raster und übrige Tokens
  bleiben sichtbar. Das Verhalten prüfen reviewer und menschlicher App-Test (design.md D4);
  ein Pixi-Modul-Mock für `createMapCanvas` ist nicht Teil dieses Change.

## Impact

- Betroffene Specs: `ui-icons` (ein ADDED-Requirement mit vier Szenarien).
- Betroffener Code: `src/client/ui/icon-svg.ts` (neue Funktion `normalizeArcFlags`, Anwendung
  in `iconSvg` vor dem Cache), `src/client/map/canvas.ts` (`iconGraphics` mit Fehlerfang).
- Die DOM-Icons (`<Icon>`, `<IconButton>`) laufen nicht über `iconSvg` und bleiben unberührt.
- Kein Serververtrag, kein Schema, keine neue Dependency.
