> Umsetzung über den Harness-Loop (`pnpm harness start 15 add-token-assignment`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus dem
> Delta `specs/session-token/spec.md`: 7 Szenarien „Token zuweisen", 6 „Token bewegen",
> 12 „Tokenansicht im Raum" — davon sind 9 bereits vorhanden und bleiben unverändert, 2
> behalten ihren Namen und ändern ihre Aussage, 1 wird um eine Assertion erweitert, 13 sind
> neu) und werden rot bestätigt; der
> implementer sieht sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die
> vollständige Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Socket-Integrationstests in der bestehenden Token-Socket-Suite: die 7 Szenarien
      „Token zuweisen" und die 3 neuen Szenarien „Token bewegen" („Spieler bewegt sein
      eigenes Token", „Spieler darf ein fremdes Token nicht bewegen", „Entzogene Zuweisung
      wirkt mit der nächsten Bewegung" — letzteres mit **einer** Spieler-Verbindung für beide
      Bewegungen); den bestehenden Test „Spieler darf kein Token bewegen" an das geänderte
      Szenario anpassen (Meldung `Dieses Token darfst du nicht bewegen.`; kein
      `session:tokens` beim Spieler). Aufbau
      wie bisher (echte Socket.IO-Clients, Routen, `session:activate-map`); Helfer
      `createTokenDirect` um optionales `ownerId` erweitern (design.md D8); verifizieren,
      dass die neuen Tests rot sind, weil `session:token-assign` unbekannt ist bzw.
      `ownerId` fehlt, und der ersetzte Test rot ist, weil die Meldung nicht stimmt bzw.
      `ownerId` in der DB nicht existiert (Prisma-Typfehler beim Rot-Bestätigen
      unterscheiden)
- [ ] 1.2 Komponententests in der bestehenden Token-UI-Suite: die 4 neuen Szenarien
      „Spieler greift nur eigene Tokens", „Spieler sieht die abgelehnte Bewegung",
      „Spielleiter weist ein Token über die Liste zu", „Spielleiter nimmt eine Zuweisung über
      die Liste zurück"; den bestehenden Test „Spieler zieht nicht" an das geänderte Szenario
      anpassen (Rückruf vorhanden, `canMoveToken` liefert für das fremde Token `false`);
      „Spieler sieht keine Token-Verwaltung" um „kein Auswahlfeld
      `<Tokenname> zuweisen`" erweitern; Fixtures `GOBLIN`/`ORK` um `ownerId` ergänzen,
      Enter-Acknowledgement mit `participants` (`meister`/`spielleiter`, `sam`/`spieler`/
      `u-sam`/Alias `Gandalf`), Socket-Fassaden-Mock um aufzeichnendes `assignToken`;
      Elemente nach der Schnittstellentabelle in design.md D7 über Testing-Library-Abfragen
      (Rolle und zugänglicher Name, Option innerhalb des Auswahlfelds), keine
      `must()`-Helfer (design.md D8); verifizieren, dass sie rot sind, weil
      `canMoveToken`/`onTokenMove` für Spieler, das Auswahlfeld und `assignToken` fehlen
      bzw. die Meldung des Spielers nirgends erscheint

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: `Token.ownerId String?` mit Relation `owner User?`
      (`onDelete: SetNull`) und `@@index([ownerId])`, Gegenrelation `tokens Token[]` an
      `User` (design.md D1); Migrationsdatei
      `prisma/migrations/<stamp>_add-token-owner/migration.sql` per `ALTER TABLE … ADD
      COLUMN` mit Fremdschlüssel `ON DELETE SET NULL` und `CREATE INDEX`, nach dem Muster von
      `20260910150000_add-map-instance`; verifizieren mit `pnpm db:generate` und
      `pnpm typecheck:src`. Entwicklungs-DB nicht anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [ ] 3.1 `src/shared/token.ts`: `ownerId: z.string().nullable()` in `TokenSchema`;
      `AssignTokenInputSchema` (`sessionId`, `tokenId`, `ownerId` nullable, nicht optional),
      `AssignTokenAck`, `SESSION_TOKEN_EVENTS.assign = 'session:token-assign'`;
      `TokenMover` und `canMoveToken(token, mover)` als reine Regel (Rolle `spielleiter`
      oder `ownerId === userId`), `MemberRole` per `import type` aus `session.ts`
      (design.md D2); kein serverseitiger Import; verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [ ] 4.1 `src/server/session/tokens.ts`: `toToken` kopiert `ownerId`; neuer Handler
      `session:token-assign` (zod-Parse → `authorizeAction` Rolle `spielleiter` → Token der
      aktiven Instanz laden, `Token nicht gefunden.` → bei `ownerId !== null` Mitgliedschaft
      `sessionId_userId` mit Rolle `spieler` prüfen, sonst `Spieler nicht gefunden.` →
      `update` → `broadcastTokens` → `{ ok: true, token }`); `session:token-move` ohne
      Rollenanforderung, nach dem Laden `canMoveToken` mit Rolle aus der Mitgliedschaft und
      `userId` aus `authorizeAction`, bei `false` `Dieses Token darfst du nicht bewegen.`
      vor jedem Schreiben und ohne `broadcastTokens` (design.md D3); verifiziert durch die
      Socket-Szenarien im Gate

