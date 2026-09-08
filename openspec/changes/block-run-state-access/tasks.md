> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/guard.test.ts` um die sechs Szenarien aus
      `specs/harness-run-state-access/spec.md` ergänzen, je ein Test pro Szenario:
      „Ein Dateizugriff auf den Run-State wird abgelehnt", „Ein Kommando, das den Run-State
      nennt, wird abgelehnt", „Ein Suchwerkzeug auf den Run-State wird abgelehnt", „Die Prüfung
      des Rollenmarkers bleibt möglich", „Die Ausnahme gilt nur dem Lesen", „Ein rollenloser
      Aufruf erreicht den Run-State"
- [x] 1.2 **Prüfvorschrift gegen den Fehler aus #21:** Jeder Block-Test prüft die **Meldung**,
      nicht nur `blocked` — sonst trägt ihn ein fremder Blockgrund. Als Beispieldatei
      `status.json` verwenden (ein Name **ohne** „jest"; `jest.json` matcht zufällig
      `TEST_RUNNER_COMMANDS`). `jest.json` kommt zusätzlich als zweite Zusicherung im
      Kommando-Test vor — dort ist gerade die *Begründung* der Prüfgegenstand
- [x] 1.3 Jeden Block-Test über alle drei Rollen (`implementer`, `test-author`, `reviewer`)
      führen, mit der Rolle im `expect`-Tupel, damit die Fehlermeldung sie nennt (Hausstil)
- [x] 1.4 Rot bestätigen (§3.1): `pnpm test:harness` — die drei Wegprüfungen scheitern an der
      erwarteten Zusicherung (ausbleibende Ablehnung bzw. falsche Meldung), nicht an einem
      Import- oder Compile-Fehler
- [x] 1.5 **Ehrlichkeitsvermerk:** Die beiden Szenarien zur Rollenmarker-Ausnahme („Die Prüfung
      des Rollenmarkers bleibt möglich", „Die Ausnahme gilt nur dem Lesen") waren von Anfang an
      grün und **können** es nicht anders sein: sie sichern eine Ausnahme ab, die es vor dem
      Change nicht gab, und die Gegenrichtung war vorher ohnehin erlaubt. Ihre Bestätigung
      läuft über die Mutationsproben `marker-ausnahme-aus` und `marker-schreibschutz-aus`
      (5.3), nicht über die Rot-Phase

## 2. Das Prädikat und die Muster

- [x] 2.1 In `.harness/guard.ts` neben die vorhandenen Tabu-Muster: die verankerte Pfad-Form,
      die Ausnahme für den Rollenmarker und die unverankerte Kommando-Form — Begründung der
      Trennung in design.md D2. Beide Formen kennen den Weg vom Repo-Wurzelverzeichnis aus
      **und** die relative Form aus einem Worktree heraus (siehe 4.1)
- [x] 2.2 `isRunState(p)` exportieren (Pfad-Form minus Rollenmarker), auf `norm(p)` arbeitend.
      **Kein** Anbau an `isTest` (D1) — das Run-Verzeichnis enthält keine Tests, und die
      Meldung wäre irreführend
- [x] 2.3 Eine gemeinsame Ablehnungsmeldung, die den Run-State benennt und die Herkunft der
      Angabe (`Bash-Referenz`, `Suchziel`) anhängen kann — analog zu den vorhandenen Meldungen

## 3. Die drei Wege

- [x] 3.1 **Kommando:** Prüfung in Block 0 des Guards, also für jede geltende Rolle (D4) und
      **vor** `TEST_RUNNER_COMMANDS` (D6) — sonst behielte `.harness/runs/<i>/jest.json` die
      falsche Begründung. Innerhalb von Block 0 **hinter** `CONTROL_FILE_TABOO` und
      `CONTROL_VERB_TABOO`, damit Rollenmarker und Pause-Verben ihre genaueren Meldungen behalten
- [x] 3.2 **Dateipfad:** Prüfung in Regel 1 für jede geltende Rolle, für Lesen **und** Schreiben.
      Steht vor den rollenspezifischen Zweigen; der Rollenmarker fällt über `isRunState` heraus
- [x] 3.3 **Suchwerkzeuge:** neuer Block für Grep/Glob, für jede geltende Rolle, über
      `path`, `glob` und — nur bei Glob — `pattern`. Vor dem bestehenden, implementer-eigenen
      Block; dessen Whitelist bleibt unverändert

## 4. Nachtrag aus der Gegenprobe

- [x] 4.1 **Die relative Form aus dem Worktree heraus fehlte.** Die erste Fassung kannte nur
      `.harness/runs/…`. Am echten Hook fiel auf: aus dem Arbeitsort der Rollen
      (cwd = `.harness/wt/<issue>`) heißt derselbe Pfad `../../runs/12/status.json` und kommt
      ohne das Wort `.harness` aus — der Zugriff lief durch. Beide Muster kennen jetzt beide
      Schreibungen; Requirement in `spec.md` präzisiert, Fälle in allen drei Wegprüfungen
      ergänzt, Mutationsprobe `relative-form-aus` belegt es. Gefunden hat das nicht der Entwurf,
      sondern die Gegenprobe an der laufenden Mechanik (4.2)

## 5. Abschluss

- [x] 5.1 `pnpm test:harness` (130 Tests), `pnpm typecheck` und `pnpm lint` grün
- [x] 5.2 **Gegenprobe am laufenden Guard** (`node .harness/guard.ts`, wie der Hook ihn startet),
      über alle vier Markerzustände: die im Issue protokollierten Aufrufe auf `status.json`,
      `jest.json` und `leak-degradations.log` je als Kommando und als Dateizugriff, dazu Grep im
      Run-Verzeichnis — für implementer, test-author und reviewer jetzt alle geblockt, jeder mit
      dem Run-State als Grund (`jest.json` **nicht** mehr mit der Testrunner-Begründung). Bei
      Marker `none` läuft alles durch; `active-role` bleibt lesbar und gegen Schreiben geschützt.
      Diese Probe hat 4.1 gefunden
- [x] 5.3 Mutationsproben: sieben Eingriffe (jede der drei Wegprüfungen einzeln, die
      Rollenmarker-Ausnahme, ihr Schreibschutz, die Reihenfolge aus D6 und die relative Form)
      machen je mindestens einen Test rot — **bei unveränderter Gesamtzahl von 130 Tests**, also
      an einer Zusicherung und nicht an einem Compile-Fehler. Der Eingriff
      `reihenfolge-hinter-#21` stellt den Fehler des ersten Anlaufs exakt wieder her und wird
      rot: der Zufallstreffer auf `jest.json` trägt den Test diesmal nicht
- [x] 5.4 `guard.ts` ist type-stripping-tauglich geblieben (Issue #29: kein `enum`, keine
      lokalen Importe) — `.harness/tests/hook.test.ts` deckt es ab und läuft in 5.1 mit
- [ ] 5.5 Reviewer-Subagent auf den Change ansetzen (`constitution.md` §3.3)
- [ ] 5.6 Menschliche Freigabe einholen (§3.4 — kein App-Test, der Change berührt keinen
      Anwendungscode; geprüft wird die Gegenprobe aus 5.2)
- [ ] 5.7 Change nach `openspec/changes/archive/YYYY-MM-DD-block-run-state-access/` verschieben
      **und die Capability nach `openspec/specs/` übernehmen** (beides im selben
      Branch/Commit-Bereich), dann PR mit `Closes #34` öffnen; menschlicher Merge
