# ui-menu Specification

## Purpose

Kontextmenüs und Info-Popover des Clients: ein schwebendes Aktionsmenü mit `role="menu"`,
das an einem Trigger oder am Zeiger geöffnet, ins Sichtfenster geklemmt, per Tastatur
bedient und mit Fokusrückgabe geschlossen wird; ein Trigger-Baustein in drei Formen
(⋮, Text mit Chevron, Icon-only); ein nicht modaler Popover mit `role="dialog"` für reine
Information mit einer Aktion. Welche Einträge aktiv sind, entscheidet ausschließlich, was
der Server dem Betrachter gemeldet hat (`constitution.md` §9.3) — das Menü zeigt
Berechtigungen, es leitet keine ab. Aussehen nimmt der menschliche App-Test ab
(`constitution.md` §3.4).

## Begriffe

- **Anker**: ein Punkt `{ x, y }` in Viewport-Koordinaten (`clientX`/`clientY`).
- **Schwebezustand**: das Ergebnis des Hooks `useFloating()` aus `src/client/ui/menu.tsx`
  mit `open` (Wahrheitswert), `anchor` (Anker oder `null`), `triggerRef` (Ref auf die
  Trigger-Schaltfläche), `openAt(anchor)`, `toggle()`, `close()`, `returnFocus()` und
  `onContextMenu(event)`.
- **Rückgabeziel**: das Element, das beim Öffnen den Fokus erhält, sobald Menü oder Popover
  schließen — der Trigger (`triggerRef.current`), falls verbunden, sonst das Element, das beim
  Öffnen den Fokus trug (`document.activeElement`).
- **Eintrag**: ein Objekt `{ id, label, icon?, danger?, disabled?, onSelect }`; **gesperrt**
  ist ein Eintrag mit `disabled` wahr, **gefährlich** einer mit `danger` wahr.
- **Menü**: die Komponente `ActionMenu` (Props `floating`, `label`, `entries`), gerendert
  als `<ul role="menu">` mit `aria-label` gleich `label` und der Klasse `menu`, mit
  `position: fixed` und Inline-Stil `left`/`top` in Pixeln; je Eintrag ein
  `<li role="menuitem">` der Klasse `menu-item` (gefährlich zusätzlich `menu-item--danger`)
  mit Text `label`, davor ein dekoratives Icon aus `ui-icons`, falls `icon` gesetzt ist;
  ein gesperrter Eintrag trägt `aria-disabled="true"`. Ohne `open` rendert das Menü nichts.
- **Aktiver Eintrag**: der Eintrag mit dem Fokus (`document.activeElement`); genau er trägt
  `tabindex="0"`, alle anderen `tabindex="-1"`.
- **Trigger**: die Komponente `MenuTrigger` (Props `floating`, `label`, `variant`
  (`more`, Standard, `text` oder `icon`), `icon`, `haspopup` (`menu`, Standard, oder
  `dialog`), `className`): eine `<button type="button">` mit `aria-haspopup` gleich
  `haspopup`, `aria-expanded` gleich `open` und der Klasse `menu-trigger`. Variante `more`
  ist eine Icon-only-Schaltfläche (`ui-icons`) mit Icon `more` und Namen `label`; Variante
  `icon` eine Icon-only-Schaltfläche mit dem Icon `icon` und Namen `label`; Variante `text`
  zeigt den Text `label` gefolgt von einem dekorativen Icon `chevronDown`, ihr zugänglicher
  Name ist `label`.
- **Menü-Schaltfläche**: die Komponente `ActionMenuButton` (Props `label`, `entries`,
  `variant`, `icon`, `className`): Trigger und Menü mit eigenem Schwebezustand in einem
  Baustein; `label` ist zugleich Name des Triggers und `aria-label` des Menüs.
- **Popover**: die Komponente `Popover` (Props `floating`, `label`, Kinder): ein
  `<div role="dialog">` mit `aria-label` gleich `label`, der Klasse `popover`,
  `tabindex="-1"`, ohne `aria-modal`, mit `position: fixed` und Inline-Stil `left`/`top`;
  ohne `open` rendert er nichts.
- **Geklemmt**: `left` ist das Maximum aus `8` und dem Minimum aus `anchor.x` und
  `window.innerWidth − Breite − 8`; `top` entsprechend mit `anchor.y`, `window.innerHeight`
  und der Höhe — Breite und Höhe aus `getBoundingClientRect()` des Menüs bzw. Popovers nach
  dem Rendern.
