> Umsetzung über den Harness-Loop (`pnpm harness start 13 add-account-security`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/user-auth/spec.md`) und werden rot bestätigt; der implementer sieht sie nie. „Gate
> grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
> Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Integrationstests für die sieben Szenarien der Requirement „Sperre nach
      Fehlversuchen" — Sperrablauf über die injizierte Uhr, nicht über Warten (design.md D6);
      Zähler und Sperrzeitpunkt direkt aus der `Account`-Zeile lesen; verifizieren, dass sie
      gegen den aktuellen Stand rot sind — aus dem erwarteten Grund (Assertion), nicht aus
      Setup-Gründen (§3.1). Hinweis: bis die Migration aus 2.1 existiert, fehlen die Spalten;
      Tests, die die Spalten lesen, scheitern dann an Prisma-Typen bzw. am Datenbankzugriff —
      das ist beim Rot-Bestätigen zu unterscheiden
- [ ] 1.2 Integrationstests für die sechs Szenarien der Requirement „Passwortänderung"
      (`POST /api/auth/password`); verifizieren, dass sie rot sind (Route existiert nicht →
      `404`, nicht der erwartete Status)
- [ ] 1.3 Komponententests für die drei Szenarien der Requirement „Passwortänderung in der
      Oberfläche" (gemocktes `fetch`, `/api/auth/me` liefert einen Nutzer); verifizieren, dass
      sie rot sind, weil das Formular fehlt

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: `Account` um `failedLoginCount Int @default(0)` und
      `lockedUntil DateTime?` ergänzen (design.md D1); Migrationsdatei
      `add-account-security` mit `prisma migrate dev` **ausschließlich gegen
      `file:./prisma/test.db`** erzeugen; verifizieren mit `pnpm db:generate` und einem Blick in
      die erzeugte SQL (genau zwei neue Spalten). Entwicklungs-DB nicht anfassen (§5.1)

## 3. Server (implementer)

- [ ] 3.1 `src/server/auth/rules.ts`: `LOCKOUT_THRESHOLD`, `LOCKOUT_DURATION_MS`,
      `isAccountLocked`, `recordFailedAttempt`, `clearLockout` als reine Funktionen mit
      `now`-Parameter (design.md D2); verifizieren mit `pnpm typecheck:src`
- [ ] 3.2 `src/server/auth/routes.ts`, `POST /api/auth/login`: Hash immer prüfen, danach
      Sperre → `401` ohne Schreibzugriff; falsches Passwort → Fehlversuch schreiben; richtiges
      Passwort → Sperrzustand nur bei Änderung zurücksetzen (design.md D2, Reihenfolge 1–4);
      verifiziert durch die Szenarien der Requirement „Sperre nach Fehlversuchen"
- [ ] 3.3 `src/shared/auth.ts`: `ChangePasswordInputSchema` (`currentPassword` in Login-Form,
      `newPassword` nach `PasswordSchema`) und Typ (design.md D3)
- [ ] 3.4 `src/server/auth/routes.ts`, `POST /api/auth/password`: Sitzung auflösen (`401`),
      Körper validieren (`400` + `field`), bisheriges Passwort prüfen, gesperrt oder falsch →
      `403` + `field: 'currentPassword'` (falsch zählt als Fehlversuch), sonst Transaktion aus
      neuem Hash, `clearLockout` und Löschen aller anderen Sitzungen des Nutzers (design.md
      D3/D4); verifiziert durch die Szenarien der Requirement „Passwortänderung"

## 4. Client (implementer)

- [ ] 4.1 `src/client/auth/api.ts`: `changePassword(input)` mit lokaler `safeParse`-Vorprüfung
      und Durchreichen der `ErrorOutput`-Form (design.md D5)
- [ ] 4.2 `src/client/auth/ChangePasswordForm.tsx`: zwei Passwortfelder, Absende-Button,
      `role="alert"`-Meldung; Erfolg leert die Felder, Ablehnung zeigt die Servermeldung,
      geworfener Fehler eine generische Meldung (design.md D5)
- [ ] 4.3 `src/client/app/App.tsx`: Formular in der angemeldeten Ansicht rendern, ohne
      Zustandswechsel in `App` (design.md D5); verifiziert durch die Szenarien der Requirement
      „Passwortänderung in der Oberfläche"

## 5. Abschluss

- [ ] 5.1 Gate grün: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
      Orchestrator; danach reviewer (§3.2/§3.3) — der reviewer prüft die erzeugte Migrations-SQL
      gegen design.md D1
- [ ] 5.2 Vor dem App-Test: `.env` aus dem Hauptrepo in den Worktree kopieren; der Mensch
      migriert die Entwicklungs-DB im Worktree (§5.1). Dann App lokal starten, dem Menschen
      Link und Änderungsliste zum manuellen Test vorlegen und auf ausdrückliche Freigabe
      warten (§3.4)
- [ ] 5.3 Nach der Freigabe den Change ins `archive/` verschieben und das Delta in
      `openspec/specs/user-auth/spec.md` übernehmen — im selben Branch und Commit wie das
      Feature (§3.6) — und den PR mit `Closes #13` öffnen
