## Purpose

Beschreibt, welche Werkzeugaufrufe der Guard einer Rolle des Feature-Loops erlaubt und welche
er sperrt, weil sie ihr Wissen über die Tests verschaffen würden. Die Rollentrennung aus
`constitution.md` §2 ist nur so viel wert wie die Kanäle, die sie tatsächlich abdeckt.

## ADDED Requirements

### Requirement: Der implementer erhält keinen Typecheck über die Testpfade

Der Guard MUST einem Werkzeugaufruf des implementers, der den Typecheck über das gesamte
Projekt fährt, die Ausführung verweigern. Das gilt für das Projektskript ebenso wie für einen
direkten Compiler-Aufruf ohne einschränkende Projektdatei, denn `tsconfig.json` schließt
`tests/**` ein und die Ausgabe nennt Pfad, Zeile und Quellzeile der Testdatei.

Der Guard MUST den auf die Quellpfade eingeschränkten Typecheck erlauben — die Sperre nimmt
dem implementer den Blick über die Grenze, nicht die Typprüfung. Die Meldung der Sperre MUST
den erlaubten Weg benennen.

#### Scenario: Voller Typecheck durch den implementer wird gesperrt

- **GIVEN** die aktive Rolle ist `implementer`
- **WHEN** ein Bash-Aufruf `pnpm typecheck` ausführen will
- **THEN** blockiert der Guard, und die Meldung nennt `typecheck:src` als erlaubten Weg

#### Scenario: Quellpfad-Typecheck durch den implementer bleibt erlaubt

- **GIVEN** die aktive Rolle ist `implementer`
- **WHEN** ein Bash-Aufruf `pnpm typecheck:src` ausführen will
- **THEN** blockiert der Guard nicht

#### Scenario: Nackter Compiler-Aufruf wird ebenso gesperrt

- **GIVEN** die aktive Rolle ist `implementer`
- **WHEN** ein Bash-Aufruf `npx tsc --noEmit` ohne Verweis auf die Quellpfad-Projektdatei
  ausführen will
- **THEN** blockiert der Guard

#### Scenario: Compiler-Aufruf mit der Quellpfad-Projektdatei bleibt erlaubt

- **GIVEN** die aktive Rolle ist `implementer`
- **WHEN** ein Bash-Aufruf `npx tsc --noEmit -p tsconfig.src.json` ausführen will
- **THEN** blockiert der Guard nicht

### Requirement: Die Sperre gilt nur für den implementer

Der Guard MUST NOT den vollen Typecheck für andere Rollen sperren. Für den test-author sind
die Testpfade der eigene Bereich; das Gate fährt den vollen Typecheck als Subprozess des
Orchestrators und unterliegt dem Guard ohnehin nicht (`constitution.md` §3.2 bleibt
unverändert).

#### Scenario: Der test-author darf den vollen Typecheck fahren

- **GIVEN** die aktive Rolle ist `test-author`
- **WHEN** ein Bash-Aufruf `pnpm typecheck` ausführen will
- **THEN** blockiert der Guard nicht

#### Scenario: Ein rollenloser Aufruf darf den vollen Typecheck fahren

- **GIVEN** keine Rolle ist aktiv
- **WHEN** ein Bash-Aufruf `pnpm typecheck` ausführen will
- **THEN** blockiert der Guard nicht

### Requirement: Der eingeschränkte Typecheck prüft die Quellpfade vollständig

Das Projekt SHALL einen Typecheck bereitstellen, der ausschließlich `src/**` prüft und dabei
dieselben Compiler-Einstellungen verwendet wie der volle Lauf. Ein Typfehler im Quellcode MUST
von ihm gefunden werden — sonst verlagert die Sperre den Fehler nur ins Gate.

#### Scenario: Ein Typfehler im Quellcode wird gemeldet

- **GIVEN** eine Datei unter `src/` enthält einen Typfehler
- **WHEN** der auf die Quellpfade eingeschränkte Typecheck läuft
- **THEN** endet er mit einem Fehler und benennt die Datei
