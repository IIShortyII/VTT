# harness-gate-feedback Specification

## Purpose
Beschreibt, was ein rotes Gate an welche Rolle meldet: dass jede der drei Gate-Quellen
(Typecheck, Lint, Jest) einen auswertbaren Befund hinterlässt, wie Befunde nach ihrem
Pfadbereich der Rolle zugeordnet werden, und dass ein Gate, das ausschließlich an Testdateien
scheitert, an den test-author geht statt an den implementer.

Das Gate-Feedback ist die Stelle, an der Testmaterial nachweislich schon einmal zum
implementer durchgesickert ist (`constitution.md` §8.2 G3) — und zugleich die Stelle, an der
ein Lauf ohne Feedback eine seiner drei Runden verliert (§3.5). Diese Capability entscheidet
damit über beides: dass der implementer genug erfährt, um zu handeln, und nicht mehr, als er
sehen darf.

## Requirements

### Requirement: Ein rotes Gate nennt seinen Grund aus jeder Quelle

Das Gate MUST die Ausgabe aller drei Werkzeuge — Typecheck, Lint, Jest — auswerten und im
Run-State ablegen. Ein rotes Gate ohne mindestens einen Befund MUST NOT entstehen: „Gate:
rot" ohne Zeile ist kein Feedback (`constitution.md` §8.2 G3), und der implementer verbraucht
daran eine Runde, ohne zu wissen, woran.

Typecheck- und Lint-Befunde MUST als Liste aus Werkzeug, Datei (worktree-relativ,
Forward-Slashes) und Meldung vorliegen — geparst, nicht als Roh-Ausgabe. Ein Fehler des
Werkzeugs selbst, der keiner Datei zuzuordnen ist, MUST als Befund ohne Datei erscheinen.

Ob Jest grün war, MUST explizit im Run-State stehen und MUST NOT aus einer leeren
Failure-Liste abgeleitet werden: eine leere Liste kann auch heißen, dass Jest rot war und
nichts Auswertbares hinterließ.

#### Scenario: Ein Typfehler im Quellpfad erreicht den implementer mit Pfad, Zeile und Meldung

- **GIVEN** Jest und Lint sind grün, und der Typecheck meldet einen Fehler in einer Datei
  unter `src/`
- **WHEN** das Gate läuft und der Harness anschließend den Auftrag für den implementer baut
- **THEN** ist das Gate rot, und der Auftrag nennt den Befund mit Dateipfad, Zeile und der
  Meldung des Typecheck — nicht nur „Gate: rot"

#### Scenario: Ein Lint-Fehler im Quellpfad erreicht den implementer mit Pfad, Zeile und Regel

- **GIVEN** Jest und Typecheck sind grün, und Lint meldet einen Fehler (`severity` 2) in
  einer Datei unter `src/`
- **WHEN** das Gate läuft und der Harness anschließend den Auftrag für den implementer baut
- **THEN** ist das Gate rot, und der Auftrag nennt den Befund mit Dateipfad, Zeile, Regel und
  Meldung

#### Scenario: Ein Werkzeugfehler ohne Datei ergibt einen Befund ohne Datei

- **GIVEN** Lint meldet Rot, ohne einen Befund an einer Datei zu hinterlassen (etwa ein
  Konfigurationsfehler)
- **WHEN** das Gate läuft
- **THEN** ist das Gate rot, und im Run-State steht ein Lint-Befund ohne Datei, dessen Meldung
  die erste nichtleere Zeile der Werkzeugausgabe ist

#### Scenario: Der Jest-Ausgang steht explizit im Run-State

- **GIVEN** Jest ist rot, hinterlässt aber keine auswertbaren Szenario-Failures
- **WHEN** das Gate läuft
- **THEN** vermerkt der Run-State Jest ausdrücklich als rot — unabhängig davon, ob die
  Failure-Liste leer ist

### Requirement: Der implementer sieht Testbefunde nur als Zählung

Der Auftrag an den implementer MUST Typecheck- und Lint-Befunde außerhalb von `tests/`
vollständig enthalten und Befunde unter `tests/` **nur als Zählung je Werkzeug** — ohne Pfad,
Symbol, Zeile oder Regel. Eine tsc- oder ESLint-Zeile zu einer Testdatei ist dasselbe Material,
das die Jest-Auswertung zurückhält (`constitution.md` §2.2), und unterliegt derselben Grenze.

Nennt ein vollständig genannter Befund eine Testdatei des Laufs beim Namen, MUST der Harness
diesen einen Befund zurückhalten und den Vorgang protokollieren — nicht den Lauf blockieren.
Es ist derselbe Erkenner und dieselbe Wirkung wie bei der Jest-Auswertung.

#### Scenario: Ein Typfehler in einer Testdatei erscheint beim implementer nur als Zahl

- **GIVEN** das Gate ist rot mit einem Typfehler unter `src/` und zwei Typfehlern unter
  `tests/`
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** nennt der Auftrag den Befund unter `src/` vollständig, für die Testdateien aber nur
  „2 Typfehler in Testdateien", und weder Pfad noch Zeile noch Symbol der Testbefunde stehen im
  Auftrag

