## ADDED Requirements

### Requirement: Icon-Markup für die Karte

Die Kartenansicht zeichnet Registry-Icons aus dem SVG-Markup von `iconSvg(name, color)`
(`src/client/ui/icon-svg.ts`). Dieses Markup SHALL in jedem `d`-Attribut jedes Arc-Flag
(Large-Arc-Flag und Sweep-Flag eines Arc-Segments, je genau ein Zeichen `0` oder `1`) durch
einen Trenner (Leerzeichen, Komma oder das Vorzeichen `-` des Folgeparameters) von seinen
beiden Nachbarparametern trennen, unabhängig davon, wie die Icon-Bibliothek die Pfaddaten
serialisiert. Die Normalisierung SHALL die exportierte Funktion
`normalizeArcFlags(d: string): string` leisten: sie fügt an einer Flag-Grenze ohne Trenner
genau ein Leerzeichen ein und MUST NOT sonst ein Zeichen der Pfaddaten verändern.

#### Scenario: Kompakte Arc-Flags werden getrennt

- **GIVEN** die Pfaddaten `M9 16a5 5 0 016 0`, `A2 2 0 0021 5.172`,
  `a1.6 1.6 0 012.277 0` und `a1.5 1.5 0 00-2.474-1.561`
- **WHEN** `normalizeArcFlags` auf jede davon angewandt wird
- **THEN** liefert sie in dieser Reihenfolge `M9 16a5 5 0 0 1 6 0`,
  `A2 2 0 0 0 21 5.172`, `a1.6 1.6 0 0 1 2.277 0` und `a1.5 1.5 0 0 0-2.474-1.561`

#### Scenario: Folgesegmente eines Arc-Befehls werden getrennt

- **GIVEN** die Pfaddaten `a1 1 0 011 1 1 1 0 012 2` (zwei Arc-Segmente, das zweite ohne
  erneuten Befehlsbuchstaben)
- **WHEN** `normalizeArcFlags` darauf angewandt wird
- **THEN** liefert sie `a1 1 0 0 1 1 1 1 1 0 0 1 2 2`

#### Scenario: Getrennte Pfaddaten bleiben unverändert

- **GIVEN** die Pfaddaten `M3 11a10 10 0 0 1 10 10` und
  `M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18`
- **WHEN** `normalizeArcFlags` auf jede davon angewandt wird
- **THEN** liefert sie jede Eingabe zeichengenau unverändert zurück

#### Scenario: Jedes Registry-Icon liefert getrennte Arc-Flags

- **GIVEN** jeder Name aus `ICON_NAMES`
- **WHEN** `iconSvg(name, '#ffffff')` aufgerufen wird und alle `d`-Attribute des Markups
  gelesen werden
- **THEN** hat jedes Markup mindestens ein `d`-Attribut, jeder `d`-Wert ist gleich
  `normalizeArcFlags(<d-Wert>)`, und das Markup von `frightened` enthält die Zeichenfolge
  `d="M9 16a5 5 0 0 1 6 0"`
