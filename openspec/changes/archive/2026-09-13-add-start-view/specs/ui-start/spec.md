## Purpose

Die Startansicht des Clients: eine Hero-Zeile mit Overline, Display-Titel und Subline, die
einem Besucher die Anmeldekarte und einem angemeldeten Nutzer zwei Aktionen (Sitzung leiten,
Beitreten) sowie seine Spielsitzungen als Karten mit Zustand und Rolle zeigt — mit einem
erklärenden Leerzustand statt einer leeren Liste. Zustand und Rolle jeder Karte stammen aus
dem vom Server gemeldeten Bestand (`constitution.md` §9.1); der Client leitet nichts selbst
ab. Aussehen und Layout nimmt der menschliche App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Startansicht**: der Inhalt des Inhaltsbereichs der Shell (`ui-shell`) für einen nicht
  angemeldeten Besucher (Anmeldung/Registrierung) und für einen angemeldeten Nutzer
  außerhalb von Raum und Kartenbibliothek (Sitzungsliste).
- **Hero**: der Block am Anfang der Startansicht aus **Overline** (Text `Deine Runde`;
  eventuelle Gedankenstriche sind Dekoration per Stylesheet, kein Textinhalt), **Titel**
  (die einzige Überschrift der Ebene 1 der Startansicht) und **Subline** (ein Satz unter dem
  Titel). Anonym: Titel `Karten, Tokens, Nebel`, Subline `Leite deine Runde am virtuellen
  Tisch oder tritt einer bei.` Angemeldet: Titel `Meine Spielsitzungen`, Subline `Leite
  eine Sitzung oder tritt mit einem Code bei.`
- **Aktionen**: in der angemeldeten Startansicht die Schaltflächen `Sitzung leiten`
  (primär), `Beitreten` (sekundär) und `Kartenbibliothek` (Link-Schaltfläche) im Hero.
  `Sitzung leiten` und `Beitreten` sind Aufklapp-Auslöser: sie tragen `aria-expanded`
  (`true`, solange ihr Formular offen ist, sonst `false`).
- **Erstellen-Formular**: das Formular mit dem zugänglichen Namen `Neue Spielsitzung`
  (Überschrift der Ebene 2 gleichen Texts), Eingabefeld `Name` (`name="name"`),
  Schaltflächen `Erstellen` (Absenden) und `Abbrechen`.
- **Beitreten-Formular**: das Formular mit dem zugänglichen Namen `Spielsitzung beitreten`,
  Eingabefeld `Sitzungscode` (`name="code"`), Schaltflächen `Beitreten` (Absenden) und
  `Abbrechen`. Weil der Hero ebenfalls eine Schaltfläche `Beitreten` trägt, ist das
  Absenden nur innerhalb des Formulars adressiert.
- **Offen** ist ein Formular, wenn es im Dokument gerendert ist; **geschlossen**, wenn es
  nicht gerendert ist. Höchstens eines der beiden Formulare ist offen.
- **Sitzungsliste**: die Liste (`<ul>`) mit dem zugänglichen Namen `Meine Spielsitzungen`
  (über den Titel des Hero benannt); jeder Eintrag (`<li>`) ist eine **Karte**.
- **Karte**: enthält den Namen der Spielsitzung als Überschrift der Ebene 3, die
  **Zustandspille**, die **Rolle** und die Schaltfläche `Betreten`.
- **Zustandspille**: ein Element mit der Klasse `status-pill`, das den gemeldeten Zustand
  als Text mit einem dekorativen Icon (`<svg aria-hidden="true">`) zeigt; Beschriftung und
  Varianten-Klasse je gemeldetem `status`:

  | `status` | Text | Varianten-Klasse |
  |---|---|---|
  | `gestartet` | `Läuft` | `status-pill--active` |
  | `pausiert` | `Pausiert` | `status-pill--paused` |
  | `geoeffnet` | `Geöffnet` | keine |
  | `geschlossen` | `Geschlossen` | `status-pill--ended` |

- **Rolle**: Text `Spielleiter` für `role: "spielleiter"`, `Spieler` für
  `role: "spieler"`, mit dekorativem Icon.
