## Purpose

Wiederverwendbare Bausteine der Werkzeugbedienung in der Raumansicht: eine barrierefreie
Werkzeugleiste (`role="toolbar"` mit Icon-Buttons, `aria-pressed`, `title` mit Tastenkürzel,
`aria-label`, ≥ 44 px generell), bereichsweite Tastenkürzel, Umschalt-Chips und Farbchips.
`session-fog` und `session-annotation` legen fest, **welche** Werkzeuge und Modifikatoren sie
zeigen; diese Capability legt fest, **wie** sie aussehen und sich bedienen lassen (Muster
`ui-menu`, `ui-form`, `session-tabs`→`ui/tabs.tsx`). Die Bausteine halten nur die lokale
Werkzeug- und Modifikatorwahl, nie verdeckten oder serverautoritativen Zustand
(`constitution.md` §9).

## ADDED Requirements

### Requirement: Werkzeugleiste

Die `Toolbar` SHALL ein Element mit `role="toolbar"` und dem übergebenen zugänglichen Namen
rendern und darin je Werkzeug eine Icon-only-Schaltfläche (`ui-icons`, „Icon-only-
Schaltfläche"): ihr zugänglicher Name ist das Werkzeug-Label; sie trägt `aria-pressed`
(`"true"` genau für das aktive Werkzeug, sonst `"false"`) und ein `title`-Attribut, das dem
Label entspricht — mit ` (<Kürzel>)` angehängt, wenn das Werkzeug ein Tastenkürzel hat. Ein
Klick auf eine Werkzeug-Schaltfläche SHALL das `id` dieses Werkzeugs melden. Die Schaltfläche
des aktiven Werkzeugs SHALL zusätzlich eine Klasse tragen, die sie als aktiv auszeichnet
(Gold-Darstellung im App-Test).

#### Scenario: Aktives Werkzeug trägt aria-pressed true

- **GIVEN** eine `Toolbar` mit den Werkzeugen `pan` (Label `Schwenken`) und `reveal` (Label
  `Aufdecken`, Kürzel `R`) und aktivem Werkzeug `pan`
- **WHEN** die Werkzeugleiste gerendert wird
- **THEN** trägt die Schaltfläche `Schwenken` `aria-pressed="true"` und die Schaltfläche
  `Aufdecken` `aria-pressed="false"`

#### Scenario: Kürzel steht im Titel

- **GIVEN** eine `Toolbar` mit dem Werkzeug `reveal` (Label `Aufdecken`, Kürzel `R`) und einem
  Werkzeug `pan` (Label `Schwenken`, ohne Kürzel)
- **WHEN** die Werkzeugleiste gerendert wird
- **THEN** trägt die Schaltfläche `Aufdecken` das `title` `Aufdecken (R)`, und die
  Schaltfläche `Schwenken` das `title` `Schwenken`

#### Scenario: Klick meldet das Werkzeug

- **GIVEN** eine `Toolbar` mit den Werkzeugen `pan` und `reveal` und aktivem Werkzeug `pan`
- **WHEN** die Schaltfläche `Aufdecken` betätigt wird
- **THEN** meldet die Werkzeugleiste `reveal`

### Requirement: Tastenkürzel der Werkzeugleiste

Die `Toolbar` SHALL Tastenkürzel nur ausführen, während der Fokus in ihr liegt (ein
Tasten-Ereignis an der Werkzeugleiste, kein `document`-Listener). Bei einem Tastendruck, der
kein Formularfeld (`input`, `select`, `textarea`) als Ziel hat und dessen Taste
(schreibungsunabhängig) dem Kürzel eines Werkzeugs entspricht, SHALL sie dieses Werkzeug-`id`
melden; eine Taste ohne passendes Kürzel SHALL nichts melden.

#### Scenario: Kürzel im Bereich wechselt das Werkzeug

- **GIVEN** eine `Toolbar` mit dem Werkzeug `reveal` (Kürzel `R`) und aktivem Werkzeug `pan`,
  und der Fokus liegt auf einer Schaltfläche der Werkzeugleiste
- **WHEN** die Taste `r` gedrückt wird
- **THEN** meldet die Werkzeugleiste `reveal`

#### Scenario: Taste ohne Kürzel meldet nichts

- **GIVEN** eine `Toolbar`, deren Werkzeuge nur die Kürzel `R` und `H` tragen, und der Fokus
  liegt in der Werkzeugleiste
- **WHEN** die Taste `x` gedrückt wird
- **THEN** meldet die Werkzeugleiste nichts

### Requirement: Umschalt-Chips

Die `ChipGroup` SHALL ein Element mit `role="group"` und dem übergebenen zugänglichen Namen
rendern und darin je Option eine Schaltfläche, deren sichtbarer Text und zugänglicher Name das
Options-Label ist und die `aria-pressed` (`"true"` genau für die ausgewählte Option) trägt.
Ist die Gruppe deaktiviert, SHALL jede Schaltfläche `disabled` sein. Ein Klick auf eine nicht
deaktivierte Schaltfläche SHALL das `id` dieser Option melden.

#### Scenario: Ausgewählter Chip trägt aria-pressed true

- **GIVEN** eine `ChipGroup` mit den Optionen `gerastert` (Label `Gerastert`) und `frei`
  (Label `Frei`) und dem Wert `gerastert`
- **WHEN** die Gruppe gerendert wird
- **THEN** trägt die Schaltfläche `Gerastert` `aria-pressed="true"` und die Schaltfläche
  `Frei` `aria-pressed="false"`

#### Scenario: Deaktivierte Gruppe deaktiviert jede Schaltfläche

- **GIVEN** eine `ChipGroup` mit zwei Optionen, deaktiviert
- **WHEN** die Gruppe gerendert wird
- **THEN** ist jede Schaltfläche der Gruppe `disabled`

#### Scenario: Klick auf einen Chip meldet die Option

- **GIVEN** eine `ChipGroup` mit den Optionen `gerastert` und `frei`, dem Wert `gerastert`,
  nicht deaktiviert
- **WHEN** die Schaltfläche `Frei` betätigt wird
- **THEN** meldet die Gruppe `frei`

### Requirement: Farbchips

Die `ColorChipGroup` SHALL ein Element mit `role="group"` und dem übergebenen zugänglichen
Namen rendern und darin je Farbe eine Schaltfläche, deren zugänglicher Name der Farbname ist,
die `aria-pressed` (`"true"` genau für die ausgewählte Farbe) trägt und ein dekoratives
Swatch-Element (`aria-hidden`) mit einer farbabhängigen Klasse enthält. Ist die Gruppe
deaktiviert, SHALL jede Schaltfläche `disabled` sein. Ein Klick auf eine nicht deaktivierte
Schaltfläche SHALL das `id` dieser Farbe melden.

#### Scenario: Ausgewählter Farbchip trägt aria-pressed true

- **GIVEN** eine `ColorChipGroup` mit den Farben `rot` (Label `Rot`) und `blau` (Label `Blau`)
  und dem Wert `rot`
- **WHEN** die Gruppe gerendert wird
- **THEN** trägt die Schaltfläche mit dem zugänglichen Namen `Rot` `aria-pressed="true"` und
  die mit dem Namen `Blau` `aria-pressed="false"`

#### Scenario: Klick auf einen Farbchip meldet die Farbe

- **GIVEN** eine `ColorChipGroup` mit den Farben `rot` und `blau`, dem Wert `rot`, nicht
  deaktiviert
- **WHEN** die Schaltfläche `Blau` betätigt wird
- **THEN** meldet die Gruppe `blau`

#### Scenario: Deaktivierte Farbgruppe deaktiviert jede Schaltfläche

- **GIVEN** eine `ColorChipGroup` mit zwei Farben, deaktiviert
- **WHEN** die Gruppe gerendert wird
- **THEN** ist jede Schaltfläche der Gruppe `disabled`
