## MODIFIED Requirements

### Requirement: Aufbau der Session-Bar

Die Raumansicht des Spielleiters SHALL die Session-Bar als erstes Element rendern, sobald
das Acknowledgement von `session:enter` vorliegt — vor der Reiterliste `Bereiche`
(`session-tabs`); sie SHALL Identität mit `Umbenennen`, Sitzungscode-Gruppe, Zustandsgruppe
mit Steuerung und Verwaltungsmenü enthalten. Einem Spieler MUST NOT die Session-Bar gezeigt
werden; seine Raumansicht trägt stattdessen die Spieler-Leiste (`player-bar`, „Aufbau der
Spieler-Leiste"). Der Name in der Bar SHALL die einzige
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
- **THEN** rendert die Raumansicht keine Session-Bar-Bedienelemente für den Spieler: weder
  die Menü-Schaltfläche `Sitzungsverwaltung` noch eine Schaltfläche `Umbenennen`,
  `Sitzungscode anzeigen`, `Sitzungscode kopieren`, `Öffnen`, `Starten`, `Pausieren` oder
  `Beenden`, keine Gruppe `Steuerung` und kein `<code>`-Element; der Kopf des Spielers ist
  die Spieler-Leiste (`player-bar`, „Aufbau der Spieler-Leiste")

### Requirement: Verwaltungsmenü

Das Verwaltungsmenü SHALL über den Trigger `Sitzungsverwaltung` ein Menü (`ui-menu`) mit
den Einträgen `Umbenennen…`, `Kartenbibliothek` und `Verlassen` öffnen. `Umbenennen…`
SHALL für den Spielleiter aktiv sein und das Umbenennen-Modal öffnen; einem Spieler wird das
Verwaltungsmenü nicht gezeigt — er hat keine Session-Bar, sondern die Spieler-Leiste
(`player-bar`). `Kartenbibliothek` SHALL die Kartenbibliothek (`map-library`)
öffnen; `Zurück` in der Top-Bar führt von dort zur Sitzungsliste (`ui-shell`). `Verlassen`
SHALL zur Sitzungsliste führen wie `Zurück`; die Mitgliedschaft bleibt bestehen.

#### Scenario: Menü des Spielleiters

- **GIVEN** die Raumansicht des Spielleiters ist gerendert
- **WHEN** er die Menü-Schaltfläche `Sitzungsverwaltung` auslöst
- **THEN** existiert ein Element der Rolle `menu` mit dem Namen `Sitzungsverwaltung` und
  darin genau drei Elemente der Rolle `menuitem` mit den Namen `Umbenennen…`,
  `Kartenbibliothek` und `Verlassen` in dieser Reihenfolge, keines gesperrt

#### Scenario: Menü des Spielers sperrt Umbenennen

- **GIVEN** die Raumansicht eines Spielers ist gerendert
- **WHEN** die Kopfleiste des Spielers gelesen wird
- **THEN** existiert keine Menü-Schaltfläche `Sitzungsverwaltung` und kein Menüeintrag
  `Umbenennen…`, `Kartenbibliothek` oder `Verlassen`; der Spieler bedient die Spieler-Leiste
  (`player-bar`), die kein Verwaltungsmenü trägt

#### Scenario: Verlassen führt zur Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer hat die Spielsitzung `Freitagsrunde` betreten, und die
  Raumansicht ist gerendert
- **WHEN** er im Menü `Sitzungsverwaltung` den Eintrag `Verlassen` wählt
- **THEN** zeigt die Anwendung die Sitzungsliste (Schaltfläche `Sitzung leiten`), die
  Raumansicht ist nicht mehr gerendert (keine Gruppe `Sitzung`), und die Fassade wurde
  getrennt

#### Scenario: Kartenbibliothek öffnet die Bibliothek

- **GIVEN** ein angemeldeter Nutzer hat eine Spielsitzung betreten, und die Raumansicht ist
  gerendert
- **WHEN** er im Menü `Sitzungsverwaltung` den Eintrag `Kartenbibliothek` wählt
- **THEN** zeigt die Anwendung die Kartenbibliothek (Überschrift der Ebene 1
  `Kartenbibliothek`), die Raumansicht ist nicht mehr gerendert, und das `<header>` enthält
  die Schaltfläche `Zurück`
