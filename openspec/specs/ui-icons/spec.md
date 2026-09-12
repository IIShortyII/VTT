# ui-icons Specification

## Purpose

Ein Icon-System für den Client: eine feste, semantische Registry von Icon-Namen (Rollen wie
`delete`, `reveal`, `fighter`, `poisoned` — keine Bildbeschreibungen), eine
`<Icon name>`-Komponente, die jeden Namen als skalierbares SVG in `currentColor` rendert,
und eine Icon-only-Schaltfläche mit zugänglichem Namen. Die beiden bisherigen
Emoji-Kataloge des Clients (Symbolkatalog der Tokens, 5e-Zustandskatalog) referenzieren
Registry-Namen statt Emoji; das Rendering hängt damit nicht mehr vom System-Font ab, und
jedes Icon trägt eine eigene `aria`-Semantik. Aussehen nimmt der menschliche App-Test ab
(`constitution.md` §3.4).

## Begriffe

- **Registry**: das Modul `src/client/ui/icons.ts` mit der Konstante `ICON_NAMES` (Tupel
  aller Namen, `as const`), dem Typ `IconName` und der Tabelle `ICON_REGISTRY`
  (`Record<IconName, LucideIcon>`), die jeden Namen auf eine Komponente aus `lucide-react`
  abbildet.
- **Registry-Namen** (genau diese 54, in dieser Reihenfolge):
  - Oberfläche: `add`, `back`, `ban`, `check`, `chevronDown`, `close`, `delete`, `draw`,
    `edit`, `end`, `fog`, `help`, `hide`, `info`, `library`, `lock`, `logout`, `map`,
    `measure`, `more`, `pause`, `players`, `reveal`, `settings`, `start`, `token`,
    `upload`, `user`, `warning`
  - Symbolkatalog: `fighter`, `guardian`, `undead`, `dragon`, `mage`, `archer`, `royal`,
    `beast`, `vermin`, `fire`
  - Zustandskatalog: `blinded`, `charmed`, `deafened`, `exhausted`, `frightened`,
    `grappled`, `incapacitated`, `invisible`, `paralyzed`, `petrified`, `poisoned`, `prone`,
    `restrained`, `stunned`, `unconscious`
- **Icon-Komponente**: `Icon` aus `src/client/ui/Icon.tsx` mit den Props `name: IconName`
  und optional `label: string`. Sie rendert genau ein `<svg>` mit `width="1em"`,
  `height="1em"`, der Klasse `icon` und Strichfarbe `currentColor`. Ohne `label` trägt das
  `<svg>` `aria-hidden="true"` und weder `role` noch `aria-label` (**dekoratives Icon**,
  neben Text); mit `label` trägt es `role="img"` und `aria-label` gleich `label`
  (**benanntes Icon**).
- **Icon-only-Schaltfläche**: `IconButton` aus `src/client/ui/Icon.tsx` mit den Props
  `name: IconName`, `label: string` und den übrigen Attributen eines `<button>`. Sie
  rendert ein `<button type="button">` mit `aria-label` gleich `label` und der Klasse
  `icon-button`, dessen einziger Inhalt ein benanntes Icon mit demselben `label` ist.
- **Symbolkatalog**: `TOKEN_ICONS` in `src/shared/token.ts` — genau `['fighter',
  'guardian', 'undead', 'dragon', 'mage', 'archer', 'royal', 'beast', 'vermin', 'fire']`;
  `TokenIconSchema` ist `z.enum(TOKEN_ICONS)`. Beschriftungen der Einträge im Client
  (`TOKEN_ICON_LABELS` in `src/client/session/token-icons.ts`): `Kämpfer`, `Wächter`,
  `Untoter`, `Drache`, `Magier`, `Schütze`, `Adel`, `Bestie`, `Ungeziefer`, `Feuer`.
