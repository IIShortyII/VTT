## MODIFIED Requirements

### Requirement: Tokenansicht im Raum

Die Raumansicht (`game-session`, „Sitzungsoberfläche") SHALL den Tokenbestand aus dem
Enter-Acknowledgement übernehmen und mit jedem `session:tokens` ersetzen. Die Kartenansicht
SHALL die Tokens der Canvas-Fassade übergeben (beim Erzeugen und bei jeder Änderung per
`setTokens`) — gezeichnet werden sie als farbige Scheibe in Zellgröße mal Tokengröße auf der
Ankerzelle, mit Symbol bzw. Initiale und Namen; ein Token mit `hp` und `hpMax` zusätzlich
mit einer Healthbar (Anteil `hp`/`hpMax`, `tempHp` als eigener Abschnitt), ein Token mit
Markierungen mit deren Symbolen am Rand (Katalogsymbol, sonst Kürzel; ab der vierten
Markierung „+N"); keine Zahlen auf der Karte. Das Aussehen nimmt der menschliche App-Test
ab. Für **jede Rolle** SHALL die Kartenansicht der Fassade einen `onTokenMove`-Rückruf
übergeben, der beim Loslassen eines gezogenen Tokens die Zielzelle als `session:token-move`
sendet, sowie eine Greifbarkeitsregel `canMoveToken`, die pro Token entscheidet, ob es
gezogen werden kann: für den Spielleiter jedes Token, für einen Spieler genau die Tokens mit
`ownerId` gleich seiner eigenen `userId` — dieselbe Regel, die der Server anwendet. Die
Fassade SHALL nur greifbare Tokens ziehen lassen und sie sichtbar kennzeichnen (Aussehen im
App-Test). Ein Token MUST NOT lokal verschoben werden, bevor der Server den Bestand verteilt
hat (`constitution.md` §9.1).

Token-Verwaltung und Liste `Tokenwerte` liegen im Reiter `Tokens` der Raumansicht
(`session-tabs`, „Bereiche der Raumansicht"). Szenarien dieses Requirements, die Elemente
eines Reiters adressieren, setzen voraus, dass der Testaufbau diesen Reiter vorher per Klick
aktiviert hat (`session-tabs`, „Testaufbau-Konvention"): Token-Verwaltung und `Tokenwerte`
liegen im Reiter `Tokens`. Der Reiter `Karte` ist beim Betreten aktiv. Szenarien, die ein
Wertefeld, die Markierungsbedienung oder das Anlege-Formular adressieren, setzen zusätzlich
voraus, dass der Testaufbau zuvor das jeweilige Modal geöffnet hat — `Token anlegen` über die
Schaltfläche `Token anlegen` im Panel-Kopf, `<Tokenname> bearbeiten` über den Menüeintrag
`Bearbeiten`.

Der Spielleiter SHALL zusätzlich eine Token-Verwaltung sehen: im Panel-Kopf neben der
Überschrift `Tokens` eine Schaltfläche `Token anlegen`, die ein Modal (`ui-dialog`) mit dem
Titel `Token anlegen` öffnet; darin das Anlege-Formular (Formularmuster von `ui-form` ohne
Feldfehler: Felder `Name`, `Farbe`, Optionszeile `Symbol`, `Größe`, `Spalte`, `Zeile`,
Absende-Schaltfläche `Anlegen` — gesperrt, solange `CreateTokenInputSchema` ohne `sessionId`
den Zustand nicht akzeptiert oder das Acknowledgement aussteht). Ein bestätigendes
Acknowledgement SHALL das Modal schließen und die Felder zurücksetzen; ein ablehnendes SHALL
Modal und Eingaben stehen lassen und die Meldung zeigen. Ohne Tokens SHALL statt der
Kartenliste der Leerzustand von `ui-status` erscheinen (Titel `Noch keine Tokens`, Hinweis
`Lege ein Token an, um es auf der Karte zu sehen.`); die Schaltfläche `Token anlegen` bleibt
im Kopf sichtbar.

Je Token SHALL die Verwaltung eine Karte (`article` der Klasse `token-card`, ein Element der
Rolle `listitem`) rendern mit: einem Kopf aus dem dekorativen Symbol des Tokens (`icon` des
Katalogs, sonst die Initiale des Namens), dem Namen (Klasse `token-card__name`), einer
Zuweisungs-Pill (Klasse `chip`) mit dem Anzeigenamen des Besitzers — Alias, sonst
Nutzername — bzw. `Unzugewiesen` bei `ownerId` `null`, und dem Token-Menü (siehe unten); bei
gesetztem `hp` **und** `hpMax` einem HP-Balken (`div` der Klasse `token-card__hp-bar`) mit dem
Inline-Stil `--pct` gleich `Math.round(hp / hpMax · 100)` (auf 0…100 geklemmt), der bei einem
Anteil von höchstens 25 % zusätzlich die Klasse `token-card__hp-bar--low` trägt; den sichtbaren
Werten als Beschreibungsliste (siehe unten); den Conditions als Chips (siehe unten). Die Karte
des Spielleiters SHALL zusätzlich eine kompakte Schaden/Heilung-Eingabe tragen: ein Zahlenfeld
`<Tokenname> Änderung` mit den Schaltflächen `<Tokenname> Schaden` und `<Tokenname> Heilung`,
die aus dem aktuellen `hp` den neuen Wert rechnen (Schaden `hp` minus Änderung, mindestens 0;
Heilung `hp` plus Änderung, höchstens `hpMax`) und `session:token-stats` nur mit `hp` senden —
bei `hp` `null` oder einer Änderung, die keine positive ganze Zahl ist, MUST NOT gesendet
werden. Die Karte MUST NOT eine Schaltfläche `<Tokenname> entfernen`, ein Auswahlfeld
`<Tokenname> zuweisen` oder Freigabe-Schalter enthalten. Die Anzeige folgt ausschließlich dem
Bestand vom Server, nie der zuletzt gesendeten Absicht.

Jede Rolle SHALL je Token die sichtbaren Werte als Beschreibungsliste (`dl`) sehen: je
gesetztem Wert ein Paar aus `dt` (Beschriftung) und `dd` (Wert) — `HP` mit `<hp>/<hpMax>`
(nur wenn `hp` und `hpMax` nicht `null`), `Temp-HP` mit `<tempHp>`, `RK` mit `<ac>`,
`Initiative` mit `<initiative>` (jeweils nur, wenn der Wert nicht `null` ist) — und die
Markierungen als Chips (`div` der Klasse `token-card__conditions` mit je einem `span` der
Klasse `chip` aus dem dekorativen Katalog-Icon der Markierung, sonst ohne Icon, und dem Label
als Text) in gespeicherter Reihenfolge, nie Bedeutung allein über Farbe. Der Spielleiter sieht
die Karten in der Token-Verwaltung; ein Spieler sieht dafür eine Kartenliste mit der
Überschrift `Tokenwerte` — ohne Tokens statt der Liste den Leerzustand (`ui-status`) mit dem
Titel `Noch keine Tokens` und dem Hinweis `Sobald die Spielleitung Tokens auf die Karte setzt,
erscheinen sie hier.`. Spieler MUST NOT die Verwaltung sehen — weder die Schaltfläche
`Token anlegen`, das Anlege-Modal, die Wertefelder, Schaden/Heilung noch die
Markierungsbedienung; die Einträge `Bearbeiten`, `Zuweisen…` und `Entfernen` seines
Token-Menüs sind gesperrt. Ein abgelehntes Acknowledgement einer Token-Aktion (Anlegen,
Bewegen, Entfernen, Zuweisen, Werte, Markierungen, Teilen) SHALL in der Raumansicht als
Meldung erscheinen — für jede Rolle, also auch für einen Spieler, dessen Bewegung oder
Freigabe der Server ablehnt.

**Token-Menü.** Jede Token-Karte — in der Token-Verwaltung des Spielleiters und in der Liste
`Tokenwerte` eines Spielers — SHALL einen ⋮-Trigger `Aktionen für <Tokenname>` (`ui-menu`,
Variante `more`) tragen; der Trigger und ein Rechtsklick auf die Karte außerhalb von
Formularfeldern SHALL dasselbe Menü `Aktionen für <Tokenname>` öffnen, mit den Einträgen in
dieser Reihenfolge: `Bearbeiten` (Icon `edit`), `Zuweisen…` (Icon `user`), `Freigeben…` (Icon
`players`), `Auf Karte zentrieren` (Icon `locate`), `Entfernen` (Icon `delete`, gefährlich).
Aktiv sind `Bearbeiten`, `Zuweisen…` und `Entfernen` genau dann, wenn die Rolle aus dem
Enter-Acknowledgement `spielleiter` ist, `Freigeben…` genau dann, wenn `shares` des Tokens
nicht `null` ist (`constitution.md` §9.3), `Auf Karte zentrieren` für **jede Rolle**; gesperrte
Einträge bleiben sichtbar. Die Kartenansicht SHALL der Canvas-Fassade für jede Rolle beim
Erzeugen einen Rückruf `onTokenContextMenu` übergeben; die Fassade SHALL das
`contextmenu`-Ereignis des Canvas immer unterdrücken und bei einem Rechtsklick auf ein Token
den Rückruf mit der `id` des Tokens und dem Zeigerpunkt in Viewport-Koordinaten aufrufen; die
Raumansicht SHALL daraufhin dasselbe Menü an diesem Punkt öffnen.

`Bearbeiten` SHALL ein Modal (`ui-dialog`) mit dem Titel `<Tokenname> bearbeiten` öffnen: die
fünf Zahlenfelder `<Tokenname> HP`, `<Tokenname> HP-Maximum`, `<Tokenname> Temp-HP`,
`<Tokenname> RK`, `<Tokenname> Initiative`, vorbelegt mit den aktuellen Werten (leer für
`null`), und eine Schaltfläche `<Tokenname> Werte speichern`, die `session:token-stats` mit
allen fünf Feldern sendet (leeres Feld als `null`); ein Auswahlfeld `<Tokenname> Markierung
wählen` mit den Einträgen des 5e-Katalogs, dessen Auswahl `session:token-conditions` mit der
bisherigen Liste plus dem gewählten Eintrag sendet; ein Textfeld `<Tokenname> Markierung` mit
Schaltfläche `<Tokenname> Markierung hinzufügen`, die `session:token-conditions` mit der
bisherigen Liste plus dem eingegebenen Text sendet; je gesetzter Markierung eine Schaltfläche
`<Tokenname> Markierung <Markierung> entfernen`, die `session:token-conditions` mit der
bisherigen Liste ohne diese Markierung sendet. Eine bereits gesetzte Markierung MUST NOT ein
zweites Mal gesendet werden. `Zuweisen…` SHALL ein Modal (`ui-dialog`) mit dem Titel
`<Tokenname> zuweisen` öffnen: ein Auswahlfeld `Spieler` mit den Einträgen `Spielleiter` (kein
Besitzer) und jedem Mitglied mit Rolle `spieler` unter seinem Anzeigenamen (Alias, sonst
Nutzername), vorbelegt mit der aktuellen Zuweisung, und eine Schaltfläche `Zuweisen`, die
`session:token-assign` sendet und das Modal schließt. `Auf Karte zentrieren` SHALL die Sicht
der aktiven Kartenansicht auf die Ankerzelle des Tokens zentrieren, indem die Raumansicht
`centerOn` der Canvas-Fassade mit der Zelle `{ col, row }` des Tokens aufruft (`map-library`,
„Sicht mit Schwenken und Zoomen"); dieser Eintrag ist für jede Rolle aktiv. `Entfernen` SHALL
den Bestätigungsdialog (`ui-dialog`) mit dem Titel `Token „<Tokenname>" entfernen?`, der
Beschreibung `Das Token wird von der Karte entfernt.` und der bestätigenden Schaltfläche
`Entfernen` öffnen; erst dessen Bestätigung sendet `session:token-remove`, Abbrechen MUST NOT
senden.

**Freigabe-Schalter.** Für jedes Token, dessen Tokendarstellung `shares` trägt (also nicht
`null` — der Server sendet sie genau an Spielleiter und Besitzer), SHALL das Freigaben-Modal je
Stat (Beschriftung `HP`, `Temp-HP`, `RK`, `Initiative`, `Markierungen`) Kontrollkästchen
zeigen: eines `<Tokenname> <Stat> für alle` und je Mitglied mit Rolle `spieler`, dessen
`userId` nicht der `ownerId` des Tokens entspricht, eines `<Tokenname> <Stat> für
<Anzeigename>`. Der Zustand der Kästchen SHALL ausschließlich den Freigaben vom Server folgen:
`für alle` ist angekreuzt genau dann, wenn die Zielgruppe `alle` ist; `für <Anzeigename>` ist
angekreuzt genau dann, wenn die Zielgruppe eine Liste ist, die diese `userId` enthält, und
gesperrt, solange die Zielgruppe `alle` ist. Ankreuzen von `für alle` SHALL
`session:token-share` mit `audience` `'alle'` senden, Abwählen mit `'keine'`; Ankreuzen von
`für <Anzeigename>` SHALL die bisherige Liste (leer, wenn die Zielgruppe keine Liste ist) plus
diese `userId` senden, Abwählen die bisherige Liste ohne diese `userId` — und `'keine'`, wenn
die Liste dadurch leer wird. Die Schalter liegen in einem Modal (`ui-dialog`) mit dem Titel
`Freigaben für <Tokenname>`, das der Eintrag `Freigeben…` des Token-Menüs öffnet — für den
Spielleiter aus der Token-Verwaltung, für einen Besitzer aus der Liste `Tokenwerte` oder per
Rechtsklick auf sein Token; der Zustand der Kästchen folgt dem jeweils zuletzt gemeldeten
Bestand, auch während das Modal offen ist. Für ein Token mit `shares` `null` ist `Freigeben…`
gesperrt, und es MUST NOT ein Freigabe-Schalter gerendert werden.

#### Scenario: Tokens erreichen die Kartenansicht

- **GIVEN** ein Spieler betritt eine Spielsitzung, deren Enter-Acknowledgement eine aktive
  Karte und zwei Tokens liefert
- **WHEN** die Raumansicht gerendert ist
- **THEN** wurde die Canvas-Fassade mit genau diesen zwei Tokens erzeugt

#### Scenario: Tokenbestand folgt dem Server

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token
- **WHEN** ein `session:tokens` mit zwei Tokens eintrifft
- **THEN** wird `setTokens` der Canvas-Fassade mit genau diesen zwei Tokens aufgerufen

#### Scenario: Spielleiter zieht ein Token

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin`
- **WHEN** die Canvas-Fassade den beim Erzeugen übergebenen `onTokenMove`-Rückruf mit der
  `id` von `Goblin` und der Zelle `{ col: 7, row: 1 }` aufruft
- **THEN** sendet die Socket-Fassade `moveToken` mit `sessionId`, dieser `id`, `col` `7` und
  `row` `1`

#### Scenario: Spieler zieht nicht

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Ork` mit
  `ownerId` `null`
- **WHEN** die Raumansicht gerendert ist
- **THEN** wurde die Canvas-Fassade mit genau diesem Token, einem `onTokenMove`-Rückruf und
  einer `canMoveToken`-Regel erzeugt, die für `Ork` `false` liefert

#### Scenario: Spieler greift nur eigene Tokens

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte, einem Token `Goblin` mit
  `ownerId` `U` und einem Token `Ork` mit `ownerId` `null`
- **WHEN** die Canvas-Fassade den beim Erzeugen übergebenen `onTokenMove`-Rückruf mit der
  `id` von `Goblin` und der Zelle `{ col: 7, row: 1 }` aufruft
- **THEN** liefert die beim Erzeugen übergebene `canMoveToken`-Regel für `Goblin` `true` und
  für `Ork` `false`, und die Socket-Fassade sendet `moveToken` mit `sessionId`, der `id` von
  `Goblin`, `col` `7` und `row` `1`

#### Scenario: Spieler sieht die abgelehnte Bewegung

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token `Goblin`, dessen
  Socket-Fassade `moveToken` mit
  `{ ok: false, message: 'Dieses Token darfst du nicht bewegen.' }` beantwortet
- **WHEN** die Canvas-Fassade den `onTokenMove`-Rückruf mit der `id` von `Goblin` aufruft
- **THEN** zeigt die Raumansicht eine Meldung mit genau dem Text
  `Dieses Token darfst du nicht bewegen.`

#### Scenario: Spielleiter legt ein Token über das Formular an

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte
- **WHEN** er über die Schaltfläche `Token anlegen` das Modal `Token anlegen` öffnet, darin
  den Namen `Goblin`, die Farbe `#3366ff`, das Symbol `Untoter`, die Größe `2`, Spalte `3`
  und Zeile `4` einträgt und `Anlegen` auslöst
- **THEN** sendet die Socket-Fassade `createToken` mit `sessionId`, `name` `Goblin`, `color`
  `#3366ff`, `icon` `undead`, `size` `2`, `col` `3` und `row` `4`; solange das
  Acknowledgement aussteht, ist `Anlegen` gesperrt und trägt `aria-busy="true"`; nach dem
  bestätigenden Acknowledgement ist das Modal `Token anlegen` geschlossen

#### Scenario: Abgelehnte Aktion zeigt die Meldung

- **GIVEN** ein Spielleiter im Raum, dessen Socket-Fassade `createToken` mit
  `{ ok: false, message: 'Keine Karte aktiv.' }` beantwortet
- **WHEN** er das Modal `Token anlegen` öffnet, gültige Felder einträgt und `Anlegen` auslöst
- **THEN** zeigt die Raumansicht eine Meldung mit genau dem Text `Keine Karte aktiv.`, das
  Modal `Token anlegen` ist weiterhin offen, und das Feld `Name` trägt weiterhin den
  eingegebenen Namen

#### Scenario: Anlegen bleibt gesperrt ohne Namen

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, der das Modal `Token anlegen` geöffnet
  hat und dessen Feld `Name` leer ist
- **WHEN** die Schaltfläche `Anlegen` angeklickt und das Formular abgeschickt wird
- **THEN** ist die Schaltfläche `Anlegen` gesperrt, und die Socket-Fassade hat kein
  `createToken` gesendet

#### Scenario: Karte zeigt die Zuweisung als Pill

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `u-sam` und einem Token `Ork` mit `ownerId` `null`, und einem Teilnehmer `sam` (Rolle
  `spieler`, `userId` `u-sam`, Alias `Gandalf`)
- **WHEN** die Raumansicht gerendert ist
- **THEN** trägt die Karte von `Goblin` eine Pill der Klasse `chip` mit dem Text `Gandalf`
  und die Karte von `Ork` eine Pill der Klasse `chip` mit dem Text `Unzugewiesen`

#### Scenario: Karte zeigt den HP-Balken mit Anteil und Low-Klasse

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit `hp` `10`
  und `hpMax` `40`
- **WHEN** die Raumansicht gerendert ist
- **THEN** trägt die Karte von `Goblin` genau ein Element der Klasse `token-card__hp-bar` mit
  dem Inline-Stil `--pct: 25` und der Klasse `token-card__hp-bar--low`

#### Scenario: Karte ohne volle Trefferpunkte-Angabe zeigt keinen Balken

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Ork` mit `hp` `null`
  und `hpMax` `null`
- **WHEN** die Raumansicht gerendert ist
- **THEN** trägt die Karte von `Ork` kein Element der Klasse `token-card__hp-bar`

#### Scenario: Karte zeigt Conditions als Chips mit Icon und Label

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit den
  Markierungen `['Vergiftet', 'Segen']`
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt die Karte von `Goblin` genau zwei Chips (Klasse `chip`) in dieser
  Reihenfolge: einen mit dem Text `Vergiftet` und einem `<svg>` als Icon, einen mit dem Text
  `Segen` ohne `<svg>`

#### Scenario: Spielleiter entfernt ein Token über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin`
- **WHEN** er das Menü `Aktionen für Goblin` über den Trigger öffnet, `Entfernen` wählt und
  im Bestätigungsdialog `Token „Goblin" entfernen?` die Schaltfläche `Entfernen` auslöst
- **THEN** hatte die Socket-Fassade vor der Bestätigung kein `removeToken` gesendet und
  sendet danach `removeToken` mit `sessionId` und der `id` von `Goblin`; der Dialog ist
  geschlossen

#### Scenario: Spielleiter weist ein Token über die Liste zu

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und den Teilnehmern `meister` (Rolle `spielleiter`) und `sam` (Rolle `spieler`,
  `userId` `u-sam`, Alias `Gandalf`)
- **WHEN** er im Menü `Aktionen für Goblin` den Eintrag `Zuweisen…` wählt, im Dialog
  `Goblin zuweisen` im Auswahlfeld `Spieler` den Eintrag `Gandalf` wählt und `Zuweisen`
  auslöst
- **THEN** sendet die Socket-Fassade `assignToken` mit `sessionId`, der `id` von `Goblin` und
  `ownerId` `u-sam`; das Auswahlfeld enthielt die Einträge `Spielleiter` und `Gandalf`, aber
  keinen Eintrag `meister` und keinen Eintrag `sam`; der Dialog `Goblin zuweisen` ist
  geschlossen

#### Scenario: Spielleiter nimmt eine Zuweisung über die Liste zurück

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `u-sam` und einem Teilnehmer `sam` (Rolle `spieler`, `userId` `u-sam`)
- **WHEN** die Raumansicht gerendert ist, er im Menü `Aktionen für Goblin` den Eintrag
  `Zuweisen…` wählt und im Dialog `Goblin zuweisen` im Auswahlfeld `Spieler` den Eintrag
  `Spielleiter` wählt und `Zuweisen` auslöst
- **THEN** zeigte das Auswahlfeld `Spieler` zuvor den Wert `u-sam`, und die Socket-Fassade
  sendet `assignToken` mit `sessionId`, der `id` von `Goblin` und `ownerId` `null`

#### Scenario: Spielleiter setzt Werte über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` ohne Werte
- **WHEN** er im Menü `Aktionen für Goblin` `Bearbeiten` wählt und im Modal `Goblin
  bearbeiten` in die Felder `Goblin HP` `23`, `Goblin HP-Maximum` `40` und `Goblin RK` `16`
  einträgt und `Goblin Werte speichern` auslöst
- **THEN** sendet die Socket-Fassade `setTokenStats` mit `sessionId`, der `id` von `Goblin`
  und `{ hp: 23, hpMax: 40, tempHp: null, ac: 16, initiative: null }`

#### Scenario: Wertefelder folgen dem Bestand

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit `hp` `23`,
  `hpMax` `40`, `tempHp` `5`, `ac` `16`, `initiative` `12`
- **WHEN** er im Menü `Aktionen für Goblin` `Bearbeiten` wählt
- **THEN** zeigen im Modal `Goblin bearbeiten` die Felder `Goblin HP` `23`, `Goblin
  HP-Maximum` `40`, `Goblin Temp-HP` `5`, `Goblin RK` `16` und `Goblin Initiative` `12`, und
  die Karte von `Goblin` zeigt eine Beschreibungsliste mit den Paaren `HP`/`23/40`,
  `Temp-HP`/`5`, `RK`/`16` und `Initiative`/`12`

#### Scenario: Schaden über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit `hp` `23`,
  `hpMax` `40`
- **WHEN** er in das Feld `Goblin Änderung` `7` einträgt und `Goblin Schaden` auslöst
- **THEN** sendet die Socket-Fassade `setTokenStats` mit `sessionId`, der `id` von `Goblin`
  und genau `{ hp: 16 }`

#### Scenario: Heilung deckelt am Maximum

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit `hp` `38`,
  `hpMax` `40`
- **WHEN** er in das Feld `Goblin Änderung` `5` einträgt und `Goblin Heilung` auslöst
- **THEN** sendet die Socket-Fassade `setTokenStats` mit `sessionId`, der `id` von `Goblin`
  und genau `{ hp: 40 }`

#### Scenario: Schaden ohne Trefferpunkte sendet nichts

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` ohne Werte
- **WHEN** er in das Feld `Goblin Änderung` `7` einträgt und `Goblin Schaden` auslöst
- **THEN** sendet die Socket-Fassade kein `setTokenStats`

#### Scenario: Spielleiter setzt eine Markierung über die Schnellwahl

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` ohne
  Markierungen
- **WHEN** er im Menü `Aktionen für Goblin` `Bearbeiten` wählt und im Modal `Goblin
  bearbeiten` im Auswahlfeld `Goblin Markierung wählen` den Eintrag `Liegend` wählt
- **THEN** sendet die Socket-Fassade `setTokenConditions` mit `sessionId`, der `id` von
  `Goblin` und `['Liegend']`; das Auswahlfeld enthält einen Eintrag je Katalogzustand,
  darunter `Liegend`, `Vergiftet` und `Bewusstlos`

#### Scenario: Spielleiter fügt eine freie Markierung hinzu

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit der
  Markierung `['Liegend']`
- **WHEN** er im Modal `Goblin bearbeiten` in das Feld `Goblin Markierung` `Segen` einträgt
  und `Goblin Markierung hinzufügen` auslöst
- **THEN** sendet die Socket-Fassade `setTokenConditions` mit `sessionId`, der `id` von
  `Goblin` und `['Liegend', 'Segen']`

#### Scenario: Spielleiter entfernt eine Markierung

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit den
  Markierungen `['Liegend', 'Segen']`
- **WHEN** er im Modal `Goblin bearbeiten` die Schaltfläche `Goblin Markierung Liegend
  entfernen` auslöst
- **THEN** sendet die Socket-Fassade `setTokenConditions` mit `sessionId`, der `id` von
  `Goblin` und `['Segen']`

#### Scenario: Spieler sieht die Werte seines Tokens

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U`, `hp` `23`, `hpMax` `40`, `tempHp` `5`, `ac` `16`, `initiative` `12` und
  den Markierungen `['Liegend', 'Segen']`
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt sie eine Überschrift `Tokenwerte` und darunter für `Goblin` eine
  Beschreibungsliste mit den Paaren `HP`/`23/40`, `Temp-HP`/`5`, `RK`/`16`,
  `Initiative`/`12` sowie die Chips `Liegend` und `Segen`

#### Scenario: Spieler sieht ohne Werte keine Werte

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token `Ork` mit `ownerId`
  `null`, allen fünf Werten `null` und leerer Markierungsliste
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt die Karte von `Ork` den Namen `Ork`, aber keine Beschreibungsliste mit einem
  `dt` `HP`, `Temp-HP`, `RK` oder `Initiative` und keinen Chip

#### Scenario: Spieler sieht keine Token-Verwaltung

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token `Ork` mit `ownerId`
  `null` und `shares` `null`
- **WHEN** die Raumansicht gerendert ist und er das Menü `Aktionen für Ork` unter
  `Tokenwerte` über den Trigger öffnet
- **THEN** existiert weder eine Überschrift `Tokens` noch eine Schaltfläche `Token anlegen`
  noch eine Schaltfläche `Anlegen` noch ein Feld `Ork HP` noch eine Schaltfläche `Ork Werte
  speichern` noch eine Schaltfläche `Ork Schaden` noch ein Auswahlfeld `Ork Markierung wählen`
  noch eine Schaltfläche `Ork Markierung hinzufügen` noch eine Schaltfläche `Ork entfernen`
  noch ein Auswahlfeld `Ork zuweisen`; das Menü `Aktionen für Ork` zeigt die Einträge
  `Bearbeiten`, `Zuweisen…`, `Freigeben…`, `Auf Karte zentrieren` und `Entfernen`, davon
  `Bearbeiten`, `Zuweisen…`, `Freigeben…` und `Entfernen` gesperrt und `Auf Karte zentrieren`
  nicht gesperrt

#### Scenario: Spielleiter teilt einen Wert mit allen über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares` mit allen fünf Zielgruppen `'keine'`, und den Teilnehmern `meister`
  (Rolle `spielleiter`), `sam` (Rolle `spieler`, `userId` `u-sam`, Alias `Gandalf`) und
  `tom` (Rolle `spieler`, `userId` `u-tom`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin HP für alle` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `hp` und `audience` `'alle'`

#### Scenario: Spielleiter teilt einen Wert mit einem Spieler über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares` mit allen fünf Zielgruppen `'keine'`, und den Teilnehmern `meister`
  (Rolle `spielleiter`), `sam` (Rolle `spieler`, `userId` `u-sam`, Alias `Gandalf`) und
  `tom` (Rolle `spieler`, `userId` `u-tom`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin RK für Gandalf` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `ac` und `audience` `['u-sam']`; es existiert kein Kontrollkästchen mit dem Namen
  `Goblin RK für meister`

#### Scenario: Weiterer Empfänger wird an die Liste angehängt

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares.ac` `['u-sam']`, und den Teilnehmern `sam` (Rolle `spieler`, `userId`
  `u-sam`, Alias `Gandalf`) und `tom` (Rolle `spieler`, `userId` `u-tom`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin RK für tom` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `ac` und `audience` `['u-sam', 'u-tom']`

#### Scenario: Abwahl des letzten Empfängers sendet keine

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares.ac` `['u-sam']`, und den Teilnehmern `sam` (Rolle `spieler`, `userId`
  `u-sam`, Alias `Gandalf`) und `tom` (Rolle `spieler`, `userId` `u-tom`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin RK für Gandalf` abwählt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `ac` und `audience` `'keine'`

#### Scenario: Abwahl von alle sendet keine

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares.hp` `'alle'`, und einem Teilnehmer `sam` (Rolle `spieler`, `userId`
  `u-sam`, Alias `Gandalf`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin HP für alle` abwählt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `hp` und `audience` `'keine'`

#### Scenario: Freigabe-Schalter folgen dem Bestand

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares` `{ hp: 'alle', tempHp: 'keine', ac: ['u-sam'], initiative: 'keine',
  conditions: 'keine' }`, und den Teilnehmern `sam` (Rolle `spieler`, `userId` `u-sam`,
  Alias `Gandalf`) und `tom` (Rolle `spieler`, `userId` `u-tom`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** die Raumansicht gerendert ist
- **THEN** ist `Goblin HP für alle` angekreuzt, `Goblin HP für Gandalf` gesperrt und nicht
  angekreuzt, `Goblin RK für Gandalf` angekreuzt und nicht gesperrt, `Goblin RK für tom`
  nicht angekreuzt und nicht gesperrt, `Goblin Markierungen für alle` nicht angekreuzt, und
  es existieren die Kontrollkästchen `Goblin Temp-HP für alle` und `Goblin Initiative für
  alle`

#### Scenario: Besitzer sieht Freigabe-Schalter nur am eigenen Token

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte, einem Token `Goblin` mit
  `ownerId` `U` und `shares` mit allen fünf Zielgruppen `'keine'`, einem Token `Ork` mit
  `ownerId` `null` und `shares` `null`, und den Teilnehmern `meister` (Rolle
  `spielleiter`), dem Spieler selbst (Rolle `spieler`, `userId` `U`, Alias `Gandalf`) und
  `tom` (Rolle `spieler`, `userId` `u-tom`)
- **WHEN** die Raumansicht gerendert ist, er das Menü `Aktionen für Ork` unter `Tokenwerte`
  öffnet und mit `Escape` schließt, dann das Menü `Aktionen für Goblin` öffnet und
  `Freigeben…` wählt
- **THEN** war im Menü `Aktionen für Ork` der Eintrag `Freigeben…` gesperrt, im Menü
  `Aktionen für Goblin` nicht gesperrt; der Dialog `Freigaben für Goblin` enthält die
  Kontrollkästchen `Goblin HP für alle` und `Goblin HP für tom`, aber kein Kontrollkästchen
  `Goblin HP für Gandalf`, kein Kontrollkästchen `Goblin HP für meister` und kein
  Kontrollkästchen, dessen Name mit `Ork` beginnt

#### Scenario: Besitzer teilt über die Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte, einem Token `Goblin` mit
  `ownerId` `U` und `shares` mit allen fünf Zielgruppen `'keine'`, und einem Teilnehmer
  `tom` (Rolle `spieler`, `userId` `u-tom`);
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin Markierungen für tom` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `conditions` und `audience` `['u-tom']`

#### Scenario: Abgelehnte Freigabe zeigt die Meldung

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `shares` mit allen fünf Zielgruppen `'keine'`, dessen Socket-Fassade
  `shareToken` mit `{ ok: false, message: 'Dieses Token darfst du nicht teilen.' }`
  beantwortet;
  das Modal `Freigaben für Goblin` ist über den Eintrag `Freigeben…` des Menüs
  `Aktionen für Goblin` geöffnet
- **WHEN** er das Kontrollkästchen `Goblin HP für alle` ankreuzt
- **THEN** zeigt die Raumansicht eine Meldung mit genau dem Text
  `Dieses Token darfst du nicht teilen.`

#### Scenario: Leere Token-Verwaltung zeigt den Leerzustand

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, und das Acknowledgement nennt
  `tokens: []`
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt die Token-Verwaltung (unter der Überschrift `Tokens`) einen Absatz der Klasse
  `empty-state` mit dem Titel `Noch keine Tokens` und dem Hinweis
  `Lege ein Token an, um es auf der Karte zu sehen.`, kein Element der Rolle `listitem`, und
  weiterhin die Schaltfläche `Token anlegen` im Kopf

#### Scenario: Leere Tokenwerte zeigen den Leerzustand

- **GIVEN** ein Spieler im Raum mit aktiver Karte, und das Acknowledgement nennt `tokens: []`
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt die Liste `Tokenwerte` (unter der Überschrift `Tokenwerte`) einen Absatz
  der Klasse `empty-state` mit dem Titel `Noch keine Tokens` und dem Hinweis
  `Sobald die Spielleitung Tokens auf die Karte setzt, erscheinen sie hier.`, und kein
  Element der Rolle `listitem`

#### Scenario: Kartenansicht erhält den Kontextmenü-Rückruf

- **GIVEN** ein Spieler betritt eine Spielsitzung, deren Enter-Acknowledgement eine aktive
  Karte und ein Token liefert
- **WHEN** die Raumansicht gerendert ist
- **THEN** wurde die Canvas-Fassade mit einer Funktion `onTokenContextMenu` in ihren
  Optionen erzeugt

#### Scenario: Rechtsklick auf ein Token der Karte öffnet das Token-Menü am Zeiger

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit `shares`
  mit allen fünf Zielgruppen `'keine'`
- **WHEN** die Canvas-Fassade den beim Erzeugen übergebenen `onTokenContextMenu`-Rückruf mit
  der `id` von `Goblin` und `{ x: 120, y: 80 }` aufruft
- **THEN** existiert ein Element der Rolle `menu` mit dem Namen `Aktionen für Goblin` und
  dem Inline-Stil `left: 120px` und `top: 80px`, mit den Einträgen `Bearbeiten`,
  `Zuweisen…`, `Freigeben…`, `Auf Karte zentrieren` und `Entfernen` in dieser Reihenfolge,
  keiner gesperrt, `Entfernen` mit der Klasse `menu-item--danger`, und `Bearbeiten` hat den
  Fokus

#### Scenario: Rechtsklick auf die Token-Zeile öffnet das Menü

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin`
- **WHEN** `contextmenu` mit `clientX` 30 und `clientY` 40 auf dem Namen `Goblin` der
  Token-Karte ausgelöst wird
- **THEN** wurde die Standardwirkung unterdrückt, und es existiert ein Element der Rolle
  `menu` mit dem Namen `Aktionen für Goblin` und dem Inline-Stil `left: 30px` und
  `top: 40px`

#### Scenario: Bearbeiten setzt den Fokus in das HP-Feld

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin`
- **WHEN** er das Menü `Aktionen für Goblin` über den Trigger öffnet und `Bearbeiten` wählt
- **THEN** existiert kein Element der Rolle `menu`, und es existiert ein Dialog `Goblin
  bearbeiten` mit einem Feld `Goblin HP`, das den Fokus hat

#### Scenario: Abgebrochenes Entfernen sendet nichts

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin`
- **WHEN** er das Menü `Aktionen für Goblin` über den Trigger öffnet, `Entfernen` wählt und
  im Bestätigungsdialog `Token „Goblin" entfernen?` die Schaltfläche `Abbrechen` auslöst
- **THEN** hat die Socket-Fassade kein `removeToken` gesendet, der Dialog ist geschlossen,
  und der Trigger `Aktionen für Goblin` hat den Fokus

#### Scenario: Auf Karte zentrieren zentriert die Sicht auf das Token

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` in Zelle
  `(7, 1)`
- **WHEN** er das Menü `Aktionen für Goblin` über den Trigger öffnet und `Auf Karte
  zentrieren` wählt
- **THEN** wird `centerOn` der Canvas-Fassade mit der Zelle `{ col: 7, row: 1 }` aufgerufen

#### Scenario: Spieler zentriert auf sein Token

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` in Zelle `(2, 5)`
- **WHEN** er das Menü `Aktionen für Goblin` unter `Tokenwerte` über den Trigger öffnet und
  `Auf Karte zentrieren` wählt
- **THEN** wird `centerOn` der Canvas-Fassade mit der Zelle `{ col: 2, row: 5 }` aufgerufen

#### Scenario: Spieler sieht im Token-Menü nur Freigeben aktiv

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `shares` mit allen fünf Zielgruppen `'keine'`
- **WHEN** er das Menü `Aktionen für Goblin` unter `Tokenwerte` über den Trigger öffnet
- **THEN** zeigt das Menü `Bearbeiten`, `Zuweisen…` und `Entfernen` gesperrt sowie
  `Freigeben…` und `Auf Karte zentrieren` nicht gesperrt, und `Freigeben…` hat den Fokus
