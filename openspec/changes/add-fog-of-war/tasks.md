> Umsetzung über den Harness-Loop (`pnpm harness start 16 add-fog-of-war`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/session-fog/spec.md` — 15 „Aufdecken und Verdecken durch den Spielleiter", 6
> „Bereiche verwalten", 4 „Fog beim Betreten und Kartenwechsel", 7 „Kartenbild der
> Spielsitzung", 16 „Fog-Ansicht im Raum" — plus die geänderten Szenarien aus den
> MODIFIED-Deltas: 2 in `session-map` „Kartenansicht im Raum", 1 geändertes in `map-library`
> „Kartenbild abrufen") und werden rot bestätigt; der implementer sieht sie nie. „Gate grün"
> heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den Orchestrator.

## 0. Dependency (Mensch, vor dem test-author)

- [ ] 0.1 Im Feature-Worktree `pnpm add sharp` ausführen und `package.json` +
      `pnpm-lock.yaml` committen (`chore(deps): sharp für die Fog-Maskierung (#16)`) —
      freigegeben in der Explore-Runde (design.md D10, constitution.md §5.2)

## 1. Tests (test-author)

- [ ] 1.1 Socket-Integrationstests in einer neuen Fog-Socket-Suite: 14 der 15 Szenarien
      „Aufdecken und Verdecken durch den Spielleiter" („Alles aufdecken bei einer Karte mit
      Bild" wandert nach 1.3), die 6 Szenarien „Bereiche verwalten" und die 4 Szenarien „Fog
      beim Betreten und Kartenwechsel". Aufbau wie die Token-Socket-Szenarien
      (echte Socket.IO-Clients, Routen, `session:activate-map`); Helfer zum direkten Anlegen
      aufgedeckter Zellen und Bereiche (design.md D9); Reihenfolge `session:map` →
      `session:fog` → `session:tokens` über eine Ereignisliste je Client; verifizieren, dass
      die Tests rot sind, weil die Ereignisse unbekannt sind, die Tabellen fehlen bzw. `fog`
      im Enter-Ack fehlt (Prisma-Typfehler beim Rot-Bestätigen unterscheiden)
- [ ] 1.2 Aushängen-Szenario „Aushängen löscht aufgedeckte Zellen und Bereiche" in derselben
      Suite (Route `DELETE /api/sessions/:id/maps/:instanceId`, danach `count` je Tabelle)
- [ ] 1.3 REST-Integrationstests in einer neuen Kartenbild-Suite: die 7 Szenarien
      „Kartenbild der Spielsitzung" und „Alles aufdecken bei einer Karte mit Bild"; Bilder per
      `sharp` erzeugen und dekodieren (design.md D9); verifizieren, dass sie rot sind, weil
      die Route `404` liefert (unbekannte Route) bzw. das Ereignis unbekannt ist
- [ ] 1.4 Bestehende Bildroute: das Szenario „Mitglied erhält das Bild der aktiven Karte"
      auf seine neue Aussage umstellen (Bibliotheksroute `404` wie `unbekannt`, Sitzungsroute
      `200` mit `image/webp`; MODIFIED-Delta `map-library`); rot, weil die Bibliotheksroute
      heute `200` liefert und die Sitzungsroute fehlt
- [ ] 1.5 Komponententests in einer neuen Fog-UI-Suite: die 16 Szenarien „Fog-Ansicht im
      Raum"; Mocks nach design.md D9 (Socket-Fassade mit `setFog`/`createFogArea`/
      `deleteFogArea` und auslösbarem `fog`-Handler, Canvas-Fassade mit `setFog`/`setTool`/
      `setSelection`); Elemente nach der Schnittstellentabelle in design.md D8 über
      Testing-Library-Abfragen, keine `must()`-Helfer; verifizieren, dass sie rot sind, weil
      Fog-Verwaltung, Fassadenmethoden und Bild-URL fehlen
- [ ] 1.6 Bestehende Kartenansichts-Szenarien: „Raum mit aktiver Karte zeigt die
      Kartenansicht" und „Kartenwechsel folgt dem Server" auf die neue Bild-URL umstellen
      (MODIFIED-Delta `session-map`); Enter-Ack-Mock um `fog` ergänzen; rot, weil die
      Anwendung heute `/api/maps/<mapId>/image` verwendet

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: `MapInstance.fogVersion` (`Int`, Default 0) und die
      Gegenrelationen `fogCells`/`fogAreas`; Modelle `FogCell`, `FogArea`, `FogAreaCell`
      nach design.md D1; Migrationsdatei
      `prisma/migrations/<stamp>_add-fog-of-war/migration.sql` (`ALTER TABLE … ADD COLUMN`
      mit Default, drei `CREATE TABLE` mit `ON DELETE CASCADE`, zwei Unique-Indizes, ein
      Index) nach dem Muster von `20260911150000_add-token-share`; verifizieren mit
      `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB nicht anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [ ] 3.1 `src/shared/fog.ts` (neu): Konstanten, `CellSchema`, `CellListSchema`,
      `FogAreaNameSchema`, `FogTargetSchema`, `SetFogInputSchema`,
      `CreateFogAreaInputSchema`, `DeleteFogAreaInputSchema`, `FogAreaViewSchema`,
      `FogStateSchema`, `FogAck`, `FogEvent`, `SESSION_FOG_EVENTS`, `FOG_TOOLS`/`FogTool`,
      Helfer `cellKey`, `cellsInRange`, `isAreaRevealed`, `redactFog` (design.md D2); kein
      serverseitiger Import; verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [ ] 4.1 `src/server/map/storage.ts`: `imageSize` über `sharp` (design.md D5);
      `src/server/map/rules.ts`: `findViewableMap` entfernen; `src/server/map/routes.ts`:
      `GET /api/maps/:id/image` über `findOwnMap`
- [ ] 4.2 `src/server/session/fog.ts` (neu): `toFogState`, `loadFog`, `loadFogFor`,
      `broadcastFog`, `resolveTargetCells`, Handler `session:fog-set`,
      `session:fog-area-create`, `session:fog-area-delete` (Reihenfolge zod-Parse →
      `authorizeAction` mit Rolle `spielleiter` → aktive Instanz → Regel → Transaktion in
      Blöcken von 500 → Versionserhöhung nur bei Zellenänderung → `broadcastFog` → Ack) und
      `registerFogHandlers` (design.md D3)
- [ ] 4.3 `src/server/session/socket.ts`: `fog` im Enter-Ack, `registerFogHandlers` in der
      `connection`-Registrierung, `broadcastFog` zwischen `emitActiveMap` und
      `broadcastTokens` in `handleActivateMap`; `src/server/session/maps.ts`: dasselbe beim
      Aushängen der aktiven Instanz (design.md D3)
- [ ] 4.4 `src/server/session/map-image.ts` (neu): `renderMaskedImage`,
      `createMaskedImageCache`, Route `GET /api/sessions/:id/map-image` (design.md D4);
      `src/server/core/app.ts`: Route registrieren; verifiziert durch die Bild-Szenarien im
      Gate

## 5. Client (implementer)

- [ ] 5.1 `src/client/session/socket.ts`: `setFog`, `createFogArea`, `deleteFogArea`,
      `on('fog')`, `wireEventFor` (design.md D7); `src/client/session/fog-api.ts` (neu):
      `sessionMapImageUrl`; verifizieren mit `pnpm typecheck:src`
- [ ] 5.2 `src/client/map/canvas.ts`: Optionen `fog`, `tool`, `selection`,
      `onCellsSelected`; Fog-Ebene und Auswahl-Ebene zwischen Raster und Tokenebene;
      `drawFog`/`drawSelection`; Werkzeuge mit Zellrechteck-Auswahl beim Ziehen;
      Handle-Methoden `setFog`/`setTool`/`setSelection`; Aufräumen in `destroy` (design.md
      D6). `src/client/map/MapCanvas.tsx`: Props durchreichen, tolerante Aufrufe,
      `latestPropsRef` erweitern
- [ ] 5.3 `src/client/session/FogPanel.tsx` (neu): Fog-Verwaltung genau nach der
      Schnittstellentabelle in design.md D8; lokaler Zustand nur für das Namensfeld
- [ ] 5.4 `src/client/session/SessionRoom.tsx`: Zustand `fog`/`fogTool`/`fogSelection`/
      `fogError`, Bild-URL über `sessionMapImageUrl` je Rolle, Fog-Ebene per `useMemo`,
      Handler nach design.md D7, `FogPanel` nur für den Spielleiter bei aktiver Karte,
      `<p role="alert">` für `fogError`; bestehende Szenarien der Sitzungsoberfläche,
      Kartenansicht und Tokenansicht bleiben grün; verifiziert im Gate

## 6. Abschluss

- [ ] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 6.2 App-Test durch den Menschen (Dev-DB vorher migrieren; zwei Browser oder Profile:
      Spielleiter und Spieler `sam`): Karte mit Bild aktivieren → `sam` sieht nur dunkle
      Fläche, in den DevTools (Netzwerk) ist die Antwort von `map-image` ein vollständig
      transparentes WebP; Spielleiter sieht das ganze Bild mit halbtransparentem Fog;
      Werkzeug `Aufdecken`, Rechteck ziehen → bei `sam` erscheint genau dieser Ausschnitt,
      die Netzwerkantwort zeigt nur ihn; `Verdecken` über einen Teil → verschwindet bei
      `sam`; `Bereich markieren`, zwei Rechtecke ziehen, `Bereichsname` „Raum 1", `Bereich
      speichern` → Bereich gelistet, nicht angekreuzt; `Raum 1 aufgedeckt` ankreuzen →
      Ausschnitt bei `sam` sichtbar; abwählen → verschwindet; `Alles aufdecken`/`Alles
      verdecken`; Hex-Karte dasselbe; Kartenwechsel weg und zurück → Fog erhalten; Reload bei
      `sam` und Serverneustart → Fog erhalten; Tokens bleiben in verdeckten Zellen sichtbar
      (bewusst, #17); `sam` findet in keiner Netzwerkantwort Bereichsnamen
- [ ] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-fog-of-war/` verschieben
      (Deltas in `openspec/specs/session-fog/` (neu), `session-map/` und `map-library/`
      einsynchronisieren; danach prüfen, ob die Abschnitte „Begriffe"/„Drahtformat" der
      beiden geänderten Hauptspecs die neue Bild-URL und `fog` im Enter-Ack nennen — das
      Delta trägt sie nur im Vorspann) und PR mit `Closes #16` öffnen (constitution.md §3.6)
