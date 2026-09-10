## Purpose

Bringt die Karten der Bibliothek in den Raum: der Spielleiter hängt eigene Karten in eine
Spielsitzung ein, schaltet eine davon aktiv, und alle Teilnehmer sehen dieselbe Karte auf dem
Canvas — live, auch beim Wechsel. Legt fest, dass nur der Spielleiter Karten verwaltet, dass
Spieler ausschließlich die aktive Karte kennen, und dass eine Änderung an der Bibliothekskarte
jeden Raum erreicht, in dem sie gerade aktiv ist.

## Begriffe

- **Karteninstanz** (kurz: Instanz): eine in eine Spielsitzung eingehängte Bibliothekskarte
  (Modell `MapInstance`): Spielsitzung, Karte, Position. Raster und Bild bleiben an der
  Karte; die Instanz ist ein Verweis mit eigener Identität. Eine Karte ist je Spielsitzung
  höchstens einmal eingehängt; dieselbe Karte darf in mehreren Spielsitzungen liegen.
- **Position**: ganze Zahl ab 1, die Reihenfolge des Einhängens innerhalb einer Spielsitzung.
  Die erste Instanz einer Spielsitzung bekommt Position 1, jede weitere die bisher höchste
  Position plus 1. Ein Aushängen verschiebt die übrigen nicht.
- **Aktive Karte**: höchstens eine Instanz je Spielsitzung, die der Spielleiter zum Anzeigen
  gewählt hat. „Keine aktive Karte" ist ein gültiger Zustand. Die aktive Karte wird an der
  Spielsitzung gespeichert und überlebt Neustart und Verbindungsabbrüche.
