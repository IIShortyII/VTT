## Why

`.harness/runs/<issue>/` trägt den **ungefilterten** Zustand eines Laufs:

- `jest.json` — die rohe Jest-Ausgabe: Codeframes, absolute Testpfade, vollständige
  Matcher-Meldungen
- `status.json` — die geparsten Failures, dazu `rounds[].geänderte_dateien` (gespeist aus
  `tests_geschrieben` des test-author) und `lastReview.findings` mit test-scoped `ort`-Angaben
- `leak-degradations.log`, `ESCALATION.md`, `rejected-review.json`

Der Orchestrator filtert all das sorgfältig, bevor es in einen Auftrag geht —
`assertNoTestLeak`, `parseJestFailures`, `formatRoundsHistory`. Die **Quelle** ist den Rollen
aber nicht gesperrt: `isTest()` matcht auf diesen Pfaden nicht, denn das Verzeichnis heißt
`runs`, nicht `tests`.

Am laufenden Guard nachgestellt (Issue #34):

```
false  implementer  cat .harness/runs/12/status.json
true   implementer  cat .harness/runs/12/jest.json   | "implementer führt die Testsuite nicht selbst aus"
false  implementer  cat .harness/runs/12/leak-degradations.log
false  test-author  cat .harness/runs/12/status.json
false  test-author  Grep in .harness/runs/12
```

`jest.json` wird nur deshalb geblockt, weil `TEST_RUNNER_COMMANDS` (`\b(jest|vitest|mocha|ava)\b`)
zufällig auf den **Dateinamen** matcht — mit einer Begründung, die nichts mit dem Run-State zu
tun hat. Jeder andere Dateiname dort ist offen.

Der Befund ist nicht theoretisch: das `status.json` des Laufs zu #12 enthält zehn Nennungen von
Testpfaden — genau das, was `formatRoundsHistory` und `buildImplPrompt` herausfiltern.
`constitution.md` §2.2 verbietet dem implementer, Testdateien zu sehen; §8.1 verlangt, dass
solche Invarianten als Mechanik im Code liegen. Solange die Quelle lesbar ist, ist jede
Filterung an der Ausgabe Zierrat: wer sie lesen darf, braucht das Aufbereitete nicht.

## What Changes

- **Neu: ein Prädikat `isRunState` in `.harness/guard.ts`** und ein Kommando-Muster daneben.
  `isTest()` zu erweitern wäre irreführend — das Run-Verzeichnis enthält keine Tests, sondern
  deren Ausgabe. Das Paar aus Pfad- und Kommando-Form entspricht dem vorhandenen
  `CONTROL_FILE_TABOO`/`CONTROL_VERB_TABOO`.
- **Alle drei Wege werden geschlossen**, für **jede** geltende Rolle:
  1. Dateizugriff über `file_path` (Read/Write/Edit) — bisher offen
  2. Shell-Kommandos, die den Run-State nennen — bisher offen (außer dem Zufallstreffer auf
     `jest.json`)
  3. Suchwerkzeuge (Grep/Glob) über `path`/`glob`/`pattern` — die Prüfung galt bisher nur für
     den implementer, und dort nur auf Testpfade
- **Gesperrt ist jede Rolle, nicht nur implementer und test-author.** Dieselbe Mechanik wie beim
  Steuerdatei- und Worktree-Tabu, die ebenfalls für jede Rolle gelten. Der reviewer bekommt
  seinen Auftrag vom Orchestrator; im Run-State fände er die Urteile der vorherigen Runden
  (`lastReview.findings`, `rejected-review.json`), die sein eigenes vorprägen würden.
- **Der Rollenmarker `active-role` bleibt über `file_path` lesbar.** `constitution.md` §8.3
  verlangt seine Prüfung *vor* jedem Werkzeugaufruf eines Schritts; eine pauschale Sperre würde
  genau diese Prüfung blocken. Er trägt ein einziges Wort aus einer festen Rollenmenge und kann
  nichts preisgeben. Geschrieben bleibt er durch `CONTROL_FILE_TABOO` geschützt.
- **Ohne geltende Rolle ändert sich nichts.** Die orchestrierende Sitzung arbeitet mit dem
  Run-State, und der Mensch muss ihn einsehen können.

**Unverändert:** Zustandsautomat, Rundenzähler, Gate-Reihenfolge, Rollenrouting, alle
bestehenden Sperren. Die Regel ist ausschließlich zusätzlich — was heute geblockt wird, wird
auch danach geblockt.

**Nicht im Umfang:**
- **Eine rollenlose Inhaltssuche ohne einschränkenden Pfad** bleibt für test-author und reviewer
  möglich und könnte den Run-State erfassen, ohne ihn zu nennen. Sie zu schließen hieße, für
  beide Rollen eine positive Pfad-Whitelist einzuführen, wie sie der implementer hat — und für
  den reviewer, der den gesamten Diff beurteilen muss, ist diese Whitelist „alles". Der Rest
  wäre eine Regel, die nichts einschränkt. Für den implementer, den §2.2 tatsächlich schützt,
  ist der Weg durch seine bestehende Whitelist bereits geschlossen; für die beiden anderen
  Rollen geht es um die weicheren §2.1-Gründe (Tests gegen die Spec, nicht gegen die
  Implementierung) und um die Unabhängigkeit des Urteils. Diese Grenze steht auch in der
  `design.md` und wird nicht als geschlossen ausgegeben.
- **Die Bash-Sperre unterscheidet nicht zwischen Lesen und Schreiben.** Ein Kommandotext lässt
  das nicht erkennen (`sed -i`, `>`, `truncate`, `chmod` sehen aus wie ein Zugriff). Der
  Rollenmarker ist über Bash deshalb weiterhin vollständig tabu — er war es schon vor diesem
  Change, durch `CONTROL_FILE_TABOO`. Die §8.3-Prüfung läuft über das Read-Werkzeug.
- **Die Ausgabe der Harness-Verben.** `pnpm harness next` gibt kompakten Status zurück; was
  dort hineingehört, regelt §8.2 G4 und nicht diese Sperre.

## Capabilities

### New Capabilities
- `harness-run-state-access`: Wer den ungefilterten Run-State eines Laufs lesen darf, über
  welche Wege der Zugriff geschlossen ist, und welche Ausnahme der Rollenmarker bildet.

### Modified Capabilities
Keine. `harness-role-marker` beschreibt, *wann* ein Lauf eine Rolle beansprucht;
`harness-spec-delivery` beschreibt, was in einen Auftrag darf. Beide bleiben wörtlich gültig —
die neue Capability beantwortet die dritte Frage: was eine Rolle sich **selbst** holen kann.

## Impact

- `.harness/guard.ts` (neues Prädikat, neue Muster, Erweiterung der Regeln 0, 1 und 2),
  `.harness/tests/guard.test.ts`
- Kein Anwendungscode (`constitution.md` §1.4)
- Keine neuen Dependencies
- **Wirkung auf laufende Feature-Läufe:** Keine, solange die Rollen den Run-State nicht anfassen
  — sie haben keinen vorgesehenen Grund dazu, alles Nötige kommt gefiltert über den Auftrag.
- **Wirkung auf die orchestrierende Sitzung:** Der Guard kann sie nicht von einem Subagenten
  unterscheiden; solange ein Marker eine Rolle trägt, gilt diese über den `soleActiveRole`-
  Fallback auch für ihre eigenen Aufrufe. Sie kommt in dieser Zeit also ebenfalls nicht an den
  Run-State — und das ist die Absicht: §8.2 G4 sieht vor, dass der Orchestrator „nur kompakten
  Status" liest, und den liefern die Verben. In den rollenlosen Phasen (`gate`, `app-review`,
  `done`, `archived`, `escalated`) und während einer Pause bleibt ihr der Run-State offen — dort
  liegt auch die `ESCALATION.md`, die sie dem Menschen aufbereitet. Ihre §8.3-Prüfung des
  Rollenmarkers ist zu jeder Zeit freigegeben.
