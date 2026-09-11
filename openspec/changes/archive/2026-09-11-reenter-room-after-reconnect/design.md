# Design — reenter-room-after-reconnect (#46)

Kontext: Die Raum-Architektur aus #6 bleibt, wie sie ist — Anwesenheit im Speicher des
Servers (`Presence`), ein Socket in höchstens einem Raum, Teilnehmerliste immer als
vollständige Liste, Client-Fassade als Mock-Grenze. Dieser Change schließt zwei Lücken
zwischen diesem Design und dem Code; er führt kein neues Konzept ein.

## D1 — Server: Broadcast an den bisherigen Raum beim Wechsel

Der Handler für `session:enter` (`src/server/session/socket.ts`) erhält von
`presence.enter` bereits `previousRoom` — die Spielsitzung, in der genau diese Socket-ID
zuvor registriert war, falls eine andere. Er verlässt daraufhin den Socket.IO-Raum. Neu:
unmittelbar danach die Teilnehmerliste des bisherigen Raums frisch bauen und an diesen Raum
senden (`broadcastParticipants` aus `room.ts`, dieselbe Funktion wie beim
Verbindungsabbruch).

Reihenfolge, und warum sie stimmt:

1. `presence.enter` hat den Nutzer aus dem Anwesenheitsregister des alten Raums entfernt →
   `buildParticipants` liefert ihn dort mit `online: false`.
2. Der Socket hat den alten Socket.IO-Raum verlassen → der Broadcast erreicht nur die
   Verbliebenen, nicht den Wechselnden selbst.
3. Erst dann `join` in den neuen Raum und die bestehende Teilnehmerliste dorthin.

