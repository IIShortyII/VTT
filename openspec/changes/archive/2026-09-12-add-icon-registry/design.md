## Context

Vorhanden: `TOKEN_ICONS` als Emoji-Tupel mit `TokenIconSchema = z.enum(TOKEN_ICONS)` in
`src/shared/token.ts` (Client und Server teilen den Vertrag; der Server speichert den Wert
in `Token.icon`, `String?`); `CONDITION_CATALOG` mit `{ label, symbol }` und
`conditionSymbol()` in `src/client/session/conditions.ts`; `TokenPanel` mit einem
`<select name="icon">` über die Emoji und einer Markierungsliste, die je Markierung nur
eine Schaltfläche `<Tokenname> Markierung <Markierung> entfernen` zeigt; `canvas.ts`
(einziger `pixi.js`-Import, dynamisch geladen aus `MapCanvas`) zeichnet Symbol und
Markierungen als `Text`. PixiJS 8 kann SVG-Strings als Vektorpfad zeichnen
(`Graphics.svg(string)`, mit `stroke`, `stroke-width`, `stroke-linecap`/`-linejoin`,
`path` inkl. Bögen, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`).
`lucide-react` 1.45 rendert jedes Icon als `<svg viewBox="0 0 24 24" fill="none"
stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
mit Props `size`, `color`, `strokeWidth`, `className` und beliebigen SVG-Attributen.
`theme.css` (`ui-theme`) hat einen per Test geprüften Format-Vertrag (design.md D7 dort).

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten:
`specs/ui-icons/spec.md` und das MODIFIED-Delta zu `session-token`. Bindend und nicht
wiederholt: `constitution.md` §9 — der Server bleibt autoritativ für `icon`
(`TokenIconSchema` an der Grenze), der Client sendet einen Namen als Absicht.

## Goals / Non-Goals

**Goals:**
- **Ein Name, ein Bild, überall gleich.** DOM und Karte zeichnen dieselbe Registry-Form.
- **Kein Emoji mehr im Client** — weder im Vertrag, noch in Katalogen, noch auf der Karte.
- **Zugänglichkeit ist Regel der Komponente**, nicht jeder Aufrufstelle.
- **Adressen für die Tests stehen hier** (D8).
- Keine bestehende Assertion bricht, außer den in proposal.md genannten (MODIFIED).

**Non-Goals:**
- Keine Verwendung der Oberflächen-Icons (`delete`, `edit`, …) außerhalb der
  Markierungsliste — die Registry stellt sie bereit, #86 ff. setzen sie ein.
- Kein eigener Icon-Satz, keine Icon-Fonts, kein Laden von SVG-Dateien zur Laufzeit.
- Keine Änderung an Serverlogik oder Schema.

## Decisions

### D1 — Registry (`src/client/ui/icons.ts`)

```ts
export const ICON_NAMES = [ /* 54 Namen, Reihenfolge wie spec.md „Registry-Namen" */ ] as const
export type IconName = (typeof ICON_NAMES)[number]
export const ICON_REGISTRY: Record<IconName, LucideIcon> = { … }
```

Zuordnung Name → `lucide-react`-Export (verbindlich; `LucideIcon` ist der exportierte
Komponententyp):

| Name | Lucide | Name | Lucide | Name | Lucide |
|---|---|---|---|---|---|
| `add` | `Plus` | `back` | `ChevronLeft` | `ban` | `Ban` |
| `check` | `Check` | `chevronDown` | `ChevronDown` | `close` | `X` |
| `delete` | `Trash2` | `draw` | `Brush` | `edit` | `Pencil` |
| `end` | `Square` | `fog` | `CloudFog` | `help` | `CircleHelp` |
| `hide` | `EyeOff` | `info` | `Info` | `library` | `LibraryBig` |
| `lock` | `Lock` | `logout` | `LogOut` | `map` | `Map` |
| `measure` | `Ruler` | `more` | `Ellipsis` | `pause` | `Pause` |
| `players` | `Users` | `reveal` | `Eye` | `settings` | `Settings` |
| `start` | `Play` | `token` | `CircleDot` | `upload` | `Upload` |
| `user` | `User` | `warning` | `TriangleAlert` | | |
| `fighter` | `Sword` | `guardian` | `Shield` | `undead` | `Skull` |
| `dragon` | `Snake` | `mage` | `WandSparkles` | `archer` | `BowArrow` |
| `royal` | `Crown` | `beast` | `PawPrint` | `vermin` | `Bug` |
| `fire` | `Flame` | | | | |
| `blinded` | `EyeOff` | `charmed` | `Heart` | `deafened` | `EarOff` |
| `exhausted` | `BatteryLow` | `frightened` | `Frown` | `grappled` | `Hand` |
| `incapacitated` | `CircleOff` | `invisible` | `Ghost` | `paralyzed` | `Zap` |
| `petrified` | `Mountain` | `poisoned` | `Biohazard` | `prone` | `ArrowDownToLine` |
| `restrained` | `Link` | `stunned` | `Sparkles` | `unconscious` | `Moon` |

`hide` und `blinded` zeigen dasselbe Bild — zwei Rollen, ein Bild ist erlaubt; die
Umkehrung (ein Name, zwei Bilder) nicht. Lucide hat keinen Drachen; `Snake` ist die
nächstliegende Form und wird im App-Test begutachtet. **Fehlt ein hier genannter Export in
der installierten Version**, ersetzt der implementer ihn durch den nächstliegenden
Lucide-Export, ohne den Namen zu ändern, und nennt den Tausch im Summary.

Die Datei importiert benannte Exporte aus `'lucide-react'` (baumschüttelbar) — keinen
Namespace-Import, kein `lucide-react/dist/…`.

### D2 — `Icon` und `IconButton` (`src/client/ui/Icon.tsx`)

```tsx
export function Icon({ name, label }: { name: IconName; label?: string }) {
  const Svg = ICON_REGISTRY[name]
  return <Svg className="icon" size="1em" aria-hidden={label ? undefined : true}
    role={label ? 'img' : undefined} aria-label={label} />
}
```

- `size="1em"` setzt `width` und `height` auf `1em`; Farbe bleibt `currentColor`
  (kein `color`-Prop), Strichstärke Lucide-Standard 2.
- Ohne `label`: `aria-hidden="true"`, kein `role`, kein `aria-label` (**dekorativ**). Mit
  `label`: `role="img"`, `aria-label` (**benannt**). Keine weiteren Props — wer Klassen
  oder Größen braucht, wickelt das Icon in ein Element.
- `IconButton({ name, label, className, ...rest }: { name: IconName; label: string } &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>)` rendert
  `<button type="button" className={className ? `icon-button ${className}` : 'icon-button'}
  aria-label={label} {...rest}>` mit genau einem Kind `<Icon name={name} label={label} />`
  und ohne Textknoten. Ein übergebener `type` in `rest` überschreibt `button`.

### D3 — Symbolkatalog auf der Leitung (`src/shared/token.ts`)

```ts
export const TOKEN_ICONS = ['fighter', 'guardian', 'undead', 'dragon', 'mage', 'archer', 'royal', 'beast', 'vermin', 'fire'] as const
export const TokenIconSchema = z.enum(TOKEN_ICONS)
```

Kommentar der Konstante anpassen („gespeichert wird der Symbolname der Icon-Registry").
`shared/` importiert weiterhin nichts aus `client/` — die Namen stehen hier als Literale;
dass jeder ein `IconName` ist, prüft der Client (`token-icons.ts`, D4) per Typ:
`shared/` darf `client/` nicht kennen, deshalb dort der exportierte Wert
`export const TOKEN_ICON_NAMES: readonly IconName[] = TOKEN_ICONS` als Typprüfung (ein
Katalogname außerhalb der Registry wäre ein Typfehler). Server-Code ändert sich nicht.

`src/client/session/token-icons.ts` (neu):

```ts
export const TOKEN_ICON_LABELS: Record<TokenIcon, string> = {
  fighter: 'Kämpfer', guardian: 'Wächter', undead: 'Untoter', dragon: 'Drache', mage: 'Magier',
  archer: 'Schütze', royal: 'Adel', beast: 'Bestie', vermin: 'Ungeziefer', fire: 'Feuer',
}
```

### D4 — Zustandskatalog (`src/client/session/conditions.ts`)

`ConditionCatalogEntry` wird `{ label: string; icon: IconName }`; die 15 Einträge in der
Reihenfolge und mit den Namen aus spec.md „Zustandskatalog". `conditionSymbol` entfällt;
stattdessen:

- `conditionIcon(label: string): IconName | null` — Registry-Name des Katalogeintrags,
  sonst `null`.
- `conditionAbbreviation(label: string): string` — die ersten zwei Zeichen in
  Großbuchstaben (bisheriger Rückfall), für Markierungen außerhalb des Katalogs auf der
  Karte.

Die Datei importiert `type IconName` aus `../ui/icons.js` (Typ-Import, kein Laufzeitimport
von `lucide-react` in die Pixi-Fassade hinein — `canvas.ts` importiert `icons.ts` selbst,
siehe D5).

### D5 — SVG auf der Karte (`src/client/ui/icon-svg.ts`, `src/client/map/canvas.ts`)

`icon-svg.ts`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

export function iconSvg(name: IconName, color: string): string {
  return renderToStaticMarkup(createElement(ICON_REGISTRY[name], { color, size: 24, strokeWidth: 2 }))
}
```

- `color` ist ein Hex-String (`#rrggbb`); Lucide setzt ihn als `stroke`-Attribut, das der
  Pixi-Parser liest. `size: 24` hält den Koordinatenraum bei `0…24` (= `viewBox`).
- Ein Cache `Map<string, string>` mit Schlüssel `${name}:${color}` vermeidet wiederholtes
  Rendern; `renderToStaticMarkup` läuft im Browser (Vite löst `react-dom/server` auf den
  Browser-Build auf). Nur `canvas.ts` importiert dieses Modul — es hängt damit nicht in der
  statischen Importkette von `App` (Jest mockt die Fassade).

`canvas.ts`:

- Helfer `iconGraphics(name: IconName, color: number, size: number): Graphics`: erzeugt
  `new Graphics().svg(iconSvg(name, hex(color)))`, setzt `pivot` auf `(12, 12)` und
  `scale` auf `size / 24` — das Icon ist dann `size` Pixel groß und um seinen Mittelpunkt
  positionierbar. `hex()` wandelt die bestehenden Farbkonstanten (Zahlen) mit
  `new Color(value).toHex()` aus `pixi.js` um.
- Token-Symbol: bei `token.icon !== null` ein `iconGraphics(token.icon,
  TOKEN_SYMBOL_COLOR, radius * 1.1)` in der Tokenmitte; bei `null` weiterhin der
  `Text` mit der Initiale. Das Symbolobjekt ist Kind des Token-Containers und wird mit ihm
  zerstört (`destroy({ children: true })` bleibt).
- Markierungen: je Symbolplatz ein `iconGraphics(conditionIcon(label),
  TOKEN_CONDITION_SYMBOL_COLOR, TOKEN_NAME_FONT_SIZE)` für Katalogeinträge, sonst ein
  `Text` mit `conditionAbbreviation(label)`; „+N" bleibt `Text`. Positionierung wie bisher
  (gleicher Abstand, gleiche Höhe über dem Token).
- Der `Graphics`-Pfad einer Lucide-Form ist ein Strichpfad ohne Füllung — im Pixi-Parser
  ergibt `fill="none"` keine Fläche, `stroke` mit `stroke-width` 2 skaliert mit.

### D6 — Token-Formular und Markierungsliste (`TokenPanel.tsx`)

Symbolauswahl (ersetzt `<select id="token-panel-icon">`):

```tsx
<fieldset>
  <legend>Symbol</legend>
  <label><input type="radio" name="icon" value="" checked={icon === ''} onChange={…} /> Kein Symbol</label>
  {TOKEN_ICONS.map((name) => (
    <label key={name}>
      <input type="radio" name="icon" value={name} checked={icon === name} onChange={…} />
      <Icon name={name} /> {TOKEN_ICON_LABELS[name]}
    </label>
  ))}
</fieldset>
```

- Zugänglicher Name jedes Optionsfelds ist der Text seines Labels (`Kein Symbol`,
  `Kämpfer`, …); das Icon ist dekorativ. State `icon` bleibt ein String (`''` = kein
  Symbol); beim Absenden `icon: icon === '' ? null : icon` — der Wert ist ein `TokenIcon`,
  weil nur Katalognamen als `value` vorkommen (Typ-Zusicherung über
  `TokenIconSchema.safeParse` oder ein `isTokenIcon`-Guard, nicht `as`).
- Alle anderen Felder des Formulars unverändert (`name`, `color`, `size`, `col`, `row`,
  `Anlegen`).

Markierungsliste je Token (ersetzt die nackten `Entfernen`-Schaltflächen):

```tsx
<ul aria-label={`${token.name} Markierungen`}>
  {token.conditions.map((label) => {
    const icon = conditionIcon(label)
    return (
      <li key={label} className="chip">
        {icon !== null && <Icon name={icon} />}
        <span>{label}</span>
        <IconButton name="delete" label={`${token.name} Markierung ${label} entfernen`} onClick={…} />
      </li>
    )
  })}
</ul>
```

- Die Schaltfläche behält ihren bisherigen zugänglichen Namen; sie enthält nur noch das
  benannte Icon. Ein Katalogeintrag zeigt sein Icon (`<svg aria-hidden="true">`), eine
  freie Markierung keins. Die Textliste der Werte (`TokenStatsText`) bleibt unverändert.

### D7 — Datenmigration (`prisma/migrations/<zeitstempel>_icon-names/migration.sql`)

Zeitstempel nach dem Muster der vorhandenen Ordner (`YYYYMMDDHHMMSS_icon-names`, nach
`20260912120000`). Inhalt: zehn `UPDATE "Token" SET "icon" = '<name>' WHERE "icon" =
'<emoji>';` in Katalogreihenfolge (`⚔️`→`fighter`, `🛡️`→`guardian`, `💀`→`undead`,
`🐉`→`dragon`, `🧙`→`mage`, `🏹`→`archer`, `👑`→`royal`, `🐺`→`beast`, `🕷️`→`vermin`,
`🔥`→`fire`; die Emoji-Literale exakt wie im bisherigen `TOKEN_ICONS`, inklusive
Variationsselektoren), danach `UPDATE "Token" SET "icon" = NULL WHERE "icon" IS NOT NULL
AND "icon" NOT IN (<zehn Namen>);`. Kein Schemawechsel, `schema.prisma` bleibt gleich.
Die Tests laufen die Migration gegen die Wegwerf-DB; die Dev-DB migriert der Mensch vor dem
App-Test, Zielumgebungen die CI.

### D8 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle und Namen; für `<svg>` gibt es keine Rolle,
dort ist ein DOM-Zugriff auf das Element im Container zulässig):

| Element | Adresse |
|---|---|
| Symbolauswahl | Optionsfelder (`radio`) mit Namen `Kein Symbol`, `Kämpfer`, …, `Untoter`, …; Gruppe `Symbol` |
| Icon im Optionsfeld-Label | `<svg>` im zugehörigen `<label>` |
| Markierungsliste | Liste mit Namen `<Tokenname> Markierungen`; Einträge mit Text der Markierung |
| Entfernen | Schaltfläche `<Tokenname> Markierung <Markierung> entfernen` (unverändert) |
| Icon-Komponente | `<svg>` im Container; Attribute `width`, `height`, `aria-hidden`, `role`, `aria-label`, Klasse `icon` |
| Icon-only-Schaltfläche | Schaltfläche mit Namen = `label`, Klasse `icon-button`, einziges Kind `<svg>` |
| Registry | `ICON_NAMES`, `ICON_REGISTRY` aus `src/client/ui/icons.ts` |
| Zustandskatalog | `CONDITION_CATALOG` aus `src/client/session/conditions.ts`, Einträge als `Record<string, unknown>` lesen (`icon`, `symbol`) |
| Symbolkatalog | `TOKEN_ICONS`, `TokenIconSchema` (`safeParse`) aus `src/shared/token.ts` |

Rot aus dem richtigen Grund (constitution.md §3.1): die neuen Module (`icons.ts`,
`Icon.tsx`) existieren vor der Implementierung nicht. Die Tests laden sie deshalb mit
einem dynamischen Import über eine Pfad-Variable (kein statischer Import, damit kein
Typfehler die Suite am Laden hindert) und fallen bei Fehlschlag auf `null` zurück — jede
Assertion („Registry vorhanden", „rendert ein svg") wird dann an sich selbst rot, nicht am
Modulfehler. Bestehende Module (`conditions.ts`, `token.ts`) werden statisch importiert;
Felder, die es noch nicht gibt (`icon`), werden über `Record<string, unknown>` gelesen.
Stylesheet-Szenario: `theme.css` als Text (Helfer wie in der Theme-Suite, dort nichts
ändern). Komponententests rendern die Komponenten direkt, nicht über `App`; die Karte
(`canvas.ts`) ist gemockt und wird nicht getestet.

### D9 — Dependency `lucide-react`

Freigegeben vom Menschen am 2026-09-12 (constitution.md §5.2). Version `^1.45` (aktuelle
Major), als `dependencies`. Der Mensch installiert im Feature-Worktree
(`pnpm add lucide-react`) und committet `package.json` und `pnpm-lock.yaml`, bevor der
test-author startet; der Agent installiert nicht (AGENTS.md, Kritische Grenzen). Jest lädt
den CommonJS-Build des Pakets über `main` (ts-jest, `moduleResolution: node`) — kein
`moduleNameMapper`-Eintrag nötig.

### D10 — Stylesheet (Abschnitt „Icons" in `theme.css`)

Direkt nach `.empty-state strong { … }` und vor dem Bewegungsblock ein Kommentar
`/* Icons (ui-icons, #85) */` und genau diese Regeln — nur `var(--…)`/`currentColor`,
kein Farbwert, kein neues `@media`, kein `@import` (ui-theme design.md D7):

- `.icon`: `width: 1em`, `height: 1em`, `flex-shrink: 0`, `vertical-align: -0.125em`.
- `.icon-button`: `display: inline-flex`, `align-items: center`, `justify-content: center`,
  `min-width: 36px`, `padding: 0.45rem`, `font-size: var(--font-size-3)`.
- `.chip .icon-button`: `min-height: 0`, `min-width: 0`, `padding: 0`, `border: none`,
  `background: none`, `color: inherit`.

## Risks / Trade-offs

- **Pixi-SVG-Parser gegen Lucide-Pfade** — Lucide nutzt Bögen (`A`), abgerundete Enden und
  `stroke-width` 2; Pixi 8 unterstützt das, aber die Karte ist nur im App-Test prüfbar.
  Zeigt ein Icon dort Artefakte, wird es in der Registry getauscht (eine Zeile), nicht der
  Zeichenweg.
- **`react-dom/server` im Client-Bundle** (~20 KB) nur für SVG-Strings → akzeptiert;
  Alternative wäre ein zweites Paket (`lucide`) oder ein Deep-Import in `dist/`, beides
  fragiler. Der Cache hält die Kosten bei einem Rendern je Name und Farbe.
- **Datenmigration ändert Nutzerdaten** — nur Werte aus dem alten festen Katalog, alles
  andere wird `NULL` (Initiale); kein Datenverlust, der nicht schon vorher „kein Symbol"
  war. Die Migration ist idempotent.
- **Radio-Gruppe statt Select** macht das Formular länger (elf Optionen) → gewollt, Icons
  müssen sichtbar sein; #95 (Token-Karten) ordnet das Layout.
- **`Snake` für `dragon`** — sichtbarer Kompromiss, im App-Test zu beurteilen; ein Tausch
  ändert eine Zeile.
- **Zwei parallele Changes berühren `theme.css`** (#84, #85) → beide hängen ihren Abschnitt
  vor dem Bewegungsblock an; ein Rebase-Konflikt ist mechanisch (beide Abschnitte behalten).
