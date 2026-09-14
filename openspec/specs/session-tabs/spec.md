# session-tabs Specification

## Purpose

Bereichs-Reiter der Raumansicht: eine Reiterliste `Bereiche` unter der Session-Bar
(`session-bar`) teilt die Raumansicht in `Karte`, `Tokens`, `Karten & Nebel` und
`Teilnehmer`. Die Karte ist der Held — beim Betreten aktiv, über die volle Breite, so hoch
wie der Viewport es zulässt. Die Panels der Fach-Capabilities (`session-map`,
`session-token`, `session-fog`, `session-annotation`, `game-session`) behalten Beschriftung
und Verhalten und liegen als Raster im jeweiligen Reiter. Die Reiter sind reine Anordnung:
welche Panels eine Rolle bekommt, entscheidet weiterhin die bestehende Rollenprüfung
(`constitution.md` §9).

## Begriffe

- **Reiterliste**: das Element mit `role="tablist"` und dem zugänglichen Namen `Bereiche`.
- **Reiter**: ein `<button role="tab">` in der Reiterliste mit seinem Text als Namen,
  `aria-selected` (`"true"` genau beim aktiven Reiter), `aria-controls` mit der `id`
  seines Panels und `tabindex` (`0` beim aktiven Reiter, `-1` bei jedem anderen — roving
  tabindex).
- **Reiterpanel**: das Element mit `role="tabpanel"`, `aria-labelledby` auf seinen Reiter
  (zugänglicher Name = Reitername) und der Klasse `tab-panel`. Jedes Reiterpanel ist immer
  gerendert; ein inaktives trägt das Attribut `hidden`, das aktive nicht.
- **Aktiver Reiter**: Zustand der Raumansicht; beim Betreten `Karte`. Er wechselt
  ausschließlich durch Klick auf einen Reiter oder Enter/Leertaste auf dem fokussierten
  Reiter — nie durch ein Server-Ereignis, nie durch Pfeiltasten (manuelle Aktivierung).
- **Panel**: ein Verwaltungsblock mit der Klasse `panel`; `panel--wide` spannt im Raster
  über die volle Breite.
- **Raster**: das Reiterpanel ist ein Raster mit Spalten `repeat(auto-fill, minmax(20rem,
  1fr))`; Bühne, Kartenhinweis und `panel--wide` spannen über alle Spalten.
- **Bühne**: das Element der Klasse `map-stage` (`ui-status`), das die Kartenansicht
  trägt; ihre Höhe kommt aus dem Stylesheet, nicht aus einem Inline-Stil.
- **Cluster**: das `<details class="setup-cluster">` mit dem `<summary>` `Bibliothek &
  Einrichtung` in der Kartenverwaltung; zugeklappt = ohne Attribut `open`.
- **Testaufbau-Konvention**: Szenarien anderer Capabilities, die Elemente eines Reiters
  adressieren, setzen voraus, dass der Testaufbau diesen Reiter vorher per Klick aktiviert
  hat. `Karte` ist beim Betreten aktiv und braucht keinen Klick.

## Requirements

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
  enthält die Überschrift `Tokens` der Ebene 2 und das Feld `Goblin HP`; das Reiterpanel
  `Karte` trägt `hidden`; die Socket-Fassade hat kein weiteres `enter` gesendet, und
  `fetch` wurde nicht erneut aufgerufen

#### Scenario: Server-Update erhält den aktiven Reiter

- **GIVEN** die Raumansicht des Spielleiters, der Reiter `Tokens` wurde geklickt
- **WHEN** die Fassade `session:tokens` mit einem neuen Token `Ork` und danach
  `session:status` mit `status: "gestartet"` meldet
- **THEN** trägt `Tokens` weiterhin `aria-selected="true"`, das Reiterpanel `Tokens` ist
  sichtbar und enthält das Feld `Ork HP`, und das Reiterpanel `Karte` trägt weiterhin
  `hidden`

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

### Requirement: Tastaturbedienung der Reiter

Genau der aktive Reiter SHALL `tabindex="0"` tragen, jeder andere `tabindex="-1"`. Auf
einem fokussierten Reiter SHALL `ArrowRight` den Fokus auf den nächsten Reiter bewegen
(nach dem letzten auf den ersten), `ArrowLeft` auf den vorigen (vor dem ersten auf den
letzten), `Home` auf den ersten, `End` auf den letzten — ohne die Auswahl zu ändern.
`Enter` und die Leertaste SHALL den fokussierten Reiter aktivieren. Andere Tasten MUST NOT
Fokus oder Auswahl ändern.

#### Scenario: Pfeil rechts bewegt den Fokus, Enter wählt aus

- **GIVEN** die Raumansicht des Spielleiters, der Reiter `Tokens` wurde geklickt und hat
  den Fokus
- **WHEN** `ArrowRight` gedrückt wird
- **THEN** hat der Reiter `Karten & Nebel` den Fokus, `Tokens` trägt weiterhin
  `aria-selected="true"` und `Karten & Nebel` `aria-selected="false"`
- **WHEN** danach `Enter` gedrückt wird
- **THEN** trägt `Karten & Nebel` `aria-selected="true"` und `tabindex="0"`, `Tokens`
  `aria-selected="false"` und `tabindex="-1"`, und das Reiterpanel `Karten & Nebel` ist
  sichtbar mit der Überschrift `Karten` der Ebene 2

#### Scenario: Pfeil rechts am letzten Reiter springt zum ersten

