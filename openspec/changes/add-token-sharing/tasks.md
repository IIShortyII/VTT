> Umsetzung über den Harness-Loop (`pnpm harness start 62 add-token-sharing`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus dem
> Delta `specs/session-token/spec.md`: 13 Szenarien „Zielgruppe eines Tokenwerts setzen",
> 9 „Sichtbarkeit der Tokenwerte" — davon 5 bereits vorhanden und unverändert, 1 um `shares`
> `null` erweitert, 3 neu —, 31 „Tokenansicht im Raum" — davon 22 bereits vorhanden und
> unverändert, 9 neu) und werden rot bestätigt; der implementer sieht sie nie. „Gate grün"
> heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Socket-Integrationstests in der bestehenden Token-Socket-Suite: die 13 Szenarien
      „Zielgruppe eines Tokenwerts setzen" und die 3 neuen Szenarien „Sichtbarkeit der
      Tokenwerte" („Geteilte Werte erreichen den Empfänger beim Betreten", „Freigaben sehen
      nur Spielleiter und Besitzer", „Änderung eines geteilten Werts erreicht die Zielgruppe
      sofort"); „Spieler erhält von fremden Tokens keine Werte" um `shares` `null`
      erweitern. Aufbau wie bisher (echte Socket.IO-Clients, Routen, `session:activate-map`);
      Helfer zum direkten Anlegen eines Tokens um optionale Zielgruppen erweitern (design.md
      D9, Tabelle `TokenShare` nach D1); DB-Aussagen nach design.md D9; verifizieren, dass
      die Tests rot sind, weil `session:token-share` unbekannt ist, die Tabelle fehlt bzw.
      geteilte Werte beim Empfänger noch `null` sind (Prisma-Typfehler beim Rot-Bestätigen
      unterscheiden)
