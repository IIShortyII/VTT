# session-token Specification

## Purpose

Figuren auf der aktiven Karte: der Spielleiter legt Tokens an, verschiebt und entfernt sie und
weist sie Spielern zu; ein Spieler verschiebt ausschließlich die ihm zugewiesenen Tokens;
alle Teilnehmer im Raum sehen denselben Bestand in Echtzeit. Legt fest, dass jede Aktion
serverseitig gegen die aktuelle Zuweisung geprüft wird, dass Tokens an
der Karteninstanz hängen und damit Kartenwechsel und Neustart überleben, und dass der
Bestand beim Betreten und bei jedem Kartenwechsel mitkommt.

## Begriffe

- **Token**: eine Figur auf einer Karteninstanz (Modell `Token`): Instanz, Name, Farbe,
  Symbol, Größe, Zelle. Ein Token gehört genau einer Instanz (`session-map`, „Karteninstanz").
- **Name**: getrimmter Text, 1 bis 40 Zeichen, keine Steuerzeichen; frei vergeben durch den
  Spielleiter, nicht eindeutig.
- **Farbe**: Hex-Farbwert `#rrggbb` (6 Hex-Ziffern, Groß-/Kleinschreibung egal).
- **Symbol**: ein Eintrag des festen Symbolkatalogs `TOKEN_ICONS` (`⚔️`, `🛡️`, `💀`,
  `🐉`, `🧙`, `🏹`, `👑`, `🐺`, `🕷️`, `🔥`) oder `null` (kein Symbol — der Client zeigt dann
  die Initiale des Namens).
- **Größe**: ganze Zahl 1 bis 4, Kantenlänge in Zellen (1 = eine Zelle, 4 = 4×4 Zellen).
- **Zelle**: `{ col, row }` als ganze Zahlen im Raster der Karte (`map-library`,
  „Rastergeometrie"); die Ankerzelle des Tokens. Negative Werte und Zellen außerhalb des
  Bilds sind zulässig — der Server prüft keinen Kartenrand.
- **Aktive Instanz**: die aktive Karte der Spielsitzung (`session-map`, „Aktive Karte").
  Tokens werden ausschließlich auf der aktiven Instanz angelegt, bewegt und entfernt.
- **Tokendarstellung**: `{ id, instanceId, name, color, icon, size, col, row, ownerId, hp,
  hpMax, tempHp, ac, initiative, conditions }` — `icon` ist ein Katalogeintrag oder `null`;
  `ownerId` ist die `userId` des Besitzers oder `null` („gehört dem Spielleiter“, Requirement
  „Token zuweisen“); `hp`, `hpMax`, `tempHp`, `ac`, `initiative` sind ganze Zahlen oder
  `null` („nicht gesetzt" **oder** „für diesen Empfänger verborgen", ununterscheidbar);
  `conditions` ist die Markierungsliste in gespeicherter Reihenfolge, für einen Empfänger
  ohne Sicht die leere Liste (Requirement „Sichtbarkeit der Tokenwerte").
- **Werte**: die fünf Zahlenfelder `hp`/`hpMax` (Trefferpunkte aktuell und Maximum, ein
  Stat), `tempHp` (temporäre Trefferpunkte), `ac` (Rüstungsklasse), `initiative` und die
  Markierungsliste `conditions` zusammen. Ein neu angelegtes Token hat keine Werte.
- **Markierung**: getrimmter Text, 1 bis 20 Zeichen, keine Steuerzeichen; je Token
  eindeutig, höchstens 12 je Token; frei vergeben durch den Spielleiter. Der 5e-Katalog ist
  eine Schnellwahl des Clients, kein Serververtrag.
- **Tokenbestand**: alle Tokens der aktiven Instanz als Liste von Tokendarstellungen,
  aufsteigend nach Anlegezeitpunkt; ohne aktive Karte die leere Liste. Er erreicht jeden
  Teilnehmer im Raum **je Verbindung gefiltert** (`constitution.md` §9.2): der Spielleiter
  sieht alle Werte, ein Spieler die Werte seiner eigenen Tokens, sonst `null` und `[]`.
  Tokens nicht aktiver Instanzen verlassen den Server nicht.

Drahtformat (Client → Server, je mit Acknowledgement):
`session:token-create` `{ sessionId, name, color, icon, size, col, row }` →
`{ ok: true, token }` oder `{ ok: false, message }`;
`session:token-move` `{ sessionId, tokenId, col, row }` → `{ ok: true, token }` oder
`{ ok: false, message }`; `session:token-remove` `{ sessionId, tokenId }` → `{ ok: true }`
oder `{ ok: false, message }`; `session:token-assign` `{ sessionId, tokenId, ownerId }` mit
`ownerId` als `userId` oder `null` → `{ ok: true, token }` oder `{ ok: false, message }`;
`session:token-stats` `{ sessionId, tokenId, hp?, hpMax?, tempHp?, ac?, initiative? }`
(Teilobjekt — jedes Feld optional, ein gesetztes Feld ist eine ganze Zahl oder `null`) →
`{ ok: true, token }` oder `{ ok: false, message }`; `session:token-conditions`
`{ sessionId, tokenId, conditions }` mit `conditions` als vollständiger Liste →
`{ ok: true, token }` oder `{ ok: false, message }`. Die Tokendarstellung im Acknowledgement
einer Spielleiter-Aktion ist ungefiltert.
Server → Client: `session:tokens` `{ sessionId, tokens }` mit dem für diesen Empfänger
gefilterten Tokenbestand — je Verbindung gesendet, nicht als ein Paket an den Raum. Das
Acknowledgement von `session:enter` (`game-session`) trägt zusätzlich `tokens` mit dem für
den Betretenden gefilterten Tokenbestand.

## Requirements

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
  color: '#3366ff', icon: '💀', size: 2, col: 3, row: 4 }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.name` `Goblin`,
  `token.color` `#3366ff`, `token.icon` `💀`, `token.size` `2`, `token.col` `3`,
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
- **WHEN** der Spielleiter `session:token-create` dreimal sendet: einmal mit leerem `name`,
  einmal mit `color` `rot`, einmal mit `size` `5`
- **THEN** ist jedes Acknowledgement `{ ok: false, message }`, und die Anzahl der
  `Token`-Zeilen in der Datenbank ist `0`

### Requirement: Token bewegen

Das System SHALL über `session:token-move` erlauben, ein Token der aktiven Instanz auf eine
andere Zelle zu setzen — dem Spielleiter jedes Token, einem Spieler ausschließlich die
Tokens, deren `ownerId` seine eigene `userId` ist. Der Server SHALL die Payload mit zod
prüfen, pro Aktion `authorizeAction` ohne Rollenanforderung durchlaufen (jede Mitgliedschaft),
das Token mit `id` **und** `instanceId` gleich der aktiven Instanz der Spielsitzung laden —
ein unbekanntes Token, ein Token einer anderen Spielsitzung und ein Token einer eingehängten,
nicht aktiven Instanz SHALL mit identischer Meldung `Token nicht gefunden.` abgelehnt werden
(`constitution.md` §9.2) — und **danach** die Berechtigung gegen die zu diesem Zeitpunkt
gespeicherte Zuweisung prüfen: Rolle `spielleiter` oder `ownerId` gleich der `userId` des
Absenders (`constitution.md` §9.3 — nichts an der Verbindung und keine frühere Bewegung gilt
als Erlaubnis). Ein Absender ohne diese Berechtigung SHALL `{ ok: false, message }` mit der
Meldung `Dieses Token darfst du nicht bewegen.` erhalten; die Zelle MUST NOT sich ändern, und
`session:tokens` MUST NOT gesendet werden. Bei Erfolg SHALL die Zelle gespeichert, dem
Absender mit `{ ok: true, token }` bestätigt und allen im Raum der Tokenbestand gesendet
werden. Der Server MUST NOT Reichweite, Kartenrand oder Hindernisse prüfen.

#### Scenario: Spielleiter bewegt ein Token

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` in Zelle `(3, 4)`, deren Spielleiter und ein Spieler-Mitglied beide den Raum
  betreten haben
- **WHEN** der Spielleiter `session:token-move` mit `{ sessionId, tokenId, col: 7, row: 1 }`
  sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.col` `7` und
  `token.row` `1`, das Token steht in der Datenbank in `(7, 1)`, und Spielleiter und
  Spieler erhalten je ein `session:tokens`, in dem `Goblin` in `(7, 1)` steht

#### Scenario: Spieler bewegt sein eigenes Token

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` in Zelle `(3, 4)`, dessen Besitzer das Spieler-Mitglied `sam` ist, deren
  Spielleiter und `sam` beide den Raum betreten haben
- **WHEN** `sam` `session:token-move` mit `{ sessionId, tokenId, col: 7, row: 1 }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.col` `7`, `token.row` `1`
  und `token.ownerId` gleich der `userId` von `sam`, das Token steht in der Datenbank in
  `(7, 1)`, und Spielleiter und `sam` erhalten je ein `session:tokens`, in dem `Goblin` in
  `(7, 1)` steht

#### Scenario: Spieler darf kein Token bewegen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Besitzer in Zelle `(3, 4)`, deren Spieler-Mitglied `sam` den Raum betreten
  hat
- **WHEN** `sam` `session:token-move` mit `{ sessionId, tokenId, col: 7, row: 1 }` sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }` mit der Meldung
  `Dieses Token darfst du nicht bewegen.`, das Token steht in der Datenbank weiterhin in
  `(3, 4)`, und `sam` erhält kein `session:tokens`

#### Scenario: Spieler darf ein fremdes Token nicht bewegen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Ork` mit Besitzer `tom` in Zelle
  `(5, 5)`, deren Spieler-Mitglied `sam` den Raum betreten hat
- **WHEN** `sam` `session:token-move` für `Ork` nach `(7, 1)` sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }` mit der Meldung
  `Dieses Token darfst du nicht bewegen.`, und `Ork` steht in der Datenbank weiterhin in
  `(5, 5)`

#### Scenario: Entzogene Zuweisung wirkt mit der nächsten Bewegung

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin`, dessen Besitzer das Spieler-Mitglied `sam` ist, deren Spielleiter und `sam` beide
  den Raum betreten haben, und `sam` hat `Goblin` über diese Verbindung bereits erfolgreich
  nach `(7, 1)` bewegt
- **WHEN** der Spielleiter `session:token-assign` mit `ownerId` `null` sendet und `sam`
  danach über dieselbe Verbindung `session:token-move` für `Goblin` nach `(8, 2)` sendet
- **THEN** ist das Acknowledgement von `sam` `{ ok: false, message }` mit der Meldung
  `Dieses Token darfst du nicht bewegen.`, und `Goblin` steht in der Datenbank weiterhin in
  `(7, 1)`

#### Scenario: Unbekanntes, fremdes und nicht aktives Token sind nicht unterscheidbar

- **GIVEN** eine Spielsitzung `A` im Zustand `geoeffnet` mit zwei eingehängten Karten, von
  denen die erste aktiv ist und die zweite ein Token `Verborgen` in `(0, 0)` trägt, deren
  Spielleiter den Raum betreten hat; eine zweite Spielsitzung `B` desselben Spielleiters
  mit aktiver Karte und einem Token `Fremd`; und keine Token-`id` `unbekannt`
- **WHEN** der Spielleiter im Raum von `A` `session:token-move` dreimal sendet: für
  `unbekannt`, für `Fremd` und für `Verborgen`, jeweils nach `(5, 5)`
- **THEN** sind alle drei Acknowledgements `{ ok: false, message }` mit identischer
  `message`, und `Fremd` und `Verborgen` stehen in der Datenbank unverändert in ihrer Zelle

### Requirement: Token entfernen

Das System SHALL dem Spielleiter über `session:token-remove` erlauben, ein Token der
aktiven Instanz zu löschen, mit derselben Ladeprüfung wie beim Bewegen. Bei Erfolg SHALL das
Token gelöscht, dem Absender mit `{ ok: true }` bestätigt und allen im Raum der
Tokenbestand gesendet werden. Ein Absender ohne Rolle `spielleiter` SHALL
`{ ok: false, message }` erhalten; das Token MUST NOT gelöscht werden.

#### Scenario: Spielleiter entfernt ein Token

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und zwei Tokens
  `Goblin` und `Ork`, deren Spielleiter und ein Spieler-Mitglied beide den Raum betreten
  haben
- **WHEN** der Spielleiter `session:token-remove` mit der `id` von `Goblin` sendet
- **THEN** ist das Acknowledgement `{ ok: true }`, in der Datenbank existiert kein `Token`
  mit dieser `id` mehr, und Spielleiter und Spieler erhalten je ein `session:tokens`, dessen
  Liste genau `Ork` enthält

#### Scenario: Spieler darf kein Token entfernen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token,
  deren Spieler-Mitglied den Raum betreten hat
- **WHEN** der Spieler `session:token-remove` mit der `id` des Tokens sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }`, und das Token existiert in der
  Datenbank weiterhin

### Requirement: Tokenbestand beim Betreten und Kartenwechsel

Das Acknowledgement von `session:enter` SHALL das Feld `tokens` mit dem Tokenbestand der
aktiven Instanz tragen — die leere Liste ohne aktive Karte. Nach jedem `session:map`
(Aktivieren, Zurücksetzen, Aushängen der aktiven Instanz — `session-map`) SHALL der Server
allen im Raum `session:tokens` mit dem Bestand der nun aktiven Instanz senden, bei „keine
Karte" die leere Liste. Tokens SHALL an ihrer Instanz gespeichert bleiben, solange die
Instanz eingehängt ist — ein Kartenwechsel weg und zurück zeigt sie wieder; ein Neustart des
Servers verliert sie nicht. Aushängen einer Instanz SHALL ihre Tokens mit löschen.

#### Scenario: Betreten liefert den Tokenbestand

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der zwei Tokens
  liegen, und ein Spieler-Mitglied
- **WHEN** der Spieler `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit genau diesen zwei Tokendarstellungen

#### Scenario: Betreten ohne aktive Karte liefert einen leeren Bestand

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` ohne aktive Karte und ein
  Spieler-Mitglied
- **WHEN** der Spieler `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` als leere Liste

#### Scenario: Kartenwechsel liefert den Bestand der neuen Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit zwei eingehängten Karten `Taverne`
  (aktiv, ein Token `Wirt`) und `Keller` (ein Token `Ratte`, angelegt, als `Keller` aktiv
  war), deren Spielleiter und ein Spieler-Mitglied beide den Raum betreten haben
- **WHEN** der Spielleiter `session:activate-map` auf `Keller` sendet und danach erneut auf
  `Taverne`
- **THEN** erhält der Spieler nach dem ersten Wechsel ein `session:tokens`, dessen Liste
  genau `Ratte` enthält, und nach dem zweiten ein `session:tokens`, dessen Liste genau
  `Wirt` enthält

#### Scenario: Zurücksetzen liefert einen leeren Bestand

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token,
  deren Spielleiter und ein Spieler-Mitglied beide den Raum betreten haben
- **WHEN** der Spielleiter `session:activate-map` mit `instanceId` `null` sendet
- **THEN** erhält der Spieler ein `session:tokens` mit leerer Liste, und das Token existiert
  in der Datenbank weiterhin

#### Scenario: Aushängen löscht die Tokens der Instanz

- **GIVEN** eine Spielsitzung mit einer eingehängten Karte, auf der ein Token liegt
- **WHEN** der Spielleiter `DELETE /api/sessions/:id/maps/:instanceId` für diese Instanz
  sendet
- **THEN** antwortet der Server mit `204`, und die Anzahl der `Token`-Zeilen mit dieser
  `instanceId` in der Datenbank ist `0`

#### Scenario: Tokens überstehen einen Serverneustart

- **GIVEN** eine Spielsitzung mit aktiver Karte und einem Token `Goblin`, angelegt über
  eine erste App-Instanz, die danach beendet wurde
- **WHEN** eine zweite App-Instanz gegen dieselbe Datenbank startet und der Spielleiter
  dort `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit genau `Goblin`

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
Entfernen, Zuweisen, Werte, Markierungen) SHALL in der Raumansicht als Meldung erscheinen —
für jede Rolle, also auch für einen Spieler, dessen Bewegung der Server ablehnt.

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
- **THEN** sendet die Socket-Fassade `moveToken` mit `sessionId`, dieser `id`, `col` `7`
  und `row` `1`

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
- **WHEN** er im Formular `Tokens` den Namen `Goblin`, die Farbe `#3366ff`, das Symbol
  `💀`, die Größe `2`, Spalte `3` und Zeile `4` einträgt und `Anlegen` auslöst
