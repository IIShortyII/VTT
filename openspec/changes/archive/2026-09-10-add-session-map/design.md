## Context

Vorhanden aus #6/#45: Spielsitzung mit Mitgliedschaften und Rollen, Socket-Raum mit
`authorizeAction` pro Ereignis (Anmelde-Sitzung, Mitgliedschaft, Zustand jedes Mal frisch
aus der DB), Broadcast-Helfer in `server/session/room.ts`, REST-Routen mit `requireUser`
und `sendError`, Client-Fassade `client/session/socket.ts` als Mock-Grenze, `SessionRoom`
mit Zustand aus Enter-Acknowledgement und Server-Ereignissen. Vorhanden aus #49: `GameMap`
mit Bild und Raster, `findOwnMap` als einzige Ladefunktion der Kartenrouten (Besitzer in der
`where`-Klausel), geprüfte Bildroute mit `no-store`, `MapCanvas` als React-Rahmen um die
PixiJS-Fassade (dynamischer Import, `setGrid`/`setImage` bei Prop-Änderung, `destroy` genau
einmal im Cleanup), `client/map/api.ts` mit `listMaps` und `mapImageUrl`.

Die Entscheidungen „Instanz statt Verweis oder Kopie", „mehrere Karten je Sitzung, eine
aktiv", „Raster bleibt am Original", „Schwenken/Zoomen lokal" sind in der Explore-Runde zu
#7 gefallen (2026-09-10) und werden hier nicht neu verhandelt. Motivation: `proposal.md` —
Why. Verhalten: `specs/session-map/spec.md` und das Delta zu `map-library`. Bindend und hier
nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- Eine Karteninstanz mit eigener Identität, an der #8 (Tokens) und #9 (Fog) später hängen
  können, ohne dass ein Kartenwechsel sie verliert.
- Genau eine Stelle, die „was ist in dieser Spielsitzung aktiv" beantwortet und verteilt —
  benutzt von Aktivieren, Aushängen, Betreten und Rasteränderung.
- Die Spielleiter-Prüfung der Instanzrouten als Teil der Abfrage, nicht als `if` danach —
  dasselbe Muster wie `findOwnMap`.
- Bestehende Szenarien von `game-session` und `map-library` bleiben grün; das Enter-Ack wird
  nur erweitert.

