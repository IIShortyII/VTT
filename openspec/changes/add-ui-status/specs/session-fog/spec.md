## MODIFIED Requirements

### Requirement: Fog-Ansicht im Raum

Die Raumansicht (`game-session`, „Sitzungsoberfläche") SHALL die Fog-Darstellung aus dem
Enter-Acknowledgement übernehmen und mit jedem `session:fog` ersetzen. Als Bild-URL der
Kartenansicht (`session-map`, „Kartenansicht im Raum") SHALL sie für ein Mitglied mit Rolle
`spielleiter` `/api/sessions/<sessionId>/map-image` und für einen Spieler
`/api/sessions/<sessionId>/map-image?fog=<version>` mit der Fog-Version der aktuellen
Fog-Darstellung verwenden (keine URL, wenn `hasImage` falsch ist) — eine neue Fog-Version
stellt die Kartenansicht eines Spielers damit auf das neue Bild um. Die Kartenansicht SHALL
der Canvas-Fassade den Fog übergeben (beim Erzeugen und bei jeder Änderung per `setFog`):
die aufgedeckten Zellen und ob die Verdeckung deckend ist (`opaque` — für einen Spieler
`true`, für den Spielleiter `false`); ohne Fog-Darstellung `null`. Gezeichnet wird jede
Zelle des Zellbereichs der Karte, die nicht aufgedeckt ist, als dunkle Fläche über Bild und
Raster und unter den Tokens — deckend für Spieler, halbtransparent für den Spielleiter;
das Aussehen nimmt der menschliche App-Test ab.

Dem Spielleiter SHALL die Raumansicht bei aktiver Karte zusätzlich eine Fog-Verwaltung
anbieten: eine Werkzeugwahl `Schwenken` (Standard), `Aufdecken`, `Verdecken` und `Bereich
markieren`, die sie der Canvas-Fassade per `setTool` übergibt; Schaltflächen `Alles
aufdecken` und `Alles verdecken`; ein Feld `Bereichsname` mit einer Schaltfläche `Bereich
speichern`, eine Anzeige `Auswahl: <n> Zellen` und eine Schaltfläche `Auswahl leeren`; sowie — ohne
Bereiche — statt der Bereichsliste den Leerzustand von `ui-status` mit dem Titel
`Noch keine Bereiche` und dem Hinweis
`Markiere Zellen auf der Karte und speichere sie als Bereich.`, sonst je Bereich ein
Kontrollkästchen `<Name> aufgedeckt`, dessen Zustand `revealed` der Bereichsdarstellung
folgt, und eine Schaltfläche `<Name> löschen`. Die Canvas-Fassade SHALL
in den Werkzeugen `Aufdecken`, `Verdecken` und `Bereich markieren` statt zu schwenken beim
Ziehen einen Zellbereich auswählen und die ausgewählten Zellen beim Loslassen per
`onCellsSelected` melden (Aussehen und Ziehen im App-Test). Gemeldete Zellen SHALL im
Werkzeug `Aufdecken` als `session:fog-set` mit `revealed: true` und Ziel `zellen`, im
Werkzeug `Verdecken` mit `revealed: false` gesendet werden; im Werkzeug `Bereich markieren`
SHALL die Raumansicht sie zur lokalen Auswahl hinzufügen (Vereinigung, keine Doppelten), der
Fassade per `setSelection` übergeben und nichts senden. `Bereich speichern` SHALL
`session:fog-area-create` mit dem eingegebenen Namen und der Auswahl senden und bei
`{ ok: true }` die Auswahl leeren; ohne Auswahl SHALL die Schaltfläche deaktiviert sein.
Das Kontrollkästchen eines Bereichs SHALL `session:fog-set` mit dem Ziel `bereich` und
`revealed` gleich dem neuen Kästchenzustand senden; `<Name> löschen` SHALL
`session:fog-area-delete` senden. Der angezeigte Fog MUST NOT lokal geändert werden, bevor
der Server `session:fog` verteilt hat (`constitution.md` §9.1). Einem Spieler MUST NOT die
Raumansicht die Fog-Verwaltung zeigen. Eine Ablehnung des Servers (`{ ok: false,
message }`) SHALL als Meldung sichtbar sein.

#### Scenario: Kartenansicht eines Spielers erhält maskiertes Bild und Fog

- **GIVEN** die Anwendung hat den Raum `s1` betreten, und das Acknowledgement nennt `role:
  "spieler"`, `map` mit `mapId: "m1"`, `hasImage: true` und dem Raster `quadrat`, 70, 0, 0
  sowie `fog` mit `version: 2`, `revealed` gleich (0,0) und `areas: null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** erzeugt die Anwendung die Kartenansicht mit der Bild-URL
  `/api/sessions/s1/map-image?fog=2` und dem Fog mit `revealed` gleich genau (0,0) und
  `opaque: true`

#### Scenario: Kartenansicht des Spielleiters erhält das Originalbild

- **GIVEN** die Anwendung hat den Raum `s1` betreten, und das Acknowledgement nennt `role:
  "spielleiter"`, `map` mit `hasImage: true` und `fog` mit `version: 2`, `revealed` gleich
  (0,0) und `areas` als leerer Liste
- **WHEN** die Raumansicht gerendert wird
- **THEN** erzeugt die Anwendung die Kartenansicht mit der Bild-URL
  `/api/sessions/s1/map-image` (ohne Fog-Version) und dem Fog mit `revealed` gleich genau
  (0,0) und `opaque: false`

#### Scenario: Fog-Änderung folgt dem Server

- **GIVEN** die Raumansicht eines Spielers im Raum `s1` zeigt eine Karte mit Bild und Fog
  der Version 2 mit `revealed` gleich (0,0)
- **WHEN** die Anwendung `session:fog` mit `version: 3` und `revealed` gleich (0,0) und
  (1,0) erhält
- **THEN** übergibt sie der bestehenden Kartenansicht per `setFog` den Fog mit genau diesen
  zwei Zellen und `opaque: true` und stellt sie per `setImage` auf die Bild-URL
  `/api/sessions/s1/map-image?fog=3` um

#### Scenario: Spieler sieht keine Fog-Verwaltung

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spieler"`, eine aktive Karte und einen Fog
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie weder eine Werkzeugwahl `Aufdecken` noch eine Schaltfläche `Alles
  aufdecken` noch ein Feld `Bereichsname`

#### Scenario: Spielleiter sieht die Fog-Verwaltung

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spielleiter"`, eine aktive Karte und `fog` mit `areas` gleich genau einem Bereich „Raum
  1" mit `cellCount: 2` und `revealed: false`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie die Werkzeugwahl mit `Schwenken` ausgewählt und `Aufdecken`,
  `Verdecken`, `Bereich markieren` nicht ausgewählt, die Schaltflächen `Alles aufdecken` und
  `Alles verdecken`, das Feld `Bereichsname`, die deaktivierte Schaltfläche `Bereich
  speichern`, die Anzeige `Auswahl: 0 Zellen`, das nicht angekreuzte Kontrollkästchen `Raum 1
  aufgedeckt` und die Schaltfläche `Raum 1 löschen`

#### Scenario: Ohne aktive Karte keine Fog-Verwaltung

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spielleiter"`, `map: null` und `fog: null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie keine Werkzeugwahl `Aufdecken` und keine Schaltfläche `Alles aufdecken`

#### Scenario: Werkzeugwahl erreicht die Kartenansicht

- **GIVEN** die Raumansicht des Spielleiters zeigt die Fog-Verwaltung mit der Kartenansicht
- **WHEN** er das Werkzeug `Aufdecken` wählt
- **THEN** übergibt die Anwendung der Kartenansicht per `setTool` das Werkzeug `aufdecken`,
  und `Aufdecken` ist ausgewählt

#### Scenario: Aufdecken sendet die Auswahl

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` mit gewähltem Werkzeug `Aufdecken`
  und Fog der Version 0 ohne aufgedeckte Zellen
- **WHEN** die Kartenansicht per `onCellsSelected` die Zellen (0,0) und (1,0) meldet
- **THEN** sendet die Anwendung `session:fog-set` mit `{ sessionId: "s1", revealed: true,
  target: { kind: "zellen", cells } }` mit genau diesen zwei Zellen und hat der
  Kartenansicht keinen geänderten Fog übergeben, bis `session:fog` eintrifft

#### Scenario: Verdecken sendet die Auswahl

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` mit gewähltem Werkzeug `Verdecken`
- **WHEN** die Kartenansicht per `onCellsSelected` die Zelle (0,0) meldet
- **THEN** sendet die Anwendung `session:fog-set` mit `{ sessionId: "s1", revealed: false,
  target: { kind: "zellen", cells } }` mit genau dieser Zelle

#### Scenario: Bereich markieren sammelt die Auswahl

- **GIVEN** die Raumansicht des Spielleiters mit gewähltem Werkzeug `Bereich markieren`
- **WHEN** die Kartenansicht per `onCellsSelected` erst (0,0) und (1,0) und danach (1,0) und
  (2,0) meldet
- **THEN** hat die Anwendung kein `session:fog-set` gesendet, der Kartenansicht per
  `setSelection` zuletzt genau die drei Zellen (0,0), (1,0) und (2,0) übergeben, zeigt
  `Auswahl: 3 Zellen`, und `Bereich speichern` ist aktiviert

#### Scenario: Bereich speichern sendet die Absicht und leert die Auswahl

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` mit einer Auswahl aus den Zellen
  (0,0), (1,0) und (2,0)
- **WHEN** er im Feld `Bereichsname` „Raum 1" eingibt, `Bereich speichern` betätigt und das
  Acknowledgement `{ ok: true, fog }` lautet
- **THEN** hat die Anwendung `session:fog-area-create` mit `{ sessionId: "s1", name: "Raum
  1", cells }` mit genau diesen drei Zellen gesendet, zeigt danach `Auswahl: 0 Zellen`, hat
  der Kartenansicht per `setSelection` die leere Liste übergeben, und `Bereich speichern` ist
  deaktiviert

#### Scenario: Auswahl leeren

- **GIVEN** die Raumansicht des Spielleiters mit einer Auswahl aus zwei Zellen
- **WHEN** er `Auswahl leeren` betätigt
- **THEN** zeigt die Anwendung `Auswahl: 0 Zellen`, hat der Kartenansicht per `setSelection`
  die leere Liste übergeben, und hat nichts gesendet

#### Scenario: Bereich umschalten sendet die Absicht und folgt dem Server

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` zeigt den Bereich „Raum 1" (`id`
  `a1`) mit nicht angekreuztem Kontrollkästchen
- **WHEN** er `Raum 1 aufgedeckt` ankreuzt
- **THEN** sendet die Anwendung `session:fog-set` mit `{ sessionId: "s1", revealed: true,
  target: { kind: "bereich", areaId: "a1" } }`, das Kontrollkästchen bleibt nicht
  angekreuzt, bis `session:fog` mit `revealed: true` für „Raum 1" eintrifft, und ist danach
  angekreuzt

#### Scenario: Bereich löschen sendet die Absicht

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` zeigt den Bereich „Raum 1" (`id`
  `a1`)
- **WHEN** er `Raum 1 löschen` betätigt
- **THEN** sendet die Anwendung `session:fog-area-delete` mit `{ sessionId: "s1", areaId:
  "a1" }`, und „Raum 1" bleibt gelistet, bis `session:fog` ohne „Raum 1" eintrifft

#### Scenario: Alles aufdecken und Alles verdecken senden die Absicht

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` zeigt die Fog-Verwaltung
- **WHEN** er `Alles aufdecken` und danach `Alles verdecken` betätigt
- **THEN** hat die Anwendung `session:fog-set` mit `{ sessionId: "s1", revealed: true,
  target: { kind: "alle" } }` und danach mit `{ sessionId: "s1", revealed: false, target:
  { kind: "alle" } }` gesendet

#### Scenario: Abgelehnte Fog-Aktion zeigt die Meldung

- **GIVEN** die Raumansicht des Spielleiters zeigt die Fog-Verwaltung
- **WHEN** er `Alles aufdecken` betätigt und das Acknowledgement `{ ok: false, message:
  "Keine Karte aktiv." }` lautet
- **THEN** zeigt die Anwendung diese Meldung an, und der Kartenansicht wurde kein geänderter
  Fog übergeben

#### Scenario: Ohne Bereiche zeigt die Fog-Verwaltung den Leerzustand

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, eine aktive Karte und `fog` mit `areas` gleich `[]`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt die Gruppe `Fog of War` einen Absatz der Klasse `empty-state` mit dem Titel
  `Noch keine Bereiche` und dem Hinweis
  `Markiere Zellen auf der Karte und speichere sie als Bereich.`, kein Element der Rolle
  `listitem` und kein Kontrollkästchen, dessen Name auf `aufgedeckt` endet, aber weiterhin
  die Schaltflächen `Alles aufdecken` und `Alles verdecken`
