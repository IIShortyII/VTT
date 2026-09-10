## Why

Seit #49 hat jeder Nutzer eine Kartenbibliothek mit Bild, Raster und Canvas — aber nur er
selbst sieht sie, und nur außerhalb einer Spielsitzung. Der Raum aus #6 zeigt Teilnehmer und
Zustand, aber keine Fläche, auf der gespielt wird. Dieser Change ist Teil 2 von #7 (Issue
#50): der Spielleiter hängt Karten aus seiner Bibliothek in eine Spielsitzung ein, schaltet
eine davon aktiv, und alle im Raum sehen dieselbe Karte — live, auch beim Wechsel. Die
Karteninstanz, die dabei entsteht, ist der Anker, an dem Tokens (#8) und Fog of War (#9)
später hängen und einen Kartenwechsel überleben.

## What Changes

- **Karteninstanz.** Ein neues Modell „Karte in Sitzung" (`MapInstance`) verbindet eine
  Spielsitzung mit einer Bibliothekskarte und trägt eine Position (Reihenfolge des
  Einhängens). Eine Karte ist je Spielsitzung höchstens einmal eingehängt; dieselbe Karte
  darf in mehreren Spielsitzungen liegen. Raster und Bild bleiben an der Bibliothekskarte —
  die Instanz ist ein Verweis mit eigener Identität, keine Kopie.
- **Einhängen, Aushängen, Liste — nur Spielleiter.** REST unter
  `/api/sessions/:id/maps`: Liste der eingehängten Karten, Einhängen einer eigenen
  Bibliothekskarte, Aushängen einer Instanz. Jede Route prüft pro Anfrage, dass der
  Anfragende Spielleiter *dieser* Spielsitzung ist; Spieler und Nicht-Mitglieder erhalten
  dieselbe Ablehnung wie für eine unbekannte Spielsitzung (`constitution.md` §9.2 — die
  Vorbereitung des Spielleiters ist verdeckte Information).
- **Aktive Karte je Spielsitzung.** Der Spielleiter aktiviert eine Instanz (oder keine) über
  ein Socket-Ereignis im Raum; der Server speichert die Wahl an der Spielsitzung, bestätigt
  sie dem Absender und sendet allen im Raum, was jetzt aktiv ist. Der Client sendet die
  Absicht „aktiviere Instanz X"; was tatsächlich aktiv ist, entscheidet und verteilt der
  Server (§9.1). Beim Betreten des Raums erhält jeder Teilnehmer die aktive Karte mit.
- **Rasteränderung erreicht den Raum.** Ändert der Besitzer Raster oder Name einer
  Bibliothekskarte, erhält jeder Raum, in dem diese Karte gerade aktiv ist, die aktualisierte
  Karte — ohne Neuladen.
- **Bild für Mitglieder.** Die geprüfte Bildroute aus #49 liefert das Bild zusätzlich jedem
  Mitglied einer Spielsitzung, in der die Karte **gerade aktiv** ist. Enger als „eingehängt"
  im Issue-Text: eine eingehängte, aber nicht aktive Karte ist Vorbereitung des Spielleiters
  (§9.2) und bleibt für Spieler unsichtbar — auch ihr Bild.
- **Löschsperre.** Eine Bibliothekskarte, die in irgendeiner Spielsitzung eingehängt ist,
  lässt sich nicht löschen (`409`); erst aushängen, dann löschen.
- **Raumansicht.** Alle Teilnehmer sehen die aktive Karte auf dem Canvas aus #49 (Schwenken
  und Zoomen bleiben lokal). Ohne aktive Karte zeigt der Raum einen Hinweis, keinen Fehler.
  Der Spielleiter bekommt zusätzlich eine Kartenverwaltung: eingehängte Karten mit
  „Aktivieren"/„Aushängen", Auswahl einer weiteren Bibliothekskarte zum Einhängen, „Keine
  Karte anzeigen". Spieler sehen davon nichts — und die Bibliothek des Spielleiters ebenso
  wenig (§9.2).

