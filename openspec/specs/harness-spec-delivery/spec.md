# harness-spec-delivery Specification

## Purpose

Beschreibt, welches Material aus einem OpenSpec-Change in den Auftrag an eine Rolle eingeht,
in welcher Form seine Herkunft gekennzeichnet ist und wie der Leak-Wächter dabei greift.

Der implementer darf den Change-Ordner nicht selbst lesen — sein Auftrag muss durch den
Leak-Wächter laufen (`constitution.md` §2.2). Was der Harness ihm nicht mitgibt, sieht er
also nicht. Diese Capability entscheidet damit darüber, ob zwei getrennte Rollen an derselben
Entscheidungslage arbeiten oder dieselbe Frage zweimal beantworten.

## Requirements

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

### Requirement: Ein Auftrag ohne Change-Material entsteht nicht

Der Harness MUST den Aufbau des Auftrags an den implementer abbrechen, wenn der Change kein
Material liefert — weil das Change-Verzeichnis fehlt oder weder `proposal.md`, `design.md` noch
eine Datei unter `specs/` enthält. Ein Auftrag mit leerem `# Spec`-Abschnitt MUST NOT entstehen:
er sieht gültig aus, ließe den implementer aber gegen nichts arbeiten, und der Fehlschlag träte
erst später als rotes Gate zutage — in der Gestalt eines Implementierungsfehlers, der keiner ist,
und um den Preis einer verbrauchten Runde (`constitution.md` §3.5).

Die Meldung MUST das erwartete Change-Verzeichnis nennen. Aus einer leeren Materialliste folgen
zwei Ursachen — das Verzeichnis fehlt, oder der Change-Name in `status.json` zeigt auf ein
anderes —, und nur die genannte Ortsangabe lässt den Menschen sie ohne Suche unterscheiden.

Diese Prüfung gilt dem Auftrag an den implementer. Sie MUST NOT in die reine Lesefunktion
verlagert werden, die das Material holt: diese hat einen zweiten Aufrufer, für den ein leerer
Change nicht derselbe Abbruchgrund ist.

#### Scenario: Ein fehlendes Change-Verzeichnis hält den Lauf an und nennt das Verzeichnis

- **GIVEN** `status.json` verweist auf einen Change, dessen Verzeichnis fehlt — sodass das
  Material für den Auftrag leer bliebe
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** bricht der Aufbau ab, es entsteht kein Auftrag, und die Meldung nennt das erwartete
  Change-Verzeichnis

#### Scenario: Ein existierendes, aber materialloses Verzeichnis hält den Lauf ebenso an

- **GIVEN** das Change-Verzeichnis existiert, enthält aber weder `proposal.md`, `design.md` noch
  eine Datei unter `specs/` — sodass das Material für den Auftrag leer bliebe, obwohl das
  Verzeichnis da ist
- **WHEN** der Harness den Auftrag für den implementer baut
- **THEN** bricht der Aufbau ab, es entsteht kein Auftrag, und die Meldung nennt das erwartete
  Change-Verzeichnis — der Abbruch hängt am fehlenden Material, nicht am Fehlen des Verzeichnisses

### Requirement: Der Leak-Wächter läuft, sobald er etwas prüfen kann

Der Harness MUST das Change-Material nicht erst beim Bau des Implementer-Auftrags gegen
Testpfade und Testinhalt prüfen, sondern an den zwei früheren Stellen, an denen ein Treffer
billiger zu beheben ist: beim Anlegen des Laufs (`start`) gegen die Tests, die der Worktree
bereits trägt, und bei der Rot-Bestätigung (`confirm-red`) gegen die vom test-author
geschriebenen Tests. Beide Prüfungen MUST dieselbe Fundstelle nennen wie der Wächter im
Implementer-Auftrag.

In `start` MUST der Abbruch erfolgen, bevor Run-State und Rollenmarker entstehen — die
Sitzung ist dann rollenlos und korrigiert die Docs direkt. In `confirm-red` MUST der Abbruch
vor dem Übergang nach `implement` erfolgen; Phase und Marker bleiben, wie sie sind, und
weder Rundenzähler noch Board-Status bewegen sich. Ein Leak-Treffer MUST NOT als Rot aus dem
falschen Grund gemeldet werden — er ist kein Testergebnis, sondern ein Abbruch.

Der Wächter im Implementer-Auftrag bleibt bestehen: die frühen Prüfungen sind Ergänzung,
nicht Ersatz.

#### Scenario: Ein Leak im Change-Material hält start an, bevor ein Lauf entsteht

- **GIVEN** der Worktree trägt eine Testdatei, und die `design.md` des Change nennt diese
  Datei beim Namen
- **WHEN** der Harness den Lauf anlegt
- **THEN** bricht er mit der Fundstelle ab, und es gibt weder `status.json` noch Rollenmarker
  für diesen Lauf

#### Scenario: Ein Leak gegen die neuen Tests hält confirm-red vor dem Übergang an

- **GIVEN** ein Lauf in Phase `red`, der test-author hat eine Testdatei geschrieben, und die
  `design.md` des Change nennt diese Datei beim Namen; die Tests laufen rot
- **WHEN** der Harness das Rot bestätigt
- **THEN** bricht er mit der Fundstelle ab, die Phase bleibt `red`, und der Rundenzähler ist
  unverändert
