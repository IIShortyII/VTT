## Context

Vorhanden aus #50: `MapInstance` als Anker mit eigener Identität, `GameSession.activeInstanceId`
als einziger Zeiger auf die aktive Karte, `loadActiveMap`/`emitActiveMap` in
`server/session/active-map.ts`, Socket-Handler nach dem Muster zod-Parse →
`authorizeAction(…, { role: 'spielleiter' })` → Laden mit `sessionId` in der `where`-Klausel
→ Schreiben → Broadcast → Acknowledgement, Client-Fassade `client/session/socket.ts` als
Mock-Grenze, `SessionRoom` mit Zustand aus Enter-Ack und Server-Ereignissen, `MapPanel` als
Spielleiter-Verwaltung. Vorhanden aus #49: `shared/grid.ts` mit `cellCenter`/`cellAt`
(ausdrücklich für das Einrasten in #8 gebaut), `client/map/canvas.ts` als einzige Datei mit
`pixi.js`-Import (Mock-Grenze der Komponententests), `MapCanvas` als dünner React-Rahmen.

Die Entscheidungen „Position in Zellen", „Farbe + Name + Symbol aus Katalog", „Größe 1–4",
„kein Bild-Upload", „kein Spieler/NPC-Unterschied im Modell" sind mit dem Menschen gefallen
(2026-09-11, proposal.md). Verhalten: `specs/session-token/spec.md`. Bindend und nicht
wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- Tokens hängen an der Instanz, nicht an der Spielsitzung: ein Kartenwechsel behält sie,
  ein Aushängen nimmt sie mit (Cascade), #17 kann sie später pro Empfänger filtern.
- Genau eine Stelle, die den Tokenbestand lädt und verteilt — benutzt von den drei
  Token-Handlern, vom Aktivieren, vom Aushängen und vom Betreten.
- Alle Token-Aktionen nur auf der aktiven Instanz; „nicht aktiv", „fremde Sitzung" und
  „unbekannt" sind vom Server aus dieselbe Antwort.
- Keine bestehende Assertion bricht: `EnterAck` und `session:map` bleiben, `tokens` kommt
  als Feld bzw. als eigenes Ereignis hinzu.

**Non-Goals:**
- Kein Editieren bestehender Tokens (Name/Farbe/Größe) — proposal.md „Nicht im Umfang".
- Kein optimistisches Verschieben im Client; das Token springt mit dem Bestand vom Server.
- Keine Kartenrand- oder Kollisionsprüfung.

## Decisions

### D1 — Datenmodell

```prisma
model Token {
  id         String      @id @default(cuid())
  instanceId String
  name       String
  color      String
  icon       String?
  size       Int
  col        Int
  row        Int
  createdAt  DateTime    @default(now())
  instance   MapInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  @@index([instanceId])
}
```
`MapInstance` bekommt die Gegenrelation `tokens Token[]`.
- **Instanz statt Spielsitzung als Elternteil**: die Instanz ist genau der Anker, den #50
  dafür gebaut hat („an dem Tokens (#8) und Fog (#9) später hängen"). Tokens auf Karte A
  bleiben liegen, während B aktiv ist.
- **`onDelete: Cascade`**: Aushängen löscht die Tokens; die Route in `maps.ts` braucht keine
  eigene Löschung, nur den anschließenden leeren Bestand an den Raum (Spec „Aushängen löscht
  die Tokens der Instanz" prüft die Zählung, nicht den Weg).
- **Zelle als zwei `Int`-Spalten** (`col`, `row`), keine Pixel: Einrasten ist damit eine
  Eigenschaft des Modells, nicht des Clients. Der Client rechnet Pixel ↔ Zelle mit
  `cellAt`/`cellCenter` aus `shared/grid.ts`.
- **`icon String?`**: gespeichert wird der Katalogeintrag selbst (das Emoji), geprüft durch
  das zod-Enum aus `shared/token.ts` — ein Schlüsselwort pro Symbol wäre eine zweite Tabelle
  für nichts.
- **Migration** von Hand nach dem Muster der bestehenden: Tabelle mit Fremdschlüssel
  `ON DELETE CASCADE`, Index auf `instanceId`.

### D2 — Alles über den Socket

Anlegen, Bewegen und Entfernen sind Raumaktionen mit Broadcast — genau der Fall, für den #6
D3 und #50 D2 den Socket vorsehen (`session:activate-map`). Eine Liste per REST gibt es
nicht: der Bestand kommt mit dem Enter-Ack und mit jedem `session:tokens`; der Spielleiter
hat damit dieselbe Quelle wie die Spieler.

Drei Ereignisse (`SESSION_TOKEN_EVENTS` in `shared/token.ts`): `create` →
`session:token-create`, `move` → `session:token-move`, `remove` → `session:token-remove`,
`tokens` → `session:tokens`. Reihenfolge in jedem Handler: zod-Parse (`INVALID_PAYLOAD_MESSAGE`
wie bisher) → `authorizeAction(…, { role: 'spielleiter' })` → aktive Instanz aus
`gameSession.activeInstanceId` (Anlegen: `null` → `Keine Karte aktiv.`) → Token laden mit
`{ id: tokenId, instanceId: activeInstanceId }` (Bewegen/Entfernen: kein Treffer →
`Token nicht gefunden.`; ohne aktive Karte ist `instanceId` `null`, also ebenfalls kein
Treffer und dieselbe Meldung) → Schreiben → `broadcastTokens` → Acknowledgement.

Verworfen: *Bestand in die Aktive-Karte-Darstellung einbetten* — dann müsste jede
Token-Bewegung `session:map` neu senden und `MapCanvas` das Raster neu zeichnen; und #17
(Filterung pro Empfänger) hätte ein anderes Objekt zu filtern als das, das es betrifft.

### D3 — Eine Stelle für den Bestand (`server/session/tokens.ts`)

- `toToken(row)`: Prisma-Zeile → Tokendarstellung (`icon` `null` bleibt `null`).
- `loadTokens(prisma, sessionId)`: Spielsitzung lesen; ohne `activeInstanceId` `[]`, sonst
  `token.findMany({ where: { instanceId }, orderBy: { createdAt: 'asc' } })` → Darstellungen.
- `emitTokens(io, sessionId, tokens)`: `session:tokens` an `roomName(sessionId)`.
- `broadcastTokens(io, prisma, sessionId)`: `loadTokens` + `emitTokens`.
- `registerTokenHandlers(io, socket, deps)`: die drei Handler; aus `socket.ts` in der
  `connection`-Registrierung aufgerufen, damit `socket.ts` nicht weiter wächst.

Aufrufer von `broadcastTokens`: die drei Handler; `handleActivateMap` **nach**
`emitActiveMap` (Reihenfolge auf der Leitung: erst `session:map`, dann `session:tokens` —
Socket.IO hält die Reihenfolge je Verbindung); `DELETE …/maps/:instanceId` nach
`emitActiveMap(io, id, null)` (dann ist `loadTokens` leer). `session:enter` ruft `loadTokens`
für das Feld `tokens`. `broadcastMapChanged` (Rasteränderung) bleibt ohne Tokens — die
Instanz ist dieselbe, der Bestand unverändert.

### D4 — Gemeinsamer Vertrag (`shared/token.ts`)

- `TOKEN_ICONS` als `as const`-Tupel der zehn Emoji aus der Spec, `TokenIconSchema =
  z.enum(TOKEN_ICONS)`, `TOKEN_SIZE_MIN = 1`, `TOKEN_SIZE_MAX = 4`, `TOKEN_NAME_MAX_LENGTH =
  40`.
- `TokenSchema` (`id`, `instanceId`, `name`, `color`, `icon: TokenIconSchema.nullable()`,
  `size`, `col`, `row`).
- `CreateTokenInputSchema`: `sessionId`; `name` getrimmt, 1–40 Zeichen, keine Steuerzeichen
  (Muster `AliasInputSchema` aus `session.ts`, Meldungen `Der Name muss mindestens 1 Zeichen
  lang sein.` / `… darf höchstens 40 Zeichen lang sein.` / `Der Name darf keine
  Steuerzeichen enthalten.`); `color` `z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Die Farbe muss
  ein Hex-Wert wie #3366ff sein.')`, gespeichert in Kleinschreibung (`transform`); `icon`
  `TokenIconSchema.nullable()` (nullable, nicht optional — wie `instanceId` in #50 D5);
  `size` `z.number().int().min(1).max(4)`; `col`, `row` `z.number().int()` — kein Bereich
  (Spec „Zelle": negative Werte zulässig).
- `MoveTokenInputSchema` (`sessionId`, `tokenId`, `col`, `row`), `RemoveTokenInputSchema`
  (`sessionId`, `tokenId`).
- Typen `CreateTokenAck`, `MoveTokenAck` (`{ ok: true; token }`), `RemoveTokenAck`
  (`{ ok: true }`), `TokensEvent` (`{ sessionId, tokens }`); `SESSION_TOKEN_EVENTS`.
- `shared/session.ts`: `EnterAck` bekommt `tokens: Token[]` — Import aus `token.ts`; keine
  Zirkularität (`token.ts` importiert nur `zod`).
- Kein serverseitiger Import.

### D5 — Client-Fassade und Raumzustand

**Fassade** (`client/session/socket.ts`): `createToken(input: Omit<CreateTokenInput,
'sessionId'> & { sessionId })` — konkret `createToken(sessionId, { name, color, icon, size,
col, row })`, `moveToken(sessionId, tokenId, cell)`, `removeToken(sessionId, tokenId)`, je
mit Acknowledgement; `on('tokens', handler)` für `session:tokens` (in `wireEventFor`
ergänzen).

**`SessionRoom`**: `RoomState.bereit` bekommt `tokens: Token[]` aus dem Enter-Ack;
`socket.on('tokens', ({ tokens }) => …)` ersetzt die Liste. Auf `map` wird `tokens` **nicht**
angefasst — der Server schickt den passenden Bestand unmittelbar danach (D3); ein lokales
Leeren erzeugte nur ein Flackern. `MapCanvas` bekommt `tokens={state.tokens}` und, nur bei
`role === 'spielleiter'`, `onTokenMove={(tokenId, cell) => socket.moveToken(sessionId,
tokenId, cell)}`; ein abgelehntes Acknowledgement landet in derselben Meldung wie die der
Token-Verwaltung (`tokenError`). Bei Rolle `spielleiter` zusätzlich `TokenPanel`.

### D6 — Tokenebene im Canvas (`client/map/canvas.ts`, `MapCanvas.tsx`)

- `MapCanvasOptions` bekommt `tokens: Token[]` und `onTokenMove?: (tokenId: string, cell:
  Cell) => void`; `MapCanvasHandle` bekommt `setTokens(tokens: Token[])`. `MapCanvas`-Props
  entsprechend; ein Effekt auf `[tokens]` ruft `setTokens`. `onTokenMove` wird nur beim
  Erzeugen übergeben (Spieler: `undefined` → kein Ziehen), wie `imageUrl`/`grid` beim
  ersten Mount; eine Änderung des Rückrufs nach dem Mount muss nicht wirken (die Rolle
  ändert sich im Raum nicht).
- Zeichnung: ein `Container` `tokenLayer` über dem Raster; je Token ein `Container` mit
  `Graphics`-Kreis (Füllung `color`, weißer Rand) und einem `Text` (Symbol, sonst erster
  Buchstabe des Namens; darunter der Name in kleiner Schrift). Mittelpunkt: `cellCenter(grid,
  { col, row })` — bei `quadrat` und `size > 1` verschoben um `(size − 1) · grid.size / 2` je
  Achse (Ankerzelle oben links, Token deckt `size × size` Zellen); bei Hex bleibt der
  Mittelpunkt auf der Ankerzelle. Radius `size · grid.size / 2 · 0.9`. `setGrid` zeichnet
  Tokens neu (Mittelpunkte hängen am Raster). `setTokens` zerstört die alten
  Token-Container (`destroy({ children: true })`) und baut neu — bei den Zahlen eines VTT
  billiger als ein Diff, und es gibt keine Textur, die zu cachen wäre.
- Ziehen (nur mit `onTokenMove`): `pointerdown` auf einem Token-Container (`eventMode =
  'static'`) merkt sich `dragTokenId` und **stoppt die Propagation**, damit die Bühne nicht
  schwenkt; `pointermove` verschiebt nur den Container (Vorschau); `pointerup` rechnet
  `root.toLocal(event.global)` → `cellAt(grid, point)` und ruft `onTokenMove(tokenId, cell)`,
  dann setzt es den Container auf seine gespeicherte Zelle zurück — die neue Position kommt
  mit `setTokens` vom Server (§9.1). `destroy()` räumt `tokenLayer` mit.
- `pixi.js`-Import bleibt auf diese Datei beschränkt; `Text` kommt aus `pixi.js` wie
  `Graphics`.

### D7 — Token-Verwaltung (`client/session/TokenPanel.tsx`)

Props: `sessionId`, `tokens`, `onCreate(input)`, `onRemove(tokenId)`, `error: string | null`.
Kein eigener Ladepfad — der Bestand kommt vom Raum. Formularfelder mit
`<label>`, kontrollierte Eingaben, Vorgabewerte: Farbe `#3366ff`, Symbol „Kein Symbol",
Größe `1`, Spalte `0`, Zeile `0`. Beim Absenden: `icon` `''` → `null`, `size`/`col`/`row`
per `Number(...)`; die zod-Prüfung macht der Server (die Fassade schickt die Absicht;
ungültige Werte kommen als Meldung zurück). Nach `ok: true` wird das Namensfeld geleert,
die übrigen Felder bleiben.

**Schnittstelle** (Adressen für Test und Implementierung, Layout frei):

| Element | Beschriftung / Attribut |
|---|---|
| Überschrift der Verwaltung | `Tokens` |
| Name | `<input name="name">` mit `<label>` `Name` |
| Farbe | `<input type="color" name="color">` mit `<label>` `Farbe` |
| Symbol | `<select name="icon">` mit `<label>` `Symbol`; erste `<option value="">` `Kein Symbol`, dann je Katalogeintrag eine `<option>` mit `value` = Text = Emoji |
| Größe | `<select name="size">` mit `<label>` `Größe`; `<option>` `1`…`4`, Text `1×1` … `4×4` |
| Spalte | `<input type="number" name="col">` mit `<label>` `Spalte` |
| Zeile | `<input type="number" name="row">` mit `<label>` `Zeile` |
| Anlegen | `<button type="submit">` `Anlegen` |
| Liste der Tokens | `<ul>`, je Token ein `<li>` mit dem Namen als eigenem `<span>` |
| Entfernen je Token | `<button>` mit sichtbarem Text `Entfernen` und `aria-label` genau `<Name> entfernen` |
| Fehlermeldungen | `<p role="alert">` mit der Meldung des Servers |

Keine Rollenwörter als sichtbarer Text (Teilstring-Falle aus #45). `Tokens` als Überschrift
kollidiert nicht mit `Karten` aus `MapPanel`.

### D8 — Testaufbau

- **Socket-Szenarien**: echte Socket.IO-Clients gegen die lauschende App wie in #50;
  Spielsitzung, Mitgliedschaft, Karten und Instanzen über die bestehenden Routen
  (`POST /api/sessions`, `POST /api/sessions/join`, `POST /api/maps`,
  `POST /api/sessions/:id/maps`), Aktivieren per `session:activate-map`; Tokens für GIVEN
  per `session:token-create` als Spielleiter (oder direkt in der DB mit `instanceId`).
  „erhält kein `session:tokens`" als kurze Wartezeit ohne Ereignis. „Serverneustart": zweite
  App mit `buildApp` gegen denselben Prisma-Client nach `close()` der ersten.
- **Komponententests**: jsdom-Docblock; Socket-Fassade gemockt mit aufzeichnenden
  `createToken`/`moveToken`/`removeToken` und von außen auslösbarem `tokens`-Handler;
  Canvas-Fassade über den auflösbaren Pfad mit `.js`-Endung gemockt — `createMapCanvas` als
  `jest.fn`, das `options` (inkl. `tokens`, `onTokenMove`) aufzeichnet und ein Handle mit
  `setGrid`/`setImage`/`setTokens`/`destroy` als `jest.fn` liefert; Elemente über
  `getByRole`/`getByLabelText`/`getByText`.
- Kein Test importiert `pixi.js`; Zeichnung und Ziehen nimmt der App-Test ab.

## Risks / Trade-offs

- **Emoji-Rendering in PixiJS `Text`** → Canvas-Textrendering des Browsers zeichnet Emoji
  über die Systemschrift; auf Systemen ohne Farb-Emoji-Font erscheint ein Schwarzweiß-Glyph.
  Rückfall bleibt die Initiale. Kein Test hängt daran.
- **Ziehen vs. Schwenken** → `stopPropagation` am Token-Container; der Bühnen-Handler sieht
  das `pointerdown` nicht. Sollte Pixi 8 das Ereignis trotzdem an die Bühne liefern, prüft
  der Bühnen-Handler `dragTokenId !== null` und bleibt still.
- **Kein optimistisches Verschieben** → bei langsamer Verbindung springt das Token zurück und
  dann ans Ziel. Bewusst (§9.1); die Vorschau während des Ziehens reicht.
- **Volle Liste je Änderung** → bei hunderten Tokens wächst der Verkehr; für ein VTT mit
  Dutzenden Tokens unerheblich, und #17 braucht ohnehin die volle Liste pro Empfänger.
- **`setTokens` baut alle Container neu** → bei jeder Bewegung; Dutzende `Graphics` sind
  kein Problem. Ein Diff kommt, wenn Profiling ihn verlangt.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte.

## Migration Plan

`prisma/schema.prisma` bekommt `Token` und die Gegenrelation an `MapInstance`; die
Migrations-SQL legt eine Tabelle mit Fremdschlüssel und einen Index an, fasst nichts
Bestehendes an. Agent nur gegen die Wegwerf-DB; Entwicklungs-DB der Mensch, produktiv die CI
(§5.1, §6.1). Rollback: Tabelle ist neu, nichts hängt daran.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Ob ein Token nachträglich editierbar sein
muss, entscheidet der erste Spielabend.
