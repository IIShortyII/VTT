Ergänzung des Drahtformats (gilt zusammen mit dem bestehenden Abschnitt „Drahtformat"):
Das Acknowledgement von `session:enter` trägt zusätzlich `fog` mit der Fog-Darstellung
(`session-fog`) oder `null`. Die Kartenansicht im Raum bezieht das Bild der aktiven Karte
nicht mehr über `/api/maps/<mapId>/image`, sondern über `/api/sessions/<sessionId>/map-image`
(`session-fog`, Requirement „Kartenbild der Spielsitzung") — für Spieler mit dem
Abfrageparameter `fog=<version>`.

## MODIFIED Requirements

### Requirement: Kartenansicht im Raum

Die Raumansicht SHALL die aktive Karte auf der Kartenansicht aus `map-library` zeigen —
Bild-URL `/api/sessions/<sessionId>/map-image` für den Spielleiter bzw.
`/api/sessions/<sessionId>/map-image?fog=<version>` für einen Spieler (`session-fog`,
Requirement „Fog-Ansicht im Raum"; keine URL, wenn `hasImage` falsch ist) und Raster aus
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

- **GIVEN** die Anwendung hat den Raum `s1` betreten, und das Acknowledgement nennt `role:
  "spieler"`, `map` mit `name: "Taverne"`, `mapId: "m1"`, `hasImage: true` und dem Raster
  `quadrat`, 70, 0, 0 sowie `fog` mit `version: 0` und `revealed` als leerer Liste
- **WHEN** die Raumansicht gerendert wird
- **THEN** erzeugt die Anwendung die Kartenansicht mit der Bild-URL
  `/api/sessions/s1/map-image?fog=0` und diesem Raster und zeigt den Namen „Taverne" als
  aktive Karte

#### Scenario: Raum ohne aktive Karte zeigt einen Hinweis

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `map: null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie den Hinweis, dass keine Karte aktiv ist, und hat keine Kartenansicht
  erzeugt

#### Scenario: Kartenwechsel folgt dem Server

- **GIVEN** die Raumansicht eines Spielers im Raum `s1` zeigt die aktive Karte „Taverne"
  (`mapId: "m1"`, Raster `quadrat`, 70, 0, 0) mit Fog der Version 0
- **WHEN** die Anwendung `session:map` mit `map` gleich „Krypta" (`mapId: "m2"`,
  `hasImage: true`, Raster `hex-spitz`, 60, 0, 0) und danach `session:fog` mit `version: 0`
  für die Instanz von „Krypta" erhält
- **THEN** stellt sie die bestehende Kartenansicht auf die Bild-URL
  `/api/sessions/s1/map-image?fog=0` und das Raster `hex-spitz`, 60, 0, 0 um und zeigt
  „Krypta" als aktive Karte

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
