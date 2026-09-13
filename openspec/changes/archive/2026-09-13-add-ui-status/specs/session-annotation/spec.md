## MODIFIED Requirements

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
Anmerkungen in Bestandsreihenfolge (ohne Anmerkungen statt der Liste der Leerzustand von
`ui-status` mit dem Titel `Noch keine Anmerkungen` und dem Hinweis
`Miss eine Strecke oder zeichne auf der Karte.`), je Eintrag Art, Etikett (außer bei Zeichnung),
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

#### Scenario: Ohne Anmerkungen zeigt das Panel den Leerzustand

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, eine aktive Karte und `annotations: []`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt die Gruppe `Messen & Zeichnen` einen Absatz der Klasse `empty-state` mit
  dem Titel `Noch keine Anmerkungen` und dem Hinweis
  `Miss eine Strecke oder zeichne auf der Karte.`, kein Element der Rolle `listitem` und
  weiterhin die Schaltfläche `Meine entfernen`
