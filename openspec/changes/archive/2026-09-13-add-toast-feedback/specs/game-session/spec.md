## MODIFIED Requirements

### Requirement: Sitzungsoberfläche

Die Anwendung SHALL einem angemeldeten Nutzer seine Spielsitzungen mit Rolle und Zustand
als Karten zeigen (`ui-start`, „Sitzungskarten") sowie das Erstellen (Name) und das
Beitreten (Code) als Aktionen anbieten, deren Formulare erst auf Anforderung erscheinen
(`ui-start`, „Erstellen und Beitreten auf Anforderung"); die Passwortänderung aus
`user-auth` bleibt in der Startansicht erreichbar, das Abmelden liegt in der Top-Bar der
App-Shell (`ui-shell`). Die Rückkehr aus Raum und Kartenbibliothek zur Sitzungsliste SHALL
ausschließlich über die Top-Bar erfolgen; Raum und Bibliothek MUST NOT eine eigene
Schaltfläche dafür zeigen. Nach Auswahl einer Spielsitzung SHALL die Raumansicht deren
Namen als Überschrift der Ebene 1, den Zustand als Zustandspille nach der
Zuordnungstabelle von `ui-start` (Text in der aktiven Sprache, Icon, Varianten-Klasse;
`ui-text`) und die Teilnehmerliste mit Anwesenheitskennzeichen zeigen; sie MUST NOT den
Rohwert des Zustands (`geoeffnet`, `gestartet`, `pausiert`, `geschlossen`) als Text zeigen. Jeder Teilnehmer
SHALL mit seinem Alias benannt werden, falls einer gesetzt ist, sonst mit seinem
Nutzernamen. Die eigene Zeile der Teilnehmerliste SHALL ein Eingabefeld für den Alias mit
dem aktuell gesetzten Wert anbieten; das Absenden SHALL `session:alias` mit dem
eingegebenen Wert senden. Die angezeigte Benennung SHALL der zuletzt vom Server gesendeten
Teilnehmerliste folgen, nicht der Eingabe (`constitution.md` §9.1); eine Ablehnung des
Servers SHALL als Meldung sichtbar sein. Dem Spielleiter SHALL sie zusätzlich den
Sitzungscode und die im aktuellen Zustand erlaubten Übergänge als Schaltflächen anbieten,
beschriftet mit dem Verb der Aktion in der aktiven Sprache (`ui-text`: `Öffnen`, `Starten`,
`Pausieren`, `Beenden`), nie mit dem Aktionsnamen des Vertrags (`oeffnen`, `starten`,
`pausieren`, `beenden`). Neben dem Sitzungscode SHALL sie dem Spielleiter eine Schaltfläche
`Kopieren` (Text der aktiven Sprache, `ui-text`) anbieten, die den Code in die Zwischenablage
legt; gelingt das, SHALL die Anwendung den Toast `Sitzungscode kopiert` auslösen
(`ui-feedback`), scheitert es, MUST NOT ein Toast erscheinen. Einem Spieler MUST NOT sie
Code, Schaltfläche `Kopieren` oder Steuerung zeigen. Der angezeigte Zustand SHALL dem
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
- **THEN** zeigt sie eine Karte `Freitagsrunde` mit der Rolle `Spielleiter` und dem Zustand
  `Geschlossen` sowie die Schaltflächen `Sitzung leiten` und `Beitreten`; ein Eingabefeld
  für den Namen einer neuen Spielsitzung erscheint erst nach Auslösen von `Sitzung leiten`,
  ein Eingabefeld für einen Sitzungscode erst nach Auslösen von `Beitreten`; die Abmeldung
  liegt in der Top-Bar (`ui-shell`, „Top-Bar"), und die Sitzungsliste zeigt keine
  Schaltfläche `Zurück`

#### Scenario: Raumansicht des Spielleiters

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, `status: "geoeffnet"`, `code: "ABC234"` und zwei Teilnehmer, einen
  mit `online: true`, einen mit `online: false`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie den Code `ABC234` mit einer Schaltfläche `Kopieren`, die Zustandspille `Geöffnet`
  (Klasse `status-pill`), beide Teilnehmer mit unterscheidbarem Anwesenheitskennzeichen sowie
  die Schaltflächen `Starten` und `Beenden`, aber keine Schaltfläche `Öffnen` oder `Pausieren`; kein Textknoten lautet
  `geoeffnet`, `starten` oder `beenden`

#### Scenario: Raumansicht des Spielers

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "gestartet"` und kein Feld `code`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie den Namen als Überschrift der Ebene 1, die Zustandspille `Läuft` mit der
  Klasse `status-pill--active` und die Teilnehmerliste, aber keinen Sitzungscode und keine Schaltfläche `Kopieren`,
  `Öffnen`, `Starten`, `Pausieren` oder `Beenden`; kein Textknoten lautet `gestartet`

#### Scenario: Sitzungscode wird kopiert

- **GIVEN** die Raumansicht des Spielleiters zeigt den Code `ABC234`, und die Zwischenablage
  des Browsers bestätigt das Schreiben
- **WHEN** die Schaltfläche `Kopieren` ausgelöst wird
- **THEN** wurde genau der Text `ABC234` in die Zwischenablage geschrieben, und der
  Toast-Host (`ui-feedback`) zeigt einen Toast `Sitzungscode kopiert`

#### Scenario: Gescheitertes Kopieren zeigt keinen Toast

- **GIVEN** die Raumansicht des Spielleiters zeigt den Code `ABC234`, und die Zwischenablage
  des Browsers lehnt das Schreiben ab
- **WHEN** die Schaltfläche `Kopieren` ausgelöst wird
- **THEN** zeigt der Toast-Host keinen Toast, und die Raumansicht bleibt mit dem Code
  `ABC234` gerendert

#### Scenario: Zustand folgt dem Server

- **GIVEN** die Raumansicht eines Spielers zeigt die Zustandspille `Geöffnet`
- **WHEN** die Anwendung `session:status` mit `gestartet` erhält
- **THEN** zeigt sie die Zustandspille `Läuft` mit der Klasse `status-pill--active`, und kein
  Textknoten lautet `gestartet` oder `geoeffnet`

#### Scenario: Wiederverbindung betritt den Raum erneut

- **GIVEN** die Raumansicht eines Spielers ist geöffnet: das erste Acknowledgement von
  `session:enter` nannte `status: "geoeffnet"` und einen Mitspieler mit Nutzernamen `meister`
  als `online: true`
- **WHEN** die Socket-Fassade eine Wiederverbindung meldet und das daraufhin gesendete
  `session:enter` mit `{ ok: true, ... }`, `status: "gestartet"` und `meister` als
  `online: false` bestätigt wird
- **THEN** hat die Anwendung `session:enter` genau zweimal mit der `sessionId` des Raums
  gesendet, genau eine Fassade erzeugt und genau einmal verbunden, und sie zeigt die Zustandspille
  `Läuft` und `meister` als abwesend

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
- **THEN** zeigt sie die Sitzungsliste (Schaltfläche `Sitzung leiten`) und einen Hinweis,
  dass die Spielsitzung beendet wurde

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