Ein Wechsel ist **kein** Verbindungsabbruch des Spielleiters: die Pausen-Regel
(„Abwesenheit des Spielleiters pausiert") hängt am `disconnect`-Handler und wird hier
bewusst nicht ausgelöst — die bestehende Spec sagt dazu ausdrücklich „Verbindungsabbruch,
kein Wechsel". Der Spielleiter, der über dieselbe Verbindung eine andere Spielsitzung
betritt, lässt seine gestartete Spielsitzung also laufen. Das ist unverändertes Verhalten und
liegt außerhalb dieses Change.

## D2 — Client-Fassade: Ereignis `reconnect`

`SessionSocketFacade` bekommt eine weitere `on`-Überladung: `on('reconnect', handler)` mit
einem Handler ohne Payload. Die Fassade bindet dafür das **Socket-Ereignis** `connect` von
`socket.io-client` und ruft den Handler bei **jeder Verbindung außer der ersten**.

Warum `connect` mit Zähler und nicht das Manager-Ereignis `reconnect` von Socket.IO:

- Das Manager-Ereignis feuert, sobald die Transportverbindung steht — noch bevor der
  Namespace verbunden ist und bevor die Handshake-Middleware des Servers (Cookie vorhanden?)
  entschieden hat. Das Socket-Ereignis `connect` feuert erst, wenn der Server die Verbindung
  angenommen hat. Ein `session:enter` danach ist kein Blindschuss.
- Die erste Verbindung darf nicht als Wiederverbindung zählen: die Raumansicht ruft `enter`
  nach `connect()` ohnehin selbst (unverändert aus D10 von #6). Ohne Zähler würde jeder
  Raum beim Öffnen zweimal betreten. Der Zähler gehört in die Fassade, nicht in die
  Komponente — die Komponente soll ein semantisches Ereignis sehen („wieder verbunden"),
  keine Socket.IO-Mechanik.
- Schlägt die allererste Verbindung fehl und gelingt erst ein späterer Versuch, ist das
  trotzdem die **erste** erfolgreiche Verbindung: kein `reconnect`, das nach `connect()`
  abgesetzte `enter` wird von `socket.io-client` gepuffert und dann zugestellt. Der Zähler
  zählt erfolgreiche Verbindungen, nicht Versuche.

`wireEventFor` wird um den Fall nicht erweitert — `reconnect` ist kein Drahtereignis des
Vertrags, sondern eine Ableitung der Fassade; der Fall wird in `on` vor der Zuordnung
abgefangen.

## D3 — Raumansicht: erneutes Betreten

`SessionRoom.tsx` registriert `on('reconnect', …)` neben den bestehenden Handlern. Der
Handler ruft `enter(sessionId)` an **derselben** Fassade (keine neue Fassade, kein
`connect()`) und übergibt das Acknowledgement derselben Funktion, die auch das erste
Acknowledgement verarbeitet: `ok: true` ersetzt Name, Zustand, Rolle, Code, Teilnehmer und
aktive Karte vollständig (§9.1 — der Server sagt, was jetzt gilt; nichts vom alten Stand
wird gemischt), `ok: false` führt in den Fehlerzustand mit der Meldung des Servers.

Während der Unterbrechung und bis zum neuen Acknowledgement bleibt die Ansicht, wie sie
war — kein Umschalten auf „Lädt …" (Flackern bei kurzen Aussetzern; und die bisherigen
Werte sind der letzte bekannte Server-Stand, nicht Client-Erfindung).

**Sperre nach `replaced`.** Hat die Ansicht `session:replaced` erhalten, ignoriert der
`reconnect`-Handler das Ereignis. Der Server trennt die ersetzte Verbindung mit
`io server disconnect`, wonach `socket.io-client` nicht von selbst wiederverbindet — die
Sperre ist also in der Praxis ein doppelter Boden. Sie steht trotzdem hier, weil die
Requirement „Sitzungsoberfläche" das automatische Betreten nach `replaced` ausdrücklich
verbietet und dieser Change eine Automatik einführt, die genau das täte, wenn sich das
Verhalten der Bibliothek je ändert. Achtung bei der Umsetzung: der Handler wird beim
Mounten registriert und lebt so lange wie die Fassade; die Abfrage „wurde ersetzt?" muss den
**aktuellen** Wert lesen, nicht den Wert zum Zeitpunkt der Registrierung (ein
`useState`-Wert in der Closure des Effekts wäre veraltet — ein `useRef` neben dem State,
oder die Prüfung über einen funktionalen `setState`-Aufruf, löst das).

**Verdrahtung an einer Stelle.** Der bestehende Code registriert die fünf Handler zweimal
(im Mount-Effekt und in „Hier weiterspielen"). Mit dem sechsten Ereignis wird das zur
Fehlerquelle; die Registrierung samt `connect()` + `enter()` + Acknowledgement-Verarbeitung
wandert in eine Hilfsfunktion, die beide Stellen aufrufen. „Hier weiterspielen" setzt die
Sperre vor dem Aufruf zurück — die neue Fassade beginnt ohne Vorgeschichte.

**Abmelden der Handler.** Die Fassade wird beim Unmount getrennt (`disconnect()`); ein
getrennter, verworfener Socket verbindet sich nicht wieder, also feuert `reconnect` danach
nicht. Die bestehende `cancelled`-Sperre des Effekts gilt auch für das Acknowledgement des
erneuten Betretens: nach dem Unmount wird kein State mehr gesetzt.

## D4 — Schnittstelle der Raumansicht

Keine neuen sichtbaren Elemente. Was Tests und Implementierung adressieren:

| Element | Beschriftung / Verhalten |
|---|---|
| Zustandszeile | Text `Zustand: <status>` (unverändert) |
| Teilnehmerzeile | Alias oder Nutzername, danach `anwesend` / `abwesend` (unverändert) |
| Hinweis nach `replaced` | `role="alert"`, Text unverändert; Schaltfläche `Hier weiterspielen` |
| Fassade, Ereignis `reconnect` | registriert über `on` wie die übrigen Ereignisse, Handler ohne Argument |
| Fassade, `enter` | beim ersten Betreten und bei jeder Wiederverbindung genau einmal je Ereignis, mit der `sessionId` des Raums |

## D5 — Testaufbau

- **Komponentenszenarien** („Wiederverbindung betritt den Raum erneut", erweitertes
  „Ersetzte Verbindung verbindet sich nicht neu"): Socket-Fassade gemockt wie in der
  bestehenden Sitzungsoberflächen-Suite — `createSessionSocket` liefert ein aufzeichnendes
  Objekt, dessen `on` die Handler nach Ereignisnamen ablegt, so dass der Test ein
  Server-Ereignis (und jetzt auch die Wiederverbindung) durch Aufruf des abgelegten Handlers
  auslöst. `enter` liefert je Aufruf ein vorbereitetes Acknowledgement; das zweite trägt einen
  anderen Zustand und eine andere Anwesenheit als das erste, damit „zeigt den frischen
  Zustand" beobachtbar ist. Zählung der `enter`- und `connect`-Aufrufe und der Anzahl
  erzeugter Fassaden aus dem Mock.
- **Socket-Szenario** („Raumwechsel setzt das Mitglied im alten Raum auf abwesend"): echte
  Socket.IO-Clients gegen die lauschende App wie in den bestehenden Raum-Suiten (Cookie in
  `extraHeaders`, WebSocket-Transport, kein automatisches Verbinden oder Wiederverbinden).
  Zwei Spielsitzungen, zwei Nutzer: Nutzer L ist Spielleiter von A und hat A betreten; Nutzer
  S ist Spieler in A (per Beitritt) und Spielleiter einer eigenen Spielsitzung B (per
  Erstellen — so braucht B nicht geöffnet zu werden). S betritt A über eine Verbindung, danach
  über **dieselbe** Verbindung B. Erwartung bei L: ein `session:participants` mit der
  `sessionId` von A, in dem S `online: false` ist — abgewartet als Ereignis nach dem Wechsel,
  nicht das frühere aus dem Betreten von A (das nennt S `online: true`).
