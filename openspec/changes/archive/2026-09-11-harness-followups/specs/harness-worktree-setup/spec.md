## ADDED Requirements

### Requirement: Die Tracked-Abfrage der Propose-Originale erzeugt keine Fehlermeldung

Beim Aufräumen der Propose-Originale im Hauptrepo MUST der Harness die Frage „ist der Pfad
getrackt?" so an git stellen, dass die erwartete Antwort „nein" keine Fehlermeldung erzeugt:
`git ls-files -- <pfad>` mit leerer Ausgabe bedeutet untracked, nichtleere Ausgabe getrackt.
Der Exit-Code MUST NOT die Entscheidung tragen — mit `--error-unmatch` wäre „untracked"
ein Fehler samt `error: pathspec …` auf stderr, obwohl es der Regelfall ist. Die
Pfadspezifikation bleibt in Forward-Slashes (`harness-path-matching`).

#### Scenario: Untracked wird an der leeren Ausgabe erkannt, nicht am Fehler

- **GIVEN** ein Propose-Original, das git nicht kennt
- **WHEN** der Harness die Originale aufräumt
- **THEN** stellt er die Anfrage ohne `--error-unmatch`, git antwortet mit leerer Ausgabe,
  und das Verzeichnis wird entfernt

#### Scenario: Getrackt wird an der nichtleeren Ausgabe erkannt

- **GIVEN** ein Propose-Original, dessen Dateien git listet
- **WHEN** der Harness die Originale aufräumt
- **THEN** bleibt das Verzeichnis erhalten
