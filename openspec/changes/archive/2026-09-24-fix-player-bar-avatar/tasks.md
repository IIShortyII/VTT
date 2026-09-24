# Tasks — fix-player-bar-avatar (#137)

## 1. Spieler-Leiste
- [x] 1.1 `src/client/session/PlayerBar.tsx`: Avatar-Span (`.player-bar__avatar`) entfernen;
  Prop `ownName` aus `PlayerBarProps` und Ableitung `initial` streichen (design.md D1).

## 2. Aufrufer
- [x] 2.1 `src/client/session/SessionRoom.tsx`: `ownName` nicht mehr an `PlayerBar` übergeben,
  lokale Ableitungen `ownName` und `self` im Spieler-Zweig entfernen (design.md D2).

## 3. Stylesheet
- [x] 3.1 `src/client/app/theme.css`: Regel `.player-bar__avatar` entfernen; weiterhin genau
  eine `@media`-Abfrage (design.md D3).

## 4. Archivierung (nach menschlicher App-Freigabe)
- [x] 4.1 Haupt-Spec `player-bar` aus dem MODIFIED-Delta nachziehen; Change nach
  `openspec/changes/archive/YYYY-MM-DD-fix-player-bar-avatar/` verschieben (im selben
  Branch/Commit wie das Feature); `openspec validate --specs`.
