> Umsetzung über den Harness-Loop (`pnpm harness start 61 add-token-stats`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus dem
> Delta `specs/session-token/spec.md`: 8 Szenarien „Tokenwerte setzen", 5 „Markierungen
> setzen", 6 „Sichtbarkeit der Tokenwerte", 22 „Tokenansicht im Raum" — davon sind 11
> bereits vorhanden und bleiben unverändert, 1 wird um Assertions erweitert, 10 sind neu)
> und werden rot bestätigt; der implementer sieht sie nie. „Gate grün" heißt:
> `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [x] 1.1 Socket-Integrationstests in der bestehenden Token-Socket-Suite: die 8 Szenarien
      „Tokenwerte setzen", die 5 Szenarien „Markierungen setzen" und die 6 Szenarien
      „Sichtbarkeit der Tokenwerte". Aufbau wie bisher (echte Socket.IO-Clients, Routen,
      `session:activate-map`); Helfer `createTokenDirect` um optionale Werte und
      `conditions` erweitern (design.md D11); Sichtbarkeits-Szenarien lesen die
      `session:tokens` beider Verbindungen und zählen sie je Verbindung; verifizieren, dass
      die Tests rot sind, weil `session:token-stats`/`session:token-conditions` unbekannt
      sind, die Spalten fehlen bzw. die Werte beim Spieler nicht `null` sind
      (Prisma-Typfehler beim Rot-Bestätigen unterscheiden)
- [x] 1.2 Komponententests in der bestehenden Token-UI-Suite: die 10 neuen Szenarien der
      „Tokenansicht im Raum" („Spielleiter setzt Werte über die Liste", „Wertefelder folgen
      dem Bestand", „Schaden über die Liste", „Heilung deckelt am Maximum", „Schaden ohne
      Trefferpunkte sendet nichts", „Spielleiter setzt eine Markierung über die Schnellwahl",
      „Spielleiter fügt eine freie Markierung hinzu", „Spielleiter entfernt eine
      Markierung", „Spieler sieht die Werte seines Tokens", „Spieler sieht ohne Werte keine
      Werte"); „Spieler sieht keine Token-Verwaltung" um die neuen Bedienelemente
      erweitern; Fixtures `GOBLIN`/`ORK` um die fünf Werte (`null`) und `conditions: []`
      ergänzen; Socket-Fassaden-Mock um aufzeichnende `setTokenStats` und
      `setTokenConditions` erweitern; Elemente nach der Schnittstellentabelle in design.md
      D9 über Testing-Library-Abfragen (Rolle und zugänglicher Name, genauer Text), keine
      `must()`-Helfer (design.md D11); verifizieren, dass sie rot sind, weil die Felder,
      Schaltflächen, die Überschrift `Tokenwerte` und die Fassadenmethoden fehlen

## 2. Schema (implementer)

- [x] 2.1 `prisma/schema.prisma`: `Token.hp`, `hpMax`, `tempHp`, `ac`, `initiative` als
      `Int?` und Relation `conditions TokenCondition[]`; Modell `TokenCondition` (`tokenId`,
      `label`, `position`, `@@unique([tokenId, label])`, `@@index([tokenId])`, `onDelete:
      Cascade`) (design.md D1); Migrationsdatei
      `prisma/migrations/<stamp>_add-token-stats/migration.sql` per `ALTER TABLE … ADD
      COLUMN` (fünfmal) und `CREATE TABLE "TokenCondition"` mit Fremdschlüssel `ON DELETE
      CASCADE`, Unique-Index und Index, nach dem Muster von `20260911130000_add-token-owner`;
      verifizieren mit `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB nicht
      anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [x] 3.1 `src/shared/token.ts`: `TokenSchema` um `hp`, `hpMax`, `tempHp`, `ac`,
      `initiative` (`int().nullable()`) und `conditions` (`string[]`) erweitern;
      Konstanten `CONDITION_MAX_LENGTH = 20`, `CONDITIONS_MAX = 12`; `ConditionLabelSchema`
      (getrimmt, 1–20, keine Steuerzeichen); `TokenStatsInputSchema` (fünf Felder
      `nullable().optional()` mit den Untergrenzen aus design.md D2), `TokenStatsPatch`;
      `TokenConditionsInputSchema` (Array, max 12, `refine` eindeutig); Acks
      `TokenStatsAck`, `TokenConditionsAck`; `SESSION_TOKEN_EVENTS.stats =
      'session:token-stats'`, `.conditions = 'session:token-conditions'`; kein
      serverseitiger Import; verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [x] 4.1 `src/server/session/presence.ts`: `entriesIn(gameSessionId)` liefert
      `[{ userId, socketId }]` des Raums (design.md D3); verifizieren mit
      `pnpm typecheck:src`
