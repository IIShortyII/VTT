# session-annotation Specification

## Purpose

Messen und Zeichnen auf der aktiven Karte: jeder Teilnehmer misst Strecken, Kreise und
Winkel — eingerastet am Raster oder frei — und legt Freihandstriche auf die Karte, privat
für sich allein oder geteilt mit allen im Raum. Anmerkungen hängen an der Karteninstanz und
überstehen Kartenwechsel, Reload und Serverneustart; wer eine Anmerkung sieht und wer sie
entfernen darf, entscheidet der Server je Verbindung und je Aktion (`constitution.md` §9).

## Begriffe

- **Anmerkung**: eine Messung oder eine Zeichnung auf einer Karteninstanz (Modell
  `Annotation`): Instanz, Urheber, Art, Modus, Sichtbarkeit, Farbe, Punkte,
  Anlegezeitpunkt. Eine Anmerkung gehört genau einer Instanz (`session-map`,
  „Karteninstanz") und bleibt bestehen, bis sie entfernt wird.
- **Art**: `strecke`, `kreis`, `winkel` (die drei Messarten) oder `zeichnung`.
- **Punkt**: `{ x, y }` in Bildkoordinaten der Karte (`map-library`, „Rastergeometrie"),
  endliche Zahlen mit Betrag je Koordinate höchstens 1000000. Nachkommastellen sind
  zulässig (Zellmitten im Hexraster sind nicht ganzzahlig).
- **Punkte** einer Anmerkung, nach Art: `strecke` genau zwei (Anfang, Ende); `kreis` genau
  zwei (Mittelpunkt, Randpunkt); `winkel` genau drei (Scheitel, Ende des ersten Schenkels,
  Ende des zweiten Schenkels); `zeichnung` 2 bis 2000 in Zeichenreihenfolge.
- **Modus**: `gerastert` oder `frei`. Bei `gerastert` liegt jeder Punkt auf einer Zellmitte
  — der Server setzt die empfangenen Punkte selbst auf die Mitte der Zelle, in der sie
  liegen (`constitution.md` §9.1), und speichert das Ergebnis. Eine `zeichnung` hat immer
  Modus `frei`.
- **Sichtbarkeit**: `privat` (nur der Urheber) oder `geteilt` (jedes Mitglied im Raum).
- **Farbe**: ein Eintrag der festen Palette `rot`, `orange`, `gelb`, `gruen`, `blau`,
  `weiss` — nur bei Art `zeichnung`; bei den drei Messarten `null`.
- **Urheber**: die `userId` des Mitglieds, das die Anmerkung angelegt hat, oder `null`,
  wenn dieser Nutzer nicht mehr existiert.
- **Zellabstand** zweier Zellen: im Raster `quadrat` `max(|Δcol|, |Δrow|)` (Diagonale zählt
  1, die 5e-Regel); im Raster `hex-spitz` und `hex-flach` der Abstand in Würfelkoordinaten
  (`max(|Δx|, |Δy|, |Δz|)` nach Umrechnung aus odd-r bzw. odd-q, dieselbe Zuordnung wie in
  „Rastergeometrie"), also die kleinste Anzahl von Schritten zwischen benachbarten Zellen.
- **Länge in Feldern** einer Strecke (und Radius eines Kreises als Strecke Mittelpunkt →
  Randpunkt): bei `gerastert` der Zellabstand der Zellen, in denen die beiden Punkte
  liegen; bei `frei` die euklidische Länge in Bildkoordinaten geteilt durch die Zellgröße
  des Rasters, auf eine Nachkommastelle gerundet.
- **Winkel in Grad**: der Winkel zwischen den Schenkeln Scheitel → erstes Ende und Scheitel
  → zweites Ende, 0 bis 180, auf eine ganze Zahl gerundet; hat ein Schenkel die Länge 0,
  ist der Winkel 0.
- **Einheit**: `meter` oder `fuss`. 1 Feld = 1,5 m = 5 ft. Der umgerechnete Wert entsteht
  aus der (bereits gerundeten) Länge in Feldern und wird auf eine Nachkommastelle gerundet.
- **Zahlenformat** im Etikett: höchstens eine Nachkommastelle, Komma als Dezimaltrenner,
  ganze Zahlen ohne Nachkommastelle (`3`, `3,6`, `4,5`, `18`). Das Wort ist `Feld` bei
  genau 1, sonst `Felder`.
- **Etikett** einer Anmerkung, je Art und Einheit: `strecke` → `<Länge> Felder (<Wert> m)`
  bzw. `(… ft)`, etwa `3 Felder (4,5 m)`, `3,6 Felder (18 ft)`, `1 Feld (1,5 m)`; `kreis`
  → `r <Radius> Felder (<Wert> m) · ⌀ <Durchmesser> Felder (<Wert> m)` mit Durchmesser =
  2 × Radius, etwa `r 2 Felder (3 m) · ⌀ 4 Felder (6 m)`; `winkel` → `<Grad>°`, etwa
  `45°`; `zeichnung` → kein Etikett. Das Etikett wird nie gespeichert oder gesendet; es
  ist eine reine Funktion aus Anmerkung, Raster und Einheit und wird überall, wo es
  erscheint, aus derselben Quelle berechnet.
- **Anmerkungsdarstellung**: `{ id, instanceId, kind, mode, visibility, color, points,
  authorId }`.
- **Ziel** einer Entfern-Aktion: `{ kind: "eine", annotationId }`; `{ kind: "meine" }`
  (alle Anmerkungen des Absenders auf der aktiven Instanz, privat und geteilt);
  `{ kind: "geteilte" }` (alle geteilten Anmerkungen der aktiven Instanz, nur Spielleiter).
- **Entfernen dürfen**: eine Anmerkung darf entfernen, wer ihr Urheber ist; eine geteilte
  Anmerkung zusätzlich jedes Mitglied mit Rolle `spielleiter`. Eine private Anmerkung eines
  anderen Mitglieds existiert für den Absender nicht — sie ist von einer unbekannten `id`
  nicht unterscheidbar (`constitution.md` §9.2).
- **Anmerkungsbestand**: alle Anmerkungen der aktiven Instanz, aufsteigend nach
  Anlegezeitpunkt, als Liste von Anmerkungsdarstellungen; ohne aktive Karte die leere
  Liste. Er erreicht jeden Teilnehmer im Raum **je Verbindung gefiltert**
  (`constitution.md` §9.2): geteilte Anmerkungen für jedes Mitglied, private Anmerkungen
  ausschließlich für ihren Urheber. Eine private Anmerkung eines anderen verlässt den
  Server für diesen Empfänger in keiner Form. Der Fog filtert den Bestand **nicht**: eine
  geteilte Anmerkung erreicht Spieler mit allen Punkten, auch in verdeckten Zellen — wer
  teilt, teilt ganz.
- **Werkzeug** der Kartenansicht: zusätzlich zu den Werkzeugen der Fog-Verwaltung
  (`session-fog`, „Fog-Ansicht im Raum": `schwenken`, `aufdecken`, `verdecken`, `bereich`)
  die Werkzeuge `strecke`, `kreis`, `winkel` und `zeichnung`. Es gibt genau einen
  Werkzeugzustand je Raumansicht; `schwenken` ist der Ausgangszustand und in beiden
  Verwaltungen dasselbe Werkzeug (Beschriftung `Schwenken` in der Fog-Verwaltung,
  `Bewegen` im Panel „Messen & Zeichnen").

Drahtformat (Client → Server, je mit Acknowledgement): `session:annotation-create`
`{ sessionId, kind, mode, visibility, color, points }` → `{ ok: true, annotation }` mit der
Anmerkungsdarstellung (bei `gerastert` mit den eingerasteten Punkten) oder `{ ok: false,
message }`; `session:annotation-delete` `{ sessionId, target }` mit einem Ziel →
`{ ok: true }` oder `{ ok: false, message }`. Server → Client: `session:annotations`
`{ sessionId, annotations }` mit dem für diesen Empfänger gefilterten Anmerkungsbestand —
je Verbindung gesendet, nicht als ein Paket an den Raum. Das Acknowledgement von
`session:enter` (`game-session`) trägt zusätzlich `annotations` mit dem für den Betretenden
gefilterten Bestand. Nach jedem `session:map` (`session-map`) folgt für jede Verbindung im
Raum nach `session:fog` und `session:tokens` ein `session:annotations` mit dem Bestand der
neuen aktiven Karte (leere Liste bei `null`).

## ADDED Requirements

### Requirement: Messgeometrie

Das System SHALL im gemeinsamen Code (`shared/`) reine Funktionen bereitstellen, die (a)
den Zellabstand zweier Zellen je Rastertyp, (b) den auf die Zellmitte eingerasteten Punkt
zu einem Bildpunkt, (c) die Länge in Feldern einer Strecke je Modus, (d) den Winkel in
Grad und (e) das Etikett einer Anmerkung je Einheit liefern — jeweils nach „Begriffe".
Diese Funktionen SHALL von Server (Einrasten) und Client (Vorschau, Kartenansicht, Liste)
gleichermaßen benutzt werden.

#### Scenario: Zellabstand im Quadratraster

- **GIVEN** das Raster `quadrat`
- **WHEN** der Zellabstand der Zellen (0, 0) und (3, 2) bestimmt wird
- **THEN** ist er 3

#### Scenario: Zellabstand im Raster hex-spitz

- **GIVEN** das Raster `hex-spitz`
- **WHEN** der Zellabstand der Zellen (0, 0) und (2, 3) bestimmt wird
- **THEN** ist er 4

#### Scenario: Zellabstand im Raster hex-flach

- **GIVEN** das Raster `hex-flach`
- **WHEN** der Zellabstand der Zellen (0, 0) und (3, 2) bestimmt wird
- **THEN** ist er 4

#### Scenario: Einrasten auf die Zellmitte

- **GIVEN** das Raster `quadrat`, Zellgröße 50, Versatz (10, 20)
- **WHEN** der Punkt (134, 94) eingerastet wird
- **THEN** ist das Ergebnis (135, 95)

#### Scenario: Freie Länge in Feldern

- **GIVEN** das Raster `quadrat`, Zellgröße 50, Versatz (0, 0)
- **WHEN** die Länge in Feldern der Strecke (0, 0) → (150, 100) im Modus `frei` bestimmt
  wird
- **THEN** ist sie 3,6

#### Scenario: Gerasterte Länge in Feldern

- **GIVEN** das Raster `quadrat`, Zellgröße 70, Versatz (0, 0)
- **WHEN** die Länge in Feldern der Strecke (105, 105) → (245, 35) im Modus `gerastert`
  bestimmt wird
- **THEN** ist sie 2

#### Scenario: Winkel zwischen zwei Schenkeln

- **GIVEN** der Scheitel (0, 0), das erste Schenkelende (100, 0) und das zweite (100, 100)
- **WHEN** der Winkel in Grad bestimmt wird
- **THEN** ist er 45

#### Scenario: Etikett einer gerasterten Strecke in Metern

- **GIVEN** eine Anmerkung der Art `strecke`, Modus `gerastert`, Punkte (35, 35) und
  (245, 35), das Raster `quadrat`, 70, 0, 0 und die Einheit `meter`
- **WHEN** das Etikett bestimmt wird
- **THEN** lautet es `3 Felder (4,5 m)`

#### Scenario: Etikett einer freien Strecke in Fuß

- **GIVEN** eine Anmerkung der Art `strecke`, Modus `frei`, Punkte (0, 0) und (150, 100),
  das Raster `quadrat`, 50, 0, 0 und die Einheit `fuss`
- **WHEN** das Etikett bestimmt wird
- **THEN** lautet es `3,6 Felder (18 ft)`

#### Scenario: Etikett eines Kreises und Einzahl bei einem Feld

- **GIVEN** eine Anmerkung der Art `kreis`, Modus `gerastert`, Punkte (35, 35) und
  (175, 35), das Raster `quadrat`, 70, 0, 0, die Einheit `meter`, sowie eine Anmerkung der
  Art `strecke`, Modus `gerastert`, Punkte (35, 35) und (105, 35) auf demselben Raster
- **WHEN** die Etiketten bestimmt werden
- **THEN** lautet das erste `r 2 Felder (3 m) · ⌀ 4 Felder (6 m)` und das zweite
  `1 Feld (1,5 m)`

#### Scenario: Etikett eines Winkels und einer Zeichnung

- **GIVEN** eine Anmerkung der Art `winkel` mit den Punkten (0, 0), (100, 0) und
  (100, 100) sowie eine Anmerkung der Art `zeichnung` mit drei Punkten
- **WHEN** die Etiketten bestimmt werden
- **THEN** lautet das erste `45°`, und das zweite ist leer

### Requirement: Anmerkung anlegen

Der Server SHALL über `session:annotation-create` jedem Mitglied der Spielsitzung erlauben,
eine Anmerkung auf der aktiven Instanz anzulegen — geprüft pro Aktion (`game-session`,
„Autorisierung pro Aktion"; `constitution.md` §9.3). Die Payload SHALL an der Grenze
validiert werden: Art, Modus, Sichtbarkeit und Farbe aus den festen Wertemengen, Punkte
nach „Begriffe" (Anzahl je Art, Betragsgrenze), Farbe genau dann gesetzt, wenn die Art
`zeichnung` ist, Modus `frei` bei `zeichnung`; eine ungültige Payload SHALL mit
`{ ok: false, message: "Ungültige Anfrage." }` beantwortet werden. Ohne aktive Karte SHALL
die Aktion mit `{ ok: false, message: "Keine Karte aktiv." }` abgelehnt werden. Bei Modus
`gerastert` SHALL der Server jeden Punkt auf die Mitte der Zelle setzen, in der er im
Raster der aktiven Karte liegt, bevor er speichert. Bei Erfolg SHALL die Anmerkung mit dem
Absender als Urheber gespeichert sein, jeder Verbindung im Raum `session:annotations` mit
dem für sie gefilterten Bestand gesendet und dem Absender `{ ok: true, annotation }`
geantwortet werden. Eine abgelehnte Aktion MUST NOT etwas verändern und MUST NOT ein
`session:annotations` auslösen.

#### Scenario: Spieler legt eine geteilte freie Strecke an

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte „Taverne" (Raster
  `quadrat`, 70, 0, 0) ohne Anmerkungen, deren Spielleiter und ein Spieler-Mitglied `sam`
  beide den Raum betreten haben
- **WHEN** `sam` `session:annotation-create` mit `kind: "strecke"`, `mode: "frei"`,
  `visibility: "geteilt"`, `color: null` und den Punkten (10, 20) und (160, 120) sendet
- **THEN** lautet das Acknowledgement `{ ok: true, annotation }` mit `id`, der `instanceId`
  der Instanz, `kind: "strecke"`, `mode: "frei"`, `visibility: "geteilt"`, `color: null`,
  genau diesen zwei Punkten und `authorId` gleich der `userId` von `sam`; in der Datenbank
  existiert genau eine Anmerkung dieser Instanz mit `sam` als Urheber; der Spielleiter und
  `sam` erhalten je `session:annotations` mit genau dieser Anmerkung

#### Scenario: Private Messung erreicht nur den Urheber

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne Anmerkungen,
  deren Spielleiter und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** `sam` `session:annotation-create` mit `kind: "strecke"`, `mode: "frei"`,
  `visibility: "privat"`, `color: null` und zwei Punkten sendet
- **THEN** lautet das Acknowledgement `{ ok: true, annotation }` mit `visibility:
  "privat"`, `sam` erhält `session:annotations` mit genau dieser Anmerkung, und der
  Spielleiter erhält `session:annotations` mit leerer Liste

#### Scenario: Gerastert setzt die Punkte auf Zellmitten

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte (Raster `quadrat`,
  70, 0, 0), deren Spielleiter den Raum betreten hat
- **WHEN** er `session:annotation-create` mit `kind: "strecke"`, `mode: "gerastert"`,
  `visibility: "geteilt"`, `color: null` und den Punkten (100, 100) und (250, 30) sendet
- **THEN** trägt `annotation` im Acknowledgement genau die Punkte (105, 105) und (245, 35),
  und die Anmerkung ist in der Datenbank mit genau diesen Punkten gespeichert

#### Scenario: Zeichnung wird mit Farbe gespeichert

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, deren Spielleiter
  und ein Spieler-Mitglied `sam` beide den Raum betreten haben
- **WHEN** der Spielleiter `session:annotation-create` mit `kind: "zeichnung"`, `mode:
  "frei"`, `visibility: "geteilt"`, `color: "rot"` und den Punkten (1, 1), (2, 2) und
  (3, 1) sendet
- **THEN** trägt `annotation` im Acknowledgement `kind: "zeichnung"`, `color: "rot"` und
  genau diese drei Punkte, und `sam` erhält `session:annotations` mit genau dieser
  Anmerkung

#### Scenario: Ungültige Payload beim Anlegen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte ohne Anmerkungen,
  deren Spielleiter den Raum betreten hat
- **WHEN** er `session:annotation-create` mit `kind: "winkel"`, `mode: "frei"`,
  `visibility: "geteilt"`, `color: null` und nur zwei Punkten sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Ungültige Anfrage." }`, und
  die Anzahl der Anmerkungen dieser Instanz in der Datenbank ist 0

#### Scenario: Anlegen ohne aktive Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit eingehängter, aber nicht aktiver
  Karte, deren Spielleiter den Raum betreten hat
- **WHEN** er `session:annotation-create` mit gültiger Payload sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Keine Karte aktiv." }`, und
  die Anzahl der Anmerkungen in der Datenbank ist 0

#### Scenario: Abmeldung wirkt auf das Anlegen

- **GIVEN** ein Spielleiter, der den Raum seiner Spielsitzung mit aktiver Karte betreten hat
- **WHEN** `POST /api/auth/logout` mit seinem Cookie eingeht und er danach über dieselbe
  Socket-Verbindung `session:annotation-create` mit gültiger Payload sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Anzahl der
  Anmerkungen dieser Instanz in der Datenbank ist 0

### Requirement: Anmerkung entfernen

Der Server SHALL über `session:annotation-delete` Anmerkungen der aktiven Instanz
entfernen — geprüft pro Aktion. Ziel `eine`: eine Anmerkung, die der Absender entfernen
darf („Begriffe"), SHALL gelöscht werden; eine geteilte Anmerkung eines anderen Mitglieds
SHALL für ein Mitglied mit Rolle `spieler` mit `{ ok: false, message: "Dafür fehlt die
Berechtigung." }` abgelehnt werden; eine private Anmerkung eines anderen Mitglieds, eine
Anmerkung einer anderen Instanz und eine unbekannte `annotationId` SHALL mit identischem
`{ ok: false, message: "Anmerkung nicht gefunden." }` beantwortet werden
(`constitution.md` §9.2). Ziel `meine`: alle Anmerkungen des Absenders auf der aktiven
Instanz SHALL gelöscht werden, private wie geteilte, auch wenn es keine gibt. Ziel
`geteilte`: ausschließlich für Rolle `spielleiter` (sonst `{ ok: false, message: "Dafür
fehlt die Berechtigung." }`), alle geteilten Anmerkungen der aktiven Instanz SHALL gelöscht
werden, private anderer bleiben. Eine ungültige Payload SHALL mit `"Ungültige Anfrage."`,
eine fehlende aktive Karte mit `"Keine Karte aktiv."` abgelehnt werden. Nach jeder
erfolgreichen Aktion SHALL jeder Verbindung im Raum `session:annotations` mit dem für sie
gefilterten Bestand gesendet und dem Absender `{ ok: true }` geantwortet werden. Eine
abgelehnte Aktion MUST NOT etwas verändern und MUST NOT ein `session:annotations`
auslösen. Anmerkungen SHALL an der Karteninstanz gespeichert bleiben — ein Kartenwechsel
weg und zurück zeigt sie wieder, ein Serverneustart verliert sie nicht; Aushängen der
Instanz SHALL sie mit löschen.

#### Scenario: Urheber entfernt eine private Anmerkung

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der das
  Spieler-Mitglied `sam` genau eine private Anmerkung hat, und `sam` im Raum
- **WHEN** `sam` `session:annotation-delete` mit dem Ziel `eine` und der `id` dieser
  Anmerkung sendet
- **THEN** lautet das Acknowledgement `{ ok: true }`, die Anmerkung existiert nicht mehr in
  der Datenbank, und `sam` erhält `session:annotations` mit leerer Liste

#### Scenario: Spielleiter entfernt eine geteilte Anmerkung eines Spielers

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der das
  Spieler-Mitglied `sam` genau eine geteilte Anmerkung hat, deren Spielleiter und `sam`
  beide im Raum sind
- **WHEN** der Spielleiter `session:annotation-delete` mit dem Ziel `eine` und der `id`
  dieser Anmerkung sendet
- **THEN** lautet das Acknowledgement `{ ok: true }`, die Anmerkung existiert nicht mehr in
  der Datenbank, und `sam` erhält `session:annotations` mit leerer Liste

#### Scenario: Spieler darf eine fremde geteilte Anmerkung nicht entfernen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der der
  Spielleiter genau eine geteilte Anmerkung hat, und ein Spieler-Mitglied `sam` im Raum
- **WHEN** `sam` `session:annotation-delete` mit dem Ziel `eine` und der `id` dieser
  Anmerkung sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Dafür fehlt die
  Berechtigung." }`, die Anmerkung existiert weiterhin, und `sam` erhält kein
  `session:annotations`

#### Scenario: Fremde private und unbekannte Anmerkung sind nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der der
  Spielleiter genau eine private Anmerkung hat, ein Spieler-Mitglied `sam` im Raum, und
  keine Anmerkung mit der `id` `unbekannt`
- **WHEN** `sam` je ein `session:annotation-delete` mit dem Ziel `eine` und der `id` der
  privaten Anmerkung sowie mit `unbekannt` sendet
- **THEN** lauten beide Acknowledgements `{ ok: false, message }` mit identischer
  `message`, und die private Anmerkung existiert weiterhin

#### Scenario: Meine entfernen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der das
  Spieler-Mitglied `sam` eine private und eine geteilte Anmerkung und der Spielleiter eine
  geteilte Anmerkung hat, beide im Raum
- **WHEN** `sam` `session:annotation-delete` mit dem Ziel `meine` sendet
- **THEN** lautet das Acknowledgement `{ ok: true }`, in der Datenbank existiert genau die
  Anmerkung des Spielleiters, und der Spielleiter erhält `session:annotations` mit genau
  seiner Anmerkung

#### Scenario: Alle geteilten entfernen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der der
  Spielleiter eine geteilte und das Spieler-Mitglied `sam` eine geteilte und eine private
  Anmerkung hat, beide im Raum
- **WHEN** der Spielleiter `session:annotation-delete` mit dem Ziel `geteilte` sendet
- **THEN** lautet das Acknowledgement `{ ok: true }`, in der Datenbank existiert genau die
  private Anmerkung von `sam`, und `sam` erhält `session:annotations` mit genau dieser

#### Scenario: Spieler darf nicht alle geteilten entfernen

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der der
  Spielleiter eine geteilte Anmerkung hat, und ein Spieler-Mitglied `sam` im Raum
- **WHEN** `sam` `session:annotation-delete` mit dem Ziel `geteilte` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message: "Dafür fehlt die
  Berechtigung." }`, und die Anzahl der Anmerkungen dieser Instanz ist unverändert 1

### Requirement: Anmerkungsbestand beim Betreten und Kartenwechsel

Das Acknowledgement eines erfolgreichen `session:enter` SHALL zusätzlich `annotations`
tragen: den für den Betretenden gefilterten Anmerkungsbestand. Nach jedem `session:map`
SHALL der Server jeder Verbindung im Raum nach `session:fog` und `session:tokens` ein
`session:annotations` mit dem für sie gefilterten Bestand der neuen aktiven Karte senden
(leere Liste, wenn keine Karte aktiv ist). Das Aushängen einer Instanz SHALL ihre
Anmerkungen mit löschen.

#### Scenario: Betreten liefert den gefilterten Bestand

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit aktiver Karte, auf der in dieser
  Reihenfolge angelegt wurden: eine private Anmerkung des Spielleiters, eine geteilte
  Anmerkung des Spielleiters und eine private Anmerkung des Spieler-Mitglieds `sam`; beide
  mit Socket-Verbindung
- **WHEN** `sam` und der Spielleiter je `session:enter` senden
- **THEN** trägt das Acknowledgement von `sam` `annotations` mit genau der geteilten
  Anmerkung des Spielleiters und der privaten Anmerkung von `sam` in dieser Reihenfolge,
  und das des Spielleiters genau seine private und seine geteilte Anmerkung in dieser
  Reihenfolge — die private Anmerkung von `sam` kommt darin nicht vor

#### Scenario: Kartenwechsel verteilt den Bestand der neuen Karte

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, deren Karte „Taverne" aktiv ist und
  eine geteilte Anmerkung trägt, deren Karte „Keller" eingehängt ist und keine Anmerkung
  trägt, und in deren Raum ein Spieler-Mitglied `sam` und der Spielleiter anwesend sind
- **WHEN** der Spielleiter `session:activate-map` mit der Instanz von „Keller" und danach
  mit der Instanz von „Taverne" sendet
- **THEN** erhält `sam` nach dem ersten Wechsel `session:annotations` mit leerer Liste und
  nach dem zweiten `session:annotations` mit genau der geteilten Anmerkung, jeweils nach
  dem zugehörigen `session:tokens`

#### Scenario: Aushängen löscht die Anmerkungen

- **GIVEN** ein Spielleiter, dessen Karte „Taverne" in seiner Spielsitzung eingehängt, aber
  nicht aktiv ist, mit zwei Anmerkungen auf dieser Instanz
- **WHEN** `DELETE /api/sessions/:id/maps/:instanceId` für diese Instanz eingeht
- **THEN** antwortet der Server mit `204`, und die Anzahl der Anmerkungen dieser Instanz in
  der Datenbank ist 0

### Requirement: Anmerkungsansicht im Raum

Die Raumansicht (`game-session`, „Sitzungsoberfläche") SHALL den Anmerkungsbestand aus
dem Enter-Acknowledgement übernehmen und mit jedem `session:annotations` ersetzen, und ihn
der Canvas-Fassade übergeben (beim Erzeugen und bei jeder Änderung per `setAnnotations`),
zusammen mit den Anzeigeoptionen Modus, Farbe und Einheit (beim Erzeugen und bei jeder
Änderung per `setAnnotationOptions`). Die Kartenansicht zeichnet Zeichnungen über dem Fog
und unter den Tokens, Messungen mit ihrem Etikett über den Tokens; keines reagiert auf
Zeiger; das Aussehen nimmt der menschliche App-Test ab.

Bei aktiver Karte SHALL die Raumansicht jeder Rolle ein Panel `Messen & Zeichnen`
anbieten: die Werkzeugwahl `Bewegen` (Standard, dasselbe Werkzeug wie `Schwenken` der
Fog-Verwaltung), `Strecke`, `Kreis`, `Winkel`, `Zeichnen`, die sie der Canvas-Fassade per
`setTool` übergibt — es gibt genau einen Werkzeugzustand, den sich beide Verwaltungen
teilen; die Moduswahl `Gerastert` (Standard) und `Frei`, nur bei `Strecke`, `Kreis` und
`Winkel` aktiviert; die Sichtbarkeitswahl `Privat` (Standard) und `Geteilt`; die Farbwahl
`Rot` (Standard), `Orange`, `Gelb`, `Grün`, `Blau`, `Weiß`, nur bei `Zeichnen` aktiviert;
die Einheitenwahl `Meter` (Standard) und `Fuß`, die sofort auf jedes Etikett wirkt und im
Browser gemerkt wird (beim nächsten Betreten vorbelegt); eine Liste der sichtbaren
Anmerkungen in Bestandsreihenfolge, je Eintrag Art, Etikett (außer bei Zeichnung),
Sichtbarkeit und Urheber (Alias oder Nutzername aus der Teilnehmerliste, sonst
`unbekannt`), mit einer Schaltfläche `Entfernen` genau dann, wenn der Betrachter die
Anmerkung nach „Begriffe" entfernen darf; eine Schaltfläche `Meine entfernen`; und für
Rolle `spielleiter` zusätzlich `Alle geteilten entfernen`. Ohne aktive Karte MUST NOT das
Panel erscheinen.

Die Canvas-Fassade SHALL in den Werkzeugen `Strecke`, `Kreis`, `Winkel` und `Zeichnen`
statt zu schwenken eine Geste aufnehmen (Ziehen bei Strecke, Kreis und Zeichnen; drei
Klicks bei Winkel), währenddessen eine lokale Vorschau zeichnen und beim Abschluss Art und
Punkte per `onAnnotationDrawn` melden (Geste und Vorschau im App-Test). Gemeldete Punkte
SHALL die Raumansicht als `session:annotation-create` mit dem gewählten Modus, der
gewählten Sichtbarkeit und — nur bei `Zeichnen` — der gewählten Farbe senden; bei Modus
`gerastert` mit den auf Zellmitten eingerasteten Punkten. Der angezeigte Bestand MUST NOT
lokal geändert werden, bevor der Server `session:annotations` verteilt hat
(`constitution.md` §9.1). `Entfernen` SHALL `session:annotation-delete` mit dem Ziel
`eine`, `Meine entfernen` mit dem Ziel `meine` und `Alle geteilten entfernen` mit dem Ziel
`geteilte` senden. Eine Ablehnung des Servers (`{ ok: false, message }`) SHALL als Meldung
sichtbar sein.

#### Scenario: Raumansicht übergibt Bestand und Optionen an die Kartenansicht

- **GIVEN** die Anwendung hat den Raum `s1` betreten, und das Acknowledgement nennt `role:
  "spieler"`, eine aktive Karte mit Bild und Raster `quadrat`, 70, 0, 0 sowie
  `annotations` mit genau einer geteilten Strecke `a1` von `sam`
- **WHEN** die Raumansicht gerendert wird
- **THEN** erzeugt die Anwendung die Kartenansicht mit `annotations` gleich genau `a1`,
  `annotationOptions` gleich `{ mode: "gerastert", color: "rot", unit: "meter" }` und dem
  Werkzeug `schwenken`

#### Scenario: Spieler sieht das Panel

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spieler"` und eine aktive Karte
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie das Panel `Messen & Zeichnen` mit der Werkzeugwahl `Bewegen`
  ausgewählt und `Strecke`, `Kreis`, `Winkel`, `Zeichnen` nicht ausgewählt, der Moduswahl
  `Gerastert` ausgewählt und beide Modi deaktiviert, der Sichtbarkeitswahl `Privat`
  ausgewählt, der Farbwahl `Rot` ausgewählt und alle Farben deaktiviert, der Einheitenwahl
  `Meter` ausgewählt, der Schaltfläche `Meine entfernen` und keiner Schaltfläche `Alle
  geteilten entfernen`

#### Scenario: Spielleiter sieht zusätzlich die Sammelaktion für geteilte

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `role:
  "spielleiter"` und eine aktive Karte
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie die Schaltflächen `Meine entfernen` und `Alle geteilten entfernen`

#### Scenario: Ohne aktive Karte kein Panel

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt `map: null`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie weder eine Werkzeugwahl `Strecke` noch eine Schaltfläche `Meine
  entfernen`

#### Scenario: Werkzeugwahl erreicht die Kartenansicht

- **GIVEN** die Raumansicht eines Spielers zeigt das Panel mit der Kartenansicht
- **WHEN** er das Werkzeug `Strecke` wählt
- **THEN** übergibt die Anwendung der Kartenansicht per `setTool` das Werkzeug `strecke`,
  `Strecke` ist ausgewählt, `Bewegen` nicht, die Moduswahl ist aktiviert und die Farbwahl
  deaktiviert

#### Scenario: Mess- und Fog-Werkzeug teilen sich den Zustand

- **GIVEN** die Raumansicht des Spielleiters zeigt die Fog-Verwaltung und das Panel `Messen
  & Zeichnen` mit der Kartenansicht
- **WHEN** er in der Fog-Verwaltung `Aufdecken` wählt, danach im Panel `Strecke`, und
  danach in der Fog-Verwaltung `Schwenken`
- **THEN** hat die Anwendung der Kartenansicht per `setTool` nacheinander `aufdecken`,
  `strecke` und `schwenken` übergeben; nach dem zweiten Schritt war `Aufdecken` nicht
  ausgewählt, und nach dem dritten ist `Bewegen` ausgewählt und `Strecke` nicht

#### Scenario: Zeichnen aktiviert die Farbwahl

- **GIVEN** die Raumansicht eines Spielers zeigt das Panel
- **WHEN** er das Werkzeug `Zeichnen` wählt
- **THEN** ist die Farbwahl aktiviert und die Moduswahl deaktiviert, und die Kartenansicht
  hat per `setTool` das Werkzeug `zeichnung` erhalten

#### Scenario: Gemessene Strecke wird gesendet

- **GIVEN** die Raumansicht eines Spielers im Raum `s1` mit gewähltem Werkzeug `Strecke`,
  Modus `Frei` und Sichtbarkeit `Geteilt`
- **WHEN** die Kartenansicht per `onAnnotationDrawn` die Art `strecke` mit den Punkten
  (10, 20) und (160, 120) meldet
- **THEN** sendet die Anwendung `session:annotation-create` mit `{ sessionId: "s1", kind:
  "strecke", mode: "frei", visibility: "geteilt", color: null, points }` mit genau diesen
  zwei Punkten und hat der Kartenansicht keinen geänderten Bestand übergeben, bis
  `session:annotations` eintrifft

#### Scenario: Gerasterte Messung wird eingerastet gesendet

- **GIVEN** die Raumansicht eines Spielers im Raum `s1` mit aktiver Karte (Raster
  `quadrat`, 70, 0, 0), gewähltem Werkzeug `Kreis` und Modus `Gerastert`
- **WHEN** die Kartenansicht per `onAnnotationDrawn` die Art `kreis` mit den Punkten
  (100, 100) und (250, 30) meldet
- **THEN** sendet die Anwendung `session:annotation-create` mit `kind: "kreis"`, `mode:
  "gerastert"` und genau den Punkten (105, 105) und (245, 35)

#### Scenario: Zeichnung wird mit Farbe gesendet

- **GIVEN** die Raumansicht eines Spielers im Raum `s1` mit gewähltem Werkzeug `Zeichnen`
  und Farbe `Blau`
- **WHEN** die Kartenansicht per `onAnnotationDrawn` die Art `zeichnung` mit den Punkten
  (1, 1), (2, 2) und (3, 1) meldet
- **THEN** sendet die Anwendung `session:annotation-create` mit `{ sessionId: "s1", kind:
  "zeichnung", mode: "frei", visibility: "privat", color: "blau", points }` mit genau
  diesen drei Punkten

#### Scenario: Bestand folgt dem Server

- **GIVEN** die Raumansicht eines Spielers im Raum `s1` mit aktiver Karte (Raster
  `quadrat`, 70, 0, 0) ohne Anmerkungen, und die Teilnehmerliste nennt `sam` ohne Alias
- **WHEN** die Anwendung `session:annotations` mit genau einer geteilten Strecke von `sam`
  im Modus `gerastert` mit den Punkten (35, 35) und (245, 35) erhält
- **THEN** übergibt sie der bestehenden Kartenansicht per `setAnnotations` genau diese
  Anmerkung, und die Liste zeigt den Eintrag `Strecke: 3 Felder (4,5 m) · geteilt · sam`

#### Scenario: Liste zeigt Art, Etikett, Sichtbarkeit und Urheber

- **GIVEN** die Anwendung hat den Raum betreten, das Acknowledgement nennt `role:
  "spielleiter"`, eine aktive Karte (Raster `quadrat`, 70, 0, 0), die Teilnehmer `meister`
  (ohne Alias) und `sam` (ohne Alias) und `annotations` in dieser Reihenfolge: eine geteilte
  gerasterte Strecke von `sam` mit (35, 35) und (245, 35); ein privater gerasterter Kreis
  von `meister` mit (35, 35) und (175, 35); ein geteilter freier Winkel von `sam` mit
  (0, 0), (100, 0) und (100, 100); eine private Zeichnung von `meister`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt die Liste in dieser Reihenfolge die Einträge `Strecke: 3 Felder (4,5 m) ·
  geteilt · sam`, `Kreis: r 2 Felder (3 m) · ⌀ 4 Felder (6 m) · privat · meister`,
  `Winkel: 45° · geteilt · sam` und `Zeichnung · privat · meister`

#### Scenario: Entfernen nur wo erlaubt

- **GIVEN** die Anwendung hat den Raum als `sam` betreten, das Acknowledgement nennt `role:
  "spieler"`, eine aktive Karte und `annotations` mit einer geteilten Strecke von `sam` und
  einer geteilten Strecke von `meister`
- **WHEN** die Raumansicht gerendert wird
- **THEN** trägt der Eintrag der Strecke von `sam` eine Schaltfläche `Entfernen`, und der
  Eintrag der Strecke von `meister` trägt keine

#### Scenario: Spielleiter darf fremde geteilte entfernen

- **GIVEN** die Anwendung hat den Raum als `meister` betreten, das Acknowledgement nennt
  `role: "spielleiter"`, eine aktive Karte und `annotations` mit einer geteilten Strecke
  von `sam`
- **WHEN** die Raumansicht gerendert wird
- **THEN** trägt der Eintrag dieser Strecke eine Schaltfläche `Entfernen`

#### Scenario: Entfernen sendet die Absicht

- **GIVEN** die Raumansicht von `sam` im Raum `s1` zeigt den Eintrag seiner geteilten
  Strecke `a1` mit der Schaltfläche `Entfernen`
- **WHEN** er `Entfernen` in diesem Eintrag betätigt
- **THEN** sendet die Anwendung `session:annotation-delete` mit `{ sessionId: "s1", target:
  { kind: "eine", annotationId: "a1" } }` und zeigt den Eintrag weiterhin, bis
  `session:annotations` eintrifft

#### Scenario: Sammelaktionen senden die Absicht

- **GIVEN** die Raumansicht des Spielleiters im Raum `s1` zeigt das Panel
- **WHEN** er `Meine entfernen` und danach `Alle geteilten entfernen` betätigt
- **THEN** hat die Anwendung `session:annotation-delete` erst mit `{ sessionId: "s1",
  target: { kind: "meine" } }` und dann mit `{ sessionId: "s1", target: { kind:
  "geteilte" } }` gesendet

#### Scenario: Einheit umschalten wirkt sofort und wird gemerkt

- **GIVEN** die Raumansicht eines Spielers zeigt den Eintrag `Strecke: 3 Felder (4,5 m) ·
  geteilt · sam`
- **WHEN** er die Einheit `Fuß` wählt
- **THEN** zeigt die Liste den Eintrag `Strecke: 3 Felder (15 ft) · geteilt · sam`, die
  Anwendung hat der Kartenansicht per `setAnnotationOptions` `{ mode: "gerastert", color:
  "rot", unit: "fuss" }` übergeben, und im Browserspeicher steht unter `vtt.distanceUnit`
  der Wert `fuss`

#### Scenario: Einheit wird aus dem Browser übernommen

- **GIVEN** im Browserspeicher steht unter `vtt.distanceUnit` der Wert `fuss`, und die
  Anwendung hat den Raum mit aktiver Karte betreten
- **WHEN** die Raumansicht gerendert wird
- **THEN** ist `Fuß` ausgewählt, und die Kartenansicht wurde mit `annotationOptions.unit`
  gleich `fuss` erzeugt

#### Scenario: Abgelehntes Anlegen wird angezeigt

- **GIVEN** die Raumansicht eines Spielers mit gewähltem Werkzeug `Strecke`
- **WHEN** die Kartenansicht per `onAnnotationDrawn` eine Strecke meldet und das
  Acknowledgement `{ ok: false, message: "Keine Karte aktiv." }` lautet
- **THEN** zeigt die Anwendung die Meldung `Keine Karte aktiv.` an, und der Bestand ist
  unverändert
