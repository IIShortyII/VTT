## Context

Vorhanden aus #12/#13: Fastify-Instanz als Funktion (`createApp`, injizierbare Uhr und
Prisma), Cookie-Sitzung (`sid`) in der DB mit `resolveSession`, der `src/`-Schnitt
`server/ · client/ · shared/`, Client ohne Router mit den Zuständen `unbekannt/anonym/
angemeldet`, Integrationstests über `app.inject()` gegen eine Suite-eigene Wegwerf-DB
(gemeinsamer Helfer unter den Testpfaden). `socket.io` und `socket.io-client` liegen in
`package.json`, wurden aber nie importiert.

Die Entscheidungen D1 bis D7 unten sind in der Explore-Runde mit dem Menschen gefallen
(2026-09-10) und werden hier begründet, nicht neu verhandelt. Motivation: `proposal.md` —
Why. Verhalten: `specs/game-session/spec.md`. Bindend und hier nicht wiederholt:
`constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- Eine Regel für „wo lebt Zustand", die jeder spätere Change ohne Nachdenken anwenden kann.
- Genau ein Autorisierungspfad für Socket-Aktionen, den jeder künftige Handler zuerst
  durchläuft — sichtbar genug, dass sein Fehlen im Review auffällt.
- So viel Verhalten wie möglich über Integrationstests gegen die echte Socket-Verbindung
  prüfbar; das Anwesenheitsregister als reine Datenstruktur ohne Socket.IO-Abhängigkeit.

**Non-Goals:**
- Kein horizontales Skalieren (kein Redis-Adapter, ein Prozess). Das Anwesenheitsregister
  ist bewusst prozesslokal — siehe D1.
- Keine generische Event-Bus- oder Command-Abstraktion. Zwei Client-Ereignisse
  rechtfertigen keine Registry.
- Kein Router. Die Raumansicht ist ein Zustand der `App`, keine URL (Fortsetzung von #12 D7).
- Keine UI-Bibliothek; native Elemente wie in #12 D8.

## Decisions

### D1 — DB autoritativ, Speicher nur für Anwesenheit

Regel: **Was einen Neustart überleben muss, steht in der DB. Was ihn nicht überleben soll,
steht im Speicher und nirgends sonst.** Spielsitzung, Zustand, Mitgliedschaft, Rolle → DB.
Wer gerade verbunden ist → Speicher, abgeleitet aus den Sockets, nie persistiert.

Verworfen: *In-Memory-Raumzustand mit Persistenz dahinter* — zwei Wahrheiten, Rekonstruktion
beim Neustart, Speicherzustand schwer testbar; für einen Einzelprozess auf SQLite (Reads im
Mikrosekundenbereich) Komplexität ohne Gegenwert. *Nur DB* — scheitert an der Anwesenheit:
nach einem Neustart stünde jeder als anwesend, obwohl niemand verbunden ist.

Konsequenz für später: Aktionen hoher Frequenz (Token-Drag in #8) werden als Absicht beim
Loslassen oder gedrosselt gesendet, nicht pro Pixel. Für ein VTT ohnehin richtig (§9.1).

### D2 — Datenmodell

```prisma
model GameSession {
  id          String       @id @default(cuid())
  name        String
  code        String       @unique   // 6 Zeichen, Alphabet siehe D4
  status      String                 // 'geschlossen' | 'geoeffnet' | 'gestartet' | 'pausiert'
  createdAt   DateTime     @default(now())
  memberships Membership[]
}

