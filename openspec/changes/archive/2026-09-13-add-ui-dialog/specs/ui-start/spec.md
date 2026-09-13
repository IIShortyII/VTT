## MODIFIED Requirements

### Requirement: Hero der Startansicht

Die Startansicht SHALL in jedem Zustand mit dem Hero beginnen: Overline, genau eine
Überschrift der Ebene 1 als Titel und die Subline. Für einen nicht angemeldeten Besucher
SHALL darunter das Anmeldeformular (Felder für E-Mail und Passwort, Absenden `Anmelden`)
und die Link-Schaltfläche `Noch kein Konto? Registrieren` stehen; das
Registrierungsformular (`user-auth`) SHALL denselben Hero behalten. Für einen angemeldeten
Nutzer SHALL der Hero die drei Aktionen zeigen; `Sitzung leiten` und `Beitreten` SHALL
`aria-haspopup="dialog"` tragen, und ohne Auslösen einer Aktion MUST NOT ein Dialog
(`ui-dialog`) oder eines der Formulare zum Erstellen und Beitreten gerendert sein.

#### Scenario: Anonyme Startansicht zeigt Hero und Anmeldekarte

- **GIVEN** der Server meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält der Inhaltsbereich den Text `Deine Runde`, genau eine Überschrift der
  Ebene 1 mit dem Text `Karten, Tokens, Nebel`, den Text `Leite deine Runde am virtuellen
  Tisch oder tritt einer bei.`, Eingabefelder für E-Mail und Passwort, eine Schaltfläche
  `Anmelden` und eine Schaltfläche `Noch kein Konto? Registrieren`; nach deren Auslösen
  zeigt sie das Registrierungsformular, und die Überschrift der Ebene 1 lautet weiterhin
  `Karten, Tokens, Nebel`

#### Scenario: Angemeldete Startansicht zeigt Hero mit Aktionen

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert
  eine leere Liste
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält der Inhaltsbereich den Text `Deine Runde`, genau eine Überschrift der
  Ebene 1 mit dem Text `Meine Spielsitzungen`, den Text `Leite eine Sitzung oder tritt mit
  einem Code bei.` sowie die Schaltflächen `Sitzung leiten` (mit `aria-haspopup="dialog"`), `Beitreten` (mit
  `aria-haspopup="dialog"`) und `Kartenbibliothek`; es gibt kein Element mit der Rolle
  `dialog`, kein Formular `Neue Spielsitzung` und kein Formular `Spielsitzung beitreten`

### Requirement: Erstellen und Beitreten auf Anforderung

`Sitzung leiten` SHALL das Erstellen-Formular in einem Dialog (`ui-dialog`, Rolle
`dialog`) mit dem zugänglichen Namen `Neue Spielsitzung` öffnen und `Beitreten` das
Beitreten-Formular in einem Dialog mit dem Namen `Spielsitzung beitreten`; das Formular
SHALL denselben zugänglichen Namen tragen wie sein Dialog, und sein Eingabefeld SHALL den
Fokus erhalten. Höchstens ein Dialog SHALL offen sein. `Abbrechen` im Formular, die
Schließen-Schaltfläche des Dialogs und `Escape` SHALL den Dialog schließen; danach SHALL
der Fokus auf der Aktion liegen, die ihn geöffnet hat. Absenden SHALL wie bisher
`POST /api/sessions` bzw. `POST /api/sessions/join` senden; bestätigt der Server, SHALL
der Dialog schließen und die Sitzungsliste neu geladen werden. Lehnt der Server ab, SHALL
der Dialog offen bleiben und die Meldung des Servers als Fehlermeldung zeigen. Ob eine
Spielsitzung entstanden ist oder ein Beitritt gelungen ist, entscheidet ausschließlich die
Antwort des Servers (`constitution.md` §9.1).

#### Scenario: Sitzung leiten öffnet das Erstellen-Formular

- **GIVEN** die angemeldete Startansicht ist gerendert, kein Dialog ist offen
- **WHEN** der Nutzer `Sitzung leiten` auslöst
- **THEN** gibt es einen Dialog `Neue Spielsitzung` (Rolle `dialog`, `aria-modal="true"`),
  darin das Formular `Neue Spielsitzung` mit dem Eingabefeld `Name` und den Schaltflächen
  `Erstellen` und `Abbrechen`, und das Eingabefeld `Name` hat den Fokus

#### Scenario: Beitreten öffnet das Beitreten-Formular und schließt das Erstellen-Formular

- **GIVEN** die angemeldete Startansicht ist gerendert, und der Erstellen-Dialog ist über
  `Sitzung leiten` offen
- **WHEN** im Dialog die Taste `Escape` gedrückt wird und der Nutzer danach die
  Hero-Schaltfläche `Beitreten` auslöst
- **THEN** lag der Fokus nach `Escape` auf der Schaltfläche `Sitzung leiten`; jetzt gibt es
  einen Dialog `Spielsitzung beitreten`, darin das Formular `Spielsitzung beitreten` mit
  dem Eingabefeld `Sitzungscode` und den Schaltflächen `Beitreten` und `Abbrechen`
  innerhalb des Formulars, das Eingabefeld `Sitzungscode` hat den Fokus, und es gibt keinen
  Dialog `Neue Spielsitzung`

#### Scenario: Abbrechen schließt das Formular

- **GIVEN** der Erstellen-Dialog ist über `Sitzung leiten` offen
- **WHEN** der Nutzer `Abbrechen` im Formular auslöst
- **THEN** gibt es keinen Dialog `Neue Spielsitzung` mehr, der Fokus liegt auf der
  Schaltfläche `Sitzung leiten`, und es wurde keine Anfrage an `/api/sessions` gesendet
  (außer dem Laden der Liste)

#### Scenario: Erstellte Spielsitzung schließt das Formular und erscheint als Karte

- **GIVEN** der Erstellen-Dialog ist offen, und `POST /api/sessions` antwortet mit `201`
  und der neuen Spielsitzung `Krypta`; `GET /api/sessions` liefert danach `Krypta` mit
  `status: "geschlossen"` und `role: "spielleiter"`
- **WHEN** der Nutzer `Krypta` als Namen eingibt und `Erstellen` auslöst
- **THEN** hat die Anwendung `POST /api/sessions` mit `{ "name": "Krypta" }` gesendet, es
  gibt keinen Dialog `Neue Spielsitzung` mehr, und die Sitzungsliste enthält eine Karte
  `Krypta`

#### Scenario: Abgelehntes Erstellen bleibt im Formular

- **GIVEN** der Erstellen-Dialog ist offen, und `POST /api/sessions` antwortet mit `400`
  und einer Meldung
- **WHEN** der Nutzer einen Namen eingibt und `Erstellen` auslöst
- **THEN** ist der Dialog `Neue Spielsitzung` weiterhin offen und sein Formular zeigt diese
  Meldung als Fehlermeldung (`role="alert"`)

#### Scenario: Beitritt per Code schließt das Formular

- **GIVEN** der Beitreten-Dialog ist offen, und `POST /api/sessions/join` antwortet mit
  `200`; `GET /api/sessions` liefert danach `Freitagsrunde` mit `role: "spieler"`
- **WHEN** der Nutzer `ABC234` als Sitzungscode eingibt und `Beitreten` innerhalb des
  Formulars auslöst
- **THEN** hat die Anwendung `POST /api/sessions/join` mit `{ "code": "ABC234" }` gesendet,
  es gibt keinen Dialog `Spielsitzung beitreten` mehr, und die Sitzungsliste enthält eine
  Karte `Freitagsrunde` mit der Rolle `Spieler`
