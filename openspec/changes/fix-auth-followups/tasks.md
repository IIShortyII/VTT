> Umsetzung über den Harness-Loop (`pnpm harness start 25 fix-auth-followups`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/user-auth/spec.md`) und werden rot bestätigt; der implementer sieht sie nie. „Gate
> grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
> Orchestrator.

## 1. Spec-Basis

- [ ] 1.1 `openspec/specs/user-auth/spec.md` aus dem archivierten Delta von `add-user-auth`
      anlegen (design.md D6) — liegt seit dem Proposal untracked im Hauptrepo und wird im
      Abschluss-Schritt 5.3 (Session rollenlos) in den Worktree übernommen und **vor** dem
      Archivieren committet; verifizieren, dass die Datei acht `### Requirement:`-Blöcke
      enthält und `openspec validate fix-auth-followups --strict` das Delta akzeptiert

## 2. Tests (test-author)

- [ ] 2.1 `tests/user-auth.integration.test.ts`: Wegwerf-DB im `beforeAll` mit
      `prisma migrate deploy` statt `prisma db push` aufbauen (design.md D5); verifizieren,
      dass die bestehenden, unveränderten Szenarien weiterhin grün laufen
- [ ] 2.2 Integrationstests für die geänderten und neuen Szenarien aus dem Delta
      (`Anmeldung mit strukturell ungültigem Anfragekörper`, `Abgelaufene Sitzung gilt nicht
      mehr` mit entwertetem Cookie, `Aktivität in der ersten Hälfte der Laufzeit ändert nichts`
      mit Cookie in Restlaufzeit — die beiden bestehenden Tests werden um die neue Assertion
      ergänzt, nicht dupliziert); verifizieren, dass sie gegen den aktuellen Stand rot sind —
      aus dem erwarteten Grund (Assertion), nicht aus Setup-Gründen (§3.1)
- [ ] 2.3 `tests/auth-ui.unit.test.tsx`: Komponententests für `Server beim Start nicht
      erreichbar` und `Fehlgeschlagene Abmeldung wird angezeigt` (gemocktes `fetch`, das die
      Anfrage verwirft); verifizieren, dass sie rot sind und keine unbehandelte
      Promise-Rejection den Testlauf abbricht

## 3. Server (implementer)

- [ ] 3.1 `src/server/auth/routes.ts`: Cookie-Helfer leitet `maxAge` aus `expiresAt` und der
      injizierten Uhr ab und wird bei Registrierung, Anmeldung und `GET /api/auth/me`
      aufgerufen (design.md D1); verifiziert durch die drei Laufzeit-Szenarien der
      Requirement „Ablauf und gleitende Verlängerung der Sitzung"
- [ ] 3.2 `src/server/auth/session.ts`: `renewed` aus `ResolvedSession` entfernen, `expiresAt`
      bleibt (design.md D1); verifizieren mit `pnpm typecheck:src`
- [ ] 3.3 `GET /api/auth/me`: im `401`-Zweig nach `resolveSession` das Cookie entwerten
      (design.md D2); verifiziert durch „Abgelaufene Sitzung gilt nicht mehr"
- [ ] 3.4 `POST /api/auth/login`: Zweigwahl nach design.md D3 als reine Funktion — `401` nur,
      wenn alle Issues am Passwort hängen, sonst `400`; `field` nur bei nicht-leerem Pfad;
      verifiziert durch „Anmeldung mit strukturell ungültigem Anfragekörper" und die
      unveränderten Anmeldeszenarien

## 4. Client (implementer)

- [ ] 4.1 `src/client/app/App.tsx`: Mount-Effekt fängt Fehler, fällt auf `anonym` zurück und
      zeigt einen Hinweis (design.md D4); verifiziert durch „Server beim Start nicht
      erreichbar"
- [ ] 4.2 `src/client/app/App.tsx`: Abmeldung fängt Fehler, bleibt `angemeldet` und zeigt die
      Fehlermeldung (design.md D4); verifiziert durch „Fehlgeschlagene Abmeldung wird
      angezeigt"

## 5. Abschluss

- [ ] 5.1 Gate grün: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
      Orchestrator; danach reviewer (§3.2/§3.3)
- [ ] 5.2 Nach „ok" des reviewers die App lokal starten (`pnpm dev`), dem Menschen Link und
      Änderungsliste zum manuellen Test vorlegen und auf ausdrückliche Freigabe warten (§3.4)
- [ ] 5.3 Nach der Freigabe den Change ins `archive/` verschieben — im selben Branch und
      Commit wie das Feature (§3.6) — und den PR mit `Closes #25` öffnen
