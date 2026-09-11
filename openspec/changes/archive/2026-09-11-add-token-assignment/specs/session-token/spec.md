Ergänzung des Drahtformats (gilt zusammen mit dem bestehenden Abschnitt „Drahtformat"):
Die **Tokendarstellung** ist `{ id, instanceId, name, color, icon, size, col, row, ownerId }` —
`ownerId` ist die `userId` des Besitzers oder `null` („gehört dem Spielleiter"). Client →
Server, mit Acknowledgement: `session:token-assign` `{ sessionId, tokenId, ownerId }` mit
`ownerId` als `userId` oder `null` → `{ ok: true, token }` oder `{ ok: false, message }`.

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Tokenansicht im Raum

Die Raumansicht (`game-session`, „Sitzungsoberfläche") SHALL den Tokenbestand aus dem
Enter-Acknowledgement übernehmen und mit jedem `session:tokens` ersetzen. Die Kartenansicht
SHALL die Tokens der Canvas-Fassade übergeben (beim Erzeugen und bei jeder Änderung per
`setTokens`) — gezeichnet werden sie als farbige Scheibe in Zellgröße mal Tokengröße auf der
Ankerzelle, mit Symbol bzw. Initiale und Namen; das Aussehen nimmt der menschliche App-Test
ab. Für **jede Rolle** SHALL die Kartenansicht der Fassade einen `onTokenMove`-Rückruf
übergeben, der beim Loslassen eines gezogenen Tokens die Zielzelle als `session:token-move`
sendet, sowie eine Greifbarkeitsregel `canMoveToken`, die pro Token entscheidet, ob es
gezogen werden kann: für den Spielleiter jedes Token, für einen Spieler genau die Tokens mit
`ownerId` gleich seiner eigenen `userId` — dieselbe Regel, die der Server anwendet. Die
Fassade SHALL nur greifbare Tokens ziehen lassen und sie sichtbar kennzeichnen (Aussehen im
App-Test). Ein Token MUST NOT lokal verschoben werden, bevor der Server den Bestand verteilt
hat (`constitution.md` §9.1). Der Spielleiter SHALL zusätzlich eine Token-Verwaltung sehen:
ein Formular zum Anlegen und eine Liste der Tokens mit „Entfernen" und je Token einem
Auswahlfeld `<Tokenname> zuweisen`, dessen Einträge `Spielleiter` (kein Besitzer) und jedes
Mitglied mit Rolle `spieler` unter seinem Anzeigenamen (Alias, sonst Nutzername) sind und
dessen Wert der aktuellen Zuweisung folgt; eine Auswahl sendet `session:token-assign`.
Spieler MUST NOT die Verwaltung sehen. Ein abgelehntes Acknowledgement einer Token-Aktion
(Anlegen, Bewegen, Entfernen, Zuweisen) SHALL in der Raumansicht als Meldung erscheinen —
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

#### Scenario: Spieler sieht keine Token-Verwaltung

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token
- **WHEN** die Raumansicht gerendert ist
- **THEN** existiert weder eine Überschrift `Tokens` noch eine Schaltfläche `Anlegen` noch
  eine Schaltfläche mit dem Namen `<Tokenname> entfernen` noch ein Auswahlfeld mit dem Namen
  `<Tokenname> zuweisen`
