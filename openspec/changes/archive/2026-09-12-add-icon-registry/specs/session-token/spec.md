## MODIFIED Requirements

### Requirement: Token anlegen

Das System SHALL dem Spielleiter über `session:token-create` erlauben, ein Token mit Name,
Farbe, Symbol, Größe und Zelle auf der aktiven Instanz der Spielsitzung anzulegen. Der Server
SHALL die Payload mit zod prüfen, pro Aktion `authorizeAction` mit Rolle `spielleiter`
durchlaufen und die aktive Instanz aus der Spielsitzung lesen — nicht aus der Payload. Bei
Erfolg SHALL das Token gespeichert, dem Absender mit `{ ok: true, token }` bestätigt und
allen im Raum der Tokenbestand per `session:tokens` gesendet werden. Ohne aktive Karte, für
einen Absender ohne Rolle `spielleiter` und bei ungültiger Payload SHALL der Server mit
`{ ok: false, message }` antworten, MUST NOT etwas speichern und MUST NOT `session:tokens`
senden.

#### Scenario: Spielleiter legt ein Token an

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter
  und ein Spieler-Mitglied beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-create` mit `{ sessionId, name: 'Goblin',
  color: '#3366ff', icon: 'undead', size: 2, col: 3, row: 4 }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.name` `Goblin`,
  `token.color` `#3366ff`, `token.icon` `undead`, `token.size` `2`, `token.col` `3`,
  `token.row` `4` und `token.instanceId` gleich der aktiven Instanz, in der Datenbank
  existiert genau ein `Token` mit dieser `id` und dieser `instanceId`, und Spielleiter und
  Spieler erhalten je ein `session:tokens` mit `sessionId` und einer Liste, die genau dieses
  Token enthält

#### Scenario: Ohne aktive Karte wird kein Token angelegt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit einer eingehängten, aber nicht
  aktiven Karte, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-create` mit gültigen Feldern sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }` mit der Meldung
  `Keine Karte aktiv.`, die Anzahl der `Token`-Zeilen in der Datenbank ist `0`, und der
  Spielleiter erhält kein `session:tokens`

#### Scenario: Spieler darf kein Token anlegen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter
  und ein Spieler-Mitglied beide den Raum betreten haben
