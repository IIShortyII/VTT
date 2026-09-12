## Why

Seit #16 sehen alle Teilnehmer dieselbe aktive Karte mit Fog of War und seit #14 die Tokens
darauf — aber niemand kann auf dieser Karte etwas *zeigen*: wie weit der Feuerball reicht,
ob die Bewegung bis zur Tür langt, „der Gang geht hier lang". Dieser Change (Issue #11)
bringt das Mess- und Zeichenwerkzeug: Strecke, Kreis und Winkel messen, in Feldern nach
5e-Maß mit Umrechnung in Meter oder Fuß, und Freihandstriche auf die Karte legen — beides
privat für den Urheber allein oder geteilt mit allen im Raum.

Die Vertrauensgrenze (`constitution.md` §9) gilt auch für eine Linie: eine private Messung
eines Spielers oder eine private Skizze des Spielleiters verlässt den Server nur in Richtung
ihres Urhebers. Wer eine Anmerkung sieht, entscheidet der Server je Verbindung — nicht ein
Client, der sie ausblendet.

Entscheidungen aus der Explore-Runde mit dem Menschen (2026-09-12):
- **Messungen und Zeichnungen sind persistiert** an der Karteninstanz und bleiben liegen,
  bis sie entfernt werden — kein flüchtiger Zweitkanal.
- **Zwei Sichtbarkeiten:** `privat` (nur der Urheber) und `geteilt` (alle im Raum). Jeder
  Teilnehmer, Spieler wie Spielleiter, darf beides anlegen.
