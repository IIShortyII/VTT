# map-library Specification

## Purpose

Gibt jedem Nutzer eine private Kartenbibliothek: Kartenbilder hochladen, ein Raster
(Quadrat oder Hex) darüber einstellen und das Ergebnis auf einem Canvas mit Schwenken und
Zoomen prüfen. Legt die Rastergeometrie fest, auf der Einrasten, Fog of War und Messen später
aufbauen, und die Regel, dass ein Kartenbild den Server nur über eine geprüfte Route verlässt.

## Begriffe

- **Karte**: ein Eintrag der Bibliothek (Modell `GameMap`): Name, Besitzer, optional ein
  Bild, und ein Raster. Nicht zu verwechseln mit der Spielsitzung; in Spielsitzungen wird eine
  Karte erst mit #50 eingehängt.
- **Besitzer**: der Nutzer, der die Karte angelegt hat. Nur er sieht und ändert sie.
- **Bild**: eine Datei im Format PNG, JPEG oder WebP, höchstens 20 MB (20 · 1024 · 1024
  Bytes), abgelegt im Upload-Verzeichnis des Servers unter einem vom Server vergebenen
  Dateinamen. Eine Karte hat höchstens ein Bild.
- **Raster**: `{ type, size, offsetX, offsetY }`. `type` ist `quadrat`, `hex-spitz`
  (Sechseck mit Spitze oben) oder `hex-flach` (Sechseck mit flacher Kante oben). `size` ist
  der Abstand zweier paralleler Kanten einer Zelle in Bildpixeln — bei `quadrat` die
  Kantenlänge, bei `hex-spitz` die Breite, bei `hex-flach` die Höhe einer Zelle — ganzzahlig,
  8 bis 2000. `offsetX`/`offsetY` verschieben den Rasterursprung in Bildpixeln, ganzzahlig,
  −2000 bis 2000. Standard: `quadrat`, 70, 0, 0.
