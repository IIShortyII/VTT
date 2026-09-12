## Why

Seit #50 sehen alle Teilnehmer dieselbe aktive Karte — vollständig. Ein Spielleiter kann
damit keine vorbereitete Karte zeigen, ohne sie zu verraten: er müsste sie vorher
zuschneiden. Dieser Change (Issue #16, Teil von Epic #9) bringt Fog of War: eine Karte
startet verdeckt, der Spielleiter deckt Zellen auf und verdeckt sie wieder — einzeln, als
gespeicherten Bereich oder die ganze Karte. **Ab hier ist das VTT im Alltag brauchbar.**

Das ist der härteste Fall von `constitution.md` §9.2: verdeckte Information verlässt den
Server nicht. Ein schwarzes Overlay über der vollständigen Karte erfüllt diesen Change
nicht, auch wenn es identisch aussieht — der Payload an einen Spieler-Client enthält den
verdeckten Bereich nicht, weder als Bild noch als Bereichsliste des Spielleiters.

Entscheidungen aus der Explore-Runde mit dem Menschen (2026-09-11):
- **Datenmodell: aufgedeckte Zellen** im vorhandenen Raster (`shared/grid.ts`), eine Zeile je
  Zelle — keine Polygone, keine Rechteckliste.
- **Gruppierung: beides** — benannte, gespeicherte Bereiche, die der Spielleiter vorbereitet
  und per Klick umschaltet, **und** ein Ad-hoc-Werkzeug, das beim Ziehen auf der Karte einen
  Zellbereich sofort aufdeckt oder verdeckt.
- **Bildauslieferung: serverseitig maskiert** mit der neuen Dependency `sharp`
  (freigegeben): ein Spieler erhält ein Bild gleicher Größe, in dem jeder nicht aufgedeckte
  Bildpunkt transparent ist. Die Bildabmessungen sind damit erkennbar — bewusst akzeptiert.
- **Nur manuelles Aufdecken.** Ein dynamisches Sichtfeld aus Tokenposition und Wänden ist
  ein eigenes Kind des Epics.

## What Changes

- **Aufgedeckte Zellen je Karteninstanz.** Neue Tabelle `FogCell` (Instanz, `col`, `row`,
  je Instanz eindeutig) und eine Spalte `fogVersion` an `MapInstance`. Eine neue Instanz hat
  keine Zeilen — die Karte startet vollständig verdeckt. Aushängen löscht per Cascade.
- **Bereiche.** Neue Tabellen `FogArea` (Instanz, Name) und `FogAreaCell` (Bereich, `col`,
  `row`). Ein Bereich ist eine gespeicherte Zellauswahl; ihn aufzudecken oder zu verdecken
  heißt, seine Zellen aufzudecken oder zu verdecken. „Gilt als aufgedeckt" ist abgeleitet
  (alle Zellen aufgedeckt), nicht gespeichert — damit gibt es keinen Konflikt zwischen
  Bereich und Ad-hoc-Werkzeug: die Zellmenge ist die einzige Wahrheit.
- **Drei Socket-Ereignisse, nur Spielleiter.** `session:fog-set` `{ sessionId, revealed,
  target }` mit Ziel `zellen` (1–10000 Zellen), `bereich` (`areaId`) oder `alle`;
  `session:fog-area-create` `{ sessionId, name, cells }`; `session:fog-area-delete`
  `{ sessionId, areaId }`. Jedes mit Acknowledgement `{ ok: true, fog }` bzw. `{ ok: false,
  message }`.
- **Fog-Darstellung pro Empfänger.** `session:fog` `{ sessionId, fog }` je Verbindung: der
  Spielleiter erhält aufgedeckte Zellen und Bereiche (`{ id, name, cellCount, revealed }`),
  ein Spieler die aufgedeckten Zellen und `areas: null`. Das Enter-Acknowledgement trägt
  `fog`; nach jedem `session:map` folgt `session:fog` vor `session:tokens`.
- **Maskiertes Kartenbild.** Neue Route `GET /api/sessions/:id/map-image`: dem Spielleiter das
  Original, einem Spieler ein WebP mit Alphakanal, in dem nur die Bildpunkte aufgedeckter
  Zellen (Zellpolygone aus `shared/grid.ts`) sichtbar sind — gerendert mit `sharp`, ein
  Render je Fog-Version, gecacht und von allen Spielern geteilt. Die Bibliotheksroute
  `GET /api/maps/:id/image` liefert wieder nur dem Besitzer.
- **Raumansicht.** Kartenansicht mit Fog-Ebene (deckend für Spieler, halbtransparent für den
  Spielleiter), Bild-URL über die neue Route (für Spieler mit `?fog=<version>`). Für den
  Spielleiter eine Fog-Verwaltung: Werkzeugwahl `Schwenken`/`Aufdecken`/`Verdecken`/`Bereich
  markieren` (Ziehen auf der Karte wählt einen Zellbereich), `Alles aufdecken`/`Alles
  verdecken`, Bereich aus der Auswahl speichern, je Bereich ein Kontrollkästchen `<Name>
  aufgedeckt` und `<Name> löschen`.

**Nicht im Umfang:** Sichtbarkeit von Tokens in verdeckten Bereichen (→ #17, Tokens bleiben
wie bisher für alle sichtbar); dynamisches Sichtfeld; andere Auswahlformen als
Zellrechtecke; Rückgängig; Umbenennen oder Bearbeiten eines Bereichs (löschen und neu
anlegen); Zuschneiden des Bilds auf die aufgedeckte Bounding-Box.

## Capabilities

### New Capabilities

- `session-fog`: Aufdecken und Verdecken durch den Spielleiter (15 Szenarien), Bereiche
  verwalten (6), Fog beim Betreten und Kartenwechsel (4), Kartenbild der Spielsitzung (7),
  Fog-Ansicht im Raum (16).

### Modified Capabilities

- `session-map`: Requirement „Kartenansicht im Raum" — Bild-URL wird
  `/api/sessions/<sessionId>/map-image` (Spieler mit `?fog=<version>`); die Szenarien „Raum
  mit aktiver Karte zeigt die Kartenansicht" und „Kartenwechsel folgt dem Server" ändern ihre
  THEN-Klausel entsprechend, die übrigen neun bleiben unverändert.
- `map-library`: Requirement „Kartenbild abrufen" — wieder nur der Besitzer; das Szenario
  „Mitglied erhält das Bild der aktiven Karte" ändert seine Aussage (Bibliotheksroute `404`,
  Sitzungsroute `200`), die übrigen vier bleiben unverändert.

