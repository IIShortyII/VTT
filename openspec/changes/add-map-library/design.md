## Context

Vorhanden aus #12/#13/#6/#45: Fastify-Instanz als Funktion (`createApp`, injizierbare Uhr
und Prisma), Cookie-Sitzung (`sid`) mit `resolveSession`, der `src/`-Schnitt
`server/ · client/ · shared/`, REST-Routen mit `requireUser`-Muster und `sendError`-Form,
Client ohne Router mit Zuständen `liste`/`raum` in der angemeldeten `App`, Integrationstests
über `app.inject()` gegen eine Suite-eigene Wegwerf-DB, Komponententests unter jsdom mit
gemocktem `fetch` und gemockter Socket-Fassade. `pixi.js@8` liegt in `package.json`, wurde
aber nie importiert; die Jest-Konfiguration kennt kein PixiJS.

Die Entscheidungen zu Ablage, Rastermodell, Bibliothek und Zuschnitt sind in der
Explore-Runde zu #7 mit dem Menschen gefallen (2026-09-10, Kommentar in #7) und werden hier
begründet, nicht neu verhandelt. Motivation: `proposal.md` — Why. Verhalten:
`specs/map-library/spec.md`. Bindend und hier nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- Eine Ablage für Kartenbilder, die Backup (DB-Datei plus Ordner), Wiederverwendung und
  §9.2 (kein erratbarer Pfad) zugleich erfüllt — ohne neue Dependency.
- Rastergeometrie als eine Quelle in `shared/`, die #8 (Einrasten), #9 (Fog) und #11
  (Messen) unverändert benutzen; drei Rastertypen von Anfang an, weil die Ausrichtung das
  Kartenbild vorgibt.
- Genau ein Modul, das PixiJS importiert, und das als Mock-Grenze der Komponententests dient.
- So viel Verhalten wie möglich testbar: Routen, Geometrie, Sichtmathematik, Oberfläche bis
  zur Fassade. Das Zeichnen selbst nimmt der Mensch ab (§3.4).

