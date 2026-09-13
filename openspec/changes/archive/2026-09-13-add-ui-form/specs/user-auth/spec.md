## MODIFIED Requirements

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
- Eine bereits vergebene E-Mail SHALL mit `409` und `field` gleich `email` beantwortet
  werden, damit der Client die Meldung am Feld zeigen kann (`ui-form`).

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
- **THEN** antwortet der Server mit `409` und `field` gleich `email`, legt kein zweites Konto an
  und setzt kein Sitzungscookie

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

### Requirement: Anmeldeoberfläche

Die Anwendung SHALL einem nicht angemeldeten Besucher die Anmeldung anbieten und einen vom
Server gemeldeten Fehlschlag sichtbar machen, statt ihn zu verschlucken. Scheitert eine
Auth-Abfrage nicht an einer Antwort des Servers, sondern daran, dass keine brauchbare Antwort
kommt (Netzfehler, unerwartete Antwortform), MUST die Anwendung das ebenfalls sichtbar machen
und MUST NOT dauerhaft im Ladezustand verharren oder eine unbehandelte Promise-Rejection
hinterlassen. Sie MUST NOT sich selbst als abgemeldet erklären, solange der Server das nicht
bestätigt hat (`constitution.md` §9.1).

Das Anmeldeformular SHALL dem Formularmuster von `ui-form` folgen: Felder `E-Mail`
(`email`) und `Passwort` (`password`), Absende-Schaltfläche `Anmelden`; gültig ist der
Zustand, den `LoginInputSchema` akzeptiert. Eine Ablehnung mit `field` SHALL als Feldfehler
des genannten Feldes erscheinen, eine Ablehnung ohne `field` (`401`) und ein Netzfehler als
Formularfehler.

#### Scenario: Ohne Anmeldung erscheint das Anmeldeformular

- **GIVEN** der Server meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie Eingabefelder für E-Mail und Passwort sowie einen Wechsel zur
  Registrierung, und die Schaltfläche `Anmelden` ist gesperrt, solange beide Felder leer
  sind

#### Scenario: Fehlgeschlagene Anmeldung wird angezeigt

- **GIVEN** das Anmeldeformular ist mit einer gültigen E-Mail und einem Passwort ausgefüllt
- **WHEN** der Nutzer `Anmelden` auslöst und der Server die Anmeldung mit `401` und einer
  Meldung ablehnt
- **THEN** zeigt das Formular diese Meldung als Formularfehler (`role="alert"`, Klasse
  `form-error`), weder das Feld `E-Mail` noch das Feld `Passwort` trägt `aria-invalid`,
  und die Anwendung bleibt im Anmeldeformular

#### Scenario: Abgelehntes Feld zeigt den Fehler am Feld

- **GIVEN** das Anmeldeformular ist mit einer gültigen E-Mail und einem Passwort ausgefüllt
- **WHEN** der Nutzer `Anmelden` auslöst und der Server mit `400`, der Meldung
  `Das ist keine gültige E-Mail-Adresse.` und `field` gleich `email` ablehnt
- **THEN** trägt das Feld `E-Mail` `aria-invalid="true"` und verweist per `aria-describedby` auf ein
  Element mit der Rolle `alert` und dieser Meldung, das Feld `Passwort` trägt kein `aria-invalid`, es gibt kein
  Element mit der Klasse `form-error`, und die Anwendung bleibt im Anmeldeformular

#### Scenario: Anmelden bleibt gesperrt bei leerem Pflichtfeld

- **GIVEN** das Anmeldeformular ist gerendert, das Feld `E-Mail` ist mit einer gültigen
  E-Mail ausgefüllt und das Feld `Passwort` ist leer
- **WHEN** die Schaltfläche `Anmelden` angeklickt und das Formular abgeschickt wird
- **THEN** ist die Schaltfläche `Anmelden` gesperrt, und es wurde keine Anfrage an
  `/api/auth/login` gesendet

#### Scenario: Anmelden zeigt den Ladezustand und die Rückversicherung

- **GIVEN** das Anmeldeformular ist mit einer gültigen E-Mail und einem Passwort
  ausgefüllt, die Antwort auf `POST /api/auth/login` steht aus, und es gelten falsche Timer
- **WHEN** der Nutzer `Anmelden` auslöst, 4000 Millisekunden vergehen und der Server danach
  mit `401` und einer Meldung antwortet
- **THEN** war die Schaltfläche `Anmelden` nach dem Auslösen gesperrt und trug
  `aria-busy="true"`, zeigte nach den 4000 Millisekunden den Text
  `Verbinde noch… das kann einen Moment dauern.`, und nach der Antwort zeigt sie wieder
  `Anmelden`, trägt kein `aria-busy`, ist nicht gesperrt, und das Formular zeigt die
  Meldung als Formularfehler

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

