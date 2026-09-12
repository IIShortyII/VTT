## Context

Vorhanden: `MapInstance` als Verweis einer Spielsitzung auf eine Bibliothekskarte (#50),
`GameSession.activeInstanceId` als Zeiger auf die aktive Karte, `loadActiveMap`/
`emitActiveMap` in `server/session/active-map.ts`, das Enter-Ack mit `map` und `tokens`,
`broadcastTokens` als Muster für „je Verbindung gefiltert" (#61: `presence.entriesIn`,
Rolle aus der **jetzt** geladenen Mitgliedschaft), `authorizeAction` mit Rollenanforderung,
die Rastergeometrie in `shared/grid.ts` (`cellAt`, `cellCorners`, `cellRange` — pure, ohne
Pixi), die Bildablage in `server/map/storage.ts` (Dateiname `<mapId>-<token>.<ext>`, nie
vom Client), die Bildroute `GET /api/maps/:id/image` mit `findViewableMap` (Besitzer oder
Mitglied einer Spielsitzung mit dieser Karte aktiv), die PixiJS-Fassade
`client/map/canvas.ts` (einziger Pixi-Import, Mock-Grenze der Komponententests; Ebenen:
Sprite, Rastergrafik, Tokenebene; Schwenken/Zoomen auf der Bühne; Token-Ziehen mit
`stopPropagation`), `MapCanvas.tsx` (dynamischer Import der Fassade, Props → Handle-Methoden,
tolerante Aufrufe für Mocks aus älteren Changes) und `SessionRoom.tsx` (ein Handler je
Absicht, ein `<p role="alert">` je Fehlerquelle).

Die drei Entscheidungen der Explore-Runde stehen in proposal.md: aufgedeckte Zellen als
Datenmodell, Bereiche **und** Ad-hoc-Werkzeug, serverseitig maskiertes Bild mit `sharp`.
Verhalten: `specs/session-fog/spec.md` (neu) plus zwei MODIFIED-Deltas. Bindend und nicht
wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Die Zellmenge ist die einzige Wahrheit.** `FogCell` je Instanz entscheidet, was
  aufgedeckt ist; Bereiche sind gespeicherte Auswahlen darauf, ihr `revealed` ist abgeleitet.
  Kein zweiter Zustand, der mit dem ersten kollidieren könnte.
- **Ein Filter, eine Stelle:** `redactFog(fog, role)` im gemeinsamen Vertrag, benutzt von
  jedem Sendepfad (Enter-Ack, `broadcastFog`, Acks). Spieler bekommen `areas: null`.
- **Das Bild verlässt den Server für Spieler maskiert** — gerendert aus derselben Zellmenge
  und derselben Geometrie (`cellCorners`), die der Client zum Zeichnen der Fog-Ebene benutzt.
  Ein Render je (Bilddatei, Fog-Version), von allen Spielern geteilt.
- **Berechtigung pro Aktion** (`authorizeAction` mit Rolle `spielleiter`, Rolle für die
  Bildroute aus der Mitgliedschaft je Anfrage).
- **Testbare Verwaltung:** Umschalter, Schaltflächen, Namensfeld sind gewöhnliche
  DOM-Elemente; nur das Ziehen auf dem Canvas ist App-Test.
- Keine bestehende Assertion außerhalb der im Proposal genannten vier Szenarien bricht.

