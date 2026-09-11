## Why

Seit #15 ist das VTT spielbar, aber Trefferpunkte, Rüstungsklasse, Initiative und Zustände
stehen weiterhin auf einem Zettel neben dem Bildschirm. Dieser Change ist Teil 1 von Epic
#10 (Issue #61): der Spielleiter pflegt die Werte am Token, die Karte zeigt Healthbar und
Markierungen, die Tokenliste die Zahlen — und der Server entscheidet pro Empfänger, wer
welche Werte überhaupt geschickt bekommt (`constitution.md` §9.2). Teil 2 (#62) baut darauf
das Teilen je Token, Stat und Spieler; hier gilt die feste Regel „Spielleiter alles,
Besitzer sein Token, sonst nichts".

Entscheidungen aus der Klärung mit dem Menschen (2026-09-11): NPC = Token ohne Besitzer, kein
Typfeld; fünf Werte (`hp`/`hpMax` als ein Stat, `tempHp`, `ac`, `initiative`) plus die
Markierungsliste `conditions`; alle Zahlenwerte optional, ein neues Token hat keine; der
Server nimmt nur absolute Werte an und verrechnet weder Schaden noch Heilung (Tischregel,
nicht Servercode); Markierungen sind freie Kurztexte mit dem 5e-Katalog als Schnellwahl im
Client, kein Server-Enum; nur der Spielleiter setzt Werte und Markierungen, auch auf
Spielertokens; ein verborgener Wert kommt beim Spieler als `null` an, ununterscheidbar von
„nicht gesetzt"; auf der Karte Healthbar und Markierungssymbole, keine Zahlen; die Zahlen
und die Bedienung in der Tokenliste; Spieler bekommen eine eigene Ansicht der Tokenliste.

## What Changes

- **Werte am Token.** `Token` bekommt fünf nullable Ganzzahlspalten `hp`, `hpMax`, `tempHp`,
  `ac`, `initiative` und eine Markierungstabelle `TokenCondition` (Kurztext je Zeile, je
  Token eindeutig, geordnet). Die Tokendarstellung auf der Leitung trägt diese Felder plus
  `conditions` als Liste.
- **Werte setzen — nur Spielleiter.** Neues Socket-Ereignis `session:token-stats` mit einem
  Teilobjekt (nur die Felder, die sich ändern; `null` löscht). Serverregeln: ganze Zahlen;
  `hpMax` ≥ 1; `hp` ≥ 0; `tempHp`, `ac` ≥ 0; `initiative` beliebig; nach dem Zusammenführen
  mit dem gespeicherten Stand sind `hp` und `hpMax` entweder beide `null` oder beide gesetzt
  mit `hp` ≤ `hpMax` — sonst Ablehnung, kein stilles Deckeln.
- **Markierungen setzen — nur Spielleiter.** Neues Socket-Ereignis `session:token-conditions`
  mit der vollständigen Liste (ersetzt); Einträge getrimmt, 1 bis 20 Zeichen, keine
  Steuerzeichen, untereinander eindeutig, höchstens 12.
- **Sichtbarkeit pro Empfänger.** `session:tokens` und das Enter-Acknowledgement werden nicht
  mehr als ein Paket an den Raum gesendet, sondern je Verbindung: der Spielleiter erhält
  alle Werte, ein Spieler die Werte seiner eigenen Tokens (`ownerId` gleich seiner
  `userId`), von allen anderen Tokens `null` und `[]`. Die Filterung geschieht auf dem
  Server vor dem Senden; eine geänderte Zuweisung wirkt mit dem nächsten Bestand.
- **Raumansicht.** Die Kartenansicht zeichnet je Token eine Healthbar (nur wenn `hp`
  vorhanden; temporäre Trefferpunkte als eigener Abschnitt) und Markierungssymbole am
  Tokenrand, ab der vierten „+N"; Aussehen nimmt der App-Test ab. Die Token-Verwaltung des
  Spielleiters bekommt je Token Felder für die fünf Werte, Schaden/Heilung als Hilfe (der
  Client rechnet, sendet absolut), eine Schnellwahl aus dem 5e-Katalog, ein Textfeld für
  freie Markierungen und je Markierung „entfernen". Spieler bekommen eine Tokenliste, die
  je Token die sichtbaren Werte und Markierungen als Text zeigt.

**Nicht im Umfang:** Teilen von Werten an andere Spieler (#62); Schadens- und
Heilungsverrechnung auf dem Server; Attribute, Fertigkeiten, Charakterblatt; Werte im
Anlegeformular; Markierungen mit Dauer oder Rundenzähler; Fog-Filterung (#17).

## Capabilities

### New Capabilities

- Keine.

### Modified Capabilities

- `session-token`: neue Requirements „Tokenwerte setzen" (Ereignis, Regeln, Teilobjekt,
  Vorgabe beim Anlegen), „Markierungen setzen" (Ereignis, Regeln, Ersetzen, Löschen mit dem
  Token) und „Sichtbarkeit der Tokenwerte" (Filterung pro Empfänger in Enter-Acknowledgement
  und `session:tokens`, Wirkung einer geänderten Zuweisung). Requirement „Tokenansicht im
  Raum" — Healthbar und Markierungen in der Kartenansicht, Werte- und
  Markierungsbedienung in der Token-Verwaltung, Tokenliste für Spieler.

