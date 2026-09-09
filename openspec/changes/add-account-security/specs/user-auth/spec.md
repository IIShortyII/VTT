## ADDED Requirements

### Requirement: Sperre nach Fehlversuchen

Das System SHALL je Konto die fehlgeschlagenen Anmeldeversuche zählen. Erreicht der Zähler
5, SHALL das Konto für 15 Minuten gesperrt sein; danach gilt es ohne weiteres Zutun wieder
als entsperrt, und der Zähler beginnt bei null. Eine erfolgreiche Anmeldung SHALL den Zähler
zurücksetzen. Fehlversuche während einer bestehenden Sperre MUST NOT die Sperre verlängern
und MUST NOT den Zähler verändern.

Als Fehlversuch zählt eine formal mögliche Anmeldung gegen ein existierendes Konto mit
falschem Passwort. Anmeldungen mit unbekannter E-Mail werden nicht gezählt.

Die Sperre ist stumm: ein gesperrtes Konto SHALL auf jede Anmeldung — auch mit richtigem
Passwort — mit demselben Statuscode und derselben Meldung antworten wie auf ein falsches
Passwort, MUST NOT eine Sitzung eröffnen und MUST NOT ein Sitzungscookie setzen. Das Passwort
SHALL dabei trotzdem geprüft werden, damit die Antwortzeit den Sperrzustand nicht verrät
(`constitution.md` §9.2).

#### Scenario: Fünfter Fehlversuch sperrt das Konto

- **GIVEN** ein registriertes Konto zu `spieler@example.com`, gegen das bereits vier
  Anmeldungen mit falschem Passwort eingegangen sind
- **WHEN** eine fünfte Anmeldung mit falschem Passwort eingeht
- **THEN** antwortet der Server mit `401`, und die Kontozeile trägt einen Sperrzeitpunkt, der
  15 Minuten nach dem Zeitpunkt der fünften Anmeldung liegt, sowie den Zähler 0

#### Scenario: Gesperrtes Konto ist von falschem Passwort nicht zu unterscheiden

- **GIVEN** ein gesperrtes Konto zu `spieler@example.com`, dessen Sperrzeitpunkt in der
  Zukunft liegt
- **WHEN** je eine Anmeldung mit dem richtigen und eine mit einem falschen Passwort eingeht
- **THEN** sind Statuscode (`401`) und Fehlermeldung beider Antworten identisch, keine der
  Antworten setzt ein Sitzungscookie, und in der Datenbank existiert keine Sitzungszeile zu
  diesem Nutzer

#### Scenario: Fehlversuch während der Sperre verlängert sie nicht

- **GIVEN** ein gesperrtes Konto mit Sperrzeitpunkt `T` in der Zukunft
- **WHEN** eine Anmeldung mit falschem Passwort eingeht
- **THEN** tragen Sperrzeitpunkt und Zähler der Kontozeile anschließend dieselben Werte wie
  zuvor

#### Scenario: Sperre läuft automatisch ab

- **GIVEN** ein Konto, dessen Sperrzeitpunkt in der Vergangenheit liegt
- **WHEN** eine Anmeldung mit dem richtigen Passwort eingeht
- **THEN** antwortet der Server mit `200` und einem Sitzungscookie, und die Kontozeile trägt
  keinen Sperrzeitpunkt mehr und den Zähler 0

#### Scenario: Erfolgreiche Anmeldung unterhalb der Schwelle setzt den Zähler zurück

- **GIVEN** ein registriertes Konto, gegen das vier Anmeldungen mit falschem Passwort
  eingegangen sind
- **WHEN** eine Anmeldung mit dem richtigen Passwort eingeht
- **THEN** antwortet der Server mit `200`, und die Kontozeile trägt den Zähler 0 und keinen
  Sperrzeitpunkt

#### Scenario: Fehlversuche zählen je Konto

- **GIVEN** zwei registrierte Konten zu `a@example.com` und `b@example.com`
- **WHEN** fünf Anmeldungen mit falschem Passwort gegen `a@example.com` eingehen und danach
  eine Anmeldung mit richtigem Passwort für `b@example.com`
- **THEN** gelingt die Anmeldung für `b@example.com` mit `200`, und dessen Kontozeile trägt
  den Zähler 0 und keinen Sperrzeitpunkt

#### Scenario: Unbekannte E-Mail hinterlässt keinen Zähler

- **GIVEN** kein Konto zu `fremd@example.com`
- **WHEN** fünf Anmeldungen mit beliebigem Passwort für `fremd@example.com` eingehen
- **THEN** antwortet der Server jedes Mal mit `401` und derselben Meldung wie bei falschem
  Passwort, und in der Datenbank existiert weiterhin kein Konto zu dieser E-Mail

### Requirement: Passwortänderung

Das System SHALL einem angemeldeten Nutzer über `POST /api/auth/password` erlauben, sein
Passwort zu ändern, sofern er das bisherige Passwort mitliefert und das neue Passwort der
Passwortregel der Registrierung genügt. Ohne gültige Sitzung SHALL die Anfrage mit `401`
beantwortet werden.

