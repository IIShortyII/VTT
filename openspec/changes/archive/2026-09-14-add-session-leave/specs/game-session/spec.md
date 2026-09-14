## ADDED Requirements

### Requirement: Verlassen einer Spielsitzung und Entfernen eines Spielers

Das System SHALL über `DELETE /api/sessions/:id/members/:userId` das Beenden einer
Spieler-Mitgliedschaft erlauben. Die Berechtigung SHALL pro Aktion aus der Datenbank geprüft
werden (`constitution.md` §9.3): Der anfragende Nutzer MUST Mitglied der Spielsitzung `:id`
sein, und erlaubt ist genau

- der **Selbstaustritt** — `:userId` gleich der eigenen `userId` und die eigene Rolle
  `spieler` —, sowie
- das **Entfernen durch den Spielleiter** — die eigene Rolle `spielleiter` und `:userId` eine
  Mitgliedschaft mit Rolle `spieler` derselben Spielsitzung.

Jede andere Kombination — ein Spieler, der eine fremde `:userId` nennt; ein Nutzer, der eine
`spielleiter`-Mitgliedschaft nennt (auch die eigene); ein Nicht-Mitglied — SHALL mit `403`
beantwortet werden und MUST NOT etwas verändern. Nennt `:userId` keine Mitgliedschaft dieser
Spielsitzung, SHALL der Server mit `404` antworten und nichts verändern. Ohne gültige
Anmelde-Sitzung gilt `401` (Requirement „Sitzungsrouten verlangen eine Anmeldung"). Das
Verlassen und Entfernen SHALL in jedem Zustand der Spielsitzung möglich sein.

Ein erlaubtes Verlassen oder Entfernen SHALL in **einer** Datenbank-Transaktion geschehen und
dabei die Mitgliedschaft löschen sowie die abhängigen Daten dieser Spielsitzung bereinigen:
die Tokens des Betroffenen (Requirement „Bereinigung der Tokens beim Verlassen" in
`session-token`) und seine Anmerkungen (Requirement „Bereinigung der Anmerkungen beim
Verlassen" in `session-annotation`). Scheitert ein Teil, MUST NOT ein Teil der Bereinigung
oder die Löschung der Mitgliedschaft bestehen bleiben.

Nach erfolgreicher Transaktion SHALL der Server mit `200` antworten und allen im Raum
verbliebenen Verbindungen ein `session:participants` senden, das die entfernte Mitgliedschaft
nicht mehr enthält (Requirement „Teilnehmerliste in Echtzeit"). Ist der Betroffene über eine
oder mehrere Verbindungen im Raum anwesend, SHALL der Server diesen `session:removed`
`{ sessionId }` senden und sie **sofort** aus dem Raum entfernen, sodass sie kein weiteres
Ereignis dieser Spielsitzung mehr empfangen — nicht erst beim nächsten Verbindungsaufbau
(`constitution.md` §9.2/§9.3). Ein erneuter Beitritt des Betroffenen SHALL wieder den
Sitzungscode über `POST /api/sessions/join` erfordern; ein `session:enter` ohne erneute
Mitgliedschaft SHALL wie bei jedem Nicht-Mitglied abgelehnt werden.

#### Scenario: Spieler verlässt die Spielsitzung

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit einem Spielleiter und einem
  Spieler-Mitglied `sam`
- **WHEN** `DELETE /api/sessions/:id/members/:userId` mit der `userId` von `sam`, gesendet mit
  dem Cookie von `sam`, eingeht
- **THEN** antwortet der Server mit `200`, und in der Datenbank existiert keine Mitgliedschaft
  von `sam` zu dieser Spielsitzung mehr

#### Scenario: Spielleiter entfernt einen Spieler

- **GIVEN** eine Spielsitzung mit einem Spielleiter und einem Spieler-Mitglied `tom`
- **WHEN** `DELETE /api/sessions/:id/members/:userId` mit der `userId` von `tom`, gesendet mit
  dem Cookie des Spielleiters, eingeht
- **THEN** antwortet der Server mit `200`, und in der Datenbank existiert die Mitgliedschaft
  von `tom` zu dieser Spielsitzung nicht mehr

#### Scenario: Spieler darf keinen anderen Spieler entfernen

- **GIVEN** eine Spielsitzung mit zwei Spieler-Mitgliedern `sam` und `tom`
- **WHEN** `DELETE /api/sessions/:id/members/:userId` mit der `userId` von `tom`, gesendet mit
  dem Cookie von `sam`, eingeht
- **THEN** antwortet der Server mit `403`, und die Mitgliedschaft von `tom` existiert in der
  Datenbank weiterhin

#### Scenario: Spielleiter kann über diese Route nicht selbst austreten

- **GIVEN** eine Spielsitzung, deren Spielleiter angemeldet ist
- **WHEN** `DELETE /api/sessions/:id/members/:userId` mit der eigenen `userId`, gesendet mit
  dem Cookie des Spielleiters, eingeht
- **THEN** antwortet der Server mit `403`, und die Mitgliedschaft des Spielleiters existiert
  in der Datenbank weiterhin

#### Scenario: Unbekannte Mitgliedschaft

- **GIVEN** eine Spielsitzung mit einem Spielleiter und ein angemeldeter Nutzer `x`, der nicht
  Mitglied dieser Spielsitzung ist
- **WHEN** der Spielleiter `DELETE /api/sessions/:id/members/:userId` mit der `userId` von `x`
  sendet
- **THEN** antwortet der Server mit `404`, und in der Datenbank ändert sich keine
  Mitgliedschaft dieser Spielsitzung

#### Scenario: Entfernter anwesender Spieler verliert den Raum sofort

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, in deren Raum der Spielleiter und der
  Spieler `sam` über eine Socket-Verbindung anwesend sind
- **WHEN** der Spielleiter `DELETE /api/sessions/:id/members/:userId` mit der `userId` von
  `sam` sendet
- **THEN** erhält `sam` `session:removed` mit der `sessionId`, `sam` empfängt das aus der
  Entfernung ausgelöste `session:participants` **nicht** (seine Verbindung ist nicht mehr im
  Raum), und in der Datenbank existiert die Mitgliedschaft von `sam` nicht mehr

## MODIFIED Requirements

### Requirement: Sitzungsrouten verlangen eine Anmeldung

Alle Routen unter `/api/sessions` SHALL ohne gültige Anmelde-Sitzung mit `401` antworten
und MUST NOT in die Datenbank schreiben.

#### Scenario: Sitzungsrouten ohne Cookie

- **GIVEN** kein Sitzungscookie
- **WHEN** `POST /api/sessions` mit gültigem Namen, `POST /api/sessions/join` mit einem
  gültigen Code, `GET /api/sessions` und `DELETE /api/sessions/:id/members/:userId` eingehen
- **THEN** antwortet der Server jedes Mal mit `401`, und die Anzahl der Spielsitzungen und
  Mitgliedschaften in der Datenbank ist unverändert

### Requirement: Teilnehmerliste in Echtzeit

Der Server SHALL allen Verbindungen im Raum ein `session:participants`
`{ sessionId, participants }` senden, wenn sich Mitgliedschaft, Anwesenheit oder Alias
ändert: bei einem Beitritt per Code, beim Betreten des Raums, beim Verlassen
(Verbindungsabbruch oder Wechsel in einen anderen Raum), beim Austritt eines Spielers oder Entfernen durch den Spielleiter und beim Setzen oder Zurücksetzen
eines Alias. Beim Wechsel einer Verbindung in einen anderen Raum SHALL der **bisherige** Raum
ein `session:participants` erhalten, in dem der Wechselnde `online: false` ist; der
Wechselnde selbst MUST NOT diese Liste erhalten, weil er den Raum verlassen hat.
`participants` SHALL jedes Mitglied genau einmal enthalten, mit `userId`,
`username`, `role` und `online` sowie `alias`, falls die Mitgliedschaft einen trägt. Die
E-Mail eines Mitglieds MUST NOT enthalten sein — weder in `session:participants` noch im
Acknowledgement von `session:enter` (`constitution.md` §9.2). Ein Mitglied, dessen Verbindung
endet, bleibt Mitglied und wird `online: false`. Ein Mitglied, das die Spielsitzung
verlässt oder vom Spielleiter entfernt wird, verliert seine Mitgliedschaft und MUST NOT in
der danach gesendeten Liste erscheinen — weder als `online: true` noch als `online: false`.

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

#### Scenario: Entfernter Spieler verschwindet aus der Liste

- **GIVEN** ein Spielleiter, der seine Spielsitzung (`geoeffnet`) betreten hat, und ein
  Spieler-Mitglied `sam`, das den Raum betreten hat
- **WHEN** der Spielleiter `DELETE /api/sessions/:id/members/:userId` mit der `userId` von
  `sam` sendet
- **THEN** erhält der Spielleiter ein `session:participants`, das `sam` nicht mehr enthält
  (weder mit `online: true` noch mit `online: false`), und in der Datenbank existiert die
  Mitgliedschaft von `sam` zu dieser Spielsitzung nicht mehr

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
die Reiterliste `Bereiche` (`session-tabs`, „Bereiche der Raumansicht"), in deren Reiter
`Teilnehmer` die Teilnehmerliste mit Anwesenheitskennzeichen liegt; sie MUST NOT den
Rohwert des Zustands
(`geoeffnet`, `gestartet`, `pausiert`, `geschlossen`) als Text zeigen. Der angezeigte Name
SHALL dem Acknowledgement von `session:enter` und danach jedem `session:renamed` folgen
(Requirement „Spielsitzung umbenennen"). Jeder Teilnehmer
SHALL mit seinem Alias benannt werden, falls einer gesetzt ist, sonst mit seinem
Nutzernamen. Die eigene Zeile der Teilnehmerliste SHALL ein Eingabefeld für den Alias mit
dem aktuell gesetzten Wert anbieten; das Absenden SHALL `session:alias` mit dem
eingegebenen Wert senden. Die eigene Zeile eines Spielers SHALL zusätzlich die Aktion `Austreten` tragen; die eigene Zeile des Spielleiters MUST NOT sie tragen. Dem Spielleiter SHALL jede Spieler-Zeile die Aktion `Entfernen` tragen; einem Spieler MUST NOT eine fremde Zeile eine solche Aktion zeigen. Das Auslösen von `Austreten` oder `Entfernen` SHALL `DELETE /api/sessions/:id/members/:userId` mit der `userId` der betroffenen Zeile senden. Die angezeigte Benennung SHALL der zuletzt vom Server gesendeten
Teilnehmerliste folgen, nicht der Eingabe (`constitution.md` §9.1); eine Ablehnung des
Servers SHALL als Meldung sichtbar sein. Szenarien dieses Requirements, die Elemente eines Reiters adressieren, setzen voraus,
dass der Testaufbau diesen Reiter vorher per Klick aktiviert hat (`session-tabs`,
„Testaufbau-Konvention"): Teilnehmerliste und Alias-Formular liegen im Reiter `Teilnehmer`. Der Reiter `Karte` ist beim Betreten aktiv.
Dem Spielleiter SHALL die Session-Bar zusätzlich
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
Sitzungsende-Dialog erscheinen. Erhält die Anwendung `session:removed`, SHALL sie zur
Sitzungsliste zurückkehren und den Hinweis `Du wurdest aus der Spielsitzung entfernt.`
(`ui-text`) zeigen.

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
  `Geöffnet` (Klasse `status-pill`), unter der Gruppe die Reiterliste `Bereiche` mit den
  Reitern `Karte`, `Tokens`, `Karten & Nebel`, `Teilnehmer` sowie die vier Schaltflächen `Öffnen`, `Starten`, `Pausieren` und
  `Beenden`, von denen `Starten` und `Beenden` nicht `disabled` sind und `Öffnen` und
  `Pausieren` `disabled` sind; kein Textknoten lautet `geoeffnet`, `starten` oder `beenden`

#### Scenario: Raumansicht des Spielers

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "gestartet"` und kein Feld `code`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie in der Gruppe `Sitzung` den Namen als Überschrift der Ebene 1 und die
  Zustandspille `Läuft` mit der Klasse `status-pill--active`, darunter die Reiterliste
  `Bereiche` mit den Reitern `Karte`, `Tokens`, `Teilnehmer` (kein Reiter `Karten & Nebel`),
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
- **WHEN** die Raumansicht gerendert wird und der Reiter `Teilnehmer` geklickt wird
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

#### Scenario: Spieler tritt über die eigene Zeile aus

- **GIVEN** die Raumansicht eines Spielers mit Nutzernamen `sam` und `userId` `U` ist
  geöffnet, und die Teilnehmerliste nennt `sam` (die eigene Zeile) und einen Spielleiter
  `meister`
- **WHEN** der Reiter `Teilnehmer` aktiviert wird und `sam` in seiner eigenen Zeile die
  Schaltfläche `Austreten` auslöst
- **THEN** trägt die eigene Zeile von `sam` eine Schaltfläche `Austreten`, keine Zeile trägt
  für ihn eine Schaltfläche `Entfernen`, und das Auslösen sendet `DELETE
  /api/sessions/:id/members/U`

#### Scenario: Spielleiter entfernt über die Spielerzeile

- **GIVEN** die Raumansicht des Spielleiters `meister` (die eigene Zeile) ist geöffnet, und
  die Teilnehmerliste nennt zusätzlich einen Spieler `sam` mit `userId` `U`
- **WHEN** der Reiter `Teilnehmer` aktiviert wird und der Spielleiter in der Zeile von `sam`
  die Schaltfläche `Entfernen` auslöst
- **THEN** trägt die Zeile von `sam` eine Schaltfläche `Entfernen`, die eigene Zeile von
  `meister` trägt weder `Entfernen` noch `Austreten`, und das Auslösen sendet `DELETE
  /api/sessions/:id/members/U`

#### Scenario: Entfernt-Ereignis führt zur Sitzungsliste

- **GIVEN** die Raumansicht eines Spielers ist geöffnet
- **WHEN** die Anwendung `session:removed` mit der `sessionId` des Raums erhält
- **THEN** zeigt sie die Sitzungsliste (Schaltfläche `Sitzung leiten`), die Raumansicht ist
  nicht mehr gerendert (keine Gruppe `Sitzung`), und es existiert genau ein Element der Rolle
  `alert` mit dem Text `Du wurdest aus der Spielsitzung entfernt.`
