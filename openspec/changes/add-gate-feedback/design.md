## Context

`gate(i, run)` in `.harness/orchestrator.ts` fährt drei Unterprozesse im Worktree:

```ts
const tc   = run(`pnpm typecheck --incremental --tsBuildInfoFile "${tsBuildInfo}"`, wt)
const lint = run('pnpm lint', wt)
const test = run(`pnpm test --json --outputFile="${jestOut}"`, wt)
const green = tc.ok && lint.ok && test.ok
recordGateResult(s, green, green ? undefined : parseJestFailures(i))
```

Von `tc.out` und `lint.out` bleibt nichts übrig; der Run-State kennt nur `lastGate.green` und
die Jest-Failures. `next()` im Fall `gate` kennt für Rot genau einen Ausgang:

```ts
if (!s.lastGate.green) return reworkImplementer(s)
```

`parseJestFailures` liest pro fehlgeschlagenem Szenario `failureMessages`, kürzt am Codeframe
(`truncateAtTestReference`), prüft gegen Testpfade und -inhalt (`leakt`) und degradiert bei
Treffer auf die Erstzeile oder hält zurück. `failureDetails` und `testResults[].message`
werden nicht gelesen.

Die Rollen dürfen den Run-State nicht lesen (`harness-run-state-access`): was dort steht,
erreicht eine Rolle nur über den gebauten Auftrag. Das ist der Ort, an dem gefiltert wird.

Motivation: `proposal.md` — Why, Issue #44 (Punkte 1, 2, 5). Verhalten:
`specs/harness-gate-feedback/spec.md`.

## Goals / Non-Goals

**Goals:**
- Jede der drei Gate-Quellen hinterlässt einen auswertbaren Befund; „Gate: rot" ohne Zeile
  gibt es nicht mehr.
- Der implementer sieht Typecheck-/Lint-Befunde seines Bereichs vollständig und die
  testseitigen nur als Zählung.
- Ein Gate, das ausschließlich an Testdateien scheitert, geht mechanisch an den test-author.
- Jest-Befunde aus `failureDetails` und aus nicht ladbaren Suiten erreichen den implementer.

**Non-Goals:**
- Kein zweiter tsc-Lauf (siehe proposal.md, Nicht im Umfang).
- Keine Änderung an Kürzung und Leak-Regeln der Jest-Auswertung; sie werden wiederverwendet.
- Keine Änderung am Rundenzähler oder an der Eskalationsgrenze.

## Decisions

### D1 — Werkzeugausgabe wird geparst, nicht durchgereicht

G3 (`constitution.md` §8.2) verlangt Feedback *aus geparster Gate-Ausgabe*. Die Roh-Ausgabe
von tsc oder ESLint enthält Pfade unter `tests/`, und bei ESLint zusätzlich ANSI-Farbcodes und
absolute Worktree-Pfade. Deshalb entsteht aus beiden Werkzeugen eine Liste von Befunden:

```ts
export type ToolFailure = { tool: 'typecheck' | 'lint'; file?: string; message: string }
```

`file` ist worktree-relativ mit Forward-Slashes (die Vergleichsform aus
`harness-path-matching`), `message` die Zeile, wie das Werkzeug sie formuliert. Ein Befund
ohne `file` ist ein globaler Fehler des Werkzeugs (tsc-Optionsfehler, ESLint-Konfigurationsfehler)
und wird wie ein Befund außerhalb von `tests/` behandelt.

**tsc** schreibt `pfad(zeile,spalte): error TSnnnn: meldung`, mehrzeilige Meldungen eingerückt
darunter. Geparst wird zeilenweise; eingerückte Folgezeilen hängen am vorigen Befund. Zeilen,
die weder Pfadform noch `error TS` tragen (Zusammenfassung, leere Zeilen), entfallen. tsc gibt
Pfade relativ zum Aufrufverzeichnis und mit Forward-Slashes aus, auch unter Windows.

