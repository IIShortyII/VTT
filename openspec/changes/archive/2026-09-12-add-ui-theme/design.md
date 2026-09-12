## Context

Vorhanden: `index.html` ohne Stylesheet, `src/client/main.tsx` als einziger Einstieg
(`createRoot(...).render(<App/>)`), Vite 7 als Bundler (CSS-`@import` mit Paketnamen wird
von Vite aufgelöst und die `url()`-Verweise der Schriftdateien werden mitgebündelt), React 19
mit nativen Elementen (`<button>`, `<input>`, `<select>`, `<fieldset>`/`<legend>`, `<ul>`,
`<p role="alert">`) und drei Inline-Styles für Canvas-Höhen (`MapCanvas.tsx`,
`SessionRoom.tsx`, `MapLibrary.tsx`). Jest läuft unter `node`, Komponententests unter jsdom
per Docblock; kein Test importiert `main.tsx`.

Die Entscheidungen der Explore-Runde stehen in proposal.md. Verhalten: `specs/ui-theme/spec.md`.
Bindend und nicht wiederholt: `constitution.md` §9 (hier nicht berührt — reines Client-CSS,
keine Daten, keine Berechtigungen).

## Goals / Non-Goals

**Goals:**
- **Eine Datei ist das Theme.** `src/client/app/theme.css` trägt Schriftimporte, Tokens,
  Basis und Grundelemente. Ein Folge-Issue, das eine Farbe ändert, ändert genau eine Zeile im
  `:root`-Block.
- **Tokens sind der einzige Ort für Farbwerte.** Außerhalb von `:root` steht kein Hex-,
  `rgb()`- oder `hsl()`-Wert; alles liest `var(--…)`.
- **Prüfbare Barrierefreiheit:** Kontrastpaare sind als Tokenpaare benannt und werden per
  Test gerechnet; Fokus ist überall sichtbar; Bewegung nur opt-in.
- **Kein externer Netzaufruf** beim Laden der App: Schriften aus dem Bundle.
- **Maschinenlesbares Format** (D7), damit die Tests das Stylesheet ohne CSS-Parser-Dependency
  auswerten können.
- Keine bestehende Assertion bricht.

