# Tasks — add-token-value-pulse (#99)

## 1. Karte: Basisklasse & Puls-Eingang
- [x] 1.1 `TokenCard` (`src/client/session/TokenStats.tsx`): jede Wertzeile rendert ihr `dd`
  mit der Basisklasse `token-card__value`; neuer optionaler Prop
  `pulse?: Partial<Record<'hp'|'tempHp'|'ac'|'initiative', boolean>>` fügt genau dem passenden
  `dd` `token-card__value--pulse` hinzu. Optionaler Rückruf `onValuePulseEnd(key)` am `dd`
  (`onAnimationEnd`). Fehlt `pulse`, ändert sich nichts (Spielleiter).

## 2. Spieler-Liste: Anstieg erkennen
- [x] 2.1 `PlayerTokenList` (`src/client/session/TokenStats.tsx`): zuletzt empfangene
  Zahlenwerte je Token in einem Ref halten, bei neuem `tokens` die gestiegenen Werte je Token
  ableiten (Regeln aus design.md D4), als React-State der pulsierenden Stats führen und je
  `TokenCard` das `pulse`-Objekt plus `onValuePulseEnd` (entfernt den Stat aus dem State)
  übergeben. Verschwundene Tokens aus Ref und State entfernen.

## 3. Leerzustand-Text
- [x] 3.1 `empty.tokenValues.hint` in `src/client/i18n/de.ts`
  (`Die Spielleitung weist dir ein Token zu.`) und `src/client/i18n/en.ts`
  (`The game master will assign you a token.`).

## 4. Stylesheet
- [x] 4.1 `src/client/app/theme.css`: `.token-card__value--pulse`-Animation und
  `@keyframes value-pulse` in den bestehenden `@media (prefers-reduced-motion: no-preference)`-
  Block aufnehmen (keine zweite Medienabfrage). Farbe aus `--gold-text`.

## 5. Archivierung (nach menschlicher App-Freigabe)
- [x] 5.1 Haupt-Spec `session-token` aus dem MODIFIED-Delta nachziehen; Change nach
  `openspec/changes/archive/YYYY-MM-DD-add-token-value-pulse/` verschieben (im selben
  Branch/Commit wie das Feature).
