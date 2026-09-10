> Umsetzung über den Harness-Loop (`pnpm harness start 50 add-session-map`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/session-map/spec.md`, 30 Szenarien, plus die 4 **neuen** Szenarien des Deltas
> `specs/map-library/spec.md` — die dort wiederholten bestehenden Szenarien sind bereits
> durch die vorhandene Suite abgedeckt und bleiben unverändert) und werden rot bestätigt;
> der implementer sieht sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die
> vollständige Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [x] 1.1 Integrationstests für die 9 REST-Szenarien der Requirements „Instanzrouten
      verlangen den Spielleiter", „Karte einhängen", „Eingehängte Karten auflisten" und
      „Karte aushängen" (ohne das Socket-Szenario „Aushängen der aktiven Karte leert den
      Raum") sowie die 4 neuen Szenarien des `map-library`-Deltas („Mitglied erhält das Bild
      der aktiven Karte", „Eingehängte, nicht aktive Karte bleibt für Mitglieder unsichtbar",
      „Eingehängte Karte kann nicht gelöscht werden", „Nach dem Aushängen ist die Karte
      löschbar") — `app.inject()` mit Cookies aus Registrierungen, Spielsitzungen und
      Mitgliedschaften über die bestehenden Routen, Karten und Bilder wie in #49 mit
      Wegwerf-Upload-Verzeichnis, DB-Aussagen aus `MapInstance` und
      `GameSession.activeInstanceId` (design.md D8); verifizieren, dass sie rot sind aus dem
      erwarteten Grund (Route fehlt → `404` statt `201`/`200`/`204`; Bildroute liefert dem
      Mitglied `404` statt `200`; Löschen liefert `204` statt `409`), nicht aus
      Setup-Gründen (§3.1). Hinweis: bis die Migration aus 2.1 existiert, fehlen Tabelle
      und Spalte — Tests, die sie lesen, scheitern dann an Prisma-Typen bzw. am
      Datenbankzugriff; beim Rot-Bestätigen unterscheiden
- [x] 1.2 Socket-Integrationstests für die 6 Szenarien der Requirement „Aktive Karte
      setzen", die 2 Szenarien von „Betreten liefert die aktive Karte", die 2 Szenarien von
      „Änderung der Bibliothekskarte erreicht aktive Räume" und das Szenario „Aushängen der
      aktiven Karte leert den Raum" — echte Socket.IO-Clients gegen die lauschende App wie
      in den bestehenden Raum-Tests, `session:map` per Ereignis-Handler abgewartet, „kein
      `session:map`" als kurze Wartezeit ohne Ereignis (design.md D8); verifizieren, dass sie
      rot sind, weil das Ereignis unbekannt ist bzw. `map` im Enter-Ack fehlt
- [x] 1.3 Komponententests für die 11 Szenarien der Requirement „Kartenansicht im Raum"
      (eigene Unit-Testdatei mit jsdom-Docblock; Socket-Fassade `src/client/session/socket.ts`
      gemockt mit aufzeichnendem `activateMap` und auslösbarem `map`-Handler; Canvas-Fassade
      `src/client/map/canvas.ts` über den auflösbaren Pfad mit `.js`-Endung gemockt, Handle
      mit `setGrid`/`setImage`/`destroy` als `jest.fn`; `fetch` nach Pfad und Methode gemockt
      für `/api/auth/me`, `/api/sessions`, `/api/sessions/<id>/maps` und `/api/maps`; Elemente
      über `getByRole`/`getByLabelText`/`getByText` nach der Schnittstellentabelle in
      design.md D7); verifizieren, dass sie rot sind, weil Kartenansicht, Hinweis und
      Kartenverwaltung im Raum fehlen

## 2. Schema (implementer)

- [x] 2.1 `prisma/schema.prisma`: Modell `MapInstance` mit `@@unique([sessionId, mapId])`
      und `@@index([mapId])`, Gegenrelationen `instances` an `GameSession` und `GameMap`,
      Zeiger `activeInstanceId String? @unique` mit Relation `activeInstance` (`SetNull`) an
      `GameSession` nach design.md D1; Migrationsdatei
      `prisma/migrations/<stamp>_add-session-map/migration.sql` nach dem Muster der
      bestehenden Migrationen von Hand (Tabelle mit Fremdschlüsseln `ON DELETE CASCADE` zur
      Spielsitzung und `ON DELETE RESTRICT` zur Karte, Unique- und Index-Anweisung, nullable
      Spalte plus Unique-Index an `GameSession`); verifizieren mit `pnpm db:generate` und
      `pnpm typecheck:src`. Entwicklungs-DB nicht anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [x] 3.1 `src/shared/session-map.ts`: `MapInstanceSchema`, `ActiveMapSchema`,
      `MountMapInputSchema`, `ActivateMapInputSchema` (`instanceId` nullable, nicht optional),
      Typen `ActivateMapAck`/`MapEvent`, `SESSION_MAP_EVENTS` (design.md D5); kein
      serverseitiger Import; verifizieren mit `pnpm typecheck:src`
- [x] 3.2 `src/shared/session.ts`: `EnterAck` um `map: ActiveMap | null` erweitern
      (design.md D5); verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [x] 4.1 `src/server/session/active-map.ts`: `toActiveMap`, `loadActiveMap`,
      `emitActiveMap`, `broadcastMapChanged` (design.md D4); verifizieren mit
      `pnpm typecheck:src`
- [x] 4.2 `src/server/session/maps.ts`: `findLedSession` (Spielleiter-Mitgliedschaft in der
      `where`-Klausel, design.md D3), `GET /api/sessions/:id/maps` (aufsteigend nach
      `position`), `POST /api/sessions/:id/maps` (`400` + `field: 'mapId'`, Karte über
      `findOwnMap` → `404`, Position max+1 in einer Transaktion, `P2002` → `409`, `201`),
      `DELETE /api/sessions/:id/maps/:instanceId` (Instanz mit `id` und `sessionId`, `404`;
      bei aktiver Instanz Zeiger und Instanz in einer Transaktion, danach `session:map` mit
      `null`; `204`); `requireUser`/`sendError` wie `session/routes.ts`; verifiziert durch
      die REST-Szenarien im Gate
- [x] 4.3 `src/server/session/socket.ts`: Ereignis `session:activate-map` (zod-Parse →
      `authorizeAction` mit Rolle `spielleiter` → Instanz mit `sessionId` laden oder `null`
      → Zeiger setzen → `loadActiveMap` + `emitActiveMap` → Acknowledgement mit der
      geladenen Darstellung); `session:enter`-Acknowledgement um `map` aus `loadActiveMap`
      ergänzen (design.md D2, D4); verifiziert durch die Socket-Szenarien im Gate
- [x] 4.4 `src/server/map/rules.ts`: `findViewableMap` (Besitzer oder Mitglied einer
      Spielsitzung, deren aktive Instanz auf die Karte zeigt, design.md D6);
      `src/server/map/routes.ts`: `GET /api/maps/:id/image` über `findViewableMap`, `DELETE`
      mit Instanz-Zählung → `409`, `PATCH` ruft nach dem `update` `broadcastMapChanged`;
      `registerMapRoutes` bekommt `io`; verifiziert durch die Bild-, Lösch- und
      Rasteränderungs-Szenarien im Gate
- [x] 4.5 `src/server/core/app.ts`: `registerSessionMapRoutes(app, { prisma, clock, io,
      presence })` und `io` an `registerMapRoutes` (design.md D2); verifizieren mit
      `pnpm typecheck:src` und `pnpm lint`

## 5. Client (implementer)

- [x] 5.1 `src/client/session/socket.ts`: `activateMap(sessionId, instanceId | null)` mit
      Acknowledgement und `on('map', …)` für `session:map` (design.md D7); verifizieren mit
      `pnpm typecheck:src`
- [x] 5.2 `src/client/session/maps-api.ts`: `listSessionMaps`, `mountMap`, `unmountMap` mit
      `credentials: 'include'`, Antworten durch die `shared/`-Schemas geparst, Fehlerform
      wie `client/session/api.ts` (design.md D7); verifizieren mit `pnpm typecheck:src`
- [x] 5.3 `src/client/session/MapPanel.tsx`: Überschrift `Karten`, Liste der Instanzen mit
      Schaltflächen `Aktivieren`/`Aushängen` (`aria-label` `<Name> aktivieren` /
      `<Name> aushängen`), Formular mit `<select name="mapId">` (Label `Karte aus der
      Bibliothek`, nur nicht eingehängte eigene Karten) und `Einhängen`, Schaltfläche
      `Keine Karte anzeigen`, Meldungen als `role="alert"`, Listen beim Mounten und nach
      Einhängen/Aushängen laden (design.md D7, Schnittstellentabelle); verifiziert durch die
      Verwaltungs-Szenarien im Gate
- [x] 5.4 `src/client/session/SessionRoom.tsx`: `map` aus dem Enter-Ack im Zustand,
      `socket.on('map', …)`, Absatz `Aktive Karte: <Name>` bzw. `Keine Karte aktiv`,
      `MapCanvas` mit `mapImageUrl(map.mapId)`/`null` und `grid` ohne `key` aus der
      `instanceId`, `MapPanel` nur bei Rolle `spielleiter` mit `onActivate` über die Fassade
      und Anzeige eines abgelehnten Acknowledgements (design.md D7); bestehende Szenarien
      der Sitzungsoberfläche bleiben grün; verifiziert im Gate

## 6. Abschluss

- [x] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [x] 6.2 App-Test durch den Menschen (zwei Browser, Spielleiter und Spieler): Karte aus der
      Bibliothek in eine geöffnete Spielsitzung einhängen, aktivieren → beide sehen dieselbe
      Karte mit Raster; zweite Karte einhängen und aktivieren → Wechsel erreicht den Spieler
      ohne Neuladen; in der Bibliothek das Raster der aktiven Karte ändern → Raum folgt;
      `Keine Karte anzeigen` → Hinweis bei beiden; aktive Karte aushängen → Hinweis bei
      beiden; eingehängte Karte in der Bibliothek löschen → Ablehnung mit Meldung; Bild-URL
      der aktiven Karte im Spieler-Tab öffnen → Bild, Bild-URL einer nicht aktiven
      eingehängten Karte → `404`; Spieler-Tab zeigt keine Kartenverwaltung
- [x] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-session-map/` verschieben
      (Deltas auf die Hauptspecs anwenden) und PR mit `Closes #50` öffnen
      (constitution.md §3.6)
