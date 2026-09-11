## Context

Vorhanden aus #14/#15: Modell `Token` an der Karteninstanz mit `ownerId`; `shared/token.ts`
als gemeinsamer Vertrag mit `TokenSchema`, den Input-Schemas, `SESSION_TOKEN_EVENTS` und der
einen Regel `canMoveToken`; `server/session/tokens.ts` mit `toToken`/`loadTokens`/
`emitTokens`/`broadcastTokens` und vier Handlern nach dem Muster zod-Parse →
`authorizeAction` → aktive Instanz aus der Spielsitzung → Token mit `id` **und**
`instanceId` laden → Schreiben → `broadcastTokens` → Acknowledgement. `broadcastTokens`
sendet heute **ein** Paket an den Socket.IO-Raum (`io.to(roomName).emit`); Aufrufer sind die
Token-Handler, `handleActivateMap` (`session/socket.ts`) und das Aushängen der aktiven
Instanz (`session/maps.ts`). `handleEnter` legt `loadTokens` ins Acknowledgement.
`Presence` (`session/presence.ts`) kennt je Raum `userId → socketId` und je Socket
`{ gameSessionId, userId }`. Client: `client/session/socket.ts` (Fassade, Mock-Grenze der
Komponententests), `client/map/canvas.ts` (einzige Pixi-Datei, `buildTokenContainer` baut
je Token Scheibe, Symbol, Name, Ring), `TokenPanel` (Formular + Liste mit Entfernen und
Zuweisen, nur Spielleiter), `SessionRoom` (Zustand aus Enter-Ack und Server-Ereignissen,
`tokenError` als `role="alert"`).

Die Entscheidungen (fünf Werte, nullable, absolut, freie Markierungen, nur Spielleiter,
feste Sichtbarkeitsregel, `null` für verborgen, Liste statt Karte für Zahlen) stehen in
proposal.md. Verhalten: Delta in `specs/session-token/spec.md`. Bindend und nicht
wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Filterung pro Empfänger ist eine Serverfunktion mit einem Aufrufer je Sendepfad**: ein
  `redactToken(token, viewer)` in `server/session/tokens.ts`, benutzt von `broadcastTokens`
  (je Verbindung) und `handleEnter` (für den Betretenden). Der Client bekommt keine Regel
  „was darf ich sehen" — er hat nichts, was er verbergen müsste (§9.2). #62 ändert genau
  diese eine Funktion und ihre Datenbasis, sonst nichts an den Sendepfaden.