- **Leerzustand**: ein Element mit der Klasse `empty-state`, das den Text
  `Noch keine Sitzungen` und den Satz `Erstelle eine Sitzung oder tritt mit einem Code bei.`
  enthält.
- **Geladen** ist die Sitzungsliste, sobald `GET /api/sessions` geantwortet hat; davor ist
  sie **ausstehend**.
- **Stylesheet**: `src/client/app/theme.css` (`ui-theme`), als Text gelesen; die
  Start-Selektoren sind `.hero`, `.hero-overline`, `.hero-title`, `.hero-subline`,
  `.hero-actions`, `.auth-panel`, `.panel-actions`, `.session-cards`, `.session-card`,
  `.session-card-name`, `.session-card-meta` und `.start-account`. Ein Selektor ist
  **vorhanden**, wenn das Stylesheet nach Normalisierung (`\s+` → ein Leerzeichen,
  Kommentare entfernt) die Zeichenfolge `<selektor> {` enthält.

## ADDED Requirements

### Requirement: Hero der Startansicht

Die Startansicht SHALL in jedem Zustand mit dem Hero beginnen: Overline, genau eine
Überschrift der Ebene 1 als Titel und die Subline. Für einen nicht angemeldeten Besucher
SHALL darunter das Anmeldeformular (Felder für E-Mail und Passwort, Absenden `Anmelden`)
und die Link-Schaltfläche `Noch kein Konto? Registrieren` stehen; das
Registrierungsformular (`user-auth`) SHALL denselben Hero behalten. Für einen angemeldeten
Nutzer SHALL der Hero die drei Aktionen zeigen; die Formulare zum Erstellen und Beitreten
MUST NOT ohne Auslösen einer Aktion gerendert sein.

#### Scenario: Anonyme Startansicht zeigt Hero und Anmeldekarte

- **GIVEN** der Server meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält der Inhaltsbereich den Text `Deine Runde`, genau eine Überschrift der
  Ebene 1 mit dem Text `Karten, Tokens, Nebel`, den Text `Leite deine Runde am virtuellen
  Tisch oder tritt einer bei.`, Eingabefelder für E-Mail und Passwort, eine Schaltfläche
  `Anmelden` und eine Schaltfläche `Noch kein Konto? Registrieren`; nach deren Auslösen
  zeigt sie das Registrierungsformular, und die Überschrift der Ebene 1 lautet weiterhin
  `Karten, Tokens, Nebel`

#### Scenario: Angemeldete Startansicht zeigt Hero mit Aktionen

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert
  eine leere Liste
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält der Inhaltsbereich den Text `Deine Runde`, genau eine Überschrift der
  Ebene 1 mit dem Text `Meine Spielsitzungen`, den Text `Leite eine Sitzung oder tritt mit
  einem Code bei.` sowie die Schaltflächen `Sitzung leiten` (mit `aria-expanded="false"`),
  `Beitreten` (mit `aria-expanded="false"`) und `Kartenbibliothek`; es gibt kein Formular
  `Neue Spielsitzung` und kein Formular `Spielsitzung beitreten`

### Requirement: Erstellen und Beitreten auf Anforderung

`Sitzung leiten` SHALL das Erstellen-Formular öffnen und `Beitreten` das
Beitreten-Formular; das Öffnen des einen SHALL das andere schließen, und das Eingabefeld
des geöffneten Formulars SHALL den Fokus erhalten. Ein erneutes Auslösen derselben Aktion
oder `Abbrechen` SHALL das Formular schließen. Absenden SHALL wie bisher `POST /api/sessions`
bzw. `POST /api/sessions/join` senden; bestätigt der Server, SHALL das Formular schließen
und die Sitzungsliste neu geladen werden. Lehnt der Server ab, SHALL das Formular offen
bleiben und die Meldung des Servers als Fehlermeldung zeigen. Ob eine Spielsitzung
entstanden ist oder ein Beitritt gelungen ist, entscheidet ausschließlich die Antwort des
Servers (`constitution.md` §9.1).

