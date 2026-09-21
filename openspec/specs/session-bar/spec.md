# session-bar Specification

## Purpose

Die Steuerzeile am Kopf der Raumansicht: eine Pill-Zeile aus Gruppen, die den Namen der
Spielsitzung, den Sitzungscode, den Zustand mit seinen Übergängen und ein Verwaltungsmenü
trägt. Sie zeigt ausschließlich, was der Server gemeldet hat, und sendet Absichten
(`constitution.md` §9.1); welche Bedienelemente aktiv sind, folgt der Rolle aus dem
Enter-Acknowledgement und der Übergangstabelle des Vertrags, ob ein Übergang stattfindet,
entscheidet der Server pro Aktion (§9.3).

## Begriffe

- **Session-Bar**: ein `<div class="session-bar" role="group">` mit dem Namen `Sitzung`
  (Text der aktiven Sprache, `ui-text`), erstes Element der Raumansicht vor der
  Teilnehmerliste. Sie besteht aus **Gruppen** (`.session-bar__group`) in Dokumentreihenfolge
  Identität, Sitzungscode-Gruppe, Zustandsgruppe, Verwaltungsmenü; zwischen zwei Gruppen
  steht eine Haarlinie. Die Bar scrollt nie horizontal — allein der Name schrumpft per
  Ellipsis.
- **Identität**: die Gruppe mit dem Namen der Spielsitzung als Überschrift der Ebene 1
  (`.session-bar__name`) und, für den Spielleiter, einer Icon-only-Schaltfläche `Umbenennen`
  (`ui-icons`, Icon `edit`).
- **Sitzungscode-Gruppe** (nur Spielleiter): ein `<code>`-Element mit dem zugänglichen Namen
  `Sitzungscode`, das die **Maske** (so viele `•` U+2022 wie der Code Zeichen hat) oder den
  Klartext zeigt; eine **Umschalt-Schaltfläche** `Sitzungscode anzeigen` mit `aria-pressed`
  (Icon `reveal`, gedrückt `hide`); eine Schaltfläche `Sitzungscode kopieren` (Icon `copy`).
- **Zustandsgruppe**: die Zustandspille nach der Zuordnungstabelle von `ui-start` und, für
  den Spielleiter, die **Steuerung** — eine Gruppe (`role="group"`) mit dem Namen
  `Steuerung`, die die vier Übergänge des Vertrags als Icon-only-Schaltflächen in fester
  Reihenfolge trägt: `Öffnen` (Icon `players`), `Starten` (`start`), `Pausieren` (`pause`),
  `Beenden` (`end`); Klasse `transport-button`, `Beenden` zusätzlich
  `transport-button--danger`. Eine Schaltfläche ist **gesperrt** (`disabled`), wenn
  `allowedActions(status)` aus `src/shared/session.ts` ihre Aktion nicht enthält; sie bleibt
  gerendert.
- **Verwaltungsmenü**: ein Icon-Trigger `Sitzungsverwaltung` (`ui-menu`, Variante `icon`,
  Icon `settings`) mit den Einträgen `Umbenennen…` (Icon `edit`; gesperrt für einen
  Spieler), `Kartenbibliothek` (Icon `library`) und `Verlassen` (Icon `logout`) in dieser
  Reihenfolge.
- **Umbenennen-Modal**: ein Modal `Sitzung umbenennen` (`ui-dialog`) mit einem Feld `Name`
  (`ui-form`) und der Schaltfläche `Umbenennen`.
- **Bar-Meldung**: ein `<p role="alert" class="session-bar-error">` unmittelbar nach der
  Bar, das die Meldung eines vom Server abgelehnten Übergangs zeigt.
- **Bar-Selektoren**: `.session-bar`, `.session-bar__group`, `.session-bar__name`,
  `.session-bar__code`, `.transport-button`, `.transport-button--danger`,
  `.session-bar-error`. Ein Selektor ist **vorhanden**, wenn das Stylesheet nach
  Normalisierung (Kommentare entfernt, Whitespace auf ein Leerzeichen reduziert) den Text
  `<selektor> {` enthält.

