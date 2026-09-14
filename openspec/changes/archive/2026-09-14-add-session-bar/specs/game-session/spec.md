## ADDED Requirements

### Requirement: Spielsitzung umbenennen

Der Spielleiter SHALL den Namen seiner Spielsitzung mit `session:rename`
`{ sessionId, name }` ändern. Der Name SHALL vor der Prüfung an den Rändern getrimmt werden
und danach 1 bis 60 Zeichen lang sein — dieselbe Regel wie beim Erstellen (Requirement
„Spielsitzung erstellen"), aus demselben Schema des Vertrags. Die Berechtigung SHALL pro
Aktion geprüft werden wie jede andere Raumaktion (Requirement „Autorisierung pro Aktion",
`constitution.md` §9.3): ein Mitglied mit Rolle `spieler` und ein Nicht-Mitglied SHALL mit
`{ ok: false, message }` beantwortet werden.

Ein erlaubter Aufruf SHALL den Namen in der Datenbank ändern, mit `{ ok: true, name }`
(dem gespeicherten, getrimmten Wert) bestätigt werden und allen im Raum — den Absender
eingeschlossen — ein `session:renamed` `{ sessionId, name }` senden. Ein Ereignis, dessen
Payload nicht dem Vertrag entspricht — auch ein nach dem Trimmen leerer oder ein zu langer
Name — SHALL mit `{ ok: false, message }` beantwortet werden und MUST NOT etwas verändern.
Die Sitzungsliste (`GET /api/sessions`) SHALL danach den neuen Namen liefern.

#### Scenario: Spielleiter benennt die Spielsitzung um

- **GIVEN** eine Spielsitzung `Freitagsrunde` im Zustand `geoeffnet`, in deren Raum der
  Spielleiter und ein Spieler anwesend sind
- **WHEN** der Spielleiter `session:rename` mit `{ sessionId, name: "  Samstagsrunde  " }`
  (mit umgebenden Leerzeichen) sendet
- **THEN** lautet das Acknowledgement `{ ok: true, name: "Samstagsrunde" }`, die
  Spielsitzung trägt in der Datenbank den Namen `Samstagsrunde`, der Spieler und der
  Spielleiter erhalten je ein `session:renamed` mit `{ sessionId, name: "Samstagsrunde" }`,
  und `GET /api/sessions` des Spielers nennt die Spielsitzung mit `name: "Samstagsrunde"`

#### Scenario: Ungültiger Name wird abgelehnt

- **GIVEN** der Spielleiter ist im Raum seiner Spielsitzung `Freitagsrunde` anwesend
- **WHEN** er je ein `session:rename` mit `name: "   "` (nur Leerzeichen), mit einem Namen
  von 61 Zeichen und mit einer Payload, die kein Objekt ist (eine Zahl), sendet
- **THEN** lautet jedes Acknowledgement `{ ok: false, message }`, die Spielsitzung trägt in
  der Datenbank weiterhin den Namen `Freitagsrunde`, und kein `session:renamed` wurde
  gesendet

#### Scenario: Spieler darf nicht umbenennen

- **GIVEN** eine Spielsitzung `Freitagsrunde` im Zustand `geoeffnet`, in deren Raum der
  Spielleiter und ein Spieler anwesend sind
- **WHEN** der Spieler `session:rename` mit `{ sessionId, name: "Samstagsrunde" }` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, die Spielsitzung trägt in der
  Datenbank weiterhin den Namen `Freitagsrunde`, und der Spielleiter erhält kein
  `session:renamed`

#### Scenario: Nicht-Mitglied kann nicht umbenennen

- **GIVEN** eine Spielsitzung `Freitagsrunde` im Zustand `geoeffnet` und ein angemeldeter
  Nutzer ohne Mitgliedschaft mit Socket-Verbindung
- **WHEN** dieser `session:rename` mit der `sessionId` und `name: "Samstagsrunde"` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung trägt in
  der Datenbank weiterhin den Namen `Freitagsrunde`

## MODIFIED Requirements

### Requirement: Sitzungsoberfläche

Die Anwendung SHALL einem angemeldeten Nutzer seine Spielsitzungen mit Rolle und Zustand
als Karten zeigen (`ui-start`, „Sitzungskarten") sowie das Erstellen (Name) und das
Beitreten (Code) als Aktionen anbieten, deren Formulare erst auf Anforderung erscheinen
(`ui-start`, „Erstellen und Beitreten auf Anforderung"); die Passwortänderung aus
`user-auth` und das Abmelden liegen im Kontomenü der Top-Bar der App-Shell (`ui-shell`). Die Rückkehr aus Raum und Kartenbibliothek zur Sitzungsliste SHALL
über die Top-Bar erfolgen, aus dem Raum zusätzlich über den Eintrag `Verlassen` des
Verwaltungsmenüs der Session-Bar (`session-bar`, „Verwaltungsmenü"); Raum und Bibliothek
MUST NOT eine eigene Schaltfläche `Zurück` zeigen. Nach Auswahl einer Spielsitzung SHALL die Raumansicht als erstes
Element die Session-Bar (`session-bar`) zeigen — mit dem Namen der Spielsitzung als
Überschrift der Ebene 1 und dem Zustand als Zustandspille nach der Zuordnungstabelle von
`ui-start` (Text in der aktiven Sprache, Icon, Varianten-Klasse; `ui-text`) — und darunter
die Teilnehmerliste mit Anwesenheitskennzeichen; sie MUST NOT den Rohwert des Zustands
(`geoeffnet`, `gestartet`, `pausiert`, `geschlossen`) als Text zeigen. Der angezeigte Name
SHALL dem Acknowledgement von `session:enter` und danach jedem `session:renamed` folgen
(Requirement „Spielsitzung umbenennen"). Jeder Teilnehmer
SHALL mit seinem Alias benannt werden, falls einer gesetzt ist, sonst mit seinem
Nutzernamen. Die eigene Zeile der Teilnehmerliste SHALL ein Eingabefeld für den Alias mit
dem aktuell gesetzten Wert anbieten; das Absenden SHALL `session:alias` mit dem
eingegebenen Wert senden. Die angezeigte Benennung SHALL der zuletzt vom Server gesendeten
Teilnehmerliste folgen, nicht der Eingabe (`constitution.md` §9.1); eine Ablehnung des
Servers SHALL als Meldung sichtbar sein. Dem Spielleiter SHALL die Session-Bar zusätzlich
den Sitzungscode und die vier Übergänge des Vertrags als Icon-only-Schaltflächen anbieten,
benannt mit dem Verb der Aktion in der aktiven Sprache (`ui-text`: `Öffnen`, `Starten`,
`Pausieren`, `Beenden`), nie mit dem Aktionsnamen des Vertrags (`oeffnen`, `starten`,
`pausieren`, `beenden`); ein Übergang, den `allowedActions` im aktuellen Zustand nicht
enthält, ist `disabled`, nicht ausgeblendet (`session-bar`, „Übergänge"). `Beenden` SHALL
vor dem Senden einen Bestätigungsdialog zeigen; ein vom Server abgelehnter Übergang SHALL
als Inline-Meldung sichtbar sein. Der Sitzungscode SHALL maskiert stehen — so viele `•` wie
der Code Zeichen hat — mit einer Umschalt-Schaltfläche `Sitzungscode anzeigen`
(`aria-pressed`), die den Klartext an derselben Stelle ein- und ausblendet, und einer
Schaltfläche `Sitzungscode kopieren`, die den Code unabhängig von der Maske in die
Zwischenablage legt (`session-bar`, „Sitzungscode"); gelingt das, SHALL die Anwendung den
Toast `Sitzungscode kopiert` auslösen (`ui-feedback`), scheitert es, MUST NOT ein Toast
erscheinen. Solange die Umschalt-Schaltfläche nicht gedrückt ist, MUST NOT der Klartext des
Codes in der Ansicht stehen. Einem Spieler MUST NOT sie Maske, Umschalt-Schaltfläche,
Kopieren oder Übergänge zeigen. Der angezeigte Zustand SHALL dem zuletzt vom Server
gemeldeten folgen (`constitution.md` §9.1), nicht der zuletzt geklickten Schaltfläche.

Verbindet sich die Socket-Verbindung der Raumansicht nach einer Unterbrechung von selbst
wieder (Wiederverbindung durch den Client, nicht durch eine Handlung des Nutzers), SHALL die
Anwendung den Raum über dieselbe Verbindung erneut mit `session:enter` betreten und Zustand,
Teilnehmer und aktive Karte aus dem neuen Acknowledgement übernehmen — der Server kennt den
Raum einer Verbindung nach einer Trennung nicht mehr. Ein abgelehntes erneutes Betreten SHALL
wie ein abgelehntes erstes Betreten mit der Meldung des Servers angezeigt werden. Die
Anwendung MUST NOT dafür eine neue Verbindung aufbauen.

Erhält die Anwendung `session:replaced`, SHALL sie einen `alertdialog` (`ui-dialog`) mit dem
Titel `An anderer Stelle geöffnet`, der Beschreibung
`Diese Spielsitzung wurde an anderer Stelle geöffnet.` und den Schaltflächen
`Hier weiterspielen` und `Zur Übersicht` zeigen (`ui-text`); die Raumansicht bleibt
dahinter gerendert, und es MUST NOT ein Zustandsbanner (`ui-status`) erscheinen. Sie MUST
NOT sich von selbst neu verbinden oder den Raum erneut betreten — auch nicht bei einer danach
gemeldeten Wiederverbindung; `Hier weiterspielen` SHALL eine neue Verbindung aufbauen und den
Raum erneut betreten, `Zur Übersicht` sowie das Schließen des Dialogs (Esc, `Schließen`)
SHALL zur Sitzungsliste führen. Erhält sie `session:ended`, SHALL sie einen `alertdialog`
mit dem Titel `Sitzung beendet`, der Beschreibung
`Die Spielleitung hat die Sitzung beendet. Du wirst zur Übersicht geleitet.` und der
Schaltfläche `Zur Übersicht` zeigen; die Schaltfläche, das Schließen des Dialogs (Esc,
`Schließen`) und der Ablauf von 4000 Millisekunden SHALL zur Sitzungsliste mit dem Hinweis
`Die Spielsitzung wurde beendet.` führen, genau einmal — der Timer wird beim Verlassen
geräumt. Treffen `session:replaced` und `session:ended` zusammen, SHALL nur der
Sitzungsende-Dialog erscheinen.

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
- **THEN** zeigt sie in der Gruppe `Sitzung` den Namen als Überschrift der Ebene 1, die
  Maske `••••••` mit der Umschalt-Schaltfläche `Sitzungscode anzeigen` (`aria-pressed="false"`)
  und der Schaltfläche `Sitzungscode kopieren`, keinen Textknoten `ABC234`, die Zustandspille
  `Geöffnet` (Klasse `status-pill`), beide Teilnehmer mit unterscheidbarem
  Anwesenheitskennzeichen sowie die vier Schaltflächen `Öffnen`, `Starten`, `Pausieren` und
  `Beenden`, von denen `Starten` und `Beenden` nicht `disabled` sind und `Öffnen` und
  `Pausieren` `disabled` sind; kein Textknoten lautet `geoeffnet`, `starten` oder `beenden`

#### Scenario: Raumansicht des Spielers

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "gestartet"` und kein Feld `code`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie in der Gruppe `Sitzung` den Namen als Überschrift der Ebene 1 und die
  Zustandspille `Läuft` mit der Klasse `status-pill--active`, darunter die Teilnehmerliste,
  aber weder die Maske `••••••` noch eine Schaltfläche `Sitzungscode anzeigen`,
  `Sitzungscode kopieren`, `Umbenennen`, `Öffnen`, `Starten`, `Pausieren` oder `Beenden`;
  kein Textknoten lautet `gestartet`

#### Scenario: Sitzungscode wird kopiert

- **GIVEN** die Raumansicht des Spielleiters (Code `ABC234`) ist gerendert, der Code ist
  maskiert (`••••••`), und die Zwischenablage des Browsers bestätigt das Schreiben
- **WHEN** die Schaltfläche `Sitzungscode kopieren` ausgelöst wird
- **THEN** wurde genau der Text `ABC234` in die Zwischenablage geschrieben, der Toast-Host
  (`ui-feedback`) zeigt einen Toast `Sitzungscode kopiert`, und die Ansicht zeigt weiterhin
  die Maske `••••••` und keinen Textknoten `ABC234`

#### Scenario: Gescheitertes Kopieren zeigt keinen Toast

- **GIVEN** die Raumansicht des Spielleiters (Code `ABC234`) ist gerendert, und die
  Zwischenablage des Browsers lehnt das Schreiben ab
- **WHEN** die Schaltfläche `Sitzungscode kopieren` ausgelöst wird
- **THEN** zeigt der Toast-Host keinen Toast, und die Ansicht zeigt weiterhin die Maske
  `••••••`

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
- **THEN** zeigt sie einen `alertdialog` mit dem Namen `An anderer Stelle geöffnet`, der
  Beschreibung `Diese Spielsitzung wurde an anderer Stelle geöffnet.` und den Schaltflächen
  `Hier weiterspielen` und `Zur Übersicht`, zeigt weiterhin die Überschrift der Ebene 1 mit
  dem Sitzungsnamen, zeigt kein Zustandsbanner (weder `Verbindung vom Server getrennt.` noch
  `Verbindung unterbrochen — verbinde neu…`), und hat weder einen erneuten
  Verbindungsaufbau noch ein erneutes `session:enter` ausgelöst (`session:enter` genau
  einmal gesendet)

#### Scenario: Beendete Spielsitzung führt zur Liste zurück

- **GIVEN** die Raumansicht eines Spielers ist geöffnet
- **WHEN** die Anwendung `session:ended` erhält und der Nutzer danach im Dialog
  `Zur Übersicht` auslöst
- **THEN** zeigte sie nach `session:ended` einen `alertdialog` mit dem Namen
  `Sitzung beendet`, der Beschreibung
  `Die Spielleitung hat die Sitzung beendet. Du wirst zur Übersicht geleitet.` und der
  Schaltfläche `Zur Übersicht`, und zeigt nach dem Auslösen die Sitzungsliste (Schaltfläche
  `Sitzung leiten`) und den Hinweis `Die Spielsitzung wurde beendet.`

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

#### Scenario: Hier weiterspielen baut eine neue Verbindung auf

- **GIVEN** die Raumansicht zeigt nach `session:replaced` und der Trennung der Verbindung den
  Dialog `An anderer Stelle geöffnet`, und `session:enter` wird beim nächsten Aufruf mit
  `{ ok: true, ... }` bestätigt
- **WHEN** der Nutzer `Hier weiterspielen` auslöst
- **THEN** ist kein `alertdialog` mehr sichtbar, die Anwendung hat eine zweite Fassade erzeugt,
  ein zweites Mal verbunden und `session:enter` ein zweites Mal mit der `sessionId` gesendet,
  und sie zeigt die Überschrift der Ebene 1 mit dem Sitzungsnamen

#### Scenario: Zur Übersicht verlässt den ersetzten Raum

- **GIVEN** die Raumansicht zeigt nach `session:replaced` und der Trennung der Verbindung den
  Dialog `An anderer Stelle geöffnet`
- **WHEN** der Nutzer im Dialog `Zur Übersicht` auslöst
- **THEN** zeigt sie die Sitzungsliste (Schaltfläche `Sitzung leiten`), kein `alertdialog`
  ist sichtbar, und `session:enter` wurde genau einmal gesendet

#### Scenario: Esc verlässt den ersetzten Raum

- **GIVEN** die Raumansicht zeigt nach `session:replaced` und der Trennung der Verbindung den
  Dialog `An anderer Stelle geöffnet`
- **WHEN** die Taste Escape auf dem Dokument ausgelöst wird
- **THEN** zeigt sie die Sitzungsliste (Schaltfläche `Sitzung leiten`), und `session:enter`
  wurde genau einmal gesendet

#### Scenario: Sitzungsende leitet nach vier Sekunden weiter

- **GIVEN** die Raumansicht eines Spielers ist geöffnet, und es gelten falsche Timer
- **WHEN** die Anwendung `session:ended` erhält und danach 3999 Millisekunden vergehen
- **THEN** zeigt sie noch den `alertdialog` `Sitzung beendet` und die Überschrift der Ebene 1
  mit dem Sitzungsnamen; und nachdem eine weitere Millisekunde vergangen ist, zeigt sie die
  Sitzungsliste (Schaltfläche `Sitzung leiten`) und den Hinweis
  `Die Spielsitzung wurde beendet.`

#### Scenario: Schließen des Sitzungsende-Dialogs führt zur Übersicht

- **GIVEN** die Raumansicht eines Spielers zeigt nach `session:ended` den Dialog
  `Sitzung beendet`, und es gelten falsche Timer
- **WHEN** der Nutzer die Schaltfläche `Schließen` des Dialogs auslöst und danach 4000
  Millisekunden vergehen
- **THEN** zeigt sie die Sitzungsliste (Schaltfläche `Sitzung leiten`) mit genau einem
  Element der Rolle `alert`, dessen Text `Die Spielsitzung wurde beendet.` lautet

#### Scenario: Sitzungscode-Popover zeigt den Klartext

- **GIVEN** die Raumansicht des Spielleiters (Code `ABC234`) ist gerendert und zeigt die
  Maske `••••••`
- **WHEN** er die Umschalt-Schaltfläche `Sitzungscode anzeigen` auslöst
- **THEN** zeigt das `<code>`-Element `Sitzungscode` den Text `ABC234`, die Maske `••••••`
  ist nicht mehr in der Ansicht, die Schaltfläche trägt `aria-pressed="true"` und es existiert
  kein Element der Rolle `dialog`; nach erneutem Auslösen zeigt das `<code>`-Element wieder
  `••••••`, kein Textknoten lautet `ABC234`, und die Schaltfläche trägt
  `aria-pressed="false"`
