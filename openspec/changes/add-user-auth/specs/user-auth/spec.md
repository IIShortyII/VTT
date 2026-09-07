## Purpose

Gibt dem VTT eine stabile Nutzeridentität: ein Mensch legt sich ein Konto an, meldet sich mit
E-Mail und Passwort an und wird von seinem Browser über Reload und Serverneustart hinweg als
derselbe Nutzer wiedererkannt. Alles, was später einem Spieler oder Spielleiter zugeordnet
wird, hängt an dieser Identität.

## ADDED Requirements

### Requirement: Kontoregistrierung

Das System SHALL aus E-Mail und Passwort ein Konto anlegen, sofern die E-Mail noch nicht
vergeben ist und beide Eingaben den an der Grenze geprüften Verträgen genügen. Die E-Mail
dient als Anmeldename und wird nicht verifiziert. Eine erfolgreiche Registrierung meldet den
Nutzer unmittelbar an.

Für das Passwort gilt (Herleitung in design.md D11):

- Es SHALL mindestens 15 und höchstens 128 Zeichen lang sein.
- Es MUST NOT an Zeichenklassen gebunden sein — keine Pflicht zu Groß-, Klein-, Ziffern-
  oder Sonderzeichen.
- Druckbare ASCII-Zeichen, Leerzeichen und Unicode SHALL angenommen werden; jedes
  Codepoint zählt als ein Zeichen.
- Es MUST NOT beschnitten werden — weder gekürzt noch an den Rändern getrimmt. Ein
  führendes oder abschließendes Leerzeichen ist Teil des Passworts.

#### Scenario: Registrierung mit unbenutzter E-Mail

- **GIVEN** kein Konto zu `spieler@example.com` existiert
- **WHEN** `POST /api/auth/register` mit dieser E-Mail und einem gültigen Passwort eingeht
- **THEN** antwortet der Server mit `201`, dem angelegten Nutzer (`id`, `email`) und einem
  gesetzten Sitzungscookie, und in der Datenbank existiert genau ein Konto zu dieser E-Mail

#### Scenario: Registrierung mit bereits vergebener E-Mail

- **GIVEN** ein Konto zu `spieler@example.com` existiert bereits
- **WHEN** `POST /api/auth/register` erneut mit dieser E-Mail eingeht
- **THEN** antwortet der Server mit `409`, legt kein zweites Konto an und setzt kein
  Sitzungscookie

#### Scenario: Registrierung mit ungültigen Eingaben

- **GIVEN** kein Konto existiert
- **WHEN** `POST /api/auth/register` mit einer syntaktisch ungültigen E-Mail oder einem
  Passwort von 14 Zeichen eingeht
- **THEN** antwortet der Server mit `400`, nennt das verletzte Feld und legt kein Konto an

#### Scenario: E-Mail wird unabhängig von der Schreibweise erkannt

- **GIVEN** ein Konto wurde mit `Spieler@Example.COM` registriert
- **WHEN** eine Anmeldung mit `spieler@example.com` und dem richtigen Passwort eingeht
- **THEN** gelingt die Anmeldung und bezeichnet denselben Nutzer

### Requirement: Passwortablage

Das System SHALL Passwörter ausschließlich als gesalzenen Hash speichern. Ein Klartext-
passwort MUST NOT persistiert werden, und zwei Konten mit demselben Passwort MUST
unterschiedliche Hashwerte tragen.

#### Scenario: Passwort wird nicht im Klartext abgelegt

- **GIVEN** ein Konto wurde mit dem Passwort `korrekt-pferd-batterie` registriert
- **WHEN** die zugehörige Kontozeile aus der Datenbank gelesen wird
- **THEN** enthält kein Feld der Zeile das Klartextpasswort, und die hinterlegten Werte
  verifizieren dieses Passwort erfolgreich

#### Scenario: Gleiches Passwort ergibt unterschiedliche Hashwerte

- **GIVEN** zwei Konten wurden mit demselben Passwort registriert
- **WHEN** ihre hinterlegten Hashwerte verglichen werden
- **THEN** unterscheiden sie sich

### Requirement: Anmeldung

Das System SHALL eine Anmeldung nur bei übereinstimmender E-Mail und übereinstimmendem
Passwort gewähren und dabei eine serverseitig gespeicherte Sitzung eröffnen. Eine
fehlgeschlagene Anmeldung MUST keine Sitzung hinterlassen.

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

### Requirement: Zurückhaltung des Servers

Das System MUST NOT **im Anmeldepfad** preisgeben, ob zu einer E-Mail ein Konto existiert, und
MUST NOT Hashwerte, Salt oder Hash-Parameter an einen Client senden (`constitution.md` §9.2).

Die Registrierung ist davon ausgenommen: sie antwortet auf eine bereits vergebene E-Mail mit
`409` und sagt das auch. Begründung in design.md D12 — eine Verschleierung an dieser Stelle
schützt nichts, was nicht ohnehin herausfindbar wäre, kostet aber den legitimen Nutzer die
Auskunft, warum sein Konto nicht entsteht.

#### Scenario: Unbekannte E-Mail ist von falschem Passwort nicht zu unterscheiden

- **GIVEN** ein registriertes Konto zu `spieler@example.com` und keines zu `fremd@example.com`
- **WHEN** je eine Anmeldung mit falschem Passwort für `spieler@example.com` und mit
  beliebigem Passwort für `fremd@example.com` eingeht
