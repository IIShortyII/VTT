# session-token Specification

## Purpose

Figuren auf der aktiven Karte: der Spielleiter legt Tokens an, verschiebt und entfernt sie;
alle Teilnehmer im Raum sehen denselben Bestand in Echtzeit. Legt fest, dass ausschließlich
der Spielleiter Tokens verändert, dass jede Aktion serverseitig geprüft wird, dass Tokens an
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
- **Tokendarstellung**: `{ id, instanceId, name, color, icon, size, col, row }` — `icon` ist
  ein Katalogeintrag oder `null`.
- **Tokenbestand**: alle Tokens der aktiven Instanz als Liste von Tokendarstellungen,
  aufsteigend nach Anlegezeitpunkt; ohne aktive Karte die leere Liste. Er erreicht jeden
  Teilnehmer im Raum — er enthält nur, was auf dem Canvas sichtbar ist (`constitution.md`
  §9.2). Tokens nicht aktiver Instanzen verlassen den Server nicht.

Drahtformat (Client → Server, je mit Acknowledgement):
`session:token-create` `{ sessionId, name, color, icon, size, col, row }` →
`{ ok: true, token }` oder `{ ok: false, message }`;
`session:token-move` `{ sessionId, tokenId, col, row }` → `{ ok: true, token }` oder
`{ ok: false, message }`; `session:token-remove` `{ sessionId, tokenId }` → `{ ok: true }`
oder `{ ok: false, message }`. Server → Client: `session:tokens` `{ sessionId, tokens }` mit
dem Tokenbestand. Das Acknowledgement von `session:enter` (`game-session`) trägt zusätzlich
`tokens` mit dem Tokenbestand.

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

Das System SHALL dem Spielleiter über `session:token-move` erlauben, ein Token der aktiven
Instanz auf eine andere Zelle zu setzen. Der Server SHALL das Token mit `id` **und**
`instanceId` gleich der aktiven Instanz der Spielsitzung laden; ein unbekanntes Token, ein
Token einer anderen Spielsitzung und ein Token einer eingehängten, nicht aktiven Instanz
SHALL mit identischer Meldung `Token nicht gefunden.` abgelehnt werden (`constitution.md`
§9.2). Bei Erfolg SHALL die Zelle gespeichert, dem Absender mit `{ ok: true, token }`
bestätigt und allen im Raum der Tokenbestand gesendet werden. Ein Absender ohne Rolle
`spielleiter` SHALL `{ ok: false, message }` erhalten; die Zelle MUST NOT sich ändern.

#### Scenario: Spielleiter bewegt ein Token

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token
  `Goblin` in Zelle `(3, 4)`, deren Spielleiter und ein Spieler-Mitglied beide den Raum
  betreten haben
- **WHEN** der Spielleiter `session:token-move` mit `{ sessionId, tokenId, col: 7, row: 1 }`
  sendet
- **THEN** ist das Acknowledgement `{ ok: true, token }` mit `token.col` `7` und
  `token.row` `1`, das Token steht in der Datenbank in `(7, 1)`, und Spielleiter und
  Spieler erhalten je ein `session:tokens`, in dem `Goblin` in `(7, 1)` steht

#### Scenario: Spieler darf kein Token bewegen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und einem Token in
  Zelle `(3, 4)`, deren Spieler-Mitglied den Raum betreten hat
- **WHEN** der Spieler `session:token-move` mit `{ sessionId, tokenId, col: 7, row: 1 }`
  sendet
- **THEN** ist das Acknowledgement `{ ok: false, message }`, und das Token steht in der
  Datenbank weiterhin in `(3, 4)`

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
Ankerzelle, mit Symbol bzw. Initiale und Namen; das Aussehen nimmt der menschliche App-Test
ab. Für den Spielleiter SHALL die Kartenansicht der Fassade einen `onTokenMove`-Rückruf
übergeben, der beim Loslassen eines gezogenen Tokens die Zielzelle als `session:token-move`
sendet; für Spieler MUST NOT ein Rückruf übergeben werden. Ein Token MUST NOT lokal
verschoben werden, bevor der Server den Bestand verteilt hat (`constitution.md` §9.1). Der
Spielleiter SHALL zusätzlich eine Token-Verwaltung sehen: ein Formular zum Anlegen und eine
Liste der Tokens mit „Entfernen"; Spieler MUST NOT sie sehen. Ein abgelehntes
Acknowledgement SHALL als Meldung erscheinen.

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

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token
- **WHEN** die Raumansicht gerendert ist
- **THEN** wurde die Canvas-Fassade ohne `onTokenMove`-Rückruf erzeugt

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

#### Scenario: Abgelehnte Aktion zeigt die Meldung

- **GIVEN** ein Spielleiter im Raum, dessen Socket-Fassade `createToken` mit
  `{ ok: false, message: 'Keine Karte aktiv.' }` beantwortet
- **WHEN** er das Formular `Tokens` mit gültigen Feldern abschickt
- **THEN** zeigt die Raumansicht eine Meldung mit genau dem Text `Keine Karte aktiv.`

#### Scenario: Spieler sieht keine Token-Verwaltung

- **GIVEN** ein Spieler im Raum mit aktiver Karte und einem Token
- **WHEN** die Raumansicht gerendert ist
- **THEN** existiert weder eine Überschrift `Tokens` noch eine Schaltfläche `Anlegen` noch
  eine Schaltfläche mit dem Namen `<Tokenname> entfernen`
