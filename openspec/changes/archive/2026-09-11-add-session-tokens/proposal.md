## Why

Seit #50 sehen alle Teilnehmer einer Spielsitzung dieselbe aktive Karte — aber niemand steht
darauf. Dieser Change ist Teil 1 von Epic #8 (Issue #14): der Spielleiter setzt Tokens auf
die aktive Karte, verschiebt und entfernt sie, und alle im Raum sehen den Bestand in
Echtzeit. Tokens hängen an der Karteninstanz aus #50 und überleben damit einen Kartenwechsel
und einen Serverneustart. Zuweisung an Spieler und Bewegung durch Spieler folgen in #15;
Fog-Filterung der Tokens in #17.

Entscheidungen aus der Klärung mit dem Menschen (2026-09-11): Position rastet ins Raster
ein (Zelle, nicht Pixel); Darstellung ist Farbe plus frei vergebener Name, optional ein
Symbol aus einem festen Katalog; Größe wählbar (1×1 bis 4×4 Zellen). Kein Bild-Upload für
Tokens, keine Unterscheidung Spieler/NPC im Modell (kommt mit der Zuweisung in #15).

## What Changes

- **Token.** Neues Modell `Token`: Karteninstanz, Name, Farbe, optionales Symbol, Größe in
  Zellen, Zelle (`col`, `row`). Ein Token gehört genau einer Instanz; wird die Instanz
  ausgehängt, verschwinden ihre Tokens mit ihr.
- **Anlegen, Bewegen, Entfernen — nur Spielleiter, nur auf der aktiven Karte.** Drei
  Socket-Ereignisse im Raum (`session:token-create`, `session:token-move`,
  `session:token-remove`), jedes mit zod-Prüfung, `authorizeAction` mit Rolle
  `spielleiter` pro Aktion (§9.3) und Bezug auf die **aktive** Instanz der Spielsitzung: ohne
  aktive Karte wird nichts angelegt; ein Token einer nicht aktiven Instanz, einer fremden
  Spielsitzung oder ein unbekanntes Token ist „nicht gefunden" (§9.2). Der Client sendet
  Absichten; was gilt, entscheidet der Server und verteilt es (§9.1).
- **Tokenbestand erreicht den Raum.** Nach jeder Änderung sendet der Server allen im Raum
  den vollständigen Bestand der aktiven Instanz (`session:tokens`). Beim Betreten trägt das
  `session:enter`-Acknowledgement den Bestand; bei jedem Kartenwechsel (`session:map`) folgt
  der Bestand der neuen Karte, bei „keine Karte" ein leerer Bestand.
- **Raumansicht.** Tokens werden auf dem Canvas als farbige Scheibe mit Symbol bzw.
  Initiale und Namen gezeichnet, in Zellgröße mal Tokengröße. Der Spielleiter zieht Tokens
  auf dem Canvas; beim Loslassen wird die Zielzelle als Absicht gesendet, das Token springt
  erst mit der Antwort des Servers. Zusätzlich bekommt der Spielleiter eine Token-Verwaltung
  im Raum: Formular zum Anlegen (Name, Farbe, Symbol, Größe, Zelle) und Liste der Tokens
  mit „Entfernen". Spieler sehen die Verwaltung nicht.

**Nicht im Umfang:** Umbenennen, Umfärben oder Größe ändern eines bestehenden Tokens
(entfernen und neu anlegen); Bild-Upload für Tokens; Zuweisung an Nutzer und Bewegung durch
Spieler (#15); Fog-Filterung (#17); Healthbars und Marker (#10); Kollisions- oder
Kartenrand-Prüfung der Zelle (der Spielleiter darf ein Token auch außerhalb des Bilds
ablegen); Mehrfachauswahl.

## Capabilities

### New Capabilities
- `session-token`: Tokens einer Karteninstanz — Anlegen, Bewegen, Entfernen durch den
  Spielleiter, Verteilung des Bestands im Raum, Bestand beim Betreten und Kartenwechsel,
  Tokenansicht und Token-Verwaltung im Raum.

### Modified Capabilities
- Keine Requirement einer bestehenden Capability ändert ihre Aussage. `session-map` und
  `game-session` bleiben unverändert: das `session:enter`-Acknowledgement bekommt ein
  zusätzliches Feld (`tokens`), nach jedem `session:map` folgt ein zusätzliches Ereignis
  (`session:tokens`), und das Aushängen einer Instanz löscht zusätzlich deren Tokens — alle
  drei Ergänzungen sind in `session-token` spezifiziert („Tokenbestand beim Betreten und
  Kartenwechsel"), so wie #50 das Feld `map` in `session-map` spezifiziert hat, ohne
  `game-session` anzufassen. Die bestehenden Szenarien beider Capabilities gelten weiter.

## Impact

**Schema** (`prisma/schema.prisma`): neues Modell `Token` (Instanz, Name, Farbe, Symbol,
Größe, Zelle, Zeitstempel) mit `onDelete: Cascade` zur Instanz und `@@index([instanceId])`;
Gegenrelation `tokens` an `MapInstance`. Migration nur gegen die Wegwerf-DB (§5.1, §6.1).

**Neuer Code:**
- `src/shared/token.ts` — zod-Verträge für Token, Anlegen, Bewegen, Entfernen; Symbolkatalog;
  Ereignisnamen
- `src/server/session/tokens.ts` — Laden und Verteilen des Bestands, die drei Handler
- `src/client/session/TokenPanel.tsx` — Token-Verwaltung des Spielleiters im Raum

**Geänderter Code:**
- `src/shared/session.ts` — `EnterAck` trägt `tokens`
- `src/server/session/socket.ts` — drei Token-Ereignisse registrieren; `tokens` im Enter-Ack;
  `session:tokens` nach `session:activate-map`
- `src/server/session/maps.ts` — `session:tokens` (leer) nach dem Aushängen der aktiven
  Instanz
- `src/client/session/socket.ts` — `createToken`, `moveToken`, `removeToken`, Ereignis
  `tokens`
- `src/client/map/canvas.ts`, `src/client/map/MapCanvas.tsx` — Tokenebene, `setTokens`,
  Ziehen mit `onTokenMove`
- `src/client/session/SessionRoom.tsx` — Tokenbestand im Zustand, `MapCanvas` mit Tokens,
  `TokenPanel` für den Spielleiter

**Dependencies:** keine neuen.

**Testinfrastruktur:** Socket-Integrationstests mit echten Socket.IO-Clients wie in #50;
Komponententests mocken Socket-Fassade und Canvas-Fassade — beide Mock-Grenzen existieren.
