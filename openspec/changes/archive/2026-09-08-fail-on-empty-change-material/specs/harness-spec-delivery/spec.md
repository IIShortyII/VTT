## ADDED Requirements

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
