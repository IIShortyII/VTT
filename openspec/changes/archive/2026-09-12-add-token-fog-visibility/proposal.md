## Why

Seit #16 verlässt das Kartenbild den Server für Spieler maskiert — die Tokens aber nicht:
`broadcastTokens` sendet jedem Mitglied jedes Token der aktiven Karte, auch eines, das tief
im verdeckten Bereich steht. Ein Spieler sieht damit auf schwarzem Grund, wo das Monster
wartet. Dieser Change (Issue #17, Teil von Epic #9) schließt die Lücke: ein Token, das für
einen Spieler in verdeckten Zellen steht, existiert für dessen Client nicht.

Das ist dieselbe Regel wie in #16 (`constitution.md` §9.2), angewendet auf einen zweiten
Datenstrom: die Position eines gegnerischen Tokens ist ein Spielgeheimnis und verlässt den
Server nicht, solange der Empfänger sie nicht sehen darf. Ein Client, der verborgene Tokens
nur nicht zeichnet, erfüllt diesen Change nicht — die Daten lägen dann bereits im Browser.
Die Filterung geschieht deshalb beim Senden, pro Empfänger, an derselben Stelle, an der
heute schon Werte und Freigaben je Empfänger gefiltert werden.

Entscheidungen aus der Explore-Runde mit dem Menschen (2026-09-12):
- **Ein Token ist sichtbar, sobald mindestens eine seiner Zellen aufgedeckt ist.** Bei
  Quadratraster deckt ein Token der Größe `n` die `n × n` Zellen ab seiner Ankerzelle
  (dieselbe Geometrie, mit der die Fassade es zeichnet); bei Hex zählt nur die Ankerzelle.
  Verworfen: *nur die Ankerzelle* (ein Drache der Größe 4 wäre unsichtbar, obwohl drei
  Viertel von ihm im Licht stehen) und *alle Zellen* (ein Token am Rand des aufgedeckten
  Bereichs wäre weg).
- **Der Besitzer sieht sein Token immer**, auch im Fog. Er weiß, wo seine Figur steht, und
  könnte sie sonst nicht mehr greifen, um sie zurückzuziehen.
- **Jedes Token mit Besitzer sieht jeder.** Die Gruppe kennt die Position ihrer Gefährten;
  verborgen werden nur besitzerlose Tokens (NPCs, Monster). Verworfen: *fremde
  Spielerfiguren unterliegen dem Fog* — die Normalsituation (die Gruppe läuft gemeinsam in
  einen noch nicht aufgedeckten Gang) ließe für jeden Spieler die Mitspieler verschwinden.
  Ein Kundschafter-Schalter je Token wäre ein späterer, eigener Change.
- **Ein verborgenes Token ist für den Spieler „nicht gefunden".** Bewegen und Teilen liefern
  für ein Token, das er nicht sehen darf, dieselbe Meldung wie für ein unbekanntes — sonst
  verriete die Differenz zu „darfst du nicht bewegen", ob das Monster noch auf der Karte ist.
- **Markierungen und geteilte Werte** an verborgenen Tokens brauchen keine eigene Regel: das
  Token verlässt den Server als Ganzes nicht, also auch nicht seine Markierungen und nicht
  die Werte, deren Zielgruppe `alle` ist oder den Spieler nennt. Es fehlt dann auch in der
  Liste `Tokenwerte`.

## What Changes

- **Sichtbarkeitsregel für Tokens** (reine Funktion im gemeinsamen Vertrag): ein Empfänger
  mit Rolle `spielleiter` sieht jedes Token; ein Spieler sieht ein Token, wenn es einen
  Besitzer hat (sein eigenes oder das eines Mitspielers) oder wenn mindestens eine der
  Zellen, die es abdeckt, zu den aufgedeckten Zellen der aktiven Instanz gehört.
- **Tokenbestand pro Empfänger gefiltert — auch nach Existenz.** Das Enter-Acknowledgement
  und jedes `session:tokens` enthalten für einen Spieler nur die für ihn sichtbaren Tokens;
  die bestehende Wertefilterung folgt darauf unverändert. Die Regel wird bei jedem Senden
  gegen die zu diesem Zeitpunkt gespeicherten aufgedeckten Zellen und die gespeicherte
  Zuweisung ausgewertet (`constitution.md` §9.3).
- **Fog-Änderungen verteilen den Tokenbestand neu.** Nach jeder erfolgreichen
  `session:fog-set`-Aktion (Zellen, Bereich, alle — Aufdecken wie Verdecken) sendet der
  Server nach `session:fog` jeder Verbindung `session:tokens`; ein Token erscheint beim
  Spieler, sobald seine Zelle aufgedeckt wird, und verschwindet, sobald sie verdeckt wird.
  Anlegen und Löschen eines Bereichs ändern die Zellen nicht und lösen kein
  `session:tokens` aus.
- **Bewegung über die Fog-Grenze** braucht keinen neuen Codepfad: der Bestand nach jeder
  Bewegung wird ohnehin verteilt, und die Filterung entscheidet je Empfänger neu — ein Token
  verschwindet beim Spieler, wenn es in verdeckte Zellen zieht, und erscheint, wenn es
  herauskommt.
- **Verborgene Tokens sind für den Spieler nicht adressierbar.** `session:token-move` und
  `session:token-share` behandeln ein Token, das der Absender nicht sehen darf, wie ein
  unbekanntes (`Token nicht gefunden.`), geprüft nach dem Laden und vor der
  Berechtigungsprüfung.
- **Konvention für bestehende Szenarien.** Wo ein Szenario der `session-token`-Spec eine
  aktive Karte voraussetzt, ohne den Fog-Zustand zu nennen, gilt die Karte als vollständig
  aufgedeckt — damit bleiben die Aussagen der bestehenden Szenarien (ein Spieler empfängt
  ein besitzerloses Token, erhält „darfst du nicht bewegen" für ein besitzerloses Token)
  unverändert wahr. Die bestehenden Socket-Tests decken dafür im Aufbau der aktiven Karte
  alle Zellen auf. Nur die Szenarien der neuen Requirement und die zwei neuen Szenarien in
  „Token bewegen" und „Zielgruppe eines Tokenwerts setzen" setzen verdeckte Zellen voraus.
- **Kein Client-Code ändert sich.** Kartenansicht und Liste `Tokenwerte` folgen dem
  Bestand vom Server; ein Token, das nicht mehr darin steht, wird nicht mehr gezeichnet.
  Der Spielleiter sieht weiterhin alle Tokens — durch den halbtransparenten Fog erkennt
  er, welche davon für Spieler verborgen sind.

**Nicht im Umfang:** eine Kennzeichnung „für Spieler verborgen" am Token in der
Spielleiter-Ansicht; ein Kundschafter-Schalter, der eine Spielerfigur vor Mitspielern
verbirgt; dynamisches Sichtfeld; eine Sperre gegen das Bewegen in verdeckte Zellen (der
Server prüft weiterhin keinen Kartenrand, keinen Fog); Änderungen an der Bildmaskierung.

## Capabilities

### New Capabilities

Keine.

### Modified Capabilities

- `session-token`: neue Requirement „Sichtbarkeit von Tokens im Fog" (12 Szenarien:
  Existenzfilterung beim Betreten und in `session:tokens`, Aufdecken/Verdecken/Alles
  verdecken/Bewegen über die Fog-Grenze, große Tokens bei Quadrat und Hex, eigenes Token,
  Token eines Mitspielers, geteilte Werte eines verborgenen Tokens, Bereich anlegen ohne
  Tokenbestand, Spielleiter sieht alles); Requirement „Token
  bewegen" und Requirement „Zielgruppe eines Tokenwerts setzen" ergänzen je die Regel
  „verborgen = nicht gefunden" und je ein Szenario dazu; die bestehenden Szenarien beider
  Requirements bleiben unverändert. Im Vorspann („Begriffe", Tokenbestand) die neue Regel
  und die Konvention für bestehende Szenarien.

## Impact

**Dependencies:** keine neuen. **Schema:** unverändert — die Regel liest `FogCell` (#16)
und `Token.ownerId` (#15), beides vorhanden. Keine Migration.

**Geänderter Code:**
- `src/shared/token.ts` — reine Regeln `tokenCells` (welche Zellen ein Token abdeckt, je
  Rastertyp) und `isTokenVisible` (die Sichtbarkeitsregel über Rolle, Besitzer und
  aufgedeckte Zellen)
- `src/server/session/tokens.ts` — Tokenbestand mit Sichtbarkeitskontext laden (aufgedeckte
  Zellen und Rastertyp der aktiven Instanz), Filterung nach Existenz vor der Wertefilterung
  in `loadTokensFor` und `broadcastTokens`; Sichtbarkeitsprüfung in `handleMoveToken` und
  `handleShareToken` zwischen Laden und Berechtigung
- `src/server/session/fog.ts` — `broadcastTokens` nach `broadcastFog` im Handler von
  `session:fog-set`

**Bestehende Tests:** die Socket-Szenarien von `session-token`, in denen ein Spieler ein
besitzerloses Token empfängt oder anspricht, setzen nach der Konvention eine vollständig
aufgedeckte Karte voraus — der test-author deckt im Aufbau der aktiven Karte dieser Suite
alle Zellen auf (eine Stelle im Helfer, keine Änderung an Assertions). Die Szenarien von
`session-fog`, `session-map`, `game-session` und alle Komponententests bleiben unverändert
grün: ein zusätzliches `session:tokens` nach `session:fog-set` verletzt keine bestehende
Aussage, und die Kartenansicht erhält weiterhin eine Liste.