#### Scenario: Sitzung leiten öffnet das Erstellen-Formular

- **GIVEN** die angemeldete Startansicht ist gerendert, kein Formular ist offen
- **WHEN** der Nutzer `Sitzung leiten` auslöst
- **THEN** ist das Formular `Neue Spielsitzung` offen mit dem Eingabefeld `Name`, den
  Schaltflächen `Erstellen` und `Abbrechen`, das Eingabefeld `Name` hat den Fokus, und
  `Sitzung leiten` trägt `aria-expanded="true"`

#### Scenario: Beitreten öffnet das Beitreten-Formular und schließt das Erstellen-Formular

- **GIVEN** die angemeldete Startansicht ist gerendert, und das Erstellen-Formular ist offen
- **WHEN** der Nutzer die Hero-Schaltfläche `Beitreten` auslöst
- **THEN** ist das Formular `Spielsitzung beitreten` offen mit dem Eingabefeld
  `Sitzungscode` und den Schaltflächen `Beitreten` und `Abbrechen` innerhalb des Formulars,
  das Eingabefeld `Sitzungscode` hat den Fokus, das Formular `Neue Spielsitzung` ist
  geschlossen, und `Sitzung leiten` trägt `aria-expanded="false"`

#### Scenario: Abbrechen schließt das Formular

- **GIVEN** das Erstellen-Formular ist offen
- **WHEN** der Nutzer `Abbrechen` auslöst
- **THEN** ist das Formular `Neue Spielsitzung` geschlossen, `Sitzung leiten` trägt
  `aria-expanded="false"`, und es wurde keine Anfrage an `/api/sessions` gesendet (außer
  dem Laden der Liste)

#### Scenario: Erstellte Spielsitzung schließt das Formular und erscheint als Karte

- **GIVEN** das Erstellen-Formular ist offen, und `POST /api/sessions` antwortet mit `201`
  und der neuen Spielsitzung `Krypta`; `GET /api/sessions` liefert danach `Krypta` mit
  `status: "geschlossen"` und `role: "spielleiter"`
- **WHEN** der Nutzer `Krypta` als Namen eingibt und `Erstellen` auslöst
- **THEN** hat die Anwendung `POST /api/sessions` mit `{ "name": "Krypta" }` gesendet, das
  Formular `Neue Spielsitzung` ist geschlossen, und die Sitzungsliste enthält eine Karte
  `Krypta`

#### Scenario: Abgelehntes Erstellen bleibt im Formular

- **GIVEN** das Erstellen-Formular ist offen, und `POST /api/sessions` antwortet mit `400`
  und einer Meldung
- **WHEN** der Nutzer einen Namen eingibt und `Erstellen` auslöst
- **THEN** ist das Formular `Neue Spielsitzung` weiterhin offen und zeigt diese Meldung als
  Fehlermeldung (`role="alert"`)

#### Scenario: Beitritt per Code schließt das Formular

- **GIVEN** das Beitreten-Formular ist offen, und `POST /api/sessions/join` antwortet mit
  `200`; `GET /api/sessions` liefert danach `Freitagsrunde` mit `role: "spieler"`
- **WHEN** der Nutzer `ABC234` als Sitzungscode eingibt und `Beitreten` innerhalb des
  Formulars auslöst
- **THEN** hat die Anwendung `POST /api/sessions/join` mit `{ "code": "ABC234" }` gesendet,
  das Formular `Spielsitzung beitreten` ist geschlossen, und die Sitzungsliste enthält eine
  Karte `Freitagsrunde` mit der Rolle `Spieler`

### Requirement: Sitzungskarten

Die Startansicht SHALL die geladenen Spielsitzungen als Karten in der Sitzungsliste zeigen.
Jede Karte SHALL den Namen als Überschrift, die Zustandspille mit Text und Icon nach der
Zuordnungstabelle, die Rolle mit Text und Icon sowie die Schaltfläche `Betreten` enthalten.
Text, Varianten-Klasse und Icon der Pille sowie die Rolle SHALL ausschließlich aus `status`
und `role` der Serverantwort abgeleitet werden (`constitution.md` §9.1). `Betreten` SHALL
den Raum dieser Spielsitzung öffnen.

