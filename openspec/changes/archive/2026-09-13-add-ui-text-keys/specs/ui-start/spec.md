## MODIFIED Requirements

### Requirement: Sitzungskarten

Die Startansicht SHALL die geladenen Spielsitzungen als Karten in der Sitzungsliste zeigen.
Jede Karte SHALL den Namen als Überschrift, die Zustandspille mit Text und Icon nach der
Zuordnungstabelle, die Rolle mit Text und Icon sowie die Schaltfläche `Betreten` enthalten;
Pillentext, Rollentext und `Betreten` sind Texte der aktiven Sprache (`ui-text`).
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
  `Sonntagsrunde` (`id: "s2"`), und das Acknowledgement von `session:enter` bestätigt
  `Sonntagsrunde` mit `status: "geoeffnet"`
- **WHEN** der Nutzer `Betreten` innerhalb der Karte `Sonntagsrunde` auslöst
- **THEN** sendet die Anwendung `session:enter` mit der `sessionId` `s2`, und die
  Raumansicht ist gerendert (Überschrift der Ebene 1 `Sonntagsrunde`, Zustandspille
  `Geöffnet`)
