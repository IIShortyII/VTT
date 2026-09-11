> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird deshalb
> ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/orchestrator.test.ts` um je einen Test pro Szenario ergänzen: fünf
      zu `harness-app-test-preflight` (`busyPorts` mit `Sh`-Stellvertreter je Plattform;
      `next`/`cleanup` mit stderr-Spy), zwei zu `harness-spec-delivery` (`start`/`confirmRed`
      mit Leak in `design.md`), zwei zu `harness-worktree-setup` (Tracked-Abfrage), eines zu
      `harness-run-state-access` (`jsonArgOrStdin`). Die beiden bestehenden Tests zur
      Tracked-Abfrage auf die neue Antwortform umstellen (getrackt = nichtleere Ausgabe)
- [x] 1.2 Rot bestätigen (§3.1): die Suite scheitert an TS2305/TS2554 — fehlende Exporte
      `busyPorts`/`jsonArgOrStdin` und die neuen `Sh`-Parameter von `next`/`cleanup`. Das ist
      das „Implementierung fehlt"-Rot, das `confirmRed` selbst als gültig einstuft (TS2305), kein
      Setup-Fehler des Tests. **Ehrlichkeitsvermerk:** die Szenarien „Getrackt wird an der
      nichtleeren Ausgabe erkannt" und „Ein fehlendes Werkzeug ergibt einen Hinweis" sind
      Negativ-Zusicherungen; Mutationsproben nach der Implementierung: Tracked-Abfrage
      ignoriert → beide Getrackt-Tests rot; Hinweiszeile entfernt → genau der Werkzeug-Test rot.

## 2. Portprüfung (design.md D1)

- [x] 2.1 `busyPorts(run, platform)`: win32 über `netstat -ano -p tcp` + `Get-CimInstance`,
      POSIX über `ss -ltnpH` + `ps -o args=`; liefert `{ belegt, hinweis? }`
- [x] 2.2 `warnBusyPorts(run)`: je Port eine stderr-Zeile, Hinweis bei fehlendem Werkzeug
- [x] 2.3 `emit()` ruft `warnBusyPorts` bei `present-app-review`; `next(i, run)` und
      `cleanup(i, gh, run)` reichen den `Sh`-Stellvertreter durch

## 3. Leak-Wächter früher (D2)

- [x] 3.1 `start`: nach `seedChangeDocs`, vor `writeStatus` — `assertNoTestLeak` über das
      Change-Material aus dem Worktree
- [x] 3.2 `confirmRed`: nach bestätigtem Rot, vor dem Phasenwechsel — dieselbe Prüfung; Abbruch
      per `fail` mit Fundstelle und Hinweis auf Pause/Korrektur/Resume

## 4. stdin-Pflicht und Tracked-Abfrage (D3, D4)

- [x] 4.1 `jsonArgOrStdin(arg)` exportiert; Dispatch von `record-round-summary` und
      `record-review` nutzt sie
- [x] 4.2 `removeUntrackedSourceDocs`: `git ls-files -- <pfad>`, Entscheidung an
      `out.trim() !== ''`

## 5. Dokumentation (D5)

- [x] 5.1 `AGENTS.md`: `pnpm dev:server` lädt keine `.env` — Aufruf für den App-Test; Hinweis
      auf die Portwarnung bei `cleanup`; `record-*` nur über stdin
- [x] 5.2 `.claude/skills/feature-loop/SKILL.md`: Portwarnung bei `present-app-review` und
      der Server-Aufruf mit `--env-file`

## 6. Abschluss

- [x] 6.1 `pnpm test:harness` (179), `pnpm typecheck`, `pnpm lint` grün; `openspec validate
      harness-followups --strict` valide; Portprüfung real gefahren: fand den laufenden Server
      auf 3001 (`node --env-file=.env --import tsx src/server/index.ts`) mit PID
- [x] 6.2 Reviewer-Subagent (read-only) gegen den Diff: **ok**, kein blockierendes Finding.
      Zwei Hinweise als Kommentar festgehalten: der POSIX-Zweig meldet einen Port ohne
      lesbaren `pid=`-Teil still nicht (fremder Nutzer, altes iproute2); ein git-Fehler bei der
      Tracked-Abfrage bedeutet jetzt „behalten" statt „löschen" — sicherer, bewusst.
- [x] 6.3 Menschliche Freigabe (`constitution.md` §3.4 — kein App-Test, kein Anwendungscode)
- [x] 6.4 `openspec archive harness-followups --yes`, Purpose der neuen Capability ausfüllen,
      PR als Teil 3 von 3 mit `Closes #44`; menschlicher Merge
