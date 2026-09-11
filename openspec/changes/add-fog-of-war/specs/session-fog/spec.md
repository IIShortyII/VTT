# session-fog Specification

## Purpose

Fog of War auf der aktiven Karte: eine Karteninstanz startet vollständig verdeckt, der
Spielleiter deckt Zellen auf und verdeckt sie wieder — einzeln, als gespeicherten Bereich
oder die ganze Karte. Der Spielleiter sieht immer die ganze Karte; ein Spieler erhält vom
Server nur, was aufgedeckt ist: das Kartenbild verlässt den Server für ihn maskiert, die
Bereiche des Spielleiters gar nicht (`constitution.md` §9.2). Der aufgedeckte Zustand hängt
an der Karteninstanz und übersteht Kartenwechsel, Reload und Serverneustart.

## Begriffe

- **Zelle**: `{ col, row }` als ganze Zahlen im Raster der Karte (`map-library`,
  „Rastergeometrie"), Betrag je Koordinate höchstens 10000. Negative Werte und Zellen
  außerhalb des Bilds sind zulässig — der Server prüft keinen Kartenrand.
- **Aufgedeckte Zellen**: die Menge der Zellen einer Karteninstanz, die aufgedeckt sind
  (Modell `FogCell`, eine Zeile je Zelle, je Instanz keine Zelle doppelt). Jede Zelle, die
  nicht darin liegt, ist verdeckt. Eine neue Karteninstanz hat keine aufgedeckten Zellen.
  Diese Menge ist die einzige Wahrheit über „aufgedeckt" — Bereiche sind Abkürzungen darauf.
- **Bereich**: eine benannte, gespeicherte Zellauswahl einer Karteninstanz (Modell
  `FogArea` mit Zellen in `FogAreaCell`): Name (getrimmter Text, 1 bis 40 Zeichen, keine
  Steuerzeichen, nicht eindeutig) und 1 bis 10000 verschiedene Zellen. Einen Bereich
  aufzudecken oder zu verdecken heißt, seine Zellen aufzudecken oder zu verdecken. Ein
  Bereich **gilt als aufgedeckt**, wenn jede seiner Zellen aufgedeckt ist — abgeleitet aus
  den aufgedeckten Zellen, nicht gespeichert. Das Löschen eines Bereichs ändert die
  aufgedeckten Zellen nicht.
- **Ziel** einer Fog-Aktion: `{ kind: "zellen", cells }` mit 1 bis 10000 verschiedenen
  Zellen; `{ kind: "bereich", areaId }` mit der `id` eines Bereichs derselben
  Karteninstanz; oder `{ kind: "alle" }`. Bei `alle` und Aufdecken sind die betroffenen
  Zellen der Zellbereich `cellRange` (`map-library`, „Rastergeometrie") über Bildbreite ×
  Bildhöhe der Karte, bei einer Karte ohne Bild über 1000 × 1000; bei `alle` und Verdecken
  jede aufgedeckte Zelle.
- **Fog-Version**: ganze Zahl je Karteninstanz, beginnt bei 0 und wächst um 1 bei jeder
  Aktion, die die aufgedeckten Zellen ändert (nicht beim Anlegen oder Löschen eines
  Bereichs). Sie kennzeichnet den Stand des maskierten Bilds.
- **Bereichsdarstellung**: `{ id, name, cellCount, revealed }` — `cellCount` die Anzahl der
  Zellen des Bereichs, `revealed`, ob er als aufgedeckt gilt. Die Zellen selbst verlassen
  den Server nicht.
- **Fog-Darstellung**: `{ instanceId, version, revealed, areas }` oder `null` ohne aktive
  Karte — `revealed` die aufgedeckten Zellen als Liste (Reihenfolge nicht festgelegt),
  `areas` die Bereichsdarstellungen in Anlegereihenfolge für einen Empfänger mit Rolle
  `spielleiter`, für jeden anderen Empfänger `null` (Bereiche sind Vorbereitung des
  Spielleiters, `constitution.md` §9.2). Sie erreicht jeden Teilnehmer im Raum **je
  Verbindung gefiltert**.
- **Maskiertes Bild**: das Kartenbild der aktiven Karte in Bildbreite × Bildhöhe des
  Originals, in dem jeder Bildpunkt innerhalb einer aufgedeckten Zelle (Zellecken aus
  `cellCorners`, `map-library` „Rastergeometrie") die Farbe des Originals trägt und jeder
  andere Bildpunkt vollständig transparent ist (Alpha 0). Ausgeliefert als WebP mit
  Alphakanal (`image/webp`). Die Bildabmessungen sind damit für Spieler erkennbar — das ist
  bewusst akzeptiert; das Raster ist ohnehin Teil der Aktive-Karte-Darstellung.

Drahtformat (Client → Server, je mit Acknowledgement `{ ok: true, fog }` mit der
Fog-Darstellung für den Absender oder `{ ok: false, message }`):
`session:fog-set` `{ sessionId, revealed, target }` mit `revealed` als Boolean und `target`
als Ziel; `session:fog-area-create` `{ sessionId, name, cells }`; `session:fog-area-delete`
`{ sessionId, areaId }`. Server → Client: `session:fog` `{ sessionId, fog }` mit der für
diesen Empfänger gefilterten Fog-Darstellung — je Verbindung gesendet, nicht als ein Paket
an den Raum. Das Acknowledgement von `session:enter` (`game-session`) trägt zusätzlich `fog`
mit der für den Betretenden gefilterten Fog-Darstellung. REST: `GET
/api/sessions/:id/map-image` liefert das Kartenbild der aktiven Karte — dem Spielleiter das
Original, einem Spieler das maskierte Bild. Fehlerantworten tragen
`{ statusCode, error, message }` wie die übrigen Routen.

## ADDED Requirements

### Requirement: Aufdecken und Verdecken durch den Spielleiter

Der Server SHALL über `session:fog-set` Zellen der aktiven Karteninstanz aufdecken
(`revealed: true`) oder verdecken (`revealed: false`) — ausschließlich für ein Mitglied mit
Rolle `spielleiter`, geprüft pro Aktion (`constitution.md` §9.3). Die Payload SHALL an der
Grenze validiert werden; eine ungültige Payload SHALL mit `{ ok: false, message: "Ungültige
Anfrage." }` beantwortet werden. Ohne aktive Karte SHALL die Aktion mit `{ ok: false,
message: "Keine Karte aktiv." }` abgelehnt werden. Ein Ziel `bereich`, dessen `areaId` zu
keinem Bereich der aktiven Karteninstanz gehört, SHALL mit `{ ok: false, message: "Bereich
nicht gefunden." }` abgelehnt werden. Aufdecken SHALL die Zielzellen zu den aufgedeckten
Zellen hinzufügen (bereits aufgedeckte Zellen bleiben einfach vorhanden — keine doppelte
Zeile), Verdecken SHALL sie daraus entfernen (nicht aufgedeckte Zellen werden ignoriert);
jede solche Aktion SHALL die Fog-Version um 1 erhöhen, auch wenn sich die Menge nicht
geändert hat. Nach jeder erfolgreichen Aktion SHALL der Server jeder Verbindung im Raum
`session:fog` mit der für sie gefilterten Fog-Darstellung senden und dem Absender `{ ok:
true, fog }` mit der ungefilterten Darstellung antworten. Eine abgelehnte Aktion MUST NOT
etwas verändern und MUST NOT ein `session:fog` auslösen. Die aufgedeckten Zellen SHALL an
der Karteninstanz gespeichert bleiben — ein Kartenwechsel weg und zurück zeigt sie wieder,
ein Serverneustart verliert sie nicht; Aushängen der Instanz SHALL sie mit löschen.

#### Scenario: Karte startet vollständig verdeckt

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, deren Spielleiter soeben eine Karte
  eingehängt und aktiviert hat
- **WHEN** der Spielleiter `session:enter` sendet
- **THEN** trägt das Acknowledgement `fog` mit der `instanceId` dieser Instanz, `version: 0`,
  `revealed` als leerer Liste und `areas` als leerer Liste

#### Scenario: Spielleiter deckt Zellen auf

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen, deren Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit
  den Zellen (0,0), (1,0) und (0,1) sendet
- **THEN** lautet das Acknowledgement `{ ok: true, fog }` mit `revealed` gleich genau diesen
  drei Zellen, `version: 1` und `areas` als leerer Liste; die Anzahl der `FogCell`-Zeilen
  dieser Instanz in der Datenbank ist `3`; der Spielleiter erhält `session:fog` mit derselben
  Darstellung, und `sam` erhält `session:fog` mit denselben drei Zellen, `version: 1` und
  `areas: null`

#### Scenario: Erneutes Aufdecken erzeugt keine doppelten Zellen

- **GIVEN** eine Spielsitzung mit aktiver Karte, auf der die Zellen (0,0) und (1,0)
  aufgedeckt sind, und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit (1,0) und
  (2,0) sendet
- **THEN** enthält `fog.revealed` im Acknowledgement genau die Zellen (0,0), (1,0) und (2,0),
  die Anzahl der `FogCell`-Zeilen dieser Instanz ist `3`, und `fog.version` ist um 1 höher
  als zuvor

#### Scenario: Spielleiter verdeckt Zellen wieder

- **GIVEN** eine Spielsitzung mit aktiver Karte, auf der (0,0), (1,0) und (0,1) aufgedeckt
  sind, ihr Spielleiter und ein Spieler-Mitglied `sam` im Raum
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: false` und dem Ziel `zellen` mit
  (1,0) und (5,5) sendet
- **THEN** enthält `fog.revealed` im Acknowledgement genau (0,0) und (0,1), die Anzahl der
  `FogCell`-Zeilen dieser Instanz ist `2`, und `sam` erhält `session:fog` mit genau diesen
  zwei Zellen

#### Scenario: Alles verdecken

- **GIVEN** eine Spielsitzung mit aktiver Karte, auf der vier Zellen aufgedeckt sind, und
  ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: false` und dem Ziel `alle` sendet
- **THEN** ist `fog.revealed` im Acknowledgement die leere Liste, und die Anzahl der
  `FogCell`-Zeilen dieser Instanz ist `0`

#### Scenario: Alles aufdecken bei einer Karte mit Bild

- **GIVEN** eine Spielsitzung mit aktiver Karte, deren Bild 140 × 140 Bildpunkte groß ist,
  mit Raster `quadrat`, 70, 0, 0 und ohne aufgedeckte Zellen, und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: true` und dem Ziel `alle` sendet
- **THEN** enthält `fog.revealed` im Acknowledgement genau die Zellen des Zellbereichs
  `cellRange` dieses Rasters über 140 × 140 — die 9 Zellen mit `col` und `row` je 0 bis 2 —
  und die Anzahl der `FogCell`-Zeilen dieser Instanz ist `9`

#### Scenario: Alles aufdecken bei einer Karte ohne Bild

- **GIVEN** eine Spielsitzung mit aktiver Karte ohne Bild, Raster `quadrat`, 70, 0, 0, und
  ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: true` und dem Ziel `alle` sendet
- **THEN** enthält `fog.revealed` im Acknowledgement genau die Zellen des Zellbereichs
  `cellRange` dieses Rasters über 1000 × 1000 — die 225 Zellen mit `col` und `row` je 0 bis
  14

#### Scenario: Bereich aufdecken

- **GIVEN** eine Spielsitzung mit aktiver Karte ohne aufgedeckte Zellen und einem Bereich
  „Raum 1" mit den Zellen (0,0) und (1,0), ihr Spielleiter und ein Spieler-Mitglied `sam` im
  Raum
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: true` und dem Ziel `bereich` mit
  der `id` von „Raum 1" sendet
- **THEN** enthält `fog.revealed` im Acknowledgement genau (0,0) und (1,0), der Eintrag
  „Raum 1" in `fog.areas` hat `revealed: true`, und `sam` erhält `session:fog` mit genau
  diesen zwei Zellen und `areas: null`

#### Scenario: Bereich verdecken

- **GIVEN** eine Spielsitzung mit aktiver Karte, auf der (0,0), (1,0) und (5,5) aufgedeckt
  sind, mit einem Bereich „Raum 1" mit den Zellen (0,0) und (1,0), und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: false` und dem Ziel `bereich` mit der `id`
  von „Raum 1" sendet
- **THEN** enthält `fog.revealed` im Acknowledgement genau (5,5), und der Eintrag „Raum 1"
  in `fog.areas` hat `revealed: false`

#### Scenario: Bereich einer anderen Instanz ist nicht erreichbar

- **GIVEN** eine Spielsitzung mit zwei eingehängten Karten „Taverne" (aktiv) und „Keller",
  ein Bereich „Lager" gehört zur Instanz von „Keller", und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: true` und dem Ziel `bereich` mit der `id` von
  „Lager" sendet, und danach dasselbe mit der `areaId` `unbekannt`
- **THEN** lauten beide Acknowledgements `{ ok: false, message: "Bereich nicht gefunden." }`,
  und die Anzahl der `FogCell`-Zeilen beider Instanzen ist unverändert

#### Scenario: Spieler darf nicht aufdecken

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne aufgedeckte
  Zellen, ihr Spielleiter und ein Spieler-Mitglied `sam` im Raum
- **WHEN** `sam` `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit (0,0)
  sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Dafür fehlt die
  Berechtigung." }`, die Anzahl der `FogCell`-Zeilen dieser Instanz ist `0`, und der
  Spielleiter erhält kein `session:fog`

#### Scenario: Aufdecken ohne aktive Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit eingehängter, aber nicht aktiver
  Karte und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit (0,0) sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Keine Karte aktiv." }`, und
  die Anzahl der `FogCell`-Zeilen in der Datenbank ist `0`

#### Scenario: Ungültige Payload beim Aufdecken

- **GIVEN** eine Spielsitzung mit aktiver Karte und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` je einmal mit dem Ziel `zellen` und leerer Zellliste, mit
  einer Zelle mit `col` `1.5`, mit derselben Zelle zweimal in der Liste, ohne `target` und
  mit `revealed` als Zeichenkette `"ja"` sendet
- **THEN** lautet jedes Acknowledgement `{ ok: false, message: "Ungültige Anfrage." }`, und
  die Anzahl der `FogCell`-Zeilen dieser Instanz ist `0`

#### Scenario: Aushängen löscht aufgedeckte Zellen und Bereiche

- **GIVEN** eine Spielsitzung mit einer eingehängten Karte, deren Instanz zwei aufgedeckte
  Zellen und einen Bereich mit zwei Zellen hat
- **WHEN** der Spielleiter `DELETE /api/sessions/:id/maps/:instanceId` für diese Instanz
  sendet
- **THEN** antwortet der Server mit `204`, und die Anzahl der `FogCell`-, `FogArea`- und
  `FogAreaCell`-Zeilen dieser Instanz in der Datenbank ist je `0`

#### Scenario: Aufgedeckte Zellen überstehen einen Serverneustart

- **GIVEN** eine Spielsitzung mit aktiver Karte, auf der (2,3) aufgedeckt wurde, über eine
  erste App-Instanz, die danach beendet wurde
- **WHEN** eine zweite App-Instanz gegen dieselbe Datenbank startet und der Spielleiter dort
  `session:enter` sendet
- **THEN** trägt das Acknowledgement `fog` mit `revealed` gleich genau (2,3)

### Requirement: Bereiche verwalten

Der Server SHALL über `session:fog-area-create` einen Bereich der aktiven Karteninstanz
anlegen und über `session:fog-area-delete` einen Bereich der aktiven Karteninstanz löschen —
ausschließlich für ein Mitglied mit Rolle `spielleiter`, geprüft pro Aktion. Die Payload
SHALL an der Grenze validiert werden (Name und Zellen nach „Begriffe"); eine ungültige
Payload SHALL mit `{ ok: false, message: "Ungültige Anfrage." }` beantwortet werden. Ohne
aktive Karte SHALL beides mit `{ ok: false, message: "Keine Karte aktiv." }` abgelehnt
werden; ein Löschen mit einer `areaId`, die zu keinem Bereich der aktiven Karteninstanz
gehört, mit `{ ok: false, message: "Bereich nicht gefunden." }`. Anlegen MUST NOT die
aufgedeckten Zellen ändern; Löschen ebenso wenig. Beides MUST NOT die Fog-Version erhöhen.
Nach jeder erfolgreichen Aktion SHALL der Server jeder Verbindung im Raum `session:fog` mit
der für sie gefilterten Fog-Darstellung senden und dem Absender `{ ok: true, fog }`
antworten. `revealed` einer Bereichsdarstellung SHALL genau dann `true` sein, wenn jede
Zelle des Bereichs aufgedeckt ist.

#### Scenario: Spielleiter legt einen Bereich an

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne Bereiche, ihr
  Spielleiter und ein Spieler-Mitglied `sam` im Raum
- **WHEN** der Spielleiter `session:fog-area-create` mit `name: "Raum 1"` und den Zellen
  (0,0) und (1,0) sendet
- **THEN** lautet das Acknowledgement `{ ok: true, fog }` mit `fog.areas` gleich genau einem
  Eintrag mit einer `id`, `name: "Raum 1"`, `cellCount: 2` und `revealed: false`,
  `fog.revealed` bleibt die leere Liste und `fog.version` bleibt `0`; in der Datenbank
  existiert eine `FogArea`-Zeile dieser Instanz mit `name` `Raum 1` und genau zwei
  `FogAreaCell`-Zeilen dazu; `sam` erhält `session:fog` mit `areas: null`

#### Scenario: Bereich gilt als aufgedeckt, wenn alle seine Zellen aufgedeckt sind

- **GIVEN** eine Spielsitzung mit aktiver Karte, einem Bereich „Raum 1" mit den Zellen
  (0,0) und (1,0) und ohne aufgedeckte Zellen, und ihr Spielleiter im Raum
- **WHEN** er `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit (0,0) sendet,
  und danach dasselbe mit (1,0) und (5,5)
- **THEN** hat der Eintrag „Raum 1" in `fog.areas` im ersten Acknowledgement `revealed:
  false` und im zweiten `revealed: true`

#### Scenario: Spielleiter löscht einen Bereich

- **GIVEN** eine Spielsitzung mit aktiver Karte, einem Bereich „Raum 1" mit den Zellen (0,0)
  und (1,0), auf der (0,0) aufgedeckt ist, und ihr Spielleiter im Raum
- **WHEN** er `session:fog-area-delete` mit der `id` von „Raum 1" sendet
- **THEN** ist `fog.areas` im Acknowledgement die leere Liste, `fog.revealed` enthält
  weiterhin genau (0,0), und die Anzahl der `FogArea`- und `FogAreaCell`-Zeilen dieser
  Instanz in der Datenbank ist je `0`

#### Scenario: Bereich einer anderen Instanz kann nicht gelöscht werden

- **GIVEN** eine Spielsitzung mit zwei eingehängten Karten „Taverne" (aktiv) und „Keller",
  ein Bereich „Lager" gehört zur Instanz von „Keller", und ihr Spielleiter im Raum
- **WHEN** er `session:fog-area-delete` mit der `id` von „Lager" sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Bereich nicht gefunden." }`,
  und „Lager" existiert weiterhin in der Datenbank

#### Scenario: Spieler darf keinen Bereich anlegen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte und ein
  Spieler-Mitglied `sam` im Raum
- **WHEN** `sam` `session:fog-area-create` mit `name: "Raum 1"` und der Zelle (0,0) sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Dafür fehlt die
  Berechtigung." }`, und die Anzahl der `FogArea`-Zeilen in der Datenbank ist `0`

#### Scenario: Ungültiger Bereich

- **GIVEN** eine Spielsitzung mit aktiver Karte und ihr Spielleiter im Raum
- **WHEN** er `session:fog-area-create` je einmal mit leerem Namen und der Zelle (0,0), mit
  `name: "Raum 1"` und leerer Zellliste und mit `name: "Raum 1"` und der Zelle (0,0) zweimal
  in der Liste sendet
- **THEN** lautet jedes Acknowledgement `{ ok: false, message: "Ungültige Anfrage." }`, und
  die Anzahl der `FogArea`-Zeilen in der Datenbank ist `0`

### Requirement: Fog beim Betreten und Kartenwechsel

Das Acknowledgement von `session:enter` SHALL das Feld `fog` mit der für den Betretenden
gefilterten Fog-Darstellung der aktiven Karteninstanz tragen — `null` ohne aktive Karte.
Nach jedem `session:map` (Aktivieren, Zurücksetzen, Aushängen der aktiven Instanz —
`session-map`) SHALL der Server jeder Verbindung im Raum `session:fog` mit der für sie
gefilterten Fog-Darstellung der nun aktiven Instanz senden, bei „keine Karte" mit `fog:
null` — und zwar nach `session:map` und vor `session:tokens` (`session-token`).

#### Scenario: Betreten liefert den gefilterten Fog-Zustand

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der (0,0)
  aufgedeckt ist und ein Bereich „Raum 1" existiert, ihr Spielleiter und ein
  Spieler-Mitglied `sam`
- **WHEN** beide `session:enter` senden
- **THEN** trägt das Acknowledgement des Spielleiters `fog` mit `revealed` gleich genau (0,0)
  und `areas` mit genau dem Eintrag „Raum 1", und das Acknowledgement von `sam` `fog` mit
  `revealed` gleich genau (0,0), derselben `instanceId` und `version` und `areas: null`

#### Scenario: Betreten ohne aktive Karte liefert keinen Fog

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` ohne aktive Karte und ein
  Spieler-Mitglied
- **WHEN** der Spieler `session:enter` sendet
- **THEN** trägt das Acknowledgement `fog: null`

#### Scenario: Kartenwechsel liefert den Fog der neuen Karte in der richtigen Reihenfolge

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit zwei eingehängten Karten „Taverne"
  (aktiv, (0,0) aufgedeckt) und „Keller" ((3,3) aufgedeckt, als „Keller" aktiv war), deren
  Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:activate-map` auf „Keller" sendet und danach erneut auf
  „Taverne"
- **THEN** erhält `sam` nach dem ersten Wechsel `session:fog` mit `revealed` gleich genau
  (3,3) und der `instanceId` von „Keller", nach dem zweiten `session:fog` mit `revealed`
  gleich genau (0,0) und der `instanceId` von „Taverne", und bei jedem Wechsel kommt
  `session:map` vor `session:fog` und `session:fog` vor `session:tokens` an

#### Scenario: Zurücksetzen liefert keinen Fog

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der (0,0)
  aufgedeckt ist, deren Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten
  haben
- **WHEN** der Spielleiter `session:activate-map` mit `instanceId` `null` sendet
- **THEN** erhält `sam` `session:fog` mit `fog: null`, und die `FogCell`-Zeile (0,0) dieser
  Instanz existiert in der Datenbank weiterhin

### Requirement: Kartenbild der Spielsitzung

Das System SHALL über `GET /api/sessions/:id/map-image` das Bild der aktiven Karte einer
Spielsitzung liefern. Ohne gültige Anmelde-Sitzung SHALL die Route mit `401` antworten. Mit
gültiger Anmelde-Sitzung SHALL sie pro Anfrage prüfen, dass der Anfragende Mitglied dieser
Spielsitzung ist; ein Nicht-Mitglied und eine unbekannte Spielsitzung SHALL mit identischem
Statuscode (`404`) und identischer Meldung beantwortet werden (`constitution.md` §9.2).
Ohne aktive Karte oder bei einer aktiven Karte ohne Bild SHALL die Route mit `404`
antworten. Einem Mitglied mit Rolle `spielleiter` SHALL sie das Originalbild liefern:
`200`, `Content-Type` gleich dem beim Upload angegebenen Typ, Body gleich der abgelegten
Datei. Einem Mitglied mit Rolle `spieler` SHALL sie das maskierte Bild liefern: `200`,
`Content-Type: image/webp`, Body ein WebP-Bild in Bildbreite × Bildhöhe des Originals nach
„Begriffe". Jede Antwort mit `200` SHALL `Cache-Control: private, no-store` tragen. Das
maskierte Bild SHALL bei jedem Abruf dem aktuellen Stand der aufgedeckten Zellen
entsprechen — ein Aufdecken wirkt auf den nächsten Abruf. Die Rolle SHALL pro Anfrage aus
der Mitgliedschaft gelesen werden (§9.3). Das Originalbild MUST NOT über diese Route ein
Mitglied mit Rolle `spieler` erreichen.

#### Scenario: Kartenbild ohne Cookie

- **GIVEN** eine Spielsitzung mit aktiver Karte mit Bild und kein Sitzungscookie
- **WHEN** `GET /api/sessions/:id/map-image` eingeht
- **THEN** antwortet der Server mit `401`

#### Scenario: Nicht-Mitglied und unbekannte Spielsitzung sind nicht unterscheidbar

- **GIVEN** eine Spielsitzung mit aktiver Karte mit Bild, ein angemeldeter Nutzer, der nicht
  Mitglied ist, und es gibt keine Spielsitzung mit der `id` `unbekannt`
- **WHEN** je ein `GET /api/sessions/:id/map-image` mit seinem Cookie auf die Spielsitzung
  und auf `unbekannt` eingeht
- **THEN** antworten beide mit `404`, und Statuscode und `message` beider Antworten sind
  identisch

#### Scenario: Spielleiter erhält das Originalbild

- **GIVEN** ein Spielleiter, dessen Spielsitzung die Karte „Taverne" mit einem hochgeladenen
  PNG aktiv hat
- **WHEN** `GET /api/sessions/:id/map-image` mit seinem Cookie eingeht
- **THEN** antwortet der Server mit `200`, `Content-Type: image/png`, `Cache-Control:
  private, no-store` und einem Body, der byteweise dem hochgeladenen Bild gleicht

#### Scenario: Spieler erhält das maskierte Bild

- **GIVEN** eine Spielsitzung, deren aktive Karte „Taverne" ein einfarbig rotes,
  deckendes PNG von 140 × 140 Bildpunkten und das Raster `quadrat`, 70, 0, 0 hat, auf der
  genau die Zelle (0,0) aufgedeckt ist, und ein Spieler-Mitglied `sam`
- **WHEN** `GET /api/sessions/:id/map-image` mit dem Cookie von `sam` eingeht
- **THEN** antwortet der Server mit `200`, `Content-Type: image/webp` und `Cache-Control:
  private, no-store`; der Body ist ein WebP-Bild von 140 × 140 Bildpunkten, dessen
  Bildpunkt (35,35) Alpha `255` und eine rot dominierte Farbe hat (Rot über 200, Grün und
  Blau unter 60) und dessen Bildpunkte (105,105) und (105,35) Alpha `0` haben

#### Scenario: Vollständig verdeckte Karte liefert ein leeres Bild

- **GIVEN** eine Spielsitzung, deren aktive Karte ein deckendes PNG von 140 × 140
  Bildpunkten und das Raster `quadrat`, 70, 0, 0 hat, ohne aufgedeckte Zellen, und ein
  Spieler-Mitglied `sam`
- **WHEN** `GET /api/sessions/:id/map-image` mit dem Cookie von `sam` eingeht
- **THEN** antwortet der Server mit `200` und `Content-Type: image/webp`; der Body ist ein
  WebP-Bild von 140 × 140 Bildpunkten, dessen Bildpunkte (35,35) und (105,105) Alpha `0`
  haben

#### Scenario: Aufdecken wirkt auf den nächsten Abruf

- **GIVEN** eine Spielsitzung, deren aktive Karte ein deckendes PNG von 140 × 140
  Bildpunkten und das Raster `quadrat`, 70, 0, 0 hat, auf der (0,0) aufgedeckt ist, ein
  Spieler-Mitglied `sam`, das das maskierte Bild bereits einmal abgerufen hat, und ihr
  Spielleiter im Raum
- **WHEN** der Spielleiter `session:fog-set` mit `revealed: true` und dem Ziel `zellen` mit
  (1,1) sendet und `sam` danach `GET /api/sessions/:id/map-image` erneut abruft
- **THEN** hat der Bildpunkt (105,105) der zweiten Antwort Alpha `255`, und der Bildpunkt
  (105,35) weiterhin Alpha `0`

#### Scenario: Kartenbild ohne aktive Karte oder ohne Bild

- **GIVEN** eine Spielsitzung ohne aktive Karte und eine zweite Spielsitzung, deren aktive
  Karte kein Bild hat, jeweils mit ihrem Spielleiter
- **WHEN** je ein `GET /api/sessions/:id/map-image` mit dem Cookie des jeweiligen
  Spielleiters eingeht
- **THEN** antwortet der Server beide Male mit `404`

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
speichern`, eine Anzeige `Auswahl: <n> Zellen` und eine Schaltfläche `Auswahl leeren`; sowie
je Bereich ein Kontrollkästchen `<Name> aufgedeckt`, dessen Zustand `revealed` der
Bereichsdarstellung folgt, und eine Schaltfläche `<Name> löschen`. Die Canvas-Fassade SHALL
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
