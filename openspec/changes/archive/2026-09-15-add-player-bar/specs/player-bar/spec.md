## ADDED Requirements

### Requirement: Aufbau der Spieler-Leiste

Für die Rolle `spieler` SHALL die Raumansicht als erstes Element die Spieler-Leiste
rendern, sobald das Acknowledgement von `session:enter` vorliegt — statt der Session-Bar und
statt der Reiterliste `Bereiche` (`session-tabs`, „Bereiche der Raumansicht"). Die
Spieler-Leiste SHALL Identität (Avatar, Name der Spielsitzung, Rollen-Pille), Zustandsgruppe
(Zustandspille) und Trigger-Gruppe (die drei On-Demand-Trigger und die Verbindungsanzeige)
tragen. Sie zeigt ausschließlich, was der Server gemeldet hat, und sendet Absichten
(`constitution.md` §9.1); sie MUST NOT einen Sitzungscode, eine Maske, eine
Umschalt-Schaltfläche, eine Kopieren-Schaltfläche, eine `Umbenennen`-Schaltfläche oder einen
der Übergänge `Öffnen`, `Starten`, `Pausieren`, `Beenden` enthalten — der Server sendet dem
Spieler keinen Code (`constitution.md` §9.2), und Steuerung wie Umbenennen bleiben dem
Spielleiter vorbehalten. Der Name in der Leiste SHALL die einzige Überschrift der Ebene 1
der Raumansicht sein. Alle Texte der Leiste SHALL Texte der aktiven Sprache sein
(`ui-text`). Die Leiste MUST NOT breiter als ihr Container werden; ob der Name per Ellipsis
schrumpft, wird im App-Test abgenommen (`constitution.md` §3.4).

#### Scenario: Leiste des Spielers trägt Identität, Zustand und drei Trigger

- **GIVEN** die Anwendung hat den Raum als Spieler mit `userId` `U` betreten, und das
  Acknowledgement nennt `role: "spieler"`, `status: "gestartet"`, `name: "Freitagsrunde"`,
  kein Feld `code` und einen Teilnehmer `{ userId: "U", username: "sam", alias: "Gandalf" }`
- **WHEN** die Raumansicht gerendert wird
- **THEN** existiert genau eine Gruppe `Sitzung`; sie enthält in Dokumentreihenfolge ein
  Element der Rolle `img` mit dem zugänglichen Namen `Gandalf` (der Avatar), die Überschrift
  der Ebene 1 `Freitagsrunde`, die Rollen-Pille `Spieler` (Klasse `chip`), die Zustandspille
  `Läuft` (Klasse `status-pill`), die drei Schaltflächen `Tokens`, `Anmerkungen`,
  `Teilnehmer` in dieser Reihenfolge und die Verbindungsanzeige; die Gruppe `Sitzung` enthält
  keine Reiterliste `Bereiche`, kein `<code>`-Element und keine Schaltfläche `Sitzungscode
  anzeigen`, `Sitzungscode kopieren`, `Umbenennen`, `Öffnen`, `Starten`, `Pausieren` oder
  `Beenden`; die Gruppe `Sitzung` liegt im Dokument vor der Kartenansicht

### Requirement: Verbindungsanzeige

Die Trigger-Gruppe SHALL eine Verbindungsanzeige tragen — ein Element der Rolle `img` mit
dem Attribut `data-connected` (`"true"`, solange keine Trennung gemeldet ist, sonst
`"false"`) und dem zugänglichen Namen `Verbindung aktiv` bzw. `Verbindung getrennt`. Sie
SHALL ausschließlich dem Verbindungszustand folgen, den `session-map`/`ui-status` aus den
Socket-Ereignissen `disconnect`/`reconnect` ableiten, nie einer lokalen Schätzung
(`constitution.md` §9.1). Die Bedeutung MUST NOT allein über die Farbe getragen werden — der
zugängliche Name unterscheidet die beiden Zustände.

#### Scenario: Verbindungsanzeige folgt der Trennung

- **GIVEN** die Raumansicht eines Spielers ist gerendert und die Verbindung besteht
- **WHEN** die Verbindungsanzeige gelesen wird
- **THEN** trägt sie das Attribut `data-connected="true"` und den zugänglichen Namen
  `Verbindung aktiv`
- **WHEN** die Fassade danach eine Trennung meldet (`disconnect`)
- **THEN** trägt die Verbindungsanzeige `data-connected="false"` und den zugänglichen Namen
  `Verbindung getrennt`

### Requirement: Tokens-Trigger und Badge

Der Trigger `Tokens` SHALL ein Badge tragen, das die Anzahl der dem Spieler zugewiesenen
Tokens zeigt — die Tokens mit `ownerId` gleich seiner eigenen `userId` aus dem zuletzt vom
Server verteilten Bestand; ist die Anzahl `0`, MUST NOT ein Badge erscheinen. Das Badge
SHALL die Klasse `badge` tragen und, solange kein unbeachtetes Ereignis vorliegt, die Klasse
`badge--gold` (reine Anzahl). Meldet der Server über `session:tokens` einen **neu
freigegebenen Wert** — ein Wertefeld (`hp`, `hpMax`, `tempHp`, `ac`, `initiative`) eines dem
Spieler zugewiesenen Tokens, das im neuen Bestand nicht mehr `null` ist, obwohl es im
vorigen `null` war (der Server hat es zuvor herausgefiltert, `constitution.md` §9.2) —,
während das Tokenwerte-Modal geschlossen ist, SHALL das Badge stattdessen die Klasse
`badge--teal` tragen und der zugängliche Name des Triggers `Tokens` den Text `neue Werte`
enthalten (nicht nur die Farbe, `ui-theme`). Das Öffnen des Tokenwerte-Modals SHALL das
Ereignis quittieren: das Badge trägt wieder `badge--gold`, und `neue Werte` verschwindet aus
dem zugänglichen Namen. Ein bloß geänderter, schon zuvor freigegebener Wert (nicht `null` →
nicht `null`) MUST NOT das Badge teal färben — das Puls-Feedback beim Steigen liegt bei den
Tokenwerte-Karten (Issue #99), nicht hier. Anzahl und Farbe folgen ausschließlich dem
Bestand und den Ereignissen des Servers (`constitution.md` §9.1).

#### Scenario: Zwei zugewiesene Tokens zeigen das goldene Badge

- **GIVEN** die Anwendung hat den Raum als Spieler mit `userId` `U` betreten, und der
  Bestand nennt drei Tokens: `Goblin` und `Ork` mit `ownerId` `U` sowie `Drache` mit
  `ownerId` `null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** trägt der Trigger `Tokens` ein Element der Klasse `badge` mit dem Text `2` und der
  Klasse `badge--gold`, und das Element trägt nicht die Klasse `badge--teal`

#### Scenario: Neu freigegebener Wert färbt das Badge teal bis zum Öffnen

- **GIVEN** die Raumansicht eines Spielers mit `userId` `U` und einem Token `Goblin`
  (`ownerId` `U`), dessen fünf Wertefelder alle `null` sind, ist gerendert; das
  Tokenwerte-Modal ist geschlossen, und der Trigger `Tokens` trägt das Badge `1` mit der
  Klasse `badge--gold`
- **WHEN** die Fassade `session:tokens` mit `Goblin` (`ownerId` `U`, `hp` `18`, `hpMax` `24`)
  meldet
- **THEN** trägt das Badge des Triggers `Tokens` den Text `1` und die Klasse `badge--teal`,
  und der zugängliche Name des Triggers enthält `neue Werte`
- **WHEN** der Trigger `Tokens` danach ausgelöst wird
- **THEN** trägt das Badge wieder die Klasse `badge--gold`, und der zugängliche Name des
  Triggers enthält nicht mehr `neue Werte`

#### Scenario: Ein schon freigegebener Wert lässt das Badge gold

- **GIVEN** die Raumansicht eines Spielers mit `userId` `U` und einem Token `Goblin`
  (`ownerId` `U`, `hp` `20`, `hpMax` `40`) ist gerendert; das Tokenwerte-Modal ist
  geschlossen, und der Trigger `Tokens` trägt das Badge `1` mit der Klasse `badge--gold`
- **WHEN** die Fassade `session:tokens` mit `Goblin` (`ownerId` `U`, `hp` `10`, `hpMax` `40`)
  meldet
- **THEN** trägt das Badge des Triggers `Tokens` weiterhin den Text `1` und die Klasse
  `badge--gold`, nicht `badge--teal`

### Requirement: On-Demand-Modals

Die Karte ist der einzige dauerhaft sichtbare Bereich der Spieleransicht (Requirement
„Spieler-Raumlayout"); Tokenwerte, Anmerkungen und Teilnehmer erreicht der Spieler über die
drei Trigger, die je ein Modal (`ui-dialog`) öffnen. Der Trigger `Tokens` SHALL ein Modal
`Tokens` öffnen, das die Tokenwerte-Liste des Spielers (`session-token`, „Tokenansicht
im Raum") mit ihrer Überschrift `Tokenwerte` der Ebene 2 enthält. Der Trigger `Anmerkungen` SHALL ein Modal `Anmerkungen` öffnen, das das
Panel `Messen & Zeichnen` (`session-annotation`) enthält; ohne aktive Karte SHALL der Trigger
`Anmerkungen` gesperrt (`disabled`) sein, weil es dann nichts zu zeichnen gibt. Der Trigger
`Teilnehmer` SHALL ein Modal `Teilnehmer` öffnen, das die Teilnehmerkarten (`game-session`,
„Teilnehmerkarten") enthält; es MUST NOT eine Einladen-Schaltfläche, ein Popover oder ein
`<code>`-Element enthalten (der Spieler hat keinen Code, `constitution.md` §9.2). Löst der
Spieler auf seiner eigenen Karte im Teilnehmer-Modal `Alias ändern` aus, SHALL das
Teilnehmer-Modal schließen und das Modal `Alias ändern` öffnen (nur ein Modal zugleich). Ein
geschlossenes Modal gibt den Fokus an seinen Trigger zurück (`ui-dialog`).

#### Scenario: Tokens-Trigger öffnet das Tokenwerte-Modal

- **GIVEN** die Raumansicht eines Spielers mit `userId` `U` und einem Token `Goblin`
  (`ownerId` `U`, `hp` `23`, `hpMax` `40`) ist gerendert
- **WHEN** der Trigger `Tokens` ausgelöst wird
- **THEN** existiert ein Element der Rolle `dialog` mit dem Namen `Tokens`, das die
  Überschrift `Tokenwerte` der Ebene 2 und die Karte `Goblin` enthält; vor dem Auslösen
  existierte kein Element der Rolle `dialog`

#### Scenario: Anmerkungen-Trigger öffnet das Anmerkungs-Modal

- **GIVEN** die Raumansicht eines Spielers mit aktiver Karte (`name: "Taverne"`,
  `hasImage: false`) ist gerendert
- **WHEN** der Trigger `Anmerkungen` ausgelöst wird
- **THEN** existiert ein Element der Rolle `dialog` mit dem Namen `Anmerkungen`, das die
  Gruppe `Messen & Zeichnen` enthält

#### Scenario: Anmerkungen-Trigger ist ohne aktive Karte gesperrt

- **GIVEN** die Raumansicht eines Spielers ohne aktive Karte (`map: null`) ist gerendert
- **WHEN** die Trigger-Gruppe gelesen wird
- **THEN** ist der Trigger `Anmerkungen` `disabled`, die Trigger `Tokens` und `Teilnehmer`
  sind nicht `disabled`

#### Scenario: Teilnehmer-Trigger öffnet das Teilnehmer-Modal ohne Code

- **GIVEN** die Raumansicht eines Spielers mit `userId` `U` und den Teilnehmern
  `{ userId: "U", username: "sam" }` und `{ userId: "m", username: "meister", role:
  "spielleiter" }` ist gerendert
- **WHEN** der Trigger `Teilnehmer` ausgelöst wird
- **THEN** existiert ein Element der Rolle `dialog` mit dem Namen `Teilnehmer`, das die
  Teilnehmerkarten `sam` und `meister` enthält; die eigene Karte `sam` trägt die Aktion
  `Alias ändern`; der Dialog enthält keine Schaltfläche `Einladen`, kein `<code>`-Element und
  keine Schaltfläche `Sitzungscode kopieren`

#### Scenario: Alias ändern schließt das Teilnehmer-Modal und öffnet das Alias-Modal

- **GIVEN** das Teilnehmer-Modal eines Spielers mit Nutzernamen `sam` (die eigene Karte) ist
  über den Trigger `Teilnehmer` geöffnet
- **WHEN** er auf seiner eigenen Karte `Alias ändern` auslöst
- **THEN** existiert kein Element der Rolle `dialog` mit dem Namen `Teilnehmer` mehr, und es
  existiert ein Element der Rolle `dialog` mit dem Namen `Alias ändern`

### Requirement: Spieler-Raumlayout

Die Raumansicht eines Spielers SHALL unter der Spieler-Leiste dauerhaft die Kartenansicht
zeigen: den Kartenhinweis (`Aktive Karte: <Name>` bzw. `Keine Karte aktiv`, `session-map`)
und, bei aktiver Karte, die Bühne mit der Kartenansicht und dem Karten-Overlay (`ui-status`).
Sie MUST NOT eine Reiterliste `Bereiche` rendern; die Tokenwerte-Liste, das Panel `Messen &
Zeichnen` und die Teilnehmerkarten liegen ausschließlich in ihren Modals (Requirement
„On-Demand-Modals") und MUST NOT dauerhaft unter der Karte stehen. Die Raum-Meldungen zu
Token und Anmerkungen SHALL — wie für jede Rolle — sichtbar sein.

#### Scenario: Karte ist dauerhaft sichtbar, Panels liegen hinter den Triggern

- **GIVEN** die Anwendung hat den Raum als Spieler betreten, und das Acknowledgement nennt
  `role: "spieler"`, eine aktive Karte (`name: "Taverne"`, `hasImage: false`) und ein Token
  `Goblin` mit `ownerId` gleich seiner `userId`
- **WHEN** die Raumansicht gerendert wird, ohne einen Trigger auszulösen
- **THEN** enthält sie den Text `Aktive Karte: Taverne` und die Bühne (`map-stage`); es
  existiert keine Reiterliste `Bereiche`, keine Überschrift `Tokenwerte` der Ebene 2, keine
  Gruppe `Messen & Zeichnen` und keine Teilnehmerkarte

#### Scenario: Ohne aktive Karte zeigt der Spieler den Kartenhinweis und das Overlay im pausierten Zustand

- **GIVEN** die Anwendung hat den Raum als Spieler betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "pausiert"` und eine aktive Karte (`name: "Taverne"`,
  `hasImage: false`)
- **WHEN** die Raumansicht gerendert wird
- **THEN** liegt über der Bühne das Karten-Overlay des Zustands `pausiert` (`ui-status`), und
  es existiert keine Reiterliste `Bereiche`

### Requirement: Stylesheet der Spieler-Leiste

Das Stylesheet SHALL für jeden Leisten-Selektor eine Regel enthalten — `.player-bar`,
`.player-bar__group`, `.player-bar__identity`, `.player-bar__avatar`, `.player-bar__name`,
`.player-bar__triggers`, `.player-bar__trigger`, `.player-bar__connection`,
`.player-bar__badge-note`, `.badge`, `.badge--gold`, `.badge--teal` — und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine `animation`/`transition` außerhalb des
Bewegungsblocks). `.player-bar__badge-note` SHALL visuell verborgen sein (für Bildschirmleser
lesbar, ohne sichtbaren Text), damit `neue Werte` nicht allein über die Farbe getragen wird.

#### Scenario: Leisten-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Leisten-Selektor gesucht wird
- **THEN** ist jeder der zwölf Leisten-Selektoren vorhanden, das Stylesheet enthält genau
  eine `@media`-Abfrage, und sie ist die Bewegungsabfrage