## Requirements

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

### Requirement: Sitzungscode

Die Sitzungscode-Gruppe SHALL den Code maskiert zeigen, bis die Umschalt-Schaltfläche
`Sitzungscode anzeigen` gedrückt ist (`aria-pressed="true"`); ein erneutes Auslösen SHALL
wieder maskieren. Der Klartext MUST NOT außerhalb des `<code>`-Elements stehen und MUST NOT
stehen, solange die Umschalt-Schaltfläche nicht gedrückt ist. `Sitzungscode kopieren` SHALL
den Klartext unabhängig vom Zustand der Maske in die Zwischenablage legen; gelingt das,
SHALL die Anwendung den Toast `Sitzungscode kopiert` auslösen (`ui-feedback`), scheitert es,
MUST NOT ein Toast erscheinen. Kopieren MUST NOT den Zustand der Maske ändern.

#### Scenario: Kopieren bei aufgedecktem Code lässt den Klartext stehen

- **GIVEN** die Raumansicht des Spielleiters (Code `ABC234`) ist gerendert, die
  Umschalt-Schaltfläche `Sitzungscode anzeigen` ist gedrückt (`aria-pressed="true"`), das
  `<code>`-Element zeigt `ABC234`, und die Zwischenablage des Browsers bestätigt das
  Schreiben
- **WHEN** die Schaltfläche `Sitzungscode kopieren` ausgelöst wird
- **THEN** wurde genau der Text `ABC234` in die Zwischenablage geschrieben, der Toast-Host
  zeigt einen Toast `Sitzungscode kopiert`, das `<code>`-Element zeigt weiterhin `ABC234`,
  und die Umschalt-Schaltfläche trägt weiterhin `aria-pressed="true"`

### Requirement: Übergänge

Die Steuerung SHALL die vier Übergänge des Vertrags als Schaltflächen anbieten, jede
gesperrt (`disabled`), wenn `allowedActions(status)` ihre Aktion im zuletzt vom Server
gemeldeten Zustand nicht enthält, und MUST NOT eine davon ausblenden. `Öffnen`, `Starten`
und `Pausieren` SHALL beim Auslösen `session:transition` `{ sessionId, action }` mit der
jeweiligen Aktion (`oeffnen`, `starten`, `pausieren`) senden. `Beenden` SHALL zuerst einen
Bestätigungsdialog (`ui-dialog`, `alertdialog`) mit dem Titel `Sitzung beenden?`, der
Beschreibung `Alle Spieler werden aus dem Raum entfernt.` und der gefährlichen
Schaltfläche `Beenden` zeigen; erst die Bestätigung SHALL `session:transition` mit
`beenden` senden, `Abbrechen` MUST NOT etwas senden. Die Zustandspille und die Sperren
SHALL ausschließlich dem Acknowledgement von `session:enter` und `session:status` folgen,
nie der ausgelösten Schaltfläche. Antwortet der Server auf einen Übergang mit
`{ ok: false, message }`, SHALL die Bar-Meldung den Text `message` zeigen; ein späteres
`session:status` oder ein bestätigter Übergang SHALL die Bar-Meldung entfernen.

#### Scenario: Laufende Sitzung sperrt Öffnen und Starten

- **GIVEN** die Raumansicht des Spielleiters ist gerendert, und der Server hat
  `status: "gestartet"` gemeldet
- **WHEN** die Steuerung gelesen wird
- **THEN** sind die Schaltflächen `Öffnen` und `Starten` `disabled`, die Schaltflächen
  `Pausieren` und `Beenden` nicht `disabled`, und alle vier sind gerendert

#### Scenario: Starten sendet den Übergang und die Pille folgt dem Server

