## Context

`game-session` kennt Beitritt (`POST /api/sessions/join`) und dauerhafte Mitgliedschaft, aber
keinen Austritt. Bindend und hier nicht wiederholt: `constitution.md` §9 (Server autoritativ,
serverseitige Filterung, Berechtigung pro Aktion).

Vorhandener Stand:

- **Schema (`prisma/schema.prisma`).** `Membership` mit `@@unique([sessionId, userId])`,
  `role` (`spielleiter`/`spieler`), `onDelete: Cascade` an beiden FKs. `Token.ownerId`
  (`String?`, `onDelete: SetNull` **beim Löschen des Nutzers**, nicht beim Verlassen); Tokens
  hängen über `instanceId → MapInstance.sessionId` an der Spielsitzung. `TokenShare`
  `(tokenId, stat, userId)` modelliert die Zielgruppen: `keine` = keine Zeile, `alle` = eine
  Zeile mit `userId = null`, Liste = eine Zeile je `userId`; `onDelete: Cascade` am Nutzer.
  `Annotation.authorId` (`String?`, `onDelete: SetNull` beim Nutzerlöschen), `visibility`
  (`'privat'`/`'geteilt'`), hängt über `instanceId → MapInstance.sessionId`.
- **Server (`src/server/session/`).** `routes.ts` registriert die REST-Routen unter
  `/api/sessions`; `authorize.ts`/`rules.ts` liefern Anmeldung/Mitgliedschaft/Rollenprüfung.
  `socket.ts`/`room.ts`/`presence.ts` verwalten Räume und senden `session:participants`; der
  Lebenszyklus (`beenden`) entfernt anwesende Spieler bereits aus dem Raum und sendet
  `session:ended` — dasselbe Muster trägt `session:removed`.
- **Client (`src/client/session/`).** `SessionRoom.tsx` rendert die Teilnehmer als `<ul>`, je
  `<li>` Anzeigename + Anwesenheit, in der eigenen Zeile das Alias-Formular. `api.ts` kapselt
  die REST-Aufrufe, `socket.ts` die Fassade; die Behandlung von `session:ended`/
  `session:replaced` (Rückkehr zur Liste, Hinweis) liegt in `SessionRoom.tsx`. Wörterbücher
  `src/client/i18n/de.ts`/`en.ts` (`ui-text`).

## Goals / Non-Goals

**Goals:**
- Ein Weg hinaus: Spieler-Selbstaustritt und Entfernen durch den Spielleiter, Berechtigung
  pro Aktion (§9.3).
- Abhängige Daten serverseitig und in **einer** Transaktion bereinigen (Tokens, Zielgruppen,
  Anmerkungen), autoritativ und atomar.
- Der Betroffene verliert den Raum **sofort** (§9.2/§9.3), nicht erst bei Wiederverbindung.
- Auslösbar im App-Test: `Austreten`/`Entfernen` in der Teilnehmerliste.

**Non-Goals:**
- Selbstaustritt des Spielleiters, Löschen/Übergeben der Spielsitzung (eigene Changes).
- Sperren/Bann gegen erneuten Beitritt — der Code genügt weiterhin.
- Kein Echtzeit-Nachschieben des bereinigten Token-/Anmerkungsbestands an die **verbliebenen**
  Clients: der Server-Zustand ist korrigiert (autoritativ), die nächste reguläre
  Bestand-Auslieferung (Kartenwechsel/erneutes Betreten) zeigt ihn. Nur `session:participants`
  und `session:removed` werden aus dieser Aktion gesendet.
- Kein Schemawechsel: die Regeln liegen im Transaktions-Codepfad, nicht in neuen
  FK-Klauseln.

## Decisions

### D1 — Route und Berechtigung pro Aktion
Eine Route `DELETE /api/sessions/:id/members/:userId` in `routes.ts`. Der Handler bestimmt
Anmeldung, die eigene Mitgliedschaft in `:id` und die Ziel-Mitgliedschaft (`:userId`) frisch
aus der DB (§9.3):
- ohne Anmeldung → `401` (bestehende Vorprüfung der `/api/sessions`-Routen);
- Anfragender nicht Mitglied von `:id` → `403`;
- Ziel ist ein `spielleiter` (auch der eigene) → `403` (kein Selbstaustritt des Spielleiters);
- Anfragende Rolle `spieler` und `:userId` ≠ eigene → `403`;
- erlaubt: (`:userId` == eigene ∧ Rolle `spieler`) **oder** (eigene Rolle `spielleiter` ∧ Ziel
  ist `spieler`-Mitglied);