**Non-Goals:**
- Kein Umbau bestehender Komponenten, keine Klassen an vorhandenem Markup (proposal.md).
- Keine Shell, keine Icons, keine Meldungsmuster, kein Responsive (#84 ff.).
- Kein helles Theme, kein Theme-Umschalter.
- Keine Kontrastforderung für Rahmen (`--color-border*` gegen Flächen): Schaltflächen und
  Felder werden über Fläche, Text und Fokusring erkannt, nicht über den Rahmen allein
  (Trade-off, siehe unten).

## Decisions

### D1 — Tokens (`:root`)

Der `:root`-Block enthält **genau diese Tokens** in dieser Gruppierung; die Werte sind
verbindlich (Hex sechsstellig, klein geschrieben; Verweise als `var(--…)` ohne Fallback):

```css
:root {
  color-scheme: dark;

  /* Neutral-Rampe (1-2 App-Hintergrund · 3-5 Flächen · 6-8 Rahmen · 9-10 Vollton · 11-12 Text) */
  --gray-1: #0c0f13;
  --gray-2: #0e1014;
  --gray-3: #13161c;
  --gray-4: #161a20;
  --gray-5: #1c2129;
  --gray-6: #2a313b;
  --gray-7: #3a4150;
  --gray-8: #4a5260;
  --gray-9: #6f7884;
  --gray-10: #7a8089;
  --gray-11: #98a1ad;
  --gray-12: #eef1f6;

  /* Semantische Neutrale — alles unterhalb liest diese, nie die Rampe */
  --color-bg: var(--gray-2);
  --color-bg-subtle: var(--gray-1);
  --color-panel: var(--gray-3);
  --color-surface: var(--gray-4);
  --color-surface-hover: var(--gray-5);
  --color-border-faint: var(--gray-6);
  --color-border: var(--gray-7);
  --color-border-strong: var(--gray-8);
  --color-text: var(--gray-12);
  --color-text-muted: var(--gray-11);
  --color-text-faint: var(--gray-9);
  --input-bg: #0e1115;
  --panel-grad: linear-gradient(180deg, var(--gray-5), var(--gray-2));

  /* Gold — die Markenfarbe */
  --accent-9: #d9b45b;
  --gold-1: #b88f45;
  --gold-2: #e6c673;
  --gold-grad: linear-gradient(180deg, var(--gold-2), var(--gold-1));
  --gold-border: #6a521f;
  --gold-inset: #ffe9b0;
  --gold-text: #e6c673;
  --gold-dark: #1a1408;

  /* Statusfamilien: teal aktiv/info · amber pausiert/warnung · rot gefahr/beendet */
  --teal: #57c7c0;
  --teal-bg: #0d1f1d;
  --teal-border: #1f4a44;
  --amber: #e6c673;
  --amber-bg: #241e0e;
  --amber-border: #6a5320;
  --red: #f0a5a5;
  --red-bg: #1f1416;
  --red-border: #5a2a2a;
  --color-focus: var(--teal);

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;

  /* Radius — je eine Rolle: 1 Raster · 2 Buttons/Inputs · 3 Zeilen · 5 Panels/Popups · pill */
  --radius-1: 4px;
  --radius-2: 6px;
  --radius-3: 8px;
  --radius-5: 10px;
  --radius-pill: 999px;

  /* Typografie */
  --font-display: 'Marcellus', Georgia, 'Times New Roman', serif;
  --font-sans: 'Sora', system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
  --font-size-1: 0.7rem;
  --font-size-2: 0.8rem;
  --font-size-3: 1rem;
  --font-size-4: 1.4rem;
  --font-size-hero: 2.5rem;

  /* Layout und Elevation */
  --content-max: 55rem;
  --shadow-panel: 0 10px 30px rgba(0, 0, 0, 0.5);
}
```

`--amber` und `--gold-2`/`--gold-text` teilen denselben Wert — absichtlich: die
Warnfarbe *ist* das helle Gold, damit „pausiert" zur Marke passt. `--radius-4` gibt es
nicht (wäre ein Duplikat von `--radius-2`).

### D2 — Kontrastpaare

Gerechnet nach WCAG 2.1 (relative Luminanz aus sRGB, Verhältnis `(L1 + 0.05) / (L2 + 0.05)`,
siehe spec.md „Begriffe"). Verweise werden bis zum Hex-Wert aufgelöst. Die Tabelle ist die
Testgrundlage, nicht nur Dokumentation:

| Vordergrund | Hintergrund | Rolle | mind. |
|---|---|---|---|
| `--color-text` | `--color-bg` | Fließtext auf App-Hintergrund | 4.5 |
| `--color-text` | `--color-panel` | Fließtext im Panel | 4.5 |
| `--color-text` | `--color-surface` | Beschriftung auf Schaltfläche | 4.5 |
| `--color-text-muted` | `--color-panel` | Sekundärtext, `.panel h3` | 4.5 |
| `--color-text-muted` | `--gray-5` | Sekundärtext auf dem hellsten Anteil des Panel-Verlaufs, Chip-Text | 4.5 |
| `--teal` | `--teal-bg` | Statuspille aktiv | 4.5 |
| `--amber` | `--amber-bg` | Statuspille pausiert | 4.5 |
| `--red` | `--red-bg` | Statuspille beendet, `.danger`-Schaltfläche | 4.5 |
| `--red` | `--color-panel` | `.field-error` im Panel | 4.5 |
| `--gold-dark` | `--gold-1` | Text auf dem dunkelsten Anteil des Gold-Verlaufs (`.primary`, aktiver Chip) | 4.5 |
| `--color-focus` | `--color-panel` | globaler Fokusring im Panel | 3 |
| `--color-focus` | `--color-bg` | globaler Fokusring auf App-Hintergrund | 3 |
| `--accent-9` | `--input-bg` | Fokusring der Eingabefelder | 3 |
| `--color-text-faint` | `--gray-5` | abgeschwächter Text (nur nicht-informativ: Platzhalter, Trenner) | 3 |

`--color-text-faint` erreicht auf `--color-panel` nur ~4.1 und darf deshalb **nicht** für
Beschriftungen stehen; `.field-label` liest `--color-text-muted`.

### D3 — Schriften

Am Dateianfang, vor `:root`, genau diese vier Zeilen (Reihenfolge verbindlich):

```css
@import '@fontsource/marcellus/400.css';
@import '@fontsource/sora/400.css';
@import '@fontsource/sora/500.css';
@import '@fontsource/sora/600.css';
```

Marcellus hat nur den Schnitt 400. Sora 500 für `.status-pill`-Text, 600 für `.primary`,
aktiven Chip und `.panel h3`. Kein 700 (ungenutzt, 40 KB gespart). Keine eigene
`@font-face`-Regel, kein `url(`, kein `<link>` in `index.html`. Vite löst die Paketnamen in
`@import` auf und bündelt die `woff2`-Dateien mit.

### D4 — Basis und Grundelemente

Alle Regeln lesen ausschließlich Tokens. Verbindliche Selektoren (D7 legt fest, wie die
Tests sie finden) und ihre Kernaussagen:

- `*, *::before, *::after { box-sizing: border-box; }`
- `body`: `margin: 0`, `font-family: var(--font-sans)`, `font-size: 14px`,
  `line-height: 1.5`, `background: var(--color-bg)`, `color: var(--color-text)`.
- `h1, h2`: `font-family: var(--font-display)`, `font-weight: 400`. Keine Ausrichtung
  (Sache der Shell, #84).
- `button`: `font: inherit`, `min-height: 36px`, `padding: 0.45rem 0.9rem`,
  `border: 1px solid var(--color-border)`, `border-radius: var(--radius-2)`,
  `background: var(--color-surface)`, `color: var(--color-text)`, `cursor: pointer`.
- `button:hover:not(:disabled)`: `border-color: var(--color-border-strong)`,
  `background: var(--color-surface-hover)`.
- `button:disabled`: `opacity: 0.5`, `cursor: default`.
- `button.primary`: `border-color: var(--gold-border)`, `background: var(--gold-grad)`,
  `color: var(--gold-dark)`, `font-weight: 600`,
  `box-shadow: inset 0 1px 0 var(--gold-inset)`; Hover behält Verlauf und Rahmen, hebt nur
  `filter: brightness(1.06)`.
- `button.danger`: `border-color: var(--red-border)`, `background: var(--red-bg)`,
  `color: var(--red)`; Hover `border-color: var(--red)`.
- `button.link`: `min-height: 0`, `border: none`, `padding: 0`, `background: none`,
  `color: var(--color-text-muted)`, `text-decoration: underline`; Hover
  `color: var(--color-text)`.
- `input, select, textarea`: `font: inherit`, `padding: 0.45rem 0.6rem`,
  `border: 1px solid var(--color-border-faint)`, `border-radius: var(--radius-2)`,
  `background: var(--input-bg)`, `color: var(--color-text)`.
- `:focus-visible`: `outline: 2px solid var(--color-focus)`, `outline-offset: 2px`. Steht
  in der Datei **vor** der folgenden Eingabefeld-Fokusregel, damit deren goldener Ring
  gewinnt (gleiche Spezifität, spätere Regel siegt).
- `input:focus-visible, select:focus-visible, textarea:focus-visible`:
  `border-color: var(--accent-9)`, `outline: 2px solid var(--accent-9)`,
  `outline-offset: 1px`,
  `box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-9) 35%, transparent)`.
- `.panel`: `display: flex`, `flex-direction: column`, `gap: var(--space-2)`,
  `padding: var(--space-4)`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-5)`, `background: var(--panel-grad)`,
  `box-shadow: var(--shadow-panel)`.
- `.panel h3`: `margin: 0`, `font-size: var(--font-size-1)`, `font-weight: 600`,
  `text-transform: uppercase`, `letter-spacing: 0.16em`, `color: var(--color-text-muted)`.
  Bleibt in der Sans — die Display-Serif ist `h1`/`h2` vorbehalten.
- `.chip`: `min-height: 0`, `padding: var(--space-1) var(--space-3)`,
  `border: 1px solid var(--color-border)`, `border-radius: var(--radius-pill)`,
  `background: var(--color-surface)`, `color: var(--color-text-muted)`,
  `font-size: 0.85em`; Hover wie `button:hover` plus `color: var(--color-text)`.
- `.chip.is-active`: `border-color: var(--gold-border)`, `background: var(--gold-grad)`,
  `color: var(--gold-dark)`, `font-weight: 600`; Hover behält Gold,
  `filter: brightness(1.08)`.
- `.status-pill`: `display: inline-flex`, `align-items: center`, `gap: var(--space-1)`,
  `min-width: 8.5rem`, `padding: 0.1rem 0.6rem`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-pill)`, `font-size: var(--font-size-2)`, `font-weight: 500`,
  `color: var(--color-text-muted)`, `text-align: center`. Feste Mindestbreite, damit die
  Pille beim Statuswechsel nichts verschiebt.
- `.status-pill--active`: `border-color: var(--teal-border)`, `background: var(--teal-bg)`,
  `color: var(--teal)`. `.status-pill--paused`: amber-Trio. `.status-pill--ended`: rot-Trio.
  Die Grundform ohne Modifier ist der neutrale Zustand („geschlossen"/nicht gestartet).
- `.field-label`: `display: block`, `margin-bottom: var(--space-1)`,
  `font-size: var(--font-size-1)`, `text-transform: uppercase`, `letter-spacing: 0.12em`,
  `color: var(--color-text-muted)`.
- `.field-error`: `margin: var(--space-1) 0 0`, `font-size: var(--font-size-1)`,
  `color: var(--red)`.
- `.empty-state`: `display: flex`, `flex-direction: column`, `gap: var(--space-1)`,
  `margin: var(--space-2) 0`, `color: var(--color-text-muted)`; `.empty-state strong`:
  `color: var(--color-text)`.

Farbe steht nie allein: Statuspillen tragen ihren Text, der aktive Chip zusätzlich
`font-weight: 600`, Fehler stehen als Text unter dem Feld. Icons kommen mit #85.

### D5 — Bewegung

Genau ein Block, am Dateiende:

```css
@media (prefers-reduced-motion: no-preference) {
  button,
  .chip {
    transition:
      border-color 0.12s ease,
      background 0.12s ease;
  }
}
```

Kein `transition`, `animation` oder `@keyframes` außerhalb einer `@media`-Regel mit genau der
Abfrage `(prefers-reduced-motion: no-preference)`. Ein Nutzer mit reduzierter Bewegung
bekommt so den Zustandswechsel ohne Übergang — nichts muss zurückgenommen werden.

### D6 — Einbindung

`src/client/main.tsx` erhält als erste Import-Zeile `import './app/theme.css'` (Seiteneffekt-
Import; TypeScript prüft solche Imports ohne Bindung nicht, es braucht keine Moduldeklaration
und keine `vite/client`-Typen). `index.html` bleibt unverändert — kein `<link>`, kein
Inline-Style. Die drei Inline-Styles für Canvas-Höhen bleiben stehen (proposal.md).

### D7 — Format-Vertrag für die Tests

Die Tests lesen `src/client/app/theme.css` und `src/client/main.tsx` per `readFileSync`
relativ zum Projektwurzelverzeichnis (`process.cwd()` beim Jest-Lauf) als Text — kein
CSS-Parser als Dependency, kein jsdom. Damit das robust ist, gilt für das Stylesheet:

1. **Kommentare** nur als `/* … */`; sie enthalten keine Farbwerte, keine geschweiften
   Klammern und keine `@import`-/`transition`-Wörter. Die Tests entfernen Kommentare vor
   jeder Auswertung.
2. **`:root`** ist die erste Regel nach den `@import`-Zeilen und kommt genau einmal vor; der
   Block reicht von `:root {` bis zur nächsten `}` (keine verschachtelten Klammern darin).
   Jede Deklaration steht auf eigener Zeile als `--name: wert;` bzw. `color-scheme: dark;`.
3. **Farbwerte im `:root`** sind sechsstellige Hex-Werte (`#rrggbb`, klein), `var(--…)`
   ohne Fallback, `linear-gradient(...)` mit `var(--…)`-Anteilen oder `rgba(...)` (nur im
   Schatten). Ein `var(--…)` kann auf ein weiteres `var(--…)` zeigen; die Kette endet
   bei einem Hex-Wert.
4. **Außerhalb von `:root`** kommt kein `#`-Hex-Wert, kein `rgb(`/`rgba(`/`hsl(` vor —
   erlaubt sind `var(--…)`, `color-mix(in srgb, var(--…) N%, transparent)`, `transparent`,
   `none`, `inherit`, `currentColor`.
5. **Selektoren** stehen exakt wie in D4 gelistet, Selektorlisten in genau dieser
   Reihenfolge; ein Zeilenumbruch nach dem Komma ist erlaubt. Die Tests normalisieren
   Whitespace (`\s+` → ein Leerzeichen) und suchen `<selektor> {`. Beispiel: aus
   `input,\nselect,\ntextarea {` wird `input, select, textarea {`.
6. **Deklarationen in Fokusregeln** stehen wörtlich wie in D4 (`outline: 2px solid
   var(--color-focus);`, `outline-offset: 2px;`, `outline: 2px solid var(--accent-9);`).
7. **`@media`** kommt nur mit der Abfrage `(prefers-reduced-motion: no-preference)` vor; der
   Test findet `transition`-/`animation`-Deklarationen und prüft per Klammerzählung, dass
   jede in einem solchen Block liegt.
8. **`@import`** nur für die vier Schriftschnitte aus D3, mit einfachen Anführungszeichen,
   genau in dieser Schreibweise.
9. **Fehlende Datei = leerer Text.** Die Tests lesen das Stylesheet und den Einstieg mit
   einem Fallback auf `''`, wenn die Datei fehlt — damit jedes Szenario an seiner
   Assertion rot wird (constitution.md §3.1), nicht an einem `ENOENT` im Aufbau.

### D8 — Dependencies `@fontsource/marcellus`, `@fontsource/sora`

Freigegeben vom Menschen am 2026-09-12 (constitution.md §5.2). Version `^5` (aktuelle
Major, reine CSS+`woff2`-Pakete ohne Build-Schritt); nur `theme.css` importiert sie. Der
Mensch installiert im Feature-Worktree (`pnpm add @fontsource/marcellus @fontsource/sora`)
und committet `package.json` und `pnpm-lock.yaml`, bevor der test-author startet; der Agent
installiert nicht (AGENTS.md, Kritische Grenzen). Als `dependencies`, nicht
`devDependencies`: die Schriftdateien landen im Produktions-Bundle.

## Risks / Trade-offs

- **Rahmenkontrast unter 3:1** (`--color-border` auf `--color-panel` ≈ 1.8) → bewusst
  akzeptiert: Bedienelemente sind über Fläche, Text und Fokusring erkennbar; ein hellerer
  Rahmen zerstörte den ruhigen dunklen Look. Kein Kontrastpaar in D2, kein Test.
- **Bestehende Oberflächen sehen nach diesem Change „halb" aus** (dunkel, neue Schrift,
  aber unstrukturiert, keine Panels) → erwartet; die Klassen legen #93–#99 an. Der App-Test
  nimmt Tokens und Grundelemente ab, nicht das Layout.
- **`box-sizing: border-box` global** → könnte Layouts verschieben, die auf `content-box`
  bauen; im Client gibt es keine (nur die drei Inline-Höhen ohne Padding). Vorteil: jedes
  `width: 100%`-Feld inklusive Padding passt in sein Panel.
- **Text-Tests gegen ein Stylesheet** sind formatabhängig (D7) → gewollt: die Alternative
  wäre eine CSS-Parser-Dependency oder ein jsdom-Test, der ohnehin keine Farben rechnet.
  Der Vertrag steht im Design; wer das Format ändert, ändert Design und Test zusammen.
- **Schriftpakete im Bundle** (~4 × 20–40 KB `woff2`) → akzeptiert für „kein externer
  Netzaufruf"; nur vier Schnitte, kein 700.