- **GIVEN** die Raumansicht des Spielleiters ist gerendert mit `status: "geoeffnet"`, und
  die Fassade bestätigt `session:transition` mit `{ ok: true, status: "gestartet" }`
- **WHEN** der Spielleiter `Starten` auslöst
- **THEN** wurde `session:transition` genau einmal mit `{ sessionId, action: "starten" }`
  gesendet, es existiert kein Element der Rolle `alertdialog`, und die Zustandspille lautet
  weiterhin `Geöffnet`; nach dem Empfang von `session:status` mit `gestartet` lautet sie
  `Läuft`, `Starten` ist `disabled` und `Pausieren` nicht `disabled`

#### Scenario: Beenden fragt vor dem Senden nach

- **GIVEN** die Raumansicht des Spielleiters ist gerendert mit `status: "gestartet"`
- **WHEN** der Spielleiter `Beenden` in der Steuerung auslöst
- **THEN** existiert ein Element der Rolle `alertdialog` mit dem Namen `Sitzung beenden?`,
  das den Text `Alle Spieler werden aus dem Raum entfernt.` und die Schaltflächen
  `Abbrechen` und `Beenden` enthält, und `session:transition` wurde nicht gesendet; nach dem
  Auslösen von `Beenden` im Dialog wurde `session:transition` genau einmal mit
  `{ sessionId, action: "beenden" }` gesendet, und der Dialog ist geschlossen

#### Scenario: Abbrechen der Bestätigung sendet nichts

- **GIVEN** der Dialog `Sitzung beenden?` ist über die Steuerung geöffnet
- **WHEN** der Spielleiter `Abbrechen` auslöst
- **THEN** existiert kein Element der Rolle `alertdialog` mehr, `session:transition` wurde
  nicht gesendet, und die Schaltfläche `Beenden` der Steuerung hat den Fokus

#### Scenario: Abgelehnter Übergang erscheint als Bar-Meldung

- **GIVEN** die Raumansicht des Spielleiters ist gerendert mit `status: "geoeffnet"`, und
  die Fassade beantwortet `session:transition` mit
  `{ ok: false, message: "Dafür fehlt die Berechtigung." }`
- **WHEN** der Spielleiter `Starten` auslöst
- **THEN** zeigt ein Element der Rolle `alert` mit der Klasse `session-bar-error` den Text
  `Dafür fehlt die Berechtigung.`, und die Zustandspille lautet weiterhin `Geöffnet`; nach
  dem Empfang von `session:status` mit `gestartet` existiert kein Element mit der Klasse
  `session-bar-error` mehr

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

### Requirement: Umbenennen

Die Schaltfläche `Umbenennen` der Identität und der Menüeintrag `Umbenennen…` SHALL das
Umbenennen-Modal öffnen: ein Modal `Sitzung umbenennen` mit einem Feld `Name`, das mit dem
aktuell angezeigten Namen vorbelegt ist und beim Öffnen den Fokus hat, und der Schaltfläche
`Umbenennen`. Das Absenden SHALL die Eingabe mit dem gemeinsamen Namensschema des Vertrags
(`src/shared/session.ts`, Trimmen, 1 bis 60 Zeichen) prüfen; ein ungültiger Wert SHALL als
Feldfehler am Feld `Name` stehen (`ui-form`), und es MUST NOT etwas gesendet werden. Ein
gültiger Wert SHALL als `session:rename` `{ sessionId, name }` mit dem getrimmten Namen
gesendet werden. Antwortet der Server mit `{ ok: true, name }`, SHALL das Modal schließen
und der Toast `Sitzung umbenannt` erscheinen (`ui-feedback`); der angezeigte Name SHALL erst
dem `session:renamed` des Servers folgen, nicht der Eingabe und nicht dem Acknowledgement
(`constitution.md` §9.1). Antwortet der Server mit `{ ok: false, message }`, SHALL das Modal
geöffnet bleiben und `message` als Formularfehler zeigen; ein Toast MUST NOT erscheinen.
Jede Raumansicht SHALL auf `session:renamed` `{ sessionId, name }` den Namen der Bar
aktualisieren.