**Non-Goals:**
- Keine Sichtbarkeitsregel für Tokens im Fog (#17) — `broadcastTokens` bleibt unberührt.
- Kein Zuschneiden des Bilds auf die aufgedeckte Bounding-Box (Abmessungen sind bewusst
  sichtbar, proposal.md).
- Keine Reihenfolgegarantie zwischen den `session:fog` verschiedener Empfänger; wohl aber
  **je Empfänger** `session:map` → `session:fog` → `session:tokens`.
- Kein Delta-Protokoll — jedes `session:fog` trägt die vollständige Zellliste (Muster
  Teilnehmerliste, #6 D7).

## Decisions

### D1 — Datenmodell

```prisma
model MapInstance {
  // ...bestehende Felder...
  fogVersion Int       @default(0)
  fogCells   FogCell[]
  fogAreas   FogArea[]
}

model FogCell {
  id         String      @id @default(cuid())
  instanceId String
  col        Int
  row        Int
  instance   MapInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  @@unique([instanceId, col, row])
}

model FogArea {
  id         String        @id @default(cuid())
  instanceId String
  name       String
  createdAt  DateTime      @default(now())
  instance   MapInstance   @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  cells      FogAreaCell[]

  @@index([instanceId])
}

model FogAreaCell {
  id     String  @id @default(cuid())
  areaId String
  col    Int
  row    Int
  area   FogArea @relation(fields: [areaId], references: [id], onDelete: Cascade)

  @@unique([areaId, col, row])
}
```

- **Eine Zeile je aufgedeckter Zelle**, `@@unique([instanceId, col, row])` — „keine Zelle
  doppelt" ist eine Datenbankeigenschaft (Muster `TokenCondition`, #61 D1). Verworfen: *ein
  JSON-String je Instanz* — SQLite kennt kein `Json`, und „ist (3,4) aufgedeckt" wäre keine
  Abfrage mehr. *Rechteckliste* — teilweises Verdecken zerlegt Rechtecke im Handler
  (proposal.md, Explore-Runde).
- **`fogVersion` an der Instanz**: Cache-Schlüssel des maskierten Bilds (D4) und Signal für
  den Spieler-Client, das Bild neu zu laden (D7). Wächst nur, wenn sich `FogCell` ändert —
  Bereichsänderungen berühren das Bild nicht. Wächst auch bei einer Aktion ohne
  Mengenänderung (erneutes Aufdecken derselben Zellen): billiger als ein Vergleich, und der
  Client lädt dann einmal zu viel — kein Fehler, nur Bandbreite.
- **Bereiche ohne `revealed`-Spalte**: abgeleitet in `toFogState` (D3). Verworfen: *eine
  gespeicherte Flagge* — sie müsste bei jedem Ad-hoc-Verdecken einer Bereichszelle
  nachgeführt werden, und zwei Bereiche mit gemeinsamer Zelle hätten widersprüchliche
  Flaggen.
- **Cascade** von Instanz zu `FogCell`/`FogArea` und von `FogArea` zu `FogAreaCell`:
  „Aushängen löscht" ist Schema, nicht Handler.
- **Migration** `prisma/migrations/<stamp>_add-fog-of-war/migration.sql`: `ALTER TABLE
  "MapInstance" ADD COLUMN "fogVersion" INTEGER NOT NULL DEFAULT 0` (Spalte mit Default —
  kein Tabellen-Neuaufbau, bestehende Zeilen bekommen 0), drei `CREATE TABLE` mit
  Fremdschlüsseln `ON DELETE CASCADE ON UPDATE CASCADE`, die zwei Unique-Indizes und der
  Index auf `FogArea.instanceId` — Muster `TokenShare` in `20260911150000_add-token-share`.

### D2 — Vertrag in `shared/fog.ts`

Importiert nur aus `./grid.js` (Typ `Cell`) und `zod` — nichts Serverseitiges, kein
`sharp`.

- `FOG_COORD_LIMIT = 10000`, `FOG_MAX_CELLS = 10000`, `FOG_AREA_NAME_MAX_LENGTH = 40`.
- `CellSchema`: `{ col, row }`, je ganze Zahl mit Betrag ≤ `FOG_COORD_LIMIT`.
- `CellListSchema`: Liste von `CellSchema`, `min(1)`, `max(FOG_MAX_CELLS)`, `refine` „keine
  Zelle doppelt" (über `cellKey`).
- `FogAreaNameSchema`: `trim` → 1 bis 40 Zeichen, keine Steuerzeichen (Muster Tokenname in
  `shared/token.ts`).
- `FogTargetSchema = z.discriminatedUnion('kind', [zellen mit cells: CellListSchema,
  bereich mit areaId: z.string().min(1), alle])`, `FogTarget`.
- `SetFogInputSchema = { sessionId, revealed: z.boolean(), target: FogTargetSchema }`;
  `CreateFogAreaInputSchema = { sessionId, name: FogAreaNameSchema, cells: CellListSchema }`;
  `DeleteFogAreaInputSchema = { sessionId, areaId }`.
- `FogAreaViewSchema = { id, name, cellCount: z.number().int(), revealed: z.boolean() }`,
  `FogAreaView`.
- `FogStateSchema = { instanceId, version: z.number().int(), revealed: z.array(CellSchema),
  areas: z.array(FogAreaViewSchema).nullable() }`, `FogState`. `areas: null` = „für diesen
  Empfänger nicht sichtbar" (Muster `shares: null`, #62).
- Acks: `FogAck = { ok: true; fog: FogState } | { ok: false; message: string }` — ein Typ für
  alle drei Ereignisse; `FogEvent = { sessionId: string; fog: FogState | null }`.
- `SESSION_FOG_EVENTS = { set: 'session:fog-set', areaCreate: 'session:fog-area-create',
  areaDelete: 'session:fog-area-delete', fog: 'session:fog' }`.
- Reine Helfer: `cellKey(cell)` → `"col,row"`; `cellsInRange(a, b)` → alle Zellen des
  Rechtecks zwischen zwei Zellen (beide Ecken einschließlich, Reihenfolge egal) — benutzt
  die Fassade für das Ziehen; `isAreaRevealed(areaCells, revealedKeys: Set<string>)` →
  `true` genau dann, wenn jede Zelle enthalten ist; `redactFog(fog, role)` → bei
  `spielleiter` unverändert, sonst `{ ...fog, areas: null }`.
- Verworfen: *`revealed` als Set/Map auf der Leitung* — JSON kennt nur Listen; das Set baut
  sich jeder Empfänger selbst.

### D3 — Server (`server/session/fog.ts`)

- **`FOG_AREA_INCLUDE`** — Bereiche mit `cells`, geordnet nach `createdAt` aufsteigend.
- **`toFogState(instance, cells, areas): FogState`** — reine Funktion: `revealed` als
  `{ col, row }`-Liste, `areas` je Bereich `{ id, name, cellCount: cells.length, revealed:
  isAreaRevealed(...) }`. Immer mit Objekt-`areas`; `null` entsteht erst in `redactFog`.
- **`loadFog(prisma, sessionId): Promise<FogState | null>`** — Spielsitzung mit
  `activeInstance` laden; ohne aktive Instanz `null`; sonst `FogCell` und `FogArea` (mit
  Zellen) der Instanz laden und `toFogState`. **`loadFogFor(prisma, sessionId, role)`** =
  `loadFog` + `redactFog` — benutzt vom Enter-Ack.
- **`broadcastFog(io, prisma, presence, sessionId)`** — wie `broadcastTokens`: `loadFog`
  einmal, `presence.entriesIn`, Mitgliedschaften **jetzt** laden, je Verbindung
  `io.to(socketId).emit(SESSION_FOG_EVENTS.fog, { sessionId, fog: redactFog(fog, role) })`;
  ein Eintrag ohne Mitgliedschaft bekommt nichts. Bei `fog === null` geht `null` an alle.
- **Reihenfolge nach `session:map`**: `handleActivateMap` (in `socket.ts`) und das Aushängen
  der aktiven Instanz (in `maps.ts`) rufen nach `emitActiveMap` erst `broadcastFog`, dann
  `broadcastTokens`. Beide Aufrufe sind `await`ed, damit die Reihenfolge je Verbindung
  gilt.
- **Enter-Ack**: `handleEnter` ergänzt `fog: await loadFogFor(prisma, sessionId, role)` neben
  `map` und `tokens`.
- **Zellen einer Aktion auflösen** (`resolveTargetCells`): `zellen` → Payload; `bereich` →
  `fogArea.findFirst` mit `id` **und** `instanceId` der aktiven Instanz (sonst `Bereich
  nicht gefunden.` — eine fremde `id` ist nicht unterscheidbar von einer unbekannten); `alle`
  + Aufdecken → `cellRange(grid, width, height)` mit dem Raster der Karte (`toMapSummary`)
  und den Bildabmessungen aus `imageSize` (D5), ohne Bild 1000 × 1000 (dieselbe Rückfallgröße
  wie die Fassade); `alle` + Verdecken → Sonderfall „alle Zeilen der Instanz löschen".
- **`session:fog-set`** (`handleSetFog`): zod-Parse (`INVALID_PAYLOAD_MESSAGE`) →
  `authorizeAction` mit Rolle `spielleiter` → aktive Instanz aus `gameSession.activeInstanceId`
  laden (mit `map`), sonst `Keine Karte aktiv.` → Zellen auflösen → **eine Transaktion**:
  bei Aufdecken die bestehenden `FogCell` der Instanz laden, die Zielzellen ohne Treffer in
  Blöcken von 500 per `createMany` anlegen (Prisma auf SQLite kennt kein
  `skipDuplicates` — daher der Abgleich vorher); bei Verdecken die `id`s der Treffer
  (Zielzellen ∩ bestehende) in Blöcken von 500 per `deleteMany` mit `id in` löschen, bei
  `alle` `deleteMany` über `instanceId`; danach `mapInstance.update` mit `fogVersion:
  { increment: 1 }` → `broadcastFog` → `{ ok: true, fog }` mit dem ungefilterten Zustand
  (`loadFog` nach der Transaktion). Blöcke von 500, weil SQLite die Anzahl gebundener
  Parameter je Anweisung begrenzt und 10000 Zellen × 2 bzw. 4 Parameter darüber lägen.
- **`session:fog-area-create`** (`handleCreateFogArea`): Parse → Rolle `spielleiter` → aktive
  Instanz → `fogArea.create` mit `name` und verschachteltem `cells: { createMany }` — in
  einer Transaktion, bei mehr als 500 Zellen als `create` ohne Zellen plus `createMany` in
  Blöcken → **keine** Versionserhöhung → `broadcastFog` → `{ ok: true, fog }`.
- **`session:fog-area-delete`** (`handleDeleteFogArea`): Parse → Rolle → aktive Instanz →
  `fogArea.findFirst` mit `id` und `instanceId`, sonst `Bereich nicht gefunden.` →
  `fogArea.delete` (Cascade löscht die Zellen) → `broadcastFog` → `{ ok: true, fog }`.
- Meldungen: `'Ungültige Anfrage.'`, `'Keine Karte aktiv.'` (beide wie in `tokens.ts`),
  `'Bereich nicht gefunden.'`; die Rollenmeldung kommt aus `authorizeAction` (`'Dafür fehlt
  die Berechtigung.'`).
- `registerFogHandlers(io, socket, deps)` wie `registerTokenHandlers`, aus der
  `connection`-Registrierung in `socket.ts` aufgerufen; jeder Handler mit `.catch` →
  `GENERIC_ACK_ERROR_MESSAGE` (kein stilles catch).
- Verworfen: *Fog in `socket.data` cachen* (§9.3). *`deleteMany` mit `OR` über 10000
  Zellpaare* — Parametergrenze. *Versionserhöhung auch bei Bereichsänderungen* — würde jeden
  Spieler-Client das Bild neu laden lassen, obwohl es sich nicht geändert hat.

### D4 — Maskiertes Bild (`server/session/map-image.ts`)

- **Route `GET /api/sessions/:id/map-image`**, registriert in `core/app.ts` mit `{ prisma,
  clock, uploadDir }`. Ablauf: `requireUser` (401, Muster `session/maps.ts`) →
  `membership.findUnique({ sessionId_userId })`; kein Treffer → `404` `'Spielsitzung nicht
  gefunden.'` (dieselbe Antwort für Nicht-Mitglied und unbekannte `id`) → Spielsitzung mit
  `activeInstance` und `map` laden; keine aktive Instanz → `404` `'Keine Karte aktiv.'`;
  Karte ohne `imageFile` → `404` `'Diese Karte hat kein Bild.'` → Rolle aus der Mitgliedschaft:
  `spielleiter` → Originalbytes mit `map.imageType`; `spieler` → `renderMaskedImage` →
  `image/webp`. Immer `Cache-Control: private, no-store`.
- **`renderMaskedImage(bytes, grid, cells): Promise<Buffer>`** (reine Funktion über `sharp`,
  exportiert): Abmessungen per `sharp(bytes).metadata()`; SVG-Maske in Bildgröße mit
  `shape-rendering="crispEdges"` und einem `<path>`, der für jede Zelle das Polygon aus
  `cellCorners(grid, cell)` (M/L/Z) enthält, Füllung weiß; ohne Zellen ein SVG ohne Pfad
  (ergibt vollständig transparent). Dann `sharp(bytes).ensureAlpha().composite([{ input:
  svgBuffer, blend: 'dest-in' }]).webp({ quality: 90, alphaQuality: 100 })`. `dest-in`
  behält vom Bild genau die Bildpunkte, an denen die Maske deckend ist; `crispEdges`
  verhindert halbtransparente Kantenpixel; `alphaQuality: 100` hält den Alphakanal
  verlustfrei, sodass „Alpha 0" und „Alpha 255" exakt gelten. WebP statt PNG: PNG ist bei
  Fotokarten ein Vielfaches größer, WebP mit Alpha ist im Browser und in PixiJS (`Assets`)
  ohne Zusatz ladbar.
- **Render-Cache** (`createMaskedImageCache()`, eine Instanz je App): `Map<instanceId,
  { key, bytes }>` mit `key = imageFile + ':' + fogVersion`. Treffer → Bytes; sonst rendern
  und den Eintrag der Instanz ersetzen (höchstens ein Render je Instanz im Speicher). Ein
  Bildwechsel (neuer Dateiname, `writeImage` vergibt immer ein neues Token) und jede
  Fog-Änderung (neue Version) verfehlen den Schlüssel automatisch — keine explizite
  Invalidierung nötig. Das Szenario „Aufdecken wirkt auf den nächsten Abruf" ist damit eine
  Eigenschaft des Schlüssels.
- **Bild-URL ohne Endung** — wie `/api/maps/:id/image`; die Fassade lädt mit explizitem
  Parser (`loadTextures`, #14), das gilt für WebP genauso.
- Verworfen: *Kacheln je Zelle* (Hex-Zellen sind keine Rechtecke, Dutzende Requests,
  proposal.md). *Rendern im Spielleiter-Browser* (Server nicht autoritativ). *Cache je
  Spieler* — alle Spieler sehen dasselbe Bild, ein Eintrag je Instanz genügt. *Maske
  serverseitig per Pixel-Schleife* — `sharp` rastert SVG selbst, und `cellCorners` ist
  bereits die Geometrie.

### D5 — Bibliotheksroute und Bildabmessungen

- `server/map/rules.ts`: `findViewableMap` wird entfernt; `GET /api/maps/:id/image` in
  `routes.ts` lädt über `findOwnMap` (Kommentar zur Ausnahme entfällt). Damit gibt es
  keinen Codepfad mehr, der das vollständige Bild an ein Mitglied mit Rolle `spieler` gibt.
- `server/map/storage.ts`: `imageSize(dir, fileName): Promise<{ width, height }>` über
  `sharp(pfad).metadata()` — die einzige Stelle in `server/map/`, die `sharp` importiert;
  benutzt von `resolveTargetCells` (D3) für `alle`.
- Der Client (`client/map/api.ts`, `mapImageUrl`) bleibt für die Bibliotheksansicht
  unverändert; die Raumansicht benutzt `sessionMapImageUrl` (D7).

### D6 — Canvas-Fassade (`client/map/canvas.ts`)

- **Neue Optionen**: `fog: FogLayer | null` mit `FogLayer = { revealed: Cell[]; opaque:
  boolean }`, `tool: FogTool` (`'schwenken' | 'aufdecken' | 'verdecken' | 'bereich'`,
  exportiert aus `shared/fog.ts` als `FOG_TOOLS`/`FogTool`), `selection: Cell[]`,
  `onCellsSelected?: (cells: Cell[]) => void`. **Neue Handle-Methoden**: `setFog(fog)`,
  `setTool(tool)`, `setSelection(cells)`.
- **Ebenenreihenfolge** in `root`: Sprite (Index 0), Rastergrafik, **Fog-Ebene**
  (`Graphics`), **Auswahl-Ebene** (`Graphics`), Tokenebene — der Fog liegt über Bild und
  Raster und unter den Tokens (Tokens bleiben sichtbar, #17).
- **`drawFog()`**: `clear`; bei `fog === null` nichts; sonst für jede Zelle in
  `cellRange(grid, width, height)` (Bildgröße oder Rückfall 1000 × 1000), deren `cellKey`
  nicht in der Menge der aufgedeckten liegt, das Polygon aus `cellCorners` füllen — Farbe
  `0x000000`, Alpha `1` bei `opaque`, sonst `0.55`. Neu zeichnen bei `setFog`, `setGrid`
  und nach dem Laden eines Bilds (Bildgröße ändert den Zellbereich) — ergänzt `drawGrid`
  an genau den Stellen, an denen es heute aufgerufen wird.
- **`drawSelection()`**: die Auswahlzellen als halbtransparente Akzentfläche mit Rand
  (Farbe frei, App-Test). Neu zeichnen bei `setSelection` und `setGrid`.
- **Werkzeuge**: bei `tool !== 'schwenken'` beginnt `pointerdown` auf der Bühne keine
  Schwenkbewegung, sondern merkt sich die Startzelle (`cellAt(grid, root.toLocal(global))`);
  `pointermove` zeichnet ein Vorschau-Rechteck der Zellen `cellsInRange(start, aktuell)` auf
  der Auswahl-Ebene (zusätzlich zur gespeicherten Auswahl); `pointerup`/`pointerupoutside`
  ruft `onCellsSelected(cellsInRange(start, ende))` auf und entfernt die Vorschau. Die
  Token-`pointerdown`-Handler prüfen das Werkzeug zuerst: bei einem Fog-Werkzeug weder
  `stopPropagation` noch Ziehen — die Bühne bekommt das Ereignis. Zoomen per Rad bleibt in
  jedem Werkzeug.
- `destroy()` zerstört die beiden neuen `Graphics` wie die Rastergrafik (kein `true` als
  erstes Argument von `app.destroy`, #14).
- **`MapCanvas.tsx`**: Props `fog`, `tool`, `selection`, `onCellsSelected` (letzterer nur
  beim Erzeugen gelesen, wie `onTokenMove`); Effekte rufen `setFog?.`, `setTool?.`,
  `setSelection?.` tolerant auf (Mocks aus #49/#50/#14 kennen sie nicht — Muster
  `setTokens`); `latestPropsRef` um `fog`, `tool`, `selection` erweitert, Nachziehen nach dem
  asynchronen Aufbau wie bei den bestehenden Props.
- Verworfen: *Fog als Maske auf dem Sprite* — die Fog-Ebene muss auch ohne Bild und über dem
  Raster liegen. *Auswahl im Werkzeug „Bereich" in der Fassade sammeln* — der Zustand gehört
  in die Raumansicht (D7), die Fassade meldet nur das Rechteck.

### D7 — Raumansicht (`SessionRoom.tsx`) und Bild-URL

- `client/session/fog-api.ts` (neu): `sessionMapImageUrl(sessionId, fogVersion: number |
  null)` → `/api/sessions/<id>/map-image` ohne Version, mit Version `?fog=<version>`.
- **Zustand**: `fog: FogState | null` im `bereit`-Zustand (aus `ack.fog ?? null`, ersetzt
  durch jedes `session:fog`); `fogTool` (Standard `'schwenken'`), `fogSelection: Cell[]`,
  `fogError: string | null`.
- **Bild-URL**: `hasImage` falsch → `null`; Rolle `spielleiter` →
  `sessionMapImageUrl(sessionId, null)`; sonst `sessionMapImageUrl(sessionId,
  fog?.version ?? 0)`. Der Spielleiter lädt das Original genau einmal je Karte; ein Spieler
  bei jeder Version neu — `MapCanvas` ruft `setImage` nur, wenn sich die URL-Zeichenkette
  ändert.
- **Fog-Ebene**: `fog === null` → `null`; sonst `{ revealed: fog.revealed, opaque: role ===
  'spieler' }`. Das Objekt nur bei Änderung von `fog`/`role` neu bauen (`useMemo`), damit der
  `setFog`-Effekt nicht bei jedem Render feuert.
- **Handler**: `handleCellsSelected(cells)`: bei `aufdecken` → `socket.setFog(sessionId,
  true, { kind: 'zellen', cells })`; bei `verdecken` → dasselbe mit `false`; bei `bereich` →
  Vereinigung mit `fogSelection` über `cellKey`, kein Senden. `handleFogAll(revealed)` →
  Ziel `alle`. `handleAreaToggle(areaId, revealed)` → Ziel `bereich`. `handleAreaCreate(name)`
  → `socket.createFogArea(sessionId, name, fogSelection)`, bei `ok` Auswahl leeren.
  `handleAreaDelete(areaId)` → `socket.deleteFogArea`. `handleClearSelection` → leere
  Auswahl. Jeder Handler setzt `fogError` aus dem Ack (`null` bei `ok`). **Nie** `fog` lokal
  ändern (§9.1).
- `socket.on('fog', …)` ersetzt `fog` im `bereit`-Zustand (auch mit `null`).
- `FogPanel` (D8) nur für `role === 'spielleiter'` **und** `fog !== null` rendern; `<p
  role="alert">{fogError}</p>` für jede Rolle unterhalb der Karte (wie `tokenError`).
- `client/session/socket.ts`: `setFog(sessionId, revealed, target): Promise<FogAck>`,
  `createFogArea(sessionId, name, cells): Promise<FogAck>`, `deleteFogArea(sessionId,
  areaId): Promise<FogAck>`, `on('fog', handler: (payload: FogEvent) => void)`;
  `wireEventFor('fog')` → `SESSION_FOG_EVENTS.fog`.

### D8 — Fog-Verwaltung (`client/session/FogPanel.tsx`, neu) und Schnittstelle

Reine React-Komponente ohne Pixi-Import: `FogPanel({ fog, tool, selectionCount, onToolChange,
onRevealAll, onHideAll, onAreaCreate, onClearSelection, onAreaToggle, onAreaDelete })`. Ein
lokaler Zustand nur für das Namensfeld (eine Absicht, kein Serverzustand); alles andere
folgt den Props. Adressen für Test und Implementierung, Layout frei — ergänzt die
Tabellen aus #50 D7, #14 D7, #61 D9 und #62 D8, die unverändert gelten:

| Element | Beschriftung / Attribut |
|---|---|
| Gruppe | `<fieldset>` mit `<legend>` genau `Fog of War` |
| Werkzeugwahl | vier `<input type="radio" name="fog-tool">` mit `value` `schwenken`, `aufdecken`, `verdecken`, `bereich` und `<label>` genau `Schwenken`, `Aufdecken`, `Verdecken`, `Bereich markieren`; `checked` = aktuelles Werkzeug |
| Alles | `<button type="button">` genau `Alles aufdecken` und genau `Alles verdecken` |
| Bereichsname | `<input name="area-name">` mit `<label>` genau `Bereichsname` |
| Speichern | `<button type="submit">` genau `Bereich speichern` in einem eigenen `<form>`; `disabled` = Auswahl leer |
| Auswahl | Text genau `Auswahl: <n> Zellen` (auch bei 0 und 1: `Auswahl: 1 Zellen`) und `<button type="button">` genau `Auswahl leeren` |
| Bereichsliste | `<ul>` mit einem `<li>` je Bereich in Reihenfolge von `fog.areas` |
| Kästchen je Bereich | `<input type="checkbox" name="area-<id>">` mit `aria-label` genau `<Name> aufgedeckt`; `checked` = `revealed` |
| Löschen je Bereich | `<button type="button">` genau `<Name> löschen` |
| Meldung | `<p role="alert">` in der Raumansicht (nicht im Panel), Text = `message` des Acks |

Tests adressieren über Rolle (`radio`, `button`, `checkbox`, `textbox`) und zugänglichen
Namen, nicht über `name`. Das Namensfeld wird nach erfolgreichem Speichern geleert.
Bereichsnamen in Tests dürfen kein Präfix anderer Beschriftungen sein („Raum 1" ist sicher;
„Alles" wäre es nicht).

### D9 — Testaufbau

- **Socket-Szenarien** in der Art der Token-Socket-Szenarien (echte Socket.IO-Clients,
  Aufbau über Routen: Registrieren, Spielsitzung, Beitritt, Karte anlegen, einhängen,
  `session:activate-map`). Helfer zum direkten Anlegen aufgedeckter Zellen (`FogCell`-Zeilen)
  und eines Bereichs (`FogArea` mit `FogAreaCell`-Zeilen) über den Prisma-Client der Suite.
  DB-Aussagen „Anzahl der `FogCell`-Zeilen dieser Instanz" = `count` mit `instanceId`.
  `revealed`-Listen vor dem Vergleich nach `cellKey` sortieren oder `arrayContaining` plus
  Länge — die Reihenfolge ist nicht festgelegt. „erhält kein `session:fog`" als kurze
  Wartezeit ohne Ereignis (wie bei `session:tokens`). Reihenfolge `session:map` →
  `session:fog` → `session:tokens` über eine gemeinsame Ereignisliste je Client prüfen.
- **Bilder in Tests** über `sharp`: ein deckend rotes PNG von 140 × 140 per `sharp` mit
  `create` (Breite, Höhe, 4 Kanäle, Hintergrund rot) und `png()`; der WebP-Body per `sharp`
  mit `ensureAlpha().raw().toBuffer({ resolveWithObject: true })` dekodieren und Bildpunkte
  über `(y * width + x) * 4` adressieren — Alpha ist der vierte Kanal. Für die Szenarien der
  Bildroute und „Alles aufdecken bei einer Karte mit Bild" dasselbe Bild hochladen (`PUT
  /api/maps/:id/image` mit `image/png`). Alle Szenarien, die `sharp` brauchen, in **einer**
  Integrationssuite bündeln (Bildroute), damit das native Modul je Jest-Worker nur einmal
  geladen wird.
- **Komponententests** wie die Kartenansichts-Szenarien: Mock der Socket-Fassade mit
  aufzeichnenden `setFog`/`createFogArea`/`deleteFogArea` (Standard `{ ok: true, fog }`) und
  einem auslösbaren `fog`-Handler; Mock der Canvas-Fassade über den auflösbaren
  Modulschlüssel mit `.js`-Endung, Handle mit `setGrid`, `setImage`, `setTokens`, `setFog`,
  `setTool`, `setSelection`, `destroy`. `onCellsSelected` aus den Optionen des
  aufgezeichneten `createMapCanvas`-Aufrufs holen und im Test aufrufen (Muster
  `onTokenMove`, #14) — innerhalb von `act`. Elemente nach D8 über `getByRole` mit genauem
  Namen, `queryByRole` für „existiert nicht"; keine `must()`-Helfer mit Kurzmeldung. Der
  Enter-Ack-Mock trägt `fog` mit `areas` (Spielleiter) bzw. `areas: null` (Spieler).
- Fixtures: Spielleiter `meister`, Spieler `sam`, Bereich „Raum 1", Karten „Taverne" und
  „Keller"; Spielsitzungs-`id` `s1`, Bereichs-`id` `a1` in den UI-Szenarien.
- Kein Test importiert `pixi.js`; Fog-Ebene, Vorschau-Rechteck und Ziehen nimmt der
  App-Test ab.

### D10 — Dependency `sharp`

Freigegeben in der Explore-Runde (§5.2). Version `^0.35`, prebuilt Binaries (`@img/…`) für
Windows und Linux; nur `server/map/storage.ts` und `server/session/map-image.ts`
importieren es — nie `shared/`, nie `client/`. Der Mensch installiert im Feature-Worktree
(`pnpm add sharp`) und committet `package.json` und `pnpm-lock.yaml`, bevor der test-author
startet; der Agent installiert nicht (AGENTS.md, Kritische Grenzen).

## Risks / Trade-offs

- **Große Bilder, viele Aufdeckungen** → ein Render je Fog-Version, gecacht, von allen
  Spielern geteilt (D4); ein 20-MB-Bild braucht pro Render Sekunden — akzeptiert für einen
  Tisch mit wenigen Spielern; bei Bedarf später asynchrones Vorrendern nach `broadcastFog`.
- **Halbtransparente Kantenpixel verraten einen Streifen** → `crispEdges` in der SVG-Maske;
  Zellgrenzen liegen ohnehin innerhalb aufgedeckter Zellen.
- **Bildabmessungen sind sichtbar** → bewusst akzeptiert (proposal.md); ohne sie stimmte
  das Raster des Spielers nicht mit dem des Spielleiters überein.
- **`sharp` unter Jest** (natives Modul, mehrere Suiten je Worker) → alle Bild-Szenarien in
  einer Suite (D9); `sharp` ist N-API-basiert und verträgt erneutes Laden.
- **Parametergrenze von SQLite bei `createMany`/`deleteMany`** → Blöcke von 500 (D3),
  Payload-Obergrenze 10000 Zellen (D2).
- **`fog` und `map` sind kurz inkonsistent** (zwischen `session:map` und `session:fog`) →
  die Bild-URL nimmt einfach die aktuelle Version; schlimmstenfalls lädt ein Spieler ein Bild
  einmal zu viel. Die Fog-Ebene zeichnet mit dem alten `revealed` über dem neuen Bild für
  Millisekunden — sichtbar allenfalls als Flackern, keine Information.
- **Ein Mock der Canvas-Fassade aus früheren Changes** kennt `setFog` nicht → tolerante
  Aufrufe (D6).
- **StrictMode-Doppelinstanz** (#14) → keine neuen Cache-Schlüssel; Fog-Ebene und
  Auswahl-Ebene sind je Instanz eigene `Graphics`.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte (Aufrufe als Prosa beschrieben).

## Migration Plan

`prisma/schema.prisma` bekommt `fogVersion` an `MapInstance` und die drei Modelle; die
Migrations-SQL fügt eine Spalte mit Default hinzu und legt drei Tabellen mit
Fremdschlüsseln und Indizes an, fasst sonst nichts an (D1). Agent nur gegen die
Wegwerf-DB; die Entwicklungs-DB migriert der Mensch vor dem App-Test, produktiv die CI
(§5.1, §6.1). Rollback: Spalte und Tabellen sind neu, kein Code außerhalb dieses Change
liest sie.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Sichtbarkeit von Tokens im Fog (#17) und
ein dynamisches Sichtfeld sind bewusst ausgeklammert.
