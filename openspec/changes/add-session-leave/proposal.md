## Why

`game-session` kennt Beitritt per Code und dauerhafte Mitgliedschaft, aber keinen Weg
hinaus: weder für den Spieler (austreten) noch für den Spielleiter (einen Spieler
entfernen). Zwei bereits gemergte Changes setzen diese fehlende Aktion voraus — #11
(`add-measure-draw`, D1: „Verlässt ein Nutzer die Sitzung, bleiben seine geteilten
Anmerkungen mit Urheber `null`, private werden gelöscht") und #15 (Zuweisungsfeld zeigt
„Spielleiter", wenn der gespeicherte Besitzer nicht mehr Teilnehmer ist). Beide Regeln sind
heute nicht erreichbar, weil es das Verlassen nicht gibt. Für ein Projekt, das nach der
Abnahme privat weitergenutzt wird, fehlt der Austritt (Issue #70, Epic #68).

## What Changes

- **Server: Verlassen und Entfernen per REST.** Neue Route `DELETE
  /api/sessions/:id/members/:userId`. Ein Spieler beendet damit seine eigene Mitgliedschaft
  (Selbstaustritt); der Spielleiter entfernt damit die Mitgliedschaft eines Spielers. Die
  Berechtigung wird pro Aktion geprüft (`constitution.md` §9.3). Der Spielleiter kann über
  diese Route **nicht** selbst austreten — das Löschen oder Übergeben der Spielsitzung ist
  ein eigener Change.
- **Server: transaktionale Bereinigung abhängiger Daten.** In **einer** Prisma-Transaktion:
  die Mitgliedschaft wird gelöscht; Tokens dieser Spielsitzung mit dem Betroffenen als
  Besitzer verlieren die Zuweisung (`ownerId: null`); die `userId` des Betroffenen wird aus
  jeder listenwertigen Zielgruppe der Tokens entfernt; geteilte Anmerkungen des Betroffenen
  behalten die Karte, verlieren aber den Urheber (`null`), private Anmerkungen werden
  gelöscht.
- **Server: sofortiger Raumausschluss (§9.2/§9.3).** Nach der Transaktion erhält der Raum
  ein `session:participants` ohne die entfernte Mitgliedschaft. Ist der Betroffene verbunden
  und im Raum, erhält er `session:removed` und wird **sofort** aus dem Raum entfernt — nicht
  erst beim nächsten Verbindungsaufbau; ein erneuter Beitritt braucht wieder den
  Sitzungscode.
- **Client: Austreten und Entfernen in der Teilnehmerliste.** Im Reiter `Teilnehmer` trägt
  die eigene Zeile eines Spielers die Aktion `Austreten`, jede Spielerzeile beim Spielleiter
  die Aktion `Entfernen`; beide lösen den REST-Aufruf direkt aus (ein Bestätigungsdialog ist mögliche
  Folgearbeit, siehe design.md D4). Die eigene Zeile des Spielleiters trägt keine solche Aktion. Erhält die
  Anwendung `session:removed`, kehrt sie zur Sitzungsliste zurück und zeigt einen Hinweis.

**Nicht im Umfang:** Selbstaustritt des Spielleiters, Löschen einer Spielsitzung, Übergabe
der Spielleitung (eigene Changes); ein Sperren/Bann, der den erneuten Beitritt verhindert
(der Code genügt weiterhin).

## Capabilities

### New Capabilities
- keine

### Modified Capabilities
- `game-session`: neues Requirement „Verlassen einer Spielsitzung und Entfernen eines
  Spielers" (REST-Route, Berechtigung pro Aktion, transaktionale Auslösung der Bereinigung,
  `session:removed` samt sofortigem Raumausschluss). Requirement „Sitzungsrouten verlangen
  eine Anmeldung" um die neue Route erweitert. Requirement „Teilnehmerliste in Echtzeit" um
  Verlassen/Entfernen als Auslöser und den Wegfall der Mitgliedschaft aus der Liste
  erweitert. Requirement „Sitzungsoberfläche" um die Aktionen `Austreten`/`Entfernen` in der
  Teilnehmerliste und die Behandlung von `session:removed` erweitert.
- `session-token`: neues Requirement „Bereinigung der Tokens beim Verlassen" — Besitzer wird
  `null`, die `userId` verlässt jede listenwertige Zielgruppe.
- `session-annotation`: neues Requirement „Bereinigung der Anmerkungen beim Verlassen" —
  geteilte behalten die Karte mit Urheber `null`, private werden gelöscht.

## Impact

**Geänderter Code:**
- `src/server/session/` — neue REST-Route, Berechtigungsprüfung pro Aktion, die
  Bereinigungs-Transaktion und das serverseitige Emittieren von `session:participants` und
  `session:removed` samt Raumaustritt der betroffenen Verbindungen.
- `src/client/session/` — `Austreten`/`Entfernen` in der Teilnehmerliste mit
  REST-Aufruf, Behandlung von `session:removed`.
- `src/client/i18n/` — neue Textschlüssel (deutsches und englisches Wörterbuch, identische
  Schlüsselmenge; von `ui-text` per Typecheck erzwungen, daher kein `ui-text`-Delta).

**Kein Schemawechsel im Umfang dieses Changes vorausgesetzt:** Die Regeln werden im
Code-Pfad der Transaktion durchgesetzt (behavior-first), unabhängig davon, ob eine
Fremdschlüssel-Regel Teile bereits abdeckt. Keine neuen Dependencies.

**Testinfrastruktur:** Integrationstests gegen die ephemere Wegwerf-DB für Route,
Berechtigung und Bereinigung; Socket-Integrationstests für `session:removed` und den
Raumausschluss; Komponententests gegen die gemockte Socket-Fassade/REST-Grenze für die
Teilnehmerlisten-Aktionen.