#### Scenario: Umbenennen öffnet das Modal mit dem aktuellen Namen

- **GIVEN** die Raumansicht des Spielleiters (`name: "Freitagsrunde"`) ist gerendert
- **WHEN** er die Schaltfläche `Umbenennen` in der Bar auslöst
- **THEN** existiert ein Element der Rolle `dialog` mit dem Namen `Sitzung umbenennen`, das
  ein Feld `Name` mit dem Wert `Freitagsrunde` und eine Schaltfläche `Umbenennen` enthält,
  und das Feld `Name` hat den Fokus

#### Scenario: Umbenennen sendet die Absicht und folgt dem Server

- **GIVEN** das Modal `Sitzung umbenennen` ist über die Bar geöffnet, und die Fassade
  bestätigt `session:rename` mit `{ ok: true, name: "Samstagsrunde" }`
- **WHEN** der Spielleiter das Feld `Name` auf `  Samstagsrunde  ` (mit umgebenden
  Leerzeichen) setzt und das Formular absendet
- **THEN** wurde `session:rename` genau einmal mit `{ sessionId, name: "Samstagsrunde" }`
  gesendet, es existiert kein Element der Rolle `dialog` mehr, der Toast-Host zeigt einen
  Toast `Sitzung umbenannt`, und die Überschrift der Ebene 1 lautet weiterhin
  `Freitagsrunde`; nach dem Empfang von `session:renamed` mit `{ sessionId, name:
  "Samstagsrunde" }` lautet sie `Samstagsrunde`

#### Scenario: Leerer Name wird nicht gesendet

- **GIVEN** das Modal `Sitzung umbenennen` ist geöffnet
- **WHEN** der Spielleiter das Feld `Name` auf `   ` (nur Leerzeichen) setzt und das Formular
  absendet
- **THEN** zeigt das Feld `Name` den Feldfehler `Der Name muss mindestens 1 Zeichen lang
  sein.`, `session:rename` wurde nicht gesendet, und der Dialog `Sitzung umbenennen` ist
  weiterhin geöffnet

#### Scenario: Abgelehntes Umbenennen bleibt im Modal

- **GIVEN** das Modal `Sitzung umbenennen` ist geöffnet, und die Fassade beantwortet
  `session:rename` mit `{ ok: false, message: "Dafür fehlt die Berechtigung." }`
- **WHEN** der Spielleiter das Feld `Name` auf `Samstagsrunde` setzt und das Formular
  absendet
- **THEN** ist der Dialog `Sitzung umbenennen` weiterhin geöffnet, ein Element der Rolle
  `alert` darin zeigt den Text `Dafür fehlt die Berechtigung.`, der Toast-Host zeigt keinen
  Toast, und die Überschrift der Ebene 1 lautet weiterhin `Freitagsrunde`

#### Scenario: Umbenennung erreicht den Spieler

- **GIVEN** die Raumansicht eines Spielers (`name: "Freitagsrunde"`) ist gerendert
- **WHEN** die Anwendung `session:renamed` mit `{ sessionId, name: "Samstagsrunde" }`
  erhält
- **THEN** lautet die Überschrift der Ebene 1 `Samstagsrunde`, und kein Textknoten lautet
  `Freitagsrunde`

### Requirement: Stylesheet der Session-Bar

Das Stylesheet SHALL für jeden Bar-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine `animation`/`transition` außerhalb des
Bewegungsblocks).

#### Scenario: Bar-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Bar-Selektor gesucht wird
- **THEN** ist jeder der sieben Bar-Selektoren vorhanden, das Stylesheet enthält genau eine
  `@media`-Abfrage, und sie ist die Bewegungsabfrage