- **THEN** sendet die Socket-Fassade `createToken` mit `sessionId`, `name` `Goblin`,
  `color` `#3366ff`, `icon` `💀`, `size` `2`, `col` `3` und `row` `4`

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
  `Goblin` und `['Segen']`

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

### Requirement: Token zuweisen

Das System SHALL dem Spielleiter über `session:token-assign` erlauben, einem Token der
aktiven Instanz einen Besitzer zu geben (`ownerId` gleich der `userId` eines Mitglieds mit
Rolle `spieler`), den Besitzer zu wechseln oder die Zuweisung zurückzunehmen (`ownerId`
`null`). Der Server SHALL die Payload mit zod prüfen, pro Aktion `authorizeAction` mit Rolle
`spielleiter` durchlaufen und das Token mit derselben Ladeprüfung wie beim Bewegen laden
(`Token nicht gefunden.` für unbekannte, fremde und nicht aktive Tokens). Ein `ownerId`, der
nicht die `userId` eines Mitglieds dieser Spielsitzung mit Rolle `spieler` ist — auch die
`userId` des Spielleiters selbst —, SHALL mit `Spieler nicht gefunden.` abgelehnt werden. Bei
Erfolg SHALL der Besitzer gespeichert, dem Absender mit `{ ok: true, token }` bestätigt und
allen im Raum der Tokenbestand per `session:tokens` gesendet werden. Ein Absender ohne Rolle
`spielleiter` SHALL `{ ok: false, message }` erhalten; der Besitzer MUST NOT sich ändern. Ein
neu angelegtes Token SHALL keinen Besitzer haben (`ownerId` `null`). Die Tokendarstellung
SHALL `ownerId` in jedem Tokenbestand tragen — im Acknowledgement von `session:enter` wie in
`session:tokens` —, für jeden Teilnehmer: wer welches Token führt, ist keine verdeckte
Information.

