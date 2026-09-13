## MODIFIED Requirements

### Requirement: Passwortänderung in der Oberfläche

Die Anwendung SHALL einem angemeldeten Nutzer in der angemeldeten Startansicht ein Formular
zur Passwortänderung anbieten und die Antwort des Servers sichtbar machen: den Erfolg als
Toast `Passwort geändert.` im Toast-Host (`ui-feedback`), eine Ablehnung als Meldung im
Formular (`role="alert"`). Nach einem Erfolg MUST NOT das Formular eine Meldung mit
`role="alert"` zeigen. Das Formular SHALL am Ende der Startansicht in einem zugeklappten Aufklappbereich
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
- **THEN** zeigt das Formular diese Meldung mit `role="alert"`, der Toast-Host zeigt keinen
  Toast, und die Anwendung bleibt in der angemeldeten Ansicht

#### Scenario: Erfolgreiche Passwortänderung wird bestätigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `200` bestätigt
- **THEN** zeigt der Toast-Host (`role="status"`) einen Toast `Passwort geändert.`, das
  Formular enthält keine Meldung mit `role="alert"`, beide Passwortfelder sind geleert, und
  die Anwendung bleibt in der angemeldeten Ansicht