- Identität einer Verbindung aus `Presence` (dort seit #6 gebunden), Rolle und Zuweisung
  **bei jedem Senden** frisch aus der Datenbank (§9.3).
- `session:tokens` bleibt das einzige Verteilereignis, `broadcastTokens` die einzige
  Verteilstelle; alle bestehenden Aufrufer bleiben, sie reichen nur `presence` mit.
- Keine bestehende Assertion außerhalb des im Proposal genannten Szenarios bricht.

**Non-Goals:**
- Kein Diff im Canvas; `setTokens` baut weiterhin alle Container neu — Healthbar und
  Markierungen sind Teil des Containers.
- Keine 5e-Regeln auf dem Server (kein Abzug von `tempHp` vor `hp`, kein Deckeln). Auch der
  Client rechnet nur Schaden/Heilung auf `hp`; `tempHp` pflegt der Spielleiter von Hand.
- Keine Reihenfolgegarantie zwischen den `session:tokens` verschiedener Empfänger.

## Decisions

### D1 — Datenmodell

```prisma
model Token {
  // ... bestehende Felder
  hp         Int?
  hpMax      Int?
  tempHp     Int?
  ac         Int?
  initiative Int?
  conditions TokenCondition[]
}

model TokenCondition {
  id       String @id @default(cuid())
  tokenId  String
  label    String
  position Int
  token    Token  @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  @@unique([tokenId, label])
  @@index([tokenId])
}
```
- **Fünf nullable Spalten am Token, kein Werte-Modell**: die Werte sind 1:1 zum Token, ein
  eigenes Modell brächte nur einen Join. `null` ist „nicht gesetzt" (proposal.md); es gibt
  keinen Default außer `null`.
- **Markierungen als Tabelle, nicht als JSON-String**: Prisma kennt auf SQLite kein
  `Json`; ein String mit JSON hieße Parsen an jeder Lesestelle und keine Eindeutigkeit in
  der Datenbank. Die Tabelle erzwingt „je Token eindeutig" per `@@unique`, `position`
  erhält die gesendete Reihenfolge (Muster „Raster als vier Spalten statt JSON", #49 D1).
- **`onDelete: Cascade`**: „Entfernen nimmt die Markierungen mit" ist damit eine
  Eigenschaft des Schemas — der Remove-Handler bleibt unverändert.
- **Migration** per `ALTER TABLE "Token" ADD COLUMN …` (fünfmal, nullable, kein
  Tabellen-Neuaufbau, Muster `20260911130000_add-token-owner`) plus `CREATE TABLE
  "TokenCondition"` mit Fremdschlüssel `ON DELETE CASCADE`, `CREATE UNIQUE INDEX
  "TokenCondition_tokenId_label_key"` und `CREATE INDEX "TokenCondition_tokenId_idx"`.
  Bestehende Zeilen bleiben „keine Werte".

### D2 — Vertrag in `shared/token.ts`

- `TokenSchema` bekommt `hp`, `hpMax`, `tempHp`, `ac`, `initiative` als
  `z.number().int().nullable()` und `conditions: z.array(z.string())`. Flache Felder, kein
  verschachteltes `stats`-Objekt: die Tests und die Fixtures adressieren sie so direkt wie
  `ownerId`, und `null` für „verborgen oder nicht gesetzt" ist ein Feld, kein fehlendes
  Objekt.
- Konstanten: `CONDITION_MAX_LENGTH = 20`, `CONDITIONS_MAX = 12`.
- `ConditionLabelSchema`: `z.string().transform(trim).pipe(min 1, max 20, regex
  /^[^\p{Cc}]+$/u)` — dasselbe Muster wie `name` in `CreateTokenInputSchema`.
- `TokenStatsInputSchema`:
  ```ts
  z.object({
    sessionId: z.string(), tokenId: z.string(),
    hp: z.number().int().min(0).nullable().optional(),
    hpMax: z.number().int().min(1).nullable().optional(),
    tempHp: z.number().int().min(0).nullable().optional(),
    ac: z.number().int().min(0).nullable().optional(),
    initiative: z.number().int().nullable().optional(),
  })
  ```
  `nullable().optional()` in dieser Reihenfolge: fehlend = „unverändert", `null` =
  „löschen" (Muster `ownerId` in `AssignTokenInputSchema`, erweitert um „fehlend"). Die
  Kopplung `hp`/`hpMax` steht **nicht** im Schema — sie hängt vom gespeicherten Stand ab
  (D3), das Schema kennt ihn nicht. `TokenStatsPatch = Omit<TokenStatsInput, 'sessionId' |
  'tokenId'>` für Fassade und Panel.
- `TokenConditionsInputSchema`: `{ sessionId, tokenId, conditions:
  z.array(ConditionLabelSchema).max(CONDITIONS_MAX).refine(alle verschieden) }` — die
  Eindeutigkeit **nach** dem Trimmen, deshalb `refine` auf dem Array, nicht auf dem
  Element.
- Acks `TokenStatsAck`, `TokenConditionsAck` = `{ ok: true; token } | { ok: false; message }`;
  `SESSION_TOKEN_EVENTS.stats = 'session:token-stats'`, `.conditions =
  'session:token-conditions'`.
- Verworfen: *zwei Ereignisse je Markierung (hinzufügen/entfernen)* — zwei Handler, zwei
  Fehlerfälle („schon gesetzt", „nicht gefunden"), und der Client müsste ohnehin die
  aktuelle Liste kennen. Ersetzen ist ein Handler, dieselbe Semantik wie die absoluten
  Werte und wie die Zielgruppe in #62.

### D3 — Server (`server/session/tokens.ts`)

- **`toToken(row)`** nimmt jetzt `PrismaToken & { conditions: TokenCondition[] }` und
  liefert die fünf Werte plus `conditions: row.conditions.map(c => c.label)` (die Zeilen
  kommen nach `position` sortiert, siehe Laden). Jede Stelle, die ein Token lädt oder
  schreibt und danach `toToken` ruft, benutzt `include: { conditions: { orderBy: { position:
  'asc' } } }` — eine Konstante `TOKEN_INCLUDE` dafür.
- **`redactToken(token: Token, viewer: TokenViewer): Token`** mit `TokenViewer = { role:
  MemberRole; userId: string }`: bei `role === 'spielleiter'` oder `token.ownerId ===
  viewer.userId` unverändert, sonst `{ ...token, hp: null, hpMax: null, tempHp: null, ac:
  null, initiative: null, conditions: [] }`. Reine Funktion, keine DB.
- **`loadTokens(prisma, sessionId)`** bleibt (ungefiltert, für den Handler-Ack-Pfad nicht
  nötig, aber für die Verteilung als Ausgangsbasis). Neu **`loadTokensFor(prisma,
  sessionId, viewer)`** = `loadTokens` + `redactToken` je Token — für `handleEnter`.
- **`broadcastTokens(io, prisma, presence, sessionId)`**: (1) `loadTokens`; (2)
  `presence.entriesIn(sessionId)` → `[{ userId, socketId }]`; (3) **eine**
  `membership.findMany({ where: { sessionId } })` → `Map<userId, role>`; (4) je Eintrag mit
  bekannter Mitgliedschaft `io.to(socketId).emit(SESSION_TOKEN_EVENTS.tokens, { sessionId,
  tokens: tokens.map(t => redactToken(t, viewer)) })`. Ein Eintrag ohne Mitgliedschaft
  bekommt nichts (er könnte nur zwischen Betreten und jetzt entfernt worden sein — dann ist
  „nichts" richtig). `emitTokens` entfällt; kein Aufrufer außer `broadcastTokens` hatte es.
  - Identität aus `Presence`, nicht aus `socket.data`: dort ist sie seit #6 gebunden und
    dort wird sie bei Übernahme/Trennung gepflegt. Rolle und `ownerId` kommen aus der
    Datenbank **jetzt** (§9.3).
  - Verworfen: *Rolle in `socket.data` beim Betreten merken* — eine beim Verbindungsaufbau
    erteilte Erlaubnis, genau das, was §9.3 ausschließt. *Je Empfänger `authorizeAction`* —
    löst die Anmelde-Sitzung je Socket neu auf, für die Rolle reicht die Mitgliedschaft.
- **`Presence.entriesIn(sessionId): Array<{ userId: string; socketId: string }>`** neben
  `socketsIn` — dieselbe Map, nur mit Schlüssel.
- **`session:token-stats`** (`handleTokenStats`): zod-Parse → `authorizeAction(…, { role:
  'spielleiter' })` → Token der aktiven Instanz laden (`TOKEN_NOT_FOUND_MESSAGE`) → merged
  = für jedes der fünf Felder `input[k] === undefined ? existing[k] : input[k]` → wenn
  `(merged.hp === null) !== (merged.hpMax === null)` oder (beide gesetzt und `merged.hp >
  merged.hpMax`) → `INVALID_HP_MESSAGE = 'Ungültige Trefferpunkte.'`, Rückkehr vor jedem
  Schreiben → `token.update({ where, data: merged, include: TOKEN_INCLUDE })` →
  `broadcastTokens` → `{ ok: true, token: toToken(updated) }`. Das Ack ist ungefiltert —
  Empfänger ist der Spielleiter.
- **`session:token-conditions`** (`handleTokenConditions`): zod-Parse → `authorizeAction`
  Rolle `spielleiter` → Token laden → `prisma.$transaction([ tokenCondition.deleteMany({
  where: { tokenId } }), tokenCondition.createMany({ data: labels.map((label, position) =>
  ({ tokenId, label, position })) }) ])` (Prisma 6 unterstützt `createMany` auf SQLite;
  AGENTS.md: mehrschrittige Schreibvorgänge in eine Transaktion) → Token mit
  `TOKEN_INCLUDE` neu laden → `broadcastTokens` → `{ ok: true, token }`.
- `create`, `move`, `remove`, `assign` unverändert bis auf `TOKEN_INCLUDE` an den
  Lade-/Schreibstellen, deren Ergebnis durch `toToken` geht, und `presence` im
  `broadcastTokens`-Aufruf. `TokenSocketDeps` bekommt `presence: Presence`.

### D4 — Aufrufer der Verteilung

- `session/socket.ts`: `registerTokenHandlers(io, socket, { prisma, clock, presence })`;
  `handleActivateMap` ruft `broadcastTokens(io, prisma, presence, sessionId)`;
  `handleEnter` legt `loadTokensFor(prisma, sessionId, { role, userId: user.id })` ins
  Acknowledgement — `role` ist dort bereits geparst.
- `session/maps.ts`: `SessionMapRoutesDeps` bekommt `presence` (aus `registerSessionRoutes`
  durchgereicht, das es seit #6 hat); der Aufruf beim Aushängen reicht es weiter.

### D5 — Client-Fassade (`client/session/socket.ts`)

`setTokenStats(sessionId, tokenId, patch: TokenStatsPatch): Promise<TokenStatsAck>` — emit
`SESSION_TOKEN_EVENTS.stats` mit `{ sessionId, tokenId, ...patch }` (nur die im Patch
vorhandenen Schlüssel; der Schaden-Pfad schickt genau `{ hp }`);
`setTokenConditions(sessionId, tokenId, conditions: string[]): Promise<TokenConditionsAck>`
— emit `SESSION_TOKEN_EVENTS.conditions`. Kein neues Server→Client-Ereignis.

### D6 — Katalog (`client/session/conditions.ts`)

`CONDITION_CATALOG: ReadonlyArray<{ label: string; symbol: string }>` mit den 15
5e-Zuständen in dieser Reihenfolge und Schreibweise: Blind 🙈, Bezaubert 💞, Taub 🙉,
Erschöpft 😩, Verängstigt 😱, Gepackt ✊, Kampfunfähig 💫, Unsichtbar 👻, Gelähmt ⚡,
Versteinert 🗿, Vergiftet ☠️, Liegend ⬇️, Festgehalten ⛓️, Betäubt 🌀, Bewusstlos 😴.
`conditionSymbol(label): string` liefert das Katalogsymbol oder die ersten zwei Zeichen des
Texts in Großbuchstaben. Reine Client-Konstante ohne Pixi-Import — `canvas.ts` und
`TokenPanel` importieren sie. Der Server kennt sie nicht (proposal.md).

### D7 — Canvas (`client/map/canvas.ts`)

In `buildTokenContainer`, nach dem Ring:
- **Healthbar**, nur wenn `token.hp !== null && token.hpMax !== null`: ein `Graphics`
  unter dem Namen (bei `radius + TOKEN_NAME_GAP + TOKEN_NAME_FONT_SIZE + 2`), Breite
  `2 * radius`, Höhe `TOKEN_BAR_HEIGHT = 5`: dunkler Hintergrund, darüber der Anteil
  `hp / hpMax` (grün ≥ 50 %, gelb ≥ 25 %, sonst rot), darüber — falls `tempHp` gesetzt und
  > 0 — ein Abschnitt in Blau mit Breite `min(tempHp, hpMax) / hpMax`, am linken Rand
  beginnend, halbe Höhe. Konstanten `TOKEN_BAR_*`.
- **Markierungen**, nur wenn `conditions.length > 0`: bis zu drei `Text`-Objekte mit
  `conditionSymbol(label)` in `TOKEN_NAME_FONT_SIZE`, entlang des oberen Rands (`y = -radius
  - TOKEN_NAME_GAP`, `x` zentriert um 0 mit Abstand `TOKEN_NAME_FONT_SIZE + 2`); bei mehr als
  drei ersetzt das dritte ein `+N` mit `N = conditions.length - 2`.
- Keine neuen Optionen in `MapCanvasOptions`; `drawTokens` baut wie bisher alles neu, eine
  Werteänderung wirkt mit dem nächsten `setTokens`. Aussehen: App-Test. Kein Test hängt
  daran; kein Test importiert `pixi.js`.

### D8 — Werte als Text (`client/session/TokenStats.tsx`)

- `TokenStatsText({ token })`: rendert je nicht-`null`-Wert genau einen `<span>` mit dem
  Text `HP ${hp}/${hpMax}` (nur wenn beide gesetzt), `Temp ${tempHp}`, `RK ${ac}`, `Ini
  ${initiative}`, und bei Markierungen eine `<ul>` mit `<li>{label}</li>` in gespeicherter
  Reihenfolge. Nichts sonst — kein Präfix, kein Doppelpunkt (die Szenarien prüfen den
  genauen Text).
- `PlayerTokenList({ tokens })`: `<h2>Tokenwerte</h2>` und eine `<ul>` mit je Token
  `<li><span>{name}</span><TokenStatsText token /></li>`. Wird in `SessionRoom` für
  `role === 'spieler'` gerendert; der Spielleiter bekommt `TokenStatsText` innerhalb von
  `TokenPanel` (D9). Überschrift bewusst **nicht** `Tokens` — das bestehende Szenario
  „Spieler sieht keine Token-Verwaltung" verbietet diese Überschrift beim Spieler.

### D9 — Token-Verwaltung (`client/session/TokenPanel.tsx`)

Neue Props `onSetStats(tokenId, patch: TokenStatsPatch)`, `onSetConditions(tokenId,
conditions: string[])`. Je Token in der Liste, zusätzlich zu Entfernen und Zuweisen, eine
eigene Zeilenkomponente `TokenRow` (damit Formularzustand je Token lokal ist):
- **Wertefelder**: fünf `<input type="number">` mit `name` `hp`, `hpMax`, `tempHp`, `ac`,
  `initiative`, vorbelegt aus dem Token (`''` für `null`) und bei geändertem Bestand neu
  vorbelegt — am einfachsten ein `key` der Zeile aus den fünf Werten, sodass React sie neu
  aufsetzt, ohne dass eine Bewegung (andere Felder) den Formularzustand verwirft. Die
  Schaltfläche `Werte speichern` sendet `onSetStats(token.id, { hp, hpMax, tempHp, ac,
  initiative })` mit **allen fünf** Schlüsseln, leeres Feld → `null`, sonst `Number(...)`.
- **Schaden/Heilung**: ein `<input type="number" name="delta">`; `Schaden` sendet
  `onSetStats(token.id, { hp: Math.max(0, hp - n) })`, `Heilung` `{ hp: Math.min(hpMax, hp
  + n) }` — genau ein Schlüssel; wenn `token.hp === null`, `token.hpMax === null` oder `n`
  keine positive ganze Zahl ist, passiert nichts (kein Aufruf, keine Meldung — das Feld
  ist dann sichtbar leer bzw. das Token hat sichtbar keine HP).
- **Markierungen**: `<select name="conditionPick">` mit erster `<option value="">`
  `Markierung wählen` und je Katalogeintrag `<option value={label}>{label}</option>`
  (Symbol nicht im Optionstext — der Test adressiert den Eintrag über seinen Text);
  `onChange` mit nicht-leerem Wert und Wert nicht in `token.conditions` → `onSetConditions(
  token.id, [...token.conditions, label])`, danach Wert zurück auf `''`. Ein `<input
  name="condition">` plus Schaltfläche `Markierung hinzufügen`: getrimmter Text, nicht leer,
  nicht bereits enthalten → `[...token.conditions, text]`, Feld leeren. Je Markierung eine
  Schaltfläche `Entfernen` mit `aria-label` `<Name> Markierung <Label> entfernen` →
  Liste ohne diesen Eintrag. Die angezeigte Liste ist `token.conditions` vom Server
  (`TokenStatsText`, D8), nie ein lokaler Zwischenstand.
- Die Wertefelder liegen **nicht** im Anlege-`<form>` (das bestehende Szenario schickt es
  mit `Anlegen` ab); je Zeile ein eigenes `<form onSubmit>` für „Werte speichern" oder
  `type="button"` überall — Implementierungsfreiheit, solange `Anlegen` nur das
  Anlegeformular abschickt.

**Schnittstelle** (Adressen für Test und Implementierung, Layout frei) — ergänzt die Tabellen
aus #14 D7 und #15 D7, die unverändert gelten:

| Element | Beschriftung / Attribut |
|---|---|
| Wertefeld je Token | `<input type="number" name="hp">` mit `aria-label` genau `<Name> HP`; ebenso `hpMax` → `<Name> HP-Maximum`, `tempHp` → `<Name> Temp-HP`, `ac` → `<Name> RK`, `initiative` → `<Name> Initiative`; `value` = Wert oder `''` |
| Werte speichern | `<button>` mit `aria-label` genau `<Name> Werte speichern` |
| Änderung | `<input type="number" name="delta">` mit `aria-label` genau `<Name> Änderung` |
| Schaden / Heilung | `<button type="button">` mit `aria-label` genau `<Name> Schaden` bzw. `<Name> Heilung` |
| Schnellwahl | `<select name="conditionPick">` mit `aria-label` genau `<Name> Markierung wählen`; erste `<option value="">` `Markierung wählen`, danach je Katalogeintrag eine `<option value="<Label>">` mit Text `<Label>` |
| Freie Markierung | `<input name="condition">` mit `aria-label` genau `<Name> Markierung`; `<button>` mit `aria-label` genau `<Name> Markierung hinzufügen` |
| Markierung entfernen | je Eintrag `<button type="button">` mit `aria-label` genau `<Name> Markierung <Label> entfernen` |
| Werte als Text (jede Rolle) | `<span>` mit genau `HP <hp>/<hpMax>`, `Temp <tempHp>`, `RK <ac>`, `Ini <initiative>`; Markierungen als `<li>` mit genau `<Label>` |
| Spielerliste | `<h2>` genau `Tokenwerte`, je Token `<li>` mit `<span>` Name und den Werte-Texten |
| Meldung abgelehnter Token-Aktionen | unverändert `<p role="alert">` in der Raumansicht |

### D10 — Raumansicht (`client/session/SessionRoom.tsx`)

- `handleTokenStats(tokenId, patch)` → `socket.setTokenStats(sessionId, tokenId, patch)`;
  `handleTokenConditions(tokenId, conditions)` → `socket.setTokenConditions(…)`; beide
  setzen `tokenError` wie die übrigen Handler (bei `ok: true` auf `null`). Keine lokale
  Änderung des Bestands (§9.1).
- `TokenPanel` bekommt `onSetStats` und `onSetConditions`; für `role === 'spieler'` wird
  `<PlayerTokenList tokens={state.tokens} />` an der Stelle gerendert, an der der
  Spielleiter `TokenPanel` sieht.

### D11 — Testaufbau

- **Socket-Szenarien** wie in #15 D8 (echte Socket.IO-Clients, Aufbau über Routen und
  direkte DB-Anlage). Der Helfer `createTokenDirect` bekommt optionale Werte (`hp`,
  `hpMax`, `tempHp`, `ac`, `initiative`) und optionale `conditions` (angelegt als
  `TokenCondition`-Zeilen mit `position`). Die Sichtbarkeits-Szenarien lesen die
  `session:tokens` beider Verbindungen; „Derselbe Bestand erreicht Spielleiter und Spieler
  unterschiedlich" zählt je Verbindung genau zwei Ereignisse. „erhält kein
  `session:tokens`" wie bisher als kurze Wartezeit ohne Ereignis.
- **Komponententests**: Fixtures `GOBLIN`/`ORK` (Typ `Token`) bekommen `hp: null, hpMax:
  null, tempHp: null, ac: null, initiative: null, conditions: []`; die neuen Szenarien
  spreaden sie mit Werten. Socket-Fassaden-Mock um aufzeichnende `setTokenStats` und
  `setTokenConditions` erweitern. Elemente nach der Schnittstellentabelle in D9 über
  Testing-Library-Abfragen (`getByRole('spinbutton', { name })`, `getByRole('button', {
  name })`, `getByRole('combobox', { name })`, `getByRole('heading', { name })`,
  `getByText` mit genauem Text), Eingaben per Change-Ereignis, keine `must()`-Helfer mit
  Kurzmeldung — die DOM-Ausgabe der Testing Library ist das Gate-Feedback des implementers.
  „Spieler sieht ohne Werte keine Werte" prüft mit `queryByText(/^(HP|Temp|RK|Ini)/)`
  auf `null`.
- Ein bestehendes Szenario wird um Assertions erweitert („Spieler sieht keine
  Token-Verwaltung"); kein Szenario ändert seine Aussage.
- Kein Test importiert `pixi.js`; Healthbar und Markierungssymbole nimmt der App-Test ab.

## Risks / Trade-offs

- **Ein Sendepfad vergisst die Filterung** (z. B. ein späterer Handler ruft `emitTokens`)
  → `emitTokens` wird entfernt; `broadcastTokens` ist die einzige Verteilstelle, und sie
  filtert. Der Ack einer Spielleiter-Aktion ist ungefiltert, aber nur ein Spielleiter kommt
  an diesen Pfad (`authorizeAction` Rolle `spielleiter` vor jedem `toToken`).
- **Ein Spieler-Ack verrät Werte** → die einzigen Acks mit Tokendarstellung für Spieler
  sind `session:token-move` (`{ ok: true, token }`) und `session:enter`. `handleMoveToken`
  antwortet mit dem aktualisierten Token — ein Spieler bewegt nur eigene Tokens
  (`canMoveToken`), deren Werte er ohnehin sieht. Zur Sicherheit filtert `handleMoveToken`
  das Ack trotzdem mit `redactToken` für den Absender; für den Spielleiter ist das ein
  No-op.
- **Zwei `session:tokens` je Aktion statt einem** → je Verbindung eines; die Anzahl der
  Ereignisse pro Empfänger bleibt eins pro Aktion. Die Szenarien zählen genau das.
- **`createMany` auf SQLite** → Prisma 6 unterstützt es; sollte `pnpm db:generate` es
  verweigern, einzelne `create`-Aufrufe in derselben Transaktion (D3), gleiches Verhalten.
- **`getByText('HP 23/40')` trifft auch ein Label?** → die Labels sind `aria-label`, kein
  sichtbarer Text; sichtbare Texte mit `HP` gibt es nur in `TokenStatsText`.
- **Spieler tippt einen Tokennamen, der mit `HP` beginnt** → das Szenario „ohne Werte keine
  Werte" nutzt `Ork`; die Regex im Test prüft nur Werte-Spans, nicht Namen, wenn der Test
  die Spans innerhalb der Zeile abfragt. Hinweis im Testaufbau.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte.

## Migration Plan

`prisma/schema.prisma` bekommt die fünf Spalten an `Token` und das Modell
`TokenCondition`; die Migrations-SQL fügt nullable Spalten und eine Tabelle mit
Fremdschlüssel und Indizes hinzu, fasst nichts Bestehendes an (D1). Agent nur gegen die
Wegwerf-DB; Entwicklungs-DB der Mensch, produktiv die CI (§5.1, §6.1). Rollback: Spalten
und Tabelle sind neu, kein Code außerhalb dieses Change liest sie.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Ob die Healthbar für Spieler auch bei
fremden Tokens eine grobe Stufe zeigen soll, ist mit dem Menschen entschieden (nein — `null`,
proposal.md) und wird in #62 durch das Teilen abgelöst.
