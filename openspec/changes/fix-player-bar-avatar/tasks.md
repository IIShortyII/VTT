# Tasks — fix-player-bar-avatar (#137)

## 1. Spieler-Leiste
- [ ] 1.1 `src/client/session/PlayerBar.tsx`: Avatar-Span (`.player-bar__avatar`) entfernen;
  Prop `ownName` aus `PlayerBarProps` und Ableitung `initial` streichen (design.md D1).

## 2. Aufrufer
- [ ] 2.1 `src/client/session/SessionRoom.tsx`: `ownName` nicht mehr an `PlayerBar` übergeben,
  lokale Ableitung `ownName` im Spieler-Zweig entfernen; `self` bleibt (design.md D2).

## 3. Stylesheet
- [ ] 3.1 `src/client/app/theme.css`: Regel `.player-bar__avatar` entfernen; weiterhin genau
  eine `@media`-Abfrage (design.md D3).

## 4. Archivierung (nach menschlicher App-Freigabe)
- [ ] 4.1 Haupt-Spec `player-bar` aus dem MODIFIED-Delta nachziehen; Change nach
  `openspec/changes/archive/YYYY-MM-DD-fix-player-bar-avatar/` verschieben (im selben
  Branch/Commit wie das Feature); `openspec validate --specs`.