#### Scenario: Spielleiter weist ein Token zu

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Besitzer, deren Spielleiter und ein Spieler-Mitglied `sam` beide den Raum
  betreten haben
- **WHEN** der Spielleiter `session:token-assign` mit `{ sessionId, tokenId, ownerId }` und
  der `userId` von `sam` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.ownerId` gleich der
  `userId` von `sam`, das Token trägt in der Datenbank diesen `ownerId`, und Spielleiter und
  `sam` erhalten je ein `session:tokens`, in dem `Goblin` diesen `ownerId` trägt

#### Scenario: Spielleiter nimmt eine Zuweisung zurück

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin`, dessen Besitzer das Spieler-Mitglied `sam` ist, deren Spielleiter und `sam` beide
  den Raum betreten haben
- **WHEN** der Spielleiter `session:token-assign` mit `ownerId` `null` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.ownerId` `null`, das Token
  trägt in der Datenbank `ownerId` `null`, und `sam` erhält ein `session:tokens`, in dem
  `Goblin` `ownerId` `null` trägt

#### Scenario: Spielleiter übergibt ein Token an einen anderen Spieler

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin`, dessen Besitzer `sam` ist,
  deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-assign` mit der `userId` von `tom` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.ownerId` gleich der
  `userId` von `tom`, und das Token trägt in der Datenbank diesen `ownerId`

