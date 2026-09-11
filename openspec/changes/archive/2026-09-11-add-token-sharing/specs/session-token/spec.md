Ergänzung der Begriffe und des Drahtformats (gilt zusammen mit den bestehenden Abschnitten
„Begriffe" und „Drahtformat"):

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
- Die **Tokendarstellung** ist `{ id, instanceId, name, color, icon, size, col, row, ownerId,
  hp, hpMax, tempHp, ac, initiative, conditions, shares }` — `shares` sind die Freigaben des
  Tokens für einen Empfänger mit Rolle `spielleiter` und für den Besitzer, für jeden anderen
  Empfänger `null` (wer sonst noch sieht, ist keine Information für Dritte, `constitution.md`
  §9.2). Die fünf Wertefelder und `conditions` sind für einen Empfänger ohne Sicht auf den
  jeweiligen Stat weiterhin `null` bzw. die leere Liste.

Client → Server, mit Acknowledgement: `session:token-share` `{ sessionId, tokenId, stat,
audience }` mit `stat` als einem der fünf Stat-Namen und `audience` als `'keine'`, `'alle'`
oder einer nicht-leeren Liste eindeutiger `userId`s → `{ ok: true, token }` oder
`{ ok: false, message }`; der Server ersetzt die Zielgruppe dieses Stats als Ganzes. Die
Tokendarstellung im Acknowledgement ist für den Absender gefiltert (für Spielleiter und
Besitzer ohne Wirkung).

## ADDED Requirements

### Requirement: Zielgruppe eines Tokenwerts setzen

Das System SHALL über `session:token-share` erlauben, die Zielgruppe eines Stats an einem
Token der aktiven Instanz als Ganzes zu ersetzen — dem Spielleiter für jedes Token, einem
Spieler ausschließlich für die Tokens, deren `ownerId` seine eigene `userId` ist (ein Token
ohne Besitzer teilt nur der Spielleiter). Der Server SHALL die Payload mit zod prüfen —
`stat` einer der fünf Stat-Namen (`hpMax` ist keiner), `audience` `'keine'`, `'alle'` oder
eine nicht-leere Liste eindeutiger Zeichenketten — und eine ungültige Payload mit
`Ungültige Anfrage.` ablehnen. Pro Aktion SHALL `authorizeAction` ohne Rollenanforderung
durchlaufen werden (jede Mitgliedschaft); das Token wird mit derselben Ladeprüfung wie beim
Bewegen geladen (`Token nicht gefunden.` für unbekannte, fremde und nicht aktive Tokens).
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

## MODIFIED Requirements

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
