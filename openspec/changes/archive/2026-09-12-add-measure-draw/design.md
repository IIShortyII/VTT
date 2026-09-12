## Context

Vorhanden: `MapInstance` mit `activeInstanceId` an der Spielsitzung (#50), das Enter-Ack
mit `map`, `tokens` und `fog`, `broadcastTokens`/`broadcastFog` als Muster für „je
Verbindung gefiltert" (`presence.entriesIn`, Rolle aus der **jetzt** geladenen
Mitgliedschaft), `authorizeAction` (ohne Rollenanforderung: jedes Mitglied; mit: nur diese
Rolle), die Ereignisfolge `session:map` → `session:fog` → `session:tokens` in
`handleActivateMap` (`socket.ts`) und beim Aushängen (`maps.ts`), die Rastergeometrie in
`shared/grid.ts` (`cellAt`, `cellCenter` — pure, ohne Pixi), die PixiJS-Fassade
`client/map/canvas.ts` (einziger Pixi-Import, Mock-Grenze; Ebenen: Sprite, Raster, Fog,
Auswahl, Tokens; ein `tool: FogTool` mit Schwenken als Ausgangszustand; Token-`pointerdown`
prüft das Werkzeug zuerst), `MapCanvas.tsx` (Props → Handle-Methoden, tolerante Aufrufe
für ältere Mocks, `latestPropsRef`), `FogPanel.tsx` (Radiogruppe `fog-tool`, `checked =
tool === value`) und `SessionRoom.tsx` (ein Handler je Absicht, ein `<p role="alert">` je
Fehlerquelle, `fogTool` als Zustand plus `fogToolRef` für den einmal übergebenen
Rückruf).

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/session-annotation/spec.md`. Bindend und nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Ein Filter, eine Stelle:** `filterAnnotationsFor(list, viewer)` im gemeinsamen Vertrag,
  benutzt von jedem Sendepfad (Enter-Ack, `broadcastAnnotations`). Private Anmerkungen
  anderer verlassen den Server nicht.
- **Eine Entfern-Regel, zwei Verwender:** `canDeleteAnnotation(annotation, viewer)` im
  Vertrag — der Server prüft damit pro Aktion, das Panel zeigt damit `Entfernen` nur dort,
  wo der Server zustimmen würde (Muster `canMoveToken`, #15).
- **Das Etikett ist eine reine Funktion** (`annotationLabel`) aus Anmerkung, Raster und
  Einheit — Liste, Kartenansicht und Vorschau rechnen aus derselben Quelle; nichts davon
  wird gespeichert oder gesendet.
- **Server ist autoritativ auch beim Einrasten:** bei `gerastert` setzt der Server die
  Punkte selbst auf die Zellmitten, unabhängig davon, was der Client geschickt hat.
- **Ein Werkzeugzustand** je Raumansicht für Fog- und Messwerkzeuge — kein zweiter
  Zustand, der mit dem ersten kollidieren könnte.
- **Testbare Bedienung:** Radiogruppen, Schaltflächen und Liste sind gewöhnliche
  DOM-Elemente; nur Gesten, Vorschau und Zeichnen auf dem Canvas sind App-Test.
- Keine bestehende Assertion bricht.

**Non-Goals:**
- Keine Live-Übertragung der Geste; keine Formen; kein Radieren; kein Anklicken auf dem
  Canvas (proposal.md).
- Keine Reihenfolgegarantie zwischen den `session:annotations` verschiedener Empfänger;
  wohl aber **je Empfänger** `session:map` → `session:fog` → `session:tokens` →
  `session:annotations`.
- Kein Delta-Protokoll — jedes `session:annotations` trägt den vollständigen gefilterten
  Bestand (Muster Tokenbestand, #14).
- Keine Nachführung gespeicherter Punkte bei späterer Rasteränderung der Karte: eine
  gerasterte Messung bleibt in Bildkoordinaten liegen, ihr Etikett rechnet mit dem dann
  gültigen Raster. Akzeptiert — eine Rasteränderung mitten in der Sitzung ist ein
  Bibliotheksvorgang, kein Spielzug.

## Decisions

### D1 — Datenmodell

```prisma
model Annotation {
  id         String      @id @default(cuid())
  instanceId String
  authorId   String?
  kind       String
  mode       String
  visibility String
  color      String?
  points     String
  createdAt  DateTime    @default(now())
  instance   MapInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  author     User?       @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@index([instanceId])
}
```

plus die Gegenrelationen `annotations Annotation[]` an `MapInstance` und `User`.

- **Punkte als JSON-Text in einer Spalte** (`points`, Format `[{"x":..,"y":..},...]`),
  nicht eine Zeile je Punkt. Punkte werden ausschließlich als Ganzes gelesen und
  geschrieben; es gibt keine Abfrage „welche Anmerkung berührt Punkt p". Verworfen: *eine
  Tabelle `AnnotationPoint`* — 2000 Zeilen je Strich, Blockeinfügungen wie bei `FogCell`
  (#16 D3), und beim Lesen ein `include` mit Sortierung, alles ohne Gegenwert. *Prisma
  `Json`* — unter SQLite nicht verfügbar (#16 D1). Beim Lesen wird der Text mit
  `PointListSchema` geparst (D2); ein nicht parsbarer Wert ist ein Fehler, der bis zum
  generischen Ack-Handler sprudelt (kein stilles `catch`).
- **`kind`/`mode`/`visibility`/`color` als `String`** mit den Wertemengen im zod-Vertrag —
  wie `role`, `status`, `gridType` im Bestand; SQLite kennt keine Enums.
- **`authorId` nullable mit `SetNull`**: „Urheber `null`, wenn der Nutzer nicht mehr
  existiert" ist Schema, nicht Handler. Ein Verlassen der Spielsitzung durch ein Mitglied
  gibt es heute nicht (`game-session` kennt kein Entfernen einer Mitgliedschaft); die in
  der Explore-Runde beschlossene Regel dafür — geteilte bleiben mit Urheber `null`, private
  werden gelöscht — ist damit in diesem Change ohne Codepfad und ohne Szenario. Sie steht
  hier, damit der Change, der das Verlassen einführt, sie umsetzt.
- **Cascade** von der Instanz: „Aushängen löscht" ist Schema.
- **Migration** `prisma/migrations/<stamp>_add-annotation/migration.sql`: ein
  `CREATE TABLE` mit zwei Fremdschlüsseln (`ON DELETE CASCADE` zur Instanz, `ON DELETE SET
  NULL` zum Nutzer, beide `ON UPDATE CASCADE`) und dem Index auf `instanceId` — Muster
  `Token` in `20260911130000_add-token-owner` (nullable `ownerId` mit `SET NULL`) und
  `FogArea` in `20260911160000_add-fog-of-war`.

### D2 — Vertrag in `shared/annotation.ts`

Importiert nur aus `./grid.js` (`cellAt`, `cellCenter`, Typen `Cell`, `Point`),
`./map.js` (Typ `Grid`, `GridType`), `./fog.js` (`FOG_TOOLS`, Typ `FogTool`) und `zod` —
nichts Serverseitiges.

- Konstanten: `ANNOTATION_COORD_LIMIT = 1_000_000`, `ANNOTATION_MAX_POINTS = 2000`,
  `FIELD_METERS = 1.5`, `FIELD_FEET = 5`, `DISTANCE_UNIT_STORAGE_KEY = 'vtt.distanceUnit'`.
- Wertemengen als `as const`-Listen mit zod-Enum und Typ, Muster `GRID_TYPES`:
  `ANNOTATION_KINDS = ['strecke', 'kreis', 'winkel', 'zeichnung']`,
  `ANNOTATION_MODES = ['gerastert', 'frei']`, `ANNOTATION_VISIBILITIES = ['privat',
  'geteilt']`, `ANNOTATION_COLORS = ['rot', 'orange', 'gelb', 'gruen', 'blau', 'weiss']`,
  `DISTANCE_UNITS = ['meter', 'fuss']`, `ANNOTATION_TOOLS = ['strecke', 'kreis',
  'winkel', 'zeichnung']` (Werkzeugwerte = Artwerte, `AnnotationTool = AnnotationKind`).
  `CANVAS_TOOLS = [...FOG_TOOLS, ...ANNOTATION_TOOLS]`, `CanvasTool = FogTool |
  AnnotationTool`, `isAnnotationTool(tool)`.
- `ANNOTATION_COLOR_HEX: Record<AnnotationColor, string>` (`rot #e53935`, `orange
  #fb8c00`, `gelb #fdd835`, `gruen #43a047`, `blau #1e88e5`, `weiss #ffffff`) — die einzige
  Stelle, die Palettenname und Farbwert verbindet; der Client zeichnet damit.
