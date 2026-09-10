## Why

Das VTT hat Nutzer (#12, #13), aber keinen Ort, an dem sie zusammenkommen: keine Spielsitzung,
keinen Spielleiter, keine Mitspieler. Alles Folgende — Karte (#7), Tokens (#8), Fog of War
(#9) — braucht diesen Raum und die Antwort auf die Frage, wer darin was darf. Dieser Change
legt den Raum an und trifft die Architekturentscheidung, die jeden späteren Change prägt: wo
der autoritative Laufzeitzustand lebt (Issue #6).

Er ist zugleich der erste Change mit Socket.IO — und damit der erste, in dem
`constitution.md` §9.3 tatsächlich einzulösen ist: Berechtigungen pro Aktion, nicht pro
Verbindung.

## What Changes

- **Spielsitzung erstellen.** Ein angemeldeter Nutzer legt eine Spielsitzung mit Namen an und
  ist deren Spielleiter. Der Server vergibt einen sechsstelligen Sitzungscode.
- **Beitritt per Sitzungscode.** Ein angemeldeter Nutzer wird durch Eingabe des Codes Mitglied
  (Rolle Spieler). Die Mitgliedschaft ist dauerhaft: beim nächsten Spielabend genügt „Meine
  Sitzungen", kein Code mehr. Ein Beitritt ist nur möglich, solange die Sitzung nicht
  `geschlossen` ist; geschlossene Sitzung und unbekannter Code sind für den Anfragenden nicht
  unterscheidbar.
- **Lebenszyklus, den nur der Spielleiter steuert:** `geschlossen` → `geöffnet` → `gestartet`
  ⇄ `pausiert` → `geschlossen`. Geöffnet heißt beitretbar; gestartet heißt, dass Spieler
  später Aktionen auf dem Spielfeld ausführen dürfen; pausiert und geschlossen verbieten das.
  Beenden trennt alle Spieler vom Raum. Der Spielleiter erreicht seine Sitzung in jedem Zustand.
- **Verbindungsverlust des Spielleiters** in `gestartet` pausiert die Sitzung — in der
  Datenbank. Eine Pause endet ausschließlich durch ein erneutes „Starten" des Spielleiters,
  nie automatisch durch seine Rückkehr. Beim Serverstart wird jede Sitzung im Zustand
  `gestartet` auf `pausiert` gesetzt, weil dann niemand verbunden ist.
- **Teilnehmerliste in Echtzeit.** Mitglieder mit Rolle und Anwesenheit; aktualisiert sich bei
  allen im Raum, wenn jemand beitritt, den Raum betritt oder ihn verlässt.
- **Eine Verbindung pro Nutzer und Sitzung.** Öffnet derselbe Nutzer die Sitzung ein zweites
  Mal (zweiter Tab, zweites Gerät), übernimmt die neue Verbindung; die alte wird benachrichtigt
  und vom Server getrennt und verbindet sich nicht von selbst neu.
- **Erste Socket.IO-Anbindung.** Identität stammt aus dem Sitzungscookie aus #12. Am Socket
  wird nichts als Erlaubnis gecacht: jede Aktion löst Cookie-Sitzung, Mitgliedschaft und
  Sitzungszustand frisch aus der Datenbank auf (§9.3). Jedes eingehende Ereignis wird an der
  Grenze mit einem zod-Schema aus `shared/session.ts` validiert; ein scheiterndes Ereignis
  antwortet dem Absender per Acknowledgement statt lautlos zu verpuffen.
- **Verdeckte Information wird serverseitig gefiltert** (§9.2): den Sitzungscode erhält nur
  der Spielleiter, nie ein Spieler.
- **Oberfläche:** „Meine Sitzungen" mit Erstellen und Beitreten; Raumansicht mit Name, Zustand,
  Teilnehmerliste und — nur für den Spielleiter — Code und Zustandssteuerung. Die
  Teilnehmerliste zeigt bis #45 die E-Mail, weil das Nutzerkonto nichts anderes hat.

**Nicht im Umfang:** Karte, Tokens, Aktionen auf dem Spielfeld (die „darf gerade"-Prüfung
bekommt ihren ersten Nutzer in #7), Nutzername und Alias (#45), Einladungslink, Spielleiter
wechseln oder mehrere Spielleiter, Mitglieder entfernen, Sitzung löschen.

## Capabilities

### New Capabilities
- `game-session`: Anlegen, Beitreten, Lebenszyklus und Anwesenheit einer Spielsitzung — wer
  Mitglied ist, welche Rolle er hat, in welchem Zustand die Sitzung steht, wer gerade
  verbunden ist, und was der Server davon an wen sendet. Umfasst die Regel, dass jede
  Socket-Aktion pro Aufruf autorisiert wird.

### Modified Capabilities
Keine. `user-auth` bleibt unverändert; dieser Change *benutzt* die Cookie-Sitzung, ändert aber
keine ihrer Requirements. Die angemeldete Ansicht bekommt Inhalt (Sitzungsliste), behält aber
Abmelden und Passwortänderung — die bestehenden Szenarien der Anmeldeoberfläche gelten weiter.

## Impact

**Schema** (`prisma/schema.prisma`): neue Modelle `GameSession` (Name, Code, Zustand) und
`Membership` (Nutzer ↔ Spielsitzung, Rolle). Die Migration führt der Agent nicht gegen die
Entwicklungs-DB aus (§5.1, §6.1).

**Neuer Code:**
- `src/shared/session.ts` — zod-Verträge für REST-Körper, Socket-Ereignisse und
  Antwortformen; Zustandstabelle des Lebenszyklus, von Client und Server gemeinsam benutzt
- `src/server/session/` — reine Regeln (Code, Übergänge), Anwesenheitsregister (Speicher),
  Autorisierung pro Aktion, REST-Routen, Socket-Handler
- `src/client/session/` — Sitzungsliste, Raumansicht, Socket-Anbindung

**Geänderter Code:**
- `src/server/core/app.ts` — Socket.IO-Server an die Fastify-Instanz binden, Start-Hook zur
  Normalisierung von `gestartet` → `pausiert`
- `src/client/app/App.tsx` — angemeldete Ansicht zeigt Sitzungsliste bzw. Raum
- `vite.config.ts` — Dev-Proxy für `/socket.io` mit WebSocket-Weiterleitung

**Dependencies:** keine neuen. `socket.io` und `socket.io-client` sind seit dem Projektstart
in `package.json`, wurden aber noch nie importiert.

**Konfiguration:** keine neue Umgebungsvariable.

**Testinfrastruktur:** erste Integrationstests, die einen lauschenden Server brauchen
(Socket.IO läuft nicht über `app.inject()`); der Aufbau ist in design.md beschrieben.
Komponententests mocken das Socket-Modul des Clients.
