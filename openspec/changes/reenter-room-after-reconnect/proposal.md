## Why

Zwei Lücken aus dem Review zu #6 (`add-game-session`), vom Menschen beim App-Test bewusst als
Folgearbeit eingestuft (Issue #46). Beide sind Abweichungen zwischen dem, was Spec und Design
versprechen, und dem, was der Code tut — kein Informationsleck, keine Verletzung von
`constitution.md` §9, aber am Spieltisch spürbar:

1. **Kein erneutes Betreten nach Netzabbruch.** `design.md` D10 von #6 verspricht, dass eine
   Wiederverbindung nach Netzfehler `session:enter` erneut ruft, weil der Server den Raum nach
   einer Trennung nicht kennt. Die Socket-Fassade lässt `socket.io-client` automatisch
   wiederverbinden, aber weder Fassade noch Raumansicht reagieren darauf. Nach einem kurzen
   WLAN-Aussetzer ist der Socket wieder verbunden, aber nicht mehr im Raum: keine
   Teilnehmerlisten, keine Zustandswechsel, keine Karte, kein Hinweis.
2. **Raumwechsel ohne Teilnehmer-Broadcast an den alten Raum.** Die Requirement
   „Teilnehmerliste in Echtzeit" nennt „Wechsel in einen anderen Raum" als Auslöser. Beim
   `session:enter` für eine andere Spielsitzung nimmt der Server den Nutzer aus der Anwesenheit
   des alten Raums und verlässt ihn, sendet dem alten Raum aber kein `session:participants`.
   Die Verbliebenen sehen den Nutzer weiter als anwesend. Aus dem gelieferten Client nicht
   auslösbar (eine Fassade je Raum), aber ein fremder Client kann es.

## What Changes

- **Client: Wiederverbindung betritt den Raum erneut.** Die Socket-Fassade meldet eine
  Wiederverbindung (jede erfolgreiche Verbindung nach der ersten) als eigenes Ereignis. Die
  Raumansicht ruft daraufhin `session:enter` erneut über dieselbe Fassade und übernimmt
  Zustand, Teilnehmer und aktive Karte aus dem frischen Acknowledgement — der Server bleibt
  die einzige Quelle des Zustands (§9.1). Ein abgelehntes erneutes Betreten wird wie ein
  abgelehntes erstes Betreten angezeigt.
- **Client: nach `session:replaced` weiterhin kein automatisches Betreten.** Die bestehende
  Regel bleibt und wird gegen die neue Automatik abgesichert: hat die Raumansicht
  `session:replaced` erhalten, löst auch eine gemeldete Wiederverbindung kein
  `session:enter` aus; das Betreten bleibt der Schaltfläche „Hier weiterspielen" vorbehalten.
- **Server: Raumwechsel meldet dem alten Raum die Abwesenheit.** Betritt eine Verbindung eine
  andere Spielsitzung, erhält der bisherige Raum ein `session:participants`, in dem der
  Nutzer `online: false` ist — derselbe Broadcast wie bei einem Verbindungsabbruch.

**Nicht im Umfang:** ein sichtbarer Hinweis während einer laufenden Unterbrechung
(„Verbindung unterbrochen …"); ein Wiederbetreten nach einem Seiten-Reload (ohne Router keine
URL, D10 von #6); eine Änderung an der Übernahme-Logik (`session:replaced`) selbst.

## Capabilities

### New Capabilities
- keine

### Modified Capabilities
- `game-session`: Requirement „Sitzungsoberfläche" — neues Szenario „Wiederverbindung
  betritt den Raum erneut"; Szenario „Ersetzte Verbindung verbindet sich nicht neu" um die
  gemeldete Wiederverbindung nach `session:replaced` erweitert. Requirement
  „Teilnehmerliste in Echtzeit" — neues Szenario „Raumwechsel setzt das Mitglied im alten Raum
  auf abwesend". Alle übrigen Requirements und Szenarien bleiben unverändert.

## Impact

**Geänderter Code:**
- `src/client/session/socket.ts` — Fassade meldet Wiederverbindungen (`on('reconnect', …)`)
- `src/client/session/SessionRoom.tsx` — erneutes `enter` bei Wiederverbindung, gesperrt nach
  `replaced`; Verdrahtung der Fassade an einer Stelle statt zweimal
- `src/server/session/socket.ts` — `session:participants` an den bisherigen Raum beim Wechsel

**Kein neuer Code, kein Schema, keine Migration, keine neuen Dependencies.**

**Testinfrastruktur:** Komponententests gegen die gemockte Socket-Fassade (bestehende
Mock-Grenze aus #6; das neue Ereignis läuft über denselben Handler-Mechanismus wie
`participants` oder `replaced`). Socket-Integrationstests mit echten Socket.IO-Clients gegen
die lauschende App wie in #6/#45/#50.