- **Formularziel**: ein Ereignisziel, das selbst ein `input`, `select`, `textarea`, `button`
  oder `a` ist oder in einem solchen liegt.
- **Stylesheet**: `src/client/app/theme.css` (`ui-theme`), als Text gelesen; die
  Menü-Selektoren sind `.menu`, `.menu-item`, `.menu-item--danger`, `.menu-trigger` und
  `.popover`. Ein Selektor ist **vorhanden**, wenn das Stylesheet nach Normalisierung
  (`\s+` → ein Leerzeichen, Kommentare entfernt) die Zeichenfolge `<selektor> {` enthält.

## Requirements

### Requirement: Menü-Baustein

Das Menü SHALL bei `open` ein `<ul role="menu">` mit `aria-label` gleich `label` rendern
und je Eintrag ein `<li role="menuitem">` mit dem Text `label`, dem dekorativen Icon (falls
gesetzt), der Klasse `menu-item--danger` bei gefährlichen und `aria-disabled="true"` bei
gesperrten Einträgen. Beim Öffnen SHALL der erste nicht gesperrte Eintrag der aktive Eintrag
sein. Das Menü SHALL geklemmt positioniert sein. Ohne `open` MUST NOT es ein Element mit
der Rolle `menu` rendern.

#### Scenario: Menü rendert Einträge mit Icon, Gefahr und Sperre

- **GIVEN** ein Menü `Aktionen für Goblin` mit den Einträgen `Bearbeiten` (Icon `edit`),
  `Zuweisen…` (gesperrt) und `Entfernen` (gefährlich, Icon `delete`), dessen
  Schwebezustand mit dem Anker `{ x: 40, y: 50 }` geöffnet ist
- **WHEN** das Menü gerendert wird
- **THEN** existiert ein Element der Rolle `menu` mit dem Namen `Aktionen für Goblin` und
  darin genau drei Elemente der Rolle `menuitem` mit den Namen `Bearbeiten`, `Zuweisen…`
  und `Entfernen` in dieser Reihenfolge; `Bearbeiten` enthält ein `<svg aria-hidden="true">`,
  `Zuweisen…` trägt `aria-disabled="true"`, `Entfernen` trägt die Klasse
  `menu-item--danger`, `Bearbeiten` ist der aktive Eintrag mit `tabindex="0"`, und die
  beiden anderen tragen `tabindex="-1"`

#### Scenario: Geschlossenes Menü rendert nichts

- **GIVEN** ein Menü mit drei Einträgen, dessen Schwebezustand nicht geöffnet ist
- **WHEN** es gerendert wird
- **THEN** existiert kein Element der Rolle `menu` und kein Element der Rolle `menuitem`

#### Scenario: Menü nahe am rechten und unteren Rand bleibt im sichtbaren Bereich

- **GIVEN** ein Sichtfenster von 300 × 200 Pixeln (`window.innerWidth`/`innerHeight`), ein
  Menü, dessen `getBoundingClientRect()` 120 × 90 Pixel meldet, und ein Anker `{ x: 250,
  y: 180 }`
- **WHEN** das Menü geöffnet wird
- **THEN** trägt das Element der Rolle `menu` den Inline-Stil `left: 172px` und
  `top: 102px`

#### Scenario: Menü mit Platz bleibt am Anker

- **GIVEN** ein Sichtfenster von 300 × 200 Pixeln, ein Menü mit 120 × 90 Pixeln und ein
  Anker `{ x: 40, y: 50 }`
- **WHEN** das Menü geöffnet wird
- **THEN** trägt das Element der Rolle `menu` den Inline-Stil `left: 40px` und `top: 50px`

### Requirement: Tastaturbedienung des Menüs

Bei offenem Menü SHALL `ArrowDown` den Fokus zum nächsten nicht gesperrten Eintrag bewegen
und nach dem letzten zum ersten springen; `ArrowUp` entsprechend rückwärts; `Home` zum
ersten und `End` zum letzten nicht gesperrten Eintrag. `Enter` und Leertaste SHALL den
aktiven Eintrag auswählen: der Fokus geht zum Rückgabeziel, das Menü schließt, danach wird
`onSelect` des Eintrags aufgerufen — in dieser Reihenfolge, damit ein von `onSelect`
geöffneter Dialog (`ui-dialog`) den Trigger als Auslöser vorfindet. `Escape` und `Tab`
SHALL das Menü schließen und den Fokus zum Rückgabeziel geben, ohne einen Eintrag
auszuwählen; `Tab` MUST NOT dabei seine Standardwirkung entfalten. Ein gesperrter Eintrag
MUST NOT ausgewählt werden können — weder per Tastatur noch per Klick; das Menü bleibt
dabei offen.

