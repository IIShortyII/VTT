# Tasks — fix-icon-arc-flags (#124)

## 1. Normalisierung
- [x] 1.1 `src/client/ui/icon-svg.ts`: reine Funktion `normalizeArcFlags(d)` exportieren
  (design.md D2).
- [x] 1.2 `iconSvg`: jedes `d`-Attribut des gerenderten Markups durch `normalizeArcFlags`
  ersetzen, erst danach cachen (design.md D1).

## 2. Kartenansicht
- [x] 2.1 `src/client/map/canvas.ts`: `iconGraphics` fängt einen Parserfehler ab, meldet ihn
  per `console.error`, gibt eine leere `Graphics` mit `pivot`/`scale` zurück (design.md D4).

## 3. Archivierung (nach menschlicher App-Freigabe)
- [x] 3.1 Haupt-Spec `ui-icons` aus dem ADDED-Delta nachziehen; Change nach
  `openspec/changes/archive/YYYY-MM-DD-fix-icon-arc-flags/` verschieben (im selben
  Branch/Commit wie das Feature); `openspec validate --specs`.
