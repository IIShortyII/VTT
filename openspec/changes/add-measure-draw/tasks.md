> Umsetzung über den Harness-Loop (`pnpm harness start 11 add-measure-draw`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/session-annotation/spec.md` — 11 „Messgeometrie", 7 „Anmerkung anlegen", 7
> „Anmerkung entfernen", 3 „Anmerkungsbestand beim Betreten und Kartenwechsel", 19
> „Anmerkungsansicht im Raum") und werden rot bestätigt; der implementer sieht sie nie.
> „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
> Orchestrator. Keine neue Dependency.

## 1. Tests (test-author)

- [ ] 1.1 Unit-Tests in einer neuen Geometrie-Suite (`tests/session-annotation-geometry.unit.test.ts`):
      die 11 Szenarien „Messgeometrie" gegen die reinen Funktionen aus design.md D2
      (`cellDistance`, `snapToCellCenter`, `distanceInFields`, `angleDegrees`,
      `annotationLabel`); Bildkoordinaten mit `toBeCloseTo`, Etiketten als exakte
      Zeichenketten; verifizieren, dass sie rot sind, weil das Modul `shared/annotation`
      fehlt
- [ ] 1.2 Socket-Integrationstests in einer neuen Anmerkungs-Socket-Suite
      (`tests/session-annotation-socket.integration.test.ts`): die 7 Szenarien „Anmerkung
      anlegen", die 7 Szenarien „Anmerkung entfernen" und die Szenarien „Betreten liefert
      den gefilterten Bestand" und „Kartenwechsel verteilt den Bestand der neuen Karte".
      Aufbau wie die Fog-Socket-Szenarien (echte Socket.IO-Clients, Routen,
      `session:activate-map`, Karte ohne Bild); Helfer zum direkten Anlegen von Anmerkungen
      (design.md D7); Reihenfolge `session:tokens` → `session:annotations` über eine
      Ereignisliste je Client; verifizieren, dass die Tests rot sind, weil die Ereignisse
      unbekannt sind, die Tabelle fehlt bzw. `annotations` im Enter-Ack fehlt
      (Prisma-Typfehler beim Rot-Bestätigen unterscheiden)
- [ ] 1.3 Aushängen-Szenario „Aushängen löscht die Anmerkungen" in derselben Suite (Route
      `DELETE /api/sessions/:id/maps/:instanceId`, danach `count`)
- [ ] 1.4 Komponententests in einer neuen Anmerkungs-UI-Suite
      (`tests/session-annotation-ui.unit.test.tsx`): die 19 Szenarien „Anmerkungsansicht im
      Raum"; Mocks nach design.md D7 (Socket-Fassade mit `createAnnotation`/
      `deleteAnnotation` und auslösbarem `annotations`-Handler, Canvas-Fassade mit
      `setAnnotations`/`setAnnotationOptions`/`setTool`); Elemente nach der
      Schnittstellentabelle in design.md D6 über Testing-Library-Abfragen (`within` für den
      `Entfernen`-Knopf eines Eintrags), keine `must()`-Helfer; `localStorage.clear()` in
      `beforeEach`; verifizieren, dass sie rot sind, weil Panel, Fassadenmethoden und
      `annotations` im Zustand fehlen

## 2. Schema (implementer)

- [ ] 2.1 `prisma/schema.prisma`: Modell `Annotation` nach design.md D1 und die
      Gegenrelationen `annotations Annotation[]` an `MapInstance` und `User`;
      Migrationsdatei `prisma/migrations/<stamp>_add-annotation/migration.sql` (ein
      `CREATE TABLE` mit `ON DELETE CASCADE` zur Instanz und `ON DELETE SET NULL` zum
      Nutzer, ein Index auf `instanceId`) nach dem Muster von
      `20260911130000_add-token-owner` und `20260911160000_add-fog-of-war`; verifizieren
      mit `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB nicht anfassen
      (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [ ] 3.1 `src/shared/annotation.ts` (neu): Konstanten, Wertemengen mit zod-Enums
      (`ANNOTATION_KINDS`, `ANNOTATION_MODES`, `ANNOTATION_VISIBILITIES`,
      `ANNOTATION_COLORS`, `DISTANCE_UNITS`, `ANNOTATION_TOOLS`, `CANVAS_TOOLS`),
      `ANNOTATION_COLOR_HEX`, `PointSchema`, `PointListSchema`,
      `CreateAnnotationInputSchema` mit `superRefine`, `DeleteAnnotationTargetSchema`,
      `DeleteAnnotationInputSchema`, `AnnotationSchema`, Acks, `AnnotationsEvent`,
      `SESSION_ANNOTATION_EVENTS`, `AnnotationViewer`, Helfer `isAnnotationTool`,
      `filterAnnotationsFor`, `canDeleteAnnotation`, `cellDistance`, `snapToCellCenter`,
      `distanceInFields`, `angleDegrees`, `formatNumber`, `fieldsWord`, `convertFields`,
      `unitSuffix`, `annotationLabel` (design.md D2); kein serverseitiger Import;
      `EnterAck` in `src/shared/session.ts` um `annotations: Annotation[]` ergänzen;
      verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [ ] 4.1 `src/server/session/annotations.ts` (neu): `toAnnotation`, `loadAnnotations`,
      `loadAnnotationsFor`, `broadcastAnnotations`, Handler `session:annotation-create`
      (Parse → `authorizeAction` ohne Rolle → aktive Instanz mit Karte → Einrasten bei
      `gerastert` → `create` → `broadcastAnnotations` → Ack) und
      `session:annotation-delete` (Ziele `eine`/`meine`/`geteilte` nach design.md D3, Meldungen
      wortgleich mit der Spec) sowie `registerAnnotationHandlers`; verifizieren mit
      `pnpm typecheck:src`
- [ ] 4.2 `src/server/session/socket.ts`: `annotations` im Enter-Ack,
      `registerAnnotationHandlers` in der `connection`-Registrierung,
      `broadcastAnnotations` nach `broadcastTokens` in `handleActivateMap`;
      `src/server/session/maps.ts`: dasselbe beim Aushängen der aktiven Instanz (design.md
      D3); verifiziert durch die Socket-Szenarien im Gate

## 5. Client (implementer)

- [ ] 5.1 `src/client/session/socket.ts`: `createAnnotation`, `deleteAnnotation`,
      `on('annotations')`, `wireEventFor` (design.md D5); verifizieren mit
      `pnpm typecheck:src`
- [ ] 5.2 `src/client/map/canvas.ts`: Werkzeugtyp `CanvasTool`, Optionen `annotations`,
      `annotationOptions`, `onAnnotationDrawn`; Zeichnungsebene zwischen Auswahl- und
      Tokenebene, Messebene und Vorschau-Ebene über den Tokens (alle `eventMode = 'none'`);
      `drawAnnotations` mit Etiketten aus `annotationLabel`; Gesten für Strecke, Kreis,
      Winkel (drei Klicks) und Zeichnung mit Einrasten bei `gerastert`; Token-`pointerdown`
      und Bühnen-`pointerdown` verzweigen bei jedem Werkzeug außer `schwenken`;
      Handle-Methoden `setAnnotations`/`setAnnotationOptions`, `setTool` verwirft eine
      laufende Geste; `Text`-Objekte beim Neuaufbau zerstören (design.md D4).
      `src/client/map/MapCanvas.tsx`: Props durchreichen, tolerante Aufrufe,
      `latestPropsRef` erweitern; verifizieren mit `pnpm typecheck:src`
- [ ] 5.3 `src/client/session/AnnotationPanel.tsx` (neu): Panel genau nach der
      Schnittstellentabelle in design.md D6, ohne lokalen Zustand;
      `src/client/session/FogPanel.tsx`: Prop `tool: CanvasTool` (kein Verhaltenswechsel)
- [ ] 5.4 `src/client/session/SessionRoom.tsx`: ein Werkzeugzustand `tool: CanvasTool` für
      beide Panels, Zustand `annotations`/`annotationMode`/`annotationVisibility`/
      `annotationColor`/`distanceUnit` (aus dem Browserspeicher, `try/catch`)/
      `annotationError`, `annotationOptions` per `useMemo`, Handler nach design.md D5
      (Einrasten bei `gerastert` vor dem Senden, nie lokale Bestandsänderung),
      `socket.on('annotations')`, `AnnotationPanel` bei aktiver Karte für jede Rolle, `<p
      role="alert">` für `annotationError`; bestehende Szenarien der Sitzungsoberfläche,
      Karten-, Fog- und Tokenansicht bleiben grün; verifiziert im Gate

## 6. Abschluss

- [ ] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 6.2 App-Test durch den Menschen (Dev-DB vorher migrieren; zwei Browser oder Profile:
      Spielleiter `meister` und Spieler `sam`; Karte mit Quadratraster aktiv, später eine
      Hex-Karte): `sam` wählt `Strecke`, `Gerastert`, `Geteilt`, zieht über drei Felder →
      Linie mit Etikett `3 Felder (4,5 m)` bei beiden; `Frei` → Etikett mit Nachkommastelle;
      `Kreis` → Kreis mit `r … · ⌀ …`; `Winkel` mit drei Klicks → Bogen und Gradzahl;
      `Zeichnen` mit `Blau`, `Privat` → Strich nur bei `sam`, in der Liste von `meister`
      nicht vorhanden und in keiner Netzwerkantwort von `meister`; `Fuß` wählen → alle
      Etiketten in ft, Reload → `Fuß` bleibt; `meister` entfernt die geteilte Strecke von
      `sam` → bei beiden weg; `sam` sieht bei der Zeichnung von `meister` (geteilt) keinen
      `Entfernen`-Knopf; `Meine entfernen`, `Alle geteilten entfernen`; Fog: geteilter Strich
      über verdecktem Gebiet ist bei `sam` sichtbar (bewusst, proposal.md); Ebenen: Strich
      unter Token, Messetikett über Token; Tokens sind bei Messwerkzeug nicht greifbar, bei
      `Bewegen` wieder; Kartenwechsel weg und zurück, Reload, Serverneustart → Anmerkungen
      erhalten; Hex-Karte: gerasterte Strecke rastet auf Hex-Mitten, Etikett zählt
      Hex-Schritte
- [ ] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-measure-draw/` verschieben
      (Delta in `openspec/specs/session-annotation/` (neu) einsynchronisieren; danach
      prüfen, ob die Abschnitte „Drahtformat" von `session-map` und `game-session`
      `annotations` im Enter-Ack und `session:annotations` nach `session:tokens` nennen —
      das Delta trägt sie nur im Vorspann) und PR mit `Closes #11` öffnen (constitution.md
      §3.6)