#### Scenario: Pfeil abwärts überspringt gesperrte Einträge und wrappt

- **GIVEN** ein offenes Menü mit den Einträgen `Bearbeiten`, `Zuweisen…` (gesperrt) und
  `Entfernen`, `Bearbeiten` ist der aktive Eintrag
- **WHEN** `ArrowDown` zweimal auf dem jeweils aktiven Eintrag ausgelöst wird
- **THEN** war nach dem ersten `ArrowDown` `Entfernen` der aktive Eintrag (nie
  `Zuweisen…`) und nach dem zweiten wieder `Bearbeiten`

#### Scenario: Pfeil aufwärts wrappt zum letzten Eintrag

- **GIVEN** ein offenes Menü mit den Einträgen `Bearbeiten`, `Zuweisen…` (gesperrt) und
  `Entfernen`, `Bearbeiten` ist der aktive Eintrag
- **WHEN** `ArrowUp` auf dem aktiven Eintrag ausgelöst wird
- **THEN** ist `Entfernen` der aktive Eintrag

#### Scenario: Home und End springen an die Ränder

- **GIVEN** ein offenes Menü mit den Einträgen `Bearbeiten`, `Zuweisen…` und `Entfernen`
  (keiner gesperrt), `Zuweisen…` ist der aktive Eintrag
- **WHEN** `End` und danach `Home` auf dem jeweils aktiven Eintrag ausgelöst werden
- **THEN** war nach `End` `Entfernen` der aktive Eintrag und nach `Home` `Bearbeiten`

#### Scenario: Enter wählt den aktiven Eintrag und gibt den Fokus vorher zurück

- **GIVEN** eine Menü-Schaltfläche `Aktionen für Goblin` (Variante `more`) mit einem
  Eintrag `Bearbeiten`, dessen `onSelect` das zu diesem Zeitpunkt fokussierte Element
  festhält, und das Menü ist über den Trigger geöffnet
- **WHEN** `Enter` auf dem aktiven Eintrag `Bearbeiten` ausgelöst wird
- **THEN** wurde `onSelect` genau einmal aufgerufen, das dabei festgehaltene Element ist der
  Trigger, es existiert kein Element der Rolle `menu` mehr, der Trigger trägt
  `aria-expanded="false"` und hat den Fokus

#### Scenario: Leertaste wählt den aktiven Eintrag

- **GIVEN** eine Menü-Schaltfläche mit einem Eintrag `Bearbeiten`, das Menü ist über den
  Trigger geöffnet
- **WHEN** die Leertaste (`key` gleich ` `) auf dem aktiven Eintrag ausgelöst wird
- **THEN** wurde `onSelect` genau einmal aufgerufen, und es existiert kein Element der Rolle
  `menu` mehr

#### Scenario: Escape schließt ohne Auswahl und gibt den Fokus zurück

- **GIVEN** eine Menü-Schaltfläche `Aktionen für Goblin` mit einem Eintrag `Bearbeiten`, das
  Menü ist über den Trigger geöffnet
- **WHEN** `Escape` auf dem aktiven Eintrag ausgelöst wird
- **THEN** wurde `onSelect` nicht aufgerufen, es existiert kein Element der Rolle `menu`,
  und der Trigger hat den Fokus

#### Scenario: Tab schließt ohne Auswahl und gibt den Fokus zurück

- **GIVEN** eine Menü-Schaltfläche `Aktionen für Goblin` mit einem Eintrag `Bearbeiten`, das
  Menü ist über den Trigger geöffnet
- **WHEN** `Tab` auf dem aktiven Eintrag ausgelöst wird
- **THEN** wurde `onSelect` nicht aufgerufen, das Tastaturereignis wurde mit
  `preventDefault` unterdrückt, es existiert kein Element der Rolle `menu`, und der Trigger
  hat den Fokus

#### Scenario: Gesperrter Eintrag lässt sich nicht auswählen

