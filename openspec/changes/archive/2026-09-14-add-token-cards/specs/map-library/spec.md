## MODIFIED Requirements

### Requirement: Sicht mit Schwenken und Zoomen

Die Kartenansicht SHALL das Bild samt Raster auf einem Canvas zeigen und dem Betrachter
Schwenken durch Ziehen und Zoomen mit dem Mausrad erlauben. Die Sichtmathematik SHALL eine
reine Funktion sein: Zoomen um einen Canvas-Punkt SHALL den Bildpunkt unter diesem Punkt an
Ort und Stelle halten; `scale` SHALL auf den Bereich 0,1 bis 8 begrenzt sein; Schwenken SHALL
`x`/`y` um den Zug verschieben. Zusätzlich SHALL die Sichtmathematik das Zentrieren auf einen
Weltpunkt als reine Funktion `centerOn(view, world, screen)` bereitstellen: die Sicht SHALL so
gesetzt werden, dass `world` in der Mitte des Canvas liegt (`x = screen.width / 2 − world.x ·
scale`, `y = screen.height / 2 − world.y · scale`), bei unveränderter `scale`. Die
Canvas-Fassade SHALL über `MapCanvasHandle.centerOn(cell)` die Sicht auf den Mittelpunkt der
Zelle zentrieren (Zellmittelpunkt aus dem aktuellen Raster, Bühnengröße aus dem Canvas). Die
Sicht ist lokal je Betrachter und wird nicht gespeichert oder übertragen.

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

#### Scenario: Zentrieren rückt den Weltpunkt in die Mitte

- **GIVEN** die Sicht `{ x: 0, y: 0, scale: 2 }` und ein Canvas `{ width: 800, height: 600 }`
- **WHEN** mit `centerOn` auf den Weltpunkt `{ x: 100, y: 50 }` zentriert wird
- **THEN** ist die Sicht `{ x: 200, y: 200, scale: 2 }`, sodass `{ x: 100, y: 50 }` bei
  (400, 300) — der Mitte des Canvas — erscheint
