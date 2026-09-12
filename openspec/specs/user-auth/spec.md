# user-auth Specification

## Purpose

Gibt dem VTT eine stabile Nutzeridentität: ein Mensch legt sich ein Konto an, meldet sich mit
E-Mail und Passwort an und wird von seinem Browser über Reload und Serverneustart hinweg als
derselbe Nutzer wiedererkannt. Alles, was später einem Spieler oder Spielleiter zugeordnet
wird, hängt an dieser Identität.

## Requirements

### Requirement: Kontoregistrierung

Das System SHALL aus E-Mail, Nutzername und Passwort ein Konto anlegen, sofern E-Mail und
Nutzername noch nicht vergeben sind und alle drei Eingaben den an der Grenze geprüften
Verträgen genügen. Die E-Mail dient als Anmeldename und wird nicht verifiziert. Der
Nutzername ist das, was andere Mitspieler sehen. Eine erfolgreiche Registrierung meldet den
Nutzer unmittelbar an.

Für das Passwort gilt (Herleitung in design.md D11 des Change `add-user-auth`):

- Es SHALL mindestens 15 und höchstens 128 Zeichen lang sein.
- Es MUST NOT an Zeichenklassen gebunden sein — keine Pflicht zu Groß-, Klein-, Ziffern-
  oder Sonderzeichen.
- Druckbare ASCII-Zeichen, Leerzeichen und Unicode SHALL angenommen werden; jedes
  Codepoint zählt als ein Zeichen.
- Es MUST NOT beschnitten werden — weder gekürzt noch an den Rändern getrimmt. Ein
  führendes oder abschließendes Leerzeichen ist Teil des Passworts.

Für den Nutzernamen gilt (Herleitung in design.md D1 dieses Change):

- Er SHALL vor der Prüfung an den Rändern getrimmt werden und danach mindestens 3 und
  höchstens 24 Codepoints lang sein.
- Er SHALL ausschließlich aus Unicode-Buchstaben, Unicode-Ziffern sowie `_`, `-` und `.`
  bestehen. Leerzeichen im Inneren MUST NOT angenommen werden.
- Er SHALL in der eingegebenen Schreibweise gespeichert und angezeigt werden.
- Er SHALL instanzweit einmalig sein **unabhängig von der Schreibweise**: zwei Nutzernamen,
  die sich nur in Groß-/Kleinschreibung oder Unicode-Kompatibilitätsform unterscheiden,
  gelten als derselbe Name. Die Einmaligkeit SHALL die Datenbank erzwingen, nicht der Client.
- Ein bereits vergebener Nutzername SHALL mit `409` und `field` gleich `username` beantwortet
  werden; ein formal ungültiger oder fehlender mit `400` und `field` gleich `username`. In
  beiden Fällen MUST NOT ein Konto entstehen und MUST NOT ein Sitzungscookie gesetzt werden.

#### Scenario: Registrierung mit unbenutzter E-Mail

- **GIVEN** kein Konto zu `spieler@example.com` und keines mit dem Nutzernamen `Gandalf`
  existiert
- **WHEN** `POST /api/auth/register` mit dieser E-Mail, dem Nutzernamen `Gandalf` und einem
  gültigen Passwort eingeht
- **THEN** antwortet der Server mit `201`, dem angelegten Nutzer (`id`, `email`,
  `username` gleich `Gandalf`) und einem gesetzten Sitzungscookie, und in der Datenbank
  existiert genau ein Konto zu dieser E-Mail, dessen Nutzerzeile den Nutzernamen `Gandalf`
  trägt

#### Scenario: Registrierung mit bereits vergebener E-Mail

- **GIVEN** ein Konto zu `spieler@example.com` existiert bereits
- **WHEN** `POST /api/auth/register` erneut mit dieser E-Mail und einem noch unbenutzten
  Nutzernamen eingeht
- **THEN** antwortet der Server mit `409`, legt kein zweites Konto an und setzt kein
  Sitzungscookie

#### Scenario: Registrierung mit ungültigen Eingaben

- **GIVEN** kein Konto existiert
- **WHEN** `POST /api/auth/register` mit gültigem Nutzernamen und einer syntaktisch
  ungültigen E-Mail oder einem Passwort von 14 Zeichen eingeht
- **THEN** antwortet der Server mit `400`, benennt das verletzte Feld maschinenlesbar in
  einem eigenen Antwortfeld `field` (`email` bzw. `password`), und legt kein Konto an

#### Scenario: E-Mail wird unabhängig von der Schreibweise erkannt

- **GIVEN** ein Konto wurde mit `Spieler@Example.COM` registriert
- **WHEN** eine Anmeldung mit `spieler@example.com` und dem richtigen Passwort eingeht
- **THEN** gelingt die Anmeldung und bezeichnet denselben Nutzer

