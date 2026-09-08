> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/orchestrator.test.ts` um die acht Szenarien aus
      `specs/harness-path-matching/spec.md` ergänzen, je einen Test pro Szenario:
      „Eine Nennung mit Forward-Slashes wird erkannt", „Der bloße Dateiname gilt als Nennung",
      „Ein Name, der auf keine Testdatei des Laufs passt, hält den Lauf nicht an",
      „Eine Gate-Ausgabe, die eine Testdatei beim Namen nennt, wird degradiert", „Der Name einer Hilfsdatei zählt nur mit Pfadanteil", „Auch die Rückfallform nach
      vollständigem Kürzen wird geprüft", „Getrackte
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
- [x] 4.3 Beide Nachträge sind das Ergebnis von Aufgabe 6.2 — die Gegenprobe an echtem Material
      ist damit nicht Bestätigung am Ende, sondern der Schritt, der den Change korrigiert hat

## 5. Nacharbeit Runde 1 (Reviewer-Befunde)

- [x] 5.1 **Block:** Der Fallback `trimmed || firstErrorLine(raw)` in `parseJestFailures` lief
      am Wächter vorbei. Bei `Cannot find module './x' from 'tests/y.test.ts'` schneidet
      `truncateAtTestReference` bei Zeile 0 ab, `leakt('')` ist falsch — und der Rückfall holt
      genau die Zeile mit dem Testpfad ungeprüft zurück. Der Code bildet jetzt erst den
      Kandidaten und prüft ihn; Requirement und Szenario „Auch die Rückfallform nach
      vollständigem Kürzen wird geprüft" ergänzt, design.md D5 umgeschrieben — sie behauptete,
      eine Nennung mit Pfadanteil sei „längst abgeschnitten"
- [x] 5.2 Die Backslash-Form der Pfadnennung wird literal gebildet statt über `sep`: auf einem
      Linux-Läufer wäre `sep === '/'`, das `Set` hätte dedupliziert und die Form wäre entfallen
      — obwohl die `design.md`-Dateien dieses Repos auf Windows entstehen
- [x] 5.3 `scopeOfFinding` benutzt `fwd` statt einer eigenen Ersetzung — dieselbe Dopplung,
      gegen die D1 argumentiert. `guard.ts` behält sein `norm()` (eigenes Skript, eigener
      Prozess, kein Import); das steht jetzt in der proposal.md unter „Nicht im Umfang"
- [x] 5.4 Das Zurückhalten meldet sich auf stderr, nicht nur im Protokoll: es kostet den
      implementer sein Feedback, während der Rundenzähler nach §3.5 weiterläuft, und
      `leak-degradations.log` liest niemand von allein. Dazu `appendFileSync` statt
      read-modify-write
- [x] 5.5 Drei Tests sicherten weniger zu als ihr Szenarioname: der Hilfsdatei-Test prüfte nur
      `warf` (jede Exception hätte gereicht) — jetzt auch den Grund; der Forward-Slash-Test lief
      an einer `.test.ts`, deren bloßer Name schon trifft — jetzt an einer Hilfsdatei, wo der
      Treffer wirklich an der Pfadform hängt, samt Backslash-Fall; der Pathspec-Test war
      plattformabhängig — jetzt mit literalem Backslash-Pfad, und ohne Verzeichnisse im
      Arbeitsbaum anzulegen
- [x] 5.6 Neun Mutationsproben statt sieben, jede macht mindestens einen Test rot — darunter
      eine, die den Block-Befund exakt wiederherstellt (`leakt(trimmed)` statt `leakt(kandidat)`)

## 6. Abschluss

- [x] 6.1 `pnpm test:harness`, `pnpm typecheck` und `pnpm lint` grün
- [x] 6.2 Gegenprobe am echten Material: einen Auftrag bauen lassen, dessen `design.md` eine
      existierende Testdatei einmal als `tests/<name>` und einmal nur mit dem Dateinamen nennt —
      beide Male Abbruch mit Fundstellenangabe; danach ohne die Nennung: Durchlauf
- [x] 6.3 Mutationsproben: neun Eingriffe (Erkenner abgeschaltet, Dateinamen-Form entfernt,
      Hilfsdatei-Ausnahme entfernt, Pathspec zurückgedreht, Rückhalt abgeschaltet, beide
      Wächter auf den alten Vergleich zurückgesetzt) machen je mindestens einen Test rot —
      Nachweis, dass die Zusicherungen greifen statt nur grün zu sein
- [ ] 6.4 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe aus 6.2)
- [ ] 6.5 Change nach `openspec/changes/archive/` verschieben **und die Capability nach
      `openspec/specs/` übernehmen** (beides im selben Branch/Commit-Bereich — der Sync wurde
      bei #22 vergessen und musste nachgetragen werden), dann PR mit `Closes #21` öffnen;
      menschlicher Merge