- **GIVEN** ein offenes Menü mit einem gesperrten Eintrag `Zuweisen…`
- **WHEN** auf `Zuweisen…` geklickt und danach `Enter` auf ihm ausgelöst wird
- **THEN** wurde `onSelect` von `Zuweisen…` nicht aufgerufen, und das Element der Rolle
  `menu` existiert weiterhin

### Requirement: Öffnen und Schließen per Zeiger

Ein Klick auf den Trigger SHALL das Menü unter dem Trigger öffnen (Anker: linke untere Ecke
seines `getBoundingClientRect()`) und ein zweiter Klick es schließen; `aria-expanded` SHALL
dem Zustand folgen. Ein Klick auf einen nicht gesperrten Eintrag SHALL ihn auswählen (wie
`Enter`). Ein `mousedown` außerhalb von Menü und Trigger SHALL das Menü schließen und den
Fokus zum Rückgabeziel geben. `onContextMenu` des Schwebezustands SHALL bei einem
`contextmenu`-Ereignis, dessen Ziel kein Formularziel ist, die Standardwirkung unterdrücken
und das Menü am Anker `{ x: clientX, y: clientY }` öffnen; ist das Ziel ein Formularziel,
MUST NOT es die Standardwirkung unterdrücken und MUST NOT das Menü öffnen.

#### Scenario: Trigger öffnet und schließt das Menü

- **GIVEN** eine Menü-Schaltfläche `Aktionen für Goblin` (Variante `more`) mit einem Eintrag
  `Bearbeiten`
- **WHEN** der Trigger angeklickt wird, und danach erneut
- **THEN** trug der Trigger `aria-haspopup="menu"` und zunächst `aria-expanded="false"`;
  nach dem ersten Klick existierte ein Element der Rolle `menu` mit dem Namen
  `Aktionen für Goblin`, der Trigger trug `aria-expanded="true"` und `Bearbeiten` hatte den
  Fokus; nach dem zweiten Klick existiert kein Element der Rolle `menu`, und der Trigger
  trägt `aria-expanded="false"`

#### Scenario: Klick auf einen Eintrag wählt ihn aus

- **GIVEN** eine Menü-Schaltfläche mit einem Eintrag `Bearbeiten`, das Menü ist über den
  Trigger geöffnet
- **WHEN** auf `Bearbeiten` geklickt wird
- **THEN** wurde `onSelect` genau einmal aufgerufen, es existiert kein Element der Rolle
  `menu`, und der Trigger hat den Fokus

#### Scenario: Klick außerhalb schließt das Menü und gibt den Fokus zurück

- **GIVEN** eine Menü-Schaltfläche `Aktionen für Goblin` (Variante `more`) mit einem Eintrag
  `Bearbeiten`, das Menü ist über den Trigger geöffnet
- **WHEN** ein `mousedown` auf `document.body` ausgelöst wird
- **THEN** existiert kein Element der Rolle `menu`, `onSelect` wurde nicht aufgerufen, und
  der Trigger (`aria-expanded="false"`) hat den Fokus

#### Scenario: Rechtsklick auf eine Zeile öffnet das Menü am Zeiger

- **GIVEN** ein Listeneintrag mit dem Text `Goblin`, dessen `contextmenu`-Ereignis an
  `onContextMenu` eines Schwebezustands geht, dazu ein Trigger `Aktionen für Goblin` und ein
  Menü mit dem Eintrag `Bearbeiten` an diesem Schwebezustand
- **WHEN** `contextmenu` mit `clientX` 120 und `clientY` 80 auf dem Text `Goblin` ausgelöst
  wird
- **THEN** wurde die Standardwirkung unterdrückt (`defaultPrevented`), es existiert ein
  Element der Rolle `menu` mit dem Inline-Stil `left: 120px` und `top: 80px`, und
  `Bearbeiten` hat den Fokus

#### Scenario: Rechtsklick auf ein Formularfeld lässt das Browser-Menü zu

- **GIVEN** ein Listeneintrag, dessen `contextmenu`-Ereignis an `onContextMenu` eines
  Schwebezustands geht, mit einem Eingabefeld `Goblin HP` darin und einem Menü an diesem
  Schwebezustand
- **WHEN** `contextmenu` auf dem Eingabefeld `Goblin HP` ausgelöst wird
- **THEN** wurde die Standardwirkung nicht unterdrückt, und es existiert kein Element der
  Rolle `menu`

### Requirement: Trigger-Varianten