- **Bildkoordinaten**: Pixel des Bildes, Ursprung oben links, x nach rechts, y nach unten.
- **Zelle**: `{ col, row }` mit ganzen Zahlen (auch negativ). Bei `quadrat` liegt Zelle
  `(0, 0)` mit ihrer linken oberen Ecke auf dem Rasterursprung. Bei `hex-spitz` liegen die
  Zellen in Zeilen; jede ungerade Zeile ist um eine halbe Zellbreite nach rechts versetzt
  („odd-r"). Bei `hex-flach` liegen die Zellen in Spalten; jede ungerade Spalte ist um eine
  halbe Zellhöhe nach unten versetzt („odd-q"). Zelle `(0, 0)` berührt in beiden Hex-Fällen
  mit ihrem linken und oberen Rand den Rasterursprung.
- **Sicht**: `{ x, y, scale }` — wie das Bild auf dem Canvas liegt: ein Bildpunkt `p`
  erscheint auf dem Canvas bei `p · scale + (x, y)`. Die Sicht ist lokal je Betrachter.

Drahtformat: REST unter `/api/maps`. Eine Karte wird nach außen als
`{ id, name, hasImage, grid }` dargestellt. Fehlerantworten tragen `{ statusCode, error,
message, field? }` wie die übrigen Routen. Numerische Aussagen der Geometrie gelten auf zwei
Nachkommastellen gerundet.

## Requirements

### Requirement: Kartenrouten verlangen eine Anmeldung

Jede Route unter `/api/maps` SHALL ohne gültige Anmelde-Sitzung mit `401` antworten und
MUST NOT in diesem Fall eine Karte anlegen, ändern, löschen oder ein Bild ausliefern.

#### Scenario: Ohne Cookie wird die Kartenliste verweigert

- **GIVEN** keine Anmelde-Sitzung
- **WHEN** `GET /api/maps` ohne Cookie eingeht
- **THEN** antwortet der Server mit `401`

### Requirement: Karte anlegen

Das System SHALL einem angemeldeten Nutzer über `POST /api/maps` erlauben, eine Karte mit
einem Namen (1 bis 60 Zeichen nach Trimmen) anzulegen. Der Anfragende SHALL Besitzer werden.
Die Karte SHALL ohne Bild und mit dem Standardraster beginnen. Ein ungültiger Name SHALL mit
`400` und `field` gleich `name` beantwortet werden, ohne dass eine Karte entsteht.

#### Scenario: Anlegen mit gültigem Namen

- **GIVEN** ein angemeldeter Nutzer
- **WHEN** `POST /api/maps` mit `{ "name": "Taverne" }` eingeht
- **THEN** antwortet der Server mit `201` und `{ id, name: "Taverne", hasImage: false,
  grid: { type: "quadrat", size: 70, offsetX: 0, offsetY: 0 } }`, und in der Datenbank
  existiert genau eine Karte mit diesem Namen, deren Besitzer dieser Nutzer ist

#### Scenario: Anlegen mit ungültigem Namen

- **GIVEN** ein angemeldeter Nutzer
- **WHEN** `POST /api/maps` mit einem Namen aus nur Leerzeichen eingeht
- **THEN** antwortet der Server mit `400` und `field` gleich `name`, und in der Datenbank
  entsteht keine Karte

### Requirement: Meine Karten

Das System SHALL einem angemeldeten Nutzer über `GET /api/maps` alle Karten liefern, deren
Besitzer er ist, in der Reihenfolge ihres Anlegens. Karten anderer Nutzer MUST NOT enthalten
sein.

#### Scenario: Liste enthält nur eigene Karten

- **GIVEN** Nutzer A besitzt die Karten „Taverne" und „Wald", Nutzer B besitzt die Karte
  „Krypta"
- **WHEN** `GET /api/maps` mit dem Cookie von A eingeht
- **THEN** antwortet der Server mit `200` und genau zwei Einträgen, „Taverne" vor „Wald",
  jeweils mit `id`, `hasImage` und `grid`

### Requirement: Karte ändern

Das System SHALL dem Besitzer über `PATCH /api/maps/:id` erlauben, Name und/oder Raster einer
Karte zu ändern. Ein mitgesendetes Raster SHALL vollständig sein (`type`, `size`, `offsetX`,
`offsetY`) und die Grenzen aus „Begriffe" einhalten; ein ungültiges Raster SHALL mit `400`
und `field` gleich `grid` beantwortet werden, ein ungültiger Name mit `400` und `field` gleich
`name`, jeweils ohne Änderung in der Datenbank. Die Antwort SHALL die geänderte Karte
enthalten.

Eine Karte, deren Besitzer nicht der Anfragende ist, und eine Karte, die nicht existiert,
SHALL mit identischem Statuscode (`404`) und identischer Meldung beantwortet werden
(`constitution.md` §9.2); in beiden Fällen MUST NOT sich etwas ändern.

#### Scenario: Raster ändern

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit dem Standardraster
- **WHEN** `PATCH /api/maps/:id` mit `{ "grid": { "type": "hex-spitz", "size": 60,
  "offsetX": 12, "offsetY": -8 } }` eingeht
- **THEN** antwortet der Server mit `200` und der Karte mit genau diesem Raster, und die
  Datenbankzeile trägt Typ `hex-spitz`, Zellgröße 60 und Versatz 12/−8

#### Scenario: Ungültige Zellgröße wird abgelehnt

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit dem Standardraster
- **WHEN** `PATCH /api/maps/:id` mit einem Raster mit `size` gleich 4 eingeht
- **THEN** antwortet der Server mit `400` und `field` gleich `grid`, und die Datenbankzeile
  trägt weiterhin das Standardraster

#### Scenario: Fremde und unbekannte Karte sind nicht unterscheidbar

- **GIVEN** Nutzer B besitzt eine Karte, Nutzer A ist angemeldet und besitzt sie nicht, und
  es gibt keine Karte mit der `id` `unbekannt`
- **WHEN** je ein `PATCH` mit `{ "name": "Gekapert" }` von A auf die Karte von B und auf
  `unbekannt` eingeht
- **THEN** antworten beide mit `404`, Statuscode und `message` beider Antworten sind
  identisch, und die Karte von B heißt in der Datenbank unverändert

### Requirement: Kartenbild hochladen

Das System SHALL dem Besitzer über `PUT /api/maps/:id/image` erlauben, das Bild einer Karte
zu setzen. Der Body SHALL das rohe Bild sein; der `Content-Type` der Anfrage SHALL
`image/png`, `image/jpeg` oder `image/webp` sein, sonst SHALL die Anfrage mit `415`
beantwortet werden. Ein Body über 20 MB SHALL mit `413` beantwortet werden. Ein Body, dessen
Dateisignatur (die ersten Bytes) nicht zum angegebenen Typ passt, SHALL mit `400` beantwortet
werden. In allen Ablehnungsfällen MUST NOT eine Datei entstehen oder das bisherige Bild
verändert werden.

Bei Erfolg SHALL der Server das Bild unter einem selbst vergebenen Dateinamen im
Upload-Verzeichnis ablegen, die Karte darauf verweisen lassen, ein etwaiges vorheriges Bild
aus dem Verzeichnis entfernen und mit `200` und der Karte (`hasImage: true`) antworten. Im
Verzeichnis SHALL danach genau eine Datei zu dieser Karte liegen. Der Dateiname MUST NOT aus
Angaben des Clients gebildet werden.

Fremde und unbekannte Karten SHALL wie in „Karte ändern" mit `404` beantwortet werden, ohne
dass eine Datei entsteht.

#### Scenario: PNG hochladen

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte ohne Bild, und das Upload-Verzeichnis
  ist leer
- **WHEN** `PUT /api/maps/:id/image` mit `Content-Type: image/png` und einem Body eingeht,
  der mit der PNG-Signatur beginnt
- **THEN** antwortet der Server mit `200` und der Karte mit `hasImage: true`, und im
  Upload-Verzeichnis liegt genau eine Datei, deren Inhalt dem gesendeten Body gleicht

#### Scenario: Erneuter Upload ersetzt das Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit einem hochgeladenen PNG
- **WHEN** `PUT /api/maps/:id/image` mit `Content-Type: image/jpeg` und einem Body mit
  JPEG-Signatur eingeht
- **THEN** antwortet der Server mit `200`, im Upload-Verzeichnis liegt genau eine Datei, und
  deren Inhalt gleicht dem zuletzt gesendeten Body

#### Scenario: Unbekannter Typ wird abgelehnt

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte ohne Bild
- **WHEN** `PUT /api/maps/:id/image` mit `Content-Type: text/plain` und einem beliebigen
  Body eingeht
- **THEN** antwortet der Server mit `415`, die Karte hat weiterhin kein Bild, und das
  Upload-Verzeichnis ist leer

#### Scenario: Inhalt passt nicht zum Typ

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte ohne Bild
- **WHEN** `PUT /api/maps/:id/image` mit `Content-Type: image/jpeg` und einem Body eingeht,
  der mit der PNG-Signatur beginnt
- **THEN** antwortet der Server mit `400`, die Karte hat weiterhin kein Bild, und das
  Upload-Verzeichnis ist leer

#### Scenario: Zu großes Bild wird abgelehnt

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte ohne Bild
- **WHEN** `PUT /api/maps/:id/image` mit `Content-Type: image/png` und einem Body von
  20 · 1024 · 1024 + 1 Bytes eingeht
- **THEN** antwortet der Server mit `413`, die Karte hat weiterhin kein Bild, und das
  Upload-Verzeichnis ist leer

#### Scenario: Upload auf fremde Karte

- **GIVEN** Nutzer B besitzt eine Karte ohne Bild, Nutzer A ist angemeldet
- **WHEN** `PUT /api/maps/:id/image` von A auf die Karte von B mit gültigem PNG eingeht
- **THEN** antwortet der Server mit `404`, die Karte von B hat weiterhin kein Bild, und das
  Upload-Verzeichnis ist leer

### Requirement: Kartenbild abrufen

Das System SHALL dem Besitzer über `GET /api/maps/:id/image` das Bild einer Karte liefern:
`200`, `Content-Type` gleich dem beim Upload angegebenen Typ, Body gleich der abgelegten
Datei, und `Cache-Control: private, no-store`. Eine Karte ohne Bild SHALL mit `404`
beantwortet werden. Fremde und unbekannte Karten SHALL mit `404` und derselben Meldung wie
eine unbekannte Karte beantwortet werden (`constitution.md` §9.2) — die Route MUST NOT
verraten, ob eine Karte existiert. Das Bild MUST NOT über einen anderen Pfad (statisches
Verzeichnis) erreichbar sein.

#### Scenario: Besitzer erhält das Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit einem hochgeladenen PNG
- **WHEN** `GET /api/maps/:id/image` mit seinem Cookie eingeht
- **THEN** antwortet der Server mit `200`, `Content-Type: image/png`, `Cache-Control:
  private, no-store` und einem Body, der byteweise dem hochgeladenen Bild gleicht

#### Scenario: Karte ohne Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte ohne Bild
- **WHEN** `GET /api/maps/:id/image` eingeht
- **THEN** antwortet der Server mit `404`

#### Scenario: Fremdes Bild ist nicht erreichbar

- **GIVEN** Nutzer B besitzt eine Karte mit Bild, Nutzer A ist angemeldet, und es gibt keine
  Karte mit der `id` `unbekannt`
- **WHEN** je ein `GET /api/maps/:id/image` von A auf die Karte von B und auf `unbekannt`
  eingeht
- **THEN** antworten beide mit `404`, und Statuscode und `message` beider Antworten sind
  identisch

### Requirement: Karte löschen

Das System SHALL dem Besitzer über `DELETE /api/maps/:id` erlauben, eine Karte zu löschen:
`204`, die Datenbankzeile ist entfernt, und ein etwaiges Bild ist aus dem Upload-Verzeichnis
entfernt. Fremde und unbekannte Karten SHALL wie in „Karte ändern" mit `404` beantwortet
werden, ohne Änderung.

#### Scenario: Löschen entfernt Karte und Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit einem hochgeladenen Bild
- **WHEN** `DELETE /api/maps/:id` eingeht
- **THEN** antwortet der Server mit `204`, die Karte existiert nicht mehr in der Datenbank,
  und das Upload-Verzeichnis ist leer

#### Scenario: Fremde Karte bleibt bestehen

- **GIVEN** Nutzer B besitzt eine Karte, Nutzer A ist angemeldet
- **WHEN** `DELETE /api/maps/:id` von A auf die Karte von B eingeht
- **THEN** antwortet der Server mit `404`, und die Karte von B existiert weiterhin

### Requirement: Rastergeometrie

Das System SHALL im gemeinsamen Code (`shared/`) reine Funktionen bereitstellen, die für
jedes Raster (a) den Mittelpunkt einer Zelle in Bildkoordinaten, (b) die Zelle liefern, in
der ein Bildpunkt liegt, (c) die Ecken einer Zelle in Zeichenreihenfolge (4 bei `quadrat`,
6 bei Hex), und (d) den Zellbereich `{ minCol, maxCol, minRow, maxRow }` liefern, der ein
Rechteck von `(0, 0)` bis `(width, height)` abdeckt. Der Zellbereich SHALL jede Zelle
enthalten, die das Rechteck schneidet, und darf am Rand zusätzliche Zellen enthalten.

Für Hex-Raster gilt: der Umkreisradius einer Zelle ist `size / √3`; bei `hex-spitz` ist die
Zellhöhe `2 · size / √3` und der Zeilenabstand drei Viertel davon, bei `hex-flach` die
Zellbreite `2 · size / √3` und der Spaltenabstand drei Viertel davon. Die Ecken haben alle
den Abstand des Umkreisradius zum Mittelpunkt.

#### Scenario: Mittelpunkt einer Quadratzelle

- **GIVEN** das Raster `quadrat`, Zellgröße 50, Versatz (10, 20)
- **WHEN** der Mittelpunkt der Zelle (2, 1) bestimmt wird
- **THEN** ist er (135, 95)

#### Scenario: Zelle zu einem Punkt im Quadratraster

- **GIVEN** das Raster `quadrat`, Zellgröße 50, Versatz (10, 20)
- **WHEN** die Zelle zu Punkt (134, 94) und die Zelle zu Punkt (9, 19) bestimmt werden
- **THEN** ist die erste (2, 1) und die zweite (−1, −1)

#### Scenario: Ecken einer Quadratzelle

- **GIVEN** das Raster `quadrat`, Zellgröße 50, Versatz (10, 20)
- **WHEN** die Ecken der Zelle (0, 0) bestimmt werden
- **THEN** sind es genau vier: (10, 20), (60, 20), (60, 70), (10, 70) in dieser Reihenfolge

#### Scenario: Mittelpunkte im Raster hex-spitz

- **GIVEN** das Raster `hex-spitz`, Zellgröße 60, Versatz (0, 0)
- **WHEN** die Mittelpunkte der Zellen (0, 0), (1, 0) und (1, 1) bestimmt werden
- **THEN** sind sie (30, 34.64), (90, 34.64) und (120, 86.60) — die ungerade Zeile ist um
  eine halbe Zellbreite nach rechts versetzt

#### Scenario: Zelle zu einem Punkt im Raster hex-spitz

- **GIVEN** das Raster `hex-spitz`, Zellgröße 60, Versatz (0, 0)
- **WHEN** die Zelle zu Punkt (60, 60) und die Zelle zu Punkt (120, 86) bestimmt werden
- **THEN** ist die erste (0, 1) und die zweite (1, 1)

#### Scenario: Ecken einer Zelle im Raster hex-spitz

- **GIVEN** das Raster `hex-spitz`, Zellgröße 60, Versatz (0, 0)
- **WHEN** die Ecken der Zelle (0, 0) bestimmt werden
- **THEN** sind es genau sechs, darunter (30, 0), (30, 69.28), (0, 17.32) und (60, 51.96),
  und jede hat den Abstand 34.64 zum Mittelpunkt (30, 34.64)

#### Scenario: Mittelpunkte im Raster hex-flach

- **GIVEN** das Raster `hex-flach`, Zellgröße 60, Versatz (0, 0)
- **WHEN** die Mittelpunkte der Zellen (0, 0), (0, 1) und (1, 1) bestimmt werden
- **THEN** sind sie (34.64, 30), (34.64, 90) und (86.60, 120) — die ungerade Spalte ist um
  eine halbe Zellhöhe nach unten versetzt

#### Scenario: Zelle zu einem Punkt im Raster hex-flach

- **GIVEN** das Raster `hex-flach`, Zellgröße 60, Versatz (0, 0)
- **WHEN** die Zelle zu Punkt (86, 120) bestimmt wird
- **THEN** ist sie (1, 1)

#### Scenario: Ecken einer Zelle im Raster hex-flach

- **GIVEN** das Raster `hex-flach`, Zellgröße 60, Versatz (0, 0)
- **WHEN** die Ecken der Zelle (0, 0) bestimmt werden
- **THEN** sind es genau sechs, darunter (0, 30), (69.28, 30), (17.32, 0) und (51.96, 60),
  und jede hat den Abstand 34.64 zum Mittelpunkt (34.64, 30)

#### Scenario: Zellbereich eines Bildes im Quadratraster

- **GIVEN** das Raster `quadrat`, Zellgröße 50, Versatz (10, 20) und ein Bild von 200 × 100
- **WHEN** der Zellbereich bestimmt wird
- **THEN** ist er `{ minCol: -1, maxCol: 3, minRow: -1, maxRow: 1 }`

#### Scenario: Zellbereich eines Bildes im Raster hex-spitz

- **GIVEN** das Raster `hex-spitz`, Zellgröße 60, Versatz (0, 0) und ein Bild von 200 × 100
- **WHEN** der Zellbereich bestimmt wird
- **THEN** enthält er die Zellen (0, 0) und (2, 1), aber nicht die Zelle (0, 4)

### Requirement: Sicht mit Schwenken und Zoomen

Die Kartenansicht SHALL das Bild samt Raster auf einem Canvas zeigen und dem Betrachter
Schwenken durch Ziehen und Zoomen mit dem Mausrad erlauben. Die Sichtmathematik SHALL eine
reine Funktion sein: Zoomen um einen Canvas-Punkt SHALL den Bildpunkt unter diesem Punkt an
Ort und Stelle halten; `scale` SHALL auf den Bereich 0,1 bis 8 begrenzt sein; Schwenken SHALL
`x`/`y` um den Zug verschieben. Die Sicht ist lokal je Betrachter und wird nicht gespeichert
oder übertragen.

#### Scenario: Zoom hält den Punkt unter dem Zeiger fest

- **GIVEN** die Sicht `{ x: 0, y: 0, scale: 1 }`
- **WHEN** um den Canvas-Punkt (100, 100) mit Faktor 2 gezoomt wird
- **THEN** ist die Sicht `{ x: -100, y: -100, scale: 2 }`, sodass der Bildpunkt (100, 100)
  weiterhin bei (100, 100) erscheint

#### Scenario: Zoom ist nach oben begrenzt

- **GIVEN** die Sicht `{ x: 0, y: 0, scale: 6 }`
- **WHEN** um den Canvas-Punkt (0, 0) mit Faktor 2 gezoomt wird
- **THEN** ist `scale` gleich 8 und `x`/`y` bleiben 0

#### Scenario: Schwenken verschiebt die Sicht

- **GIVEN** die Sicht `{ x: -100, y: -100, scale: 2 }`
- **WHEN** um (30, −10) geschwenkt wird
- **THEN** ist die Sicht `{ x: -70, y: -110, scale: 2 }`

### Requirement: Bibliotheksoberfläche

Die angemeldete Ansicht SHALL aus der Sitzungsliste einen Wechsel zur Kartenbibliothek
anbieten. Die Bibliothek SHALL die eigenen Karten mit Namen und Bildstatus auflisten, das
Anlegen einer Karte mit Namen und Bilddatei in einem Schritt erlauben (Karte anlegen, dann
Bild hochladen), und eine Karte zur Bearbeitung öffnen: Kartenansicht mit Bild und Raster,
Formular für Name und Raster, Bild ersetzen, Löschen nach Bestätigung, Zurück zur Liste.

Was die Kartenansicht zeigt, SHALL ausschließlich aus Antworten des Servers stammen — ein
gespeichertes Raster wird mit dem Wert aus der Antwort gezeichnet, nicht mit der Eingabe
(`constitution.md` §9.1). Ein vom Server gemeldeter Fehlschlag SHALL sichtbar sein. Beim
Verlassen der Kartenansicht SHALL die Anwendung die Canvas-Ressourcen genau einmal freigeben.

#### Scenario: Einstieg aus der Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer sieht die Sitzungsliste
- **WHEN** er „Kartenbibliothek" wählt
- **THEN** zeigt die Anwendung die Bibliothek mit dem Formular „Neue Karte" und hat die
  Kartenliste vom Server abgefragt

#### Scenario: Liste zeigt eigene Karten mit Bildstatus

- **GIVEN** der Server liefert die Karten „Taverne" (mit Bild) und „Wald" (ohne Bild)
- **WHEN** die Bibliothek gerendert wird
- **THEN** zeigt sie beide Namen, und „Wald" ist als Karte ohne Bild gekennzeichnet

#### Scenario: Neue Karte mit Bild anlegen

- **GIVEN** die Bibliothek ist gerendert
- **WHEN** der Nutzer den Namen „Krypta" eingibt, eine PNG-Datei wählt und das Formular
  abschickt
- **THEN** sendet die Anwendung `POST /api/maps` mit `{ "name": "Krypta" }`, danach
  `PUT /api/maps/<id>/image` mit `Content-Type: image/png` und der Datei als Body, und lädt
  danach die Liste neu

#### Scenario: Karte öffnen zeigt Kartenansicht und Rasterformular

- **GIVEN** die Bibliothek zeigt die Karte „Taverne" mit Bild und dem Raster `quadrat`, 70,
  0, 0
- **WHEN** der Nutzer „Taverne" öffnet
- **THEN** erzeugt die Anwendung die Kartenansicht mit der Bild-URL `/api/maps/<id>/image`
  und diesem Raster, und das Formular zeigt Typ `quadrat`, Zellgröße 70 und Versatz 0/0

#### Scenario: Gespeichertes Raster kommt vom Server

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer Typ `hex-spitz` und Zellgröße 50 eingibt und speichert, und der Server
  mit der Karte antwortet, deren Raster `hex-spitz` mit Zellgröße 55 trägt
- **THEN** hat die Anwendung `PATCH /api/maps/<id>` mit `{ "grid": { "type": "hex-spitz",
  "size": 50, "offsetX": 0, "offsetY": 0 } }` gesendet, und die Kartenansicht zeichnet das
  Raster mit Zellgröße 55

#### Scenario: Abgelehnter Upload wird angezeigt

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer ein Bild ersetzt und der Server mit `413` und einer Meldung antwortet
- **THEN** zeigt die Anwendung diese Meldung als Fehlermeldung an

#### Scenario: Löschen nach Bestätigung

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer „Löschen" wählt und die Rückfrage bestätigt
- **THEN** sendet die Anwendung `DELETE /api/maps/<id>`, kehrt zur Liste zurück, und
  „Taverne" ist nicht mehr aufgeführt

#### Scenario: Verlassen gibt die Kartenansicht frei

- **GIVEN** die Karte „Taverne" ist geöffnet
- **WHEN** der Nutzer zur Liste zurückkehrt
- **THEN** hat die Anwendung die Canvas-Ressourcen der Kartenansicht genau einmal freigegeben
