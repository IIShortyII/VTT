## Context

Vorhanden: `broadcastTokens` und `loadTokensFor` in `server/session/tokens.ts` als Muster
„je Verbindung gefiltert" (#61: `presence.entriesIn`, Rolle aus der **jetzt** geladenen
Mitgliedschaft, `redactToken` je Token); die sieben Token-Handler mit der Reihenfolge
zod-Parse → `authorizeAction` → aktive Instanz aus der Spielsitzung → Token laden mit `id`
**und** `instanceId` → Regel → Schreiben → `broadcastTokens` → Ack; `canMoveToken`/
`canShareToken` als reine Regeln in `shared/token.ts`; die aufgedeckten Zellen als
`FogCell`-Zeilen je Instanz (#16, `server/session/fog.ts`: `loadFog`, `broadcastFog`,
Handler `session:fog-set` mit Aufdecken/Verdecken/Bereich/alle); `cellKey` in
`shared/fog.ts`; der Rastertyp der Karte über `toMapSummary(instance.map).grid.type`
(`quadrat`, `hex-spitz`, `hex-flach`); die Kartenansicht zeichnet ein Token bei `quadrat`
über `size × size` Zellen ab der Ankerzelle, bei Hex zentriert auf der Ankerzelle. Die
Reihenfolge `session:map` → `session:fog` → `session:tokens` je Verbindung gilt bereits bei
Kartenwechsel und Aushängen. Der Client übernimmt jeden Bestand vollständig (`setTokens`,
Liste `Tokenwerte`) und hält keinen eigenen Tokenzustand.