#### Scenario: Nur Spieler-Mitglieder kommen als Besitzer in Frage

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Besitzer, deren Spielleiter den Raum betreten hat, und ein angemeldeter
  Nutzer `fremd`, der nicht Mitglied ist
- **WHEN** der Spielleiter `session:token-assign` zweimal sendet: einmal mit der `userId` von
  `fremd`, einmal mit seiner eigenen `userId`
- **THEN** ist jedes Acknowledgement `{ ok: false, message }` mit der Meldung
  `Spieler nicht gefunden.`, das Token trägt in der Datenbank weiterhin `ownerId` `null`, und
  der Spielleiter erhält kein `session:tokens`

#### Scenario: Spieler darf nicht zuweisen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Besitzer, deren Spieler-Mitglied `sam` den Raum betreten hat
- **WHEN** `sam` `session:token-assign` mit seiner eigenen `userId` sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }`, und das Token trägt in der
  Datenbank weiterhin `ownerId` `null`

#### Scenario: Unbekanntes und nicht aktives Token sind beim Zuweisen nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit zwei eingehängten Karten, von denen
  die erste aktiv ist und die zweite ein Token `Verborgen` ohne Besitzer trägt, deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben, und keine
  Token-`id` `unbekannt`
- **WHEN** der Spielleiter `session:token-assign` zweimal mit der `userId` von `sam` sendet:
  für `unbekannt` und für `Verborgen`
- **THEN** sind beide Acknowledgements `{ ok: false, message }` mit identischer `message`,
  und `Verborgen` trägt in der Datenbank weiterhin `ownerId` `null`

#### Scenario: Neu angelegtes Token gehört dem Spielleiter

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter den
  Raum betreten hat
- **WHEN** der Spielleiter `session:token-create` mit gültigen Feldern sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.ownerId` `null`, und das
  Token trägt in der Datenbank `ownerId` `null`