## 5. Client (implementer)

- [ ] 5.1 `src/client/session/socket.ts`: `assignToken(sessionId, tokenId, ownerId)` mit
      Acknowledgement über `SESSION_TOKEN_EVENTS.assign` (design.md D4); verifizieren mit
      `pnpm typecheck:src`
- [ ] 5.2 `src/client/map/canvas.ts`: Option `canMoveToken?: (token) => boolean`; ein Token
      ist greifbar genau dann, wenn `onTokenMove` gesetzt ist und `canMoveToken` fehlt oder
      `true` liefert — nur dann `eventMode`/`cursor`/`pointerdown`; greifbare Tokens mit
      Akzentring kennzeichnen (design.md D5); `src/client/map/MapCanvas.tsx`: Prop
      `canMoveToken`, nur beim Erzeugen übergeben; verifizieren mit `pnpm typecheck:src` und
      `pnpm lint`
- [ ] 5.3 `src/client/session/TokenPanel.tsx`: Props `participants` und `onAssign`, Prop
      `error` entfernen (keine Meldung mehr in der Verwaltung); je Token ein
      `<select name="owner" aria-label="<Name> zuweisen">` mit Wert `ownerId ?? ''`, Option
      `Spielleiter` (Wert `''`) und je Teilnehmer mit Rolle `spieler` eine Option mit
      `userId` als Wert und `displayName` als Text; `onChange` → `onAssign(token.id, value
      === '' ? null : value)` (design.md D7); verifiziert durch die Verwaltungs-Szenarien im
      Gate
- [ ] 5.4 `src/client/session/SessionRoom.tsx`: `MapCanvas` für jede Rolle mit
      `onTokenMove` und `canMoveToken` aus der Regel in `shared/token.ts` (Rolle aus dem
      Zustand, `currentUserId` aus den Props); `tokenError` als `<p role="alert">` in der
      Raumansicht für jede Rolle; `handleTokenAssign` über `assignToken` der Fassade mit
      derselben Meldung; `TokenPanel` mit `participants` und `onAssign`, ohne `error`
      (design.md D6); bestehende Szenarien der Sitzungsoberfläche, der Kartenansicht und der
      Tokenansicht bleiben grün; verifiziert im Gate

## 6. Abschluss

- [ ] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 6.2 App-Test durch den Menschen (zwei Browser, Spielleiter und Spieler `sam`): Karte
      aktivieren, Token `Goblin` und `Ork` anlegen → beim Spieler kein Token greifbar, kein
      Ring; Spielleiter wählt im Auswahlfeld `Goblin zuweisen` den Spieler → beim Spieler
      bekommt `Goblin` den Ring und lässt sich ziehen, `Ork` nicht; Spieler zieht `Goblin` →
      beide sehen es in der Zielzelle einrasten; Spielleiter zieht `Ork` → weiterhin möglich;
      Spielleiter wählt `Spielleiter` → beim Spieler verschwindet der Ring, Ziehen ist nicht
      mehr möglich; Spielleiter weist `Goblin` erneut zu und nimmt die Zuweisung zurück,
      während der Spieler gerade zieht → beim Loslassen erscheint beim Spieler die Meldung
      `Dieses Token darfst du nicht bewegen.` und das Token bleibt; Server neu starten und
      Raum betreten → Zuweisung erhalten; Spieler-Tab zeigt weiterhin keine Token-Verwaltung
- [ ] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-token-assignment/` verschieben
      (Delta in `openspec/specs/session-token/` einsynchronisieren; danach prüfen, ob die
      Abschnitte „Begriffe"/„Drahtformat" der Hauptspec `ownerId` und
      `session:token-assign` nennen — das Delta trägt sie nur im Vorspann, `openspec`
      synchronisiert ausschließlich Requirements) und PR mit `Closes #15` öffnen
      (constitution.md §3.6)