**ESLint** läuft mit `--format json --output-file <run-dir>/eslint.json`. Das JSON trägt je
Datei `filePath` (absolut) und `messages` mit `severity`, `line`, `column`, `ruleId`,
`message`. Nur `severity === 2` ist ein Befund — Warnungen machen `eslint .` nicht rot. Der
Pfad wird gegen das absolute Worktree-Verzeichnis relativiert. Die Datei liegt im Run-State,
nicht im Worktree, aus demselben Grund wie `jest.json`: kein Commit-Rauschen, und die Rollen
können sie nicht lesen. Wie `jest.json` wird sie vor dem Lauf entfernt, damit ein
abgestürzter ESLint keine Befunde der vorigen Runde hinterlässt. Meldet ESLint Rot, ohne dass
ein Befund mit `severity 2` vorliegt (Konfigurationsfehler, fehlende Datei), entsteht ein
globaler Befund aus der ersten nichtleeren Zeile der Ausgabe — dieselbe Erstzeilen-Form wie
bei degradierten Jest-Failures.

Warum nicht auch tsc per JSON? tsc kennt kein JSON-Format; `--pretty false` liefert das
maschinenlesbare Zeilenformat, das pnpm ohnehin ohne TTY erhält. Was pnpm um die Ausgabe
herum schreibt — die Skript-Kopfzeile (`$ tsc --noEmit`) und der Trailer (`[ELIFECYCLE]
Command failed …`) — ist keine Werkzeugausgabe und wird vor dem Parsen entfernt; sonst wäre
der Rückfall „erste Zeile der Ausgabe" die Kopfzeile.

### D2 — Ein Befund gehört der Rolle seines Pfads

Dieselbe Regel wie für Review-Findings (`scopeOfFinding`): `tests/` → test-author, alles
andere → implementer. Der `human`-Zweig von `scopeOfFinding` (Pfad außerhalb von `src/`,
`prisma/`, `tests/`) wird hier bewusst **nicht** übernommen: ein Review-Finding ohne Rolle
eskaliert sofort, weil ein Mensch es beurteilt hat; ein Gate-Befund in `vite.config.ts` ist
dagegen ein rotes Gate wie jedes andere und geht den bestehenden Weg (Implementer-Runde,
Eskalation nach §3.5). Zwei Regeln für „testbezogen" darf es trotzdem nicht geben — der
Test-Zweig ist derselbe Ausdruck (`/(^|\/)tests\//`), herausgezogen in eine Hilfsfunktion, die
`scopeOfFinding` mitbenutzt.

### D3 — Der implementer sieht Testbefunde als Zahl, nicht als Zeile

