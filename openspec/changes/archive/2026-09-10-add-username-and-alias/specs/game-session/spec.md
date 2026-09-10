## ADDED Requirements

### Requirement: Alias pro Mitgliedschaft

Ein anwesendes Mitglied SHALL mit `session:alias` `{ sessionId, alias }` den Alias seiner
eigenen Mitgliedschaft in dieser Spielsitzung setzen oder zurücksetzen. Der Alias SHALL vor
der Prüfung an den Rändern getrimmt werden; ein danach leerer Wert setzt den Alias zurück
(kein Alias). Ein nicht leerer Alias SHALL 1 bis 40 Codepoints lang sein und MUST NOT
Steuerzeichen (einschließlich Zeilenumbrüchen) enthalten; sonst ist er frei wählbar. Der
Alias MUST NOT einmalig sein — mehrere Mitglieder derselben Spielsitzung dürfen denselben
Alias tragen. Der Alias hängt an der Mitgliedschaft: derselbe Nutzer trägt in verschiedenen
Spielsitzungen unabhängige Aliasse.

Nur das Mitglied selbst SHALL seinen Alias ändern; das Ereignis trägt keine Ziel-Nutzer-ID.
Die Berechtigung SHALL pro Aktion geprüft werden wie jede andere Raumaktion (Requirement
„Autorisierung pro Aktion", `constitution.md` §9.3). Ein Nicht-Mitglied SHALL mit
`{ ok: false, message }` beantwortet werden.

Ein erlaubter Aufruf SHALL den Alias in der Datenbank ändern, mit `{ ok: true, alias }`
bestätigt werden (`alias` als gespeicherter Wert oder `null` nach Zurücksetzen) und allen
im Raum ein `session:participants` senden (Requirement „Teilnehmerliste in Echtzeit"). Ein
Ereignis, dessen Payload nicht dem Vertrag entspricht — auch ein zu langer oder ein
Steuerzeichen enthaltender Alias — SHALL mit `{ ok: false, message }` beantwortet werden und
MUST NOT etwas verändern.

#### Scenario: Mitglied setzt seinen Alias

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, in deren Raum der Spielleiter und ein
  Spieler mit Nutzernamen `sam` anwesend sind
- **WHEN** der Spieler `session:alias` mit `{ sessionId, alias: "Gandalf der Graue" }` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, alias: "Gandalf der Graue" }`, die
  Mitgliedschaft des Spielers trägt in der Datenbank den Alias `Gandalf der Graue`, und der
  Spielleiter erhält ein `session:participants`, das den Spieler mit `username: "sam"` und
  `alias: "Gandalf der Graue"` enthält

#### Scenario: Alias wird getrimmt

- **GIVEN** ein Spieler ist im Raum einer geöffneten Spielsitzung anwesend
- **WHEN** er `session:alias` mit `alias: "  Drizzt Do'Urden  "` (mit umgebenden
  Leerzeichen) sendet
- **THEN** lautet das Acknowledgement `{ ok: true, alias: "Drizzt Do'Urden" }`, und die
  Mitgliedschaft trägt in der Datenbank den Alias `Drizzt Do'Urden`

#### Scenario: Leerer Alias setzt zurück

- **GIVEN** ein Spieler ist im Raum anwesend, seine Mitgliedschaft trägt den Alias `Gandalf`,
  und der Spielleiter ist anwesend
- **WHEN** der Spieler `session:alias` mit `alias: "   "` (nur Leerzeichen) sendet
- **THEN** lautet das Acknowledgement `{ ok: true, alias: null }`, die Mitgliedschaft trägt in
  der Datenbank keinen Alias, und der Spielleiter erhält ein `session:participants`, in dem
  der Eintrag des Spielers kein Feld `alias` trägt

#### Scenario: Ungültiger Alias wird abgelehnt

- **GIVEN** ein Spieler ist im Raum anwesend, seine Mitgliedschaft trägt den Alias `Gandalf`
- **WHEN** er je ein `session:alias` mit einem Alias von 41 Zeichen, mit einem Alias, der
  einen Zeilenumbruch enthält, und mit einer Payload, die kein Objekt ist (eine Zahl), sendet
- **THEN** lautet jedes Acknowledgement `{ ok: false, message }`, und die Mitgliedschaft trägt
  in der Datenbank weiterhin den Alias `Gandalf`

#### Scenario: Gleicher Alias für zwei Mitglieder ist erlaubt

- **GIVEN** zwei Spieler sind im Raum anwesend, die Mitgliedschaft des ersten trägt den Alias
  `Gandalf`
- **WHEN** der zweite `session:alias` mit `alias: "Gandalf"` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, alias: "Gandalf" }`, und beide
  Mitgliedschaften tragen in der Datenbank den Alias `Gandalf`

#### Scenario: Alias gilt nur in dieser Spielsitzung

- **GIVEN** ein Nutzer ist Spieler in den geöffneten Spielsitzungen `A` und `B`, beide ohne
  Alias, und ist im Raum von `A` anwesend
- **WHEN** er `session:alias` mit der `sessionId` von `A` und `alias: "Gandalf"` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, alias: "Gandalf" }`, seine Mitgliedschaft
  in `A` trägt in der Datenbank den Alias `Gandalf`, und seine Mitgliedschaft in `B` trägt
  weiterhin keinen Alias