- **Zustandskatalog**: `CONDITION_CATALOG` in `src/client/session/conditions.ts` — 15
  Einträge `{ label, icon }` in dieser Reihenfolge: `Blind`/`blinded`,
  `Bezaubert`/`charmed`, `Taub`/`deafened`, `Erschöpft`/`exhausted`,
  `Verängstigt`/`frightened`, `Gepackt`/`grappled`, `Kampfunfähig`/`incapacitated`,
  `Unsichtbar`/`invisible`, `Gelähmt`/`paralyzed`, `Versteinert`/`petrified`,
  `Vergiftet`/`poisoned`, `Liegend`/`prone`, `Festgehalten`/`restrained`,
  `Betäubt`/`stunned`, `Bewusstlos`/`unconscious`. Kein Eintrag trägt ein Feld `symbol`.
- **Stylesheet**: `src/client/app/theme.css` (`ui-theme`), als Text gelesen; die
  Icon-Selektoren sind `.icon` und `.icon-button`. Ein Selektor ist **vorhanden**, wenn das
  Stylesheet nach Normalisierung (`\s+` → ein Leerzeichen, Kommentare entfernt) die
  Zeichenfolge `<selektor> {` enthält.

## Requirements

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
- **THEN** ist `ICON_NAMES` genau die Liste der 54 Registry-Namen in der genannten
  Reihenfolge, und `ICON_REGISTRY` hat genau diese Schlüssel

### Requirement: Zugänglichkeit der Icons

Ein Icon neben Text SHALL dekorativ sein (`aria-hidden="true"`, kein `role`, kein
`aria-label`). Ein Icon, das allein steht, SHALL benannt sein (`role="img"`, `aria-label`);
eine Icon-only-Schaltfläche SHALL ein `aria-label` tragen und als einzigen Inhalt ein
benanntes Icon mit demselben Text enthalten. Ein Icon MUST NOT Bedeutung allein über Farbe
tragen — es hat immer Text oder einen zugänglichen Namen an seiner Seite.

#### Scenario: Icon neben Text ist dekorativ

- **GIVEN** `<Icon name="check" />` ohne `label`
- **WHEN** es gerendert wird
- **THEN** trägt das `<svg>` `aria-hidden="true"`, kein `role`-Attribut und kein
  `aria-label`

#### Scenario: Icon-only-Schaltfläche ist benannt

- **GIVEN** `<IconButton name="delete" label="Goblin entfernen" />`
- **WHEN** es gerendert wird
- **THEN** gibt es eine Schaltfläche mit dem zugänglichen Namen `Goblin entfernen`, sie
  trägt die Klasse `icon-button`, ihr einziges Kind ist ein `<svg>` mit `role="img"` und
  `aria-label` `Goblin entfernen`, und sie enthält keinen Textknoten

### Requirement: Kataloge referenzieren die Registry

Der Symbolkatalog und der Zustandskatalog SHALL ausschließlich Registry-Namen referenzieren;
kein Katalog MUST Emoji enthalten. `TokenIconSchema` SHALL genau die Einträge des
Symbolkatalogs akzeptieren.

#### Scenario: Zustandskatalog referenziert bekannte Namen

- **GIVEN** der Zustandskatalog
- **WHEN** jeder Eintrag gegen `ICON_NAMES` geprüft wird
- **THEN** hat der Katalog genau 15 Einträge mit den genannten Beschriftungen in dieser
  Reihenfolge, jeder Eintrag hat ein Feld `icon`, dessen Wert in `ICON_NAMES` enthalten ist
  und dem genannten Namen entspricht, und kein Eintrag hat ein Feld `symbol`

#### Scenario: Symbolkatalog referenziert bekannte Namen

- **GIVEN** der Symbolkatalog und `TokenIconSchema`
- **WHEN** `TOKEN_ICONS` gelesen und `TokenIconSchema` mit `undead` sowie mit `💀` geprüft
  wird
- **THEN** ist `TOKEN_ICONS` genau die Liste der zehn Symbolkatalog-Namen in der genannten
  Reihenfolge, jeder ist in `ICON_NAMES` enthalten, `TokenIconSchema` akzeptiert `undead`
  und lehnt `💀` ab

### Requirement: Stylesheet der Icons

Das Stylesheet SHALL für jeden Icon-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine weiteren `@import`-Zeilen).

#### Scenario: Icon-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Icon-Selektor gesucht wird
- **THEN** sind `.icon` und `.icon-button` vorhanden