### Requirement: Tokenwerte setzen

Das System SHALL dem Spielleiter über `session:token-stats` erlauben, an einem Token der
aktiven Instanz die Werte `hp`, `hpMax`, `tempHp`, `ac` und `initiative` zu setzen oder zu
löschen. Die Payload ist ein Teilobjekt: nur gesetzte Felder werden übernommen, ein Feld mit
`null` löscht den Wert, nicht genannte Felder bleiben unverändert. Der Server SHALL die
Payload mit zod prüfen — jedes gesetzte Feld eine ganze Zahl oder `null`; `hpMax` ≥ 1; `hp`,
`tempHp`, `ac` ≥ 0; `initiative` beliebig — und eine ungültige Payload mit
`Ungültige Anfrage.` ablehnen. Pro Aktion SHALL `authorizeAction` mit Rolle `spielleiter`
durchlaufen werden; das Token wird mit derselben Ladeprüfung wie beim Bewegen geladen
(`Token nicht gefunden.` für unbekannte, fremde und nicht aktive Tokens). Nach dem
Zusammenführen mit dem gespeicherten Stand SHALL gelten: `hp` und `hpMax` sind entweder
beide `null` oder beide gesetzt mit `hp` ≤ `hpMax`; andernfalls SHALL der Server mit
`Ungültige Trefferpunkte.` ablehnen und nichts speichern — kein stilles Deckeln, keine
Verrechnung von Schaden oder Heilung. Bei Erfolg SHALL der Server die Werte speichern, dem
Absender mit `{ ok: true, token }` (ungefiltert) bestätigen und jedem im Raum seinen
gefilterten Tokenbestand per `session:tokens` senden. Ein Absender ohne Rolle `spielleiter`
SHALL `{ ok: false, message }` erhalten — auch für ein Token, dessen Besitzer er ist —; die
Werte MUST NOT sich ändern, und `session:tokens` MUST NOT gesendet werden. Ein neu
angelegtes Token SHALL keine Werte haben (alle fünf Felder `null`, `conditions` leer).

