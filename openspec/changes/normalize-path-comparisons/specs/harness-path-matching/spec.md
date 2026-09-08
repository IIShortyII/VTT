## Purpose

Beschreibt, wie der Harness entscheidet, ob ein Text eine Testdatei des laufenden Change nennt,
und wie er Pfade an Git übergibt — unabhängig davon, in welcher Schreibweise das Betriebssystem
sie erzeugt.

Beides sind Stellen, an denen ein Pfad seine Form wechselt: er entsteht als Betriebssystempfad
und wird als Text weiterverwendet. Wo diese Umwandlung fehlt, scheitert der Vergleich lautlos —
und weil beide Stellen etwas *verhindern* sollen (eine Löschung, eine Preisgabe), fällt ihr
Ausfall nicht auf, solange nichts zu verhindern war.

Die Erkennung ist die Mechanik hinter `constitution.md` §2.2 (der implementer sieht Testdateien
nicht) und unterliegt damit §8.1: sie liegt im Code, nicht im Ermessen eines Modells.

## ADDED Requirements

### Requirement: Die Nennung einer Testdatei wird unabhängig von der Schreibweise erkannt

Der Harness MUST einen Text als Nennung einer Testdatei werten, wenn er den Pfad dieser Datei
in einer der Formen enthält, in denen er üblicherweise geschrieben wird: mit den Trennzeichen
des Betriebssystems oder mit Forward-Slashes, vollständig, relativ zum Worktree, oder als
bloßer Dateiname.

Der bloße Dateiname MUST mitzählen. In einer Spezifikation steht eher der Name als der Pfad,
und er verrät dasselbe: welche Testdatei existiert und wie das Verhalten geschnitten ist.

Der Harness MUST NOT die Groß-/Kleinschreibung angleichen. Sie zu ignorieren wäre eine Annahme
über das Dateisystem, die auf einem anderen Läufer falsch ist.

#### Scenario: Eine Nennung mit Forward-Slashes wird erkannt

- **GIVEN** eine Datei des Change nennt eine existierende Testdatei als worktree-relativen Pfad
  mit Forward-Slashes, während der Harness den Pfad intern mit den Trennzeichen des
  Betriebssystems führt
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** bricht der Aufbau ab und meldet die betroffene Testdatei

#### Scenario: Der bloße Dateiname gilt als Nennung

- **GIVEN** eine Datei des Change nennt eine existierende Testdatei nur mit ihrem Dateinamen,
  ohne jeden Pfadanteil
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** bricht der Aufbau ab und meldet die betroffene Testdatei

#### Scenario: Ein Name, der auf keine Testdatei des Laufs passt, hält den Lauf nicht an

- **GIVEN** eine Datei des Change nennt einen Testdateinamen, zu dem im Worktree keine Datei
  existiert
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** entsteht der Auftrag ohne Abbruch

### Requirement: Beide Wächter erkennen Nennungen nach derselben Regel

Der Harness MUST dieselbe Erkennung für den Auftrag an den implementer und für die
durchgereichte Gate-Ausgabe verwenden. Zwei Wächter, die dieselbe Frage stellen, dürfen sie
nicht verschieden beantworten: eine Korrektur an der einen Stelle zöge sonst an der anderen
vorbei, und welche der beiden gilt, hinge davon ab, auf welchem Weg der Text kommt.

Ihre **Wirkung** bleibt verschieden: der Auftrag bricht ab, ein einzelner Gate-Failure
degradiert auf die Kurzform (`constitution.md` §8.2 G3).

#### Scenario: Eine Gate-Ausgabe mit Forward-Slash-Nennung wird degradiert

- **GIVEN** die Ausgabe eines fehlgeschlagenen Szenarios nennt eine existierende Testdatei als
  Pfad mit Forward-Slashes
- **WHEN** der Harness die Gate-Ausgabe für die Weitergabe aufbereitet
- **THEN** wird dieser Failure auf die Kurzform degradiert und der Vorgang protokolliert,
  während der übrige Lauf weiterläuft

### Requirement: Pfadspezifikationen an Git tragen Forward-Slashes

Der Harness MUST Pfade, die er als **Pfadspezifikation** an Git übergibt, mit Forward-Slashes
bilden. Für Pathspecs sind sie die einzige auf allen Plattformen gültige Form; ein Pfad mit den
Trennzeichen des Betriebssystems führt zu keinem Treffer, und Git meldet das als „kein Treffer",
nicht als Fehler.

Diese Verwechslung ist folgenreich, wo aus dem Ausbleiben eines Treffers eine Handlung folgt:
eine Abfrage, die immer „nicht gefunden" antwortet, ist keine Abfrage mehr.

#### Scenario: Getrackte Propose-Originale bleiben erhalten

- **GIVEN** die Dateien eines OpenSpec-Change sind im Hauptrepo von Git getrackt
- **WHEN** der Harness den Change in den Worktree übernommen hat und das Original aufräumen will
- **THEN** bleiben die Dateien erhalten, weil die Abfrage sie als getrackt erkennt

#### Scenario: Untrackte Propose-Originale werden aufgeräumt

- **GIVEN** die Dateien eines OpenSpec-Change sind im Hauptrepo untracked
- **WHEN** der Harness den Change in den Worktree übernommen hat und das Original aufräumen will
- **THEN** werden die Dateien entfernt