Ein falsches bisheriges Passwort SHALL mit `403` beantwortet werden, das Feld
`currentPassword` benennen und als Fehlversuch im Sinne der Requirement „Sperre nach
Fehlversuchen" zählen. Ein gesperrtes Konto SHALL die Passwortänderung mit derselben Antwort
ablehnen, auch bei richtigem bisherigen Passwort.

Eine erfolgreiche Änderung SHALL in einer Transaktion den neuen Hash ablegen, Zähler und
Sperre zurücksetzen und alle anderen Sitzungen des Nutzers beenden; die Sitzung, aus der
die Änderung erfolgte, SHALL bestehen bleiben.

#### Scenario: Passwortänderung mit richtigem bisherigen Passwort

- **GIVEN** ein angemeldeter Nutzer, dessen Konto den Zähler 3 trägt
- **WHEN** `POST /api/auth/password` mit seinem Cookie, dem richtigen bisherigen Passwort und
  einem gültigen neuen Passwort eingeht
- **THEN** antwortet der Server mit `200`, die Kontozeile trägt einen anderen Hashwert als
  zuvor, den Zähler 0 und keinen Sperrzeitpunkt, eine anschließende Anmeldung mit dem neuen
  Passwort gelingt mit `200`, und eine mit dem bisherigen Passwort scheitert mit `401`

#### Scenario: Passwortänderung mit falschem bisherigen Passwort

- **GIVEN** ein angemeldeter Nutzer, dessen Konto den Zähler 0 trägt
- **WHEN** `POST /api/auth/password` mit seinem Cookie, einem falschen bisherigen Passwort und
  einem gültigen neuen Passwort eingeht
- **THEN** antwortet der Server mit `403` und `field` gleich `currentPassword`, der Hashwert
  der Kontozeile ist unverändert, der Zähler steht auf 1, und die Sitzung des Nutzers besteht
  weiterhin

#### Scenario: Passwortänderung ohne Anmeldung

- **GIVEN** kein Sitzungscookie
- **WHEN** `POST /api/auth/password` mit einem gültigen Körper eingeht
- **THEN** antwortet der Server mit `401`, und kein Hashwert in der Datenbank ändert sich

#### Scenario: Neues Passwort verletzt die Passwortregel

- **GIVEN** ein angemeldeter Nutzer, dessen Konto den Zähler 0 trägt
- **WHEN** `POST /api/auth/password` mit seinem Cookie, dem richtigen bisherigen Passwort und
  einem neuen Passwort von 14 Zeichen eingeht
- **THEN** antwortet der Server mit `400` und `field` gleich `newPassword`, der Hashwert der
  Kontozeile ist unverändert, und der Zähler steht weiterhin auf 0

#### Scenario: Passwortänderung beendet die anderen Sitzungen

- **GIVEN** ein Nutzer mit zwei Sitzungen `A` und `B` aus zwei Anmeldungen
- **WHEN** `POST /api/auth/password` mit dem Cookie von `A`, dem richtigen bisherigen und
  einem gültigen neuen Passwort eingeht
- **THEN** antwortet der Server mit `200`, in der Datenbank existiert zu diesem Nutzer nur
  noch die Sitzungszeile `A`, `GET /api/auth/me` mit dem Cookie von `A` antwortet `200` und
  mit dem Cookie von `B` `401`

#### Scenario: Gesperrtes Konto kann das Passwort nicht ändern

- **GIVEN** ein angemeldeter Nutzer, dessen Konto einen Sperrzeitpunkt `T` in der Zukunft
  trägt
- **WHEN** `POST /api/auth/password` mit seinem Cookie, dem richtigen bisherigen Passwort und
  einem gültigen neuen Passwort eingeht
- **THEN** antwortet der Server mit `403` und `field` gleich `currentPassword`, der Hashwert
  der Kontozeile ist unverändert, und der Sperrzeitpunkt ist weiterhin `T`

### Requirement: Passwortänderung in der Oberfläche

Die Anwendung SHALL einem angemeldeten Nutzer in der angemeldeten Ansicht ein Formular zur
Passwortänderung anbieten und die Antwort des Servers — Erfolg oder Ablehnung — sichtbar
machen. Eine Ablehnung MUST NOT den Nutzer abmelden; die Anwendung bleibt in der angemeldeten
Ansicht (`constitution.md` §9.1).

#### Scenario: Angemeldete Ansicht bietet die Passwortänderung an

- **GIVEN** der Server meldet einen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie neben der Abmeldung Eingabefelder für das bisherige und das neue
  Passwort sowie eine Schaltfläche zum Ändern

#### Scenario: Abgelehnte Passwortänderung wird angezeigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `403` und einer Meldung ablehnt
- **THEN** zeigt die Anwendung diese Meldung an und bleibt in der angemeldeten Ansicht

#### Scenario: Erfolgreiche Passwortänderung wird bestätigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `200` bestätigt
- **THEN** zeigt die Anwendung eine Erfolgsmeldung, beide Passwortfelder sind geleert, und
  sie bleibt in der angemeldeten Ansicht