- **Zwei Messmodi:** `gerastert` (Zellmitte zu Zellmitte, Metrik = Zellabstand: Chebyshev
  im Quadratraster, Würfelabstand im Hexraster — die 5e-Regel „Diagonale zählt 1") und
  `frei` (Luftlinie in Zellgrößen, eine Nachkommastelle).
- **Drei Messarten:** Strecke (zwei Punkte), Kreis (Mittelpunkt und Randpunkt, Etikett
  Radius und Durchmesser), Winkel (Scheitel und zwei Schenkelenden, Etikett in Grad).
- **Einheiten:** Gerechnet wird in Feldern; das Etikett zeigt Felder plus Meter oder Fuß
  (1 Feld = 5 ft = 1,5 m, Regelwerkskonvention). Der Umschalter ist eine Anzeigeeinstellung
  je Betrachter, im Browser gemerkt — kein Sitzungszustand.
- **Zeichnung:** ein Strich = ein Objekt, Polylinie in Bildkoordinaten (2–2000 Punkte),
  Farbe aus einer festen Palette von sechs, feste Strichstärke, entfernen als Ganzes.
- **Entfernen:** der Urheber seine eigenen Objekte, der Spielleiter zusätzlich jedes
  geteilte; Sammelaktionen „Meine entfernen" (jeder) und „Alle geteilten entfernen"
  (Spielleiter).
- **Ebenen:** Bild → Raster → Fog → Zeichnungen → Tokens → Messungen. Der Fog filtert ein
  geteiltes Objekt nicht — wer teilt, teilt ganz.
- **Nur das fertige Objekt** erreicht den Server; die Vorschau während der Geste bleibt
  lokal beim Urheber.

## What Changes

- **Anmerkungen je Karteninstanz.** Neue Tabelle `Annotation` (Instanz, Urheber, Art,
  Modus, Sichtbarkeit, Farbe, Punkte, Anlegezeitpunkt). Aushängen der Instanz löscht per
  Cascade; ein gelöschter Nutzer hinterlässt seine Anmerkungen mit Urheber `null`.
- **Zwei Socket-Ereignisse, jedes Mitglied.** `session:annotation-create` `{ sessionId, kind,
  mode, visibility, color, points }` und `session:annotation-delete` `{ sessionId, target }`
  mit Ziel `eine` (`annotationId`), `meine` oder `geteilte`; Acknowledgements
  `{ ok: true, annotation }` bzw. `{ ok: true }` oder `{ ok: false, message }`. Bei
  `gerastert` setzt der Server die Punkte selbst auf die Zellmitten (§9.1). Die
  Berechtigung zum Entfernen wird pro Aktion geprüft: Urheber, bei `geteilt` auch der
  Spielleiter; eine fremde private Anmerkung ist von einer unbekannten nicht unterscheidbar.
- **Anmerkungsbestand pro Empfänger.** `session:annotations` `{ sessionId, annotations }` je
  Verbindung gefiltert: geteilte für alle, private nur für ihren Urheber. Das
  Enter-Acknowledgement trägt `annotations`; nach jedem `session:map` folgt
  `session:annotations` nach `session:tokens`.
- **Messgeometrie im gemeinsamen Code.** Zellabstand je Rastertyp, Einrasten eines Punkts
  auf die Zellmitte, freie Länge in Feldern, Winkel in Grad, und das Etikett
  (`3 Felder (4,5 m)`, `r 2 Felder (3 m) · ⌀ 4 Felder (6 m)`, `45°`) als reine Funktionen —
  dieselbe Quelle für Etikett, Vorschau und Liste.
- **Raumansicht.** Kartenansicht mit Zeichnungsebene (über dem Fog, unter den Tokens) und
  Messebene mit Etiketten (über den Tokens); Gesten für Strecke, Kreis, Winkel (drei Klicks)
  und Freihand mit lokaler Vorschau; ein Panel „Messen & Zeichnen" für jede Rolle bei
  aktiver Karte: Werkzeug, Modus, Sichtbarkeit, Farbe, Einheit, die Liste der sichtbaren
  Anmerkungen mit `Entfernen` nur dort, wo der Server es erlauben würde, `Meine entfernen`
  und für den Spielleiter `Alle geteilten entfernen`.

**Nicht im Umfang:** Live-Übertragung der Geste an andere (eigener Change mit flüchtigem
Ereignis); Formen wie Rechteck oder Pfeil (die Polylinie deckt sie später ab); Radieren
innerhalb eines Strichs; Anklicken eines Objekts auf dem Canvas zum Entfernen; alternative
Diagonalregeln (3.5e „1-2-1"); Strichstärke als Option; Zuschneiden geteilter Objekte auf
aufgedeckte Zellen.

## Capabilities

### New Capabilities

- `session-annotation`: Messgeometrie (11 Szenarien), Anmerkung anlegen (7), Anmerkung
  entfernen (7), Anmerkungsbestand beim Betreten und Kartenwechsel (3), Anmerkungsansicht
  im Raum (19).

### Modified Capabilities

Keine. Die bestehenden Requirements von `session-map`, `session-fog`, `session-token` und
`game-session` behalten ihre Aussagen: das Enter-Acknowledgement und die Ereignisfolge nach
`session:map` werden um `annotations` bzw. `session:annotations` *ergänzt* (Muster `fog` in
#16), nichts Bestehendes ändert Statuscode, Payload oder Reihenfolge. Die Werkzeugwahl der
Fog-Verwaltung bleibt wie spezifiziert; sie teilt sich mit dem neuen Panel einen
Werkzeugzustand (design.md D5), was für ihre Szenarien unsichtbar ist.

## Impact

**Keine neue Dependency.** Zeichnen und Text laufen über die vorhandene PixiJS-Fassade,
Speicherung über Prisma, Validierung über zod.

**Schema** (`prisma/schema.prisma`): Modell `Annotation` (`instanceId`, `authorId?`, `kind`,
`mode`, `visibility`, `color?`, `points` als JSON-Text, `createdAt`; Cascade von der
Instanz, `SetNull` vom Nutzer, Index auf `instanceId`) und die Gegenrelationen an
`MapInstance` und `User`. Migration nur gegen die Wegwerf-DB (§5.1, §6.1); die Dev-DB
migriert der Mensch vor dem App-Test.

**Geänderter Code:**
- `src/shared/annotation.ts` (neu) — Vertrag: Art, Modus, Sichtbarkeit, Palette, Punkt,
  Anmerkungsdarstellung, Inputs, Acks, Ereignisnamen, Werkzeuge; reine Helfer
  (`cellDistance`, `snapToCellCenter`, `distanceInFields`, `angleDegrees`,
  `annotationLabel`, `filterAnnotationsFor`, `canDeleteAnnotation`)
- `src/server/session/annotations.ts` (neu) — Laden, Filtern, Verteilen, zwei Handler
- `src/server/session/socket.ts` — Enter-Ack `annotations`, `session:annotations` nach
  `session:tokens` in `handleActivateMap`, Registrierung der Handler;
  `src/server/session/maps.ts` — dasselbe beim Aushängen der aktiven Instanz
- `src/client/session/socket.ts` — `createAnnotation`, `deleteAnnotation`,
  `on('annotations')`
- `src/client/map/canvas.ts` — Zeichnungs- und Messebene, Vorschau, Gesten je Werkzeug,
  `setAnnotations`/`setAnnotationOptions`, erweiterter Werkzeugtyp; `MapCanvas.tsx` — Props
  durchreichen
- `src/client/session/AnnotationPanel.tsx` (neu) — Panel „Messen & Zeichnen";
  `src/client/session/FogPanel.tsx` — Werkzeugtyp erweitert (keine Verhaltensänderung);
  `src/client/session/SessionRoom.tsx` — Zustand, Handler, Einheit aus dem Browser,
  gemeinsamer Werkzeugzustand

**Bestehende Tests:** keine ändert ihre Aussage. Mocks der Canvas-Fassade aus früheren
Changes kennen `setAnnotations`/`setAnnotationOptions` nicht — die Kartenansicht ruft sie
tolerant auf (Muster `setFog` aus #16); Acknowledgements gemockter Fassaden ohne
`annotations` werden als leere Liste gelesen. Bestehende Assertions auf die Optionen von
`createMapCanvas` benutzen `objectContaining` und bleiben mit den zusätzlichen Optionen
grün. Alle Szenarien von `session-fog`, `session-token`, `session-map`, `map-library` und
`game-session` bleiben unverändert grün.