#### Scenario: Spielleiter setzt Trefferpunkte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Werte, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-stats` mit `{ sessionId, tokenId, hp: 23,
  hpMax: 40 }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.hp` `23`, `token.hpMax`
  `40` und `token.tempHp`, `token.ac`, `token.initiative` `null`, das Token trägt in der
  Datenbank `hp` `23` und `hpMax` `40`, und der Spielleiter erhält ein `session:tokens`, in
  dem `Goblin` `hp` `23` und `hpMax` `40` trägt

#### Scenario: Teilobjekt lässt nicht genannte Werte stehen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit `hp` `23`, `hpMax` `40`, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-stats` mit `{ sessionId, tokenId, ac: 16,
  initiative: -2 }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.hp` `23`, `token.hpMax`
  `40`, `token.ac` `16` und `token.initiative` `-2`, und das Token trägt in der Datenbank
  genau diese vier Werte

#### Scenario: Werte löschen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit `hp` `23`, `hpMax` `40`, `tempHp` `5`, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-stats` mit `{ sessionId, tokenId, hp: null,
  hpMax: null, tempHp: null }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.hp`, `token.hpMax` und
  `token.tempHp` `null`, und das Token trägt in der Datenbank in diesen drei Spalten `null`

#### Scenario: Trefferpunkte und Maximum nur gemeinsam und in Ordnung

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit `hp` `23`, `hpMax` `40`, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-stats` dreimal sendet: einmal mit `{ hpMax: 10 }`
  (ohne `hp`), einmal mit `{ hp: 41 }`, einmal mit `{ hpMax: null }` (ohne `hp`)
- **THEN** ist jedes Acknowledgement `{ ok: false, message }` mit der Meldung
  `Ungültige Trefferpunkte.`, das Token trägt in der Datenbank weiterhin `hp` `23` und
  `hpMax` `40`, und der Spielleiter erhält kein `session:tokens`

#### Scenario: Ungültige Werte werden abgelehnt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Werte, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-stats` viermal sendet: einmal mit `{ hp: -1,
  hpMax: 10 }`, einmal mit `{ hp: 0, hpMax: 0 }`, einmal mit `{ tempHp: -1 }`, einmal mit
  `{ ac: 1.5 }`
- **THEN** ist jedes Acknowledgement `{ ok: false, message }` mit der Meldung
  `Ungültige Anfrage.`, und das Token trägt in der Datenbank weiterhin in allen fünf
  Wertespalten `null`

#### Scenario: Spieler darf keine Werte setzen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Werte, dessen Besitzer das Spieler-Mitglied `sam` ist, und `sam` hat den
  Raum betreten
- **WHEN** `sam` `session:token-stats` mit `{ sessionId, tokenId, hp: 23, hpMax: 40 }` sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }`, das Token trägt in der Datenbank
  weiterhin `hp` `null` und `hpMax` `null`, und `sam` erhält kein `session:tokens`

#### Scenario: Unbekanntes und nicht aktives Token sind beim Setzen nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit zwei eingehängten Karten, von denen
  die erste aktiv ist und die zweite ein Token `Verborgen` ohne Werte trägt, deren
  Spielleiter den Raum betreten hat, und keine Token-`id` `unbekannt`
- **WHEN** der Spielleiter `session:token-stats` zweimal mit `{ hp: 5, hpMax: 5 }` sendet:
  für `unbekannt` und für `Verborgen`
- **THEN** sind beide Acknowledgements `{ ok: false, message }` mit identischer `message`,
  und `Verborgen` trägt in der Datenbank weiterhin `hp` `null`

