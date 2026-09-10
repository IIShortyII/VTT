> Umsetzung über den Harness-Loop (`pnpm harness start 49 add-map-library`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/map-library/spec.md`, 40 Szenarien) und werden rot bestätigt; der implementer sieht
> sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite
> über den Orchestrator.

## 1. Tests (test-author)

- [x] 1.1 Integrationstests für die 18 REST-Szenarien der Requirements „Kartenrouten
      verlangen eine Anmeldung", „Karte anlegen", „Meine Karten", „Karte ändern",
      „Kartenbild hochladen", „Kartenbild abrufen" und „Karte löschen" — `app.inject()` mit
      Cookie aus einer Registrierung, eigene Suite-DB über den bestehenden Wegwerf-DB-Helfer,
      eigenes Upload-Verzeichnis per `mkdtemp` an `createApp({ uploadDir })`, in `afterAll`
      entfernt; Bild-Bodies als Buffer mit Signatur plus Füllbytes, „zu groß" als
      `MAX_IMAGE_BYTES + 1`; DB-Aussagen aus `GameMap`, Verzeichnisaussagen per `readdir`
      (design.md D10); verifizieren, dass sie rot sind aus dem erwarteten Grund (Route fehlt
      → `404` statt `201`/`200`), nicht aus Setup-Gründen (§3.1). Hinweis: bis die Migration
      aus 2.1 existiert, fehlt die Tabelle — Tests, die sie lesen, scheitern dann an
      Prisma-Typen bzw. am Datenbankzugriff; beim Rot-Bestätigen unterscheiden
- [x] 1.2 Unit-Tests für die 11 Szenarien der Requirement „Rastergeometrie" gegen
      `src/shared/grid.ts` (`cellCenter`, `cellAt`, `cellCorners`, `cellRange`; Vergleich auf
      zwei Nachkommastellen) und die 3 Szenarien der Requirement „Sicht mit Schwenken und
      Zoomen" gegen `src/client/map/viewport.ts` (`zoomAt`, `panBy`); verifizieren, dass sie
      rot sind, weil die Module fehlen
- [x] 1.3 Komponententests für die 8 Szenarien der Requirement „Bibliotheksoberfläche"
      (eigene Unit-Testdatei mit jsdom-Docblock; `fetch` gemockt nach Pfad und Methode, `PUT`-
      Body und `Content-Type` im Mock festgehalten; Canvas-Fassade `src/client/map/canvas.ts`
      per Modul-Mock ersetzt, Handle mit `setGrid`/`setImage`/`destroy` als `jest.fn`;
      Dateiwahl per `fireEvent.change` mit `File`; Einstieg über die gerenderte `App` mit
      `/api/auth/me`, `/api/sessions` und `/api/maps` im Mock); verifizieren, dass sie rot
      sind, weil Bibliothek, Kartenansicht und Fassade fehlen

## 2. Schema (implementer)

- [x] 2.1 `prisma/schema.prisma`: Modell `GameMap` und Gegenrelation `maps` an `User` nach
      design.md D1; Migrationsdatei `prisma/migrations/<stamp>_add-map-library/migration.sql`
      nach dem Muster der bestehenden Migrationen von Hand (eine Tabelle, Index auf
      `ownerId`, Fremdschlüssel mit `ON DELETE CASCADE`); verifizieren mit `pnpm db:generate`
      und `pnpm typecheck:src`. Entwicklungs-DB nicht anfassen (§5.1)

## 3. Gemeinsamer Vertrag und Geometrie (implementer)

- [x] 3.1 `src/shared/map.ts`: `GRID_TYPES`, `GridSchema` (Grenzen aus der Spec),
      `DEFAULT_GRID`, `IMAGE_MIME_TYPES`, `MAX_IMAGE_BYTES`, `CreateMapInputSchema`,
      `UpdateMapInputSchema` (mindestens `name` oder `grid`), `MapSummarySchema`
      (design.md D5); kein serverseitiger Import; verifizieren mit `pnpm typecheck:src`
- [x] 3.2 `src/shared/grid.ts`: `cellCenter`, `cellAt`, `cellCorners`, `cellRange` für
      `quadrat`, `hex-spitz` (odd-r) und `hex-flach` (odd-q) nach design.md D6 — Umkreisradius
      `size/√3`, Ecken in Zeichenreihenfolge, Punkt→Zelle bei Hex über Axialkoordinaten und
      Würfelrundung, Zellbereich vollständig (bei Hex mit Rand); verifiziert durch die
      Geometrie-Szenarien im Gate

## 4. Server (implementer)

- [x] 4.1 `src/server/core/config.ts`: `uploadDir` aus `UPLOAD_DIR` (Default
      `./data/uploads`, absolut aufgelöst); verifizieren mit `pnpm typecheck:src`
- [x] 4.2 `src/server/map/storage.ts`: `detectSignature` (PNG/JPEG/WebP), `writeImage`
      (Dateiname `<mapId>-<token>.<ext>`, Token aus `crypto.randomBytes`), `removeImage`
      (`ENOENT` protokolliert, sonst weiterwerfen), `imagePath`; alles mit injiziertem
      Verzeichnis über `node:fs/promises` (design.md D2); verifizieren mit `pnpm typecheck:src`
- [x] 4.3 `src/server/map/rules.ts`: `findOwnMap(prisma, userId, id)` mit Besitzer in der
      `where`-Klausel, `toMapSummary(map)` (vier Rasterspalten → `grid`, `hasImage`),
      Umrechnung `grid` → Spalten (design.md D1, D4); verifizieren mit `pnpm typecheck:src`
- [x] 4.4 `src/server/map/routes.ts`: `GET /api/maps` (eigene Karten nach `createdAt`),
      `POST /api/maps` (`400` + `field: 'name'`, `201`, Standardraster), `PATCH /api/maps/:id`
      (`400` + `field` aus dem zod-Pfad, `404` mit einer Meldung für fremd/unbekannt, `200`),
      `PUT /api/maps/:id/image` (Header-Prüfung → `415`, leerer Body → `400`, Signatur → `400`,
      `404` für fremd/unbekannt, Schreiben → DB → alte Datei löschen → `200`),
      `GET /api/maps/:id/image` (`404` für fremd/unbekannt/ohne Bild, sonst `200` mit
      `Content-Type` und `Cache-Control: private, no-store`), `DELETE /api/maps/:id` (`404`,
      sonst DB-Zeile dann Datei, `204`); Sitzungsauflösung wie in `session/routes.ts`
      (design.md D3, D4); verifiziert durch die REST-Szenarien im Gate
- [x] 4.5 `src/server/core/app.ts`: Content-Type-Parser für die drei Bildtypen mit
      `parseAs: 'buffer'` und `bodyLimit: MAX_IMAGE_BYTES`; Option `uploadDir` (Default aus
      `loadConfig()`); `onReady` legt das Verzeichnis rekursiv an;
      `registerMapRoutes(app, { prisma, clock, uploadDir })` (design.md D2, D3); verifizieren
      mit `pnpm typecheck:src` und `pnpm lint`

## 5. Client (implementer)

- [x] 5.1 `src/client/map/viewport.ts`: `View`, `panBy`, `zoomAt`, `clampScale` auf
      `[0.1, 8]` (design.md D7), ohne PixiJS-Import; verifiziert durch die Sicht-Szenarien im
      Gate
- [x] 5.2 `src/client/map/api.ts`: `listMaps`, `createMap`, `updateMap`, `uploadMapImage`
      (`PUT` mit `body: file` und `Content-Type` aus `file.type`), `deleteMap`, `mapImageUrl`;
      `credentials: 'include'`, Antworten durch die `shared/`-Schemas geparst, Fehlerform wie
      `client/session/api.ts` (design.md D9); verifizieren mit `pnpm typecheck:src`
- [x] 5.3 `src/client/map/canvas.ts`: einziges Modul mit `pixi.js`-Import;
      `createMapCanvas(container, { imageUrl, grid })` → Handle `setGrid`/`setImage`/`destroy`
      — `Application.init` mit `resizeTo`, Sprite über `Assets.load` mit Zähler-Query und
      `Assets.unload` beim Wechsel, `Graphics`-Raster aus `cellRange` + `cellCorners`,
      Schwenken per Pointer-Ereignisse, Zoomen per `wheel` um den Zeiger über `zoomAt`,
      `destroy` genau einmal mit `app.destroy(true, { children: true, texture: true })`
      (design.md D8); verifizieren mit `pnpm typecheck:src` und `pnpm lint`; Verhalten im
      App-Test
- [x] 5.4 `src/client/map/MapCanvas.tsx`: `ref`-Element, `useEffect` lädt die Fassade per
      dynamischem `import()` und erzeugt den Canvas (kein statischer Import von `canvas.ts`
      — sonst hängt `pixi.js` an der Importkette der `App`), `cancelled`-Flag für Unmount vor
      Auflösung, `setGrid`/`setImage` bei Prop-Änderung,
      `destroy` im Cleanup (design.md D9); verifiziert durch die Szenarien „Karte öffnen",
      „Gespeichertes Raster kommt vom Server" und „Verlassen gibt die Kartenansicht frei"
- [x] 5.5 `src/client/map/MapLibrary.tsx`: Liste mit Namen und „ohne Bild"-Kennzeichen,
      Formular „Neue Karte" (Name + Dateiwahl mit `accept`), Detailansicht mit `MapCanvas`,
      Formular für Name/Typ/Zellgröße/Versatz, „Bild ersetzen", „Löschen" → „Wirklich
      löschen", „Zurück"; Meldungen des Servers als `role="alert"`; Canvas zeigt nur
      Serverantworten (design.md D9); verifiziert durch die übrigen Bibliotheks-Szenarien
- [x] 5.6 `src/client/session/SessionList.tsx` (Schaltfläche „Kartenbibliothek",
      `onOpenLibrary`) und `src/client/app/App.tsx` (Zustand `bibliothek`, `MapLibrary` mit
      `onBack`); bestehende Szenarien der Sitzungs- und Anmeldeoberfläche bleiben grün;
      verifiziert im Gate

## 6. Abschluss

- [x] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [x] 6.2 Session (rollenlos nach dem Review): `data/` in `.gitignore`, `UPLOAD_DIR` in
      `.env.example` dokumentieren; verifizieren mit `git status` (kein Upload im Index)
- [x] 6.3 App-Test durch den Menschen: Bibliothek öffnen, Karte mit PNG anlegen, Raster
      `quadrat` auf ein Kartenbild einpassen (Größe, Versatz), auf `hex-spitz` und `hex-flach`
      umschalten und prüfen, dass das Raster die Ausrichtung des Bildes trifft, Schwenken per
      Ziehen, Zoomen per Mausrad um den Zeiger, Bild ersetzen (neues Bild sichtbar, alte Datei
      weg), zehnmal zwischen Liste und Karte wechseln ohne WebGL-Warnung in der Konsole,
      Löschen mit Rückfrage, Bild-URL in einem zweiten, nicht angemeldeten Tab → `401`
- [x] 6.4 Change nach `openspec/changes/archive/YYYY-MM-DD-add-map-library/` verschieben
      und PR mit `Closes #49` öffnen (constitution.md §3.6)
