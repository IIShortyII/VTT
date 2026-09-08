> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [ ] 1.1 `.harness/tests/setup.ts` anlegen, das `HARNESS_BOARD=off` setzt, und in
      `.harness/jest.config.cjs` als `setupFiles` eintragen (design.md D7); verifizieren mit
      `pnpm test:harness` — die bestehenden Tests laufen unverändert grün
- [ ] 1.2 `.harness/tests/board.test.ts` anlegen mit den Szenarien aus
      `specs/harness-board-status/spec.md`, die das Modul allein betreffen: „Ein Statuswechsel
      schreibt nur das Statusfeld" (Stellvertreter-Runner hält die Argumente fest: genau ein
      schreibender Aufruf, feste Projekt- und Feld-ID, keine Item-Erzeugung), „Ein unbekanntes
      Statuswort führt zu keinem Schreibzugriff", „Ein fehlgeschlagener Zugriff wird gemeldet
      und protokolliert" (wirft nicht, stderr, Zeile in `board.log`), „Ein fehlendes Item wird
      gemeldet, ohne Schreibversuch"; verifizieren mit `pnpm test:harness` — die neuen Fälle
      sind rot
- [ ] 1.3 `.harness/tests/orchestrator.test.ts` um die Szenarien ergänzen, die die
      Aufrufstellen betreffen: „Jeder Einstieg in einen Implementierungsschritt setzt
      Implementierung" (erste Implementierung **und** Nacharbeit über `reworkTo` in einem
      Test), „Die Ankündigung des App-Tests setzt App-Test (Mensch)", „Der Gate-Start setzt
      Gate + Review" (vor den Werkzeugaufrufen), „Bestätigtes Rot setzt Test rot", „Rot aus dem
      falschen Grund schaltet das Board nicht weiter", „Aufräumen nach dem Merge setzt Fertig",
      „Aufräumen bei noch offenem Issue setzt Fertig nicht", „Der Zustandsautomat verhält sich
      mit und ohne Board identisch"; verifizieren mit `pnpm test:harness` — die neuen Fälle
      sind rot
- [ ] 1.4 Prüfen, dass das Rot aus dem richtigen Grund kommt (§3.1): die Fehlschläge nennen
      die erwartete Zusicherung (fehlender Board-Aufruf, fehlendes Verb), nicht einen
      Import-/Compile-Fehler eines noch nicht existierenden Moduls — solange `board.ts` fehlt,
      zählt allein der fehlende Export als gültiges Rot

## 2. Das Board-Modul

- [ ] 2.1 `.harness/board.ts` anlegen: ID-Tabelle nach design.md D8 (Projekt, Statusfeld,
      sieben Optionen, Owner/Repository) mit dem Kommentar, der ihre Herkunft erklärt;
      verifizieren durch Abgleich der IDs mit `gh project field-list 3 --owner IIShortyII`
- [ ] 2.2 Auflösung des Item-Handles nach design.md D5 ergänzen (GraphQL-Query, Auswahl des
      Knotens mit passender Projekt-ID, kein Cache); verifizieren mit dem Testfall „Ein
      fehlendes Item wird gemeldet, ohne Schreibversuch"
- [ ] 2.3 `setBoardStatus` mit Statuswort→Option-Tabelle, Mutation aus festen Konstanten,
      injizierbarem Runner und `execFileSync` samt 10-Sekunden-Timeout umsetzen (D1, D5);
      verifizieren mit den Testfällen „Ein Statuswechsel schreibt nur das Statusfeld" und „Ein
      unbekanntes Statuswort führt zu keinem Schreibzugriff"
- [ ] 2.4 Fehlerkapselung und Protokoll nach design.md D6 ergänzen (nie werfen, `[board]` auf
      stderr, Zeile mit Zeitstempel in `.harness/runs/<issue>/board.log`, Verzeichnis bei
      Bedarf anlegen, Erfolg ebenso protokollieren) sowie den Kill-Switch aus D7;
      verifizieren mit dem Testfall „Ein fehlgeschlagener Zugriff wird gemeldet und
      protokolliert"

## 3. Die Aufrufstellen im Orchestrator

- [ ] 3.1 Aktions→Status-Tabelle in `emit()` ergänzen (`invoke-implementer` →
      Implementierung, `present-app-review` → App-Test) nach design.md D2; verifizieren mit
      den Testfällen zu Implementierungsschritt und App-Test-Ankündigung — beide Einstiegs­
      punkte je Aktion
- [ ] 3.2 `gate()` setzt „Gate + Review" als erste Anweisung, vor Typecheck/Lint/Testlauf
      (D3); verifizieren mit dem Testfall „Der Gate-Start setzt Gate + Review"
- [ ] 3.3 `confirmRed()` setzt „Test rot" ausschließlich im Zweig `red === true` (§3.1);
      verifizieren mit den beiden Testfällen zum bestätigten und zum nicht bestätigten Rot
- [ ] 3.4 `cleanup()` setzt „Fertig" nur bei geschlossenem Issue, mit Abfrage des
      Issue-Zustands und Fehlerverhalten nach D4/D6; verifizieren mit den beiden Testfällen
      zum Aufräumen bei geschlossenem und bei offenem Issue
- [ ] 3.5 Verb `board <issue> <status>` im Dispatch ergänzen — ohne Zugriff auf `status.json`
      (D2); verifizieren mit `HARNESS_BOARD=off pnpm harness board 26 spec` (läuft ohne
      Run-Verzeichnis durch) und anschließend echt mit `pnpm harness board 26 spec`, danach
      Kontrolle auf dem Board

## 4. Dokumentation der Naht

- [ ] 4.1 `AGENTS.md`: unter „Kommandos" das Verb `pnpm harness board <issue> <status>`
      aufnehmen, einen Abschnitt zum Board-Status ergänzen (welcher Schritt welchen Status
      setzt, Kill-Switch `HARNESS_BOARD=off`, `board.log`) und die Grenze des Schreibzugriffs
      nach §5.3 benennen; verifizieren durch Gegenlesen gegen
      `specs/harness-board-status/spec.md`
- [ ] 4.2 `.claude/skills/feature-loop/SKILL.md`: die Zeile ergänzen, dass die Session zu
      Beginn der Spezifikation `pnpm harness board <issue> spec` ruft — vor
      `pnpm harness start`; verifizieren durch Gegenlesen gegen design.md D2

## 5. Abschluss

- [ ] 5.1 `pnpm test:harness` und `pnpm lint` grün
- [ ] 5.2 Gegenprobe am echten Board: einen Statuswechsel für Issue #26 auslösen und das
      Ergebnis auf Project 3 kontrollieren; danach prüfen, dass ein Lauf mit unerreichbarem
      Board (etwa `PATH` ohne `gh`) dieselbe Aktion liefert und nur eine Zeile in `board.log`
      hinterlässt
- [ ] 5.3 Change nach `openspec/changes/archive/` verschieben (gleicher Commit-Bereich) und PR
      mit `Closes #26` öffnen; menschlicher Merge