- **Instanzdarstellung**: `{ id, mapId, name, hasImage, grid, position }` — `name`,
  `hasImage` und `grid` stammen von der Karte (`map-library`, „Drahtformat"). Nur der
  Spielleiter erhält sie.
- **Aktive-Karte-Darstellung**: `{ instanceId, mapId, name, hasImage, grid }` oder `null`.
  Sie erreicht jeden Teilnehmer im Raum — sie enthält nichts, was nicht auch auf dem Canvas
  sichtbar wäre (`constitution.md` §9.2).

Drahtformat: REST unter `/api/sessions/:id/maps` (Liste, Einhängen) und
`/api/sessions/:id/maps/:instanceId` (Aushängen); Socket-Ereignis `session:activate-map`
`{ sessionId, instanceId }` (Client → Server, `instanceId` ist eine Instanz-ID oder `null`,
Acknowledgement `{ ok: true, map }` mit der Aktive-Karte-Darstellung oder
`{ ok: false, message }`) und `session:map` `{ sessionId, map }` (Server → Client, `map` ist
die Aktive-Karte-Darstellung oder `null`). Das Acknowledgement von `session:enter`
(`game-session`) trägt zusätzlich `map` mit der Aktive-Karte-Darstellung oder `null`.
Fehlerantworten der REST-Routen tragen `{ statusCode, error, message, field? }` wie die
übrigen Routen.

## ADDED Requirements

### Requirement: Instanzrouten verlangen den Spielleiter

Jede Route unter `/api/sessions/:id/maps` SHALL ohne gültige Anmelde-Sitzung mit `401`
antworten und MUST NOT in diesem Fall etwas verändern. Mit gültiger Anmelde-Sitzung SHALL
jede dieser Routen pro Anfrage prüfen, dass der Anfragende Mitglied mit Rolle
`spielleiter` genau dieser Spielsitzung ist. Ein Mitglied mit Rolle `spieler`, ein
Nicht-Mitglied und eine unbekannte Spielsitzung SHALL mit identischem Statuscode (`404`) und
identischer Meldung beantwortet werden (`constitution.md` §9.2 — welche Karten ein
Spielleiter vorbereitet hat, erfahren Spieler nicht, auch nicht durch Ausprobieren); in allen
drei Fällen MUST NOT sich etwas ändern.

#### Scenario: Instanzrouten ohne Cookie

- **GIVEN** eine Spielsitzung mit einer eingehängten Karte und kein Sitzungscookie
- **WHEN** `GET /api/sessions/:id/maps`, `POST /api/sessions/:id/maps` mit einer gültigen
  `mapId` und `DELETE /api/sessions/:id/maps/:instanceId` eingehen
- **THEN** antwortet der Server jedes Mal mit `401`, und die Anzahl der Karteninstanzen in
  der Datenbank ist unverändert

#### Scenario: Spieler, Nicht-Mitglied und unbekannte Spielsitzung sind nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit Spielleiter, einem Spieler-Mitglied
  `sam` und einem angemeldeten Nutzer ohne Mitgliedschaft, sowie keine Spielsitzung mit der
  `id` `unbekannt`
- **WHEN** `GET /api/sessions/:id/maps` je mit dem Cookie von `sam` auf diese Spielsitzung,
  mit dem Cookie des Nicht-Mitglieds auf diese Spielsitzung und mit dem Cookie des
  Spielleiters auf `unbekannt` eingeht
- **THEN** antworten alle drei mit `404`, und Statuscode und `message` der drei Antworten
  sind identisch

### Requirement: Karte einhängen

Das System SHALL dem Spielleiter über `POST /api/sessions/:id/maps` mit `{ mapId }`
erlauben, eine Karte, deren Besitzer er ist, in die Spielsitzung einzuhängen. Bei Erfolg
SHALL eine Karteninstanz mit der nächsten Position entstehen und der Server mit `201` und
der Instanzdarstellung antworten. Eine Karte, deren Besitzer nicht der Anfragende ist, und
eine Karte, die nicht existiert, SHALL mit identischem Statuscode (`404`) und identischer
Meldung beantwortet werden (`map-library`, „Karte ändern"; `constitution.md` §9.2). Eine
Karte, die in dieser Spielsitzung bereits eingehängt ist, SHALL mit `409` beantwortet
werden. Eine Payload ohne gültige `mapId` SHALL mit `400` und `field` gleich `mapId`
beantwortet werden. In allen Ablehnungsfällen MUST NOT eine Instanz entstehen.

#### Scenario: Spielleiter hängt eigene Karte ein

- **GIVEN** ein Spielleiter mit der Spielsitzung `Freitagsrunde` ohne eingehängte Karten und
  der eigenen Karte „Taverne" (mit Bild, Raster `quadrat`, 70, 0, 0)
- **WHEN** `POST /api/sessions/:id/maps` mit `{ "mapId": "<id von Taverne>" }` und seinem
  Cookie eingeht
- **THEN** antwortet der Server mit `201` und `{ id, mapId: "<id von Taverne>", name:
  "Taverne", hasImage: true, grid: { type: "quadrat", size: 70, offsetX: 0, offsetY: 0 },
  position: 1 }`, und in der Datenbank existiert genau eine Karteninstanz dieser
  Spielsitzung zu dieser Karte mit Position 1

#### Scenario: Fremde und unbekannte Karte sind nicht unterscheidbar

- **GIVEN** ein Spielleiter mit einer Spielsitzung, Nutzer B besitzt die Karte „Krypta", und
  es gibt keine Karte mit der `id` `unbekannt`
- **WHEN** je ein `POST /api/sessions/:id/maps` vom Spielleiter mit der `id` von „Krypta" und
  mit `unbekannt` eingeht
- **THEN** antworten beide mit `404`, Statuscode und `message` beider Antworten sind
  identisch, und in der Datenbank existiert keine Karteninstanz dieser Spielsitzung

#### Scenario: Doppeltes Einhängen wird abgelehnt

- **GIVEN** ein Spielleiter, dessen Karte „Taverne" in seiner Spielsitzung bereits eingehängt
  ist
- **WHEN** `POST /api/sessions/:id/maps` mit der `id` von „Taverne" erneut eingeht
- **THEN** antwortet der Server mit `409`, und in der Datenbank existiert weiterhin genau
  eine Karteninstanz dieser Spielsitzung zu dieser Karte

### Requirement: Eingehängte Karten auflisten

Das System SHALL dem Spielleiter über `GET /api/sessions/:id/maps` alle Karteninstanzen
dieser Spielsitzung liefern, aufsteigend nach Position, jeweils als Instanzdarstellung.
Instanzen anderer Spielsitzungen MUST NOT enthalten sein.

#### Scenario: Liste in Reihenfolge des Einhängens

- **GIVEN** ein Spielleiter hat in seine Spielsitzung `A` zuerst „Taverne" (ohne Bild) und
  danach „Wald" (mit Bild, Raster `hex-spitz`, 60, 12, −8) eingehängt, und in seine
  Spielsitzung `B` die Karte „Krypta"
- **WHEN** `GET /api/sessions/<id von A>/maps` mit seinem Cookie eingeht
- **THEN** antwortet der Server mit `200` und genau zwei Einträgen: zuerst „Taverne" mit
  `position: 1` und `hasImage: false`, dann „Wald" mit `position: 2`, `hasImage: true` und
  `grid: { type: "hex-spitz", size: 60, offsetX: 12, offsetY: -8 }`; jeder Eintrag trägt
  `id` und `mapId`; „Krypta" fehlt

### Requirement: Karte aushängen

Das System SHALL dem Spielleiter über `DELETE /api/sessions/:id/maps/:instanceId` erlauben,
eine Karteninstanz dieser Spielsitzung zu entfernen: `204`, die Instanz existiert nicht
mehr, die Karte selbst bleibt unverändert bestehen. Ist die Instanz die aktive Karte, SHALL
die Spielsitzung danach keine aktive Karte haben und allen im Raum `session:map` mit
`map: null` gesendet werden. Eine Instanz, die zu einer anderen Spielsitzung gehört, und
eine Instanz, die nicht existiert, SHALL mit identischem Statuscode (`404`) und identischer
Meldung beantwortet werden, ohne Änderung.

#### Scenario: Aushängen entfernt die Instanz, nicht die Karte

- **GIVEN** ein Spielleiter, dessen Karte „Taverne" in seiner Spielsitzung eingehängt, aber
  nicht aktiv ist
- **WHEN** `DELETE /api/sessions/:id/maps/:instanceId` mit der `id` dieser Instanz eingeht
- **THEN** antwortet der Server mit `204`, die Karteninstanz existiert nicht mehr in der
  Datenbank, und die Karte „Taverne" existiert weiterhin mit unverändertem Bild und Raster

#### Scenario: Aushängen der aktiven Karte leert den Raum

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, deren Karte „Taverne" eingehängt und
  aktiv ist, und in deren Raum ein Spieler anwesend ist
- **WHEN** der Spielleiter `DELETE /api/sessions/:id/maps/:instanceId` für diese Instanz
  sendet
- **THEN** antwortet der Server mit `204`, der Spieler erhält `session:map` mit
  `{ sessionId, map: null }`, und die Spielsitzung verweist in der Datenbank auf keine aktive
  Instanz mehr

#### Scenario: Instanz einer anderen Spielsitzung ist nicht erreichbar

- **GIVEN** ein Spielleiter mit den Spielsitzungen `A` und `B`, „Taverne" ist in `B`
  eingehängt, und es gibt keine Instanz mit der `id` `unbekannt`
- **WHEN** je ein `DELETE /api/sessions/<id von A>/maps/:instanceId` mit der `id` der
  Instanz aus `B` und mit `unbekannt` eingeht
- **THEN** antworten beide mit `404`, Statuscode und `message` beider Antworten sind
  identisch, und die Instanz in `B` existiert weiterhin

### Requirement: Aktive Karte setzen

Der Spielleiter SHALL mit `session:activate-map` `{ sessionId, instanceId }` die aktive
Karte seiner Spielsitzung setzen (`instanceId` einer Instanz dieser Spielsitzung) oder
zurücksetzen (`instanceId` gleich `null`). Die Berechtigung SHALL pro Aktion geprüft werden
wie jede andere Raumaktion (`game-session`, „Autorisierung pro Aktion"; `constitution.md`
§9.3). Ein erlaubter Aufruf SHALL die aktive Karte in der Datenbank ändern, mit
`{ ok: true, map }` bestätigt werden und allen im Raum `session:map` `{ sessionId, map }`
senden — `map` ist die Aktive-Karte-Darstellung oder `null`, bestimmt vom Server, nicht aus
der Payload übernommen.

Ein Aufruf durch ein Mitglied mit Rolle `spieler`, ein Aufruf mit einer `instanceId`, die zu
einer anderen Spielsitzung gehört oder nicht existiert, und ein Ereignis, dessen Payload
nicht dem Vertrag entspricht, SHALL mit `{ ok: false, message }` beantwortet werden und
MUST NOT die aktive Karte ändern oder ein `session:map` auslösen.

#### Scenario: Spielleiter aktiviert eine Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, in deren Raum Spielleiter und ein
  Spieler anwesend sind, mit der eingehängten, nicht aktiven Karte „Taverne" (mit Bild,
  Raster `quadrat`, 70, 0, 0)
- **WHEN** der Spielleiter `session:activate-map` mit der `instanceId` von „Taverne" sendet
- **THEN** lautet das Acknowledgement `{ ok: true, map: { instanceId, mapId, name:
  "Taverne", hasImage: true, grid: { type: "quadrat", size: 70, offsetX: 0, offsetY: 0 } } }`,
  der Spieler erhält `session:map` mit derselben `map`, und die Spielsitzung verweist in der
  Datenbank auf diese Instanz als aktive

#### Scenario: Aktive Karte zurücksetzen

- **GIVEN** eine Spielsitzung, deren Karte „Taverne" aktiv ist, in deren Raum Spielleiter und
  ein Spieler anwesend sind
- **WHEN** der Spielleiter `session:activate-map` mit `instanceId: null` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, map: null }`, der Spieler erhält
  `session:map` mit `map: null`, und die Spielsitzung verweist in der Datenbank auf keine
  aktive Instanz

#### Scenario: Spieler darf keine Karte aktivieren

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit der eingehängten, nicht aktiven Karte
  „Taverne", in deren Raum ein Spieler anwesend ist
- **WHEN** der Spieler `session:activate-map` mit der `instanceId` von „Taverne" sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung verweist
  in der Datenbank weiterhin auf keine aktive Instanz

#### Scenario: Instanz einer anderen Spielsitzung kann nicht aktiviert werden

- **GIVEN** ein Spielleiter der Spielsitzungen `A` und `B`, „Taverne" ist in `B` eingehängt,
  und er ist im Raum von `A` anwesend
- **WHEN** er `session:activate-map` mit der `sessionId` von `A` und der `instanceId` der
  Instanz aus `B` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und weder `A` noch `B`
  verweist in der Datenbank auf eine aktive Instanz

#### Scenario: Ungültige Payload beim Aktivieren

- **GIVEN** ein Spielleiter ist im Raum seiner Spielsitzung anwesend, die keine aktive Karte
  hat
- **WHEN** er `session:activate-map` mit einer Payload sendet, die kein Objekt mit
  `sessionId` ist (etwa eine Zahl)
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung verweist
  in der Datenbank weiterhin auf keine aktive Instanz

#### Scenario: Abmeldung wirkt auf das Aktivieren

- **GIVEN** ein Spielleiter, der den Raum seiner Spielsitzung betreten hat, mit der
  eingehängten, nicht aktiven Karte „Taverne"
- **WHEN** `POST /api/auth/logout` mit seinem Cookie eingeht und er danach über dieselbe
  Socket-Verbindung `session:activate-map` mit der `instanceId` von „Taverne" sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung verweist
  in der Datenbank weiterhin auf keine aktive Instanz

### Requirement: Betreten liefert die aktive Karte

Das Acknowledgement eines erfolgreichen `session:enter` SHALL zusätzlich zu `session` und
`participants` das Feld `map` tragen: die Aktive-Karte-Darstellung der Spielsitzung oder
`null`, wenn keine Karte aktiv ist. Es MUST NOT die übrigen Instanzen der Spielsitzung
enthalten — auch nicht für den Spielleiter; der erhält sie über die Instanzliste.

#### Scenario: Spieler betritt einen Raum mit aktiver Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, in der „Taverne" (mit Bild) eingehängt
  und aktiv und „Wald" eingehängt, aber nicht aktiv ist, und ein Spieler-Mitglied mit
  Socket-Verbindung
- **WHEN** der Spieler `session:enter` sendet
- **THEN** enthält das Acknowledgement `map` mit `name: "Taverne"`, `hasImage: true`, der
  `mapId` von „Taverne" und der `instanceId` ihrer Instanz, und nirgends im Acknowledgement
  kommt „Wald" vor

#### Scenario: Betreten ohne aktive Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit eingehängter, aber nicht aktiver
  Karte, und ihr Spielleiter mit Socket-Verbindung
- **WHEN** er `session:enter` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, session, participants, map: null }`