## Impact

**Schema** (`prisma/schema.prisma`): `Token.hp`, `hpMax`, `tempHp`, `ac`, `initiative` als
`Int?`; neues Modell `TokenCondition` (`tokenId`, `label`, `position`, `@@unique([tokenId,
label])`, `onDelete: Cascade`). Migration fügt nullable Spalten und eine Tabelle hinzu —
bestehende Zeilen bleiben „keine Werte". Nur gegen die Wegwerf-DB (§5.1, §6.1).

**Geänderter Code:**
- `src/shared/token.ts` — Tokendarstellung um die fünf Werte und `conditions` erweitert;
  `TokenStatsInputSchema`, `TokenConditionsInputSchema`, zugehörige Acks; Ereignisnamen
  `stats`, `conditions`; Konstanten für Grenzen
- `src/server/session/tokens.ts` — `toToken` mit Werten und Markierungen; Filterung pro
  Empfänger (`redactToken`); `broadcastTokens` sendet je Verbindung im Raum statt an den
  Raum; Handler `session:token-stats` und `session:token-conditions`
- `src/server/session/socket.ts` — Enter-Acknowledgement mit gefiltertem Bestand;
  `broadcastTokens` mit `presence`
- `src/server/session/maps.ts` — Aufruf von `broadcastTokens` mit `presence` (Aushängen der
  aktiven Instanz)
- `src/server/session/presence.ts` — Aufzählung `(userId, socketId)` je Raum
- `src/client/session/socket.ts` — `setTokenStats`, `setTokenConditions`
- `src/client/session/conditions.ts` — 5e-Katalog (Beschriftung + Symbol), Client-Konstante
- `src/client/map/canvas.ts` — Healthbar und Markierungssymbole je Token
- `src/client/session/TokenPanel.tsx` — Werte, Schaden/Heilung, Markierungen je Token
- `src/client/session/TokenStats.tsx` — Werte und Markierungen als Text (Spielleiter- und
  Spielerliste)
- `src/client/session/SessionRoom.tsx` — Handler für Werte und Markierungen; Tokenliste für
  Spieler

**Bestehende Tests:** kein Szenario ändert seine Aussage. Fixtures vom Typ `Token`
(`GOBLIN`/`ORK` in der Token-UI-Suite) brauchen die neuen Felder, weil `TokenSchema` sie
verlangt; das Szenario „Spieler sieht keine Token-Verwaltung" wird um die neuen
Bedienelemente erweitert. Alle übrigen Szenarien von `session-token`, `session-map` und
`game-session` bleiben unverändert grün.

**Dependencies:** keine neuen.