#### Scenario: Karte zeigt Name, Zustand und Rolle

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert
  `Freitagsrunde` (`status: "gestartet"`, `role: "spielleiter"`) und `Sonntagsrunde`
  (`status: "geschlossen"`, `role: "spieler"`)
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält die Liste `Meine Spielsitzungen` genau zwei Einträge; der erste enthält
  eine Überschrift `Freitagsrunde`, den Text `Läuft`, den Text `Spielleiter` und eine
  Schaltfläche `Betreten`; der zweite enthält eine Überschrift `Sonntagsrunde`, den Text
  `Geschlossen`, den Text `Spieler` und eine Schaltfläche `Betreten`; kein Eintrag enthält
  den Rohwert `gestartet`, `geschlossen`, `spielleiter` oder `spieler`

#### Scenario: Zustandspille folgt der Zuordnungstabelle

- **GIVEN** `GET /api/sessions` liefert vier Spielsitzungen mit den Zuständen `gestartet`,
  `pausiert`, `geoeffnet` und `geschlossen`
- **WHEN** die Sitzungsliste gerendert wird
- **THEN** trägt die Zustandspille jeder Karte die Klasse `status-pill`, den Text der
  Tabelle (`Läuft`, `Pausiert`, `Geöffnet`, `Geschlossen`) und genau ein
  `<svg aria-hidden="true">`; die Pillen zu `gestartet`, `pausiert` und `geschlossen`
  tragen zusätzlich `status-pill--active`, `status-pill--paused` bzw.
  `status-pill--ended`, die Pille zu `geoeffnet` keine `status-pill--`-Klasse

#### Scenario: Betreten öffnet den Raum der Karte

- **GIVEN** die Sitzungsliste zeigt die Karten `Freitagsrunde` (`id: "s1"`) und
  `Sonntagsrunde` (`id: "s2"`)
- **WHEN** der Nutzer `Betreten` innerhalb der Karte `Sonntagsrunde` auslöst
- **THEN** sendet die Anwendung `session:enter` mit der `sessionId` `s2`, und die
  Raumansicht ist gerendert

### Requirement: Leerzustand

Solange die Sitzungsliste ausstehend ist, MUST NOT die Startansicht eine Sitzungsliste oder
den Leerzustand zeigen. Ist sie geladen und leer, SHALL die Startansicht den Leerzustand
statt einer Liste zeigen. Scheitert das Laden, SHALL die Startansicht die Meldung als
Fehlermeldung (`role="alert"`) zeigen und MUST NOT den Leerzustand zeigen.

#### Scenario: Ohne Sitzungen erscheint der Leerzustand

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert
  eine leere Liste
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie den Text `Noch keine Sitzungen` und den Text `Erstelle eine Sitzung
  oder tritt mit einem Code bei.`, und es gibt keine Liste `Meine Spielsitzungen`

#### Scenario: Während des Ladens weder Liste noch Leerzustand

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und die Antwort auf
  `GET /api/sessions` steht noch aus
- **WHEN** die Anwendung gerendert wird und die Schaltfläche `Sitzung leiten` erschienen ist
- **THEN** gibt es weder den Text `Noch keine Sitzungen` noch eine Liste
  `Meine Spielsitzungen`; sobald die Antwort mit einer leeren Liste eintrifft, erscheint
  der Text `Noch keine Sitzungen`

#### Scenario: Fehlgeschlagenes Laden zeigt die Meldung statt des Leerzustands

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` antwortet
  mit `500` und einer Meldung
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie eine Fehlermeldung (`role="alert"`) und weder den Text
  `Noch keine Sitzungen` noch eine Liste `Meine Spielsitzungen`

### Requirement: Stylesheet der Startansicht

Das Stylesheet SHALL für jeden Start-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine weiteren `@import`-Zeilen).

#### Scenario: Start-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Start-Selektor gesucht wird
- **THEN** ist jeder der zwölf Start-Selektoren vorhanden
