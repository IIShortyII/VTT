## MODIFIED Requirements

### Requirement: Passwortänderung in der Oberfläche

Die Anwendung SHALL einem angemeldeten Nutzer in der angemeldeten Startansicht ein Formular
zur Passwortänderung anbieten und die Antwort des Servers — Erfolg oder Ablehnung — sichtbar
machen. Das Formular SHALL am Ende der Startansicht in einem zugeklappten Aufklappbereich
(`<details>` mit Summary `Passwort ändern`) liegen, damit es die Sitzungsliste nicht
verdrängt; seine Felder sind darin enthalten, auch solange der Bereich zugeklappt ist. Eine
Ablehnung MUST NOT den Nutzer abmelden; die Anwendung bleibt in der angemeldeten Ansicht
(`constitution.md` §9.1).

#### Scenario: Angemeldete Ansicht bietet die Passwortänderung an

- **GIVEN** der Server meldet einen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält die Startansicht ein `<details>`-Element ohne `open`-Attribut, dessen
  `<summary>` den Text `Passwort ändern` trägt, und darin Eingabefelder für das bisherige
  und das neue Passwort sowie eine Schaltfläche zum Ändern (die Abmeldung liegt in der
  Top-Bar, `ui-shell`)

#### Scenario: Abgelehnte Passwortänderung wird angezeigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `403` und einer Meldung ablehnt
- **THEN** zeigt die Anwendung diese Meldung an und bleibt in der angemeldeten Ansicht

#### Scenario: Erfolgreiche Passwortänderung wird bestätigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `200` bestätigt
- **THEN** zeigt die Anwendung eine Erfolgsmeldung, beide Passwortfelder sind geleert, und
  sie bleibt in der angemeldeten Ansicht
