## MODIFIED Requirements

### Requirement: Teilnehmerliste in Echtzeit

Der Server SHALL allen Verbindungen im Raum ein `session:participants`
`{ sessionId, participants }` senden, wenn sich Mitgliedschaft, Anwesenheit oder Alias
ändert: bei einem Beitritt per Code, beim Betreten des Raums, beim Verlassen
(Verbindungsabbruch oder Wechsel in einen anderen Raum) und beim Setzen oder Zurücksetzen
eines Alias. Beim Wechsel einer Verbindung in einen anderen Raum SHALL der **bisherige** Raum
ein `session:participants` erhalten, in dem der Wechselnde `online: false` ist; der
Wechselnde selbst MUST NOT diese Liste erhalten, weil er den Raum verlassen hat.
`participants` SHALL jedes Mitglied genau einmal enthalten, mit `userId`,
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

#### Scenario: Raumwechsel setzt das Mitglied im alten Raum auf abwesend

- **GIVEN** eine Spielsitzung `A` im Zustand `geoeffnet`, deren Spielleiter den Raum betreten
  hat, sowie ein Nutzer, der Spieler in `A` und Spielleiter einer zweiten Spielsitzung `B`
  ist und den Raum von `A` über eine Socket-Verbindung betreten hat
- **WHEN** dieser Nutzer über dieselbe Verbindung `session:enter` mit der `sessionId` von `B`
  sendet
- **THEN** lautet sein Acknowledgement `{ ok: true, ... }` mit `session.id` gleich `B`, und
  der Spielleiter von `A` erhält ein `session:participants` mit `sessionId` gleich `A`, das
  diesen Nutzer weiterhin enthält, mit `online: false`

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

Verbindet sich die Socket-Verbindung der Raumansicht nach einer Unterbrechung von selbst
wieder (Wiederverbindung durch den Client, nicht durch eine Handlung des Nutzers), SHALL die
Anwendung den Raum über dieselbe Verbindung erneut mit `session:enter` betreten und Zustand,
Teilnehmer und aktive Karte aus dem neuen Acknowledgement übernehmen — der Server kennt den
Raum einer Verbindung nach einer Trennung nicht mehr. Ein abgelehntes erneutes Betreten SHALL
wie ein abgelehntes erstes Betreten mit der Meldung des Servers angezeigt werden. Die
Anwendung MUST NOT dafür eine neue Verbindung aufbauen.

Erhält die Anwendung `session:replaced`, SHALL sie einen Hinweis zeigen, dass die
Spielsitzung an anderer Stelle geöffnet wurde, und MUST NOT sich von selbst neu verbinden
oder den Raum erneut betreten — auch nicht bei einer danach gemeldeten Wiederverbindung; ein
erneutes Betreten erfolgt nur durch eine bewusste Handlung des Nutzers. Erhält sie
`session:ended`, SHALL sie zur Sitzungsliste zurückkehren und einen Hinweis zeigen.

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

#### Scenario: Wiederverbindung betritt den Raum erneut

- **GIVEN** die Raumansicht eines Spielers ist geöffnet: das erste Acknowledgement von
  `session:enter` nannte `status: "geoeffnet"` und einen Mitspieler mit Nutzernamen `meister`
  als `online: true`
- **WHEN** die Socket-Fassade eine Wiederverbindung meldet und das daraufhin gesendete
  `session:enter` mit `{ ok: true, ... }`, `status: "gestartet"` und `meister` als
  `online: false` bestätigt wird
- **THEN** hat die Anwendung `session:enter` genau zweimal mit der `sessionId` des Raums
  gesendet, genau eine Fassade erzeugt und genau einmal verbunden, und sie zeigt den Zustand
  `gestartet` und `meister` als abwesend

#### Scenario: Ersetzte Verbindung verbindet sich nicht neu

- **GIVEN** die Raumansicht ist geöffnet und verbunden
- **WHEN** die Anwendung `session:replaced`, danach die Trennung der Verbindung und danach
  eine von der Socket-Fassade gemeldete Wiederverbindung erhält
- **THEN** zeigt sie einen Hinweis, dass die Spielsitzung an anderer Stelle geöffnet wurde,
  und hat weder einen erneuten Verbindungsaufbau noch ein erneutes `session:enter` ausgelöst
  (`session:enter` genau einmal gesendet)

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