- **WHEN** der Spieler `session:token-create` mit gültigen Feldern sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }`, die Anzahl der `Token`-Zeilen
  in der Datenbank ist `0`, und der Spielleiter erhält kein `session:tokens`

#### Scenario: Ungültige Felder werden abgelehnt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter
  den Raum betreten hat
- **WHEN** der Spielleiter `session:token-create` viermal sendet: einmal mit leerem `name`,
  einmal mit `color` `rot`, einmal mit `size` `5`, einmal mit `icon` `💀` (ein Emoji des
  früheren Katalogs, kein Symbolname)
- **THEN** ist jedes Acknowledgement `{ ok: false, message }`, und die Anzahl der
  `Token`-Zeilen in der Datenbank ist `0`

### Requirement: Tokenansicht im Raum

Die Raumansicht (`game-session`, „Sitzungsoberfläche") SHALL den Tokenbestand aus dem
Enter-Acknowledgement übernehmen und mit jedem `session:tokens` ersetzen. Die Kartenansicht
SHALL die Tokens der Canvas-Fassade übergeben (beim Erzeugen und bei jeder Änderung per
`setTokens`) — gezeichnet werden sie als farbige Scheibe in Zellgröße mal Tokengröße auf der
Ankerzelle, mit dem Icon der Registry (`ui-icons`) zum Symbolnamen bzw. der Initiale und dem
Namen; ein Token mit `hp` und `hpMax` zusätzlich mit einer Healthbar (Anteil `hp`/`hpMax`,
`tempHp` als eigener Abschnitt), ein Token mit Markierungen mit deren Icons am Rand (Icon
des Katalogeintrags, sonst Kürzel aus den ersten zwei Buchstaben; ab der vierten Markierung
„+N"); keine Zahlen und keine Emoji auf der Karte. Das Aussehen nimmt der menschliche
App-Test ab. Für **jede Rolle** SHALL die Kartenansicht der Fassade einen `onTokenMove`-Rückruf
übergeben, der beim Loslassen eines gezogenen Tokens die Zielzelle als `session:token-move`
sendet, sowie eine Greifbarkeitsregel `canMoveToken`, die pro Token entscheidet, ob es
gezogen werden kann: für den Spielleiter jedes Token, für einen Spieler genau die Tokens mit
`ownerId` gleich seiner eigenen `userId` — dieselbe Regel, die der Server anwendet. Die
Fassade SHALL nur greifbare Tokens ziehen lassen und sie sichtbar kennzeichnen (Aussehen im
App-Test). Ein Token MUST NOT lokal verschoben werden, bevor der Server den Bestand verteilt
hat (`constitution.md` §9.1).

Der Spielleiter SHALL zusätzlich eine Token-Verwaltung sehen: ein Formular zum Anlegen und
eine Liste der Tokens mit „Entfernen", je Token einem Auswahlfeld `<Tokenname> zuweisen`,
dessen Einträge `Spielleiter` (kein Besitzer) und jedes Mitglied mit Rolle `spieler` unter
seinem Anzeigenamen (Alias, sonst Nutzername) sind und dessen Wert der aktuellen Zuweisung
folgt (eine Auswahl sendet `session:token-assign`), sowie je Token: fünf Zahlenfelder
`<Tokenname> HP`, `<Tokenname> HP-Maximum`, `<Tokenname> Temp-HP`, `<Tokenname> RK`,
`<Tokenname> Initiative`, vorbelegt mit den aktuellen Werten (leer für `null`), und eine
Schaltfläche `<Tokenname> Werte speichern`, die `session:token-stats` mit allen fünf Feldern
sendet (leeres Feld als `null`); ein Zahlenfeld `<Tokenname> Änderung` mit den
Schaltflächen `<Tokenname> Schaden` und `<Tokenname> Heilung`, die aus dem aktuellen `hp`
den neuen Wert rechnen (Schaden: `hp` minus Änderung, mindestens 0; Heilung: `hp` plus
Änderung, höchstens `hpMax`) und `session:token-stats` nur mit `hp` senden — bei `hp` `null`
oder einer Änderung, die keine positive ganze Zahl ist, MUST NOT gesendet werden; ein
Auswahlfeld `<Tokenname> Markierung wählen` mit den Einträgen des 5e-Katalogs, dessen
Auswahl `session:token-conditions` mit der bisherigen Liste plus dem gewählten Eintrag
sendet; ein Textfeld `<Tokenname> Markierung` mit Schaltfläche `<Tokenname> Markierung
hinzufügen`, die `session:token-conditions` mit der bisherigen Liste plus dem eingegebenen
Text sendet; je gesetzter Markierung eine Schaltfläche `<Tokenname> Markierung <Markierung>
entfernen`, die `session:token-conditions` mit der bisherigen Liste ohne diese Markierung
sendet. Eine bereits gesetzte Markierung MUST NOT ein zweites Mal gesendet werden. Die
Anzeige folgt ausschließlich dem Bestand vom Server, nie der zuletzt gesendeten Absicht.

Jede Rolle SHALL je Token die sichtbaren Werte als Text sehen: `HP <hp>/<hpMax>`, `Temp
<tempHp>`, `RK <ac>`, `Ini <initiative>` — jeweils nur, wenn der Wert nicht `null` ist —
und die Markierungen als Text in gespeicherter Reihenfolge. Der Spielleiter sieht das in
der Token-Verwaltung; ein Spieler sieht dafür eine Tokenliste mit der Überschrift
`Tokenwerte`, die je Token den Namen und diese Texte zeigt. Spieler MUST NOT die Verwaltung
sehen — weder Formular, Entfernen, Zuweisen, Wertefelder, Schaden/Heilung noch
Markierungsbedienung. Ein abgelehntes Acknowledgement einer Token-Aktion (Anlegen, Bewegen,
Entfernen, Zuweisen, Werte, Markierungen, Teilen) SHALL in der Raumansicht als Meldung
erscheinen — für jede Rolle, also auch für einen Spieler, dessen Bewegung oder Freigabe der
Server ablehnt.

**Freigabe-Schalter.** Für jedes Token, dessen Tokendarstellung `shares` trägt (also nicht
`null` — der Server sendet sie genau an Spielleiter und Besitzer), SHALL die Ansicht je Stat
(Beschriftung `HP`, `Temp-HP`, `RK`, `Initiative`, `Markierungen`) Kontrollkästchen zeigen:
eines `<Tokenname> <Stat> für alle` und je Mitglied mit Rolle `spieler`, dessen `userId`
nicht der `ownerId` des Tokens entspricht, eines `<Tokenname> <Stat> für <Anzeigename>`.
Der Zustand der Kästchen SHALL ausschließlich den Freigaben vom Server folgen: `für alle`
ist angekreuzt genau dann, wenn die Zielgruppe `alle` ist; `für <Anzeigename>` ist
angekreuzt genau dann, wenn die Zielgruppe eine Liste ist, die diese `userId` enthält, und
gesperrt, solange die Zielgruppe `alle` ist. Ankreuzen von `für alle` SHALL
`session:token-share` mit `audience` `'alle'` senden, Abwählen mit `'keine'`; Ankreuzen von
`für <Anzeigename>` SHALL die bisherige Liste (leer, wenn die Zielgruppe keine Liste ist)
plus diese `userId` senden, Abwählen die bisherige Liste ohne diese `userId` — und `'keine'`,
wenn die Liste dadurch leer wird. Der Spielleiter sieht die Schalter in der Token-Verwaltung
für jedes Token; ein Spieler sieht sie in der Liste `Tokenwerte` für die Tokens, deren
`shares` nicht `null` ist. Für ein Token mit `shares` `null` MUST NOT ein Freigabe-Schalter
gerendert werden.

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
- **WHEN** er im Formular `Tokens` den Namen `Goblin`, die Farbe `#3366ff`, in der
  Symbolauswahl den Eintrag `Untoter`, die Größe `2`, Spalte `3` und Zeile `4` einträgt und
  `Anlegen` auslöst