- `PointSchema = { x, y }` je `z.number().finite()` mit Betrag ≤ `ANNOTATION_COORD_LIMIT`;
  `PointListSchema = z.array(PointSchema).min(2).max(ANNOTATION_MAX_POINTS)`.
- `CreateAnnotationInputSchema = z.object({ sessionId, kind, mode, visibility, color:
  AnnotationColorSchema.nullable(), points: PointListSchema }).superRefine(...)` mit den
  Regeln aus spec.md „Anmerkung anlegen": Punktzahl je Art (2/2/3/2–2000), `color !==
  null` ⇔ `kind === 'zeichnung'`, `kind === 'zeichnung'` ⇒ `mode === 'frei'`.
- `DeleteAnnotationTargetSchema = z.discriminatedUnion('kind', [eine mit annotationId:
  z.string().min(1), meine, geteilte])`; `DeleteAnnotationInputSchema = { sessionId,
  target }`.
- `AnnotationSchema = { id, instanceId, kind, mode, visibility, color: nullable, points:
  PointListSchema, authorId: z.string().nullable() }`, Typ `Annotation`.
- Acks: `CreateAnnotationAck = { ok: true; annotation: Annotation } | { ok: false; message
  }`; `DeleteAnnotationAck = { ok: true } | { ok: false; message }`; `AnnotationsEvent =
  { sessionId; annotations: Annotation[] }`.
- `SESSION_ANNOTATION_EVENTS = { create: 'session:annotation-create', delete:
  'session:annotation-delete', annotations: 'session:annotations' }`.
- `AnnotationViewer = { role: 'spielleiter' | 'spieler'; userId: string }` (Literal-Union,
  strukturell kompatibel mit `MemberRole`, Muster `TokenViewer`).
- Reine Helfer:
  - `filterAnnotationsFor(list, viewer)` → geteilte plus private mit `authorId ===
    viewer.userId`, Reihenfolge erhalten.
  - `canDeleteAnnotation(annotation, viewer)` → `authorId === viewer.userId || (visibility
    === 'geteilt' && role === 'spielleiter')`.
  - `cellDistance(gridType, a, b)` → `quadrat`: `max(|Δcol|, |Δrow|)`; `hex-spitz`
    (odd-r): `x = col − (row − (row & 1)) / 2`, `z = row`, `y = −x − z`; `hex-flach`
    (odd-q): `x = col`, `z = row − (col − (col & 1)) / 2`, `y = −x − z`; Abstand
    `max(|Δx|, |Δy|, |Δz|)`. Dieselbe odd-r/odd-q-Zuordnung wie `cellAt` (`&`-Maske für
    negative Zeilen/Spalten).
  - `snapToCellCenter(grid, point)` → `cellCenter(grid, cellAt(grid, point))`.
  - `distanceInFields(grid, mode, a, b)` → `gerastert`: `cellDistance(grid.type,
    cellAt(a), cellAt(b))`; `frei`: `round1(hypot(b − a) / grid.size)`.
  - `angleDegrees(vertex, a, b)` → `atan2`-Differenz der Schenkel, normiert auf 0–180,
    `Math.round`; Schenkellänge 0 → 0.
  - `formatNumber(n)` → `round1`, ganzzahlig ohne Nachkommastelle, sonst mit Komma
    (`String(n).replace('.', ',')` nach `round1` — keine `toLocaleString`, die unter Node
    ohne volle ICU anders ausfiele). `fieldsWord(n)` → `Feld` bei genau 1, sonst `Felder`.
  - `convertFields(fields, unit)` → `round1(fields × 1.5)` bzw. `round1(fields × 5)`;
    `unitSuffix(unit)` → `m`/`ft`.
  - `annotationLabel(annotation, grid, unit)` → nach spec.md „Begriffe"/„Etikett"; für
    `zeichnung` die leere Zeichenkette. `round1(x) = Math.round(x * 10) / 10`.
- Verworfen: *Etikett auf dem Server berechnen und mitsenden* — Einheit ist eine
  Client-Einstellung; zwei Clients desselben Objekts sähen verschiedene Etiketten.
  *Zellen statt Punkte bei `gerastert` speichern* — zweites Punktformat je Modus, doppelte
  Zeichenpfade; Zellmitten als Punkte sind eindeutig, `cellAt` liefert die Zelle zurück.

### D3 — Server (`server/session/annotations.ts`)

- **`toAnnotation(row)`** — reine Funktion: `points` per `PointListSchema.parse(JSON.parse
  (row.points))`, `color` aus der Spalte (`null` bleibt `null`), `kind`/`mode`/`visibility`
  per Enum-Parse (eine korrupte Zeile ist ein Fehler, kein leiser Rückfall).
- **`loadAnnotations(prisma, sessionId): Promise<Annotation[]>`** — Spielsitzung mit
  `activeInstanceId` laden; ohne aktive Instanz leere Liste; sonst `annotation.findMany`
  mit `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]` (die zweite Sortierung macht
  gleiche Millisekunden deterministisch) und `toAnnotation`. **`loadAnnotationsFor(prisma,
  sessionId, viewer)`** = `loadAnnotations` + `filterAnnotationsFor` — für das Enter-Ack.
- **`broadcastAnnotations(io, prisma, presence, sessionId)`** — wie `broadcastTokens`:
  einmal laden, `presence.entriesIn`, Mitgliedschaften **jetzt** laden, je Verbindung
  `io.to(socketId).emit(SESSION_ANNOTATION_EVENTS.annotations, { sessionId, annotations:
  filterAnnotationsFor(list, { role, userId }) })`; ein Eintrag ohne Mitgliedschaft bekommt
  nichts. Ohne aktive Instanz geht die leere Liste an alle.
- **Reihenfolge nach `session:map`**: `handleActivateMap` (`socket.ts`) und das Aushängen
  der aktiven Instanz (`maps.ts`) rufen nach `broadcastTokens` zusätzlich `await
  broadcastAnnotations(...)`. Beide `await`ed, damit die Reihenfolge je Verbindung gilt.
- **Enter-Ack**: `handleEnter` ergänzt `annotations: await loadAnnotationsFor(prisma,
  sessionId, { role, userId: user.id })` neben `map`, `tokens`, `fog`. Der Typ `EnterAck`
  in `shared/session.ts` bekommt das Feld `annotations: Annotation[]` (Muster `fog`,
  `tokens`); `SessionRoom` liest `ack.annotations ?? []` tolerant.
- **`session:annotation-create`** (`handleCreateAnnotation`): zod-Parse
  (`INVALID_PAYLOAD_MESSAGE`) → `authorizeAction` **ohne** Rollenanforderung (jedes
  Mitglied) → `activeInstanceId` aus `authResult.gameSession`, sonst `Keine Karte aktiv.` →
  Instanz mit `map` laden (für das Raster, `toMapSummary`) → bei `mode === 'gerastert'`
  jeden Punkt per `snapToCellCenter(grid, p)` ersetzen → `annotation.create` mit
  `authorId: authResult.user.id` und `points: JSON.stringify(points)` →
  `broadcastAnnotations` → `{ ok: true, annotation: toAnnotation(row) }`.
- **`session:annotation-delete`** (`handleDeleteAnnotation`): Parse → `authorizeAction` ohne
  Rolle → aktive Instanz, sonst `Keine Karte aktiv.` → `viewer = { role, userId }` →
  - `eine`: `annotation.findFirst({ where: { id, instanceId } })`; kein Treffer **oder**
    (`visibility === 'privat'` und `authorId !== viewer.userId`) → `Anmerkung nicht
    gefunden.` (dieselbe Antwort, §9.2); sonst `!canDeleteAnnotation(...)` → `Dafür fehlt
    die Berechtigung.`; sonst `annotation.delete`.
  - `meine`: `annotation.deleteMany({ where: { instanceId, authorId: viewer.userId } })` —
    auch bei 0 Treffern `ok`.
  - `geteilte`: `viewer.role !== 'spielleiter'` → `Dafür fehlt die Berechtigung.`; sonst
    `deleteMany({ where: { instanceId, visibility: 'geteilt' } })`.
  - danach `broadcastAnnotations` → `{ ok: true }`.
- Meldungen: `'Ungültige Anfrage.'`, `'Keine Karte aktiv.'`, `'Anmerkung nicht gefunden.'`,
  `'Dafür fehlt die Berechtigung.'` (Wortlaut identisch mit `authorizeAction`, damit ein
  Spieler „Rolle fehlt" und „nicht dein Objekt" nicht unterscheiden kann und muss).
- `registerAnnotationHandlers(io, socket, deps)` wie `registerFogHandlers`, aus der
  `connection`-Registrierung in `socket.ts` aufgerufen; jeder Handler mit `.catch` →
  `GENERIC_ACK_ERROR_MESSAGE`.
- Verworfen: *`deleteMany` für `eine` mit Bedingungen im `where`* — die Unterscheidung
  „nicht gefunden" vs. „keine Berechtigung" braucht die geladene Zeile. *Rollenanforderung
  im `authorizeAction` für `geteilte`* — dann liefe die Prüfung vor der „Keine Karte
  aktiv."-Prüfung und die Meldungen kämen in anderer Reihenfolge als bei `eine`/`meine`;
  die Rolle wird stattdessen im Handler gegen `authResult.membership.role` geprüft, mit
  demselben Wortlaut.

### D4 — Canvas-Fassade (`client/map/canvas.ts`)

- **Optionen**: `tool: CanvasTool` (statt `FogTool`), `annotations: Annotation[]`,
  `annotationOptions: { mode: AnnotationMode; color: AnnotationColor; unit: DistanceUnit
  }`, `onAnnotationDrawn?: (kind: AnnotationKind, points: Point[]) => void` (nur beim
  Erzeugen gelesen, wie `onCellsSelected`). **Handle-Methoden**: `setTool(tool:
  CanvasTool)`, `setAnnotations(list)`, `setAnnotationOptions(options)`.
- **Ebenen** in `root`, von unten: Sprite (Index 0), Rastergrafik, Fog-Ebene, Auswahl-Ebene,
  **Zeichnungsebene** (`Graphics`), Tokenebene, **Messebene** (`Container` mit je Messung
  einer `Graphics` plus `Text`), **Vorschau-Ebene** (`Graphics` + `Text`, ganz oben). Alle
  neuen Ebenen `eventMode = 'none'` — sie blockieren weder Token-Ziehen noch Schwenken.
- **`drawAnnotations()`**: Zeichnungsebene `clear`, dann je `zeichnung` die Polylinie in
  `ANNOTATION_COLOR_HEX[color]` mit Strichstärke `grid.size / 10`; Messebene leeren
  (Kinder `destroy({ children: true })`) und je Messung neu aufbauen: `strecke` Linie A→B
  mit Etikett am Mittelpunkt; `kreis` Kreis um den Mittelpunkt mit Radius `|B − A|` in
  Bildkoordinaten (bei `gerastert` also der Abstand der Zellmitten — das Etikett trägt die
  Felder), Etikett am Mittelpunkt; `winkel` zwei Schenkel plus Bogen am Scheitel, Etikett
  am Scheitel. Messfarbe fest (weiß mit dunklem Textrand), Strichstärke `max(2, grid.size
  / 20)`. Etikett = `annotationLabel(annotation, currentGrid, options.unit)`. Neu zeichnen
  bei `setAnnotations`, `setAnnotationOptions` (Einheit) und `setGrid`.
- **Gesten** (nur bei `isAnnotationTool(currentTool)`; `pointerdown` auf der Bühne beginnt
  keine Schwenkbewegung, `pointerdown` auf einem Token weder `stopPropagation` noch Ziehen
  — dieselbe Verzweigung wie heute für Fog-Werkzeuge, erweitert auf `currentTool !==
  'schwenken'`): Punkt = `root.toLocal(event.global)`, bei `mode === 'gerastert'` und
  Messwerkzeug per `snapToCellCenter` eingerastet (Vorschau zeigt, was gesendet wird).
  - `strecke`/`kreis`: `pointerdown` merkt A; `pointermove` zeichnet Vorschau A→aktuell
    (Linie bzw. Kreis) mit Etikett; `pointerup`/`pointerupoutside` meldet
    `onAnnotationDrawn(kind, [A, B])` und leert die Vorschau.
  - `winkel`: drei `pointerdown` — erster merkt den Scheitel S, zweiter das erste Ende A
    (ab dann Vorschau S→A plus S→aktuell mit Gradzahl bei `pointermove`), dritter meldet
    `onAnnotationDrawn('winkel', [S, A, B])`; kein Ziehen nötig.
  - `zeichnung`: `pointerdown` beginnt die Punktliste; `pointermove` hängt den Punkt an,
    wenn er sich vom letzten unterscheidet, bis `ANNOTATION_MAX_POINTS`; `pointerup`
    meldet bei ≥ 2 Punkten `onAnnotationDrawn('zeichnung', points)`, sonst nichts.
  - Werkzeugwechsel (`setTool`) verwirft eine laufende Geste und leert die Vorschau (wie
    heute `toolDragStart`). Zoomen per Rad bleibt in jedem Werkzeug.
- `destroy()`: Zeichnungsebene, Messebene und Vorschau-Ebene sind Kinder von `root` und
  werden über `app.destroy(..., { children: true })` mit zerstört; `Text`-Objekte der
  Messebene werden bei jedem Neuaufbau explizit `destroy`ed (kein Lecken von Texturen bei
  jedem `session:annotations`).
- **`MapCanvas.tsx`**: Props `tool?: CanvasTool`, `annotations?`, `annotationOptions?`,
  `onAnnotationDrawn?`; Effekte rufen `setAnnotations?.`/`setAnnotationOptions?.` tolerant
  auf; `latestPropsRef` um beide erweitert; Nachziehen nach dem asynchronen Aufbau wie bei
  `fog`.
- Verworfen: *Messungen unter den Tokens* — das Etikett wäre von einem Token verdeckt, von
  dem aus gemessen wird. *Ein `Graphics` für alle Messungen* — die Etiketten sind `Text`
  (eigene Objekte), also ohnehin ein Container je Messung.

### D5 — Raumansicht (`SessionRoom.tsx`) und Werkzeugzustand

- **Ein Werkzeugzustand**: `fogTool: FogTool` wird zu `tool: CanvasTool` (Standard
  `'schwenken'`), `fogToolRef` entsprechend. `FogPanel` bekommt `tool: CanvasTool` (Radios
  weiterhin `checked = tool === value`; bei einem Messwerkzeug ist keiner der vier
  angekreuzt — das ist korrekt) und `onToolChange: (tool: FogTool) => void`;
  `AnnotationPanel` (D6) bekommt dieselbe `tool` und `onToolChange: (tool: CanvasTool)`.
  Beide setzen denselben Zustand. `handleFogCellsSelected` bleibt unverändert — mit einem
  Messwerkzeug meldet die Fassade keine Zellen.
- **Zustand**: `annotations: Annotation[]` im `bereit`-Zustand (aus `ack.annotations ??
  []`, ersetzt durch jedes `session:annotations`); `annotationMode` (Standard
  `'gerastert'`), `annotationVisibility` (`'privat'`), `annotationColor` (`'rot'`),
  `distanceUnit` (aus dem Browserspeicher, sonst `'meter'`), `annotationError: string |
  null`. Die drei Optionen für die Fassade als `useMemo`-Objekt `annotationOptions =
  { mode, color, unit }`, damit der `setAnnotationOptions`-Effekt nur bei Änderung feuert.
- **Einheit im Browser**: `readStoredUnit()` liest `localStorage.getItem
  (DISTANCE_UNIT_STORAGE_KEY)` in `try/catch` und nimmt den Wert nur, wenn
  `DistanceUnitSchema` ihn akzeptiert; `handleUnitChange(unit)` setzt den Zustand und
  schreibt `localStorage.setItem` in `try/catch` (ein blockierter Speicher bricht die
  Einstellung nicht). Initialwert per `useState(readStoredUnit)` — einmal beim Mounten.
- **Handler**: `handleAnnotationDrawn(kind, points)` (der Fassade beim Erzeugen übergeben,
  liest Modus/Sichtbarkeit/Farbe aus Refs wie `fogToolRef`): `mode = kind === 'zeichnung'
  ? 'frei' : annotationMode`, `color = kind === 'zeichnung' ? annotationColor : null`, bei
  `mode === 'gerastert'` Punkte per `snapToCellCenter(state.map.grid, p)` (Raster aus
  einer Ref); `socket.createAnnotation(sessionId, { kind, mode, visibility, color, points
  })`; `annotationError` aus dem Ack. `handleAnnotationDelete(target)` →
  `socket.deleteAnnotation(sessionId, target)`; Fehlermeldung aus dem Ack. **Nie**
  `annotations` lokal ändern (§9.1).
- `socket.on('annotations', …)` ersetzt `annotations` im `bereit`-Zustand.
- `AnnotationPanel` nur bei `state.map !== null` rendern (jede Rolle); `<p
  role="alert">{annotationError}</p>` unterhalb der Karte wie `fogError`.
- `MapCanvas` erhält `tool`, `annotations`, `annotationOptions`, `onAnnotationDrawn`.
- `client/session/socket.ts`: `createAnnotation(sessionId, input: Omit<CreateAnnotationInput,
  'sessionId'>): Promise<CreateAnnotationAck>`, `deleteAnnotation(sessionId, target):
  Promise<DeleteAnnotationAck>`, `on('annotations', handler: (payload: AnnotationsEvent)
  => void)`; `wireEventFor('annotations')` → `SESSION_ANNOTATION_EVENTS.annotations`.
- Verworfen: *Modus/Farbe in der Fassade halten* — die Fassade zeichnet nur; jede
  Absicht gehört in die Raumansicht (Muster `fogSelection`, #16 D6/D7). *Einheit im
  Serverzustand* — Anzeigeeinstellung je Betrachter (proposal.md).

### D6 — Panel `Messen & Zeichnen` (`client/session/AnnotationPanel.tsx`, neu) und Schnittstelle

Reine React-Komponente ohne Pixi-Import: `AnnotationPanel({ annotations, grid, participants,
viewer, tool, mode, visibility, color, unit, onToolChange, onModeChange,
onVisibilityChange, onColorChange, onUnitChange, onDelete })`. Kein lokaler Zustand — alles
folgt den Props. Urhebername: `displayName(participant)` des Teilnehmers mit `userId ===
authorId`, sonst `unbekannt`. Adressen für Test und Implementierung, Layout frei — ergänzt
die Tabellen aus #50 D7, #14 D7, #61 D9, #62 D8 und #16 D8, die unverändert gelten:

| Element | Beschriftung / Attribut |
|---|---|
| Gruppe | `<fieldset>` mit `<legend>` genau `Messen & Zeichnen` |
| Werkzeugwahl | fünf `<input type="radio" name="annotation-tool">` mit `value` `schwenken`, `strecke`, `kreis`, `winkel`, `zeichnung` und `<label>` genau `Bewegen`, `Strecke`, `Kreis`, `Winkel`, `Zeichnen`; `checked` = `tool === value` |
| Moduswahl | zwei `<input type="radio" name="annotation-mode">` mit `value` `gerastert`, `frei` und `<label>` genau `Gerastert`, `Frei`; `checked` = aktueller Modus; `disabled` = Werkzeug ist nicht `strecke`/`kreis`/`winkel` |
| Sichtbarkeitswahl | zwei `<input type="radio" name="annotation-visibility">` mit `value` `privat`, `geteilt` und `<label>` genau `Privat`, `Geteilt` |
| Farbwahl | sechs `<input type="radio" name="annotation-color">` mit `value` aus `ANNOTATION_COLORS` und `<label>` genau `Rot`, `Orange`, `Gelb`, `Grün`, `Blau`, `Weiß`; `disabled` = Werkzeug ist nicht `zeichnung` |
| Einheitenwahl | zwei `<input type="radio" name="annotation-unit">` mit `value` `meter`, `fuss` und `<label>` genau `Meter`, `Fuß` |
| Liste | `<ul>` mit einem `<li>` je Anmerkung in Bestandsreihenfolge |
| Eintragstext | ein `<span>` je `<li>` mit genau `<Art>: <Etikett> · <Sichtbarkeit> · <Urheber>` für Messungen (`Strecke`, `Kreis`, `Winkel`) bzw. `Zeichnung · <Sichtbarkeit> · <Urheber>` für Zeichnungen; Sichtbarkeit als `privat`/`geteilt` |
| Entfernen je Eintrag | `<button type="button">` genau `Entfernen` im selben `<li>`, nur wenn `canDeleteAnnotation(annotation, viewer)` |
| Sammelaktionen | `<button type="button">` genau `Meine entfernen`; für `viewer.role === 'spielleiter'` zusätzlich genau `Alle geteilten entfernen` |
| Meldung | `<p role="alert">` in der Raumansicht (nicht im Panel), Text = `message` des Acks |

Tests adressieren über Rolle (`radio`, `button`) und zugänglichen Namen; den
`Entfernen`-Knopf eines Eintrags über `within` des `<li>`, das den Eintragstext enthält.
Die Beschriftung `Bewegen` ist absichtlich nicht `Schwenken`: beide Radiogruppen liegen im
selben DOM, ein gleicher zugänglicher Name wäre für `getByRole` mehrdeutig. Die
Radiogruppen sind über `name` getrennt, damit der Browser sie nicht als eine Gruppe
behandelt.

### D7 — Testaufbau

- **Geometrie-Szenarien** als Unit-Tests gegen die reinen Funktionen aus D2 — dieselbe Art
  wie die Rastergeometrie-Szenarien (#49). Vergleich von Bildkoordinaten mit
  `toBeCloseTo` (Hex-Zellmitten sind irrational); Etiketten als exakte Zeichenketten
  (Mittelpunkt `·`, Durchmesserzeichen `⌀`, Gradzeichen `°`, Komma als Dezimaltrenner).
- **Socket-Szenarien** in der Art der Fog-Socket-Szenarien (echte Socket.IO-Clients, Aufbau
  über Routen: Registrieren, Spielsitzung, Beitritt, Karte anlegen, einhängen,
  `session:activate-map`; Karte ohne Bild reicht — kein `sharp`). Helfer zum direkten
  Anlegen einer Anmerkung über den Prisma-Client der Suite (`points` als JSON-Text,
  `authorId` als `userId`). DB-Aussagen „Anzahl der Anmerkungen dieser Instanz" = `count`
  mit `instanceId`; „mit genau diesen Punkten gespeichert" = Zeile lesen und `points`
  parsen. „erhält kein `session:annotations`" als kurze Wartezeit ohne Ereignis (wie bei
  `session:fog`). Reihenfolge `session:tokens` → `session:annotations` über eine
  gemeinsame Ereignisliste je Client prüfen. Für „Abmeldung wirkt" `POST /api/auth/logout`
  mit dem Cookie, dann dieselbe Verbindung weiterbenutzen (Muster `game-session`).
- **Komponententests** wie die Fog-UI-Szenarien: Mock der Socket-Fassade mit
  aufzeichnenden `createAnnotation`/`deleteAnnotation` (Standard `{ ok: true, annotation }`
  bzw. `{ ok: true }`) und einem auslösbaren `annotations`-Handler; Mock der
  Canvas-Fassade über den auflösbaren Modulschlüssel mit `.js`-Endung, Handle mit
  `setGrid`, `setImage`, `setTokens`, `setFog`, `setTool`, `setSelection`,
  `setAnnotations`, `setAnnotationOptions`, `destroy`. `onAnnotationDrawn` aus den
  Optionen des aufgezeichneten `createMapCanvas`-Aufrufs holen und im Test aufrufen
  (Muster `onCellsSelected`) — innerhalb von `act`. Der Enter-Ack-Mock trägt
  `annotations` (und weiterhin `fog`, `tokens`). `localStorage` vor jedem Test leeren
  (`localStorage.clear()` in `beforeEach`); das Szenario „Einheit wird aus dem Browser
  übernommen" setzt den Wert vor dem Rendern. Elemente nach D6 über `getByRole` mit
  genauem Namen, `queryByRole` für „existiert nicht", `within` für den Knopf eines
  Eintrags; keine `must()`-Helfer.
- Fixtures: Spielleiter `meister` (`userId` `u-meister`), Spieler `sam` (`u-sam`), beide
  ohne Alias; Spielsitzungs-`id` `s1`; Karte „Taverne" `m1` mit Raster `quadrat`, 70, 0, 0;
  Anmerkungs-`id`s `a1`…`a4` in den UI-Szenarien. Punkte der Etikett-Szenarien: (35, 35)
  und (245, 35) → Zellen (0, 0) und (3, 0) → 3 Felder; (35, 35) und (175, 35) → 2 Felder.
- Kein Test importiert `pixi.js`; Ebenen, Gesten, Vorschau und Etiketten auf dem Canvas
  nimmt der App-Test ab.

## Risks / Trade-offs

- **2000 Punkte × viele Striche in jedem `session:annotations`** → vollständiger Bestand je
  Ereignis wie beim Tokenbestand; bei einem Tisch mit wenigen Spielern und Dutzenden
  Strichen ist das im zweistelligen Kilobyte-Bereich. Wächst es, ist ein Delta-Protokoll
  ein eigener Change. Die Obergrenze schützt vor einem Strich mit hunderttausend Punkten.
- **Etikett-Rundung** (Felder erst runden, dann umrechnen, dann runden) → kann vom exakten
  Wert um ein Zehntel abweichen (3,64 Felder → 3,6 → 5,4 m statt 5,46). Bewusst: das
  Etikett zeigt, was der Spieler aus den Feldern selbst nachrechnen würde.
- **Gleiche Millisekunde beim Anlegen** → zweite Sortierung nach `id` (D3); die Reihenfolge
  zweier in derselben Millisekunde angelegter Anmerkungen ist damit stabil, aber nicht
  zwingend die Anlegereihenfolge. In der Praxis irrelevant, in Tests durch sequentielle
  `await`s ausgeschlossen.
- **Winkel-Geste mit drei Klicks** → ein Klick auf einen Token bei aktivem Werkzeug
  `Winkel` zählt als Klick (Token nicht greifbar, D4). Nach `Bewegen` sind Tokens wieder
  greifbar. Ein versehentlich begonnener Winkel wird per Werkzeugwechsel verworfen.
- **`localStorage` gesperrt oder privat** → `try/catch`, Einheit fällt auf `meter` zurück,
  Umschalten wirkt trotzdem für die Sitzung (D5).
- **Bestehende Mocks der Canvas-Fassade** kennen `setAnnotations`/`setAnnotationOptions`
  nicht → tolerante Aufrufe (D4). Bestehende Assertions auf `createMapCanvas` nutzen
  `objectContaining` (geprüft in `session-fog-ui` und `session-map-ui`).
- **Typerweiterung `tool: CanvasTool`** → `FogPanel`-Prop und `MapCanvas`-Prop werden
  weiter; bestehende Aufrufer mit `FogTool` bleiben zuweisbar (Obermenge). Kein
  bestehender Test importiert die Typen.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte.

## Migration Plan

`prisma/schema.prisma` bekommt das Modell `Annotation` und zwei Gegenrelationen; die
Migrations-SQL legt eine Tabelle mit zwei Fremdschlüsseln und einem Index an, fasst sonst
nichts an (D1). Agent nur gegen die Wegwerf-DB; die Entwicklungs-DB migriert der Mensch vor
dem App-Test, produktiv die CI (§5.1, §6.1). Rollback: Tabelle ist neu, kein Code außerhalb
dieses Change liest sie.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Die Regel für verwaiste Anmerkungen
beim Verlassen einer Spielsitzung (D1) wartet auf den Change, der das Verlassen einführt.