model Membership {
  id        String      @id @default(cuid())
  sessionId String
  userId    String
  role      String                  // 'spielleiter' | 'spieler'
  joinedAt  DateTime    @default(now())
  session   GameSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([sessionId, userId])
  @@index([userId])
}
```

`User` bekommt die Gegenrelation `memberships Membership[]`; sonst bleibt `user-auth`
unangetastet.

- **`GameSession`, nicht `Session`**: der Name ist von der Anmelde-Sitzung belegt. In Prosa
  heißt das Ding „Spielsitzung", im Code `GameSession`/`gameSession`.
- **Rolle an der Mitgliedschaft, nicht am Nutzer** (D3 der Explore-Runde): dieselbe Person
  leitet die eine Runde und spielt in der anderen. Gleiches Muster wie `User`/`Account`.
- **`status`/`role` als `String` mit zod-Enum an der Grenze**, kein Prisma-`enum`: die
  Enum-Unterstützung des SQLite-Connectors ist über Prisma-Versionen hinweg nicht verlässlich
  dokumentiert; der TS-Typ kommt aus `shared/session.ts` (`z.infer`), und Prisma-Zeilen werden
  beim Lesen durch das Schema geparst, nie blind gecastet.
- **`@@unique([sessionId, userId])`** erzwingt „höchstens einmal Mitglied" in der DB, nicht im
  Code. Der Beitrittspfad fängt `P2002` wie die Registrierung in #12.
- Kein `lastSeen`, kein `online`-Feld: Anwesenheit ist Speicher (D1).

### D3 — Zwei Kanäle: REST für Anlegen/Beitreten/Liste, Socket für den Raum

| Aktion | Kanal | Grund |
|---|---|---|
| erstellen, beitreten, „Meine Sitzungen" | REST | Anfrage/Antwort mit Cookie, kein Raum nötig, per `app.inject()` testbar |
| betreten, Zustand schalten | Socket | erzeugt ohnehin einen Broadcast; das ist der Pfad, an dem §9.3 zu beweisen ist |

Verworfen: *alles über Socket* — Erstellen und Liste hätten dann einen Verbindungsaufbau als
Voraussetzung, und die Tests würden ohne Not schwerer. *Zustand per REST + Broadcast* — der
Übergang ist eine Raumaktion des anwesenden Spielleiters; ihn über HTTP zu schicken, hieße,
den Autorisierungspfad aus D6 an genau der Stelle zu umgehen, die ihn braucht.

Der REST-Beitritt muss trotzdem in den Raum senden (neues Mitglied erscheint sofort). Deshalb
bekommt `registerSessionRoutes` den `io`-Server als Abhängigkeit und ruft dieselbe
`broadcastParticipants(io, presence, prisma, sessionId)` wie die Socket-Handler.

### D4 — Sitzungscode

6 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 Symbole, kein `0/O`, kein `1/I`) ≈ 30 Bit.
Erzeugt mit `crypto.randomInt` je Zeichen, `@unique` in der DB, bei `P2002` neu erzeugen
(Schleife mit Obergrenze, danach Fehler — bei 2^30 Codes praktisch unerreichbar). Eingabe wird
vor dem Abgleich normalisiert: `replace(/\s+/g, '')` und `toUpperCase()`, im zod-Schema per
`transform`, damit Client-Vorprüfung und Server denselben Wert sehen.

Unbekannter Code und geschlossene Spielsitzung antworten identisch (`404`, gleiche Meldung),
damit der Beitrittspfad nicht verrät, welche Codes existieren (§9.2) — analog zur
Zurückhaltung des Anmeldepfads in #12.

### D5 — Lebenszyklus als Tabelle in `shared/`

```ts
export const TRANSITIONS: Record<GameSessionStatus, Partial<Record<TransitionAction, GameSessionStatus>>> = {
  geschlossen: { oeffnen: 'geoeffnet' },
  geoeffnet:   { starten: 'gestartet', beenden: 'geschlossen' },
  gestartet:   { pausieren: 'pausiert', beenden: 'geschlossen' },
  pausiert:    { starten: 'gestartet', beenden: 'geschlossen' },
}
export function nextStatus(from, action): GameSessionStatus | null
export function allowedActions(from): TransitionAction[]
```

Die Tabelle liegt in `shared/session.ts`, weil der Client daraus die Schaltflächen des
Spielleiters ableitet und der Server daraus entscheidet. Eine Quelle, kein Drift. Der Client
*zeigt* nur, was möglich wäre; ob es geschieht, sagt der Server (§9.1) — der angezeigte
Zustand folgt ausschließlich `session:status`, nie dem Klick.

`pausiert` ist ein **gespeicherter** Zustand, keine Ableitung aus der Anwesenheit — die
Explore-Runde hat die Pause als bewusste Spielleiter-Handlung definiert („geht aufs Klo"),
und ein abgeleiteter Zustand könnte das nicht ausdrücken. Der Verbindungsverlust ist
dann nur ein zweiter Auslöser desselben Übergangs `gestartet → pausiert`.

Zwei Sonderfälle desselben Übergangs:
- **Verbindungsverlust des Spielleiters in `gestartet`** setzt `pausiert` (D8).
- **Serverstart** setzt jede `gestartet`-Zeile auf `pausiert` (`updateMany`) in einem
  `onReady`-Hook von Fastify. Ohne diesen Schritt bliebe nach einem Absturz — bei dem kein
  `disconnect`-Handler läuft — eine Spielsitzung `gestartet`, obwohl niemand verbunden ist.
  Der Hook liegt in `createApp`, damit der Neustart-Test (zweite Instanz auf derselben DB)
  ihn mitprüft.

„Läuft die Spielsitzung?" wird in diesem Change nur geschaltet und angezeigt; die erste
Aktion, die daran scheitert, kommt mit #7. Der Platz dafür ist `authorize` (D6) mit einem
Parameter `requires: 'gestartet'`.

### D6 — Autorisierung pro Aktion, nichts am Socket als Erlaubnis

Beim Handshake (Socket.IO-Middleware) wird nur geprüft, dass ein `sid`-Cookie **vorhanden**
ist (`parse` aus `@fastify/cookie`, kein Eigenbau); ohne Cookie wird die Verbindung mit
`connect_error` abgewiesen. Der Wert wird als `socket.data.sid` gehalten — ein Verweis, keine
Erlaubnis. Keine DB-Abfrage im Handshake.

Jeder Handler beginnt mit derselben Funktion:

```ts
// server/session/authorize.ts
export async function authorizeAction(deps, socket, gameSessionId, options?: {
  role?: MemberRole            // z. B. 'spielleiter' für Übergänge
}): Promise<
  | { ok: true; user: User; membership: Membership; gameSession: GameSession }
  | { ok: false; message: string }
