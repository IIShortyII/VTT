> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird deshalb
> ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/orchestrator.test.ts` um je einen Test pro Szenario aus
      `specs/harness-gate-feedback/spec.md` ergänzen (13 Szenarien, vier Requirements):
      Gate-Läufe über einen `Sh`-Stellvertreter, der tsc-Text liefert bzw. `eslint.json` in den
      Run-State schreibt; Routing über `next()` gegen vorbereitete `status.json`;
      Jest-Auswertung über vorbereitete `jest.json`
- [x] 1.2 Rot bestätigen (§3.1): `pnpm test:harness` — 10 der 13 neuen Fälle scheitern an der
      erwarteten Zusicherung (fehlender Abschnitt im Auftrag, `invoke-implementer` statt
      `invoke-test-author-rework`, leere Failure-Liste), nicht an Import- oder Compile-Fehlern.
      **Ehrlichkeitsvermerk:** drei Szenarien sind Negativ-Zusicherungen und von Anfang an grün
      („Gemischte Befunde bleiben eine Implementer-Runde", „Rotes Jest mit Testbefunden bleibt
      eine Implementer-Runde", „Die Eskalationsgrenze gilt auch für die testseitige Route") —
      das heutige Verhalten erfüllt sie trivial. Rot-Bestätigung per Mutationsprobe nach der
      Implementierung: `every → some` macht genau das erste rot, das Entfernen der
      `jestGreen`-Bedingung genau das zweite, ein Umgehen von `reworkTo` auf der testseitigen
      Route das dritte (plus die beiden positiven Routing-Tests). Danach zurückgedreht.

## 2. Werkzeugausgabe parsen (design.md D1, D5)

- [x] 2.1 Typ `ToolFailure` und `Status.lastGate` um `tools` und `jestGreen` erweitern
- [x] 2.2 `parseTscOutput(out)`: Zeilenformat `pfad(zeile,spalte): error TSnnnn: meldung`,
      eingerückte Folgezeilen an den vorigen Befund; Zeilen ohne Pfad mit `error TS` als
      Befund ohne Datei
- [x] 2.3 `gate`: Lint mit `--format json --output-file <run-dir>/eslint.json` fahren, Datei
      vorher entfernen; `parseEslintJson(i, wt, out)`: `severity 2` → Befund mit
      worktree-relativem Pfad, Zeile, Spalte, Regel, Meldung; Rot ohne Befund → Befund ohne
      Datei aus der ersten Zeile der Ausgabe
- [x] 2.4 `recordGateResult` schreibt `tools` und `jestGreen` — im Volllauf wie in der
      `--onlyFailures`-Abkürzung

## 3. Zuordnung und Routing (D2, D4)

- [x] 3.1 Test-Zweig aus `scopeOfFinding` in `isTestPath(file)` herausziehen; beide Stellen
      nutzen ihn
- [x] 3.2 `next()`, Fall `gate`: bei Rot zuerst `onlyTestSideRed(lastGate)` prüfen →
      `reworkTo(s, 'rework-tests', 'invoke-test-author-rework', 'test-author')`, sonst wie
      bisher `reworkImplementer`

## 4. Aufträge (D3, D7)

- [x] 4.1 `makeLeakDetector(i)` aus `parseJestFailures` herausziehen; `parseJestFailures` und
      der Prompt-Bauer nutzen denselben Erkenner
- [x] 4.2 `buildImplPrompt`: Abschnitt „Typecheck / Lint" — Befunde außerhalb `tests/`
      vollständig (Leak-geprüft, bei Treffer Rückhalt-Hinweis + Protokoll), Testbefunde als
      Zählung je Werkzeug
- [x] 4.3 `buildTestReworkPrompt`: derselbe Abschnitt ungefiltert, wenn `lastGate` rot mit
      testseitigen Befunden ist; funktioniert ohne `pendingTestFindings`

## 5. Jest-Quellen (D6)

- [x] 5.1 `parseJestFailures`: Rohtext aus `failureMessages` + `failureDetails`
      (`diagnosticText` ?? `message`)
- [x] 5.2 Suite mit `status: failed` und leeren `assertionResults` → ein Befund „Testsuite
      konnte nicht geladen werden" aus `testResults[].message`, durch Kürzung und Wächter

## 6. Dokumentation

- [x] 6.1 `.claude/skills/feature-loop/SKILL.md`: Satz zum roten Gate um die testseitige Route
      ergänzen
- [x] 6.2 `AGENTS.md`, Abschnitt Harness-Gate: Typecheck/Lint-Befunde im Feedback, Zählung für
      den implementer, testseitiges Rot → test-author

## 7. Abschluss

- [x] 7.1 `pnpm test:harness`, `pnpm typecheck` und `pnpm lint` grün; `openspec validate
      add-gate-feedback --strict` valide
- [ ] 7.2 Reviewer-Subagent (read-only) gegen den Diff; Befunde einarbeiten
- [ ] 7.3 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe des Gates und der Aufträge)
- [ ] 7.4 `openspec archive add-gate-feedback --yes` (verschiebt den Change und legt
      `openspec/specs/harness-gate-feedback/spec.md` an), dann PR mit Verweis auf #44 öffnen
      (kein `Closes` — Punkte 3, 4, 6, 7, 8 folgen in eigenen Changes); menschlicher Merge