Die vier Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
MODIFIED-Delta `specs/session-token/spec.md`. Bindend und nicht wiederholt:
`constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Eine Regel, eine Stelle, reine Funktion:** `isTokenVisible` im gemeinsamen Vertrag
  entscheidet für jeden Sendepfad (Enter-Ack, `broadcastTokens`) und für die Ladeprüfung in
  `session:token-move`/`session:token-share` — kein zweiter Filter, der abweichen könnte.
- **Existenzfilter vor Wertefilter:** erst welche Tokens, dann welche Werte — beides an
  derselben Stelle, in derselben Reihenfolge, in jedem Pfad.
- **Sichtbarkeitskontext je Sendevorgang frisch aus der Datenbank** (aufgedeckte Zellen,
  Rastertyp, Zuweisung) — nichts wird an der Verbindung oder im Prozess gecacht (§9.3).
- Kein Client-Code, kein Schema, keine Dependency.
- Keine bestehende Assertion außerhalb des Testaufbaus (Konvention „vollständig aufgedeckt")
  ändert sich.

**Non-Goals:**
- Keine Kennzeichnung verborgener Tokens für den Spielleiter; kein Kundschafter-Schalter.
- Keine Reihenfolgegarantie zwischen den `session:tokens` verschiedener Empfänger; wohl aber
  **je Empfänger** `session:fog` → `session:tokens` nach jeder `session:fog-set`-Aktion.
- Kein Delta-Protokoll — jedes `session:tokens` trägt weiterhin den vollständigen (für den
  Empfänger sichtbaren) Bestand.

## Decisions

### D1 — Regeln im Vertrag (`shared/token.ts`)

- **`tokenCells(token, gridType): Cell[]`** — reine Funktion über `col`, `row`, `size` und
  den Rastertyp: bei `quadrat` alle Zellen mit `col` von `token.col` bis `token.col + size − 1`
  und `row` entsprechend (Ankerzelle oben links, wie `tokenCenter` in der Fassade); bei
  `hex-spitz`/`hex-flach` genau die Ankerzelle. `size` 1 liefert in beiden Fällen die
  Ankerzelle.
- **`isTokenVisible(token, viewer, revealedKeys, gridType): boolean`** — `viewer` ist der
  bestehende `TokenViewer`-Schnitt (`role`, `userId`), `revealedKeys` ein `Set<string>` aus
  `cellKey` der aufgedeckten Zellen. Reihenfolge: Rolle `spielleiter` → `true`; `ownerId`
  ungleich `null` → `true` (eigenes Token wie das eines Mitspielers, proposal.md); sonst
  `true` genau dann, wenn eine Zelle aus `tokenCells` in `revealedKeys` liegt. Kein
  Datenbankzugriff.
- Importe: `cellKey` aus `./fog.js` (importiert selbst nur `./grid.js` und `zod` — kein
  Zyklus), Typ `GridType` aus `./map.js`, Typ `Cell` aus `./grid.js`. Nichts Serverseitiges.
- Verworfen: *Regel nur im Server* — sie gehört neben `canMoveToken`, damit der Vertrag
  vollständig sagt, was ein Empfänger sieht; *`revealed` als Liste übergeben* — die
  Mengenprüfung braucht das Set, und der Aufrufer baut es einmal je Sendevorgang, nicht je
  Token.

### D2 — Tokenbestand mit Sichtbarkeitskontext (`server/session/tokens.ts`)

- **`loadVisibilityContext(prisma, instance): Promise<{ revealedKeys, gridType }>`** —
  liest die `FogCell`-Zeilen der Instanz (nur `col`, `row`) und den Rastertyp aus
  `toMapSummary(instance.map).grid.type`. Eine Stelle, benutzt vom Bestand (unten) und von
  den Handlern (D3).
- **`loadTokenInventory(prisma, sessionId): Promise<TokenInventory | null>`** mit
  `TokenInventory = { tokens: Token[]; revealedKeys: Set<string>; gridType: GridType }` —
  Spielsitzung mit `activeInstance` und deren `map` laden; ohne aktive Instanz `null`; sonst
  Tokens (wie `loadTokens`: `orderBy createdAt asc`, `TOKEN_INCLUDE`, `toToken`) und den
  Sichtbarkeitskontext. `loadTokens` bleibt für die ungefilterten Spielleiter-Acks bestehen
  (es kann intern über das Inventar gehen).
- **`tokensFor(inventory, viewer): Token[]`** — reine Funktion: `null`-Inventar → leere
  Liste; sonst `filter(isTokenVisible)` und danach `map(redactToken)`, Reihenfolge bleibt
  (Anlegereihenfolge). **`loadTokensFor`** wird `loadTokenInventory` + `tokensFor`;
  **`broadcastTokens`** lädt das Inventar einmal, die Mitgliedschaften einmal, und ruft je
  Verbindung `tokensFor` — wie heute, nur mit dem Existenzfilter davor.
- Verworfen: *`redactToken` erweitern, sodass es `null` zurückgibt* — Filtern und
  Schwärzen sind zwei Fragen (welche Tokens, welche Werte); ein `null` aus einer Funktion,
  die heute immer ein Token liefert, wäre an jedem Aufrufer zu prüfen. *Fog-Zellen in
  `broadcastFog` mitgeben* — der Bestand wird auch nach Token-Aktionen verteilt, ohne dass
  ein Fog-Ereignis vorausgeht.

### D3 — Ladeprüfung in `session:token-move` und `session:token-share`

- Nach dem Laden von `existing` (mit `id` und `instanceId` der aktiven Instanz) und **vor**
  `canMoveToken`/`canShareToken`: ist die Rolle des Absenders `spieler` **und**
  `existing.ownerId === null`, den Sichtbarkeitskontext der aktiven Instanz laden
  (`loadVisibilityContext`, Instanz mit `map`) und `isTokenVisible` auswerten; `false` →
  `TOKEN_NOT_FOUND_MESSAGE`, nichts schreiben, kein Broadcast. In jedem anderen Fall
  (Spielleiter, Token mit Besitzer) ist das Token nach D1 ohne Datenbankzugriff sichtbar —
  die Abfrage entfällt.
- Dieselbe Meldung wie „unbekannt": die Differenz zu `NOT_TOKEN_OWNER_MESSAGE`/
  `NOT_TOKEN_SHARER_MESSAGE` verriete sonst, ob das Token noch auf der Karte steht
  (proposal.md, §9.2). Ein besitzerloses Token, das der Spieler sieht, liefert weiterhin
  „darfst du nicht bewegen/teilen" — die bestehenden Szenarien bleiben (Konvention).
- Die übrigen fünf Handler sind Spielleiter-Aktionen (`authorizeAction` mit Rolle) — dort
  ist jedes Token sichtbar, keine Prüfung nötig.
- Verworfen: *Sichtbarkeit in `authorizeAction`* — die Funktion kennt kein Token; *das
  Token gleich nur unter den sichtbaren suchen* — zwei Abfragen für eine Frage, und die
  Regel läge dann in einer `where`-Klausel statt in `isTokenVisible`.

### D4 — Tokenbestand nach Fog-Änderung (`server/session/fog.ts`)

- `handleSetFog`: nach `broadcastFog` ein `await broadcastTokens(io, prisma, presence,
  sessionId)` — für jedes Ziel (`zellen`, `bereich`, `alle`) und beide Richtungen, auch
  wenn sich die Zellmenge nicht geändert hat (billiger als ein Vergleich; ein Bestand zu
  viel ist kein Fehler). `handleCreateFogArea`/`handleDeleteFogArea` unverändert: die Zellen
  ändern sich nicht, also auch nicht die Sichtbarkeit.
- Beide Aufrufe `await`ed, damit `session:fog` vor `session:tokens` je Verbindung gilt
  (dasselbe Muster wie `handleActivateMap`). Das Ack folgt danach.
- Import `broadcastTokens` aus `./tokens.js`; `tokens.ts` importiert aus `fog` nur
  `cellKey` aus dem Vertrag — kein Zyklus zwischen den Servermodulen.
- Verworfen: *Client fordert nach `session:fog` den Bestand neu an* — der Server weiß, dass
  sich die Sichtbarkeit geändert hat; ein Rundtrip mehr und ein Fenster, in dem der Client
  einen falschen Bestand zeichnet.

### D5 — Client: unverändert

- Die Kartenansicht zeichnet bei jedem `setTokens` den übergebenen Bestand vollständig neu
  (entfernt alle Token-Container, legt sie neu an); ein Token, das nicht mehr in der Liste
  steht, verschwindet damit ohne Zutun. Die Liste `Tokenwerte` rendert aus derselben Liste.
  Ein Token, das erscheint, wird wie ein neu angelegtes gezeichnet.
- Der Spielleiter sieht alle Tokens über halbtransparentem Fog — welche für Spieler
  verborgen sind, ist damit erkennbar, ohne eigene Kennzeichnung (Non-Goal).
- Kein neues Ereignis, kein neues Feld auf der Leitung: `session:tokens` und das Enter-Ack
  behalten ihre Form; nur die Liste ist für Spieler kürzer.

### D6 — Testaufbau

- **Neue Szenarien** als Socket-Integrationstests in der Art der Token-Socket-Szenarien
  (echte Socket.IO-Clients, Aufbau über Routen und direkte Prisma-Zeilen: Spielsitzung,
  Mitgliedschaften, Karte anlegen — für „Bei Hex zählt nur die Ankerzelle" mit Rastertyp
  `hex-spitz` —, einhängen, aktiv setzen, Token direkt anlegen). Aufgedeckte Zellen wie im
  Fog-Socket-Aufbau direkt als `FogCell`-Zeilen der Instanz anlegen (Helfer „Zellen direkt
  aufdecken"). Reihenfolge `session:fog` vor `session:tokens` über eine Ereignisliste je
  Client prüfen (Muster der Kartenwechsel-Reihenfolge). „erhält kein `session:tokens`" als
  kurze Wartezeit ohne Ereignis (wie bisher). „das letzte `session:tokens`" über eine
  aufzeichnende Liste, nach der letzten Aktion kurz warten und den letzten Eintrag prüfen.
  Die Szenarien können in der bestehenden Token-Socket-Suite oder in einer eigenen Suite
  liegen — eine eigene Suite hält die Konvention (unten) sauber getrennt.
- **Bestehende Token-Socket-Szenarien und die Konvention** (Spec-Vorspann): der Helfer, der
  eine Karte einhängt (oder der, der sie aktiv setzt), legt für die Instanz zusätzlich die
  Zellen `(0..14) × (0..14)` als `FogCell`-Zeilen an — eine `createMany`-Anweisung mit 225
  Zeilen, bei jeder Karte, auch bei zwei eingehängten Karten desselben Szenarios
  („Kartenwechsel liefert den Bestand der neuen Karte"). Damit sind alle in den Szenarien
  genannten Zellen (`(0,0)` bis `(8,2)`) aufgedeckt, und keine Assertion ändert sich. Kein
  Szenario der bestehenden Suite nennt Fog — der Aufbau ist die einzige Änderung.
- **Fog-Socket-Szenarien** bleiben unverändert: ein zusätzliches `session:tokens` nach
  `session:fog-set` stört weder `once`-Wartezeiten auf `session:fog` noch die
  Kartenwechsel-Reihenfolge (dort folgt `session:tokens` ohnehin).
- **Komponententests** unverändert: die Socket-Fassade ist gemockt, der Bestand kommt aus
  dem Test.
- Fixtures: Spielleiter `meister`, Spieler `sam` und `tom`, Tokens `Ork` (ohne Besitzer),
  `Goblin` (Besitzer `sam`), `Elf` (Besitzer `tom`); Zellen `(3, 4)`, `(7, 1)`, `(5, 5)`,
  `(4, 5)`, `(5, 6)`.
- Kein Test importiert `pixi.js`; das Erscheinen und Verschwinden auf der Karte nimmt der
  App-Test ab.

## Risks / Trade-offs

- **Eine Fog-Abfrage je Sendevorgang** (bis zu 10000 Zeilen bei vollständig aufgedeckter
  großer Karte) → dieselbe Größenordnung wie `broadcastFog`; eine Abfrage je Broadcast,
  nicht je Empfänger; `select` nur auf `col`, `row`.
- **Zwei Broadcasts kurz nacheinander** (Token-Aktion und Fog-Aktion zeitgleich) → jeder
  Broadcast lädt einen konsistenten Schnappschuss; der spätere gewinnt, wie heute bei zwei
  Token-Aktionen.
- **`session:tokens` auch ohne Sichtbarkeitsänderung** (Fog-Aktion auf tokenfreie Zellen)
  → Bandbreite, kein Fehler; der Client zeichnet den gleichen Bestand neu.
- **Ein Spieler zieht sein Token in den Fog** → erlaubt (proposal.md); er sieht es dort
  auf schwarzem Grund und kann es zurückziehen — die Fassade lässt greifbare Tokens
  unabhängig vom Fog ziehen.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte (Helfer als Prosa beschrieben).

## Migration Plan

Kein Schema, keine Migration, keine Dependency. Rollback: der Change ändert nur
serverseitige Filterung; ein Zurückrollen liefert Spielern wieder alle Tokens.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden.
