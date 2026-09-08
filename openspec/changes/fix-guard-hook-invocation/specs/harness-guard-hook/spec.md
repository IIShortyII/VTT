## Purpose

Beschreibt, unter welchen Bedingungen der PreToolUse-Guard tatsächlich zur Wirkung kommt. Die
Rollentrennung zur Laufzeit (`constitution.md` §2, §5.4) hat genau einen Durchsetzungspunkt:
den Hook, den Claude Code vor jedem Werkzeugaufruf startet. Ob dessen *Logik* richtig
entscheidet, prüfen die bestehenden Tests. Diese Spezifikation prüft die Ebene darüber — ob
der Hook überhaupt läuft.

## ADDED Requirements

### Requirement: Der registrierte Hook blockt ohne projektlokalen PATH

Der in `.claude/settings.json` registrierte Hook-Kommandostring MUST einen unzulässigen
Werkzeugaufruf auch dann mit Exit-Code 2 ablehnen, wenn die aufrufende Shell die
projektlokalen Werkzeugpfade (`node_modules/.bin`) **nicht** im PATH hat.

Claude Code startet den Hook nicht über den Paketmanager. Ein Kommando, das sich darauf
verlässt, dass der Paketmanager `node_modules/.bin` in den PATH gelegt hat, findet seinen
Interpreter nicht und endet mit „command not found". Ein PreToolUse-Hook blockt aber
ausschließlich bei Exit-Code 2 — jeder andere Ausgang, Absturz und fehlender Interpreter
eingeschlossen, lässt den Werkzeugaufruf durch. Der Ausfall ist damit von außen nicht von
einem zufriedenen Guard zu unterscheiden.

Die Prüfung MUST den Kommandostring aus `.claude/settings.json` selbst verwenden und MUST NOT
gegen eine Kopie davon prüfen. Eine Kopie könnte richtig sein, während das registrierte
Kommando falsch ist — das ist genau der Fehler, der hier behoben wird.

Die Prüfung MUST in einer Umgebung ohne `node_modules/.bin` im PATH stattfinden. Die
Testsuite selbst läuft über den Paketmanager und hat diesen Pfad; ohne ausdrückliches
Entfernen würde die Prüfung den Interpreter finden und dem kaputten Hook Wirksamkeit
bescheinigen.

#### Scenario: Ein unzulässiger Aufruf wird geblockt

- **GIVEN** der in `.claude/settings.json` registrierte Hook-Kommandostring und eine Umgebung,
  deren PATH `node_modules/.bin` nicht enthält
- **WHEN** das Kommando als Prozess gestartet wird und auf der Standardeingabe einen
  Werkzeugaufruf erhält, den der Guard ablehnt
- **THEN** endet der Prozess mit Exit-Code 2 und gibt die Begründung der Ablehnung auf der
  Fehlerausgabe aus

#### Scenario: Ein zulässiger Aufruf wird durchgelassen

- **GIVEN** der in `.claude/settings.json` registrierte Hook-Kommandostring und eine Umgebung,
  deren PATH `node_modules/.bin` nicht enthält
- **WHEN** das Kommando als Prozess gestartet wird und auf der Standardeingabe einen
  Werkzeugaufruf erhält, den der Guard zulässt
- **THEN** endet der Prozess mit Exit-Code 0 und gibt keine Ablehnung aus
