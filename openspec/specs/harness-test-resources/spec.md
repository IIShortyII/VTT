# harness-test-resources Specification

## Purpose
Hält den Ressourcenbedarf der App-Testsuite unabhängig von der Kernzahl der Maschine begrenzt, damit Gate, `confirm-red` und CI die Maschine nicht auslasten (#140).

## Requirements

### Requirement: Jest-Worker sind begrenzt
Die App-Testsuite SHALL unabhängig von der Kernzahl der Maschine höchstens vier Worker nutzen,
nie mehr als Jests Vorgabe (Kerne − 1, mindestens 1), und Worker, die über ein Speicherlimit wachsen, zwischen zwei Testdateien neu starten.

#### Scenario: Worker-Zahl und Speicherlimit sind konfiguriert
- **GIVEN** die Jest-Konfiguration `jest.config.cjs`
- **WHEN** sie geladen wird
- **THEN** liegt `maxWorkers` zwischen 1 und 4
- **AND** übersteigt `maxWorkers` nicht die Kernzahl − 1, sofern diese mindestens 1 ist
- **AND** ist `workerIdleMemoryLimit` auf `'1GB'` gesetzt
