> Umsetzung über den Harness-Loop (`pnpm harness start 14 add-session-tokens`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/session-token/spec.md`, 23 Szenarien) und werden rot bestätigt; der implementer
> sieht sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige
> Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [x] 1.1 Socket-Integrationstests für die 4 Szenarien „Token anlegen", die 3 Szenarien
      „Token bewegen", die 2 Szenarien „Token entfernen" und die 6 Szenarien „Tokenbestand
      beim Betreten und Kartenwechsel" (das REST-Szenario „Aushängen löscht die Tokens der
      Instanz" per `app.inject()`, das Neustart-Szenario mit zweiter App gegen denselben
      Prisma-Client) — echte Socket.IO-Clients gegen die lauschende App wie in den
      bestehenden Raum-Tests, Aufbau über die bestehenden Routen und `session:activate-map`,
      `session:tokens` per Ereignis-Handler abgewartet, „kein `session:tokens`" als kurze
      Wartezeit ohne Ereignis (design.md D8); verifizieren, dass sie rot sind, weil die
      Ereignisse unbekannt sind bzw. `tokens` im Enter-Ack fehlt. Hinweis: bis die Migration
      aus 2.1 existiert, fehlt die Tabelle — Tests, die `Token` lesen, scheitern dann an
      Prisma-Typen bzw. am Datenbankzugriff; beim Rot-Bestätigen unterscheiden
- [x] 1.2 Komponententests für die 8 Szenarien „Tokenansicht im Raum" (eigene
      Unit-Testdatei mit jsdom-Docblock; Socket-Fassade gemockt mit aufzeichnenden
      `createToken`/`moveToken`/`removeToken` und auslösbarem `tokens`-Handler;
      Canvas-Fassade über den auflösbaren Pfad mit `.js`-Endung gemockt, `createMapCanvas`
      zeichnet `options` auf und liefert ein Handle mit `setGrid`/`setImage`/`setTokens`/
      `destroy` als `jest.fn`; Elemente nach der Schnittstellentabelle in design.md D7);
      verifizieren, dass sie rot sind, weil Tokens, Rückruf und Token-Verwaltung fehlen

## 2. Schema (implementer)

- [x] 2.1 `prisma/schema.prisma`: Modell `Token` mit `onDelete: Cascade` zur Instanz und
      `@@index([instanceId])`, Gegenrelation `tokens` an `MapInstance` (design.md D1);
      Migrationsdatei `prisma/migrations/<stamp>_add-token/migration.sql` nach dem Muster
      der bestehenden Migrationen von Hand (Tabelle mit Fremdschlüssel `ON DELETE CASCADE`,
      Index); verifizieren mit `pnpm db:generate` und `pnpm typecheck:src`. Entwicklungs-DB
      nicht anfassen (§5.1)

## 3. Gemeinsamer Vertrag (implementer)

- [x] 3.1 `src/shared/token.ts`: `TOKEN_ICONS`, `TokenIconSchema`, Konstanten, `TokenSchema`,
      `CreateTokenInputSchema` (Name wie `AliasInputSchema`, Farbe als Hex mit Transform auf
      Kleinschreibung, `icon` nullable, `size` 1–4, `col`/`row` ganzzahlig ohne Bereich),
      `MoveTokenInputSchema`, `RemoveTokenInputSchema`, Ack-Typen, `TokensEvent`,
      `SESSION_TOKEN_EVENTS` (design.md D4); kein serverseitiger Import; verifizieren mit
      `pnpm typecheck:src`
- [x] 3.2 `src/shared/session.ts`: `EnterAck` um `tokens: Token[]` erweitern (design.md D4);
      verifizieren mit `pnpm typecheck:src`

## 4. Server (implementer)

- [x] 4.1 `src/server/session/tokens.ts`: `toToken`, `loadTokens`, `emitTokens`,
      `broadcastTokens`, `registerTokenHandlers` mit den drei Handlern in der Reihenfolge
      zod-Parse → `authorizeAction` (Rolle `spielleiter`) → aktive Instanz aus der
      Spielsitzung (`Keine Karte aktiv.` beim Anlegen) → Token mit `id` **und** `instanceId`
      der aktiven Instanz laden (`Token nicht gefunden.`) → Schreiben → `broadcastTokens` →
      Acknowledgement (design.md D2, D3); verifiziert durch die Socket-Szenarien im Gate
- [x] 4.2 `src/server/session/socket.ts`: `registerTokenHandlers` in der
      `connection`-Registrierung aufrufen; `session:enter`-Acknowledgement um `tokens` aus
      `loadTokens` ergänzen; in `handleActivateMap` nach `emitActiveMap` `broadcastTokens`
      (design.md D3); verifiziert im Gate
- [x] 4.3 `src/server/session/maps.ts`: nach `emitActiveMap(io, id, null)` beim Aushängen
      der aktiven Instanz `broadcastTokens` (leerer Bestand) (design.md D3); verifiziert
      durch das Aushängen-Szenario im Gate

## 5. Client (implementer)

- [x] 5.1 `src/client/session/socket.ts`: `createToken`, `moveToken`, `removeToken` mit
      Acknowledgement und `on('tokens', …)` für `session:tokens` in `wireEventFor`
      (design.md D5); verifizieren mit `pnpm typecheck:src`
- [x] 5.2 `src/client/map/canvas.ts`: `tokens` und optionales `onTokenMove` in den
      Optionen, `setTokens` im Handle, Tokenebene über dem Raster (Kreis in Farbe, Symbol
      bzw. Initiale, Name), Mittelpunkt über `cellCenter` mit Versatz für `size > 1` bei
      `quadrat`, Neuzeichnen bei `setGrid`, Ziehen mit `stopPropagation` und `cellAt` beim
      Loslassen, Aufräumen in `destroy` (design.md D6); `src/client/map/MapCanvas.tsx`:
      Props `tokens` und `onTokenMove`, Effekt auf `[tokens]` → `setTokens`; verifizieren
      mit `pnpm typecheck:src` und `pnpm lint`
- [x] 5.3 `src/client/session/TokenPanel.tsx`: Überschrift `Tokens`, Formular nach der
      Schnittstellentabelle (design.md D7) mit Vorgabewerten, Liste der Tokens mit
      `Entfernen` (`aria-label` `<Name> entfernen`), Meldung als `role="alert"`; verifiziert
      durch die Verwaltungs-Szenarien im Gate
- [x] 5.4 `src/client/session/SessionRoom.tsx`: `tokens` aus dem Enter-Ack im Zustand,
      `socket.on('tokens', …)`, `MapCanvas` mit `tokens` und — nur bei Rolle `spielleiter` —
      `onTokenMove` über die Fassade, `TokenPanel` nur bei Rolle `spielleiter` mit
      `onCreate`/`onRemove` über die Fassade und gemeinsamer Fehlermeldung (design.md D5);
      bestehende Szenarien der Sitzungsoberfläche und der Kartenansicht bleiben grün;
      verifiziert im Gate

## 6. Abschluss

- [x] 6.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [x] 6.2 App-Test durch den Menschen (zwei Browser, Spielleiter und Spieler): Karte
      aktivieren, Token `Goblin` mit Farbe, Symbol und Größe 2 in Zelle (3, 4) anlegen →
      beide sehen die Scheibe mit Symbol und Namen über 2×2 Zellen; Spielleiter zieht das
      Token → beide sehen es in der Zielzelle einrasten, Spieler kann nicht ziehen; zweites
      Token ohne Symbol → Initiale; Token entfernen → bei beiden weg; zweite Karte
      aktivieren → Tokens der ersten verschwinden, zurückwechseln → wieder da; Server
      neu starten und Raum betreten → Tokens vorhanden; aktive Karte aushängen → Tokens weg;
      Spieler-Tab zeigt keine Token-Verwaltung; Anlegen ohne aktive Karte → Meldung
- [x] 6.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-session-tokens/` verschieben
      (Spec nach `openspec/specs/session-token/`) und PR mit `Closes #14` öffnen
      (constitution.md §3.6)
