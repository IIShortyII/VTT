> Umsetzung über den Harness-Loop (`pnpm harness start 45 add-username-and-alias`), nicht
> über `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/user-auth/spec.md` und `specs/game-session/spec.md`) und werden rot bestätigt; der
> implementer sieht sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die
> vollständige Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Bestehende Tests auf den neuen Vertrag umstellen: jede Registrierung in
      `tests/user-auth.integration.test.ts`, `tests/account-security.integration.test.ts`,
      `tests/game-session.integration.test.ts` und
      `tests/game-session-socket.integration.test.ts` bekommt ein je Test eindeutiges
      `username` (am besten über einen gemeinsamen Helfer unter `tests/helpers/`); die
      Teilnehmer-Fixtures in `tests/session-ui.unit.test.tsx` und die Nutzer-Fixtures in
      `tests/auth-ui.unit.test.tsx` tragen `username` statt `email` (Teilnehmer) bzw.
      zusätzlich (Nutzer); Prüfungen, die `email` in der Teilnehmerliste erwarten, werden
      auf `username`/Alias umgestellt. Verifizieren: die Integrationstests bleiben grün
      (das Feld wird vom bisherigen Schema ignoriert, design.md Folgeregel), die
      umgestellten Komponententests sind rot, weil die Raumansicht noch `email` rendert
- [ ] 1.2 Integrationstests für die vier neuen und die drei geänderten REST-Szenarien der
      Requirement „Kontoregistrierung" sowie das Szenario „Anmeldung und Nutzerabfrage nennen
      den Nutzernamen" — `app.inject()`, Suite-eigene Wegwerf-DB; DB-Aussagen aus der
      `User`-Tabelle (`username`); verifizieren, dass die neuen rot sind aus dem erwarteten
      Grund (Registrierung ohne `username` antwortet heute `201` statt `400`; `username`
      fehlt in der Antwort), nicht aus Setup-Gründen (§3.1). Hinweis: bis die Migration aus
      2.1 existiert, kennt Prisma die Spalte `username` nicht — Tests, die sie lesen,
      scheitern dann am Typ bzw. am Datenbankzugriff; beim Rot-Bestätigen unterscheiden
- [ ] 1.3 Komponententests für die zwei Szenarien der Requirement „Registrierungsoberfläche"
      in `tests/auth-ui.unit.test.tsx` (jsdom-Docblock vorhanden, `fetch` gemockt);
      verifizieren, dass sie rot sind, weil das Nutzernamensfeld fehlt
- [ ] 1.4 Socket-Integrationstests für die acht Szenarien der Requirement „Alias pro
      Mitgliedschaft" und das neue sowie das geänderte Szenario der Requirement
      „Teilnehmerliste in Echtzeit" in `tests/game-session-socket.integration.test.ts`
      (lauschende App, `socket.io-client` mit Cookie, Listener vor der Aktion, `once`-Promises
      mit Timeout); Aliasse für GIVEN direkt in die `Membership`-Zeile schreiben; die
      Abwesenheit von `email` und `alias` über `not.toHaveProperty` prüfen; verifizieren, dass
      sie rot sind, weil `session:alias` kein Acknowledgement liefert (Timeout auf dem
      unbekannten Ereignis ist hier der erwartete Grund) bzw. `email` noch enthalten ist