### Requirement: Änderung der Bibliothekskarte erreicht aktive Räume

Ändert der Besitzer Name oder Raster einer Karte (`map-library`, „Karte ändern"), SHALL der
Server jedem Raum, dessen Spielsitzung eine Instanz dieser Karte als aktive Karte hat,
`session:map` mit der aktualisierten Aktive-Karte-Darstellung senden. Räume, in denen die
Karte eingehängt, aber nicht aktiv ist, und Räume ohne diese Karte MUST NOT ein
`session:map` erhalten.

#### Scenario: Rasteränderung erreicht den Raum mit aktiver Karte

- **GIVEN** eine Spielsitzung, deren Karte „Taverne" aktiv ist, in deren Raum ein Spieler
  anwesend ist
- **WHEN** `PATCH /api/maps/:id` vom Besitzer mit `{ "grid": { "type": "hex-flach", "size":
  55, "offsetX": 3, "offsetY": 4 } }` auf „Taverne" eingeht
- **THEN** antwortet der Server mit `200`, und der Spieler erhält `session:map`, dessen `map`
  die `instanceId` der Instanz und `grid: { type: "hex-flach", size: 55, offsetX: 3,
  offsetY: 4 }` trägt

#### Scenario: Änderung an einer eingehängten, nicht aktiven Karte bleibt still

- **GIVEN** eine Spielsitzung, in der „Taverne" aktiv und „Wald" eingehängt, aber nicht aktiv
  ist, und in deren Raum ein Spieler anwesend ist
- **WHEN** `PATCH /api/maps/:id` vom Besitzer mit `{ "name": "Dunkler Wald" }` auf „Wald"
  eingeht
- **THEN** antwortet der Server mit `200`, und der Spieler erhält kein `session:map`

### Requirement: Kartenansicht im Raum

Die Raumansicht SHALL die aktive Karte auf der Kartenansicht aus `map-library` zeigen —
Bild-URL `/api/maps/<mapId>/image` (bzw. keine, wenn `hasImage` falsch ist) und Raster aus
der Aktive-Karte-Darstellung — und ihren Namen nennen. Ohne aktive Karte SHALL sie einen
Hinweis zeigen, dass keine Karte aktiv ist, und keine Kartenansicht erzeugen. Die angezeigte
Karte SHALL ausschließlich dem zuletzt vom Server Gemeldeten folgen (`session:enter`-
Acknowledgement, danach `session:map`; `constitution.md` §9.1), nie der zuletzt geklickten
Schaltfläche. Ein Wechsel der aktiven Karte SHALL die bestehende Kartenansicht auf Bild-URL
und Raster der neuen Karte umstellen; ein Wechsel auf `null` SHALL die Kartenansicht genau
einmal freigeben.

Dem Spielleiter SHALL die Raumansicht zusätzlich eine Kartenverwaltung anbieten: die
eingehängten Karten mit je einer Schaltfläche zum Aktivieren und zum Aushängen, eine Auswahl
der eigenen Bibliothekskarten, die noch nicht eingehängt sind, mit einer Schaltfläche zum
Einhängen, sowie eine Schaltfläche, die die aktive Karte zurücksetzt. Dafür SHALL sie die
Instanzliste und die eigene Kartenliste vom Server abfragen. Einem Spieler MUST NOT sie die
Kartenverwaltung zeigen und MUST NOT für ihn Instanzliste oder Kartenliste abfragen
(`constitution.md` §9.2). Eine Ablehnung des Servers SHALL als Meldung sichtbar sein.

#### Scenario: Raum mit aktiver Karte zeigt die Kartenansicht

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spieler"` und `map` mit `name: "Taverne"`, `mapId: "m1"`, `hasImage: true` und dem Raster
  `quadrat`, 70, 0, 0
- **WHEN** die Raumansicht gerendert wird
- **THEN** erzeugt die Anwendung die Kartenansicht mit der Bild-URL `/api/maps/m1/image` und
  diesem Raster und zeigt den Namen „Taverne" als aktive Karte

#### Scenario: Raum ohne aktive Karte zeigt einen Hinweis

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `map: null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie den Hinweis, dass keine Karte aktiv ist, und hat keine Kartenansicht
  erzeugt

#### Scenario: Kartenwechsel folgt dem Server

- **GIVEN** die Raumansicht eines Spielers zeigt die aktive Karte „Taverne" (`mapId: "m1"`,
  Raster `quadrat`, 70, 0, 0)
- **WHEN** die Anwendung `session:map` mit `map` gleich „Krypta" (`mapId: "m2"`,
  `hasImage: true`, Raster `hex-spitz`, 60, 0, 0) erhält
- **THEN** stellt sie die bestehende Kartenansicht auf die Bild-URL `/api/maps/m2/image` und
  das Raster `hex-spitz`, 60, 0, 0 um und zeigt „Krypta" als aktive Karte

#### Scenario: Zurücksetzen entfernt die Kartenansicht

- **GIVEN** die Raumansicht eines Spielers zeigt die aktive Karte „Taverne"
- **WHEN** die Anwendung `session:map` mit `map: null` erhält
- **THEN** hat sie die Kartenansicht genau einmal freigegeben und zeigt den Hinweis, dass
  keine Karte aktiv ist

#### Scenario: Spieler sieht keine Kartenverwaltung

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spieler"`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie keine Schaltfläche zum Einhängen und hat weder die Instanzliste noch die
  Kartenliste vom Server abgefragt

#### Scenario: Spielleiter sieht die Kartenverwaltung

- **GIVEN** die Anwendung hat den Raum betreten, das Acknowledgement nennt `role:
  "spielleiter"` und `map: null`, die Instanzliste liefert „Taverne", und die eigene
  Kartenliste liefert „Taverne" und „Wald"
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie „Taverne" als eingehängte Karte mit Schaltflächen zum Aktivieren und
  Aushängen, bietet in der Auswahl zum Einhängen „Wald", aber nicht „Taverne" an, und zeigt
  eine Schaltfläche zum Einhängen

#### Scenario: Einhängen sendet die Absicht und lädt die Liste neu

- **GIVEN** die Raumansicht des Spielleiters zeigt die Kartenverwaltung mit „Wald" in der
  Auswahl
- **WHEN** er „Wald" wählt und die Schaltfläche zum Einhängen betätigt, und der Server mit
  `201` antwortet
- **THEN** hat die Anwendung `POST /api/sessions/<sessionId>/maps` mit `{ "mapId": "<id von
  Wald>" }` gesendet und danach die Instanzliste erneut abgefragt

#### Scenario: Aktivieren sendet die Absicht und folgt dem Server

- **GIVEN** die Raumansicht des Spielleiters zeigt „Taverne" als eingehängte Karte, keine
  Karte ist aktiv
- **WHEN** er die Schaltfläche zum Aktivieren von „Taverne" betätigt
- **THEN** sendet die Anwendung `session:activate-map` mit `{ sessionId, instanceId: "<id
  der Instanz>" }`, zeigt weiterhin den Hinweis, dass keine Karte aktiv ist, bis sie
  `session:map` mit „Taverne" erhält, und zeigt danach „Taverne" als aktive Karte

#### Scenario: Aushängen sendet die Absicht und lädt die Liste neu

- **GIVEN** die Raumansicht des Spielleiters zeigt „Taverne" als eingehängte Karte
- **WHEN** er die Schaltfläche zum Aushängen von „Taverne" betätigt, und der Server mit
  `204` antwortet
- **THEN** hat die Anwendung `DELETE /api/sessions/<sessionId>/maps/<id der Instanz>`
  gesendet und danach die Instanzliste erneut abgefragt

#### Scenario: Zurücksetzen sendet die Absicht

- **GIVEN** die Raumansicht des Spielleiters zeigt die aktive Karte „Taverne"
- **WHEN** er die Schaltfläche zum Zurücksetzen der aktiven Karte betätigt
- **THEN** sendet die Anwendung `session:activate-map` mit `{ sessionId, instanceId: null }`
  und zeigt „Taverne" weiterhin als aktive Karte, bis sie `session:map` mit `map: null`
  erhält

#### Scenario: Abgelehntes Aktivieren wird angezeigt

- **GIVEN** die Raumansicht des Spielleiters zeigt „Taverne" als eingehängte Karte
- **WHEN** er die Schaltfläche zum Aktivieren betätigt und das Acknowledgement
  `{ ok: false, message }` lautet
- **THEN** zeigt die Anwendung diese Meldung an, und die aktive Karte ist unverändert