#### Scenario: Neu angelegtes Token hat keine Werte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter den
  Raum betreten hat
- **WHEN** der Spielleiter `session:token-create` mit gültigen Feldern sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.hp`, `token.hpMax`,
  `token.tempHp`, `token.ac`, `token.initiative` `null` und `token.conditions` als leerer
  Liste, und das Token trägt in der Datenbank in allen fünf Wertespalten `null`

### Requirement: Markierungen setzen

Das System SHALL dem Spielleiter über `session:token-conditions` erlauben, die
Markierungsliste eines Tokens der aktiven Instanz als Ganzes zu ersetzen. Eine Markierung
ist ein getrimmter Text von 1 bis 20 Zeichen ohne Steuerzeichen; die Liste SHALL höchstens
12 Einträge haben, die untereinander eindeutig sind (exakter Vergleich nach dem Trimmen).
Der Server SHALL die Payload mit zod prüfen und eine ungültige Liste mit
`Ungültige Anfrage.` ablehnen, pro Aktion `authorizeAction` mit Rolle `spielleiter`
durchlaufen und das Token mit derselben Ladeprüfung wie beim Bewegen laden. Bei Erfolg SHALL
die Liste in der gesendeten Reihenfolge gespeichert werden — nicht genannte bisherige
Markierungen SHALL entfernt sein —, dem Absender mit `{ ok: true, token }` bestätigt und
jedem im Raum sein gefilterter Tokenbestand per `session:tokens` gesendet werden. Ein
Absender ohne Rolle `spielleiter` SHALL `{ ok: false, message }` erhalten, auch für ein
Token, dessen Besitzer er ist; die Liste MUST NOT sich ändern. Das Entfernen eines Tokens
SHALL seine Markierungen mit entfernen. Der Server MUST NOT die Markierungen gegen einen
Katalog prüfen — der Katalog ist eine Schnellwahl des Clients.

#### Scenario: Spielleiter setzt Markierungen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Markierungen, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-conditions` mit `{ sessionId, tokenId,
  conditions: ['Liegend', 'Segen'] }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.conditions` genau
  `['Liegend', 'Segen']` in dieser Reihenfolge, die Datenbank trägt für dieses Token genau
  diese zwei Markierungen, und der Spielleiter erhält ein `session:tokens`, in dem `Goblin`
  `conditions` `['Liegend', 'Segen']` trägt

#### Scenario: Ersetzen entfernt nicht genannte Markierungen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit den Markierungen `['Liegend', 'Segen']`, deren Spielleiter den Raum betreten
  hat
- **WHEN** der Spielleiter `session:token-conditions` mit `conditions: ['Segen',
  'Konzentration']` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.conditions` genau
  `['Segen', 'Konzentration']`, und die Datenbank trägt für dieses Token genau diese zwei
  Markierungen und keine `Liegend`

#### Scenario: Ungültige Markierungen werden abgelehnt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit der Markierung `['Liegend']`, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-conditions` viermal sendet: einmal mit einer
  leeren Markierung `['Liegend', '  ']`, einmal mit einer 21 Zeichen langen Markierung,
  einmal mit einem Duplikat `['Liegend', 'Liegend']`, einmal mit 13 verschiedenen
  Markierungen
- **THEN** ist jedes Acknowledgement `{ ok: false, message }` mit der Meldung
  `Ungültige Anfrage.`, die Datenbank trägt für dieses Token weiterhin genau `Liegend`, und
  der Spielleiter erhält kein `session:tokens`

#### Scenario: Spieler darf keine Markierungen setzen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Markierungen, dessen Besitzer das Spieler-Mitglied `sam` ist, und `sam` hat
  den Raum betreten