- **THEN** sendet die Socket-Fassade `createToken` mit `sessionId`, `name` `Goblin`,
  `color` `#3366ff`, `icon` `undead`, `size` `2`, `col` `3` und `row` `4`; die Symbolauswahl
  bietet je Katalogeintrag einen Eintrag unter seiner Beschriftung (`Kämpfer`, `Wächter`,
  `Untoter`, `Drache`, `Magier`, `Schütze`, `Adel`, `Bestie`, `Ungeziefer`, `Feuer`) sowie
  `Kein Symbol`, und jeder Eintrag zeigt das Icon der Registry (`ui-icons`) als `<svg>`

#### Scenario: Spielleiter entfernt ein Token über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin`
- **WHEN** er die Schaltfläche `Goblin entfernen` auslöst
- **THEN** sendet die Socket-Fassade `removeToken` mit `sessionId` und der `id` von `Goblin`

#### Scenario: Spielleiter weist ein Token über die Liste zu

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und den Teilnehmern `meister` (Rolle `spielleiter`) und `sam` (Rolle `spieler`,
  `userId` `u-sam`, Alias `Gandalf`)
- **WHEN** er im Auswahlfeld `Goblin zuweisen` den Eintrag `Gandalf` wählt
- **THEN** sendet die Socket-Fassade `assignToken` mit `sessionId`, der `id` von `Goblin` und
  `ownerId` `u-sam`; das Auswahlfeld enthält die Einträge `Spielleiter` und `Gandalf`, aber
  keinen Eintrag `meister` und keinen Eintrag `sam`

#### Scenario: Spielleiter nimmt eine Zuweisung über die Liste zurück

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `u-sam` und einem Teilnehmer `sam` (Rolle `spieler`, `userId` `u-sam`)
- **WHEN** die Raumansicht gerendert ist und er im Auswahlfeld `Goblin zuweisen` den Eintrag
  `Spielleiter` wählt
- **THEN** zeigte das Auswahlfeld zuvor den Wert `u-sam`, und die Socket-Fassade sendet
  `assignToken` mit `sessionId`, der `id` von `Goblin` und `ownerId` `null`

#### Scenario: Abgelehnte Aktion zeigt die Meldung

- **GIVEN** ein Spielleiter im Raum, dessen Socket-Fassade `createToken` mit
  `{ ok: false, message: 'Keine Karte aktiv.' }` beantwortet
- **WHEN** er das Formular `Tokens` mit gültigen Feldern abschickt
- **THEN** zeigt die Raumansicht eine Meldung mit genau dem Text `Keine Karte aktiv.`

