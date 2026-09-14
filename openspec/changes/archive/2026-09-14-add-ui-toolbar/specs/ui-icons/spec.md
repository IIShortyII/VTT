## MODIFIED Requirements

### Requirement: Registry

Die Registry SHALL genau die Registry-Namen in der genannten Reihenfolge enthalten, und die
Icon-Komponente SHALL für jeden Namen genau ein `<svg>`-Element mit `width="1em"` und
`height="1em"` rendern. Ein Name außerhalb der Registry MUST NOT als `IconName` typisierbar
sein.

#### Scenario: Jeder Registry-Name rendert ein SVG

- **GIVEN** jeder Name aus `ICON_NAMES`
- **WHEN** `<Icon name>` mit diesem Namen gerendert wird
- **THEN** enthält das Ergebnis genau ein `<svg>`-Element mit `width` `1em` und `height`
  `1em`

#### Scenario: Registry enthält die festgelegten Namen

- **GIVEN** die Registry
- **WHEN** `ICON_NAMES` und die Schlüssel von `ICON_REGISTRY` gelesen werden
- **THEN** ist `ICON_NAMES` genau die Liste der 60 Registry-Namen in der genannten
  Reihenfolge (Oberfläche: `add`, `angle`, `area`, `back`, `ban`, `check`, `chevronDown`,
  `circle`, `close`, `copy`, `delete`, `draw`, `edit`, `end`, `fog`, `help`, `hide`, `info`,
  `library`, `locate`, `lock`, `logout`, `map`, `measure`, `more`, `move`, `pause`, `players`,
  `reveal`, `settings`, `start`, `token`, `upload`, `user`, `warning`; danach die zehn Namen
  des Symbolkatalogs und die fünfzehn des Zustandskatalogs unverändert), und `ICON_REGISTRY`
  hat genau diese Schlüssel