- **WHEN** `sam` `session:token-conditions` mit `conditions: ['Unsichtbar']` sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }`, und die Datenbank trägt für
  dieses Token keine Markierung

#### Scenario: Entfernen nimmt die Markierungen mit

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit den Markierungen `['Liegend', 'Segen']`, deren Spielleiter den Raum betreten
  hat
- **WHEN** der Spielleiter `session:token-remove` mit der `id` von `Goblin` sendet
- **THEN** ist das Acknowledgement `{ ok: true }`, und die Anzahl der Markierungszeilen mit
  dieser Token-`id` in der Datenbank ist `0`

### Requirement: Sichtbarkeit der Tokenwerte

Der Server SHALL den Tokenbestand pro Empfänger filtern, bevor er ihn sendet
(`constitution.md` §9.2) — im Acknowledgement von `session:enter` wie in jedem
`session:tokens`. Ein Empfänger mit Rolle `spielleiter` SHALL alle Werte aller Tokens
erhalten. Ein Empfänger mit Rolle `spieler` SHALL die Werte genau der Tokens erhalten,
deren `ownerId` seine eigene `userId` ist; bei jedem anderen Token SHALL `hp`, `hpMax`,
`tempHp`, `ac` und `initiative` `null` und `conditions` die leere Liste sein — nicht
unterscheidbar von einem Token ohne Werte. Die Filterung SHALL bei jedem Senden gegen die zu
diesem Zeitpunkt gespeicherte Zuweisung und die zu diesem Zeitpunkt gespeicherte
Mitgliedschaft erfolgen (`constitution.md` §9.3); eine geänderte Zuweisung wirkt mit dem
nächsten Bestand. Die übrigen Felder der Tokendarstellung (`id`, `instanceId`, `name`,
`color`, `icon`, `size`, `col`, `row`, `ownerId`) SHALL für jeden Empfänger ungefiltert sein.

#### Scenario: Spielleiter erhält beim Betreten alle Werte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token `Ork`
  ohne Besitzer mit `hp` `30`, `hpMax` `30`, `ac` `13` und der Markierung `['Liegend']`
- **WHEN** der Spielleiter `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit `Ork`, dessen `hp` `30`, `hpMax` `30`,
  `ac` `13` und `conditions` `['Liegend']` sind

#### Scenario: Besitzer erhält die Werte seines Tokens

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit `hp` `23`, `hpMax` `40`, `tempHp` `5`, `ac` `16`, `initiative` `12` und der
  Markierung `['Segen']`, dessen Besitzer das Spieler-Mitglied `sam` ist
- **WHEN** `sam` `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit `Goblin`, dessen `hp` `23`, `hpMax` `40`,
  `tempHp` `5`, `ac` `16`, `initiative` `12` und `conditions` `['Segen']` sind

#### Scenario: Spieler erhält von fremden Tokens keine Werte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, einem Token `Ork`
  ohne Besitzer mit `hp` `30`, `hpMax` `30`, `tempHp` `3`, `ac` `13`, `initiative` `8` und
  der Markierung `['Liegend']`, und einem Token `Elf` mit Besitzer `tom` und `hp` `12`,
  `hpMax` `12`, deren Spieler-Mitglied `sam` den Raum betritt
- **WHEN** `sam` `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit `Ork` und `Elf`, bei denen jeweils `hp`,
  `hpMax`, `tempHp`, `ac` und `initiative` `null` und `conditions` die leere Liste sind,
  während `id`, `name`, `color`, `icon`, `size`, `col`, `row` und `ownerId` unverändert
  sind

#### Scenario: Derselbe Bestand erreicht Spielleiter und Spieler unterschiedlich

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token `Ork`
  ohne Besitzer und ohne Werte, deren Spielleiter und ein Spieler-Mitglied `sam` beide den
  Raum betreten haben
- **WHEN** der Spielleiter `session:token-stats` mit `{ hp: 30, hpMax: 30 }` und danach
  `session:token-conditions` mit `['Liegend']` für `Ork` sendet
- **THEN** erhält der Spielleiter zwei `session:tokens`, im zweiten trägt `Ork` `hp` `30`,
  `hpMax` `30` und `conditions` `['Liegend']`; `sam` erhält ebenfalls zwei `session:tokens`,
  in beiden trägt `Ork` `hp` `null`, `hpMax` `null` und `conditions` als leere Liste

#### Scenario: Zuweisung macht die Werte für den Besitzer sichtbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` ohne Besitzer mit `hp` `23`, `hpMax` `40` und der Markierung `['Segen']`, deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-assign` mit der `userId` von `sam` sendet
- **THEN** erhält `sam` ein `session:tokens`, in dem `Goblin` `ownerId` gleich seiner
  `userId`, `hp` `23`, `hpMax` `40` und `conditions` `['Segen']` trägt

#### Scenario: Entzogene Zuweisung verbirgt die Werte mit dem nächsten Bestand

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit `hp` `23`, `hpMax` `40` und der Markierung `['Segen']`, dessen Besitzer das
  Spieler-Mitglied `sam` ist, deren Spielleiter und `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-assign` mit `ownerId` `null` sendet
- **THEN** erhält `sam` ein `session:tokens`, in dem `Goblin` `ownerId` `null`, `hp` `null`,
  `hpMax` `null` und `conditions` als leere Liste trägt, und der Spielleiter erhält ein
  `session:tokens`, in dem `Goblin` weiterhin `hp` `23`, `hpMax` `40` und `conditions`
  `['Segen']` trägt