**Non-Goals:**
- Kein Umsortieren, kein Umbenennen einer Instanz (sie hat keinen eigenen Namen).
- Kein Broadcast beim Ersetzen des Bilds (proposal.md, „Nicht im Umfang").
- Keine Kopie von Raster oder Bild an der Instanz — die Instanz bleibt ein Verweis.
- Kein Vorladen nicht aktiver Karten beim Spieler (wäre ein §9.2-Verstoß).

## Decisions

### D1 — Datenmodell

```prisma
model MapInstance {
  id        String      @id @default(cuid())
  sessionId String
  mapId     String
  position  Int
  createdAt DateTime    @default(now())
  session   GameSession @relation("SessionInstances", fields: [sessionId], references: [id], onDelete: Cascade)
  map       GameMap     @relation(fields: [mapId], references: [id], onDelete: Restrict)
  activeIn  GameSession? @relation("ActiveInstance")
  @@unique([sessionId, mapId])
  @@index([mapId])
}
```

`GameSession` bekommt `instances MapInstance[] @relation("SessionInstances")`, den nullable
Zeiger `activeInstanceId String? @unique` und die Relation
`activeInstance MapInstance? @relation("ActiveInstance", fields: [activeInstanceId],
references: [id], onDelete: SetNull)`. `GameMap` bekommt die Gegenrelation
`instances MapInstance[]`.

- **Zeiger an der Spielsitzung statt `active`-Flag an der Instanz**: „höchstens eine aktive
  je Spielsitzung" ist damit eine Spalte, keine Regel, die jeder Schreibpfad einhalten
  muss. Mit einem Flag bräuchte es eine Transaktion „alle auf falsch, eine auf wahr" und
  einen partiellen Unique-Index, den Prisma nicht modelliert.
- **`onDelete: SetNull` am Zeiger, `Cascade` an der Instanz**: Aushängen der aktiven
  Instanz lässt den Zeiger automatisch fallen (die Route setzt ihn trotzdem explizit in
  derselben Transaktion, damit der Broadcast auf einem definierten Zustand aufsetzt). Der
  Zyklus `GameSession → MapInstance → GameSession` ist für SQLite zulässig; Prisma lehnt
  zyklische referenzielle Aktionen nur für SQL Server ab.
- **`onDelete: Restrict` an der Karte**: die Löschsperre aus dem Spec-Delta prüft die Route
  selbst (Zählung, `409` mit Meldung), der Fremdschlüssel ist der Rückhalt, falls ein
  späterer Codepfad die Prüfung vergisst.
- **Zwei benannte Relationen** zwischen `GameSession` und `MapInstance` (Sammlung und
  aktiver Zeiger), weil Prisma bei zwei Relationen zwischen denselben Modellen Namen
  verlangt.
- **`position` als eigene Spalte**, nicht aus `createdAt` abgeleitet: das Issue nennt die
  Reihenfolge als Teil des Modells, und ein späterer Umsortier-Endpunkt ändert dann nur
  Zahlen, keine Zeitstempel. Vergabe beim Einhängen: höchste Position der Spielsitzung plus
  1, in derselben Transaktion wie das Anlegen (zwei gleichzeitige Einhängen dürfen keine
  doppelte Position erzeugen; ein `P2002` auf `[sessionId, mapId]` ist die `409`-Antwort).
- In Prosa: „Karteninstanz" bzw. „Instanz"; `MapInstance`, nicht `SessionMap` — das Wort
  „Session" ist in diesem Schema schon doppelt belegt.

### D2 — Zwei Kanäle: REST für Instanzen, Socket für die aktive Karte

Wie #6 D3: Anfrage/Antwort mit Cookie und ohne Raumbezug läuft über REST, Aktionen im Raum
mit Broadcast über den Socket.

- `GET /api/sessions/:id/maps`, `POST /api/sessions/:id/maps`,
  `DELETE /api/sessions/:id/maps/:instanceId` in `server/session/maps.ts`, registriert aus
  `core/app.ts` mit `{ prisma, clock, io, presence }` — `io`, weil das Aushängen der
  aktiven Instanz den Raum informiert.
- `session:activate-map` in `server/session/socket.ts` neben `session:transition`:
  Reihenfolge zod-Parse → `authorizeAction(..., { role: 'spielleiter' })` → Instanz laden
  **mit** `sessionId` in der `where`-Klausel (eine Instanz einer anderen Spielsitzung ist
  damit „nicht gefunden", nicht „verboten") → Zeiger setzen → Broadcast → Acknowledgement.

Verworfen: *alles über den Socket* (eine Liste per Acknowledgement ist gegen die Konvention
des Projekts; die Bibliothek ist ohnehin REST) und *alles über REST* (Aktivieren ist die
Raumaktion schlechthin; das Muster mit Acknowledgement und Broadcast existiert bereits).

### D3 — Spielleiter-Prüfung als Abfrage

`server/session/maps.ts` lädt die Spielsitzung ausschließlich über eine Funktion
`findLedSession(prisma, userId, sessionId)`: `findFirst` auf `GameSession` mit
`memberships: { some: { userId, role: 'spielleiter' } }` in der `where`-Klausel. Ohne
Treffer `404` mit einer Meldung — für Spieler, Nicht-Mitglied und unbekannte `id`
identisch. Es gibt keinen Codepfad, der die Instanzen einer fremd geleiteten Spielsitzung in
der Hand hält (Muster `findOwnMap`, #49 D4). Für die Instanz beim Aushängen dasselbe:
`findFirst` mit `id` **und** `sessionId`.

Das Einhängen prüft danach die Karte über das bestehende `findOwnMap` — `404` mit der
Kartenmeldung für fremd und unbekannt, wie in `map-library`.

### D4 — Eine Stelle für „was ist aktiv" (`server/session/active-map.ts`)

- `toActiveMap(instance, map)`: Instanz plus Karte → Aktive-Karte-Darstellung
  (`instanceId`, `mapId`, `name`, `hasImage`, `grid` über `toMapSummary`).
- `loadActiveMap(prisma, sessionId)`: Spielsitzung mit `activeInstance` samt `map`
  einlesen, `null` ohne Zeiger.
- `emitActiveMap(io, sessionId, map)`: `session:map` an den Raum (`roomName` aus `room.ts`).
- `broadcastMapChanged(io, prisma, mapId)`: alle Spielsitzungen, deren `activeInstance`
  auf diese Karte zeigt, laden und jedem Raum die neue Darstellung senden — der Aufruf aus
  `PATCH /api/maps/:id` nach dem `update`. Eingehängte, nicht aktive Instanzen erzeugen
  nichts (Spec: „bleibt still").

Aufrufer: `session:activate-map` (setzen, dann `loadActiveMap` + `emitActiveMap`),
`DELETE …/maps/:instanceId` (wenn `activeInstanceId === instanceId`: in einer Transaktion
Zeiger auf `null` und Instanz löschen, danach `emitActiveMap(io, sessionId, null)`),
`session:enter` (`loadActiveMap` für das Feld `map`), `PATCH /api/maps/:id`
(`broadcastMapChanged`). `registerMapRoutes` bekommt dafür `io` als weitere Abhängigkeit.

Das Acknowledgement von `session:activate-map` trägt die vom Server geladene Darstellung,
nicht die Payload — auch bei `null`. Der Client wertet aus dem Acknowledgement nur
`ok`/`message` aus; die Anzeige folgt `session:map`, das denselben Absender als
Raummitglied ebenfalls erreicht (D7).

### D5 — Gemeinsamer Vertrag (`shared/session-map.ts`)

- `MapInstanceSchema` (`id`, `mapId`, `name`, `hasImage`, `grid`, `position`),
  `ActiveMapSchema` (`instanceId`, `mapId`, `name`, `hasImage`, `grid`), `MountMapInputSchema`
  (`mapId` als nicht leerer String), `ActivateMapInputSchema` (`sessionId`, `instanceId` als
  String oder `null` — `nullable`, nicht `optional`: ein fehlendes Feld ist ungültig, ein
  bewusstes `null` ist „keine Karte").
- Typen `ActivateMapAck`, `MapEvent`; Ereignisnamen in `SESSION_MAP_EVENTS`
  (`activate` → `session:activate-map`, `map` → `session:map`).
- `shared/session.ts`: `EnterAck` bekommt `map: ActiveMap | null` — Import aus
  `session-map.ts`, keine Zirkularität (`session-map.ts` importiert nur `map.ts`).
- Kein serverseitiger Import (Folgeregel aus #5 D1).

### D6 — Bildroute und Löschsperre in `map-library`

- `server/map/rules.ts` bekommt neben `findOwnMap` ein `findViewableMap(prisma, userId,
  id)`: `findFirst` mit `id` und `OR` aus `{ ownerId: userId }` und „es gibt eine Instanz
  dieser Karte, deren `activeIn`-Spielsitzung eine Mitgliedschaft dieses Nutzers hat".
  **Nur** `GET /api/maps/:id/image` wechselt auf diese Funktion; `PATCH`, `PUT`, `DELETE`
  bleiben bei `findOwnMap`. Die Prüfung ist pro Anfrage Teil der Abfrage (§9.3) — ein
  Kartenwechsel entzieht die Berechtigung mit der nächsten Anfrage.
- Warum „aktiv" und nicht „eingehängt" (Abweichung vom Issue-Text, in `proposal.md`
  benannt): Spieler erhalten nie eine `mapId` einer nicht aktiven Instanz; eine Route, die
  sie trotzdem ausliefern würde, wäre ein Pfad ohne Aufrufer im Client und ein Leck für
  jeden, der eine `mapId` errät oder von früher kennt (§9.2, „Vorbereitungen der
  Spielleitung").
- `DELETE /api/maps/:id`: nach `findOwnMap` die Instanzen zählen; bei mindestens einer
  `409` mit Meldung, ohne Löschung. Der `Restrict`-Fremdschlüssel (D1) fängt den Fall
  zusätzlich, käme er je an der Prüfung vorbei.
- Kein `session:map` beim Bild-Ersetzen (Non-Goal): die Bild-URL bleibt gleich, `MapCanvas`
  würde ohnehin nicht neu laden; ein Zähler in der Darstellung wäre ein neues Konzept für
  einen Fall, den der App-Test mit „Raum neu betreten" abdeckt.

### D7 — Client

**Fassade** (`client/session/socket.ts`): `activateMap(sessionId, instanceId | null)`
mit Acknowledgement und `on('map', handler)` für `session:map` — dieselbe Mock-Grenze wie
bisher.

**REST** (`client/session/maps-api.ts`): `listSessionMaps(sessionId)`,
`mountMap(sessionId, mapId)`, `unmountMap(sessionId, instanceId)`; Antworten durch die
`shared/`-Schemas geparst, Fehlerform wie `client/session/api.ts`.

**`SessionRoom`**: `RoomState.bereit` bekommt `map: ActiveMap | null` aus dem Enter-Ack;
`socket.on('map', …)` ersetzt es. Rendering im Zustand `bereit`:

- Über der Karte ein Absatz mit genau dem Text `Aktive Karte: <Name>` bzw. ohne aktive Karte
  genau `Keine Karte aktiv`.
- Mit aktiver Karte ein Container fester Höhe mit `MapCanvas` (`imageUrl` gleich
  `mapImageUrl(map.mapId)` bei `hasImage`, sonst `null`; `grid` aus der Darstellung). Die
  Komponente bleibt beim Kartenwechsel **dieselbe** (kein `key` aus der `instanceId`): ihre
  Effekte rufen `setImage`/`setGrid` am bestehenden Handle. Wechsel auf `null` entfernt sie
  aus dem Baum → Cleanup → `destroy` genau einmal (#49 D9). Das ist genau die Aufteilung
  der Szenarien „Kartenwechsel folgt dem Server" und „Zurücksetzen entfernt die
  Kartenansicht".
- Bei `role === 'spielleiter'` zusätzlich `MapPanel`.

**`MapPanel`** (`client/session/MapPanel.tsx`), Props: `sessionId`, `activeInstanceId`,
`onActivate(instanceId | null)` (ruft die Fassade des Raums), `activateError`. Lädt beim
Mounten `listSessionMaps(sessionId)` und `listMaps()`; nach Einhängen/Aushängen erneut
`listSessionMaps`. Nur der Spielleiter rendert es — für Spieler gibt es damit keinen
Aufrufer der beiden Listen (Szenario „Spieler sieht keine Kartenverwaltung"); dass der
Server sie ihm ohnehin verweigert, ist die eigentliche Grenze (D3).

**Schnittstelle der Raumansicht** (Adressen für Test und Implementierung, Layout frei):

| Element | Beschriftung / Attribut |
|---|---|
| Absatz aktive Karte | Text genau `Aktive Karte: <Name>` |
| Absatz ohne Karte | Text genau `Keine Karte aktiv` |
| Überschrift der Kartenverwaltung | `Karten` |
| Liste eingehängter Karten | `<ul>`, je Instanz ein `<li>` mit dem Kartennamen als eigenem `<span>` |
| Aktivieren je Instanz | `<button>` mit sichtbarem Text `Aktivieren` und `aria-label` genau `<Name> aktivieren` |
| Aushängen je Instanz | `<button>` mit sichtbarem Text `Aushängen` und `aria-label` genau `<Name> aushängen` |
| Auswahl zum Einhängen | `<select name="mapId">` mit `<label>` `Karte aus der Bibliothek`; je nicht eingehängter eigener Karte eine `<option>` mit `value` = `mapId` und Text = Kartenname |
| Einhängen | `<button type="submit">` `Einhängen` im Formular der Auswahl |
| Zurücksetzen | `<button>` `Keine Karte anzeigen` |
| Fehlermeldungen | `<p role="alert">` mit der Meldung des Servers |

Das `aria-label` macht die Schaltflächen je Instanz eindeutig adressierbar (zugänglicher
Name `Taverne aktivieren`), ohne dass der sichtbare Text den Namen wiederholt. Keine
Rollenwörter (`spielleiter`, `spieler`) als sichtbarer Text im Panel (Teilstring-Falle aus
#45).

### D8 — Testaufbau

- **REST-Szenarien**: `app.inject()` mit Cookies aus Registrierungen; Spielsitzung und
  Mitgliedschaften über die bestehenden Routen (`POST /api/sessions`, Öffnen per Socket
  oder direkt in der DB, `POST /api/sessions/join`); Karten über `POST /api/maps`, Bilder
  über `PUT …/image` mit Signatur plus Füllbytes und Wegwerf-Upload-Verzeichnis wie #49
  D10. DB-Aussagen direkt aus `MapInstance` und `GameSession.activeInstanceId`.
- **Socket-Szenarien**: echte Socket.IO-Clients gegen die lauschende App wie in #6/#45;
  „erhält kein `session:map`" als kurze Wartezeit ohne Ereignis, wie bei „kein
  `session:status`" in `game-session`.
- **Komponententests**: jsdom-Docblock; `fetch` nach Pfad und Methode gemockt (Enter-Ack
  kommt aus der gemockten Socket-Fassade, die Listen aus `fetch`); Socket-Fassade mit
  aufzeichnendem `activateMap` und einem von außen auslösbaren `map`-Handler; Canvas-Fassade
  über den **auflösbaren** Modulpfad mit `.js`-Endung gemockt (#49 D10 — der virtuelle Mock
  greift nicht, sobald die Datei existiert; sie existiert). Elemente über
  `getByRole`/`getByLabelText`/`getByText`, keine `querySelector`-Selektoren und keine
  eigenen Helfer mit Kurzmeldung — die DOM-Ausgabe der Library ist das Gate-Feedback.
- Kein Test importiert `pixi.js`.

## Risks / Trade-offs

- **Zyklische Relation `GameSession ↔ MapInstance`** → Prisma validiert sie für SQLite ohne
  Fehler; sollte `pnpm db:generate` doch ablehnen, fällt das in Task 2.1 auf, und der
  Rückfall ist `activeInstanceId` als schlichte Spalte ohne Relation (die Route hält den
  Zeiger dann in derselben Transaktion konsistent).
- **Broadcast aus REST-Routen** → `registerMapRoutes` bekommt `io`; die Routen bleiben
  ohne `presence` (sie brauchen nur den Raum, keine Anwesenheit).
- **`PATCH` einer Karte, die in vielen Spielsitzungen aktiv ist** → eine `findMany` und ein
  `emit` je Raum; bei den Zahlen eines VTT unerheblich.
- **Kartenwechsel und Textur-Cache** → `setImage` mit neuer URL lädt neu (Zähler in der
  Fassade, #49 D8); Wechsel zurück zur vorigen Karte lädt erneut — `no-store` bleibt, ETag
  ist weiter Trade-off aus #49.
- **Spieler ohne Bild** (Karte ohne Upload aktiv) → `MapCanvas` mit `imageUrl: null`
  zeichnet das Raster auf der Ersatzfläche (#49 D8); kein Fehler, kein Sonderfall.
- **Handgeschriebene Migration** → wie #49: Tabelle, Unique- und Index-Anweisungen,
  Spalte an `GameSession` per Tabellen-Neuaufbau nach dem Muster, das Prisma für SQLite
  erzeugt (`ALTER TABLE ADD COLUMN` reicht für eine nullable Spalte; der Unique-Index kommt
  als eigene Anweisung). Der Integrationslauf gegen die Wegwerf-DB verifiziert sie.
- **Leak-Wächter** → keine Testdatei wird in diesen Dokumenten genannt; keine Code-Zeile,
  die ein Test wörtlich enthalten könnte.

## Migration Plan

`prisma/schema.prisma` bekommt `MapInstance`, die Gegenrelationen und den Zeiger an
`GameSession`; die Migrations-SQL legt eine Tabelle, zwei Indizes und eine nullable Spalte
mit Unique-Index an, fasst bestehende Zeilen nicht an. Der Agent führt sie nur gegen die
Wegwerf-DB aus; Entwicklungs-DB migriert der Mensch, produktiv die CI (§5.1, §6.1).
Rollback: Tabelle und Spalte sind neu; nichts Bestehendes hängt daran.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Ob ein Umsortier-Endpunkt gebraucht wird,
entscheidet sich, wenn ein Spielleiter mehr Karten einhängt, als eine Liste bequem zeigt.
