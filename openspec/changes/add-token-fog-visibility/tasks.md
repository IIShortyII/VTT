> Umsetzung über den Harness-Loop (`pnpm harness start 17 add-token-fog-visibility`), nicht
> über `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario
> aus dem Delta `specs/session-token/spec.md`: 12 „Sichtbarkeit von Tokens im Fog", das neue
> Szenario „Verborgenes Token ist beim Bewegen nicht unterscheidbar" in „Token bewegen" und
> das neue Szenario „Verborgenes Token ist beim Teilen nicht unterscheidbar" in „Zielgruppe
> eines Tokenwerts setzen"; die übrigen Szenarien beider MODIFIED-Requirements sind
> unverändert und haben ihre Tests bereits) und werden rot bestätigt; der implementer sieht
> sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite
> über den Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Socket-Integrationstests für die 12 Szenarien „Sichtbarkeit von Tokens im Fog" in
      einer neuen Suite (oder in der Token-Socket-Suite) nach design.md D6: Aufbau wie die
      Token-Socket-Szenarien, aufgedeckte Zellen direkt als `FogCell`-Zeilen, Hex-Szenario
      mit Rastertyp `hex-spitz`, Reihenfolge `session:fog` vor `session:tokens` über eine
      Ereignisliste, „kein `session:tokens`" als kurze Wartezeit; verifizieren, dass die
      Tests rot sind, weil der Spieler heute jedes Token erhält bzw. nach `session:fog-set`
      kein `session:tokens` folgt (erwartete Assertion, kein Aufbaufehler)
- [ ] 1.2 Die zwei neuen Szenarien „Verborgenes Token ist beim Bewegen nicht
      unterscheidbar" und „Verborgenes Token ist beim Teilen nicht unterscheidbar" in
      derselben Suite; rot, weil die Meldung heute „darfst du nicht bewegen/teilen" lautet
- [ ] 1.3 Bestehende Token-Socket-Suite auf die Konvention „vollständig aufgedeckt"
      umstellen (Spec-Vorspann, design.md D6): im Helfer, der eine Karte einhängt oder aktiv
      setzt, die Zellen `(0..14) × (0..14)` der Instanz als `FogCell`-Zeilen anlegen
      (`createMany`); keine Assertion ändern; verifizieren, dass die Suite weiterhin grün
      ist (vor der Implementierung sind alle Zellen für den Bestand ohnehin unerheblich —
      der Umbau darf nichts rot machen)

## 2. Gemeinsamer Vertrag (implementer)

- [ ] 2.1 `src/shared/token.ts`: `tokenCells(token, gridType)` und
      `isTokenVisible(token, viewer, revealedKeys, gridType)` nach design.md D1 — reine
      Funktionen, Importe nur aus `./grid.js`, `./map.js` (Typ) und `./fog.js` (`cellKey`);
      verifizieren mit `pnpm typecheck:src`

## 3. Server (implementer)

- [ ] 3.1 `src/server/session/tokens.ts`: `loadVisibilityContext`, `loadTokenInventory`,
      `tokensFor`; `loadTokensFor` und `broadcastTokens` filtern nach Existenz vor der
      Wertefilterung (design.md D2); `loadTokens` bleibt für die ungefilterten
      Spielleiter-Acks; verifizieren mit `pnpm typecheck:src` und `pnpm lint`
- [ ] 3.2 `src/server/session/tokens.ts`: Sichtbarkeitsprüfung in `handleMoveToken` und
      `handleShareToken` zwischen Laden und Berechtigung — nur für Rolle `spieler` und
      `ownerId` `null`, Ablehnung mit derselben Meldung wie „unbekannt" (design.md D3);
      verifiziert durch die Szenarien „Verborgenes Token ist beim Bewegen/Teilen nicht
      unterscheidbar" im Gate
- [ ] 3.3 `src/server/session/fog.ts`: `broadcastTokens` nach `broadcastFog` in
      `handleSetFog` (beide `await`ed, Ack danach), nicht in den Bereichs-Handlern
      (design.md D4); verifiziert durch „Aufdecken lässt das Token erscheinen", „Verdecken
      lässt das Token verschwinden", „Alles verdecken …" und „Bereich anlegen löst keinen
      Tokenbestand aus" im Gate

## 4. Abschluss

- [ ] 4.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 4.2 App-Test durch den Menschen (Dev-DB ist seit #16 migriert, keine neue Migration;
      zwei Browser oder Profile: Spielleiter und Spieler `sam`): Karte mit Bild aktivieren,
      vollständig verdeckt → Spielleiter legt `Ork` (ohne Besitzer) und `Goblin` (an `sam`
      zugewiesen) an → `sam` sieht nur `Goblin` (auf der Karte und in `Tokenwerte`), der
      Spielleiter beide; Werkzeug `Aufdecken`, Rechteck über `Ork` ziehen → `Ork` erscheint
      bei `sam`; `Verdecken` darüber → verschwindet; Spielleiter zieht `Ork` aus dem
      aufgedeckten Bereich in den Fog → verschwindet bei `sam`, zurück → erscheint;
      Trefferpunkte von `Ork` „für alle" freigeben, `Ork` im Fog → bei `sam` weder Token
      noch Werte; `sam` zieht `Goblin` in den Fog → bleibt für ihn sichtbar und greifbar;
      zweiter Spieler `tom` mit eigenem Token im Fog → `sam` sieht `tom`s Token; Token der
      Größe 2 halb im Licht → sichtbar; Hex-Karte: großes Token, nur Nachbarzelle
      aufgedeckt → unsichtbar, Ankerzelle aufgedeckt → sichtbar; `Alles verdecken` → bei
      `sam` bleiben nur die Tokens mit Besitzer; in keiner Netzwerkantwort an `sam`
      (DevTools, WS-Frames `session:tokens`) taucht `Ork` auf, solange es verborgen ist
- [ ] 4.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-token-fog-visibility/`
      verschieben (Delta in `openspec/specs/session-token/` einsynchronisieren; danach
      prüfen, ob „Begriffe" und „Drahtformat" der Hauptspec die Zellen eines Tokens, das
      sichtbare Token, die Konvention und `session:tokens` nach `session:fog-set` nennen —
      das Delta trägt sie nur im Vorspann) und PR mit `Closes #17` öffnen
      (constitution.md §3.6)