- [x] 4.2 `src/server/session/tokens.ts`: `TOKEN_INCLUDE` (Markierungen nach `position`);
      `toToken` mit den fünf Werten und `conditions` als Label-Liste; `redactToken(token,
      viewer)` (Spielleiter oder Besitzer: unverändert, sonst fünf Werte `null` und
      `conditions` leer); `loadTokensFor(prisma, sessionId, viewer)`; `broadcastTokens(io,
      prisma, presence, sessionId)` sendet je Eintrag aus `presence.entriesIn` den mit der
      **jetzt** geladenen Mitgliedschaft gefilterten Bestand an dessen Socket-ID,
      `emitTokens` entfällt; `TokenSocketDeps` mit `presence`; Handler
      `session:token-stats` (zod-Parse → `authorizeAction` Rolle `spielleiter` → Token der
      aktiven Instanz laden → Zusammenführen → Kopplung `hp`/`hpMax` prüfen, sonst
      `Ungültige Trefferpunkte.` → `update` mit `TOKEN_INCLUDE` → `broadcastTokens` →
      `{ ok: true, token }`) und `session:token-conditions` (zod-Parse → `authorizeAction`
      Rolle `spielleiter` → Token laden → Transaktion `deleteMany` + `createMany` mit
      `position` → neu laden → `broadcastTokens` → `{ ok: true, token }`); `create`,
      `move`, `remove`, `assign` mit `TOKEN_INCLUDE` an den Stellen, die `toToken` rufen,
      und `presence` im Broadcast; das Ack von `session:token-move` für den Absender mit
      `redactToken` filtern (design.md D3, Risks); verifiziert durch die Socket-Szenarien
      im Gate
- [x] 4.3 `src/server/session/socket.ts`: `registerTokenHandlers` mit `presence`;
      `handleActivateMap` ruft `broadcastTokens` mit `presence`; `handleEnter` legt
      `loadTokensFor(prisma, sessionId, { role, userId })` ins Acknowledgement (design.md
      D4); `src/server/session/maps.ts`: `presence` in den Deps, Aufruf beim Aushängen mit
      `presence`; verifizieren mit `pnpm typecheck:src` und den Szenarien „Spielleiter
      erhält beim Betreten alle Werte", „Besitzer erhält die Werte seines Tokens", „Spieler
      erhält von fremden Tokens keine Werte" im Gate

## 5. Client (implementer)

- [x] 5.1 `src/client/session/socket.ts`: `setTokenStats(sessionId, tokenId, patch)` und
      `setTokenConditions(sessionId, tokenId, conditions)` mit Acknowledgement (design.md
      D5); verifizieren mit `pnpm typecheck:src`
- [x] 5.2 `src/client/session/conditions.ts`: `CONDITION_CATALOG` (15 Einträge, Reihenfolge
      und Schreibweise aus design.md D6) und `conditionSymbol(label)`; verifizieren mit
      `pnpm typecheck:src` und `pnpm lint`
- [x] 5.3 `src/client/map/canvas.ts`: in `buildTokenContainer` Healthbar (nur bei `hp` und
      `hpMax`, `tempHp` als eigener Abschnitt) und bis zu drei Markierungssymbole am oberen
      Rand, ab der vierten `+N` (design.md D7); keine neuen Optionen; verifizieren mit
      `pnpm typecheck:src` und `pnpm lint` — Aussehen im App-Test
