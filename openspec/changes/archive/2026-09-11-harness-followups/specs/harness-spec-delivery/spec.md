## ADDED Requirements

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