- Ziel-Mitgliedschaft existiert nicht in `:id` → `404`.
Die Reihenfolge stellt sicher, dass `403` (fehlende Berechtigung) vor `404` (unbekanntes Ziel)
greift, wenn beides zuträfe. Kein Schreibzugriff in den Fehlerfällen.

### D2 — Eine Transaktion für Löschung und Bereinigung
Bei Erlaubnis ein `prisma.$transaction([...])` mit (Reihenfolge unkritisch, da atomar):
- `TokenShare.deleteMany({ where: { userId, token: { instance: { sessionId: id } } } })` —
  entfernt die `userId` aus jeder listenwertigen Zielgruppe; war sie der letzte Eintrag, bleibt
  keine Zeile → `keine` (fällt aus dem Zeilenmodell, keine Sonderlogik). `alle`
  (`userId = null`) und fremde Einträge bleiben.
- `Token.updateMany({ where: { ownerId: userId, instance: { sessionId: id } }, data: {
  ownerId: null } })`.
- geteilte Anmerkungen des Betroffenen dieser Spielsitzung (`Annotation` mit Sichtbarkeit
  `geteilt`, gefiltert über `instance.sessionId`) auf `authorId: null` setzen
  (`Annotation.updateMany`).
- private Anmerkungen des Betroffenen dieser Spielsitzung (Sichtbarkeit `privat`) löschen
  (`Annotation.deleteMany`).
- `Membership.delete({ where: { sessionId_userId: { sessionId: id, userId } } })`.
Scheitert ein Schritt, rollt die Transaktion alles zurück (§9.1: kein Halbzustand).

### D3 — Sofortiger Raumausschluss und Broadcasts
Nach erfolgreicher Transaktion, im Socket-Layer (`socket.ts`/`room.ts`, Muster wie `beenden`):
- an die **verbliebenen** Verbindungen im Raum `session:participants` mit der neu berechneten
  Liste ohne das entfernte Mitglied (nicht `online: false`, sondern **weg**);
- an jede Verbindung des Betroffenen im Raum `session:removed { sessionId }`, dann diese
  Verbindungen aus dem Socket-Raum entfernen (`socket.leave(room)`), sodass die
  `participants`-Nachricht sie nicht mehr erreicht und keine weitere Nachricht dieser
  Spielsitzung folgt. Kein Trennen der Verbindung nötig — die Verbindung bleibt, nur der Raum
  ist verlassen; die bestehende Pro-Aktion-Autorisierung (§9.3) lehnt jede weitere
  session-gebundene Aktion ohnehin ab (keine Mitgliedschaft mehr).
- REST-Antwort `200`.
Der REST-Handler und das Socket-Layer teilen sich denselben Prozess; der Handler ruft die
vorhandene Broadcast-Hilfe auf (wie andere REST-Mutationen, z. B. `join`, die
`session:participants` auslösen).

### D4 — Client: Austreten/Entfernen in der Teilnehmerliste
In `SessionRoom.tsx` pro `<li>`:
- eigene Zeile eines Spielers: Schaltfläche `Austreten`; NICHT in der eigenen Zeile des
  Spielleiters.
- für den Spielleiter je Spieler-Zeile: Schaltfläche `Entfernen`; nie für Spieler sichtbar,
  nie in der eigenen Spielleiter-Zeile.
Beschriftungen über `t()` (neue Schlüssel, z. B. `session.leave`/`session.remove`). Das
Auslösen ruft `api.ts` → `DELETE /api/sessions/:id/members/:userId` (Zeilen-`userId`). Kein
Bestätigungsdialog in diesem Change (Non-Goal; sinnvolle Folgearbeit).

### D5 — Client: `session:removed`
`SessionRoom.tsx` behandelt `session:removed` wie `session:ended`, aber schlichter: zurück zur
Sitzungsliste und Hinweis `Du wurdest aus der Spielsitzung entfernt.` (neuer `ui-text`-Schlüssel,
z. B. `session.removed`) als `role="alert"`. Kein Dialog, kein Timer. Fassade trennen wie beim
Verlassen der Raumansicht.

### D6 — Neue Textschlüssel
`session.leave` = `Austreten`, `session.remove` = `Entfernen`, `session.removed` =
`Du wurdest aus der Spielsitzung entfernt.` in `de.ts`; sinngemäße englische Werte in `en.ts`.
Identische Schlüsselmenge beider Wörterbücher wird von `ui-text` per Typecheck erzwungen —
daher kein `ui-text`-Delta.