- [ ] 1.5 Komponententests für die drei neuen Szenarien der Requirement „Sitzungsoberfläche"
      in `tests/session-ui.unit.test.tsx` (Fassade per `jest.mock`, `alias` als gemockte
      Methode, `session:participants` durch Aufruf des registrierten Handlers ausgelöst;
      `SessionRoom` erhält `currentUserId`); verifizieren, dass sie rot sind, weil Alias-Feld
      und `displayName`-Anzeige fehlen

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: `User.username String`, `User.usernameKey String @unique`,
      `Membership.alias String?` nach design.md D1/D4; Migrationsdatei
      `prisma/migrations/<stamp>_add-username-and-alias/migration.sql` von Hand nach dem
      SQL in design.md D3 (Redefinition von `User`, `ALTER TABLE` für `Membership`);
      verifizieren mit `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB nicht
      anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [ ] 3.1 `src/shared/auth.ts`: `USERNAME_MIN_LENGTH`/`USERNAME_MAX_LENGTH`, `UsernameSchema`
      (Trimmen per `transform`, Codepoint-Länge, `^[\p{L}\p{N}_.\-]+$` mit `u`-Flag, deutsche
      Meldungen wie beim Passwort), `RegisterInputSchema` um `username` erweitert,
      `UserOutputSchema` um `username`; verifizieren mit `pnpm typecheck:src`
- [ ] 3.2 `src/shared/session.ts`: `ParticipantSchema` ohne `email`, mit `username` und
      `alias?`; `ALIAS_MAX_LENGTH`, `AliasInputSchema` (design.md D4), `AliasAck`,
      `SESSION_EVENTS.alias = 'session:alias'`, Helfer `displayName` (design.md D5); kein
      serverseitiger Import; verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [ ] 4.1 `src/server/auth/rules.ts`: reine Funktion `usernameKey(username)` =
      `normalize('NFKC').toLowerCase()`; `toUserOutput` liefert `username` mit; verifizieren
      mit `pnpm typecheck:src`
- [ ] 4.2 `src/server/auth/routes.ts`: Registrierung legt `username` und `usernameKey` an;
      `P2002` unterscheidet nach betroffenem Feld (`target` enthält `usernameKey` → `409` mit
      `field: "username"` und eigener Meldung, sonst wie bisher E-Mail-Konflikt); die
      bisherige `findUnique`-Vorabprüfung der E-Mail bleibt; verifiziert durch die
      Registrierungs- und `/me`-Szenarien im Gate
- [ ] 4.3 `src/server/session/room.ts`: `buildParticipants` selektiert `user.username` statt
      `user.email` und `membership.alias`, baut `{ userId, username, alias?, role, online }`
      mit `alias ?? undefined` (design.md D5); verifizieren mit `pnpm typecheck:src`
- [ ] 4.4 `src/server/session/socket.ts`: Handler `handleAlias` für `session:alias` nach dem
      Muster von `handleTransition` — Parse (`AliasInputSchema`), `authorizeAction` ohne
      Rollenanforderung, `membership.update` auf die Mitgliedschaft des Absenders,
      `broadcastParticipants`, Acknowledgement `{ ok: true, alias }`; Fehler wie bei den
      anderen Handlern in ein `{ ok: false, message }` übersetzt; verifiziert durch die
      Alias- und Teilnehmerlisten-Szenarien im Gate

## 5. Client (implementer)

- [ ] 5.1 `src/client/auth/RegisterForm.tsx`: Feld `username` (Label „Nutzername", `id`
      `register-username`, `autoComplete="nickname"`, `minLength`/`maxLength` aus
      `shared/auth.ts`) vor der E-Mail; `register({ username, email, password })`;
      verifiziert durch die Szenarien der Requirement „Registrierungsoberfläche" im Gate
- [ ] 5.2 `src/client/session/socket.ts`: Fassade um `alias(sessionId, alias): Promise<AliasAck>`
      erweitern (Muster `transition`); verifizieren mit `pnpm typecheck:src`
- [ ] 5.3 `src/client/session/SessionRoom.tsx`: Prop `currentUserId`; Teilnehmer über
      `displayName` benannt; in der eigenen Zeile ein Formular (Eingabefeld mit Label „Alias",
      vorbelegt mit dem aktuellen Alias, Schaltfläche „Alias setzen"), Absenden ruft
      `facade.alias`, `{ ok: false }` erscheint als `role="alert"`; die Liste ändert sich nur
      über `session:participants` (design.md D6); `App` reicht `user.id` durch; verifiziert
      durch die Szenarien der Requirement „Sitzungsoberfläche" im Gate
- [ ] 5.4 `pnpm typecheck:src` und `pnpm lint` grün; `pnpm build` läuft durch

## 6. Abschluss (Session, nach menschlicher App-Freigabe)

- [ ] 6.1 Absatz „Drahtformat" unter „Begriffe" in `openspec/specs/game-session/spec.md`:
      Teilnehmer als `{ userId, username, alias?, role, online }`, Ereignis `session:alias`
      ergänzen (Prosa außerhalb der Requirements, die das Archivieren nicht mitführt)
- [ ] 6.2 OpenSpec-Change nach `openspec/changes/archive/YYYY-MM-DD-add-username-and-alias/`
      verschieben, Delta-Specs in die Hauptspecs synchronisieren, PR mit `Closes #45` öffnen
