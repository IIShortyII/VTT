## MODIFIED Requirements

### Requirement: Aufbau der Session-Bar

Die Raumansicht SHALL die Session-Bar als erstes Element rendern, sobald das
Acknowledgement von `session:enter` vorliegt — vor der Reiterliste `Bereiche`
(`session-tabs`). Für den Spielleiter SHALL sie Identität mit
`Umbenennen`, Sitzungscode-Gruppe, Zustandsgruppe mit Steuerung und Verwaltungsmenü
enthalten; für einen Spieler Identität ohne `Umbenennen`, Zustandsgruppe ohne Steuerung und
Verwaltungsmenü — die Sitzungscode-Gruppe MUST NOT für ihn gerendert werden (der Server
sendet ihm keinen Code, `constitution.md` §9.2). Der Name in der Bar SHALL die einzige
Überschrift der Ebene 1 der Raumansicht sein. Alle Texte der Bar SHALL Texte der aktiven
Sprache sein (`ui-text`). Die Bar MUST NOT breiter als ihr Container werden; ob der Name
per Ellipsis schrumpft, wird im App-Test abgenommen (`constitution.md` §3.4).

#### Scenario: Bar des Spielleiters trägt vier Gruppen in fester Reihenfolge

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, `status: "geoeffnet"`, `name: "Freitagsrunde"` und
  `code: "ABC234"`
- **WHEN** die Raumansicht gerendert wird
- **THEN** existiert genau eine Gruppe `Sitzung`; sie enthält in Dokumentreihenfolge die
  Überschrift der Ebene 1 `Freitagsrunde`, die Schaltfläche `Umbenennen`, das
  `<code>`-Element `Sitzungscode`, die Schaltflächen `Sitzungscode anzeigen` und
  `Sitzungscode kopieren`, die Zustandspille `Geöffnet`, die Gruppe `Steuerung` mit genau
  vier Schaltflächen `Öffnen`, `Starten`, `Pausieren`, `Beenden` in dieser Reihenfolge und
  die Menü-Schaltfläche `Sitzungsverwaltung` (`aria-haspopup="menu"`); die Gruppe `Sitzung`
  liegt im Dokument vor der Reiterliste `Bereiche`

#### Scenario: Bar des Spielers ohne Code und Steuerung

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "gestartet"`, `name: "Freitagsrunde"` und kein Feld `code`
- **WHEN** die Raumansicht gerendert wird
- **THEN** enthält die Gruppe `Sitzung` die Überschrift der Ebene 1 `Freitagsrunde`, die
  Zustandspille `Läuft` und die Menü-Schaltfläche `Sitzungsverwaltung`, aber keine
  Schaltfläche `Umbenennen`, `Sitzungscode anzeigen`, `Sitzungscode kopieren`, `Öffnen`,
  `Starten`, `Pausieren` oder `Beenden`, keine Gruppe `Steuerung` und kein `<code>`-Element
