# session-token Specification

## Purpose

Figuren auf der aktiven Karte: der Spielleiter legt Tokens an, verschiebt und entfernt sie und
weist sie Spielern zu; ein Spieler verschiebt ausschließlich die ihm zugewiesenen Tokens;
alle Teilnehmer im Raum sehen denselben Bestand in Echtzeit. Legt fest, dass jede Aktion
serverseitig gegen die aktuelle Zuweisung geprüft wird, dass Tokens an
der Karteninstanz hängen und damit Kartenwechsel und Neustart überleben, und dass der
Bestand beim Betreten und bei jedem Kartenwechsel mitkommt. Wer welche Werte eines Tokens
sieht, entscheiden Besitzer und Spielleiter je Token, Stat und Spieler (Zielgruppen);
gefiltert wird pro Empfänger auf dem Server, bevor gesendet wird. Ein besitzerloses Token in
vollständig verdeckten Zellen (`session-fog`) existiert für einen Spieler nicht — es verlässt
den Server für ihn in keiner Form.

## Begriffe

- **Token**: eine Figur auf einer Karteninstanz (Modell `Token`): Instanz, Name, Farbe,
  Symbol, Größe, Zelle. Ein Token gehört genau einer Instanz (`session-map`, „Karteninstanz").
- **Name**: getrimmter Text, 1 bis 40 Zeichen, keine Steuerzeichen; frei vergeben durch den
  Spielleiter, nicht eindeutig.
- **Farbe**: Hex-Farbwert `#rrggbb` (6 Hex-Ziffern, Groß-/Kleinschreibung egal).
- **Symbol**: ein Eintrag des festen Symbolkatalogs `TOKEN_ICONS` — die zehn Symbolnamen
  der Icon-Registry (`ui-icons`, „Symbolkatalog": `fighter`, `guardian`, `undead`, `dragon`,
  `mage`, `archer`, `royal`, `beast`, `vermin`, `fire`) — oder `null` (kein Symbol — der
  Client zeigt dann die Initiale des Namens). Gespeichert wird der Name; frühere
  Emoji-Werte wurden per Datenmigration auf die Namen umgeschrieben.
- **Größe**: ganze Zahl 1 bis 4, Kantenlänge in Zellen (1 = eine Zelle, 4 = 4×4 Zellen).
- **Zelle**: `{ col, row }` als ganze Zahlen im Raster der Karte (`map-library`,
  „Rastergeometrie"); die Ankerzelle des Tokens. Negative Werte und Zellen außerhalb des
  Bilds sind zulässig — der Server prüft keinen Kartenrand.
- **Aktive Instanz**: die aktive Karte der Spielsitzung (`session-map`, „Aktive Karte").
  Tokens werden ausschließlich auf der aktiven Instanz angelegt, bewegt und entfernt.
- **Tokendarstellung**: `{ id, instanceId, name, color, icon, size, col, row, ownerId, hp,
  hpMax, tempHp, ac, initiative, conditions, shares }` — `icon` ist ein Katalogeintrag oder `null`;
  `ownerId` ist die `userId` des Besitzers oder `null` („gehört dem Spielleiter“, Requirement
  „Token zuweisen“); `hp`, `hpMax`, `tempHp`, `ac`, `initiative` sind ganze Zahlen oder
  `null` („nicht gesetzt" **oder** „für diesen Empfänger verborgen", ununterscheidbar);
  `conditions` ist die Markierungsliste in gespeicherter Reihenfolge, für einen Empfänger
  ohne Sicht die leere Liste (Requirement „Sichtbarkeit der Tokenwerte"); `shares` sind die
  Freigaben des Tokens für einen Empfänger mit Rolle `spielleiter` und für den Besitzer, für
  jeden anderen Empfänger `null` (wer sonst noch sieht, ist keine Information für Dritte,
  `constitution.md` §9.2).
- **Werte**: die fünf Zahlenfelder `hp`/`hpMax` (Trefferpunkte aktuell und Maximum, ein
  Stat), `tempHp` (temporäre Trefferpunkte), `ac` (Rüstungsklasse), `initiative` und die
  Markierungsliste `conditions` zusammen. Ein neu angelegtes Token hat keine Werte.
- **Markierung**: getrimmter Text, 1 bis 20 Zeichen, keine Steuerzeichen; je Token
  eindeutig, höchstens 12 je Token; frei vergeben durch den Spielleiter. Der 5e-Katalog ist
  eine Schnellwahl des Clients, kein Serververtrag.
- **Stat**: einer der fünf teilbaren Werte eines Tokens, auf der Leitung `hp` (Trefferpunkte
  aktuell **und** Maximum zusammen — `hp` und `hpMax` sind ein Stat), `tempHp`, `ac`,
  `initiative` oder `conditions` (die ganze Markierungsliste, nicht je Markierung).
- **Zielgruppe**: wer einen Stat eines Tokens zusätzlich zu Spielleiter und Besitzer sieht —
  `keine` (niemand), `alle` (jedes Mitglied) oder eine nicht-leere Liste eindeutiger
  `userId`s von Mitgliedern mit Rolle `spieler`. Je (Token, Stat) genau eine Zielgruppe;
  Ausgangszustand `keine`. Der Besitzer sieht sein Token immer vollständig — das ist eine
  Regel, kein Eintrag; der Spielleiter ebenso.
- **Freigaben**: die fünf Zielgruppen eines Tokens als Objekt `{ hp, tempHp, ac, initiative,
  conditions }`, jeder Wert `'keine'`, `'alle'` oder eine Liste von `userId`s.
- **Tokenbestand**: alle Tokens der aktiven Instanz als Liste von Tokendarstellungen,
  aufsteigend nach Anlegezeitpunkt; ohne aktive Karte die leere Liste. Er erreicht jeden
  Teilnehmer im Raum **je Verbindung gefiltert** (`constitution.md` §9.2): der Spielleiter
  erhält alle Tokens mit allen Werten; ein Spieler erhält nur die für ihn sichtbaren Tokens
  (Requirement „Sichtbarkeit von Tokens im Fog") und auf diesen die Werte seiner eigenen
  Tokens und die Stats, deren Zielgruppe `alle` ist oder ihn nennt, sonst `null` und `[]`.
  Ein nicht sichtbares Token verlässt den Server für diesen Empfänger in keiner Form. Tokens
  nicht aktiver Instanzen verlassen den Server nicht.
- **Zellen eines Tokens**: die Zellen, die ein Token abdeckt — bei Raster `quadrat` die
  `size × size` Zellen ab der Ankerzelle (`col` bis `col + size − 1`, `row` bis
  `row + size − 1`), bei Raster `hex-spitz` und `hex-flach` ausschließlich die Ankerzelle
  (dieselbe Geometrie, mit der die Kartenansicht das Token zeichnet).
- **Sichtbares Token**: ein Token ist für einen Empfänger sichtbar, wenn der Empfänger die
  Rolle `spielleiter` hat, wenn `ownerId` nicht `null` ist (das eigene Token wie das eines
  Mitspielers) oder wenn mindestens eine der Zellen des Tokens zu den aufgedeckten Zellen der
  aktiven Instanz gehört (`session-fog`, „Aufgedeckte Zellen"). Verborgen werden damit
  ausschließlich besitzerlose Tokens in vollständig verdeckten Zellen.
- **Konvention für Szenarien**: Wo ein Szenario dieser Spec eine aktive Karte voraussetzt,
  ohne den Fog-Zustand zu nennen, gilt die Karte als vollständig aufgedeckt. Verdeckte
  Zellen setzen nur die Szenarien der Requirement „Sichtbarkeit von Tokens im Fog" sowie
  „Verborgenes Token ist beim Bewegen nicht unterscheidbar" und „Verborgenes Token ist beim
  Teilen nicht unterscheidbar" voraus.

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
`{ ok: true, token }` oder `{ ok: false, message }`; `session:token-share`
`{ sessionId, tokenId, stat, audience }` mit `stat` als einem der fünf Stat-Namen und
`audience` als `'keine'`, `'alle'` oder einer nicht-leeren Liste eindeutiger `userId`s →
`{ ok: true, token }` oder `{ ok: false, message }` — der Server ersetzt die Zielgruppe dieses
Stats als Ganzes. Die Tokendarstellung im Acknowledgement einer Spielleiter-Aktion ist
ungefiltert; die im Acknowledgement von `session:token-share` und `session:token-move` ist
für den Absender gefiltert (für Spielleiter und Besitzer ohne Wirkung).
Server → Client: `session:tokens` `{ sessionId, tokens }` mit dem für diesen Empfänger
gefilterten Tokenbestand — je Verbindung gesendet, nicht als ein Paket an den Raum. Das
Acknowledgement von `session:enter` (`game-session`) trägt zusätzlich `tokens` mit dem für
den Betretenden gefilterten Tokenbestand. Nach jeder erfolgreichen `session:fog-set`-Aktion
(`session-fog`) folgt für jede Verbindung im Raum auf `session:fog` ein `session:tokens` mit
dem für sie gefilterten Tokenbestand.

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
(`constitution.md` §9.2); ein Token, das für den Absender nach Requirement „Sichtbarkeit
von Tokens im Fog" nicht sichtbar ist, SHALL ebenso mit `Token nicht gefunden.` abgelehnt
werden — geprüft nach dem Laden und vor der Berechtigung, damit ein Spieler aus der Meldung
nicht schließen kann, ob das Token noch auf der aktiven Karte steht — und **danach** die Berechtigung gegen die zu diesem Zeitpunkt
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

#### Scenario: Verborgenes Token ist beim Bewegen nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen und einem Token `Ork` ohne Besitzer in `(3, 4)`, deren Spieler-Mitglied `sam` den
  Raum betreten hat, und keine Token-`id` `unbekannt`
- **WHEN** `sam` `session:token-move` zweimal sendet: für `Ork` nach `(7, 1)` und für
  `unbekannt` nach `(7, 1)`
- **THEN** sind beide Acknowledgements `{ ok: false, message }` mit identischer `message`,
  `Ork` steht in der Datenbank weiterhin in `(3, 4)`, und `sam` erhält kein
  `session:tokens`

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
gesetztem Wert ein Paar aus `dt` (Beschriftung) und `dd` (Wert, Klasse `token-card__value`) — `HP` mit `<hp>/<hpMax>`
(nur wenn `hp` und `hpMax` nicht `null`), `Temp-HP` mit `<tempHp>`, `RK` mit `<ac>`,
`Initiative` mit `<initiative>` (jeweils nur, wenn der Wert nicht `null` ist) — und die
Markierungen als Chips (`div` der Klasse `token-card__conditions` mit je einem `span` der
Klasse `chip` aus dem dekorativen Katalog-Icon der Markierung, sonst ohne Icon, und dem Label
als Text) in gespeicherter Reihenfolge, nie Bedeutung allein über Farbe. Der Spielleiter sieht
die Karten in der Token-Verwaltung; ein Spieler sieht dafür eine Kartenliste mit der
Überschrift `Tokenwerte` — ohne Tokens statt der Liste den Leerzustand (`ui-status`) mit dem
Titel `Noch keine Tokens` und dem Hinweis `Die Spielleitung weist dir ein Token zu.`. Spieler MUST NOT die Verwaltung sehen — weder die Schaltfläche
`Token anlegen`, das Anlege-Modal, die Wertefelder, Schaden/Heilung noch die
Markierungsbedienung; die Einträge `Bearbeiten`, `Zuweisen…` und `Entfernen` seines
Token-Menüs sind gesperrt. Ein abgelehntes Acknowledgement einer Token-Aktion (Anlegen,
Bewegen, Entfernen, Zuweisen, Werte, Markierungen, Teilen) SHALL in der Raumansicht als
Meldung erscheinen — für jede Rolle, also auch für einen Spieler, dessen Bewegung oder
Freigabe der Server ablehnt.

**Puls bei Anstieg (Spieler).** In der Spieler-Liste `Tokenwerte` SHALL die Wertanzeige
(`dd`) eines sichtbaren Zahlenwerts (`HP` aus `hp`, `Temp-HP`, `RK`, `Initiative`)
zusätzlich die Klasse `token-card__value--pulse` tragen, sobald ein `session:tokens`-Update
diesen Zahlenwert über den Wert im zuvor empfangenen Bestand hebt — für `HP` zählt `hp`,
nicht das Verhältnis. Sinkt der Wert, bleibt er gleich oder erscheint er erstmals (kein
früherer Bestand mit diesem Wert), SHALL die Anzeige die Klasse NICHT tragen. Der Puls ist
einmalig: nach dem Ende der Animation (`animationend`) SHALL die Klasse wieder entfernt
werden. Die Animation ist bewegungsabhängig (`@media (prefers-reduced-motion: no-preference)`
in `theme.css`). Die Karten der Token-Verwaltung des Spielleiters SHALL die Klasse
`token-card__value--pulse` NICHT tragen.

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
  `Die Spielleitung weist dir ein Token zu.`, und kein
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

#### Scenario: Steigender HP-Wert pulsiert in der Spieler-Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `hp` `10`, `hpMax` `40`; die Raumansicht ist gerendert
- **WHEN** ein `session:tokens`-Update denselben `Goblin` mit `hp` `18`, `hpMax` `40` liefert
- **THEN** trägt die Wertanzeige (`dd`) des Paars `HP` unter `Tokenwerte` die Klasse
  `token-card__value--pulse`

#### Scenario: Steigender Temp-HP-Wert pulsiert in der Spieler-Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `tempHp` `2`; die Raumansicht ist gerendert
- **WHEN** ein `session:tokens`-Update denselben `Goblin` mit `tempHp` `6` liefert
- **THEN** trägt die Wertanzeige (`dd`) des Paars `Temp-HP` unter `Tokenwerte` die Klasse
  `token-card__value--pulse`

#### Scenario: Steigende RK pulsiert in der Spieler-Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `ac` `14`; die Raumansicht ist gerendert
- **WHEN** ein `session:tokens`-Update denselben `Goblin` mit `ac` `17` liefert
- **THEN** trägt die Wertanzeige (`dd`) des Paars `RK` unter `Tokenwerte` die Klasse
  `token-card__value--pulse`

#### Scenario: Steigende Initiative pulsiert in der Spieler-Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U` und `initiative` `8`; die Raumansicht ist gerendert
- **WHEN** ein `session:tokens`-Update denselben `Goblin` mit `initiative` `12` liefert
- **THEN** trägt die Wertanzeige (`dd`) des Paars `Initiative` unter `Tokenwerte` die Klasse
  `token-card__value--pulse`

#### Scenario: Sinkender HP-Wert pulsiert nicht in der Spieler-Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte und einem Token `Goblin`
  mit `ownerId` `U`, `hp` `18`, `hpMax` `40`; die Raumansicht ist gerendert
- **WHEN** ein `session:tokens`-Update denselben `Goblin` mit `hp` `10`, `hpMax` `40` liefert
- **THEN** trägt die Wertanzeige (`dd`) des Paars `HP` unter `Tokenwerte` die Klasse
  `token-card__value--pulse` NICHT

#### Scenario: Erstmals gezeigter Wert pulsiert nicht in der Spieler-Liste

- **GIVEN** ein Spieler mit `userId` `U` im Raum mit aktiver Karte, und das Enter-Acknowledgement
  nennt bereits ein Token `Goblin` mit `ownerId` `U`, `hp` `18`, `hpMax` `40` (kein früherer Bestand)
- **WHEN** die Raumansicht gerendert ist
- **THEN** trägt die Wertanzeige (`dd`) des Paars `HP` unter `Tokenwerte` die Klasse
  `token-card__value--pulse` NICHT

#### Scenario: Puls endet mit der Animation

- **GIVEN** ein Spieler-Token `Goblin` (`ownerId` `U`), dessen `hp` per `session:tokens`-Update
  von `10` auf `18` gestiegen ist und dessen `HP`-Wertanzeige die Klasse `token-card__value--pulse` trägt
- **WHEN** die Animation dieser Wertanzeige endet (`animationend`)
- **THEN** trägt die Wertanzeige die Klasse `token-card__value--pulse` nicht mehr

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
`session:tokens` und in jedem Acknowledgement mit Tokendarstellung. Ein Stat eines Tokens
SHALL für einen Empfänger sichtbar sein, wenn der Empfänger die Rolle `spielleiter` hat,
wenn `ownerId` seine eigene `userId` ist, wenn die Zielgruppe dieses Stats `alle` ist oder
wenn die Zielgruppe eine Liste ist, die seine `userId` enthält — sonst nicht. Die Sichtbarkeit
gilt je Stat: `hp` und `hpMax` gemeinsam über die Zielgruppe `hp`; `tempHp`, `ac` und
`initiative` je für sich; `conditions` als ganze Liste über die Zielgruppe `conditions`. Ein
nicht sichtbarer Zahlenwert SHALL `null` sein, eine nicht sichtbare Markierungsliste die
leere Liste — nicht unterscheidbar von einem Token ohne Werte. `shares` SHALL für einen
Empfänger mit Rolle `spielleiter` und für den Besitzer die Freigaben des Tokens tragen, für
jeden anderen Empfänger `null`. Die Filterung SHALL bei jedem Senden gegen die zu diesem
Zeitpunkt gespeicherte Zuweisung, die zu diesem Zeitpunkt gespeicherten Zielgruppen und die
zu diesem Zeitpunkt gespeicherte Mitgliedschaft erfolgen (`constitution.md` §9.3); eine
geänderte Zuweisung oder Zielgruppe wirkt mit dem nächsten Bestand. Die übrigen Felder der
Tokendarstellung (`id`, `instanceId`, `name`, `color`, `icon`, `size`, `col`, `row`,
`ownerId`) SHALL für jeden Empfänger ungefiltert sein.

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
  `hpMax`, `tempHp`, `ac` und `initiative` `null`, `conditions` die leere Liste und `shares`
  `null` sind, während `id`, `name`, `color`, `icon`, `size`, `col`, `row` und `ownerId`
  unverändert sind

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

#### Scenario: Geteilte Werte erreichen den Empfänger beim Betreten

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Ork` ohne Besitzer mit `hp` `30`,
  `hpMax` `30`, `tempHp` `3`, `ac` `13`, `initiative` `8` und der Markierung `['Liegend']`,
  dessen Zielgruppen `hp` `alle`, `ac` die Liste mit `sam`, `initiative` die Liste mit `tom`,
  `conditions` `alle` und `tempHp` `keine` sind
- **WHEN** `sam` `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit `Ork`, dessen `hp` `30`, `hpMax` `30`,
  `ac` `13`, `conditions` `['Liegend']`, `tempHp` `null`, `initiative` `null` und `shares`
  `null` sind

#### Scenario: Freigaben sehen nur Spielleiter und Besitzer

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin` mit Besitzer `sam`, `hp` `23`,
  `hpMax` `40` und der Zielgruppe für `hp` gleich der Liste mit `tom`
- **WHEN** der Spielleiter, `sam` und `tom` je `session:enter` senden
- **THEN** trägt `Goblin` im Acknowledgement des Spielleiters und in dem von `sam` jeweils
  `shares.hp` gleich der Liste mit genau der `userId` von `tom` und `shares.ac` `'keine'`,
  und im Acknowledgement von `tom` `hp` `23`, `hpMax` `40` und `shares` `null`

#### Scenario: Änderung eines geteilten Werts erreicht die Zielgruppe sofort

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token `Ork`
  ohne Besitzer mit `hp` `30`, `hpMax` `30` und der Zielgruppe für `hp` `alle`, deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-stats` mit `{ hp: 12 }` für `Ork` sendet
- **THEN** erhält `sam` ein `session:tokens`, in dem `Ork` `hp` `12` und `hpMax` `30` trägt

### Requirement: Zielgruppe eines Tokenwerts setzen

Das System SHALL über `session:token-share` erlauben, die Zielgruppe eines Stats an einem
Token der aktiven Instanz als Ganzes zu ersetzen — dem Spielleiter für jedes Token, einem
Spieler ausschließlich für die Tokens, deren `ownerId` seine eigene `userId` ist (ein Token
ohne Besitzer teilt nur der Spielleiter). Der Server SHALL die Payload mit zod prüfen —
`stat` einer der fünf Stat-Namen (`hpMax` ist keiner), `audience` `'keine'`, `'alle'` oder
eine nicht-leere Liste eindeutiger Zeichenketten — und eine ungültige Payload mit
`Ungültige Anfrage.` ablehnen. Pro Aktion SHALL `authorizeAction` ohne Rollenanforderung
durchlaufen werden (jede Mitgliedschaft); das Token wird mit derselben Ladeprüfung wie beim
Bewegen geladen (`Token nicht gefunden.` für unbekannte, fremde und nicht aktive Tokens sowie für ein
Token, das der Absender nach Requirement „Sichtbarkeit von Tokens im Fog" nicht sehen darf —
geprüft vor der Berechtigung, `constitution.md` §9.2).
**Danach** SHALL die Berechtigung gegen die zu diesem Zeitpunkt gespeicherte Zuweisung
geprüft werden: Rolle `spielleiter` oder `ownerId` gleich der `userId` des Absenders
(`constitution.md` §9.3). Ein Absender ohne diese Berechtigung SHALL `{ ok: false, message }`
mit der Meldung `Dieses Token darfst du nicht teilen.` erhalten; die Zielgruppe MUST NOT sich
ändern, und `session:tokens` MUST NOT gesendet werden. Ist `audience` eine Liste, SHALL jede
`userId` darin die eines Mitglieds dieser Spielsitzung mit Rolle `spieler` sein — sonst,
auch bei der `userId` des Spielleiters selbst oder einer einzigen ungültigen `userId` in
einer sonst gültigen Liste, SHALL der Server mit `Spieler nicht gefunden.` ablehnen und
nichts speichern. Bei Erfolg SHALL die bisherige Zielgruppe dieses Stats vollständig durch
die gesendete ersetzt (in einer Transaktion), dem Absender mit `{ ok: true, token }`
bestätigt und jedem im Raum sein gefilterter Tokenbestand per `session:tokens` gesendet
werden. Es gibt keine Sperre: Spielleiter und Besitzer schreiben dieselbe Zielgruppe, der
letzte Schreiber gewinnt. Zuweisen, Wechseln und Zurücknehmen eines Besitzers
(`session:token-assign`) MUST NOT die Zielgruppen ändern. Das Entfernen eines Tokens SHALL
seine Zielgruppen mit entfernen. Ein neu angelegtes Token SHALL für jeden Stat die Zielgruppe
`keine` haben.

#### Scenario: Spielleiter teilt Trefferpunkte mit allen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token `Ork`
  ohne Besitzer mit `hp` `30`, `hpMax` `30`, `ac` `13`, deren Spielleiter und ein
  Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-share` mit `{ sessionId, tokenId, stat: 'hp',
  audience: 'alle' }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.shares.hp` `'alle'` und
  `token.shares.ac` `'keine'`, in der Datenbank ist für `Ork` und `hp` die Zielgruppe `alle`
  gespeichert, `sam` erhält ein `session:tokens`, in dem `Ork` `hp` `30`, `hpMax` `30`, `ac`
  `null` und `shares` `null` trägt, und der Spielleiter erhält ein `session:tokens`, in dem
  `Ork` `shares.hp` `'alle'` trägt

#### Scenario: Besitzer teilt einen Wert mit einem Mitspieler

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin` mit Besitzer `sam`, `hp` `23`,
  `hpMax` `40`, `ac` `16`, deren Spielleiter, `sam` und `tom` alle drei den Raum betreten
  haben
- **WHEN** `sam` `session:token-share` mit `{ sessionId, tokenId, stat: 'ac', audience:
  [<userId von tom>] }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.shares.ac` gleich der
  Liste mit genau der `userId` von `tom`, in der Datenbank ist für `Goblin` und `ac` genau
  `tom` als Empfänger gespeichert, `tom` erhält ein `session:tokens`, in dem `Goblin` `ac`
  `16`, `hp` `null`, `hpMax` `null` und `shares` `null` trägt, und `sam` erhält ein
  `session:tokens`, in dem `Goblin` `shares.ac` gleich der Liste mit genau der `userId` von
  `tom` trägt

#### Scenario: Zielgruppe wird als Ganzes ersetzt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin` mit Besitzer `sam`, dessen
  Zielgruppe für `hp` `alle` ist, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-share` mit `{ stat: 'hp', audience: [<userId von
  tom>] }` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.shares.hp` gleich der
  Liste mit genau der `userId` von `tom`, und in der Datenbank ist für `Goblin` und `hp` genau
  `tom` als Empfänger gespeichert und kein Eintrag `alle` mehr

#### Scenario: keine leert die Zielgruppe

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin` mit Besitzer `sam`, `hp` `23`,
  `hpMax` `40` und der Zielgruppe für `hp` gleich der Liste mit `tom`, deren Spielleiter und
  `tom` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-share` mit `{ stat: 'hp', audience: 'keine' }`
  sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.shares.hp` `'keine'`, in
  der Datenbank ist für `Goblin` und `hp` keine Zielgruppe mehr gespeichert, und `tom` erhält
  ein `session:tokens`, in dem `Goblin` `hp` `null` und `hpMax` `null` trägt

#### Scenario: Letzter Schreiber gewinnt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` mit Besitzer `sam` und `ac` `16`, deren Spielleiter und `sam` beide den Raum
  betreten haben
- **WHEN** der Spielleiter `session:token-share` mit `{ stat: 'ac', audience: 'alle' }`
  sendet und danach `sam` `session:token-share` mit `{ stat: 'ac', audience: 'keine' }`
- **THEN** sind beide Acknowledgements `{ ok: true, token }`, das zweite mit
  `token.shares.ac` `'keine'`, in der Datenbank ist für `Goblin` und `ac` keine Zielgruppe
  gespeichert, und das zweite `session:tokens`, das `sam` erhält, trägt für `Goblin`
  `shares.ac` `'keine'`

#### Scenario: Spieler darf ein fremdes Token nicht teilen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin` mit Besitzer `tom` und `hp`
  `23`, `hpMax` `40`, deren Spieler-Mitglied `sam` den Raum betreten hat
- **WHEN** `sam` `session:token-share` mit `{ stat: 'hp', audience: 'alle' }` für `Goblin`
  sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }` mit der Meldung
  `Dieses Token darfst du nicht teilen.`, in der Datenbank ist für `Goblin` keine Zielgruppe
  gespeichert, und `sam` erhält kein `session:tokens`

#### Scenario: Spieler darf ein Token ohne Besitzer nicht teilen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token `Ork`
  ohne Besitzer mit `hp` `30`, `hpMax` `30`, deren Spieler-Mitglied `sam` den Raum betreten
  hat
- **WHEN** `sam` `session:token-share` mit `{ stat: 'hp', audience: [<eigene userId>] }` für
  `Ork` sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }` mit der Meldung
  `Dieses Token darfst du nicht teilen.`, und in der Datenbank ist für `Ork` keine Zielgruppe
  gespeichert

#### Scenario: Nur Spieler-Mitglieder kommen als Empfänger in Frage

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, einem
  Spieler-Mitglied `sam` und einem Token `Ork` ohne Besitzer, deren Spielleiter den Raum
  betreten hat, und ein angemeldeter Nutzer `fremd`, der nicht Mitglied ist
- **WHEN** der Spielleiter `session:token-share` mit `stat` `'hp'` dreimal sendet: einmal mit
  `audience` gleich der Liste mit der `userId` von `fremd`, einmal mit der Liste mit seiner
  eigenen `userId`, einmal mit der Liste aus der `userId` von `sam` und der von `fremd`
- **THEN** ist jedes Acknowledgement `{ ok: false, message }` mit der Meldung
  `Spieler nicht gefunden.`, in der Datenbank ist für `Ork` keine Zielgruppe gespeichert, und
  der Spielleiter erhält kein `session:tokens`

#### Scenario: Ungültige Payload wird abgelehnt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, einem
  Spieler-Mitglied `sam` und einem Token `Ork` ohne Besitzer, deren Spielleiter den Raum
  betreten hat
- **WHEN** der Spielleiter `session:token-share` viermal sendet: einmal mit `stat` `'hpMax'`
  und `audience` `'alle'`, einmal mit `stat` `'hp'` und `audience` als leerer Liste, einmal
  mit `stat` `'hp'` und `audience` `'jeder'`, einmal mit `stat` `'hp'` und `audience` als
  Liste, in der die `userId` von `sam` zweimal steht
- **THEN** ist jedes Acknowledgement `{ ok: false, message }` mit der Meldung
  `Ungültige Anfrage.`, und in der Datenbank ist für `Ork` keine Zielgruppe gespeichert

#### Scenario: Unbekanntes und nicht aktives Token sind beim Teilen nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit zwei eingehängten Karten, von denen
  die erste aktiv ist und die zweite ein Token `Verborgen` ohne Besitzer trägt, deren
  Spielleiter den Raum betreten hat, und keine Token-`id` `unbekannt`
- **WHEN** der Spielleiter `session:token-share` zweimal mit `{ stat: 'hp', audience: 'alle'
  }` sendet: für `unbekannt` und für `Verborgen`
- **THEN** sind beide Acknowledgements `{ ok: false, message }` mit identischer `message`,
  und in der Datenbank ist für `Verborgen` keine Zielgruppe gespeichert

#### Scenario: Zuweisung lässt die Zielgruppen stehen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, zwei
  Spieler-Mitgliedern `sam` und `tom` und einem Token `Goblin` mit Besitzer `sam`, dessen
  Zielgruppe für `ac` die Liste mit `tom` ist, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-assign` mit `ownerId` `null` sendet und danach
  `session:token-assign` mit der `userId` von `tom`
- **THEN** sind beide Acknowledgements `{ ok: true, token }` mit `token.shares.ac` gleich der
  Liste mit genau der `userId` von `tom`, und in der Datenbank ist für `Goblin` und `ac`
  weiterhin genau `tom` als Empfänger gespeichert

#### Scenario: Entfernen nimmt die Zielgruppen mit

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, einem
  Spieler-Mitglied `tom` und einem Token `Goblin` ohne Besitzer, dessen Zielgruppe für `hp`
  `alle` und für `ac` die Liste mit `tom` ist, deren Spielleiter den Raum betreten hat
- **WHEN** der Spielleiter `session:token-remove` mit der `id` von `Goblin` sendet
- **THEN** ist das Acknowledgement `{ ok: true }`, und die Anzahl der Zielgruppen-Zeilen mit
  dieser Token-`id` in der Datenbank ist `0`

#### Scenario: Neu angelegtes Token teilt nichts

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter den
  Raum betreten hat
- **WHEN** der Spielleiter `session:token-create` mit gültigen Feldern sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.shares` gleich
  `{ hp: 'keine', tempHp: 'keine', ac: 'keine', initiative: 'keine', conditions: 'keine' }`,
  und die Anzahl der Zielgruppen-Zeilen mit dieser Token-`id` in der Datenbank ist `0`

#### Scenario: Verborgenes Token ist beim Teilen nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen und einem Token `Ork` ohne Besitzer in `(3, 4)`, deren Spieler-Mitglied `sam` den
  Raum betreten hat, und keine Token-`id` `unbekannt`
- **WHEN** `sam` `session:token-share` zweimal sendet: für `Ork` mit `stat` `hp` und
  `audience` `'alle'` und dasselbe für `unbekannt`
- **THEN** sind beide Acknowledgements `{ ok: false, message }` mit identischer `message`,
  die Anzahl der Zielgruppen-Zeilen von `Ork` in der Datenbank ist `0`, und `sam` erhält
  kein `session:tokens`

### Requirement: Sichtbarkeit von Tokens im Fog

Der Server SHALL den Tokenbestand pro Empfänger auch nach Existenz filtern, bevor er ihn
sendet — im Acknowledgement von `session:enter` wie in jedem `session:tokens`
(`constitution.md` §9.2). Ein Token SHALL für einen Empfänger enthalten sein, wenn es nach
„Begriffe" für ihn sichtbar ist: Rolle `spielleiter`, oder `ownerId` nicht `null`, oder
mindestens eine der Zellen des Tokens ist aufgedeckt — sonst MUST NOT es in irgendeiner Form
den Empfänger erreichen: weder Position noch Name, Werte, Markierungen oder Freigaben, auch
dann nicht, wenn eine Zielgruppe eines Stats `alle` ist oder den Empfänger nennt. Die
sichtbaren Tokens SHALL in Anlegereihenfolge bleiben und danach der Wertefilterung nach
„Sichtbarkeit der Tokenwerte" unterliegen. Die Regel SHALL bei jedem Senden gegen die zu
diesem Zeitpunkt gespeicherten aufgedeckten Zellen und die zu diesem Zeitpunkt gespeicherte
Zuweisung ausgewertet werden (`constitution.md` §9.3) — ein Token erscheint beim Spieler,
sobald eine seiner Zellen aufgedeckt wird oder es in eine aufgedeckte Zelle zieht, und
verschwindet, sobald keine seiner Zellen mehr aufgedeckt ist. Nach jeder erfolgreichen
`session:fog-set`-Aktion (Ziel `zellen`, `bereich` oder `alle`, Aufdecken wie Verdecken)
SHALL der Server nach `session:fog` jeder Verbindung im Raum `session:tokens` mit dem für
sie gefilterten Bestand senden; `session:fog-area-create` und `session:fog-area-delete`
MUST NOT `session:tokens` auslösen. Der Server MUST NOT das Bewegen eines Tokens in
verdeckte Zellen verhindern.

#### Scenario: Besitzerloses Token im Fog erreicht den Spieler nicht

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte (Raster `quadrat`,
  70, 0, 0) ohne aufgedeckte Zellen, einem Token `Ork` ohne Besitzer in Zelle `(3, 4)`, ihr
  Spielleiter und ein Spieler-Mitglied `sam`
- **WHEN** beide `session:enter` senden
- **THEN** trägt das Acknowledgement des Spielleiters `tokens` mit genau `Ork` in `(3, 4)`,
  und das Acknowledgement von `sam` trägt `tokens` als leere Liste

#### Scenario: Aufdecken lässt das Token erscheinen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen und einem Token `Ork` ohne Besitzer in `(3, 4)`, deren Spielleiter und ein
  Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit
  der Zelle `(3, 4)` sendet
- **THEN** erhält `sam` `session:fog` mit `revealed` gleich genau `(3, 4)` und danach
  `session:tokens`, dessen Liste genau `Ork` mit `col` `3`, `row` `4`, `ownerId` `null`,
  `hp` `null` und `shares` `null` enthält — `session:fog` kommt vor `session:tokens` an —,
  und der Spielleiter erhält `session:tokens` mit genau `Ork`

#### Scenario: Verdecken lässt das Token verschwinden

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der genau
  `(3, 4)` aufgedeckt ist, und einem Token `Ork` ohne Besitzer in `(3, 4)`, deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: false` und dem Ziel `zellen` mit
  der Zelle `(3, 4)` sendet
- **THEN** erhält `sam` `session:tokens` mit leerer Liste, und der Spielleiter erhält
  `session:tokens` mit genau `Ork`

#### Scenario: Alles verdecken lässt nur die Tokens mit Besitzer stehen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der `(3, 4)` und
  `(5, 5)` aufgedeckt sind, einem Token `Ork` ohne Besitzer in `(3, 4)` und einem Token
  `Goblin` in `(5, 5)`, dessen Besitzer das Spieler-Mitglied `sam` ist, deren Spielleiter
  und `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: false` und dem Ziel `alle` sendet
- **THEN** erhält `sam` `session:tokens`, dessen Liste genau `Goblin` enthält, und der
  Spielleiter erhält `session:tokens` mit `Ork` und `Goblin`

#### Scenario: Bewegung in den Fog lässt das Token verschwinden

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der genau
  `(3, 4)` aufgedeckt ist, und einem Token `Ork` ohne Besitzer in `(3, 4)`, deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-move` für `Ork` nach `(7, 1)` sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.col` `7` und `token.row`
  `1`, `Ork` steht in der Datenbank in `(7, 1)`, `sam` erhält `session:tokens` mit leerer
  Liste, und der Spielleiter erhält `session:tokens`, in dem `Ork` in `(7, 1)` steht

#### Scenario: Bewegung aus dem Fog lässt das Token erscheinen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der genau
  `(3, 4)` aufgedeckt ist, und einem Token `Ork` ohne Besitzer in `(7, 1)`, deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:token-move` für `Ork` nach `(3, 4)` sendet
- **THEN** erhält `sam` `session:tokens`, dessen Liste genau `Ork` in `(3, 4)` enthält

#### Scenario: Großes Token ist sichtbar, sobald eine seiner Zellen aufgedeckt ist

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte (Raster `quadrat`,
  70, 0, 0), auf der genau `(4, 5)` aufgedeckt ist, einem Token `Ork` ohne Besitzer mit
  `size` `2` in Ankerzelle `(3, 4)`, ihr Spielleiter im Raum und ein Spieler-Mitglied `sam`
- **WHEN** `sam` `session:enter` sendet, und der Spielleiter danach `session:fog-set` mit
  `revealed: false` und dem Ziel `zellen` mit `(4, 5)` und anschließend mit `revealed: true`
  und dem Ziel `zellen` mit `(5, 6)` sendet
- **THEN** trägt das Acknowledgement von `sam` `tokens` mit genau `Ork`, und das letzte
  `session:tokens`, das `sam` erhält, hat eine leere Liste

#### Scenario: Bei Hex zählt nur die Ankerzelle

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte (Raster `hex-spitz`,
  70, 0, 0), auf der genau `(4, 5)` aufgedeckt ist, einem Token `Ork` ohne Besitzer mit `size` `2`
  in Ankerzelle `(3, 4)`, ihr Spielleiter im Raum und ein Spieler-Mitglied `sam`
- **WHEN** `sam` `session:enter` sendet, und der Spielleiter danach `session:fog-set` mit
  `revealed: true` und dem Ziel `zellen` mit `(3, 4)` sendet
- **THEN** trägt das Acknowledgement von `sam` `tokens` als leere Liste, und das darauf
  folgende `session:tokens` an `sam` enthält genau `Ork`

#### Scenario: Eigenes Token bleibt im Fog sichtbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen und einem Token `Goblin` in `(3, 4)` mit `hp` `23` und `hpMax` `40`, dessen
  Besitzer das Spieler-Mitglied `sam` ist
- **WHEN** `sam` `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit genau `Goblin`, dessen `ownerId` die
  `userId` von `sam`, `hp` `23` und `hpMax` `40` sind

#### Scenario: Token eines Mitspielers ist unabhängig vom Fog sichtbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen, zwei Spieler-Mitgliedern `sam` und `tom` und einem Token `Elf` in `(3, 4)` mit
  `hp` `12` und `hpMax` `12`, dessen Besitzer `tom` ist
- **WHEN** `sam` `session:enter` sendet
- **THEN** trägt das Acknowledgement `tokens` mit genau `Elf`, dessen `ownerId` die `userId`
  von `tom`, `col` `3`, `row` `4`, `hp` `null`, `hpMax` `null` und `shares` `null` sind

#### Scenario: Geteilte Werte eines verborgenen Tokens erreichen den Spieler nicht

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen und einem Token `Ork` ohne Besitzer in `(3, 4)` mit `hp` `30`, `hpMax` `30` und der
  Markierung `['Liegend']`, dessen Zielgruppen `hp` `alle` und `conditions` die Liste mit
  `sam` sind, ihr Spielleiter im Raum und das Spieler-Mitglied `sam`
- **WHEN** `sam` `session:enter` sendet, und der Spielleiter danach `session:fog-set` mit
  `revealed: true` und dem Ziel `zellen` mit `(3, 4)` sendet
- **THEN** trägt das Acknowledgement von `sam` `tokens` als leere Liste, und das darauf
  folgende `session:tokens` an `sam` enthält genau `Ork` mit `hp` `30`, `hpMax` `30` und
  `conditions` `['Liegend']`

#### Scenario: Bereich anlegen löst keinen Tokenbestand aus

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen und einem Token `Ork` ohne Besitzer in `(3, 4)`, deren Spielleiter und ein
  Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:fog-area-create` mit `name: "Raum 1"` und der Zelle
  `(3, 4)` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, fog }`, `sam` erhält `session:fog` mit
  `areas: null`, und weder `sam` noch der Spielleiter erhalten ein `session:tokens`

### Requirement: Bereinigung der Tokens beim Verlassen

Verlässt ein Spieler eine Spielsitzung oder wird er vom Spielleiter entfernt (Requirement
„Verlassen einer Spielsitzung und Entfernen eines Spielers" in `game-session`), SHALL der
Server in derselben Transaktion die Tokens dieser Spielsitzung bereinigen.

Jedes Token dieser Spielsitzung, dessen Besitzer (`ownerId`) die `userId` des Betroffenen
ist, SHALL `ownerId: null` erhalten („gehört dem Spielleiter"); die Tokens anderer Besitzer
und ohne Besitzer bleiben unberührt, kein Token wird gelöscht.

In jeder Zielgruppe eines Stats (`hp`, `tempHp`, `ac`, `initiative`, `conditions`) jedes
Tokens dieser Spielsitzung, die als **Liste** vorliegt und die `userId` des Betroffenen
nennt, SHALL diese `userId` entfernt werden; die übrigen genannten `userId`s bleiben
erhalten. Wird eine Liste dadurch leer, SHALL die Zielgruppe `keine` werden (eine Liste ist
nie leer). Eine Zielgruppe `keine` oder `alle` bleibt unverändert.

#### Scenario: Token des Betroffenen verliert den Besitzer

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit einer aktiven Karte, einem Token
  `Ork` mit dem Spieler-Mitglied `sam` als Besitzer und einem Token `Goblin` mit dem
  Spieler-Mitglied `tom` als Besitzer
- **WHEN** `sam` die Spielsitzung über `DELETE /api/sessions/:id/members/:userId` mit seiner
  eigenen `userId` verlässt
- **THEN** trägt `Ork` in der Datenbank `ownerId: null`, `Goblin` trägt weiterhin die
  `userId` von `tom` als `ownerId`, und beide Tokens existieren weiterhin

#### Scenario: userId verlässt die listenwertige Zielgruppe

- **GIVEN** eine Spielsitzung mit einer aktiven Karte und einem Token `Ork`, dessen
  `hp`-Zielgruppe die Liste der `userId`s von `sam` und `tom` ist und dessen `ac`-Zielgruppe
  `alle` ist
- **WHEN** `sam` die Spielsitzung verlässt
- **THEN** ist die `hp`-Zielgruppe von `Ork` die Liste, die nur noch die `userId` von `tom`
  nennt, und die `ac`-Zielgruppe ist weiterhin `alle`

#### Scenario: Letzter Eintrag einer Zielgruppe wird zu keine

- **GIVEN** eine Spielsitzung mit einer aktiven Karte und einem Token `Ork`, dessen
  `initiative`-Zielgruppe die Liste ist, die allein die `userId` von `sam` nennt
- **WHEN** `sam` die Spielsitzung verlässt
- **THEN** ist die `initiative`-Zielgruppe von `Ork` `keine`