>
```

Schritte, jedes Mal: (1) `resolveSession(prisma, socket.data.sid, clock)` — ist die
Anmelde-Sitzung noch da? (2) `membership.findUnique({ sessionId_userId })` — noch Mitglied,
welche Rolle? (3) Spielsitzung laden; Rollen- und Zustandsanforderung prüfen. Drei SQLite-Reads
pro Aktion; bei den Aktionsraten eines VTT irrelevant.

Warum nicht den Nutzer beim Handshake auflösen und am Socket merken (Stufe 1 der
Explore-Runde)? Weil eine Abmeldung in einem anderen Tab oder die Sitzungsbereinigung nach
Passwortänderung (#13) den Socket dann nicht erreicht — die Verbindung wäre eine dauerhafte
Erlaubnis, genau was §9.3 ausschließt. Warum nicht zusätzlich Sockets beim Löschen einer
Anmelde-Sitzung aktiv trennen (Stufe 3)? Weil das eine Rückkopplung von `auth/` in
`session/` einführt, und „nächste Aktion wird abgelehnt" bereits das richtige Ergebnis ist.

`resolveSession` verlängert die Anmelde-Sitzung nach der Halbwertsregel auch über den Socket;
das Cookie im Browser holt die Laufzeit mit der nächsten HTTP-Antwort nach (#12 D1). Kein
Sonderfall nötig.

Reihenfolge in jedem Handler: **zod-Parse der Payload → `authorizeAction` → Regel → DB →
Broadcast → Acknowledgement.** Scheitert ein Schritt, antwortet das Acknowledgement
`{ ok: false, message }`; ein unerwarteter Fehler wird geloggt und als generische Meldung
zurückgegeben, nie verschluckt (AGENTS.md: kein stilles `catch {}`).

### D7 — Anwesenheitsregister als reine Datenstruktur

```ts
// server/session/presence.ts — kein Import aus socket.io
export class Presence {
  /** Registriert socketId für (gameSessionId, userId). Liefert die bisher registrierte
   *  socketId desselben Nutzers in dieser Spielsitzung, falls eine andere — der Aufrufer
   *  ersetzt sie. */
  enter(gameSessionId, userId, socketId): { replaced: string | null; previousRoom: string | null }
  /** Entfernt socketId. Liefert (gameSessionId, userId), wenn es die registrierte war,
   *  sonst null — ein bereits ersetzter Socket löst beim Trennen nichts mehr aus. */
  leave(socketId): { gameSessionId: string; userId: string } | null
  isOnline(gameSessionId, userId): boolean
  socketOf(gameSessionId, userId): string | null
  socketsIn(gameSessionId): string[]
}
```

Zwei Indizes: `gameSessionId → Map<userId, socketId>` und `socketId → { gameSessionId, userId }`.
Ein Socket ist in höchstens einer Spielsitzung (`enter` für eine andere räumt die vorherige).

Die Regel „ein bereits ersetzter Socket löst beim Trennen nichts aus" ist der Grund, warum
eine Übernahme durch den Spielleiter *nicht* pausiert: `enter(V2)` ersetzt `V1` im Register,
bevor `V1` getrennt wird; `leave(V1)` liefert dann `null`, und der `disconnect`-Handler tut
nichts. Kein Zeitfenster, kein Flag.

Teilnehmerliste = Mitgliedschaften aus der DB (`include: { user: { select: { id, email } } }`)
verschnitten mit `presence.isOnline`. Jede Änderung sendet die **vollständige** Liste an den
Raum, kein Delta: bei fünf Spielern ist ein Delta-Protokoll Zeremonie, und eine vollständige
Liste kann nie inkonsistent werden.

### D8 — Übernahme und Verbindungsverlust

**Übernahme** (`enter` liefert `replaced`): dem alten Socket `session:replaced { sessionId }`
senden, ihn aus dem Raum nehmen, dann `oldSocket.disconnect(true)`. Socket.IO-Clients
verbinden sich nach einer **serverseitigen** Trennung (`io server disconnect`) nicht
automatisch neu — nur nach Netzfehlern. Damit ist der Ping-Pong zweier Tabs (alt verbindet
sich neu, übernimmt, kappt neu, …) schon durch die Bibliothekssemantik ausgeschlossen; der
Client muss nur den Hinweis zeigen und `connect()` nicht von selbst rufen (D10).

**Verbindungsverlust** (`disconnect`-Ereignis): `presence.leave(socketId)`. Liefert es
`(gameSessionId, userId)`, dann Teilnehmerliste senden; war der Nutzer Spielleiter (Rolle aus
der DB, nicht aus dem Speicher) und die Spielsitzung `gestartet`, dann `pausiert` schreiben
und `session:status` senden. Der `disconnect`-Handler hat keinen Absender, dem er antworten
könnte — Fehler dort werden geloggt.

**Beenden**: nach dem Statuswechsel für jeden anwesenden Spieler-Socket (`presence.socketsIn`
minus Spielleiter): `session:ended` senden, `socket.leave(room)`, `presence.leave`. Kein
`disconnect(true)` — die Verbindung bleibt für die Sitzungsliste nutzbar; nur der Raum ist zu.
Danach eine letzte Teilnehmerliste an den Raum (nur noch der Spielleiter), damit dessen
Ansicht die Spieler als abwesend zeigt.

### D9 — Socket.IO an Fastify

`new Server(app.server, { serveClient: false, path: '/socket.io' })` in `createApp`, bevor
Routen registriert werden; `onClose` ruft `io.close()`. Kein `fastify-socket.io`-Plugin
(neue Dependency, tut nichts anderes). Socket.IO hängt sich an die `upgrade`- und
`request`-Ereignisse des Node-Servers, den Fastify ohnehin erzeugt; `app.inject()` für die
REST-Tests funktioniert daneben weiter.

Die Uhr und Prisma kommen aus `createApp` — dieselben injizierten Instanzen wie für `auth/`.
Das `io`-Objekt wird an `registerSessionRoutes` und `registerSessionSocket` übergeben, nicht
als Modul-Singleton exportiert: der Neustart-Test baut zwei Apps auf derselben DB und
braucht zwei unabhängige Server.

Vite: `'/socket.io': { target, ws: true }` neben dem bestehenden `/api`-Proxy. Ohne `ws: true`
fällt der Client stumm auf Long-Polling zurück, was funktioniert und deshalb unbemerkt bliebe.

### D10 — Client

Neue Zustände der angemeldeten `App`: `liste` (Standard) und `raum` mit `sessionId`. Kein
Router (Non-Goal).

- `client/session/api.ts`: `createSession`, `joinSession`, `listSessions` gegen REST,
  Antworten durch die `shared/`-Schemas geparst — wie `client/auth/api.ts`.
- `client/session/socket.ts`: eine dünne Fassade über `socket.io-client`, die genau die
  Ereignisse des Vertrags kennt (`connect`, `enter(sessionId): Promise<Ack>`,
  `transition(sessionId, action): Promise<Ack>`, `on('participants' | 'status' | 'replaced' |
  'ended' | 'disconnect', …)`, `disconnect`). `io('/', { autoConnect: false,
  withCredentials: true })`. Die Fassade ist die Mock-Grenze für Komponententests
  (`jest.mock('../src/client/session/socket.js')`) — ohne sie müsste jeder Test
  `socket.io-client` selbst nachbauen.
- `SessionList.tsx`: Liste (Name, Rolle, Zustand, „Betreten"), Formular „Neue Spielsitzung"
  (Name), Formular „Beitreten" (Code). Abmelden und `ChangePasswordForm` bleiben in dieser
  Ansicht, damit die Szenarien der `user-auth`-Anmeldeoberfläche weiter gelten.
- `SessionRoom.tsx`: Name, Zustand, Teilnehmer mit Anwesenheitskennzeichen; für
  `role === 'spielleiter'` den Code und je eine Schaltfläche pro `allowedActions(status)`;
  „Zurück zur Liste" (verlässt den Raum). Zustand und Teilnehmer kommen ausschließlich aus
  dem Acknowledgement von `enter` und den nachfolgenden Server-Ereignissen.
- **Nach `replaced`**: Hinweis anzeigen, Fassade nicht neu verbinden; Schaltfläche „Hier
  weiterspielen" ruft `connect` + `enter` bewusst erneut — und kappt damit den anderen Tab.
- **Nach `ended`**: zurück zu `liste`, Hinweis anzeigen, Liste neu laden.
- **Reload**: die `App` startet in `liste`; ein Klick auf „Betreten" holt den Raum. Kein
  automatisches Wiederbetreten — ohne Router gibt es keine URL, die sagen könnte, welcher Raum
  gemeint war. Eine Wiederverbindung nach Netzfehler (Client-Reconnect) ruft `enter` erneut,
  weil der Server den Raum nach einer Trennung nicht kennt.

Native Elemente wie in #12 D8; keine UI-Bibliothek.

### D11 — Testaufbau

- **REST-Szenarien**: `app.inject()` mit Cookie aus einer Registrierung, nach dem Muster der
  bestehenden Auth-Integrationssuite. Eigene Suite-DB (`game-session.test.db` über
  `setupEphemeralDb('game-session')`).
- **Socket-Szenarien**: die App muss lauschen — `await app.listen({ port: 0, host:
  '127.0.0.1' })`, Adresse aus `app.server.address()`. Client mit `socket.io-client`: das
  Cookie geht als `cookie`-Eintrag in `extraHeaders` mit (`sid=<id>`), der Transport wird auf
  WebSocket beschränkt, automatisches Wiederverbinden und automatisches Verbinden sind aus.
  `extraHeaders` wird nur in Node ausgewertet — genau richtig für den Test; im Browser schickt
  der Browser das Cookie selbst. Wiederverbinden aus, damit ein vom Test getrennter Socket
  nicht heimlich zurückkommt und ein Szenario verfälscht. Ereignisse werden über
  `once`-Promises mit Timeout eingesammelt, nie über `setTimeout`-Schlaf.
- **Unerwartete Ereignisse sichtbar machen**: für „kein `session:status`"-Aussagen (Verlust
  in `geoeffnet`) einen Listener registrieren, der bei Eintreffen den Test scheitern lässt,
  und stattdessen auf das *erwartete* `session:participants` warten — kein blindes Warten.
- **Neustart**: zweite `createApp({ prisma })`-Instanz auf derselben DB, `await app.ready()`
  genügt (der `onReady`-Hook läuft ohne `listen`).
- **Verbindungsabbruch** simulieren: `clientSocket.disconnect()` — für den Server ist das
  ein `disconnect` wie ein gerissenes WLAN. `io server disconnect` als Trennungsgrund prüft
  das `disconnect`-Ereignis des Clients (`reason`).
- **Komponententests**: `/** @jest-environment jsdom */`, `fetch` gemockt, Socket-Fassade
  gemockt; Ereignisse werden durch Aufruf der registrierten Handler ausgelöst.
  „Verbindet sich nicht neu" = der `connect`-Mock wird nach `replaced`+`disconnect` nicht
  erneut aufgerufen.
- Aufräumen in `afterAll`: alle Client-Sockets trennen, `app.close()` (schließt `io`),
  DB-Dateien entfernen — ein offener Socket hält Jest sonst am Leben.

## Risks / Trade-offs

- **Der Change ist groß** (Schema, erster Socket-Kanal, ~35 Szenarien, Client mit zwei neuen
  Ansichten) → Nicht sinnvoll kleiner: ohne Lebenszyklus ist der Raum nutzlos, ohne Raum der
  Lebenszyklus unsichtbar. Konsequenz wie bei #12: die Rundenbegrenzung (§3.5) ist
  realistisch erreichbar; ein früher menschlicher Blick auf die rote Testrunde lohnt.
- **Erster Socket.IO-Integrationstest überhaupt** (lauschender Server, Header-Cookie,
  `once`-Promises) → Scheitert der Aufbau selbst (Port, `--experimental-vm-modules` gegen
  ESM-Teile von `socket.io-client`), ist das ein Infrastrukturbefund nach §1.4, kein
  Feature-Befund. `socket.io-client@4` liefert einen CJS-Build; erwartet wird kein Problem,
  geprüft ist es nicht.
- **Timing in Socket-Tests** → Jedes Warten hat einen Timeout mit sprechender Meldung; kein
  `setTimeout`-Schlaf. Reihenfolge-Annahmen (Acknowledgement vor Broadcast) werden nicht
  gemacht: Tests registrieren Listener, *bevor* sie die Aktion auslösen.
- **`resolveSession` schreibt bei Verlängerung** → drei Reads plus gelegentlich ein Write pro
  Aktion; SQLite im WAL-Modus verkraftet das um Größenordnungen über dem Bedarf. Sollte #8
  zeigen, dass Token-Züge zu häufig schreiben, ist die Drossel im Client die Antwort, nicht ein
  Cache am Socket.
- **Guard blockt `prisma migrate dev` mit Inline-`DATABASE_URL`** (Issue #44, Punkt 3) → Die
  Migrationsdatei entsteht nach dem Muster der bestehenden (`prisma/migrations/<stamp>_add-
  game-session/migration.sql`) von Hand; der Integrationslauf (`migrate deploy` gegen die
  Wegwerf-DB) verifiziert sie, `pnpm db:generate` den Client.
- **E-Mail in der Teilnehmerliste** → bewusst bis #45; Mitspieler kennen sich am Tisch. Der
  Code eines Spielleiters erreicht Spieler dagegen nie — serverseitig gefiltert, in zwei
  Szenarien geprüft.

## Migration Plan

`prisma/schema.prisma` bekommt `GameSession`, `Membership` und die Gegenrelation an `User`;
die Migrations-SQL legt zwei Tabellen und drei Indizes an, fasst bestehende Tabellen nicht
an. Der Agent führt sie nur gegen die Wegwerf-DB aus (Integrationstest); Entwicklungs-DB
migriert der Mensch, produktiv die CI (§5.1, §6.1). Rollback: beide Tabellen sind neu und
tragen keine Daten, an denen anderes hängt.

## Open Questions

- Ob ein Spieler eine Spielsitzung aus „Meine Sitzungen" **verlassen** (Mitgliedschaft
  löschen) kann, entscheidet ein späterer Change zusammen mit „Spielleiter entfernt
  Mitglied". Ändert hier nichts.