**Nicht im Umfang:** Umsortieren eingehängter Karten (die Position ist die Reihenfolge des
Einhängens; ein Umsortier-Endpunkt kommt, wenn er gebraucht wird); Broadcast beim Ersetzen
des Bilds (Teilnehmer sehen ein ersetztes Bild nach erneutem Betreten); Kopieren von Karten
zwischen Nutzern; Tokens, Fog, Messen; ETag/Caching des Bilds (Trade-off aus #49, bleibt
`no-store`).

## Capabilities

### New Capabilities
- `session-map`: Karteninstanzen einer Spielsitzung (Einhängen, Aushängen, Liste, Position),
  aktive Karte setzen und im Raum verteilen, aktive Karte beim Betreten, Weitergabe von
  Rasteränderungen an aktive Räume, und die Kartenansicht samt Kartenverwaltung im Raum.

### Modified Capabilities
- `map-library`: Requirement „Kartenbild abrufen" — zusätzlich zum Besitzer erhält jedes
  Mitglied einer Spielsitzung, in der die Karte gerade aktiv ist, das Bild. Requirement
  „Karte löschen" — eine eingehängte Karte wird mit `409` verweigert.
- `game-session` bleibt unverändert: das Acknowledgement von `session:enter` bekommt ein
  zusätzliches Feld (`map`), aber keine bestehende Requirement oder Aussage ändert sich; das
  neue Feld ist in `session-map` spezifiziert. Die bestehenden Szenarien der
  Sitzungsoberfläche gelten weiter.

## Impact

**Schema** (`prisma/schema.prisma`): neues Modell `MapInstance` (Spielsitzung, Karte,
Position, Zeitstempel) mit `@@unique([sessionId, mapId])`; `GameSession` bekommt den
nullable Zeiger `activeInstanceId` auf die aktive Instanz; Gegenrelationen an `GameSession`
und `GameMap`. Die Migration führt der Agent nur gegen die Wegwerf-DB aus (§5.1, §6.1).

**Neuer Code:**
- `src/shared/session-map.ts` — zod-Verträge für Instanz, aktive Karte, Einhängen und
  Aktivieren; Ereignisnamen
- `src/server/session/maps.ts` — REST-Routen `/api/sessions/:id/maps` und die
  Spielleiter-Prüfung pro Anfrage
- `src/server/session/active-map.ts` — aktive Karte laden/darstellen und an Räume senden
  (eine Stelle, die Aktivieren, Aushängen und Rasteränderung gemeinsam nutzen)
- `src/client/session/maps-api.ts` — REST-Anbindung der Instanzrouten
- `src/client/session/MapPanel.tsx` — Kartenverwaltung des Spielleiters im Raum

**Geänderter Code:**
- `src/shared/session.ts` — `session:enter`-Acknowledgement trägt `map`
- `src/server/session/socket.ts` — Ereignis `session:activate-map`, `map` im Enter-Ack
- `src/server/session/routes.ts` — Registrierung der Instanzrouten (oder eigene
  Registrierung aus `core/app.ts`)
- `src/server/map/rules.ts`, `src/server/map/routes.ts` — Bildroute für Mitglieder aktiver
  Karten, Löschsperre, Broadcast nach `PATCH`
- `src/server/core/app.ts` — `io` an die Kartenrouten, Registrierung der Instanzrouten
- `src/client/session/socket.ts` — `activateMap`, Ereignis `map`
- `src/client/session/SessionRoom.tsx` — Kartenansicht, Hinweis ohne Karte, `MapPanel` für
  den Spielleiter

**Dependencies:** keine neuen.

**Testinfrastruktur:** Integrationstests mit REST (`app.inject()`) und echten
Socket.IO-Clients wie in #6/#45, plus Wegwerf-Upload-Verzeichnis wie in #49 für die
Bildszenarien. Komponententests mocken REST, Socket-Fassade und Canvas-Fassade — alle drei
Mock-Grenzen existieren bereits.