#### Scenario: Ein Quellbefund, der eine Testdatei nennt, wird zurückgehalten

- **GIVEN** das Gate ist rot mit einem Typfehler unter `src/`, dessen Meldung den Namen einer
  Testdatei des Laufs enthält
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** steht statt des Befunds der Rückhalt-Hinweis im Auftrag, der Vorgang ist im
  Protokoll vermerkt, und der Auftrag entsteht — der Lauf wird nicht abgebrochen

### Requirement: Ausschließlich testseitiges Rot geht an den test-author

Ist das Gate rot, weil Jest grün ist und **jeder** Typecheck- und Lint-Befund unter `tests/`
liegt, MUST der Harness `invoke-test-author-rework` emittieren statt `invoke-implementer`.
Der Auftrag an den test-author MUST die Befunde vollständig enthalten. Die Runde MUST wie
jede Nacharbeit zählen (`constitution.md` §3.5); die Eskalationsgrenze bleibt
rollenunabhängig.

Ist Jest rot, oder liegt mindestens ein Befund außerhalb von `tests/`, MUST der Harness wie
bisher `invoke-implementer` emittieren.

#### Scenario: Typfehler nur in Testdateien gehen an den test-author

- **GIVEN** das Gate ist rot, Jest ist grün, und alle Typecheck-Befunde liegen unter `tests/`
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** emittiert er `invoke-test-author-rework`, setzt den Rollenmarker auf `test-author`,
  erhöht den Rundenzähler um eins, und der Auftrag an den test-author nennt die Befunde mit
  Pfad, Zeile und Meldung

#### Scenario: Lint-Fehler nur in Testdateien gehen ebenso an den test-author

- **GIVEN** das Gate ist rot, Jest und Typecheck sind grün, und alle Lint-Befunde liegen unter
  `tests/`
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** emittiert er `invoke-test-author-rework` und erhöht den Rundenzähler um eins

#### Scenario: Gemischte Befunde bleiben eine Implementer-Runde

- **GIVEN** das Gate ist rot, Jest ist grün, und es gibt Befunde unter `src/` und unter
  `tests/`
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** emittiert er `invoke-implementer`

#### Scenario: Rotes Jest mit Testbefunden bleibt eine Implementer-Runde

- **GIVEN** das Gate ist rot, Jest ist rot, und alle Typecheck-Befunde liegen unter `tests/`
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** emittiert er `invoke-implementer`

#### Scenario: Ein Werkzeugbefund ohne Datei bleibt eine Implementer-Runde

- **GIVEN** das Gate ist rot, Jest ist grün, und unter den Befunden ist einer ohne Datei
  (ein Fehler des Werkzeugs selbst)
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** emittiert er `invoke-implementer` — ein Befund ohne Datei gehört keiner Testdatei

#### Scenario: Die Eskalationsgrenze gilt auch für die testseitige Route

- **GIVEN** der Rundenzähler steht auf der Höchstzahl, und das Gate ist ausschließlich
  testseitig rot
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** eskaliert er, statt eine weitere test-author-Runde zu beginnen

### Requirement: Jest-Befunde außerhalb von failureMessages werden gelesen

Die Jest-Auswertung MUST neben `failureMessages` auch `failureDetails` eines Szenarios lesen
— den `diagnosticText` eines ts-jest-`TSError`, ersatzweise dessen `message`. Eine Suite mit
Status `failed` und ohne Szenarien MUST einen Befund aus ihrer Suite-Meldung
(`testResults[].message`) ergeben, benannt mit einem festen Namen statt dem Dateinamen.
Beides MUST frei von Testpfaden und Codeframes sein und durch denselben Leak-Wächter laufen
wie `failureMessages`; die Suite-Meldung MUST dabei den Grund unter `src/` behalten, auch wenn
er hinter der Nennung der Testdatei steht.

#### Scenario: Ein TSError aus failureDetails erreicht den implementer mit Diagnose

- **GIVEN** ein Szenario ist fehlgeschlagen mit leeren `failureMessages` und einem
  `failureDetails`-Eintrag vom Typ `TSError`, dessen `diagnosticText` einen Typfehler in einer
  Datei unter `src/` nennt
- **WHEN** der Harness die Jest-Ausgabe auswertet
- **THEN** trägt der Befund den Szenarionamen und als Meldung den `diagnosticText` mit Pfad,
  Zeile und Diagnose

#### Scenario: Eine nicht ladbare Suite ergibt einen Befund mit ihrer Meldung

- **GIVEN** eine Suite hat Status `failed`, keine Szenarien und eine Suite-Meldung, die einen
  Modulfehler unter `src/` nennt
- **WHEN** der Harness die Jest-Ausgabe auswertet
- **THEN** entsteht genau ein Befund mit festem Namen, dessen Meldung den Modulfehler enthält,
  und kein Testpfad steht im Befund