#### Scenario: Spielleiter setzt Werte über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` ohne Werte
- **WHEN** er in die Felder `Goblin HP` `23`, `Goblin HP-Maximum` `40` und `Goblin RK` `16`
  einträgt und `Goblin Werte speichern` auslöst
- **THEN** sendet die Socket-Fassade `setTokenStats` mit `sessionId`, der `id` von `Goblin`
  und `{ hp: 23, hpMax: 40, tempHp: null, ac: 16, initiative: null }`

#### Scenario: Wertefelder folgen dem Bestand

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit `hp` `23`,
  `hpMax` `40`, `tempHp` `5`, `ac` `16`, `initiative` `12`
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigen die Felder `Goblin HP` `23`, `Goblin HP-Maximum` `40`, `Goblin Temp-HP`
  `5`, `Goblin RK` `16` und `Goblin Initiative` `12`, und die Liste zeigt die Texte
  `HP 23/40`, `Temp 5`, `RK 16` und `Ini 12`

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
- **WHEN** er im Auswahlfeld `Goblin Markierung wählen` den Eintrag `Liegend` wählt
- **THEN** sendet die Socket-Fassade `setTokenConditions` mit `sessionId`, der `id` von
  `Goblin` und `['Liegend']`; das Auswahlfeld enthält einen Eintrag je Katalogzustand,
  darunter `Liegend`, `Vergiftet` und `Bewusstlos`

#### Scenario: Spielleiter fügt eine freie Markierung hinzu

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit der
  Markierung `['Liegend']`
- **WHEN** er in das Feld `Goblin Markierung` `Segen` einträgt und `Goblin Markierung
  hinzufügen` auslöst
- **THEN** sendet die Socket-Fassade `setTokenConditions` mit `sessionId`, der `id` von
  `Goblin` und `['Liegend', 'Segen']`

#### Scenario: Spielleiter entfernt eine Markierung

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte und einem Token `Goblin` mit den
  Markierungen `['Liegend', 'Segen']`
- **WHEN** er die Schaltfläche `Goblin Markierung Liegend entfernen` auslöst
- **THEN** sendet die Socket-Fassade `setTokenConditions` mit `sessionId`, der `id` von
  `Goblin` und `['Segen']`; vor dem Auslösen zeigte die Markierungsliste des Tokens den
  Eintrag `Liegend` mit dem Icon seines Katalogeintrags (`ui-icons`) als dekoratives `<svg>`
  mit `aria-hidden="true"` und den Eintrag `Segen` (kein Katalogeintrag) ohne dekoratives
  `<svg>` — beide Einträge enthalten daneben die Icon-only-Schaltfläche `Entfernen`, deren
  benanntes `<svg>` (`role="img"`) nicht als Katalog-Icon zählt

#### Scenario: Spieler sieht die Werte seines Tokens

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U`, `hp` `23`, `hpMax` `40`, `tempHp` `5`, `ac` `16`, `initiative` `12` und
  den Markierungen `['Liegend', 'Segen']`
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt sie eine Überschrift `Tokenwerte` und darunter für `Goblin` die Texte
  `HP 23/40`, `Temp 5`, `RK 16`, `Ini 12`, `Liegend` und `Segen`

#### Scenario: Spieler sieht ohne Werte keine Werte

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token `Ork` mit `ownerId`
  `null`, allen fünf Werten `null` und leerer Markierungsliste
- **WHEN** die Raumansicht gerendert ist
- **THEN** zeigt die Liste `Tokenwerte` den Namen `Ork`, aber keinen Text, der mit `HP`,
  `Temp`, `RK` oder `Ini` beginnt

#### Scenario: Spieler sieht keine Token-Verwaltung

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token
- **WHEN** die Raumansicht gerendert ist
- **THEN** existiert weder eine Überschrift `Tokens` noch eine Schaltfläche `Anlegen` noch
  eine Schaltfläche mit dem Namen `<Tokenname> entfernen` noch ein Auswahlfeld mit dem Namen
  `<Tokenname> zuweisen` noch ein Feld `<Tokenname> HP` noch eine Schaltfläche
  `<Tokenname> Werte speichern` noch eine Schaltfläche `<Tokenname> Schaden` noch ein
  Auswahlfeld `<Tokenname> Markierung wählen` noch eine Schaltfläche
  `<Tokenname> Markierung hinzufügen`

#### Scenario: Spielleiter teilt einen Wert mit allen über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares` mit allen fünf Zielgruppen `'keine'`, und den Teilnehmern `meister`
  (Rolle `spielleiter`), `sam` (Rolle `spieler`, `userId` `u-sam`, Alias `Gandalf`) und
  `tom` (Rolle `spieler`, `userId` `u-tom`)