## Impact

**Dependency (neu, freigegeben):** `sharp` (`^0.35`) — Bilddekodierung, Maskierung und
WebP-Kodierung auf dem Server; Node kann Bilder ohne Bibliothek nicht dekodieren. Prebuilt
Binaries für Windows/Linux. **Der Mensch installiert sie im Feature-Worktree**
(`pnpm add sharp`) und committet `package.json` und `pnpm-lock.yaml`, bevor der test-author
startet — die Tests erzeugen und dekodieren Bilder damit.

**Schema** (`prisma/schema.prisma`): Spalte `MapInstance.fogVersion` (`Int`, Default 0);
Modelle `FogCell` (`instanceId`, `col`, `row`, `@@unique([instanceId, col, row])`),
`FogArea` (`instanceId`, `name`, `createdAt`), `FogAreaCell` (`areaId`, `col`, `row`,
`@@unique([areaId, col, row])`); Cascade von Instanz bzw. Bereich. Migration nur gegen die
Wegwerf-DB (§5.1, §6.1); die Dev-DB migriert der Mensch vor dem App-Test.

**Geänderter Code:**
- `src/shared/fog.ts` (neu) — Vertrag: Zelle, Ziel, Fog-Darstellung, Inputs, Acks,
  Ereignisnamen, reine Helfer (`cellKey`, `cellsInRange`, `redactFog`, `isAreaRevealed`)
- `src/server/session/fog.ts` (neu) — Laden, Filtern, Verteilen, drei Handler
- `src/server/session/map-image.ts` (neu) — Route `GET /api/sessions/:id/map-image`,
  Maskierung mit `sharp`, Render-Cache
- `src/server/map/storage.ts` — Bildabmessungen lesen (`imageSize`)
- `src/server/map/rules.ts` — `findViewableMap` entfällt; `src/server/map/routes.ts` —
  Bildroute über `findOwnMap`
- `src/server/session/socket.ts` — Enter-Ack `fog`, `session:fog` nach `session:map`,
  Registrierung der Fog-Handler; `src/server/session/maps.ts` — `session:fog` beim
  Aushängen der aktiven Instanz; `src/server/core/app.ts` — Route registrieren
- `src/client/session/socket.ts` — `setFog`, `createFogArea`, `deleteFogArea`, `on('fog')`
- `src/client/map/canvas.ts` — Fog-Ebene, Auswahl-Ebene, Werkzeuge, `setFog`/`setTool`/
  `setSelection`, `onCellsSelected`; `src/client/map/MapCanvas.tsx` — Props durchreichen
- `src/client/session/FogPanel.tsx` (neu) — Fog-Verwaltung; `src/client/session/fog-api.ts`
  (neu) — Bild-URL der Spielsitzung; `src/client/session/SessionRoom.tsx` — Zustand,
  Handler, Bild-URL, Fog-Ebene

**Bestehende Tests:** zwei Szenarien der Kartenansicht im Raum (`session-map`) und zwei der
Bildroute (`map-library`) ändern ihre Aussage (siehe Modified Capabilities) — der
test-author passt genau diese an. Mocks der Canvas-Fassade aus früheren Changes kennen
`setFog`/`setTool`/`setSelection` nicht — die Kartenansicht ruft sie tolerant auf (Muster
`setTokens` aus #14). Acknowledgements gemockter Fassaden ohne `fog` werden als `null`
gelesen. Alle übrigen Szenarien von `session-token`, `session-map`, `map-library` und
`game-session` bleiben unverändert grün.
