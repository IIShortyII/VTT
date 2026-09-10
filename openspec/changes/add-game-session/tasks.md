> Umsetzung über den Harness-Loop (`pnpm harness start 6 add-game-session`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/game-session/spec.md`, 36 Szenarien) und werden rot bestätigt; der implementer sieht
> sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite
> über den Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Integrationstests für die acht REST-Szenarien der Requirements „Spielsitzung
      erstellen", „Beitritt per Sitzungscode", „Meine Spielsitzungen" und „Sitzungsrouten
      verlangen eine Anmeldung" — `app.inject()` mit Cookie aus einer Registrierung, eigene
      Suite-DB `setupEphemeralDb('game-session')` (design.md D11); DB-Aussagen direkt aus den
      Tabellen `GameSession`/`Membership` lesen; verifizieren, dass sie rot sind aus dem
      erwarteten Grund (Route fehlt → `404` statt `201`/`200`), nicht aus Setup-Gründen (§3.1).
      Hinweis: bis die Migration aus 2.1 existiert, fehlen die Tabellen — Tests, die sie lesen,
      scheitern dann an Prisma-Typen bzw. am Datenbankzugriff; beim Rot-Bestätigen unterscheiden
- [ ] 1.2 Integrationstests für die 22 Socket-Szenarien der Requirements „Verbindung und
      Betreten des Raums", „Autorisierung pro Aktion", „Teilnehmerliste in Echtzeit", „Eine
      Verbindung pro Nutzer und Spielsitzung", „Lebenszyklus durch den Spielleiter" und
      „Abwesenheit des Spielleiters pausiert" — lauschende App auf Port 0, `socket.io-client`
      mit `extraHeaders.cookie`, `reconnection: false`, Listener vor der Aktion registrieren,
      `once`-Promises mit Timeout statt Schlaf; „kein `session:status`" über einen
      Fail-Listener plus Warten auf das erwartete Ereignis (design.md D11); Zustände für GIVEN
      direkt in die `GameSession`-Zeile schreiben statt über Übergänge herzustellen;
      verifizieren, dass sie rot sind (ohne Socket-Server scheitert der Verbindungsaufbau —
      das ist der erwartete Grund für die Verbindungs-Szenarien; für die übrigen ebenfalls
      prüfen, dass nicht ein Timeout im Setup, sondern die Verbindung/das Acknowledgement fehlt)
- [ ] 1.3 Komponententests für die sechs Szenarien der Requirement „Sitzungsoberfläche"
      (`tests/session-ui.unit.test.tsx`, jsdom-Docblock, `fetch` gemockt: `/api/auth/me`
      liefert einen Nutzer, `/api/sessions` die Liste; Socket-Fassade
      `src/client/session/socket.ts` per `jest.mock` ersetzt, Ereignisse durch Aufruf der
      registrierten Handler ausgelöst); verifizieren, dass sie rot sind, weil Liste, Raum und
      Fassade fehlen

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: Modelle `GameSession` und `Membership` sowie die
      Gegenrelation `memberships` an `User` nach design.md D2; Migrationsdatei
      `prisma/migrations/<stamp>_add-game-session/migration.sql` nach dem Muster der
      bestehenden Migrationen von Hand (zwei Tabellen, Unique auf `code`, Unique auf
      `(sessionId, userId)`, Index auf `userId`, Fremdschlüssel mit `ON DELETE CASCADE`);
      verifizieren mit `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB nicht
      anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [ ] 3.1 `src/shared/session.ts`: `GameSessionStatusSchema`, `MemberRoleSchema`,
      `TransitionActionSchema`, `SESSION_CODE_ALPHABET`/`SESSION_CODE_LENGTH`,
      `CreateSessionInputSchema` (Name getrimmt, 1–60), `JoinSessionInputSchema` (Code per
      `transform` normalisiert, dann Alphabet/Länge geprüft), `SessionSummarySchema`
      (`id, name, status, role, code?`), `ParticipantSchema`, `EnterInputSchema`,
      `TransitionInputSchema`, Acknowledgement-Typen, Ereignisnamen als Konstanten, Tabelle
      `TRANSITIONS` mit `nextStatus`/`allowedActions` (design.md D5); kein serverseitiger
      Import; verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [ ] 4.1 `src/server/session/rules.ts`: `generateCode(randomInt)` aus dem Alphabet,
      `normalizeCode` (falls nicht vollständig im Schema), `toSessionSummary(gameSession,
      role)` mit `code` nur für `spielleiter` (design.md D4); verifizieren mit
      `pnpm typecheck:src`
- [ ] 4.2 `src/server/session/presence.ts`: Klasse `Presence` mit `enter`/`leave`/`isOnline`/
      `socketOf`/`socketsIn` über zwei Indizes, ohne Socket.IO-Import; `leave` liefert `null`
      für einen bereits ersetzten Socket (design.md D7); verifizieren mit `pnpm typecheck:src`
- [ ] 4.3 `src/server/session/authorize.ts`: `authorizeAction(deps, socket, gameSessionId,
      { role? })` — Anmelde-Sitzung über `resolveSession`, Mitgliedschaft, Spielsitzung, jedes
      Mal aus der DB; Rückgabe `{ ok: true, user, membership, gameSession }` oder
      `{ ok: false, message }` (design.md D6); verifizieren mit `pnpm typecheck:src`
- [ ] 4.4 `src/server/session/room.ts`: `buildParticipants(prisma, presence, gameSessionId)`
      (Mitgliedschaften mit `user.email`, `online` aus `presence`) und
      `broadcastParticipants(io, …)` / `broadcastStatus(io, …)` an den Raum
      `session:<id>`; verifizieren mit `pnpm typecheck:src`
- [ ] 4.5 `src/server/session/routes.ts`: `POST /api/sessions` (`401` ohne Sitzung, `400` +
      `field: 'name'`, Transaktion aus `GameSession` + `Membership spielleiter`, Code-Schleife
      bei `P2002`, `201`), `POST /api/sessions/join` (Normalisierung, `404` mit identischer
      Meldung für unbekannt/geschlossen, idempotent bei bestehender Mitgliedschaft, `200`,
      danach `broadcastParticipants`), `GET /api/sessions` (Mitgliedschaften des Nutzers,
      `code` nur bei `spielleiter`); Sitzungsauflösung wie in `auth/routes.ts`; verifiziert
      durch die REST-Szenarien im Gate
- [ ] 4.6 `src/server/session/socket.ts`: Middleware (Cookie vorhanden, sonst Ablehnung),
      `session:enter` (Parse → `authorizeAction` → Spieler nur wenn nicht `geschlossen` →
      vorherigen Raum verlassen → `presence.enter` → bei `replaced`: `session:replaced`,
      `leave(room)`, `disconnect(true)` → `join(room)` → Acknowledgement mit Summary und
      Teilnehmern → Broadcast), `session:transition` (Parse → `authorizeAction({ role:
      'spielleiter' })` → `nextStatus` oder Ablehnung → Update → `session:status` → bei
      `beenden`: Spieler-Sockets `session:ended`, `leave`, `presence.leave`, letzte
      Teilnehmerliste), `disconnect` (`presence.leave`; Teilnehmerliste; Spielleiter in
      `gestartet` → `pausiert` + `session:status`); Fehler geloggt und als `{ ok: false }`
      beantwortet (design.md D6–D8); verifiziert durch die Socket-Szenarien im Gate
- [ ] 4.7 `src/server/core/app.ts`: `new Server(app.server, { serveClient: false })`,
      `onClose` → `io.close()`, `onReady` → `updateMany({ status: 'gestartet' } → 'pausiert')`,
      `registerSessionRoutes(app, { prisma, clock, cookieSecure, io, presence })` und
      `registerSessionSocket(io, { prisma, clock, presence })` (design.md D5, D9); verifizieren
      mit `pnpm typecheck:src` und `pnpm lint`

## 5. Client (implementer)

- [ ] 5.1 `vite.config.ts`: Proxy `'/socket.io'` mit `ws: true` auf den Fastify-Port
      (design.md D9); verifizieren durch Sichtprüfung der Konfiguration und im App-Test
      (WebSocket statt Polling im Netzwerk-Tab)
- [ ] 5.2 `src/client/session/api.ts`: `listSessions`, `createSession`, `joinSession` mit
      `credentials: 'include'`, Antworten durch die `shared/`-Schemas geparst, Fehlerform
      wie `client/auth/api.ts` (design.md D10); verifizieren mit `pnpm typecheck:src`
- [ ] 5.3 `src/client/session/socket.ts`: Fassade über `socket.io-client` (`autoConnect:
      false`, `withCredentials: true`) mit `connect`, `disconnect`, `enter`, `transition`,
      `on(...)` für `participants`/`status`/`replaced`/`ended`/`disconnect` (design.md D10);
      verifizieren mit `pnpm typecheck:src`
- [ ] 5.4 `src/client/session/SessionList.tsx`: Liste mit Name, Rolle, Zustand und „Betreten";
      Formulare „Neue Spielsitzung" (Name) und „Beitreten" (Code) mit `role="alert"`-Meldung
      bei Ablehnung; Abmelden und `ChangePasswordForm` bleiben in dieser Ansicht (design.md
      D10); verifiziert durch das Szenario „Sitzungsliste mit Erstellen und Beitreten"
- [ ] 5.5 `src/client/session/SessionRoom.tsx`: `enter` beim Mounten, Anzeige von Name,
      Zustand, Teilnehmern mit Anwesenheitskennzeichen; für `spielleiter` Code und je eine
      Schaltfläche pro `allowedActions(status)`; Zustand folgt ausschließlich Acknowledgement
      und `session:status`; `replaced` → Hinweis + kein erneutes `connect`/`enter`, Schaltfläche
      „Hier weiterspielen"; `ended` → `onLeave` mit Hinweis; Fassade beim Unmount trennen
      (design.md D10); verifiziert durch die fünf Raum-Szenarien
- [ ] 5.6 `src/client/app/App.tsx`: angemeldete Ansicht rendert `SessionList` bzw.
      `SessionRoom` (Zustand `liste`/`raum`), Hinweis nach `ended` in der Liste; bestehende
      Szenarien der `user-auth`-Anmeldeoberfläche bleiben grün; verifiziert im Gate

## 6. Abschluss

- [ ] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden
      `user-auth`-Tests), Review „ok"
- [ ] 6.2 App-Test durch den Menschen: zwei Browser-Profile (Spielleiter, Spieler) —
      erstellen, öffnen, Code eingeben, beitreten, Teilnehmerliste beidseitig, starten,
      pausieren, Spielleiter-Tab schließen → Spieler sieht `pausiert`, zweiter Spieler-Tab →
      erster zeigt „an anderer Stelle geöffnet", beenden → Spieler zurück in der Liste;
      Netzwerk-Tab zeigt eine WebSocket-Verbindung
- [ ] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-game-session/` verschieben
      und PR mit `Closes #6` öffnen (constitution.md §3.6)
