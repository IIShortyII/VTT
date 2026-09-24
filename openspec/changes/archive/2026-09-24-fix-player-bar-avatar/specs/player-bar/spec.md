## MODIFIED Requirements

### Requirement: Aufbau der Spieler-Leiste

Für die Rolle `spieler` SHALL die Raumansicht als erstes Element die Spieler-Leiste
rendern, sobald das Acknowledgement von `session:enter` vorliegt — statt der Session-Bar und
statt der Reiterliste `Bereiche` (`session-tabs`, „Bereiche der Raumansicht"). Die
Spieler-Leiste SHALL Identität (Name der Spielsitzung, Rollen-Pille), Zustandsgruppe
(Zustandspille) und Trigger-Gruppe (die drei On-Demand-Trigger und die Verbindungsanzeige)
tragen. Die Identität MUST NOT einen Avatar tragen — kein Element der Rolle `img` mit dem
Anzeigenamen des Spielers und keine Initiale; der Anzeigename bleibt über die Teilnehmerkarten
(Modal `Teilnehmer`) erreichbar. Sie zeigt ausschließlich, was der Server gemeldet hat, und
sendet Absichten (`constitution.md` §9.1); sie MUST NOT einen Sitzungscode, eine Maske, eine
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
- **THEN** existiert genau eine Gruppe `Sitzung`; sie enthält in Dokumentreihenfolge die
  Überschrift der Ebene 1 `Freitagsrunde`, die Rollen-Pille `Spieler` (Klasse `chip`), die
  Zustandspille `Läuft` (Klasse `status-pill`), die drei Schaltflächen `Tokens`,
  `Anmerkungen`, `Teilnehmer` in dieser Reihenfolge und die Verbindungsanzeige (Element der
  Rolle `img` mit dem Namen `Verbindung aktiv`); die Gruppe `Sitzung` enthält genau ein Element
  der Rolle `img` (die Verbindungsanzeige) und keines mit dem Namen `Gandalf`, keine
  Reiterliste `Bereiche`,
  kein `<code>`-Element und keine Schaltfläche `Sitzungscode anzeigen`, `Sitzungscode
  kopieren`, `Umbenennen`, `Öffnen`, `Starten`, `Pausieren` oder `Beenden`; die Gruppe
  `Sitzung` liegt im Dokument vor der Kartenansicht

### Requirement: Stylesheet der Spieler-Leiste

Das Stylesheet SHALL für jeden Leisten-Selektor eine Regel enthalten — `.player-bar`,
`.player-bar__group`, `.player-bar__identity`, `.player-bar__name`, `.player-bar__triggers`,
`.player-bar__trigger`, `.player-bar__connection`, `.player-bar__badge-note`, `.badge`,
`.badge--gold`, `.badge--teal` — und dabei den Format-Vertrag von `ui-theme` einhalten (kein
Farbwert außerhalb des Tokenblocks, kein `@media` außer der Bewegungsabfrage, keine
`animation`/`transition` außerhalb des Bewegungsblocks). Es MUST NOT eine Regel für
`.player-bar__avatar` enthalten. `.player-bar__badge-note` SHALL visuell verborgen sein (für
Bildschirmleser lesbar, ohne sichtbaren Text), damit `neue Werte` nicht allein über die Farbe
getragen wird.

#### Scenario: Leisten-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Leisten-Selektor gesucht wird
- **THEN** ist jeder der elf Leisten-Selektoren vorhanden, der Selektor `.player-bar__avatar`
  ist nicht vorhanden, das Stylesheet enthält genau eine `@media`-Abfrage, und sie ist die
  Bewegungsabfrage
