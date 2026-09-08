> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/orchestrator.test.ts` um die acht Szenarien aus
      `specs/harness-path-matching/spec.md` ergänzen, je einen Test pro Szenario:
      „Eine Nennung mit Forward-Slashes wird erkannt", „Der bloße Dateiname gilt als Nennung",
      „Ein Name, der auf keine Testdatei des Laufs passt, hält den Lauf nicht an",
      „Eine Gate-Ausgabe, die eine Testdatei beim Namen nennt, wird degradiert", „Der Name einer Hilfsdatei zählt nur mit Pfadanteil", „Getrackte
      Propose-Originale bleiben erhalten", „Untrackte Propose-Originale werden aufgeräumt"
- [x] 1.2 Für die beiden Git-Szenarien einen Stellvertreter-Runner (`Sh`) einsetzen, der die
      abgesetzten Kommandos festhält und die Antwort von `git ls-files` vorgibt — geprüft wird
      die **Form der Pfadspezifikation** und die daraus folgende Entscheidung, nicht Git selbst.
      `seedChangeDocs`/`removeUntrackedSourceDocs` dafür so weit öffnen, wie der Test es braucht
- [x] 1.3 Rot bestätigen (§3.1): `pnpm test:harness` — die neuen Fälle scheitern an der
      erwarteten Zusicherung (ausbleibender Abbruch, ausbleibende Degradierung, gelöschte
      Dateien trotz getrackt, Backslash im Pathspec), nicht an einem Import- oder Compile-Fehler

## 2. Der gemeinsame Erkenner

- [x] 2.1 Funktion in `.harness/orchestrator.ts` anlegen, die zu einem Text die genannte
      Testdatei liefert (design.md D1): für jede Datei aus `listTestFiles` die Formen aus D2 —
      Pfad wie vorliegend, mit Forward-Slashes, worktree-relativ in beiden Schreibweisen,
      bloßer Dateiname. Case-sensitiv (D3). Rückgabe ist die gefundene Datei, nicht nur ein
      Wahrheitswert — `assertNoTestLeak` braucht sie für seine Meldung
- [x] 2.2 `assertNoTestLeak` auf den Erkenner setzen; Wirkung unverändert (Abbruch, Meldung mit
      Fundstelle aus #22); verifizieren mit den drei Szenarien zur Erkennung
- [x] 2.3 `parseJestFailures` auf denselben Erkenner setzen; Wirkung unverändert (Degradierung
      des einzelnen Failure, Protokollzeile); verifizieren mit dem Szenario zur Gate-Ausgabe.
      Das Inhalts-Matching gegen `sourceLikeFiles` bleibt davon unberührt

## 3. Die Pfadspezifikation an Git

- [x] 3.1 `removeUntrackedSourceDocs` bildet den Pathspec mit Forward-Slashes (D4); der native
      Pfad bleibt für `existsSync`/`rmSync`; verifizieren mit den beiden Git-Szenarien

## 4. Nachtrag aus der Gegenprobe

Beides ist am echten Material aufgefallen, nicht im Entwurf — und beides ist eingearbeitet.

- [x] 4.1 **Die Degradierung trug den Leak weiter.** Ein degradierter Gate-Failure gab die
      Kurzform zurück, also die erste Zeile — und genau dort steht die Nennung, wenn Jest sie
      in die Kopfzeile schreibt (`Cannot find module './x' from 'y.unit.test.tsx'`). Eine
      Kurzform, die den Leak mitnimmt, ist keine Degradierung. Sie wird jetzt vollständig
      zurückgehalten und der Vorgang benannt; Requirement in `spec.md` ergänzt
- [x] 4.2 **Der bloße Name schlug auf Hilfsdateien an.** `listTestFiles` liefert auch
      `tests/.gitkeep`, und `.gitkeep` steht in der `proposal.md` von `add-user-auth`
      (»`src/` enthält heute nur `.gitkeep`«) — der Auftrag wäre angehalten worden, ohne dass
      etwas preisgegeben war. Der bloße Name zählt jetzt nur für erkennbare Testdateien; für
      Fixtures, Mocks und Platzhalter zählt erst die Nennung mit Pfadanteil. Szenario „Der Name
      einer Hilfsdatei zählt nur mit Pfadanteil" ergänzt
- [x] 4.3 Beide Nachträge sind das Ergebnis von Aufgabe 5.2 — die Gegenprobe an echtem Material
      ist damit nicht Bestätigung am Ende, sondern der Schritt, der den Change korrigiert hat

## 5. Abschluss

- [x] 5.1 `pnpm test:harness`, `pnpm typecheck` und `pnpm lint` grün
- [x] 5.2 Gegenprobe am echten Material: einen Auftrag bauen lassen, dessen `design.md` eine
      existierende Testdatei einmal als `tests/<name>` und einmal nur mit dem Dateinamen nennt —
      beide Male Abbruch mit Fundstellenangabe; danach ohne die Nennung: Durchlauf
- [x] 5.3 Mutationsproben: sieben Eingriffe (Erkenner abgeschaltet, Dateinamen-Form entfernt,
      Hilfsdatei-Ausnahme entfernt, Pathspec zurückgedreht, Rückhalt abgeschaltet, beide
      Wächter auf den alten Vergleich zurückgesetzt) machen je mindestens einen Test rot —
      Nachweis, dass die Zusicherungen greifen statt nur grün zu sein
- [ ] 5.4 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe aus 5.2)
- [ ] 5.5 Change nach `openspec/changes/archive/` verschieben **und die Capability nach
      `openspec/specs/` übernehmen** (beides im selben Branch/Commit-Bereich — der Sync wurde
      bei #22 vergessen und musste nachgetragen werden), dann PR mit `Closes #21` öffnen;
      menschlicher Merge
