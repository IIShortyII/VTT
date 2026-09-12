Ergänzung der Begriffe (gilt zusammen mit dem bestehenden Abschnitt „Begriffe"):

- **Zellen eines Tokens**: die Zellen, die ein Token abdeckt — bei Raster `quadrat` die
  `size × size` Zellen ab der Ankerzelle (`col` bis `col + size − 1`, `row` bis
  `row + size − 1`), bei Raster `hex-spitz` und `hex-flach` ausschließlich die Ankerzelle
  (dieselbe Geometrie, mit der die Kartenansicht das Token zeichnet).
- **Sichtbares Token**: ein Token ist für einen Empfänger sichtbar, wenn der Empfänger die
  Rolle `spielleiter` hat, wenn `ownerId` nicht `null` ist (das eigene Token wie das eines
  Mitspielers) oder wenn mindestens eine der Zellen des Tokens zu den aufgedeckten Zellen der
  aktiven Instanz gehört (`session-fog`, „Aufgedeckte Zellen"). Verborgen werden damit
  ausschließlich besitzerlose Tokens in vollständig verdeckten Zellen.
- **Tokenbestand** (ergänzt): er erreicht jeden Teilnehmer je Verbindung gefiltert — der
  Spielleiter erhält alle Tokens, ein Spieler nur die für ihn sichtbaren Tokens (Requirement
  „Sichtbarkeit von Tokens im Fog"), und auf diesen die Werte nach „Sichtbarkeit der
  Tokenwerte". Ein nicht sichtbares Token verlässt den Server für diesen Empfänger in keiner
  Form.
- **Konvention für bestehende Szenarien**: Wo ein Szenario dieser Spec eine aktive Karte
  voraussetzt, ohne den Fog-Zustand zu nennen, gilt die Karte als vollständig aufgedeckt.
  Verdeckte Zellen setzen nur die Szenarien der Requirement „Sichtbarkeit von Tokens im Fog"
  sowie „Verborgenes Token ist beim Bewegen nicht unterscheidbar" und „Verborgenes Token ist
  beim Teilen nicht unterscheidbar" voraus.

Ergänzung des Drahtformats: Nach jeder erfolgreichen `session:fog-set`-Aktion
(`session-fog`) folgt für jede Verbindung im Raum auf `session:fog` ein `session:tokens` mit
dem für sie gefilterten Tokenbestand.

## ADDED Requirements

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

## MODIFIED Requirements

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
