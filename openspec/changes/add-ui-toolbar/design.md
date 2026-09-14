## Context

Vorhanden (Stand `main`, #94):

- `FogPanel.tsx` ist ein `<fieldset class="panel">` mit `<legend>Fog of War</legend>`. Die
  Werkzeugwahl sind vier Radios (`name="fog-tool"`, Werte `schwenken`/`aufdecken`/`verdecken`/
  `bereich`) mit sichtbaren Labels über `TOOL_LABELS`. Es folgen die Buttons `Alles aufdecken`/
  `Alles verdecken`, das Formular `Bereichsname` (`<label for="fog-panel-area-name">`) +
  `Bereich speichern` (deaktiviert bei leerer Auswahl), `<p>Auswahl: {n} Zellen</p>`, `Auswahl
  leeren`, dann der Leerzustand von `ui-status` oder eine `<ul>` je Bereich mit `<span>`,
  Checkbox `aria-label="{name} aufgedeckt"` und Button `{name} löschen`.
- `AnnotationPanel.tsx` ist ein `<fieldset class="panel">` mit `<legend>Messen &
  Zeichnen</legend>`. Fünf Werkzeug-Radios (`name="annotation-tool"`, Werte `schwenken` plus
  `strecke`/`kreis`/`winkel`/`zeichnung`, Labels `Bewegen`/`Strecke`/`Kreis`/`Winkel`/
  `Zeichnen`); Radios für Modus (`Gerastert`/`Frei`, deaktiviert außer bei Mess-Werkzeugen),
  Sichtbarkeit (`Privat`/`Geteilt`), Farbe (sechs, deaktiviert außer bei `Zeichnen`), Einheit
  (`Meter`/`Fuß`). Danach der Leerzustand oder eine `<ul>` je Anmerkung mit `<span>` aus
  `entryText(...)` und — wo erlaubt — einem Button `Entfernen`; darunter `Meine entfernen` und
  (Spielleiter) `Alle geteilten entfernen`.
- `entryText` (in `AnnotationPanel.tsx`) baut `<Art>: <Etikett> · <Sichtbarkeit> · <Urheber>`
  bzw. `Zeichnung · <Sichtbarkeit> · <Urheber>`. `<Etikett>` kommt aus `annotationLabel`
  (`shared/annotation.ts`), das auch `canvas.ts` auf der Karte zeichnet.
- `ui/Icon.tsx`: `IconButton({ name, label, ...rest })` rendert `<button type="button"
  aria-label={label}>` mit einzigem Kind `<Icon name label>`; `rest` (z. B. `title`,
  `aria-pressed`, `onClick`, `className`) wird durchgereicht. `ui/icons.ts` trägt 56 Namen
  (inkl. `locate` aus dem gemergten #95).
- `ui/menu.tsx`: `useFloating()`, `MenuTrigger`, `ActionMenu`, `ActionMenuButton({ label,
  entries, variant, icon, className })` (Trigger `⋮` mit `variant="more"` als Standard +
  eigener Schwebezustand). `MenuEntry = { id, label, icon?, onSelect }`. `menu.rowActions`
  liefert `Aktionen für {name}`.
- `ui/locale.ts`: `useT()` → `t(key, params?)`. `de.ts` definiert die Schlüsselmenge; `en.ts`
  ist dagegen typisiert. Bestehende Leerzustände nutzen `t('empty.fogAreas.*')`,
  `t('empty.annotations.*')`.
- `SessionRoom.tsx` hält **einen** Werkzeugzustand `tool: CanvasTool` (Start `schwenken`) und
  reicht `setTool` an beide Panels; Modus/Sichtbarkeit/Farbe/Einheit sind ebenfalls Zustand
  der Raumansicht.
- `theme.css` (`ui-theme`): `--gold`, `--space-*`, `.panel`, generisches `button`; `[hidden]`
  global.

## Goals / Non-Goals

- **Ziel:** jede Werkzeugwahl eine barrierefreie Icon-Leiste; Tastenkürzel im Bereich;
  Auswahlzähler als Live-Region; Modifikatoren als Chips; Zeilenaktionen über ⋮; sichtbare
  Bedien-Texte über `t()`.
- **Nicht-Ziel:** Aussehen (Gold, ≥ 44 px, Swatch-Farben) wird nicht per Test abgenommen,
  sondern im App-Test (`constitution.md` §3.4). Der gemeinsame Werkzeugzustand, die
  Canvas-Fassade, die gesendeten Ereignisse und `annotationLabel`/„Messgeometrie" bleiben
  unverändert.

## Decisions

### D1 `ui/toolbar.tsx` — `Toolbar`

```ts
export interface ToolbarTool { id: string; icon: IconName; label: string; shortcut?: string }
export interface ToolbarProps { label: string; tools: ToolbarTool[]; active: string; onSelect(id: string): void }
```

- Wurzel `<div role="toolbar" aria-label={label} className="toolbar" onKeyDown={…}>`.
- Je Werkzeug ein `IconButton` mit `name={icon}`, `label={label}`,
  `aria-pressed={id === active}`, `title={shortcut ? `${label} (${shortcut})` : label}`,
  `className={id === active ? 'tool-button tool-button--active' : 'tool-button'}`,
  `onClick={() => onSelect(id)}`. (Der zugängliche Name bleibt `label`; `title` trägt das
  Kürzel zusätzlich.)
- **Tastenkürzel (bereichsweit):** `onKeyDown` an der Wurzel. Ist `event.target` ein
  Formularfeld (`input`/`select`/`textarea`), passiert nichts. Sonst wird das Werkzeug
  gesucht, dessen `shortcut` (case-insensitive) gleich `event.key` ist; gibt es eines, ruft
  der Handler `event.preventDefault()` und `onSelect(id)`. Kein `document`-Listener — nur
  Tasten, während der Fokus in dieser Toolbar liegt.

### D2 `ui/toolbar.tsx` — `ChipGroup`

```ts
export interface ChipOption { id: string; label: string }
export interface ChipGroupProps { label: string; options: ChipOption[]; value: string; onSelect(id: string): void; disabled?: boolean }
```

- Wurzel `<div role="group" aria-label={label} className="chip-group">`.
- Je Option `<button type="button" aria-pressed={id === value} disabled={disabled}
  className={id === value ? 'chip chip--active' : 'chip'} onClick={() => onSelect(id)}>{label}</button>`.
  (Sichtbarer Text = zugänglicher Name = `label`.)

### D3 `ui/toolbar.tsx` — `ColorChipGroup`

```ts
export interface ColorChip { id: string; label: string }
export interface ColorChipGroupProps { label: string; colors: ColorChip[]; value: string; onSelect(id: string): void; disabled?: boolean }
```

- Wurzel `<div role="group" aria-label={label} className="chip-group">`.
- Je Farbe `<button type="button" aria-label={label} aria-pressed={id === value}
  disabled={disabled} className={`color-chip color-chip--${id}` + (id === value ? ' color-chip--active' : '')}
  onClick={() => onSelect(id)}>` mit einzigem Kind `<span className="color-chip-swatch" aria-hidden="true" />`.
  Der zugängliche Name ist der Farbname (`label`), die Farbe kommt aus der CSS-Klasse.

### D4 `FogPanel.tsx`

- Wurzel bleibt `<fieldset class="panel">` / `<legend>{t('fog.legend')}</legend>` (`Fog of War`).
- Werkzeugwahl = `<Toolbar label={t('fog.toolbar')} active={tool} onSelect={onToolChange}
  tools={[…]} />` mit
  `{ id: 'schwenken', icon: 'move', label: t('tool.pan') }`,
  `{ id: 'aufdecken', icon: 'reveal', label: t('fog.tool.reveal'), shortcut: 'R' }`,
  `{ id: 'verdecken', icon: 'hide', label: t('fog.tool.hide'), shortcut: 'H' }`,
  `{ id: 'bereich', icon: 'area', label: t('fog.tool.area') }`.
- Buttons `Alles aufdecken`/`Alles verdecken` über `t('fog.revealAll')`/`t('fog.hideAll')`
  (Text unverändert). Formular `Bereichsname` (`t('fog.areaName')`) + `Bereich speichern`
  (`t('fog.saveArea')`, deaktiviert bei `selectionCount === 0`).
- Zähler: `<p role="status">{t('fog.selectionCount', { count: selectionCount })}</p>`,
  Text de `{count} Zellen markiert`.
- Bereichsliste `<ul>`: je `<li>` `<span>{area.name}</span>`, dann Inline-Umschalter
  `<button type="button" aria-pressed={area.revealed} aria-label={t('fog.areaRevealed', {
  name: area.name })} className={area.revealed ? 'chip chip--active' : 'chip'} onClick={() =>
  onAreaToggle(area.id, !area.revealed)}>` (zugänglicher Name `{name} aufgedeckt`, sichtbarer
  Text = z. B. das `reveal`/`hide`-Icon oder der Name — Text im App-Test), dann
  `<ActionMenuButton label={t('menu.rowActions', { name: area.name })} entries={[{ id:
  'delete', label: t('menu.delete'), icon: 'delete', onSelect: () => onAreaDelete(area.id) }]} />`.
  Leerzustand unverändert (`t('empty.fogAreas.*')`).

### D5 `AnnotationPanel.tsx`

- Wurzel bleibt `<fieldset class="panel">` / `<legend>{t('annotation.legend')}</legend>`
  (`Messen & Zeichnen`).
- Werkzeugwahl = `<Toolbar label={t('annotation.toolbar')} active={tool} onSelect={onToolChange}
  tools={[…]} />` mit
  `{ id: 'schwenken', icon: 'move', label: t('tool.move'), shortcut: 'V' }` (`Bewegen`),
  `{ id: 'strecke', icon: 'measure', label: t('annotation.tool.line'), shortcut: 'M' }`,
  `{ id: 'kreis', icon: 'circle', label: t('annotation.tool.circle') }`,
  `{ id: 'winkel', icon: 'angle', label: t('annotation.tool.angle') }`,
  `{ id: 'zeichnung', icon: 'draw', label: t('annotation.tool.draw'), shortcut: 'D' }`.
- Modus `<ChipGroup label={t('annotation.mode')} value={mode} onSelect={onModeChange}
  disabled={modeDisabled} options={[{ id: 'gerastert', label: t('annotation.mode.grid') }, {
  id: 'frei', label: t('annotation.mode.free') }]} />` (`modeDisabled` wie heute: nur bei
  `strecke`/`kreis`/`winkel` aktiv).
- Sichtbarkeit `<ChipGroup label={t('annotation.visibility')} …>` (`Privat`/`Geteilt`), nie
  deaktiviert.
- Farbe `<ColorChipGroup label={t('annotation.color')} value={color} onSelect={onColorChange}
  disabled={colorDisabled} colors={ANNOTATION_COLORS.map(c => ({ id: c, label:
  t(`annotation.color.${c}`) }))} />` (`colorDisabled` wie heute: nur bei `zeichnung` aktiv).
- Einheit `<ChipGroup label={t('annotation.unit')} …>` (`Meter`/`Fuß`), nie deaktiviert.
- Anmerkungsliste `<ul>`: je `<li>` `<span>{entryText(...)}</span>` und — genau dann, wenn
  `canDeleteAnnotation(annotation, viewer)` — `<ActionMenuButton label={t('menu.rowActions',
  { name: entryText(...) })} entries={[{ id: 'delete', label: t('annotation.remove'), icon:
  'delete', onSelect: () => onDelete({ kind: 'eine', annotationId: annotation.id }) }]} />`.
  Der zugängliche Name des ⋮-Triggers ist `Aktionen für <Eintragstext>`.
- `Meine entfernen` (`t('annotation.removeMine')`) und `Alle geteilten entfernen`
  (`t('annotation.removeShared')`, nur Spielleiter) bleiben Schaltflächen.
- `entryText`: die Chrome-Wörter über `t()` — Art-Präfix `t('annotation.kind.strecke|kreis|
  winkel|zeichnung')`, Sichtbarkeit `t('annotation.visibility.privat|geteilt')` (die Wörter
  `privat`/`geteilt` im Eintrag), Urheber-Fallback `t('annotation.unknownAuthor')`
  (`unbekannt`). Das Mess-Etikett bleibt `annotationLabel(...)` unverändert, ebenso die
  Trennzeichen ` · `.

### D6 Wörterbücher (`de.ts`/`en.ts`)

Neue Schlüssel (de → en), Gruppe `tool.*`/`fog.*`/`annotation.*`/`menu.delete` nach den
bestehenden Fog-/Anmerkungs-Schlüsseln. Buchstabengleich zur bisherigen Oberfläche unter
Deutsch:

| Schlüssel | de | en |
|---|---|---|
| `tool.pan` | `Schwenken` | `Pan` |
| `tool.move` | `Bewegen` | `Move` |
| `fog.legend` | `Fog of War` | `Fog of War` |
| `fog.toolbar` | `Nebelwerkzeug` | `Fog tool` |
| `fog.tool.reveal` | `Aufdecken` | `Reveal` |
| `fog.tool.hide` | `Verdecken` | `Hide` |
| `fog.tool.area` | `Bereich markieren` | `Mark area` |
| `fog.revealAll` | `Alles aufdecken` | `Reveal all` |
| `fog.hideAll` | `Alles verdecken` | `Hide all` |
| `fog.areaName` | `Bereichsname` | `Area name` |
| `fog.saveArea` | `Bereich speichern` | `Save area` |
| `fog.selectionCount` | `{count} Zellen markiert` | `{count} cells marked` |
| `fog.areaRevealed` | `{name} aufgedeckt` | `{name} revealed` |
| `annotation.legend` | `Messen & Zeichnen` | `Measure & Draw` |
| `annotation.toolbar` | `Anmerkungswerkzeug` | `Annotation tool` |
| `annotation.tool.line` | `Strecke` | `Line` |
| `annotation.tool.circle` | `Kreis` | `Circle` |
| `annotation.tool.angle` | `Winkel` | `Angle` |
| `annotation.tool.draw` | `Zeichnen` | `Draw` |
| `annotation.mode` | `Modus` | `Mode` |
| `annotation.mode.grid` | `Gerastert` | `Snapped` |
| `annotation.mode.free` | `Frei` | `Free` |
| `annotation.visibility` | `Sichtbarkeit` | `Visibility` |
| `annotation.visibility.privat` | `Privat` | `Private` |
| `annotation.visibility.geteilt` | `Geteilt` | `Shared` |
| `annotation.color` | `Farbe` | `Color` |
| `annotation.color.rot` | `Rot` | `Red` |
| `annotation.color.orange` | `Orange` | `Orange` |
| `annotation.color.gelb` | `Gelb` | `Yellow` |
| `annotation.color.gruen` | `Grün` | `Green` |
| `annotation.color.blau` | `Blau` | `Blue` |
| `annotation.color.weiss` | `Weiß` | `White` |
| `annotation.unit` | `Einheit` | `Unit` |
| `annotation.unit.meter` | `Meter` | `Meters` |
| `annotation.unit.fuss` | `Fuß` | `Feet` |
| `annotation.remove` | `Entfernen` | `Remove` |
| `annotation.removeMine` | `Meine entfernen` | `Remove mine` |
| `annotation.removeShared` | `Alle geteilten entfernen` | `Remove all shared` |
| `annotation.kind.strecke` | `Strecke` | `Line` |
| `annotation.kind.kreis` | `Kreis` | `Circle` |
| `annotation.kind.winkel` | `Winkel` | `Angle` |
| `annotation.kind.zeichnung` | `Zeichnung` | `Drawing` |
| `annotation.unknownAuthor` | `unbekannt` | `unknown` |
| `menu.delete` | `Löschen` | `Delete` |

Die im Eintrag verwendeten Sichtbarkeitswörter (`privat`/`geteilt`, klein) kommen aus
`annotation.visibility.privat`/`geteilt` — dieselben Schlüssel liefern in der Chip-Gruppe die
groß geschriebenen Chip-Beschriftungen. **Entscheidung:** getrennte Schlüssel für Chip-Label
(`Privat`) und Eintrags-Wort (`privat`): `annotation.visibility.privat` = `Privat` für den
Chip, `annotation.entryVisibility.privat` = `privat`/`geteilt` für den Eintrag. Analog liefert
`annotation.kind.*` die Groß-Variante für das Art-Präfix des Eintrags (`Strecke:`), die
zugleich Werkzeug- und Chip-fremd ist.

### D7 Stylesheet (`theme.css`)

Neuer Abschnitt „Werkzeugleisten (ui-toolbar, #96)" vor dem Bewegungsblock: `.toolbar`
(Flex-Reihe, Lücke), `.tool-button`/`.chip`/`.color-chip` (Basis), `.tool-button--active`/
`.chip--active`/`.color-chip--active` (Gold über `var(--gold)`), `.color-chip--rot|orange|gelb|
gruen|blau|weiss .color-chip-swatch` (Farbwerte), `.chip-group` (Flex-Reihe). Ein einziges
`@media (pointer: coarse)` setzt `min-block-size`/`min-inline-size: 2.75rem` auf
`.tool-button`. Kein Farbwert außerhalb `:root` (nur `var(--…)` bzw. definierte Swatch-Werte),
keine `animation`/`transition` außerhalb des Bewegungsblocks.

## Risks

- **Icon-Glyphe:** `move`→`Move`, `area`→`BoxSelect`, `circle`→`Circle`, `winkel`→`Angle` sind
  in `lucide-react` 1.45.0 vorhanden (geprüft). Die konkrete Eignung der Glyphe beurteilt der
  App-Test (Präzedenz `dragon`→`Worm`).
- **Gemeinsamer Werkzeugzustand:** dieselbe `tool`-Variable speist beide Toolbars. Deshalb sind
  Kürzel bereichsweit (Handler an der Toolbar, kein `document`-Listener) — `R` in der
  Fog-Leiste und `V` in der Anmerkungsleiste stören sich nicht.
- **#95 ist gemergt:** der Worktree-Basisstand (`origin/main`, bff1269) trägt `locate`
  (56 Namen); die Namensliste in `ui-icons` steht auf 60 (inkl. `locate` zwischen `library`
  und `lock`).

## Testaufbau

- Werkzeugbuttons werden über `getByRole('button', { name: '<Label>' })` gefunden und ihr
  `aria-pressed` geprüft; Kürzel über `title`. Tastenkürzel: `fireEvent.keyDown` auf einem
  Toolbar-Button (Fokus im Bereich).
- Chips über `getByRole('button', { name: '<Label>' })`, `aria-pressed`/`disabled`.
- Zeilenaktionen: ⋮-Trigger über `getByRole('button', { name: 'Aktionen für <…>' })`, öffnen,
  dann `getByRole('menuitem', { name: 'Löschen' | 'Entfernen' })`.
- Zähler über `getByRole('status')` bzw. Text `<n> Zellen markiert`.
