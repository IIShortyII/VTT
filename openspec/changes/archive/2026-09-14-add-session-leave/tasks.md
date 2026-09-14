## 1. Server: Route und Berechtigung
- [x] 1.1 `DELETE /api/sessions/:id/members/:userId` in `src/server/session/routes.ts`
  registrieren; Anmeldung, eigene Mitgliedschaft und Ziel-Mitgliedschaft frisch aus der DB
  bestimmen (§9.3).
- [x] 1.2 Berechtigung nach D1 durchsetzen: `401`/`403`/`404` in der dort genannten
  Reihenfolge (`403` vor `404`); kein Schreibzugriff in den Fehlerfällen.

## 2. Server: Bereinigung in einer Transaktion
- [x] 2.1 `prisma.$transaction` nach D2: `TokenShare` des Betroffenen in dieser Spielsitzung
  löschen (Zielgruppen-Purge inkl. leere Liste → `keine`), `Token.ownerId` des Betroffenen auf
  `null`, geteilte `Annotation` auf `authorId: null`, private `Annotation` löschen, zuletzt die
  `Membership` löschen. Atomar (kein Halbzustand).

## 3. Server: Raumausschluss und Broadcasts
- [x] 3.1 Nach erfolgreicher Transaktion `session:participants` an die verbliebenen Räume ohne
  das entfernte Mitglied senden (die Mitgliedschaft ist weg, nicht `online: false`).
- [x] 3.2 An jede Verbindung des Betroffenen im Raum `session:removed { sessionId }` senden und
  sie mit `socket.leave` aus dem Raum entfernen — sofort, sodass die `participants`-Nachricht
  sie nicht mehr erreicht (§9.2/§9.3). REST-Antwort `200`.

## 4. Client: Teilnehmerliste
- [x] 4.1 In `SessionRoom.tsx` je Zeile die Aktionen `Austreten` (eigene Spielerzeile) bzw.
  `Entfernen` (Spielleiter, je Spieler-Zeile) rendern; nicht in der eigenen Spielleiter-Zeile,
  nie `Entfernen` für Spieler. Auslösen → `api.ts` `DELETE .../members/:userId`.
- [x] 4.2 `session:removed` in `SessionRoom.tsx` behandeln: zurück zur Sitzungsliste, Hinweis
  `Du wurdest aus der Spielsitzung entfernt.` (`role="alert"`), Fassade trennen.

## 5. i18n
- [x] 5.1 Neue Schlüssel `session.leave`, `session.remove`, `session.removed` in `de.ts` und
  `en.ts` (identische Schlüsselmenge, nicht-leere Werte).

## 6. Abschluss
- [x] 6.1 Gate grün (Typecheck, Lint, alle Tests), Review ok, App lokal starten und dem
  Menschen zum manuellen Test übergeben.
- [x] 6.2 Nach menschlicher App-Freigabe den OpenSpec-Change archivieren (im selben Branch/PR).
