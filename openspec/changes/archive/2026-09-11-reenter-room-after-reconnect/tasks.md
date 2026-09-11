> Umsetzung über den Harness-Loop (`pnpm harness start 46 reenter-room-after-reconnect`),
> nicht über `/opsx:apply`. Die Tests entstehen davor durch den test-author — ein Test je
> **neuem** Szenario aus `specs/game-session/spec.md` (zwei) plus die Anpassung des
> erweiterten Szenarios „Ersetzte Verbindung verbindet sich nicht neu"; die übrigen im Delta
> wiederholten Szenarien sind durch die vorhandene Suite abgedeckt und bleiben unverändert —
> und werden rot bestätigt; der implementer sieht sie nie. „Gate grün" heißt:
> `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den Orchestrator.

## 1. Tests (test-author)

- [x] 1.1 Komponententest für das Szenario „Wiederverbindung betritt den Raum erneut" in der
      bestehenden Suite der Sitzungsoberfläche (Socket-Fassade gemockt wie dort; das neue
      Ereignis `reconnect` über denselben Handler-Mechanismus ausgelöst; `enter` liefert
      zwei vorbereitete Acknowledgements mit unterschiedlichem Zustand und Anwesenheit;
      design.md D4/D5); verifizieren, dass er rot ist aus dem erwarteten Grund (kein
      `reconnect`-Handler registriert → kein zweites `enter`, alter Zustand bleibt sichtbar),
      nicht aus Setup-Gründen (§3.1)
- [x] 1.2 Bestehenden Test zum Szenario „Ersetzte Verbindung verbindet sich nicht neu" um die
      gemeldete Wiederverbindung nach `session:replaced` und Trennung erweitern (Erwartung:
      `enter` genau einmal, kein `connect`, Hinweis sichtbar); bleibt gegen den aktuellen Stand
      grün — das ist in Ordnung und zu erwarten, der Test sichert die Sperre gegen die neue
      Automatik ab (design.md D3)
- [x] 1.3 Socket-Integrationstest für das Szenario „Raumwechsel setzt das Mitglied im alten
      Raum auf abwesend" in der bestehenden Socket-Suite der Spielsitzung (zwei
      Spielsitzungen, zwei Nutzer, Wechsel über dieselbe Verbindung, `session:participants`
      mit der `sessionId` des alten Raums abwarten; design.md D5); verifizieren, dass er rot
      ist, weil der alte Raum nach dem Wechsel kein `session:participants` erhält (Timeout
      beim Warten bzw. letzter Stand mit `online: true`)

## 2. Server (implementer)

- [x] 2.1 `src/server/session/socket.ts`: im Handler für `session:enter` nach dem Verlassen
      des bisherigen Raums (`previousRoom` aus `presence.enter`) die Teilnehmerliste des
      bisherigen Raums frisch bauen und an diesen Raum senden (`broadcastParticipants`),
      **vor** dem `join` in den neuen Raum (design.md D1); verifizieren mit
      `pnpm typecheck:src` und `pnpm lint`; verifiziert durch das Socket-Szenario im Gate

## 3. Client (implementer)

- [x] 3.1 `src/client/session/socket.ts`: `on('reconnect', handler)` in
      `SessionSocketFacade`; die Fassade bindet das Socket-Ereignis `connect` und ruft den
      Handler bei jeder erfolgreichen Verbindung außer der ersten (Zähler in der Fassade,
      design.md D2); verifizieren mit `pnpm typecheck:src`
- [x] 3.2 `src/client/session/SessionRoom.tsx`: Verdrahtung der Fassade (Handler, `connect`,
      `enter`, Verarbeitung des Acknowledgements) in eine Hilfsfunktion ziehen, die
      Mount-Effekt und „Hier weiterspielen" gemeinsam nutzen; `reconnect`-Handler ruft
      `enter` an derselben Fassade erneut und übergibt das Acknowledgement derselben
      Verarbeitung; Sperre nach `replaced` mit **aktuellem** Wert (Ref, nicht Closure);
      Ansicht bleibt bis zum neuen Acknowledgement stehen; `cancelled`-Sperre gilt auch für
      das erneute Betreten (design.md D3, D4); bestehende Szenarien der Sitzungsoberfläche
      bleiben grün; verifiziert im Gate

## 4. Abschluss

- [x] 4.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [x] 4.2 App-Test durch den Menschen (zwei Browser, Spielleiter und Spieler): Spieler-Tab im
      Raum, Server kurz stoppen und wieder starten (oder Netzwerk des Tabs in den DevTools
      kurz offline schalten) → Spieler-Tab ist nach der Wiederverbindung wieder im Raum und
      erhält Zustandswechsel des Spielleiters; Spielleiter-Tab dasselbe (gestartete
      Spielsitzung wird durch den Abbruch pausiert, nach Rückkehr steht `pausiert`, `starten`
      funktioniert); zweiter Tab desselben Nutzers öffnet den Raum → erster Tab zeigt den
      Hinweis und betritt nicht von selbst; „Hier weiterspielen" funktioniert weiterhin
- [x] 4.3 Change nach `openspec/changes/archive/YYYY-MM-DD-reenter-room-after-reconnect/`
      verschieben (Delta auf die Hauptspec anwenden) und PR mit `Closes #46` öffnen
      (constitution.md §3.6)
