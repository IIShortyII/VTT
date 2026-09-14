## MODIFIED Requirements

### Requirement: Bereiche der Raumansicht

Die Raumansicht SHALL nach der Session-Bar und den Raum-Meldungen die Reiterliste
`Bereiche` rendern, sobald das Acknowledgement von `session:enter` vorliegt: für Rolle
`spielleiter` die Reiter `Karte`, `Tokens`, `Karten & Nebel`, `Teilnehmer` in dieser
Reihenfolge; für Rolle `spieler` `Karte`, `Tokens`, `Teilnehmer` — ein Spieler MUST NOT
einen Reiter `Karten & Nebel` bekommen. Beim Betreten SHALL `Karte` aktiv sein. Zu jedem
Reiter SHALL genau ein Reiterpanel gerendert sein, inaktive mit `hidden`. Die Reiter SHALL
Texte der aktiven Sprache sein (`ui-text`). Inhalt der Reiterpanels: `Karte` — der
Kartenhinweis, die Bühne mit der Kartenansicht (`session-map`) und dem Karten-Overlay
(`ui-status`), das Panel `Messen & Zeichnen` (`session-annotation`) und für den Spielleiter
das Panel `Fog of War` (`session-fog`), jeweils unter den dort geltenden Bedingungen;
`Tokens` — die Token-Verwaltung des Spielleiters bzw. die Liste `Tokenwerte` eines
Spielers (`session-token`); `Karten & Nebel` — die Kartenverwaltung (`session-map`);
`Teilnehmer` — ein Panel mit der Überschrift `Teilnehmer` der Ebene 2, der Teilnehmerliste
und dem Alias-Formular (`game-session`). Die Raum-Meldungen zu Token, Fog und Anmerkungen
SHALL vor der Reiterliste liegen, damit sie in jedem Reiter sichtbar sind. Ein Klick auf
einen Reiter SHALL ihn aktivieren. Der aktive Reiter SHALL bei jedem Server-Ereignis
(`session:status`, `session:participants`, `session:map`, `session:tokens`, `session:fog`,
`session:annotations`) erhalten bleiben; ein Reiterwechsel MUST NOT ein Panel neu erzeugen
oder eine Serveranfrage auslösen.

#### Scenario: Reiter des Spielleiters

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, `status: "geoeffnet"` und `map: null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** existiert genau eine Reiterliste `Bereiche`; sie enthält in Dokumentreihenfolge
  die Reiter `Karte`, `Tokens`, `Karten & Nebel`, `Teilnehmer`; `Karte` trägt
  `aria-selected="true"`, die drei anderen `aria-selected="false"`; das Reiterpanel `Karte`
  ist sichtbar und enthält den Text `Keine Karte aktiv`; die Reiterpanels `Tokens`,
  `Karten & Nebel` und `Teilnehmer` tragen `hidden`; die Gruppe `Sitzung` liegt im Dokument
  vor der Reiterliste

#### Scenario: Reiter des Spielers

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"` und `status: "gestartet"`
- **WHEN** die Raumansicht gerendert wird
- **THEN** enthält die Reiterliste `Bereiche` genau die Reiter `Karte`, `Tokens`,
  `Teilnehmer` in dieser Reihenfolge und keinen Reiter `Karten & Nebel`; `Karte` ist aktiv

#### Scenario: Reiter Karte zeigt nur seine Panels

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, `map` mit `name: "Taverne"`, `hasImage: false` und dem Raster
  `quadrat`, 70, 0, 0, `fog` mit `version: 0` und `revealed` als leerer Liste, ein Token
  `Goblin` und zwei Teilnehmer
- **WHEN** die Raumansicht gerendert wird
- **THEN** enthält das sichtbare Reiterpanel `Karte` den Text `Aktive Karte: Taverne`, die
  Bühne und die Gruppen `Messen & Zeichnen` und `Fog of War`; die Überschriften `Tokens`
  und `Karten` der Ebene 2 sowie das Textfeld `Alias` sind über Rollenabfragen nicht
  auffindbar (versteckte Teilbäume), und die Reiterpanels `Tokens`, `Karten & Nebel`,
  `Teilnehmer` tragen `hidden`

#### Scenario: Klick auf einen Reiter wechselt den Bereich

- **GIVEN** die Raumansicht des Spielleiters mit aktivem Reiter `Karte` und einem Token
  `Goblin`
- **WHEN** der Reiter `Tokens` geklickt wird
- **THEN** trägt `Tokens` `aria-selected="true"` und `tabindex="0"`, `Karte`
  `aria-selected="false"` und `tabindex="-1"`; das Reiterpanel `Tokens` ist sichtbar und
  enthält die Überschrift `Tokens` der Ebene 2 und die Schaltfläche `Token anlegen`; das
  Reiterpanel `Karte` trägt `hidden`; die Socket-Fassade hat kein weiteres `enter` gesendet,
  und `fetch` wurde nicht erneut aufgerufen

#### Scenario: Server-Update erhält den aktiven Reiter

- **GIVEN** die Raumansicht des Spielleiters, der Reiter `Tokens` wurde geklickt
- **WHEN** die Fassade `session:tokens` mit einem neuen Token `Ork` und danach
  `session:status` mit `status: "gestartet"` meldet
- **THEN** trägt `Tokens` weiterhin `aria-selected="true"`, das Reiterpanel `Tokens` ist
  sichtbar und enthält den Eintrag `Ork` (die Karte des neuen Tokens), und das Reiterpanel
  `Karte` trägt weiterhin `hidden`

#### Scenario: Reiter Teilnehmer zeigt Liste und Alias

- **GIVEN** die Raumansicht des Spielleiters mit den Teilnehmern `meister` und `sam`
- **WHEN** der Reiter `Teilnehmer` geklickt wird
- **THEN** enthält das sichtbare Reiterpanel `Teilnehmer` die Überschrift `Teilnehmer` der
  Ebene 2, eine Liste mit den Einträgen `meister` und `sam` und das Feld `Alias`

#### Scenario: Reiter Tokens beim Spieler zeigt die Tokenwerte

- **GIVEN** die Raumansicht eines Spielers mit einem Token `Goblin`, dessen `ownerId`
  seine `userId` ist
- **WHEN** der Reiter `Tokens` geklickt wird
- **THEN** enthält das sichtbare Reiterpanel `Tokens` die Überschrift `Tokenwerte` der
  Ebene 2 und den Eintrag `Goblin`, aber keine Überschrift `Tokens`