### Requirement: Passwortänderung in der Oberfläche

Die Anwendung SHALL einem angemeldeten Nutzer in der angemeldeten Startansicht ein Formular
zur Passwortänderung anbieten und die Antwort des Servers sichtbar machen: den Erfolg als
Toast `Passwort geändert.` im Toast-Host (`ui-feedback`), eine Ablehnung mit `field` als Feldfehler des genannten Feldes (`ui-form`), eine Ablehnung
ohne `field` und einen Netzfehler als Formularfehler. Nach einem Erfolg MUST NOT das
Formular eine Meldung mit `role="alert"` zeigen. Das Formular SHALL dem Formularmuster
folgen: Felder `Bisheriges Passwort` (`currentPassword`) und `Neues Passwort`
(`newPassword`), Absende-Schaltfläche `Passwort ändern`; gültig ist der Zustand, den
`ChangePasswordInputSchema` akzeptiert. Das Formular SHALL am Ende der Startansicht in einem zugeklappten Aufklappbereich
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
- **WHEN** der Nutzer `Passwort ändern` auslöst und der Server die Änderung mit `403`, einer
  Meldung und `field` gleich `currentPassword` ablehnt
- **THEN** trägt das Feld `Bisheriges Passwort` `aria-invalid="true"` und verweist per `aria-describedby` auf ein
  Element mit der Rolle `alert` und dieser Meldung, das Feld `Neues Passwort` trägt kein `aria-invalid`, der
  Toast-Host zeigt keinen Toast, und die Anwendung bleibt in der angemeldeten Ansicht

#### Scenario: Passwort ändern bleibt gesperrt bei zu kurzem neuen Passwort

- **GIVEN** das Formular zur Passwortänderung ist gerendert, `Bisheriges Passwort` ist
  ausgefüllt und `Neues Passwort` enthält 14 Zeichen
- **WHEN** die Schaltfläche `Passwort ändern` angeklickt und das Formular abgeschickt wird
- **THEN** ist die Schaltfläche `Passwort ändern` gesperrt, und es wurde keine Anfrage an
  `/api/auth/password` gesendet

#### Scenario: Erfolgreiche Passwortänderung wird bestätigt

- **GIVEN** das Formular zur Passwortänderung ist ausgefüllt
- **WHEN** der Server die Änderung mit `200` bestätigt
- **THEN** zeigt der Toast-Host (`role="status"`) einen Toast `Passwort geändert.`, das
  Formular enthält keine Meldung mit `role="alert"`, beide Passwortfelder sind geleert, und
  die Anwendung bleibt in der angemeldeten Ansicht

### Requirement: Registrierungsoberfläche

Das Registrierungsformular SHALL Eingabefelder für Nutzername, E-Mail und Passwort zeigen
und eine Ablehnung des Servers — vergebener oder ungültiger Nutzername, vergebene E-Mail —
am genannten Feld sichtbar machen, ohne das Formular zu verlassen. Das Formular SHALL dem
Formularmuster von `ui-form` folgen: Felder `Nutzername` (`username`), `E-Mail` (`email`)
und `Passwort` (`password`), Absende-Schaltfläche `Registrieren`; gültig ist der Zustand,
den `RegisterInputSchema` akzeptiert.

#### Scenario: Registrierungsformular zeigt das Nutzernamensfeld

- **GIVEN** der Server meldet keinen angemeldeten Nutzer, und der Besucher hat zur
  Registrierung gewechselt
- **WHEN** das Registrierungsformular gerendert wird
- **THEN** zeigt es Eingabefelder für Nutzername, E-Mail und Passwort

#### Scenario: Vergebener Nutzername wird angezeigt

- **GIVEN** das Registrierungsformular ist mit Nutzername, E-Mail und Passwort ausgefüllt
- **WHEN** der Server die Registrierung mit `409`, einer Meldung und `field` gleich
  `username` ablehnt
- **THEN** trägt das Feld `Nutzername` `aria-invalid="true"` und verweist per `aria-describedby` auf ein
  Element mit der Rolle `alert` und dieser Meldung, die Felder `E-Mail` und `Passwort` tragen kein `aria-invalid`, es gibt
  kein Element mit der Klasse `form-error`, und die Anwendung bleibt im
  Registrierungsformular

#### Scenario: Registrieren bleibt gesperrt bei leerem Pflichtfeld

- **GIVEN** das Registrierungsformular ist gerendert, `Nutzername` und `E-Mail` sind gültig
  ausgefüllt und `Passwort` ist leer
- **WHEN** die Schaltfläche `Registrieren` angeklickt und das Formular abgeschickt wird
- **THEN** ist die Schaltfläche `Registrieren` gesperrt, und es wurde keine Anfrage an
  `/api/auth/register` gesendet
