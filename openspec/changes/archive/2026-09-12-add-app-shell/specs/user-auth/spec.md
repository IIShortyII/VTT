## MODIFIED Requirements

### Requirement: Anmeldeoberfläche

Die Anwendung SHALL einem nicht angemeldeten Besucher die Anmeldung anbieten und einen vom
Server gemeldeten Fehlschlag sichtbar machen, statt ihn zu verschlucken. Scheitert eine
Auth-Abfrage nicht an einer Antwort des Servers, sondern daran, dass keine brauchbare Antwort
kommt (Netzfehler, unerwartete Antwortform), MUST die Anwendung das ebenfalls sichtbar machen
und MUST NOT dauerhaft im Ladezustand verharren oder eine unbehandelte Promise-Rejection
hinterlassen. Sie MUST NOT sich selbst als abgemeldet erklären, solange der Server das nicht
bestätigt hat (`constitution.md` §9.1).

#### Scenario: Ohne Anmeldung erscheint das Anmeldeformular

- **GIVEN** der Server meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie Eingabefelder für E-Mail und Passwort sowie einen Wechsel zur
  Registrierung

#### Scenario: Fehlgeschlagene Anmeldung wird angezeigt

- **GIVEN** das Anmeldeformular ist ausgefüllt
- **WHEN** der Server die Anmeldung mit `401` ablehnt
- **THEN** zeigt die Anwendung eine Fehlermeldung an und bleibt im Anmeldeformular

#### Scenario: Server beim Start nicht erreichbar

- **GIVEN** die Abfrage des angemeldeten Nutzers beim Start scheitert ohne Antwort des
  Servers (die Anfrage wird mit einem Fehler verworfen)
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie das Anmeldeformular und einen sichtbaren Hinweis, dass der Server nicht
  erreichbar war, und der Ladehinweis ist verschwunden

#### Scenario: Fehlgeschlagene Abmeldung wird angezeigt

- **GIVEN** ein angemeldeter Nutzer in der angemeldeten Ansicht
- **WHEN** die Abmeldeanfrage ohne Antwort des Servers scheitert (die Anfrage wird mit einem
  Fehler verworfen)
- **THEN** zeigt die Anwendung eine Fehlermeldung an und bleibt in der angemeldeten Ansicht:
  die Top-Bar (`ui-shell`, „Top-Bar") zeigt weiterhin den Nutzernamen und die Schaltfläche
  `Abmelden`

### Requirement: Passwortänderung in der Oberfläche

Die Anwendung SHALL einem angemeldeten Nutzer in der angemeldeten Ansicht ein Formular zur
Passwortänderung anbieten und die Antwort des Servers — Erfolg oder Ablehnung — sichtbar
machen. Eine Ablehnung MUST NOT den Nutzer abmelden; die Anwendung bleibt in der angemeldeten
Ansicht (`constitution.md` §9.1).

#### Scenario: Angemeldete Ansicht bietet die Passwortänderung an

- **GIVEN** der Server meldet einen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie in der Sitzungsliste Eingabefelder für das bisherige und das neue
  Passwort sowie eine Schaltfläche zum Ändern (die Abmeldung liegt in der Top-Bar,
  `ui-shell`)

#### Scenario: Abgelehnte Passwortänderung wird angezeigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `403` und einer Meldung ablehnt
- **THEN** zeigt die Anwendung diese Meldung an und bleibt in der angemeldeten Ansicht

#### Scenario: Erfolgreiche Passwortänderung wird bestätigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `200` bestätigt
- **THEN** zeigt die Anwendung eine Erfolgsmeldung, beide Passwortfelder sind geleert, und
  sie bleibt in der angemeldeten Ansicht
