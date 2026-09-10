## Why

Das Gate (`pnpm harness gate <issue>`) fährt Typecheck, Lint und die Jest-Suite, aber
ausgewertet wird nur `jest.json`. Drei Lücken haben im Lauf zu #13 (PR #43) und #6 (PR #47)
zusammen drei Pausen und zwei verbrauchte Runden gekostet:

**1. Rot ohne Grund.** Fällt der Volllauf an `pnpm typecheck` oder `pnpm lint`, steht im
Run-State `lastGate.failures: []`, und `buildImplPrompt` liefert dem implementer nur
„Gate: rot". Bei #13: Jest 39/39 grün, Lint grün, `typecheck:src` grün — und niemand konnte
sagen, warum das Gate rot ist, bis der Mensch pausiert und `pnpm typecheck` selbst gefahren hat.

**2. Testseitige Fehler laufen zum implementer.** `tsconfig.json` schließt `tests/**` ein und
`eslint .` ebenso. Ein Typ- oder Lint-Fehler in einer Testdatei macht das Gate rot, und `next()`
schickt jedes rote Gate als `invoke-implementer` — an die Rolle, die Tests weder lesen noch
ändern darf. Der Automat kennt keinen Weg zum test-author außer über Reviewer-Findings. Bei
#13: eine Implementer-Runde, in der es nichts zu tun gab (zwei Importe ohne `.js`-Endung in
`tests/`), plus eine Pause für die Korrektur.

**3. Jest-Fehler außerhalb von `failureMessages`.** Ein Typfehler, den nur ts-jest sieht
(`moduleResolution: node` gegenüber NodeNext im Projekt), lässt jede Integrationssuite beim Laden
des Server-Moduls sterben. Jest schreibt dafür **leere** `failureMessages`; der Fehler steht
ausschließlich in `failureDetails` (ein `TSError` mit `diagnosticText`). `parseJestFailures`
liest nur `failureMessages` und lieferte bei #6 dem implementer 62 Szenarionamen ohne eine
einzige Fehlerzeile. Derselbe Effekt entsteht, wenn eine Suite gar nicht erst lädt: dann steht
der Grund in `testResults[].message`, `assertionResults` ist leer, und `failures` bleibt `[]`.

Alle drei verletzen `constitution.md` §8.2 G3: das Fehler-Feedback soll aus der geparsten
Gate-Ausgabe stammen — und dazu gehört die Ausgabe *aller* drei Werkzeuge, nicht nur die von
Jest. Und §8.1: die Zuordnung „testbezogen → test-author" ist für Review-Findings mechanisch
(`reviewRework`), für Gate-Befunde aber nicht — dort entschied bisher der Mensch in der Pause.

Issue #44, Punkte 1, 2 und 5. Nach `constitution.md` §1.4 eigener Branch, eigener PR, kein
Anwendungscode. Die Punkte 3, 4, 6, 7 und 8 desselben Issues folgen in eigenen Changes.

## What Changes

- **Typecheck- und Lint-Ausgabe werden geparst und im Run-State abgelegt** (`lastGate.tools`):
  je Befund Werkzeug, Datei (worktree-relativ, Forward-Slashes) und die Meldung. tsc liefert
  Textzeilen mit festem Format, ESLint schreibt per `--format json` in den Run-State — beides
  ohne Roh-Ausgabe im Prompt.
- **Der Auftrag an den implementer enthält die Befunde außerhalb von `tests/` vollständig**
  (Pfad, Zeile, Meldung) und die Befunde unter `tests/` **nur als Zählung** („N Typfehler und
  M Lint-Fehler in Testdateien") — dieselbe Grenze wie bei `parseJestFailures`. Der
  Leak-Wächter gilt auch für diese Zeilen: nennt eine Meldung eine Testdatei, wird sie
  zurückgehalten, nicht der Lauf blockiert.
- **Ein Gate, das ausschließlich wegen Testdateien rot ist, geht an den test-author.** Ist
  Jest grün und liegt jeder Typecheck-/Lint-Befund unter `tests/`, emittiert `next()`
  `invoke-test-author-rework` statt `invoke-implementer`; der test-author-Auftrag trägt die
  Befunde vollständig. Der Rundenzähler zählt wie bei jeder Nacharbeit (§3.5).
- **`parseJestFailures` liest zusätzlich `failureDetails` und die Suite-Meldung.** Ein
  `TSError` wird über seinen `diagnosticText` zum Feedback (Pfad unter `src/`, Zeile, Diagnose);
  eine Suite, die nicht lädt, ergibt einen Befund mit ihrer Meldung. Beides läuft durch
  dieselbe Kürzung und denselben Leak-Wächter wie bisher.
- **Ob Jest grün war, steht explizit im Run-State** (`lastGate.jestGreen`), statt aus einer
  leeren Failure-Liste geraten zu werden — eine leere Liste kann auch heißen, dass Jest rot war
  und nichts Auswertbares hinterließ.

## Capabilities

### New Capabilities
- `harness-gate-feedback`: Was ein rotes Gate an wen meldet. Die Capability regelt, dass jede
  der drei Gate-Quellen (Typecheck, Lint, Jest) einen Befund liefert, wie die Befunde nach
  Pfadbereich der Rolle zugeordnet werden, und dass ein rein testseitiges Rot an den
  test-author geht.

### Modified Capabilities
- keine. Das bestehende Verhalten der Jest-Auswertung (Kürzung am Codeframe, Degradierung
  bei Leak) bleibt unverändert und wird um zwei Quellen erweitert; es ist bisher in keiner
  Capability spezifiziert (es entstand mit der Blaupause vor dem ersten OpenSpec-Change) und
  wird hier nicht nachträglich verspeckt.

## Impact

- `.harness/orchestrator.ts`: `gate`, `next` (Fall `gate`), `parseJestFailures`,
  `buildImplPrompt`, `buildTestReworkPrompt`, Typ `Status.lastGate`
- `.harness/tests/orchestrator.test.ts`
- `.claude/skills/feature-loop/SKILL.md`: der Satz, dass ein rotes Gate immer zum implementer
  geht, wird um den testseitigen Fall ergänzt
- Kein Anwendungscode (`constitution.md` §1.4)
- Keine neuen Dependencies (`--format json` ist ESLint-Bordmittel)

**Nicht im Umfang:**
- **Kein zweiter tsc-Lauf mit commonjs/node-Auflösung** (Vorschlag aus Issue #44, Punkt 5,
  zweiter Absatz). Er würde die Typecheck-Zeit jeder Gate-Runde verdoppeln und eine eigene
  tsconfig-Variante brauchen — für eine Information, die der Jest-Lauf über `failureDetails`
  ohnehin liefert. Entscheidung des Menschen vom 2026-09-10.
- **Ein ts-jest-Typfehler, der nur `tests/` betrifft**, erreicht den implementer weiterhin
  als zurückgehaltener Jest-Befund (die Diagnose nennt die Testdatei). tsc sieht ihn nicht
  (NodeNext), also greift die neue Route nicht. Der Fall ist bisher nicht aufgetreten und
  bleibt Sache der Pause.
- **Befunde außerhalb von `src/`, `prisma/` und `tests/`** (etwa ein Lint-Fehler in
  `eslint.config.js`) gehen wie bisher an den implementer. Keine Rolle kann sie beheben; dass
  das Gate dann bis zur Eskalation rot bleibt, ist der bestehende Weg zum Menschen und wird
  hier nicht verändert.
