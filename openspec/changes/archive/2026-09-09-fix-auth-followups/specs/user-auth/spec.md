## MODIFIED Requirements

### Requirement: Anmeldung

Das System SHALL eine Anmeldung nur bei übereinstimmender E-Mail und übereinstimmendem
Passwort gewähren und dabei eine serverseitig gespeicherte Sitzung eröffnen. Eine
fehlgeschlagene Anmeldung MUST keine Sitzung hinterlassen.

Ein Anfragekörper, der strukturell nicht dem Vertrag entspricht — kein Objekt (`null`, ein
String, ein Array) oder eine syntaktisch ungültige E-Mail — ist keine Anmeldung, sondern eine
ungültige Anfrage und SHALL als solche (`400`) beantwortet werden. Nur eine formal mögliche
Anmeldung, die an den Zugangsdaten scheitert, SHALL mit `401` beantwortet werden.

#### Scenario: Anmeldung mit korrekten Zugangsdaten

- **GIVEN** ein registriertes Konto zu `spieler@example.com`
- **WHEN** `POST /api/auth/login` mit dieser E-Mail und dem richtigen Passwort eingeht
- **THEN** antwortet der Server mit `200`, dem Nutzer und einem Sitzungscookie, und in der
  Datenbank existiert eine Sitzungszeile zu diesem Nutzer

#### Scenario: Anmeldung mit falschem Passwort

- **GIVEN** ein registriertes Konto zu `spieler@example.com`
- **WHEN** `POST /api/auth/login` mit dieser E-Mail und einem falschen Passwort eingeht
- **THEN** antwortet der Server mit `401`, setzt kein Sitzungscookie und legt keine
  Sitzungszeile an

#### Scenario: Anmeldung mit strukturell ungültigem Anfragekörper

- **GIVEN** ein registriertes Konto zu `spieler@example.com`
- **WHEN** `POST /api/auth/login` mit einem Körper eingeht, der kein Objekt ist (JSON `null`,
  ein JSON-String oder ein JSON-Array)
- **THEN** antwortet der Server mit `400`, setzt kein Sitzungscookie und legt keine
  Sitzungszeile an

### Requirement: Ablauf und gleitende Verlängerung der Sitzung

Eine Sitzung SHALL 30 Tage gültig sein. Bei einer authentifizierten Anfrage SHALL die
Gültigkeit auf volle 30 Tage zurückgesetzt werden, sobald weniger als die Hälfte der Laufzeit
verbleibt; andernfalls bleibt sie unverändert. Eine abgelaufene Sitzung MUST NOT mehr als
Anmeldung gelten.

Die Laufzeit im Browser MUST der Laufzeit in der Datenbank folgen: jede erfolgreiche
authentifizierte Antwort SHALL das Sitzungscookie mit einer Laufzeit tragen, die dem
verbleibenden Abstand bis zum Ablaufzeitpunkt der Sitzung entspricht. Damit holt ein Browser,
dem eine verlängernde Antwort verloren ging, die Verlängerung mit der nächsten Antwort nach,
statt trotz gültiger Sitzung abgemeldet zu werden. Eine Antwort, die eine Sitzung als
abgelaufen zurückweist, SHALL das Cookie im Browser entwerten, so wie es die Abmeldung tut.

#### Scenario: Abgelaufene Sitzung gilt nicht mehr

- **GIVEN** eine Sitzung, deren Ablaufzeitpunkt in der Vergangenheit liegt
- **WHEN** `GET /api/auth/me` mit deren Cookie eingeht
- **THEN** antwortet der Server mit `401`, die abgelaufene Sitzungszeile ist entfernt, und die
  Antwort entwertet das Sitzungscookie (`Max-Age=0` bzw. leerer Wert)

#### Scenario: Aktivität in der zweiten Hälfte der Laufzeit verlängert die Sitzung

- **GIVEN** eine Sitzung, deren Restlaufzeit weniger als die Hälfte von 30 Tagen beträgt
- **WHEN** `GET /api/auth/me` mit deren Cookie eingeht
- **THEN** liegt ihr Ablaufzeitpunkt anschließend wieder 30 Tage in der Zukunft, und die
  Antwort trägt ein erneuertes Sitzungscookie mit der vollen Laufzeit

#### Scenario: Aktivität in der ersten Hälfte der Laufzeit ändert nichts

- **GIVEN** eine Sitzung, deren Restlaufzeit mehr als die Hälfte von 30 Tagen beträgt
- **WHEN** `GET /api/auth/me` mit deren Cookie eingeht
- **THEN** ist ihr Ablaufzeitpunkt unverändert, und die Antwort trägt das Sitzungscookie mit
  der verbleibenden Restlaufzeit — kürzer als 30 Tage und nicht länger als der Abstand
  zwischen jetzt und dem unveränderten Ablaufzeitpunkt

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
- **THEN** zeigt die Anwendung eine Fehlermeldung an und bleibt in der angemeldeten Ansicht
