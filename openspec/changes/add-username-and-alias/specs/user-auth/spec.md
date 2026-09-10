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

## ADDED Requirements

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
