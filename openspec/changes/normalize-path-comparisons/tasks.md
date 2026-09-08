> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [ ] 1.1 `.harness/tests/orchestrator.test.ts` um die sechs Szenarien aus
      `specs/harness-path-matching/spec.md` ergänzen, je einen Test pro Szenario:
      „Eine Nennung mit Forward-Slashes wird erkannt", „Der bloße Dateiname gilt als Nennung",
      „Ein Name, der auf keine Testdatei des Laufs passt, hält den Lauf nicht an",
      „Eine Gate-Ausgabe, die eine Testdatei beim Namen nennt, wird degradiert", „Getrackte
      Propose-Originale bleiben erhalten", „Untrackte Propose-Originale werden aufgeräumt"
- [ ] 1.2 Für die beiden Git-Szenarien einen Stellvertreter-Runner (`Sh`) einsetzen, der die
      abgesetzten Kommandos festhält und die Antwort von `git ls-files` vorgibt — geprüft wird
      die **Form der Pfadspezifikation** und die daraus folgende Entscheidung, nicht Git selbst.
      `seedChangeDocs`/`removeUntrackedSourceDocs` dafür so weit öffnen, wie der Test es braucht
- [ ] 1.3 Rot bestätigen (§3.1): `pnpm test:harness` — die neuen Fälle scheitern an der
      erwarteten Zusicherung (ausbleibender Abbruch, ausbleibende Degradierung, gelöschte
      Dateien trotz getrackt, Backslash im Pathspec), nicht an einem Import- oder Compile-Fehler

## 2. Der gemeinsame Erkenner

- [ ] 2.1 Funktion in `.harness/orchestrator.ts` anlegen, die zu einem Text die genannte
      Testdatei liefert (design.md D1): für jede Datei aus `listTestFiles` die Formen aus D2 —
      Pfad wie vorliegend, mit Forward-Slashes, worktree-relativ in beiden Schreibweisen,
      bloßer Dateiname. Case-sensitiv (D3). Rückgabe ist die gefundene Datei, nicht nur ein
      Wahrheitswert — `assertNoTestLeak` braucht sie für seine Meldung
- [ ] 2.2 `assertNoTestLeak` auf den Erkenner setzen; Wirkung unverändert (Abbruch, Meldung mit
      Fundstelle aus #22); verifizieren mit den drei Szenarien zur Erkennung
- [ ] 2.3 `parseJestFailures` auf denselben Erkenner setzen; Wirkung unverändert (Degradierung
      des einzelnen Failure, Protokollzeile); verifizieren mit dem Szenario zur Gate-Ausgabe.
      Das Inhalts-Matching gegen `sourceLikeFiles` bleibt davon unberührt

## 3. Die Pfadspezifikation an Git

- [ ] 3.1 `removeUntrackedSourceDocs` bildet den Pathspec mit Forward-Slashes (D4); der native
      Pfad bleibt für `existsSync`/`rmSync`; verifizieren mit den beiden Git-Szenarien

## 4. Abschluss

- [ ] 4.1 `pnpm test:harness`, `pnpm typecheck` und `pnpm lint` grün
- [ ] 4.2 Gegenprobe am echten Material: einen Auftrag bauen lassen, dessen `design.md` eine
      existierende Testdatei einmal als `tests/<name>` und einmal nur mit dem Dateinamen nennt —
      beide Male Abbruch mit Fundstellenangabe; danach ohne die Nennung: Durchlauf
- [ ] 4.3 Mutationsproben: der Erkenner ohne Forward-Slash-Form und ohne Dateinamen-Form macht
      je mindestens einen Test rot (Nachweis, dass die Zusicherungen greifen statt nur grün zu
      sein)
- [ ] 4.4 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe aus 4.2)
- [ ] 4.5 Change nach `openspec/changes/archive/` verschieben **und die Capability nach
      `openspec/specs/` übernehmen** (beides im selben Branch/Commit-Bereich — der Sync wurde
      bei #22 vergessen und musste nachgetragen werden), dann PR mit `Closes #21` öffnen;
      menschlicher Merge