- **GIVEN** die Raumansicht des Spielleiters, der Reiter `Teilnehmer` wurde geklickt und
  hat den Fokus
- **WHEN** `ArrowRight` gedrückt wird
- **THEN** hat der Reiter `Karte` den Fokus, und `Teilnehmer` bleibt aktiv

#### Scenario: Pfeil links, Home und End

- **GIVEN** die Raumansicht des Spielleiters, der Reiter `Karte` hat den Fokus
- **WHEN** `ArrowLeft` gedrückt wird
- **THEN** hat der Reiter `Teilnehmer` den Fokus
- **WHEN** danach `Home` gedrückt wird
- **THEN** hat der Reiter `Karte` den Fokus
- **WHEN** danach `End` gedrückt wird
- **THEN** hat der Reiter `Teilnehmer` den Fokus, und `Karte` trägt in jedem Schritt
  `aria-selected="true"`

#### Scenario: Leertaste wählt den fokussierten Reiter aus

- **GIVEN** die Raumansicht eines Spielers, der Reiter `Karte` hat den Fokus
- **WHEN** `End` und danach die Leertaste gedrückt wird
- **THEN** trägt `Teilnehmer` `aria-selected="true"`, das Reiterpanel `Teilnehmer` ist
  sichtbar, und das Reiterpanel `Karte` trägt `hidden`

### Requirement: Panel-Raster

Jedes Reiterpanel SHALL die Klasse `tab-panel` tragen. Die Panels `Fog of War`, `Messen &
Zeichnen`, `Karten`, `Tokens`, `Tokenwerte` und `Teilnehmer` SHALL an ihrer Wurzel die
Klasse `panel` tragen; `Tokens` und `Teilnehmer` zusätzlich `panel--wide`. Die Bühne MUST
NOT eine Höhe als Inline-Stil tragen; ihre Höhe und Breite kommen aus dem Stylesheet.

#### Scenario: Panels tragen die Rasterklassen

- **GIVEN** die Raumansicht des Spielleiters mit aktiver Karte (`hasImage: false`) und Fog
- **WHEN** die Raumansicht gerendert wird und danach der Reiter `Tokens` geklickt wird
- **THEN** tragen die Gruppen `Fog of War` und `Messen & Zeichnen` die Klasse `panel`, das
  Panel mit der Überschrift `Tokens` trägt `panel` und `panel--wide`, jedes Reiterpanel
  trägt `tab-panel`, und die Bühne `map-stage` hat kein `style`-Attribut mit `height`

### Requirement: Bibliothek und Einrichtung

Die Kartenverwaltung (`session-map`, „Kartenansicht im Raum") SHALL nach Instanzliste bzw.
Leerzustand und der Schaltfläche `Keine Karte anzeigen` das Cluster `Bibliothek &
Einrichtung` als `<details>` rendern — beim Rendern zugeklappt — mit dem Einhänge-Formular
(Auswahl `Karte aus der Bibliothek`, Schaltfläche `Einhängen`) und einer Schaltfläche
`Kartenbibliothek öffnen`, die dieselbe Ansicht öffnet wie der Eintrag `Kartenbibliothek`
des Verwaltungsmenüs (`session-bar`). Instanzliste, Aktivieren und `Keine Karte anzeigen`
MUST NOT im Cluster liegen.

#### Scenario: Cluster ist zugeklappt und enthält das Einhängen

- **GIVEN** die Raumansicht des Spielleiters, `GET /api/sessions/s1/maps` liefert eine
  Instanz `Taverne` und `GET /api/maps` eine weitere Karte `Keller`
- **WHEN** der Reiter `Karten & Nebel` geklickt wird
- **THEN** enthält das sichtbare Reiterpanel `Karten & Nebel` die Überschrift `Karten`,
  den Listeneintrag `Taverne`, die Schaltfläche `Keine Karte anzeigen` und ein
  `<details>` ohne Attribut `open` mit dem `<summary>` `Bibliothek & Einrichtung`; im
  `<details>` liegen die Auswahl `Karte aus der Bibliothek` mit dem Eintrag `Keller`, die
  Schaltfläche `Einhängen` und die Schaltfläche `Kartenbibliothek öffnen`; `Keine Karte
  anzeigen` liegt im Dokument vor dem `<details>`

#### Scenario: Kartenbibliothek öffnen wechselt zur Bibliothek

- **GIVEN** die Raumansicht des Spielleiters, der Reiter `Karten & Nebel` wurde geklickt
- **WHEN** die Schaltfläche `Kartenbibliothek öffnen` geklickt wird
- **THEN** zeigt die Anwendung die Überschrift der Ebene 1 `Kartenbibliothek`, und die
  Reiterliste `Bereiche` ist nicht mehr vorhanden

### Requirement: Stylesheet der Bereiche

Das Stylesheet SHALL für jeden Bereichs-Selektor eine Regel enthalten — `main.app-shell--wide`,
`.tab-list`, `.tab`, `.tab[aria-selected="true"]`, `.tab-panel`, `.tab-panel[hidden]`,
`.panel--wide`, `.map-caption`, `.map-stage`, `.setup-cluster` — und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine `animation`/`transition` außerhalb davon).

#### Scenario: Bereichs-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Bereichs-Selektor gesucht wird
- **THEN** ist jeder der zehn Bereichs-Selektoren vorhanden, `.tab-panel[hidden]` enthält
  `display: none`, und die Datei enthält weiterhin genau ein `@media`
