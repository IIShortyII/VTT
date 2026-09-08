## Purpose

Beschreibt, welches Material aus einem OpenSpec-Change in den Auftrag an eine Rolle eingeht,
in welcher Form seine Herkunft gekennzeichnet ist und wie der Leak-Wächter dabei greift.

Der implementer darf den Change-Ordner nicht selbst lesen — sein Auftrag muss durch den
Leak-Wächter laufen (`constitution.md` §2.2). Was der Harness ihm nicht mitgibt, sieht er
also nicht. Diese Capability entscheidet damit darüber, ob zwei getrennte Rollen an derselben
Entscheidungslage arbeiten oder dieselbe Frage zweimal beantworten.

## ADDED Requirements

### Requirement: Der Auftrag enthält die getroffenen Entscheidungen

Der Auftrag, den der Harness aus einem OpenSpec-Change baut, MUST den Inhalt von `design.md`
enthalten, sofern die Datei im Change existiert. Er MUST sie zwischen `proposal.md` und den
Dateien unter `specs/` einhängen: warum — wie entschieden — was genau.

Der Harness MUST NOT innerhalb der Datei auswählen. `design.md` geht ganz oder gar nicht in
den Auftrag ein; eine Heuristik, die einzelne Abschnitte extrahiert, wäre eine stille
Interpretation der Spezifikation durch das Werkzeug.

Existiert die Datei nicht, MUST der Auftrag ohne sie entstehen — ohne Platzhalter, ohne leere
Rubrik und ohne Hinweis auf ihr Fehlen.

#### Scenario: Ein Change mit design.md liefert die Entscheidungen an den implementer

- **GIVEN** ein Change enthält `proposal.md`, `design.md` und eine Datei unter `specs/`
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** enthält der Auftrag den vollständigen Text der `design.md`

#### Scenario: Die Entscheidungen stehen vor den Anforderungen

- **GIVEN** ein Change enthält `proposal.md`, `design.md` und eine Datei unter `specs/`
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** steht der Text der `design.md` im Auftrag nach dem der `proposal.md` und vor dem der
  Datei unter `specs/`

#### Scenario: Ein Change ohne design.md ergibt einen Auftrag ohne Lücke

- **GIVEN** ein Change enthält `proposal.md` und eine Datei unter `specs/`, aber keine
  `design.md`
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** entsteht der Auftrag aus den vorhandenen Dateien, ohne Platzhalter oder leere Rubrik
  für die fehlende Datei

### Requirement: Jeder Block nennt seine Herkunft

Der Harness MUST jedem Block des Auftrags eine Zeile voranstellen, die dessen Quelldatei als
Pfad **relativ zum Change-Verzeichnis** benennt. Der implementer soll erkennen können, ob er
eine Absicht, eine Entscheidung oder eine Anforderung liest — ohne Kennzeichnung stehen drei
Blöcke ununterscheidbar nebeneinander.

Die Kennzeichnung MUST sich von den Überschriften der eingebetteten Dateien unterscheiden
lassen, die ihrerseits Markdown-Überschriften führen.

#### Scenario: Jeder Block trägt seine Quelldatei

- **GIVEN** ein Change enthält `proposal.md`, `design.md` und zwei Capabilities unter `specs/`
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** trägt jeder der vier Blöcke eine vorangestellte Quellenzeile mit seinem Pfad
  relativ zum Change-Verzeichnis, und der Pfad einer Capability nennt deren Verzeichnisnamen

### Requirement: Beide Rollen bekommen dasselbe Material aus dem Change

Der Harness MUST den Change für den Auftrag an den implementer und für den Auftrag an den
test-author zur Test-Nacharbeit aus derselben Quelle aufbereiten. Zwei Rollen, die am selben
Change arbeiten, dürfen sich nicht in dem unterscheiden, was ihnen der Harness über ihn sagt —
ein Auseinanderdriften der beiden Aufträge wäre der Fehler, nicht ihre Gleichheit.

#### Scenario: Die Test-Nacharbeit sieht dieselben Entscheidungen

- **GIVEN** ein Change enthält `design.md` und der Reviewer hat ausschließlich testbezogene
  blockierende Findings gemeldet
- **WHEN** der Harness den Auftrag zur Test-Nacharbeit für den test-author baut
- **THEN** enthält dieser Auftrag denselben aufbereiteten Change wie der Auftrag an den
  implementer, `design.md` und Quellenzeilen eingeschlossen

### Requirement: Der Leak-Wächter hält an und benennt die Fundstelle

Der Harness MUST den Auftrag an den implementer weiterhin **als Ganzes** auf Testpfade und
Testinhalt prüfen — nicht die einzelnen Blöcke —, damit auch angehängtes Gate-Feedback,
Reviewer-Findings und Rundenhistorie erfasst bleiben.

Bei einem Treffer MUST der Aufbau des Auftrags abbrechen. Der Harness MUST NOT die betroffene
Stelle entfernen, kürzen oder anderweitig durchlaufen lassen: ein Auftrag, aus dem still etwas
herausgefiltert wurde, zeigt dem implementer eine unvollständige Spezifikation, ohne dass es
jemand bemerkt.

Stammt der Treffer aus einer Datei des Change, MUST die Meldung diese Datei benennen. Stammt
er aus keinem der Blöcke, MUST die Meldung wie bisher lauten.

Der Harness MUST NOT eine Zeile als Leak werten, deren Inhalt wörtlich in den kanonischen
Konventionsdateien des Repositories nachzulesen ist — auch dann nicht, wenn er dort in
Fließtext eingebettet steht und keine eigene Zeile bildet. Der Auftrag verweist den
implementer ausdrücklich auf diese Dateien; was er ohnehin lesen darf, kann ihm eine Testdatei
nicht verraten. Ohne diese Ausnahme hielte eine `design.md`, die eine vorgeschriebene
Konvention zitiert, den Lauf an — obwohl sie nichts preisgibt.

Die ausgenommene Zeile MUST unverändert im Auftrag ankommen. Die Ausnahme entscheidet allein
darüber, ob eine Zeile geheim ist; sie ist kein Filter und darf keiner werden.

#### Scenario: Testinhalt in design.md hält den Lauf an und nennt die Datei

- **GIVEN** die `design.md` eines Change enthält eine Zeile, die wörtlich so auch in einer
  Testdatei des Worktrees steht und in keiner Konventionsdatei vorkommt
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** bricht der Aufbau ab, und die Meldung nennt sowohl die betroffene Testdatei als auch
  `design.md` als Fundstelle

#### Scenario: Ein Treffer außerhalb der Blöcke meldet keine Fundstelle

- **GIVEN** der Auftrag trägt angehängtes Gate-Feedback, dessen Text eine Zeile aus einer
  Testdatei enthält, während keine Datei des Change diese Zeile enthält
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** bricht der Aufbau ab, und die Meldung nennt die betroffene Testdatei ohne eine
  Fundstelle im Change zu behaupten

#### Scenario: Eine zitierte Konvention ist kein Leak

- **GIVEN** die `design.md` eines Change zitiert wörtlich eine Zeile aus einer
  Konventionsdatei des Repositories, und dieselbe Zeile steht auch in einer Testdatei des
  Worktrees — weil die Konvention genau das vorschreibt
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** entsteht der Auftrag ohne Abbruch, und er enthält den Text der `design.md`
  vollständig — die zitierende Zeile eingeschlossen, unverändert