#### Scenario: Registrierung ohne Nutzernamen

- **GIVEN** kein Konto existiert
- **WHEN** `POST /api/auth/register` mit gültiger E-Mail und gültigem Passwort, aber ohne
  Feld `username` eingeht
- **THEN** antwortet der Server mit `400` und `field` gleich `username`, legt kein Konto an
  und setzt kein Sitzungscookie

#### Scenario: Registrierung mit formal ungültigem Nutzernamen

- **GIVEN** kein Konto existiert
- **WHEN** je ein `POST /api/auth/register` mit gültiger E-Mail und gültigem Passwort und
  dem Nutzernamen `Ga` (zu kurz), `Gandalf der Graue` (Leerzeichen) und einem Nutzernamen
  von 25 Buchstaben (zu lang) eingeht
- **THEN** antwortet der Server jedes Mal mit `400` und `field` gleich `username`, legt kein
  Konto an und setzt kein Sitzungscookie

#### Scenario: Nutzername wird getrimmt und in seiner Schreibweise bewahrt

- **GIVEN** kein Konto existiert
- **WHEN** `POST /api/auth/register` mit dem Nutzernamen `  Jörg_42  ` (mit umgebenden
  Leerzeichen) eingeht
- **THEN** antwortet der Server mit `201` und `username` gleich `Jörg_42`, und die
  Nutzerzeile in der Datenbank trägt den Nutzernamen `Jörg_42`

#### Scenario: Nutzername ist unabhängig von der Schreibweise einmalig

- **GIVEN** ein Konto mit dem Nutzernamen `Gandalf` existiert
- **WHEN** `POST /api/auth/register` mit einer anderen, unbenutzten E-Mail und dem
  Nutzernamen `gandalf` eingeht
- **THEN** antwortet der Server mit `409` und `field` gleich `username`, in der Datenbank
  existiert weiterhin genau ein Konto, und die Antwort setzt kein Sitzungscookie

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

### Requirement: Abmeldung

Das System SHALL eine Abmeldung serverseitig vollziehen: die Sitzungszeile wird gelöscht und
das Cookie im Browser entwertet. Ein danach vorgelegtes Cookie MUST NOT mehr als Anmeldung
gelten.

#### Scenario: Abmeldung beendet die Sitzung

- **GIVEN** eine erfolgreiche Anmeldung und das dabei gesetzte Cookie
- **WHEN** `POST /api/auth/logout` mit diesem Cookie eingeht und danach `GET /api/auth/me`
  mit demselben Cookie
- **THEN** ist die Sitzungszeile gelöscht, die Abmeldeantwort entwertet das Cookie
  (`Max-Age=0` bzw. leerer Wert), und die zweite Anfrage wird mit `401` beantwortet

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

### Requirement: Nutzername in der Nutzerdarstellung

Jede Antwort, die den angemeldeten Nutzer darstellt — Registrierung, Anmeldung und
`GET /api/auth/me` — SHALL `id`, `email` und `username` enthalten. Die E-Mail erreicht dabei
ausschließlich den Nutzer selbst; an andere Mitspieler SHALL sie in keinem Drahtformat
gesendet werden (`constitution.md` §9.2, siehe `game-session` „Teilnehmerliste in
Echtzeit").

#### Scenario: Anmeldung und Nutzerabfrage nennen den Nutzernamen

- **GIVEN** ein Konto zu `spieler@example.com` mit dem Nutzernamen `Gandalf`
- **WHEN** `POST /api/auth/login` mit dieser E-Mail und dem richtigen Passwort eingeht und
  danach `GET /api/auth/me` mit dem dabei gesetzten Cookie
- **THEN** enthalten beide Antworten `username` gleich `Gandalf` neben `id` und `email`

### Requirement: Registrierungsoberfläche

Das Registrierungsformular SHALL Eingabefelder für Nutzername, E-Mail und Passwort zeigen
und eine Ablehnung des Servers — vergebener oder ungültiger Nutzername — als Meldung sichtbar
machen, ohne das Formular zu verlassen.

#### Scenario: Registrierungsformular zeigt das Nutzernamensfeld

- **GIVEN** der Server meldet keinen angemeldeten Nutzer, und der Besucher hat zur
  Registrierung gewechselt
- **WHEN** das Registrierungsformular gerendert wird
- **THEN** zeigt es Eingabefelder für Nutzername, E-Mail und Passwort

#### Scenario: Vergebener Nutzername wird angezeigt

- **GIVEN** das Registrierungsformular ist mit Nutzername, E-Mail und Passwort ausgefüllt
- **WHEN** der Server die Registrierung mit `409`, einer Meldung und `field` gleich
  `username` ablehnt
- **THEN** zeigt die Anwendung diese Meldung an und bleibt im Registrierungsformular