#### Scenario: Nicht-Mitglied kann keinen Alias setzen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` und ein angemeldeter Nutzer ohne
  Mitgliedschaft mit Socket-Verbindung
- **WHEN** dieser `session:alias` mit der `sessionId` und `alias: "Gandalf"` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und in der Datenbank existiert
  zu diesem Nutzer keine Mitgliedschaft in dieser Spielsitzung

#### Scenario: Abmeldung wirkt auf das Alias-Ereignis

- **GIVEN** ein Spieler, der den Raum einer geöffneten Spielsitzung betreten hat
- **WHEN** `POST /api/auth/logout` mit seinem Cookie eingeht und er danach über dieselbe
  Socket-Verbindung `session:alias` mit `alias: "Gandalf"` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und seine Mitgliedschaft trägt
  in der Datenbank keinen Alias

## MODIFIED Requirements

### Requirement: Teilnehmerliste in Echtzeit

Der Server SHALL allen Verbindungen im Raum ein `session:participants`
`{ sessionId, participants }` senden, wenn sich Mitgliedschaft, Anwesenheit oder Alias
ändert: bei einem Beitritt per Code, beim Betreten des Raums, beim Verlassen
(Verbindungsabbruch oder Wechsel in einen anderen Raum) und beim Setzen oder Zurücksetzen
eines Alias. `participants` SHALL jedes Mitglied genau einmal enthalten, mit `userId`,
`username`, `role` und `online` sowie `alias`, falls die Mitgliedschaft einen trägt. Die
E-Mail eines Mitglieds MUST NOT enthalten sein — weder in `session:participants` noch im
Acknowledgement von `session:enter` (`constitution.md` §9.2). Ein Mitglied, dessen Verbindung
endet, bleibt Mitglied und wird `online: false`.

#### Scenario: Neues Mitglied erscheint sofort in der Liste

- **GIVEN** ein Spielleiter, der seine Spielsitzung (`geoeffnet`) betreten hat, und ein
  angemeldeter Nutzer mit Nutzernamen `sam`, der nicht Mitglied ist
- **WHEN** dieser per `POST /api/sessions/join` beitritt
- **THEN** erhält der Spielleiter ein `session:participants`, das den neuen Nutzer mit
  `username: "sam"`, `role: "spieler"` und `online: false` und ohne Feld `alias` enthält

#### Scenario: Betreten setzt das Mitglied auf anwesend

- **GIVEN** ein Spielleiter, der seine Spielsitzung (`geoeffnet`) betreten hat, und ein
  Spieler-Mitglied mit Socket-Verbindung, das den Raum noch nicht betreten hat
- **WHEN** der Spieler `session:enter` sendet
- **THEN** erhält der Spielleiter ein `session:participants`, das den Spieler mit
  `online: true` enthält

#### Scenario: Verbindungsabbruch setzt das Mitglied auf abwesend

- **GIVEN** Spielleiter und ein Spieler haben den Raum betreten
- **WHEN** die Verbindung des Spielers endet
- **THEN** erhält der Spielleiter ein `session:participants`, das den Spieler weiterhin
  enthält, mit `online: false`, und die Mitgliedschaft existiert in der Datenbank weiterhin

#### Scenario: Teilnehmerliste enthält Nutzername und Alias, aber keine E-Mail

- **GIVEN** ein Spielleiter mit Nutzernamen `meister`, der seine Spielsitzung (`geoeffnet`)
  betreten hat, und ein Spieler-Mitglied mit Nutzernamen `sam`, dessen Mitgliedschaft den
  Alias `Gandalf` trägt
- **WHEN** der Spieler `session:enter` sendet
- **THEN** enthält `participants` im Acknowledgement des Spielers und im nächsten
  `session:participants` beim Spielleiter den Eintrag `{ username: "sam", alias:
  "Gandalf" }` und den Eintrag `{ username: "meister" }` ohne Feld `alias`, und kein Eintrag in
  beiden Listen trägt ein Feld `email`

### Requirement: Sitzungsoberfläche