Die Variante `text` SHALL den Text `label` und danach genau ein dekoratives Icon
(`<svg aria-hidden="true">`) rendern; ihr zugänglicher Name ist `label`. Die Varianten
`more` und `icon` SHALL Icon-only-Schaltflächen (`ui-icons`) mit dem Namen `label` sein.
Jeder Trigger SHALL die Klasse `menu-trigger` und `aria-haspopup` gleich `haspopup` tragen.

#### Scenario: Text-Trigger zeigt Namen und Chevron

- **GIVEN** eine Menü-Schaltfläche `Gandalf` der Variante `text` mit den Einträgen
  `Passwort ändern` und `Abmelden`
- **WHEN** sie gerendert wird
- **THEN** existiert eine Schaltfläche mit dem Namen `Gandalf`, der Klasse `menu-trigger`
  und `aria-haspopup="menu"`, die den Textknoten `Gandalf` und danach genau ein
  `<svg aria-hidden="true">` enthält; es existiert kein Element der Rolle `menuitem`

#### Scenario: Icon-Trigger ist eine benannte Icon-only-Schaltfläche

- **GIVEN** ein Trigger der Variante `icon` mit Icon `info`, `label` `Sitzungscode
  anzeigen` und `haspopup` `dialog`
- **WHEN** er gerendert wird
- **THEN** existiert eine Schaltfläche mit dem Namen `Sitzungscode anzeigen`, den Klassen
  `icon-button` und `menu-trigger`, `aria-haspopup="dialog"`, deren einziges Kind ein
  `<svg role="img">` mit `aria-label` `Sitzungscode anzeigen` ist

### Requirement: Popover

Der Popover SHALL bei `open` ein `<div role="dialog">` mit `aria-label` gleich `label`,
`tabindex="-1"` und ohne `aria-modal` rendern, geklemmt positioniert, und beim Öffnen den
Fokus auf dieses Element setzen. `Escape` innerhalb des Popovers, ein `mousedown` außerhalb
von Popover und Trigger sowie ein erneuter Klick auf den Trigger SHALL ihn schließen und
den Fokus zum Rückgabeziel geben. Der Popover MUST NOT den Fokus einfangen (kein
Tab-Zyklus) und MUST NOT einen Backdrop rendern.

#### Scenario: Popover öffnet mit Fokus in der Box

- **GIVEN** ein Trigger `Sitzungscode anzeigen` (Variante `icon`, `haspopup` `dialog`) und
  ein Popover `Sitzungscode` mit dem Text `ABC234` und einer Schaltfläche `Kopieren` am
  selben Schwebezustand
- **WHEN** der Trigger angeklickt wird
- **THEN** existiert ein Element der Rolle `dialog` mit dem Namen `Sitzungscode`, das den
  Text `ABC234` und die Schaltfläche `Kopieren` enthält, `tabindex="-1"` trägt, kein
  `aria-modal` trägt und den Fokus hat; der Trigger trägt `aria-expanded="true"`; es
  existiert kein Element der Klasse `modal-backdrop`

#### Scenario: Escape schließt den Popover und gibt den Fokus zurück

- **GIVEN** der Popover `Sitzungscode` ist über den Trigger `Sitzungscode anzeigen` geöffnet
- **WHEN** `Escape` auf dem Element der Rolle `dialog` ausgelöst wird
- **THEN** existiert kein Element der Rolle `dialog`, und der Trigger hat den Fokus

#### Scenario: Klick außerhalb schließt den Popover

- **GIVEN** der Popover `Sitzungscode` ist über den Trigger geöffnet
- **WHEN** ein `mousedown` auf `document.body` ausgelöst wird
- **THEN** existiert kein Element der Rolle `dialog`, und der Trigger hat den Fokus

#### Scenario: Erneuter Klick auf den Trigger schließt den Popover

- **GIVEN** der Popover `Sitzungscode` ist über den Trigger geöffnet
- **WHEN** der Trigger erneut angeklickt wird
- **THEN** existiert kein Element der Rolle `dialog`, und der Trigger trägt
  `aria-expanded="false"`

### Requirement: Stylesheet der Menüs

Das Stylesheet SHALL für jeden Menü-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine `animation`/`transition` außerhalb des
Bewegungsblocks).

#### Scenario: Menü-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Menü-Selektor gesucht wird
- **THEN** ist jeder der fünf Menü-Selektoren vorhanden, das Stylesheet enthält genau eine
  `@media`-Abfrage, und sie ist die Bewegungsabfrage