- **THEN** sind Statuscode und Fehlermeldung beider Antworten identisch

#### Scenario: Antworten enthalten keine Passwortgeheimnisse

- **GIVEN** ein registriertes Konto
- **WHEN** Registrierung, Anmeldung und die Abfrage des angemeldeten Nutzers durchlaufen werden
- **THEN** enthält keine der Antworten ein Hash-, Salt- oder Hash-Parameter-Feld

### Requirement: Fortbestand der Anmeldung

Das System SHALL den angemeldeten Nutzer allein aus der Sitzungs-ID im Cookie und der
Datenbank bestimmen, sodass die Anmeldung einen Serverneustart überdauert. Das Cookie MUST
`httpOnly` sein und MUST NOT bei Cross-Site-Navigation mitgesendet werden, die einen
Schreibzugriff auslöst.

#### Scenario: Sitzungscookie ist für Skripte unerreichbar

- **GIVEN** eine erfolgreiche Anmeldung
- **WHEN** der `Set-Cookie`-Header der Antwort betrachtet wird
- **THEN** trägt er die Attribute `HttpOnly`, `SameSite=Lax` und `Path=/`

#### Scenario: Anfrage mit gültigem Cookie nennt den angemeldeten Nutzer

- **GIVEN** eine erfolgreiche Anmeldung und das dabei gesetzte Cookie
- **WHEN** `GET /api/auth/me` mit diesem Cookie eingeht
- **THEN** antwortet der Server mit `200` und dem angemeldeten Nutzer

#### Scenario: Anfrage ohne Cookie gilt als nicht angemeldet

- **GIVEN** keine Sitzung im Browser
- **WHEN** `GET /api/auth/me` ohne Cookie eingeht
- **THEN** antwortet der Server mit `401` und ohne Nutzerdaten

#### Scenario: Anmeldung überdauert den Serverneustart

- **GIVEN** eine erfolgreiche Anmeldung und das dabei gesetzte Cookie
- **WHEN** eine frisch aufgebaute Serverinstanz auf derselben Datenbank `GET /api/auth/me`
  mit diesem Cookie beantwortet
- **THEN** antwortet sie mit `200` und demselben Nutzer

### Requirement: Ablauf und gleitende Verlängerung der Sitzung

Eine Sitzung SHALL 30 Tage gültig sein. Bei einer authentifizierten Anfrage SHALL die
Gültigkeit auf volle 30 Tage zurückgesetzt werden, sobald weniger als die Hälfte der Laufzeit
verbleibt; andernfalls bleibt sie unverändert. Eine abgelaufene Sitzung MUST NOT mehr als
Anmeldung gelten.

#### Scenario: Abgelaufene Sitzung gilt nicht mehr

- **GIVEN** eine Sitzung, deren Ablaufzeitpunkt in der Vergangenheit liegt
- **WHEN** `GET /api/auth/me` mit deren Cookie eingeht
- **THEN** antwortet der Server mit `401`, und die abgelaufene Sitzungszeile ist entfernt

#### Scenario: Aktivität in der zweiten Hälfte der Laufzeit verlängert die Sitzung

- **GIVEN** eine Sitzung, deren Restlaufzeit weniger als die Hälfte von 30 Tagen beträgt
- **WHEN** `GET /api/auth/me` mit deren Cookie eingeht
- **THEN** liegt ihr Ablaufzeitpunkt anschließend wieder 30 Tage in der Zukunft

#### Scenario: Aktivität in der ersten Hälfte der Laufzeit ändert nichts

- **GIVEN** eine Sitzung, deren Restlaufzeit mehr als die Hälfte von 30 Tagen beträgt
- **WHEN** `GET /api/auth/me` mit deren Cookie eingeht
- **THEN** ist ihr Ablaufzeitpunkt unverändert

### Requirement: Abmeldung

Das System SHALL eine Abmeldung serverseitig vollziehen: die Sitzungszeile wird gelöscht und
das Cookie im Browser entwertet. Ein danach vorgelegtes Cookie MUST NOT mehr als Anmeldung
gelten.

#### Scenario: Abmeldung beendet die Sitzung

- **GIVEN** eine erfolgreiche Anmeldung und das dabei gesetzte Cookie
- **WHEN** `POST /api/auth/logout` mit diesem Cookie eingeht und danach `GET /api/auth/me`
  mit demselben Cookie
- **THEN** ist die Sitzungszeile gelöscht und die zweite Anfrage wird mit `401` beantwortet

### Requirement: Anmeldeoberfläche

Die Anwendung SHALL einem nicht angemeldeten Besucher die Anmeldung anbieten und einen vom
Server gemeldeten Fehlschlag sichtbar machen, statt ihn zu verschlucken.

#### Scenario: Ohne Anmeldung erscheint das Anmeldeformular

- **GIVEN** der Server meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie Eingabefelder für E-Mail und Passwort sowie einen Wechsel zur
  Registrierung

#### Scenario: Fehlgeschlagene Anmeldung wird angezeigt

- **GIVEN** das Anmeldeformular ist ausgefüllt
- **WHEN** der Server die Anmeldung mit `401` ablehnt
- **THEN** zeigt die Anwendung eine Fehlermeldung an und bleibt im Anmeldeformular
