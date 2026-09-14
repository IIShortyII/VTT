## MODIFIED Requirements

### Requirement: Sprachschalter in der Top-Bar

Die Top-Bar SHALL in jeder Ansicht — anonym, Startansicht, Raumansicht, Kartenbibliothek —
den Sprachschalter zeigen: eine Gruppe mit dem zugänglichen Namen `Sprache` (unter Englisch
`Language`) und den Schaltflächen `Deutsch` (Text `DE`) und `English` (Text `EN`). Die
Schaltfläche der aktiven Sprache SHALL `disabled` sein und `aria-current="true"` tragen; die
Schaltfläche der anderen Sprache SHALL auslösbar sein und MUST NOT `aria-current` tragen.
Das Auslösen SHALL die aktive Sprache setzen („Sprachwahl"). Die sichtbaren Texte der
angemeldeten Startansicht und der Raumansicht (Zustandspille, Übergangs-Verben, Konto,
Kontomenü, Sitzungscode-Popover, `Zurück`, die Trigger der Spieler-Leiste) SHALL der
aktiven Sprache folgen; Nutzername,
Sitzungsname, Sitzungscode und die Marke `VTT` sind Daten bzw. Eigennamen und MUST NOT
übersetzt werden. Die Abmeldung liegt im Kontomenü (`ui-shell`, „Top-Bar") und der
Sitzungscode hinter der Maske (`ui-menu`, „Popover"); beide sind erst nach dem Öffnen des
jeweiligen Menüs bzw. Popovers sichtbar.

#### Scenario: Schalter zeigt die aktive Sprache

- **GIVEN** der Browserspeicher enthält keinen Eintrag `vtt.locale`, und der Server meldet
  keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält das `<header>` eine Gruppe `Sprache` mit genau zwei Schaltflächen:
  `Deutsch` mit dem Text `DE`, `disabled` und `aria-current="true"`, sowie `English` mit dem
  Text `EN`, nicht `disabled` und ohne `aria-current`

#### Scenario: Nach dem Umschalten wandert die Markierung

- **GIVEN** die Anwendung ist für einen nicht angemeldeten Besucher gerendert, und die
  Gruppe `Sprache` zeigt `Deutsch` als aktive Sprache
- **WHEN** der Besucher `English` auslöst
- **THEN** heißt die Gruppe `Language`, `English` ist `disabled` und trägt
  `aria-current="true"`, und `Deutsch` ist nicht `disabled` und trägt kein `aria-current`

#### Scenario: Angemeldete Startansicht unter Englisch

- **GIVEN** der Server meldet einen angemeldeten Nutzer mit dem Nutzernamen `Gandalf`, und
  `GET /api/sessions` liefert `Freitagsrunde` (`status: "gestartet"`, `role: "spielleiter"`);
  die Anwendung ist gerendert und zeigt die Schaltfläche `Sitzung leiten`
- **WHEN** der Nutzer die Schaltfläche `English` in der Top-Bar auslöst und danach die
  Menü-Schaltfläche `Gandalf` im `<header>` auslöst
- **THEN** zeigt sie die Überschrift der Ebene 1 `My game sessions`, die Schaltflächen
  `Run a session`, `Join` und `Map library`, die Liste `My game sessions` mit
  einem Eintrag, der die Überschrift `Freitagsrunde`, den Text `Running`, den Text
  `Game master` und die Schaltfläche `Enter` enthält, die Menü-Schaltfläche `Gandalf` im
  `<header>`, ein Menü `Gandalf` mit den Einträgen `Change password` und `Log out` in dieser
  Reihenfolge und den Text `Version 0.0.0-dev · Build dev` im `<footer>`; es gibt weder eine
  Schaltfläche `Sitzung leiten` oder `Log out` noch einen Menüeintrag `Abmelden` noch den
  Text `Läuft`

#### Scenario: Raumansicht unter Englisch

- **GIVEN** der Browserspeicher enthält `vtt.locale` mit dem Wert `en`; der Server meldet
  einen angemeldeten Nutzer, `GET /api/sessions` liefert `Freitagsrunde`
  (`status: "geoeffnet"`, `role: "spielleiter"`), und das Acknowledgement von
  `session:enter` nennt `role: "spielleiter"`, `status: "geoeffnet"` und `code: "ABC234"`
- **WHEN** der Nutzer die Schaltfläche `Enter` der Karte auslöst, die Raumansicht
  gerendert ist (Überschrift der Ebene 1 `Freitagsrunde`) und er die Umschalt-Schaltfläche
  `Show session code` auslöst
- **THEN** zeigt das `<header>` die Schaltfläche `Back` und die Gruppe `Language`, die
  Raumansicht zeigt die Gruppe `Session` mit der Zustandspille `Open` (Klasse
  `status-pill`), dem `<code>`-Element `Session code` mit dem Text `ABC234`, den
  Schaltflächen `Show session code` (`aria-pressed="true"`), `Copy session code`,
  `Rename`, `Open`, `Start`, `Pause`, `End` und der Menü-Schaltfläche `Session settings`;
  es gibt keine Schaltfläche `Zurück`, `Starten`, `Beenden`, `Sitzungscode anzeigen`,
  `Sitzungscode kopieren` oder `Umbenennen` und keinen Text `Geöffnet`

#### Scenario: Spieler-Raumansicht unter Englisch

- **GIVEN** der Browserspeicher enthält `vtt.locale` mit dem Wert `en`; der Server meldet
  einen angemeldeten Nutzer, `GET /api/sessions` liefert `Freitagsrunde`
  (`status: "gestartet"`, `role: "spieler"`), und das Acknowledgement von `session:enter`
  nennt `role: "spieler"`, `status: "gestartet"`, kein Feld `code` und einen Teilnehmer
  `{ userId: "U", username: "sam" }`
- **WHEN** der Nutzer die Schaltfläche `Enter` der Karte auslöst und die Raumansicht
  gerendert ist (Überschrift der Ebene 1 `Freitagsrunde`)
- **THEN** zeigt das `<header>` die Schaltfläche `Back` und die Gruppe `Language`, die
  Raumansicht zeigt die Gruppe `Session` mit der Zustandspille `Running` (Klasse
  `status-pill`), der Rollen-Pille `Player` und den Triggern `Tokens`, `Annotations` und
  `Participants`; es gibt keine Reiterliste `Bereiche` und keinen Text `Läuft`, `Spieler`,
  `Anmerkungen` oder `Teilnehmer`
