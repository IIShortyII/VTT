## MODIFIED Requirements

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
der Dialog offen bleiben und die Meldung des Servers zeigen: mit `field` als Feldfehler des
Feldes `Name` (`name`) bzw. `Sitzungscode` (`code`), sonst als Formularfehler (`ui-form`).
Beide Formulare SHALL dem Formularmuster folgen; gültig ist der Zustand, den
`CreateSessionInputSchema` bzw. `JoinSessionInputSchema` akzeptiert; `Abbrechen` ist nie
gesperrt. Ob eine
Spielsitzung entstanden ist oder ein Beitritt gelungen ist, entscheidet ausschließlich die
Antwort des Servers (`constitution.md` §9.1).

#### Scenario: Sitzung leiten öffnet das Erstellen-Formular

- **GIVEN** die angemeldete Startansicht ist gerendert, kein Dialog ist offen
- **WHEN** der Nutzer `Sitzung leiten` auslöst
- **THEN** gibt es einen Dialog `Neue Spielsitzung` (Rolle `dialog`, `aria-modal="true"`),
  darin das Formular `Neue Spielsitzung` mit dem Eingabefeld `Name` und den Schaltflächen
  `Erstellen` und `Abbrechen`, das Eingabefeld `Name` hat den Fokus, `Erstellen` ist
  gesperrt, solange `Name` leer ist, und `Abbrechen` ist nicht gesperrt

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

- **GIVEN** der Erstellen-Dialog ist offen, und `POST /api/sessions` antwortet mit `400`,
  einer Meldung und `field` gleich `name`
- **WHEN** der Nutzer einen Namen eingibt und `Erstellen` auslöst
- **THEN** ist der Dialog `Neue Spielsitzung` weiterhin offen, und in seinem Formular
  trägt das Feld `Name` `aria-invalid="true"` und verweist per `aria-describedby` auf ein
  Element mit der Rolle `alert` und dieser Meldung

#### Scenario: Beitritt per Code schließt das Formular

- **GIVEN** der Beitreten-Dialog ist offen, und `POST /api/sessions/join` antwortet mit
  `200`; `GET /api/sessions` liefert danach `Freitagsrunde` mit `role: "spieler"`
- **WHEN** der Nutzer `ABC234` als Sitzungscode eingibt und `Beitreten` innerhalb des
  Formulars auslöst
- **THEN** hat die Anwendung `POST /api/sessions/join` mit `{ "code": "ABC234" }` gesendet,
  es gibt keinen Dialog `Spielsitzung beitreten` mehr, und die Sitzungsliste enthält eine
  Karte `Freitagsrunde` mit der Rolle `Spieler`

#### Scenario: Abgelehnter Beitritt zeigt den Fehler am Sitzungscode

- **GIVEN** der Beitreten-Dialog ist offen, und `POST /api/sessions/join` antwortet mit
  `404`, der Meldung `Sitzungscode prüfen und ob die Spielleitung die Sitzung geöffnet hat.`
  und `field` gleich `code`
- **WHEN** der Nutzer `ZZZ999` als Sitzungscode eingibt und `Beitreten` innerhalb des
  Formulars auslöst
- **THEN** ist der Dialog `Spielsitzung beitreten` weiterhin offen, und in seinem Formular
  trägt das Feld `Sitzungscode` `aria-invalid="true"` und verweist per `aria-describedby` auf ein
  Element mit der Rolle `alert` und dieser Meldung

#### Scenario: Beitreten bleibt gesperrt bei leerem Sitzungscode

- **GIVEN** der Beitreten-Dialog ist offen, und das Feld `Sitzungscode` ist leer
- **WHEN** die Schaltfläche `Beitreten` innerhalb des Formulars angeklickt und das Formular
  abgeschickt wird
- **THEN** ist die Schaltfläche `Beitreten` innerhalb des Formulars gesperrt, `Abbrechen` ist
  nicht gesperrt, und es wurde keine Anfrage an `/api/sessions/join` gesendet