Eine tsc-Zeile nennt Pfad, Symbol und Quellzeile der Testdatei; eine ESLint-Zeile Pfad, Zeile
und Regel. Beides ist genau das Material, das `parseJestFailures` seit der Blaupause
zurückhält. Der Auftrag an den implementer nennt daher für `tests/`-Befunde nur die Zählung
je Werkzeug („2 Typfehler und 1 Lint-Fehler in Testdateien — nicht dein Bereich, behebt der
test-author") — damit er weiß, dass das Gate auch nach seiner Nacharbeit rot bleiben kann, und
warum. Ohne diesen Satz sähe er ein rotes Gate mit Befunden, die er alle behoben hat, und
hätte keinen Anhaltspunkt.

Der Leak-Wächter gilt auch für die vollständig genannten Zeilen: ein tsc-Befund in `src/` kann
eine Testdatei nennen (`error TS6059: File 'tests/x.test.ts' is not under 'rootDir'`). Derselbe
Erkenner wie in `parseJestFailures` (`leakt`) entscheidet, und die Wirkung ist dieselbe:
dieser eine Befund wird durch den Rückhalt-Hinweis ersetzt und im Protokoll vermerkt, der Lauf
läuft weiter. Dafür wird der Erkenner aus `parseJestFailures` in eine Funktion
`makeLeakDetector(i)` herausgezogen — zwei Aufrufer, eine Antwort (siehe
`harness-path-matching`, D1).

### D4 — Ausschließlich testseitiges Rot geht an den test-author

`next()` im Fall `gate` prüft vor `reworkImplementer`:

```
jestGreen === true  ∧  tools.length > 0  ∧  ∀ t ∈ tools: t.file unter tests/
```

Trifft das zu, läuft `reworkTo(s, 'rework-tests', 'invoke-test-author-rework', 'test-author')`
— derselbe Übergang wie bei rein testbezogenen Review-Findings, mit demselben Rundenverbrauch.
Der test-author-Auftrag (`buildTestReworkPrompt`) trägt die Befunde vollständig unter einer
eigenen Überschrift; `pendingTestFindings` bleibt leer, weil es keine Reviewer-Findings gibt.
`confirmTestRework` setzt danach wie bisher `lastGate` zurück und geht über `gate`.

Gemischte Befunde (`src/` und `tests/`) bleiben eine Implementer-Runde. Der implementer behebt
seinen Anteil; das nächste Gate ist dann — wenn er fertig ist — ausschließlich testseitig rot
und läuft in die test-author-Runde. Das kostet eine Runde mehr als ein gleichzeitiges Parken,
aber Parken setzt ein grünes Gate voraus (§3.3: „erst nach grünem Gate"), und ein Typfehler in
`tests/` lässt das Gate nicht grün werden. Die Reihenfolge ist damit deterministisch und ohne
neuen Zustand.

Jest rot und Testbefunde vorhanden: Implementer-Runde. Ein roter Jest-Lauf hat immer eine
Implementierungsseite, die zuerst dran ist.

### D5 — `jestGreen` steht explizit im Run-State

Die naheliegende Ableitung `failures.length === 0 ⇒ Jest grün` ist falsch: eine leere Liste
entsteht auch, wenn Jest rot war und nichts Auswertbares hinterließ (abgestürzter Prozess ohne
`jest.json` liefert zwar einen `gate`-Befund, eine Suite mit leerem `assertionResults` aber
bisher nichts). Genau dieser Fall ist Punkt 5 des Issues. `gate` schreibt daher `test.ok`
als `lastGate.jestGreen` — im Volllauf wie in der `--onlyFailures`-Abkürzung. Das Routing
aus D4 liest diesen Wert, nie die Länge der Liste.

`roleForStatus` bleibt unverändert: ein rotes Gate ist ein Übergang (`none`), gleich ob er
zum implementer oder zum test-author führt. Der bestehende Test, der `roleForStatus` gegen
`next()` über alle Zustände vergleicht, deckt die neue Verzweigung mit ab.

### D6 — `failureDetails` und Suite-Meldung sind Jest-Quellen

`parseJestFailures` bildet den Rohtext eines Szenarios aus `failureMessages` und, sind diese
leer, aus `failureDetails`: jeder Eintrag steuert seinen `diagnosticText` (ts-jest `TSError`)
oder, falls fehlend, seine `message` bei. Ersatz statt Vereinigung, weil ein `TSError` in
beiden stehen kann und der Text sonst doppelt im Auftrag stünde. Ein Szenario, dessen
`failureMessages` leer sind, hat damit trotzdem einen Rohtext, und der geht durch dieselbe
Kürzung und denselben Wächter wie bisher. Für ein `TSError` in `src/` bleibt der `diagnosticText` vollständig erhalten (Pfad,
Zeile, Diagnose) — die Kürzung schneidet nur an Codeframes und `tests/`-Pfaden.

Eine Suite, deren `assertionResults` leer und deren `status` `failed` ist, hat gar keine
Szenarien, an denen ein Befund hängen könnte; ihr Grund steht in `testResults[].message`.
Daraus entsteht **ein** Befund mit dem festen Namen „Testsuite konnte nicht geladen werden"
— nicht der Dateiname, der wäre ein Testpfad. Die Meldung wird **zeilenweise gesiebt**, nicht
am ersten Treffer abgeschnitten: Jest nennt die Suite in der Kopfzeile („Cannot find module
… from 'tests/x.test.ts'"), und `truncateAtTestReference` ließe damit den Modulfehler unter
`src/` verschwinden, der dahinter steht. Das Sieb entfernt Zeilen mit Testreferenz und
Codeframe-Zeilen und endet am ersten Stacktrace-Eintrag; was bleibt, läuft durch denselben
Wächter wie jeder andere Befund.

### D7 — Der Prompt-Abschnitt trennt die drei Quellen

Der Implementer-Auftrag bekommt neben „Fehlgeschlagene Szenarien" einen Abschnitt
„Typecheck / Lint", unterteilt nach Werkzeug, je Zeile ein Befund, dahinter — sofern vorhanden
— die Zählung der Testbefunde. Der test-author-Auftrag bekommt denselben Abschnitt ohne
Filterung und ohne Zählung. Die Trennung nach Quelle sagt der Rolle, welches Kommando sie
lokal wiederholen kann: `pnpm typecheck:src` bzw. `pnpm lint` für den implementer, beides
plus `pnpm typecheck` für den test-author.