Die Anwendung SHALL einem angemeldeten Nutzer seine Spielsitzungen mit Rolle und Zustand
zeigen sowie Formulare zum Erstellen (Name) und zum Beitreten (Code) anbieten; Abmelden und
Passwortänderung aus `user-auth` bleiben erreichbar. Nach Auswahl einer Spielsitzung SHALL
die Raumansicht deren Namen, Zustand und die Teilnehmerliste mit Anwesenheitskennzeichen
zeigen. Jeder Teilnehmer SHALL mit seinem Alias benannt werden, falls einer gesetzt ist,
sonst mit seinem Nutzernamen. Die eigene Zeile der Teilnehmerliste SHALL ein Eingabefeld für
den Alias mit dem aktuell gesetzten Wert anbieten; das Absenden SHALL `session:alias` mit dem
eingegebenen Wert senden. Die angezeigte Benennung SHALL der zuletzt vom Server gesendeten
Teilnehmerliste folgen, nicht der Eingabe (`constitution.md` §9.1); eine Ablehnung des
Servers SHALL als Meldung sichtbar sein. Dem Spielleiter SHALL sie zusätzlich den
Sitzungscode und die im aktuellen Zustand erlaubten Übergänge als Schaltflächen anbieten;
einem Spieler MUST NOT sie Code oder Steuerung zeigen. Der angezeigte Zustand SHALL dem
zuletzt vom Server gemeldeten folgen (`constitution.md` §9.1), nicht der zuletzt geklickten
Schaltfläche.

Erhält die Anwendung `session:replaced`, SHALL sie einen Hinweis zeigen, dass die
Spielsitzung an anderer Stelle geöffnet wurde, und MUST NOT sich von selbst neu verbinden
oder den Raum erneut betreten; ein erneutes Betreten erfolgt nur durch eine bewusste
Handlung des Nutzers. Erhält sie `session:ended`, SHALL sie zur Sitzungsliste zurückkehren
und einen Hinweis zeigen.

#### Scenario: Sitzungsliste mit Erstellen und Beitreten

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert eine
  Spielsitzung `Freitagsrunde` mit `role: "spielleiter"` und `status: "geschlossen"`
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie den Eintrag `Freitagsrunde` mit Rolle und Zustand, ein Eingabefeld für
  den Namen einer neuen Spielsitzung, ein Eingabefeld für einen Sitzungscode sowie weiterhin
  die Abmeldung

#### Scenario: Raumansicht des Spielleiters

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, `status: "geoeffnet"`, `code: "ABC234"` und zwei Teilnehmer, einen
  mit `online: true`, einen mit `online: false`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie den Code `ABC234`, den Zustand, beide Teilnehmer mit unterscheidbarem
  Anwesenheitskennzeichen sowie Schaltflächen für `starten` und `beenden`, aber keine für
  `oeffnen` oder `pausieren`

#### Scenario: Raumansicht des Spielers

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "gestartet"` und kein Feld `code`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie Namen, Zustand und Teilnehmerliste, aber keinen Sitzungscode und keine
  Schaltfläche für einen Zustandsübergang

#### Scenario: Zustand folgt dem Server

- **GIVEN** die Raumansicht eines Spielers zeigt den Zustand `geoeffnet`
- **WHEN** die Anwendung `session:status` mit `gestartet` erhält
- **THEN** zeigt sie den Zustand `gestartet`

#### Scenario: Ersetzte Verbindung verbindet sich nicht neu

- **GIVEN** die Raumansicht ist geöffnet und verbunden
- **WHEN** die Anwendung `session:replaced` und danach die Trennung der Verbindung erhält
- **THEN** zeigt sie einen Hinweis, dass die Spielsitzung an anderer Stelle geöffnet wurde,
  und löst weder einen erneuten Verbindungsaufbau noch ein erneutes `session:enter` aus

#### Scenario: Beendete Spielsitzung führt zur Liste zurück

- **GIVEN** die Raumansicht eines Spielers ist geöffnet
- **WHEN** die Anwendung `session:ended` erhält
- **THEN** zeigt sie die Sitzungsliste und einen Hinweis, dass die Spielsitzung beendet wurde

#### Scenario: Teilnehmer werden mit Alias oder Nutzername benannt

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt zwei
  Teilnehmer: `{ username: "sam", alias: "Gandalf der Graue" }` und `{ username: "meister" }`
  ohne Alias
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt die Teilnehmerliste `Gandalf der Graue` und `meister`, aber nicht `sam`

#### Scenario: Eigener Alias wird als Absicht gesendet und folgt dem Server

- **GIVEN** die Raumansicht eines angemeldeten Nutzers mit `userId` `U` und Nutzernamen
  `sam`, dessen Mitgliedschaft keinen Alias trägt, ist geöffnet
- **WHEN** der Nutzer im Alias-Feld seiner eigenen Zeile `Gandalf` eingibt und absendet
- **THEN** sendet die Anwendung `session:alias` mit `{ sessionId, alias: "Gandalf" }`, zeigt
  ihn weiterhin als `sam`, bis sie ein `session:participants` erhält, das ihn mit
  `alias: "Gandalf"` nennt, und zeigt ihn danach als `Gandalf`

#### Scenario: Abgelehnter Alias wird angezeigt

- **GIVEN** die Raumansicht eines angemeldeten Nutzers ist geöffnet
- **WHEN** er einen Alias absendet und das Acknowledgement `{ ok: false, message }` lautet
- **THEN** zeigt die Anwendung diese Meldung an, und die Teilnehmerliste ist unverändert