- [x] 5.4 `src/client/session/TokenStats.tsx`: `TokenStatsText` (Spans `HP <hp>/<hpMax>`,
      `Temp <tempHp>`, `RK <ac>`, `Ini <initiative>` nur bei gesetztem Wert; Markierungen als
      `<li>`) und `PlayerTokenList` (`<h2>Tokenwerte</h2>`, je Token Name + `TokenStatsText`)
      (design.md D8); verifiziert durch „Spieler sieht die Werte seines Tokens" und „Spieler
      sieht ohne Werte keine Werte" im Gate
- [x] 5.5 `src/client/session/TokenPanel.tsx`: Props `onSetStats`, `onSetConditions`; je
      Token eine `TokenRow` mit den fünf Wertefeldern (vorbelegt, bei geändertem Bestand neu
      vorbelegt), `Werte speichern` (alle fünf Schlüssel, leer → `null`), `Änderung` mit
      `Schaden`/`Heilung` (nur `{ hp }`, nichts bei `hp` `null` oder ungültiger Änderung),
      Schnellwahl `Markierung wählen` aus dem Katalog, Textfeld + `Markierung hinzufügen`,
      je Markierung `Markierung <Label> entfernen`, dazu `TokenStatsText`; Beschriftungen
      und `name`-Attribute genau nach der Schnittstellentabelle in design.md D9; `Anlegen`
      schickt weiterhin nur das Anlegeformular ab; verifiziert durch die
      Verwaltungs-Szenarien im Gate
- [x] 5.6 `src/client/session/SessionRoom.tsx`: `handleTokenStats` und
      `handleTokenConditions` über die Fassade mit derselben `tokenError`-Meldung;
      `TokenPanel` mit `onSetStats`/`onSetConditions`; für Rolle `spieler`
      `<PlayerTokenList tokens={state.tokens} />` (design.md D10); bestehende Szenarien der
      Sitzungsoberfläche, der Kartenansicht und der Tokenansicht bleiben grün; verifiziert
      im Gate

## 6. Abschluss

- [x] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [x] 6.2 App-Test durch den Menschen (zwei Browser, Spielleiter und Spieler `sam`): Karte
      aktivieren, Token `Goblin` (an `sam` zugewiesen) und `Ork` anlegen → beide ohne
      Healthbar; Spielleiter setzt bei `Goblin` HP 23 / Maximum 40 / Temp 5 → beim
      Spielleiter und bei `sam` erscheint die Healthbar mit blauem Temp-Abschnitt, in der
      Liste `HP 23/40`, `Temp 5`; Spielleiter setzt bei `Ork` HP 30/30 und Markierung
      `Liegend` → beim Spielleiter Healthbar und Symbol, bei `sam` weiterhin nichts und in
      `Tokenwerte` nur der Name `Ork`; Spielleiter gibt `Goblin` 7 Schaden → beide sehen
      `HP 16/40`, Balken kürzer; Heilung 30 → `HP 40/40`; Spielleiter fügt bei `Goblin` per
      Schnellwahl `Vergiftet`, per Textfeld `Segen` und zwei weitere hinzu → am Token drei
      Symbole plus `+N`, in der Liste alle Texte; eine Markierung entfernen → verschwindet
      bei beiden; Spielleiter nimmt die Zuweisung von `Goblin` zurück → bei `sam`
      verschwinden Healthbar und Werte sofort; erneut zuweisen → sie erscheinen wieder;
      Server neu starten und Raum betreten → Werte und Markierungen erhalten; Spieler-Tab
      zeigt weiterhin keine Token-Verwaltung, aber die Liste `Tokenwerte`
- [x] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-token-stats/` verschieben
      (Delta in `openspec/specs/session-token/` einsynchronisieren; danach prüfen, ob die
      Abschnitte „Begriffe"/„Drahtformat" der Hauptspec die fünf Werte, `conditions`,
      `session:token-stats`, `session:token-conditions` und „`session:tokens` je
      Verbindung gefiltert" nennen — das Delta trägt sie nur im Vorspann, `openspec`
      synchronisiert ausschließlich Requirements) und PR mit `Closes #61` öffnen
      (constitution.md §3.6)