- [ ] 1.2 Komponententests in der bestehenden Token-UI-Suite: die 9 neuen Szenarien der
      „Tokenansicht im Raum" („Spielleiter teilt einen Wert mit allen über die Liste",
      „Spielleiter teilt einen Wert mit einem Spieler über die Liste", „Weiterer Empfänger
      wird an die Liste angehängt", „Abwahl des letzten Empfängers sendet keine", „Abwahl
      von alle sendet keine", „Freigabe-Schalter folgen dem Bestand", „Besitzer sieht
      Freigabe-Schalter nur am eigenen Token", „Besitzer teilt über die Liste", „Abgelehnte
      Freigabe zeigt die Meldung"); Fixtures `GOBLIN`/`ORK` um `shares` (`null`) ergänzen;
      Socket-Fassaden-Mock um ein aufzeichnendes `shareToken` erweitern; Elemente nach der
      Schnittstellentabelle in design.md D8 über Testing-Library-Abfragen (Rolle `checkbox`
      und genauer zugänglicher Name), keine `must()`-Helfer (design.md D9); verifizieren,
      dass sie rot sind, weil die Kontrollkästchen und die Fassadenmethode fehlen

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: Modell `TokenShare` (`tokenId`, `stat`, `userId` nullable,
      `@@unique([tokenId, stat, userId])`, `@@index([tokenId])`, `@@index([userId])`,
      `onDelete: Cascade` an Token und User) und Gegenrelationen `Token.shares`,
      `User.tokenShares` (design.md D1); Migrationsdatei
      `prisma/migrations/<stamp>_add-token-share/migration.sql` mit `CREATE TABLE
      "TokenShare"` (beide Fremdschlüssel `ON DELETE CASCADE`), Unique-Index und zwei
      Indizes, nach dem Muster von `TokenCondition` in `20260911140000_add-token-stats`;
      verifizieren mit `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB nicht
      anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [ ] 3.1 `src/shared/token.ts`: `TOKEN_STATS`, `TokenStatSchema`, `TokenStat`;
      `TokenAudienceSchema` (`'keine'` | `'alle'` | nicht-leere Liste eindeutiger Strings),
      `TokenAudience`; `TokenSharesSchema`, `TokenShares`, `NO_SHARES`; `TokenSchema.shares`
      nullable; `ShareTokenInputSchema`, `ShareTokenInput`, `ShareTokenAck`;
      `SESSION_TOKEN_EVENTS.share = 'session:token-share'`; `canShareToken` (design.md D2);
      kein serverseitiger Import; verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [ ] 4.1 `src/server/session/tokens.ts`: `TOKEN_INCLUDE` um `shares` (aufsteigend nach
      `userId`); `toToken` baut `shares` (`alle`-Zeile gewinnt, sonst Liste, sonst `keine`);
      `isStatVisible(token, stat, viewer)`; `redactToken` filtert je Stat (`hp`/`hpMax`
      gemeinsam, `conditions` als Liste) und setzt `shares` auf `null` für jeden, der weder
      Spielleiter noch Besitzer ist (design.md D3); Handler `session:token-share` (zod-Parse
      → `authorizeAction` ohne Rolle → Token der aktiven Instanz laden → `canShareToken`
      gegen die jetzt geladene Zuweisung, sonst `Dieses Token darfst du nicht teilen.` →
      Liste gegen Mitgliedschaften mit Rolle `spieler` prüfen, sonst `Spieler nicht
      gefunden.` → Transaktion `deleteMany` + `createMany` → neu laden → `broadcastTokens` →
      `{ ok: true, token }` für den Absender gefiltert); die übrigen Handler unverändert;
      verifiziert durch die Socket-Szenarien im Gate

## 5. Client (implementer)

- [ ] 5.1 `src/client/session/socket.ts`: `shareToken(sessionId, tokenId, stat, audience)`
      mit Acknowledgement (design.md D4); verifizieren mit `pnpm typecheck:src`
- [ ] 5.2 `src/client/session/TokenShare.tsx` (neu): `TOKEN_STAT_LABELS` und
      `TokenShareControls({ token, participants, onShare })` — `null` bei `shares` `null`,
      sonst `<fieldset>` `<Name> Freigaben` mit je Stat einem Kästchen `für alle` und je
      Spieler-Mitglied außer dem Besitzer einem Kästchen `für <Anzeigename>`; Zustand aus
      `token.shares`, kein lokaler Zustand; Sendelogik nach design.md D5; Beschriftungen und
      `name`-Attribute genau nach der Schnittstellentabelle in design.md D8; verifiziert
      durch die Freigabe-Szenarien im Gate
- [ ] 5.3 `src/client/session/TokenPanel.tsx`: Prop `onShare`, `TokenShareControls` je
      `TokenRow`; `src/client/session/TokenStats.tsx`: `PlayerTokenList` mit `participants`
      und `onShare`, `TokenShareControls` je Token (design.md D6); `Anlegen` schickt
      weiterhin nur das Anlegeformular ab; bestehende Szenarien bleiben grün
- [ ] 5.4 `src/client/session/SessionRoom.tsx`: `handleTokenShare` über die Fassade mit
      derselben `tokenError`-Meldung; `onShare` an `TokenPanel`, `participants` und `onShare`
      an `PlayerTokenList` (design.md D6); bestehende Szenarien der Sitzungsoberfläche, der
      Kartenansicht und der Tokenansicht bleiben grün; verifiziert im Gate

## 6. Abschluss

- [ ] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 6.2 App-Test durch den Menschen (drei Browser oder Profile: Spielleiter, Spieler
      `sam`, Spieler `tom`): Karte aktivieren, Token `Goblin` (an `sam` zugewiesen, HP
      23/40, RK 16) und `Ork` (ohne Besitzer, HP 30/30, Markierung `Liegend`) anlegen →
      `tom` sieht bei beiden nichts, `sam` nur `Goblin`; Spielleiter kreuzt bei `Ork` „HP
      für alle" an → bei `sam` und `tom` erscheinen sofort Healthbar und `HP 30/30`, aber
      keine Markierung; Spielleiter kreuzt bei `Ork` „Markierungen für sam" an → nur `sam`
      sieht `Liegend`; `sam` kreuzt bei `Goblin` „RK für tom" an → `tom` sieht `RK 16`, aber
      kein `HP`; `sam` sieht bei `Ork` keine Schalter, bei `Goblin` keinen Schalter für sich
      selbst und keinen für den Spielleiter; Spielleiter wählt bei `Goblin` „RK für tom" ab →
      bei `tom` verschwindet `RK 16`; Spielleiter gibt `Ork` 10 Schaden → alle sehen `HP
      20/30`; Zuweisung von `Goblin` zurücknehmen → `sam` verliert Werte und Schalter, die
      Freigabe „HP für alle" von `Ork` bleibt; Server neu starten und Raum betreten →
      Freigaben erhalten; neuer Spieler tritt bei → sieht `Ork` HP sofort (Zielgruppe
      `alle`)
- [ ] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-token-sharing/` verschieben
      (Delta in `openspec/specs/session-token/` einsynchronisieren; danach prüfen, ob die
      Abschnitte „Begriffe"/„Drahtformat" der Hauptspec Stat, Zielgruppe, Freigaben,
      `shares` und `session:token-share` nennen — das Delta trägt sie nur im Vorspann,
      `openspec` synchronisiert ausschließlich Requirements) und PR mit `Closes #62` öffnen
      (constitution.md §3.6)