- **WHEN** er das Kontrollkästchen `Goblin HP für alle` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `hp` und `audience` `'alle'`

#### Scenario: Spielleiter teilt einen Wert mit einem Spieler über die Liste

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares` mit allen fünf Zielgruppen `'keine'`, und den Teilnehmern `meister`
  (Rolle `spielleiter`), `sam` (Rolle `spieler`, `userId` `u-sam`, Alias `Gandalf`) und
  `tom` (Rolle `spieler`, `userId` `u-tom`)
- **WHEN** er das Kontrollkästchen `Goblin RK für Gandalf` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `ac` und `audience` `['u-sam']`; es existiert kein Kontrollkästchen mit dem Namen
  `Goblin RK für meister`

#### Scenario: Weiterer Empfänger wird an die Liste angehängt

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares.ac` `['u-sam']`, und den Teilnehmern `sam` (Rolle `spieler`, `userId`
  `u-sam`, Alias `Gandalf`) und `tom` (Rolle `spieler`, `userId` `u-tom`)
- **WHEN** er das Kontrollkästchen `Goblin RK für tom` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `ac` und `audience` `['u-sam', 'u-tom']`

#### Scenario: Abwahl des letzten Empfängers sendet keine

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares.ac` `['u-sam']`, und den Teilnehmern `sam` (Rolle `spieler`, `userId`
  `u-sam`, Alias `Gandalf`) und `tom` (Rolle `spieler`, `userId` `u-tom`)
- **WHEN** er das Kontrollkästchen `Goblin RK für Gandalf` abwählt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `ac` und `audience` `'keine'`

#### Scenario: Abwahl von alle sendet keine

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares.hp` `'alle'`, und einem Teilnehmer `sam` (Rolle `spieler`, `userId`
  `u-sam`, Alias `Gandalf`)
- **WHEN** er das Kontrollkästchen `Goblin HP für alle` abwählt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `hp` und `audience` `'keine'`

#### Scenario: Freigabe-Schalter folgen dem Bestand

- **GIVEN** ein Spielleiter im Raum mit aktiver Karte, einem Token `Goblin` mit `ownerId`
  `null` und `shares` `{ hp: 'alle', tempHp: 'keine', ac: ['u-sam'], initiative: 'keine',
  conditions: 'keine' }`, und den Teilnehmern `sam` (Rolle `spieler`, `userId` `u-sam`,
  Alias `Gandalf`) und `tom` (Rolle `spieler`, `userId` `u-tom`)
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
- **WHEN** die Raumansicht gerendert ist
- **THEN** existieren die Kontrollkästchen `Goblin HP für alle` und `Goblin HP für tom`,
  aber kein Kontrollkästchen `Goblin HP für Gandalf`, kein Kontrollkästchen `Goblin HP für
  meister` und kein Kontrollkästchen, dessen Name mit `Ork` beginnt

#### Scenario: Besitzer teilt über die Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte, einem Token `Goblin` mit
  `ownerId` `U` und `shares` mit allen fünf Zielgruppen `'keine'`, und einem Teilnehmer
  `tom` (Rolle `spieler`, `userId` `u-tom`)
- **WHEN** er das Kontrollkästchen `Goblin Markierungen für tom` ankreuzt
- **THEN** sendet die Socket-Fassade `shareToken` mit `sessionId`, der `id` von `Goblin`,
  `stat` `conditions` und `audience` `['u-tom']`

#### Scenario: Abgelehnte Freigabe zeigt die Meldung

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `shares` mit allen fünf Zielgruppen `'keine'`, dessen Socket-Fassade
  `shareToken` mit `{ ok: false, message: 'Dieses Token darfst du nicht teilen.' }`
  beantwortet
- **WHEN** er das Kontrollkästchen `Goblin HP für alle` ankreuzt
- **THEN** zeigt die Raumansicht eine Meldung mit genau dem Text
  `Dieses Token darfst du nicht teilen.`