**Non-Goals:**
- Kein Einhängen in Spielsitzungen, kein Broadcast, keine Löschsperre (#50). Das Modell
  `GameMap` bekommt hier keine Relation zu `GameSession`; die Instanz entsteht in #50.
- Keine serverseitige Bildverarbeitung (Maße lesen, skalieren, Thumbnails). Der Server kennt
  Typ und Bytes, sonst nichts; die Bildmaße kennt der Client nach dem Laden der Textur.
- Keine ETag-/Revalidierungslogik für Bilder (siehe D4, Trade-off).
- Kein Router, keine UI-Bibliothek (Fortsetzung von #12 D7/D8, #6).

## Decisions

### D1 — Datenmodell

```prisma
model GameMap {
  id          String   @id @default(cuid())
  ownerId     String
  name        String
  imageFile   String?            // vom Server vergebener Dateiname im Upload-Verzeichnis
  imageType   String?            // 'image/png' | 'image/jpeg' | 'image/webp'
  gridType    String             // 'quadrat' | 'hex-spitz' | 'hex-flach'
  gridSize    Int
  gridOffsetX Int
  gridOffsetY Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  @@index([ownerId])
}
```

`User` bekommt die Gegenrelation `maps GameMap[]`; sonst bleibt `user-auth` unangetastet.

- **`GameMap`, nicht `Map`**: `Map` ist ein globaler JavaScript-Typ; ein generierter
  Prisma-Typ dieses Namens würde ihn in jedem Import überdecken. Gleiches Muster wie
  `GameSession`. In Prosa „Karte".
- **Raster als vier Spalten, nicht als JSON**: SQLite-JSON über Prisma ist ein String ohne
  Typ; vier Spalten sind abfragbar, migrierbar und in der DB-Aussage eines Tests direkt
  prüfbar. Auf der Leitung ist das Raster trotzdem das verschachtelte Objekt `grid` — die
  Umrechnung liegt in `server/map/rules.ts` (`toMapSummary`), analog zu `toSessionSummary`.
- **`gridType`/`imageType` als `String` mit zod-Enum an der Grenze**, kein Prisma-`enum`
  (Begründung wie #6 D2). Zeilen werden beim Lesen durch das Schema geparst, nie gecastet.
- **`imageFile` nullable**: eine Karte ohne Bild ist ein gültiger Zustand (angelegt, Upload
  scheitert oder steht noch aus). `hasImage` ist auf der Leitung `imageFile !== null`.
- Keine Bildmaße in der DB (Non-Goal).

### D2 — Dateiablage neben der DB

Upload-Verzeichnis aus `UPLOAD_DIR` (Default `./data/uploads`, relativ zum
Arbeitsverzeichnis; `loadConfig()` liefert es absolut aufgelöst). `createApp` nimmt
`uploadDir` als Option entgegen, damit jede Testsuite ein eigenes temporäres Verzeichnis
benutzt — dieselbe Naht wie `prisma`/`clock`. Beim Start (`onReady`) wird das Verzeichnis
rekursiv angelegt.

Dateiname: `<mapId>-<token>.<ext>` mit `token` aus 8 Hex-Zeichen (`crypto.randomBytes`) und
`ext` aus einer festen Tabelle je MIME-Typ (`png`, `jpg`, `webp`). Nichts davon stammt vom
Client — der Pfad wird immer aus `uploadDir` und dem in der DB gespeicherten `imageFile`
gebildet, nie aus Anfrageparametern. Damit ist Path-Traversal strukturell ausgeschlossen, und
das Token sorgt dafür, dass ein Ersetzen nie in dieselbe Datei schreibt, die gerade
ausgeliefert wird.

Reihenfolge beim Upload: (1) Signatur prüfen, (2) neue Datei schreiben, (3) DB-Zeile auf die
neue Datei setzen, (4) alte Datei löschen. Scheitert (3), wird die neue Datei entfernt und der
Fehler weitergeworfen; scheitert (4) mit `ENOENT`, ist das Ziel bereits erreicht und wird nur
protokolliert — jeder andere Fehler in (4) wandert zum zentralen Handler (AGENTS.md: kein
stilles `catch {}`, aber Idempotenz ist kein Verschlucken). Löschen einer Karte: erst die
DB-Zeile, dann die Datei mit derselben `ENOENT`-Regel.

`server/map/storage.ts` kapselt das: `detectSignature(bytes)` (liefert den MIME-Typ zur
Signatur oder `null`), `writeImage(dir, mapId, type, bytes)`, `removeImage(dir, fileName)`,
`imagePath(dir, fileName)`. Alles über `node:fs/promises` mit injiziertem Verzeichnis, damit
Tests gegen `os.tmpdir()` laufen.

Verworfen: *Blob in der DB* (SQLite-Datei wächst um Megabytes je Karte, jede Auslieferung
lädt den ganzen Blob) und *externe URL* (§9.2-Verstoß, weil jeder mit der URL die Karte sieht).

### D3 — Upload als roher Body, kein Multipart

`app.addContentTypeParser` für die drei Bildtypen mit `parseAs: 'buffer'` und
`bodyLimit: MAX_IMAGE_BYTES` (20 MiB). Ein größerer Body scheitert bereits im Parser mit
Fastifys `FST_ERR_CTP_BODY_TOO_LARGE` (`statusCode` 413), den der zentrale Fehler-Handler
unverändert mit Statuscode und Meldung beantwortet. Der Parser ist global registriert, aber
nur die Bildroute erwartet einen Buffer.

Die Route prüft den `Content-Type`-Header **selbst** gegen die erlaubte Liste und antwortet
sonst `415` — sie verlässt sich nicht darauf, dass Fastify unbekannte Typen ablehnt, denn
Fastify bringt Parser für `application/json` und `text/plain` von Haus aus mit, und ein
`text/plain`-Body käme als String bis in die Route. Ein leerer Body antwortet `400`.

Signaturprüfung (D2) gegen den angegebenen Typ: PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG
`FF D8 FF`, WebP `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`. Passt die Signatur nicht zum Header,
`400` — ein umbenannter Nicht-Bild-Upload landet so nie auf der Platte mit einem Bild-Typ.

Client: `fetch` mit `method: 'PUT'`, `body: file`, `Content-Type` aus `file.type`,
`credentials: 'include'`. Multipart (`@fastify/multipart`) wäre eine neue Dependency (§5.2)
für einen Zusatznutzen — mehrere Felder in einer Anfrage —, den dieser Change nicht hat:
Name und Raster sind eigene Aktionen.

### D4 — Auslieferung über eine geprüfte Route

`GET /api/maps/:id/image`: `requireUser` → Karte laden **mit** `ownerId` des Anfragenden
in der `where`-Klausel (`findFirst({ where: { id, ownerId } })`) → ohne Treffer `404` mit
derselben Meldung wie für eine unbekannte `id` → ohne `imageFile` ebenfalls `404` → Datei
lesen, `Content-Type` aus `imageType`, `Cache-Control: private, no-store`, Buffer senden.

Die Besitzerprüfung ist Teil der Abfrage, nicht ein `if` danach: es gibt keinen Codepfad, der
eine fremde Karte in der Hand hält. Dasselbe Muster gilt für `PATCH`, `PUT` und `DELETE`
(`server/map/rules.ts`: `findOwnMap(prisma, userId, id)`). In #50 wird diese eine Funktion
um „oder Mitglied einer Spielsitzung, in der die Karte eingehängt ist" erweitert — eine
Stelle, nicht vier.

`no-store` statt ETag: Ein ersetztes Bild hat dieselbe URL; mit Browser-Cache sähe der
Besitzer nach dem Ersetzen das alte Bild. ETag mit `304` wäre die sparsame Lösung, kostet aber
Code und Szenarien für einen Gewinn, der erst bei vielen Betrachtern (#50) zählt. Trade-off
unten notiert.

Kein `@fastify/static`, kein Ordner unter `public/`: eine statische Auslieferung wäre genau
der erratbare Pfad, den §9.2 verbietet.

### D5 — Gemeinsamer Vertrag (`shared/map.ts`)

- `GRID_TYPES`, `GridTypeSchema`, `GridSchema` (`type`, `size` ganzzahlig 8–2000,
  `offsetX`/`offsetY` ganzzahlig −2000–2000), `DEFAULT_GRID`.
- `IMAGE_MIME_TYPES` (die drei Typen), `MAX_IMAGE_BYTES`.
- `CreateMapInputSchema` (`name` getrimmt, 1–60 — dieselbe Regel wie der Sitzungsname),
  `UpdateMapInputSchema` (`name?`, `grid?`, mindestens eines von beiden per `refine`),
  `MapSummarySchema` (`id`, `name`, `hasImage`, `grid`).
- Fehlerfeld: `400` trägt `field: 'name'` bzw. `field: 'grid'` — das erste zod-Issue
  entscheidet anhand seines Pfads.

Kein serverseitiger Import (Folgeregel aus #5 D1).

### D6 — Rastergeometrie (`shared/grid.ts`)

Reine Funktionen über `Grid` aus D5, Punkte als `{ x, y }`, Zellen als `{ col, row }`:

- `cellCenter(grid, cell): Point`
- `cellAt(grid, point): Cell`
- `cellCorners(grid, cell): Point[]` — 4 bzw. 6 Ecken in Zeichenreihenfolge
- `cellRange(grid, width, height): { minCol, maxCol, minRow, maxRow }`

**Koordinatensystem.** `quadrat`: Zelle `(col, row)` belegt
`[offsetX + col·size, offsetX + (col+1)·size) × [offsetY + row·size, …)`. `hex-spitz`
(„odd-r"): Umkreisradius `R = size/√3`, Breite `w = size`, Höhe `h = 2R`, Zeilenabstand
`0.75·h`; Mittelpunkt `x = offsetX + w·(col + 0.5 + (row ungerade ? 0.5 : 0))`,
`y = offsetY + R + row·0.75·h`. `hex-flach` („odd-q"): Höhe `h = size`, Breite `w = 2R`,
Spaltenabstand `0.75·w`; Mittelpunkt `x = offsetX + R + col·0.75·w`,
`y = offsetY + h·(row + 0.5 + (col ungerade ? 0.5 : 0))`. „Ungerade" heißt `row % 2 !== 0`
— gilt so auch für negative Zahlen (−1 ist ungerade).

**Ecken.** Bei `hex-spitz` Winkel 30°, 90°, …, 330° um den Mittelpunkt (y nach unten, also
beginnt die Folge rechts unten und läuft im Uhrzeigersinn); bei `hex-flach` 0°, 60°, …,
300°. Bei `quadrat` links oben, rechts oben, rechts unten, links unten.

**Punkt → Zelle** bei Hex über Axialkoordinaten und Würfelrundung (Red Blob Games), danach
Umrechnung in odd-r bzw. odd-q. Bei `quadrat` ist es `Math.floor` je Achse.

**Zellbereich**: Mindestens alle Zellen, die das Rechteck schneiden — für `quadrat` exakt
(`cellAt` der beiden Eckpunkte), für Hex großzügig (Eckpunkte plus eine Zelle Rand je
Richtung). Die Spec verlangt Vollständigkeit, nicht Minimalität; die Fassade zeichnet die
Randzellen einfach mit.

Warum `shared/` und nicht `client/`: Fog (#9) entscheidet serverseitig, welche Zellen ein
Spieler sieht; das ist dieselbe Geometrie.

Warum kein „nur Quadrate, Hex später": in der Explore-Runde entschieden — Hex-Karten kommen
fertig gezeichnet in einer der beiden Ausrichtungen, das Raster muss darüber passen, und
`size` als Kantenabstand ist für alle drei Typen dieselbe Größe.

### D7 — Sichtmathematik (`client/map/viewport.ts`)

`View = { x, y, scale }`, `panBy(view, dx, dy)`, `zoomAt(view, cursor, factor)` mit
`clampScale` auf `[0.1, 8]`. Zoom um einen Punkt: Bildpunkt unter dem Zeiger
`p = (cursor − (x, y)) / scale`, neue Skala `s' = clamp(scale·factor)`, neue Lage
`(x, y)' = cursor − p·s'`. Reine Funktionen ohne PixiJS-Import, direkt testbar; die Fassade
(D8) wendet die Sicht nur auf den Wurzel-Container an (`position`, `scale`).

Nicht synchronisiert, nicht gespeichert (Explore-Runde): der Spielleiter zieht die Sicht
der Spieler nicht mit; jeder schaut, wohin er will.

### D8 — PixiJS hinter einer Fassade (`client/map/canvas.ts`)

Das einzige Modul, das `pixi.js` importiert:

`createMapCanvas(container: HTMLElement, options: { imageUrl: string | null; grid: Grid })`
liefert `Promise<MapCanvasHandle>` mit `setGrid(grid)`, `setImage(url | null)`,
`destroy()`.

- PixiJS 8: `new Application()` und `await app.init({ resizeTo: container, background,
  antialias })`, `container.appendChild(app.canvas)`.
- Bild: `Assets.load(url)` → `Sprite`. Die URL ist same-origin (`/api/maps/:id/image` über
  den Vite-Proxy bzw. denselben Host), der Browser schickt das Cookie von selbst; kein
  Sonderfall im Loader. Weil der Server `no-store` sendet, aber `Assets` seinen eigenen
  Cache nach URL führt, hängt `setImage` einen Zähler als Query-Parameter an und ruft vor dem
  Laden `Assets.unload` für die vorige URL — sonst zeigt „Bild ersetzen" die alte Textur.
- Raster: ein `Graphics`-Objekt, das für jede Zelle aus `cellRange(grid, textureWidth,
  textureHeight)` die `cellCorners` als Linienzug zeichnet; ohne Bild wird eine feste Fläche
  (z. B. 1000 × 1000) gerastert, damit das Raster auch vor dem ersten Upload sichtbar ist.
  `setGrid` zeichnet neu, tauscht nichts aus.
- Sicht: Wurzel-Container mit `position`/`scale` aus D7. Schwenken über `pointerdown`/
  `pointermove`/`pointerup` auf dem Canvas (Stage `eventMode: 'static'`, `hitArea` =
  Bildschirm), Zoomen über `wheel` mit `preventDefault`, Faktor `1.1` bzw. `1/1.1` je
  Rad-Schritt, um den Zeiger.
- `destroy()`: Listener entfernen, `Assets.unload(url)`, `app.destroy(true, { children:
  true, texture: true })`. Genau einmal; ein zweiter Aufruf ist ein No-op.

**Warum die Fassade die Mock-Grenze ist und nicht `moduleNameMapper`.** AGENTS.md und #7
nahmen ein Mapping für `pixi.js` an. Ein Mapping ersetzt die Bibliothek durch eine Attrappe,
die jede benutzte Klasse (`Application`, `Assets`, `Sprite`, `Graphics`, `Container`) mit
plausibler Oberfläche nachbilden müsste — und die Tests prüften dann Aufrufe an die
Attrappe, also PixiJS-Interna statt Verhalten. Die Fassade hat drei Methoden, ist die
natürliche Grenze zwischen „was gezeichnet werden soll" (testbar: welche Bild-URL, welches
Raster, wurde freigegeben) und „wie es gezeichnet wird" (App-Test), und ihr Mock ist eine
Zeile im Test. Dasselbe Muster hat #6 mit der Socket-Fassade gewählt. Die Jest-Konfiguration
bleibt unangetastet; kein Test importiert `pixi.js`.

### D9 — Client-Ansichten

`App` bekommt den dritten angemeldeten Zustand `bibliothek` neben `liste` und `raum`;
`SessionList` bekommt eine Schaltfläche „Kartenbibliothek" (`onOpenLibrary`). Die
bestehenden Szenarien der Sitzungsoberfläche bleiben unberührt.

- `client/map/api.ts`: `listMaps`, `createMap`, `updateMap`, `uploadMapImage(id, file)`,
  `deleteMap`, `mapImageUrl(id)` — Antworten durch die `shared/`-Schemas geparst, Fehlerform
  wie `client/session/api.ts` (`{ ok: false, message, field? }`).
- `client/map/MapCanvas.tsx`: dünner React-Rahmen um die Fassade — `useEffect` erzeugt den
  Canvas im `ref`-Element, reagiert auf Änderungen von `grid`/`imageUrl` per `setGrid`/
  `setImage`, ruft `destroy` im Cleanup. **Die Fassade wird erst beim Mounten per
  dynamischem `import()` geladen**, nicht statisch am Modulanfang: `App` importiert
  `MapLibrary`, und ein statischer Import würde `pixi.js` in die Importkette jeder Ansicht
  ziehen — im Browser ein unnötig großes Startbündel, unter Jest ein Ladefehler in *jeder*
  Suite, die die `App` rendert (PixiJS zieht `earcut` als reines ES-Modul nach, das Jest im
  CJS-Modus nicht laden kann). Kein Modul außerhalb von `MapCanvas.tsx` importiert die
  Fassade; nur der Typ `MapCanvasHandle` darf statisch (`import type`) bezogen werden. Ein `cancelled`-Flag verhindert, dass ein nach dem
  Unmount aufgelöstes `createMapCanvas` einen verwaisten Canvas hinterlässt (dann sofort
  `destroy`).
- `client/map/MapLibrary.tsx`: Zustand `liste` (Karten mit Name und „ohne Bild"-Kennzeichen,
  Formular „Neue Karte" mit Name und `<input type="file" accept="image/png,image/jpeg,
  image/webp">`) und `detail` mit `MapCanvas`, Formular (Name, Typ als `<select>`, Zellgröße,
  Versatz x/y, „Speichern"), „Bild ersetzen" (Dateiwahl löst den Upload aus), „Löschen" →
  zweite Schaltfläche „Wirklich löschen" (kein `window.confirm`: nicht testbar ohne Mock,
  und ein zweiter Klick ist als Bestätigung ausreichend), „Zurück".
- „Neue Karte": `createMap` → bei Erfolg `uploadMapImage` → Liste neu laden. Scheitert der
  Upload, bleibt die Karte ohne Bild und die Meldung des Servers steht als `role="alert"`.
- Server-Autorität: Detailansicht und Canvas zeigen ausschließlich die Karte, die die
  jeweils letzte Antwort geliefert hat (`setGrid` mit `result.map.grid`, nie mit dem
  Formularwert). Das ist das Szenario „Gespeichertes Raster kommt vom Server".

### D10 — Testaufbau

- **REST-Szenarien**: `app.inject()` mit Cookie aus einer Registrierung, eigene Suite-DB
  über den bestehenden Wegwerf-DB-Helfer, eigenes Upload-Verzeichnis per `mkdtemp` unter
  `os.tmpdir()`, an `createApp({ uploadDir })` übergeben, in `afterAll` rekursiv entfernt.
  Bild-Bodies als `Buffer` mit der jeweiligen Signatur plus beliebigen Füllbytes (die
  Signaturprüfung liest nur den Anfang; der Server dekodiert nichts). „Zu groß" = ein
  `Buffer.alloc(MAX_IMAGE_BYTES + 1)` mit PNG-Signatur. DB-Aussagen direkt aus `GameMap`;
  Verzeichnisaussagen per `readdir`.
- **Geometrie und Sicht**: Unit-Tests direkt gegen `shared/grid.ts` und
  `client/map/viewport.ts`, Vergleich auf zwei Nachkommastellen (`toBeCloseTo(…, 2)`).
- **Komponententests**: jsdom-Docblock, `fetch` gemockt (Antworten nach Pfad und Methode
  unterschieden, `PUT`-Body und `Content-Type` werden im Mock festgehalten), Canvas-Fassade
  per Modul-Mock ersetzt — der Mock liefert ein Handle mit drei `jest.fn`, sodass „erzeugt
  mit URL und Raster", „`setGrid` mit dem Serverwert" und „`destroy` genau einmal" prüfbar
  sind. Der Mock muss den **auflösbaren** Modulpfad der Fassade treffen (mit `.js`-Endung,
  wie `MapCanvas` sie importiert; der `moduleNameMapper` löst ihn auf die `.ts`-Datei auf).
  Ein *virtueller* Mock unter einem anderen Schlüssel greift nicht, sobald die Datei
  existiert — Jest lädt dann die echte Fassade samt PixiJS. Dateiwahl über
  `fireEvent.change` mit einem `File`-Objekt.
- Kein Test importiert `pixi.js`.

## Risks / Trade-offs

- **Erster PixiJS-Code, ungetestet bis zum App-Test** → Die Fassade ist bewusst klein und
  hat keine Logik außer Zeichnen und Ereignissen; alle Rechnung liegt in D6/D7 und ist
  getestet. Der App-Test prüft: Bild sichtbar, Raster passt bei allen drei Typen, Schwenken,
  Zoomen um den Zeiger, kein Speicherleck beim Wechseln (DevTools → Memory, oder Konsole
  ohne WebGL-Warnungen nach zehn Wechseln).
- **`app.init` ist asynchron** → `MapCanvas` behandelt Unmount vor Auflösung (D9,
  `cancelled`-Flag). Ohne das bliebe ein Canvas ohne Eigentümer zurück — genau das Leck aus
  #7 „Fallstricke".
- **20-MB-Body im Test** → `Buffer.alloc(20 MiB + 1)` einmal je Suite ist unkritisch; Fastify
  bricht beim Parser ab, bevor die Route läuft.
- **`no-store` für Bilder** → Jeder Aufbau der Kartenansicht lädt das Bild neu. Für einen
  Besitzer in seiner Bibliothek unerheblich; mit vielen Spielern (#50) wird ein ETag mit
  `304` sinnvoll — dann als eigene Requirement dort, nicht stillschweigend hier.
- **`UPLOAD_DIR` relativ zum Arbeitsverzeichnis** → Wer den Server aus einem anderen
  Verzeichnis startet, bekommt einen anderen Ordner. `loadConfig()` löst den Pfad absolut auf
  und der Startlog nennt ihn; `.env.example` dokumentiert die Variable.
- **Fastify-Fehlercodes** → `413` kommt aus dem Parser als `FST_ERR_CTP_BODY_TOO_LARGE`
  mit `statusCode` 413; der zentrale Handler reicht ihn durch. Sollte eine Fastify-Version
  hier abweichen, fällt es am Szenario „Zu großes Bild" auf, nicht im Betrieb.
- **Guard blockt `prisma migrate dev` mit Inline-`DATABASE_URL`** → Die Migrationsdatei
  entsteht nach dem Muster der bestehenden von Hand; der Integrationslauf (`migrate deploy`
  gegen die Wegwerf-DB) verifiziert sie, `pnpm db:generate` den Client.
- **`.gitignore` und `.env.example` liegen außerhalb aller Rollenpfade** → Die Session
  ergänzt beide nach grünem Gate und Review, vor dem PR (tasks.md, Abschluss) — in dieser
  Phase ist sie rollenlos.

## Migration Plan

`prisma/schema.prisma` bekommt `GameMap` und die Gegenrelation an `User`; die
Migrations-SQL legt eine Tabelle und einen Index an, fasst bestehende Tabellen nicht an. Der
Agent führt sie nur gegen die Wegwerf-DB aus; Entwicklungs-DB migriert der Mensch, produktiv
die CI (§5.1, §6.1). Rollback: Tabelle ist neu und trägt keine Daten, an denen anderes hängt;
das Upload-Verzeichnis kann stehen bleiben oder gelöscht werden.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Bildmaße auf dem Server (für ein
serverseitiges Fog-Raster in #9) entscheidet #9 selbst — hier reicht der Client.
