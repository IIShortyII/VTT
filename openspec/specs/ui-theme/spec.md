# ui-theme Specification

## Purpose

Das globale Stylesheet des Clients: ein dunkles Theme aus Design-Tokens, zwei self-hosted
Schriften und die Grundelemente (Schaltflächen, Eingabefelder, Panel, Chip, Statuspille,
Feldbeschriftung, Fehlertext, Leerzustand), auf denen alle weiteren Oberflächen aufbauen.
Farbe, Abstand, Radius und Schrift werden nur über Tokens vergeben; Kontrast, Fokus und
Bewegung sind prüfbare Eigenschaften der Tokenwerte und Regeln, nicht Geschmackssache.
Aussehen und Layout nimmt der menschliche App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Stylesheet**: die Datei `src/client/app/theme.css`, als Text gelesen relativ zum
  Projektwurzelverzeichnis. Kommentare (`/* … */`) zählen nicht zum Inhalt; vor jeder
  Auswertung werden sie entfernt.
- **Tokenblock**: die Regel `:root { … }` des Stylesheets — von `:root {` bis zur nächsten
  `}`. Sie kommt genau einmal vor. Jede Zeile darin ist eine Deklaration `--name: wert;`
  (oder `color-scheme: dark;`).
- **Token**: eine Deklaration `--name: wert;` im Tokenblock. Ein Token ist **aufgelöst**,
  wenn sein Wert ein sechsstelliger Hex-Wert `#rrggbb` (klein) ist, oder ein `var(--x)`,
  dessen Token `--x` aufgelöst ist (die Kette wird bis zum Hex-Wert verfolgt).
- **Farb-Token**: die Tokens `--gray-1` … `--gray-12`, `--color-bg`, `--color-bg-subtle`,
  `--color-panel`, `--color-surface`, `--color-surface-hover`, `--color-border-faint`,
  `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`,
  `--color-text-faint`, `--input-bg`, `--accent-9`, `--gold-1`, `--gold-2`, `--gold-border`,
  `--gold-inset`, `--gold-text`, `--gold-dark`, `--teal`, `--teal-bg`, `--teal-border`,
  `--amber`, `--amber-bg`, `--amber-border`, `--red`, `--red-bg`, `--red-border`,
  `--color-focus`.
- **Weitere Tokens**: `--panel-grad`, `--gold-grad` (Verläufe), `--space-1` … `--space-7`,
  `--radius-1`, `--radius-2`, `--radius-3`, `--radius-5`, `--radius-pill`, `--font-display`,
  `--font-sans`, `--font-mono`, `--font-size-1` … `--font-size-4`, `--font-size-hero`,
  `--content-max`, `--shadow-panel`.
- **Relative Luminanz** einer Farbe `#rrggbb` nach WCAG 2.1: je Kanal `c = wert / 255`,
  linearisiert `c ≤ 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4`, dann
  `L = 0.2126 · R + 0.7152 · G + 0.0722 · B`.
- **Kontrastverhältnis** zweier Farben: `(L_hell + 0.05) / (L_dunkel + 0.05)`, mit der
  helleren Luminanz im Zähler.
- **Textpaare** (Vordergrund, Hintergrund): (`--color-text`, `--color-bg`),
  (`--color-text`, `--color-panel`), (`--color-text`, `--color-surface`),
  (`--color-text-muted`, `--color-panel`), (`--color-text-muted`, `--gray-5`),
  (`--teal`, `--teal-bg`), (`--amber`, `--amber-bg`), (`--red`, `--red-bg`),
  (`--red`, `--color-panel`), (`--gold-dark`, `--gold-1`).
- **Nicht-Text-Paare**: (`--color-focus`, `--color-panel`), (`--color-focus`, `--color-bg`),
  (`--accent-9`, `--input-bg`), (`--color-text-faint`, `--gray-5`).
- **Externe URL**: eine Zeichenfolge, die mit `http://`, `https://` oder `//` beginnt.
- **Grundelement-Selektoren** (Whitespace normalisiert, Reihenfolge innerhalb einer
  Selektorliste verbindlich): `body` · `h1, h2` · `button` · `button:hover:not(:disabled)`
  · `button:disabled` · `button.primary` · `button.danger` · `button.link` ·
  `input, select, textarea` · `input:focus-visible, select:focus-visible, textarea:focus-visible`
  · `:focus-visible` · `.panel` · `.panel h3` · `.chip` · `.chip.is-active` · `.status-pill`
  · `.status-pill--active` · `.status-pill--paused` · `.status-pill--ended` · `.field-label`
  · `.field-error` · `.empty-state`. Ein Selektor ist **vorhanden**, wenn das Stylesheet nach
  Normalisierung (`\s+` → ein Leerzeichen) die Zeichenfolge `<selektor> {` enthält.
- **Bewegungsblock**: eine Regel `@media (prefers-reduced-motion: no-preference) { … }`
  (Whitespace normalisiert) mit ihrem durch Klammerzählung bestimmten Inhalt.
- **Bewegungsdeklaration**: eine Deklaration, deren Eigenschaft `transition`, `animation`
  oder eine ihrer Langformen (`transition-*`, `animation-*`) ist, sowie jede
  `@keyframes`-Regel.
- **Einstieg**: die Datei `src/client/main.tsx`.

## Requirements

### Requirement: Design-Tokens

Das Stylesheet MUST einen Tokenblock mit `color-scheme: dark` und allen Farb-Tokens und
weiteren Tokens aus „Begriffe" enthalten; jedes Farb-Token MUST aufgelöst sein. Die
Textpaare MUST ein Kontrastverhältnis von mindestens 4.5 erreichen, die Nicht-Text-Paare
mindestens 3. Außerhalb des Tokenblocks MUST NOT ein Farbwert stehen (`#`-Hex, `rgb(`,
`rgba(`, `hsl(`, `hsla(`); Regeln lesen Farben ausschließlich über `var(--…)` oder
`color-mix(…)` über Tokens.

#### Scenario: Kontrast der Textpaare

- **GIVEN** das Stylesheet mit seinem Tokenblock
- **WHEN** für jedes Textpaar die beiden Tokens bis zum Hex-Wert aufgelöst und das
  Kontrastverhältnis nach WCAG gerechnet wird
- **THEN** ist es für jedes der zehn Textpaare mindestens 4.5

#### Scenario: Kontrast der Nicht-Text-Paare

- **GIVEN** das Stylesheet mit seinem Tokenblock
- **WHEN** für jedes Nicht-Text-Paar die beiden Tokens bis zum Hex-Wert aufgelöst und das
  Kontrastverhältnis nach WCAG gerechnet wird
- **THEN** ist es für jedes der vier Nicht-Text-Paare mindestens 3

#### Scenario: Tokens vollständig und aufgelöst

- **GIVEN** das Stylesheet
- **WHEN** der Tokenblock gelesen wird
- **THEN** kommt `:root {` genau einmal vor, der Block enthält `color-scheme: dark;`, jedes
  Farb-Token und jedes weitere Token aus „Begriffe" ist genau einmal deklariert, und jedes
  Farb-Token löst sich über höchstens drei `var(--…)`-Schritte zu einem sechsstelligen
  Hex-Wert auf

#### Scenario: Farbwerte nur im Tokenblock

- **GIVEN** das Stylesheet ohne Kommentare
- **WHEN** der Text außerhalb des Tokenblocks nach Farbwerten durchsucht wird
- **THEN** enthält er keinen `#`-Hex-Wert und keinen Aufruf von `rgb(`, `rgba(`, `hsl(`
  oder `hsla(`

### Requirement: Schriften aus dem Bundle

Das Stylesheet MUST die Schriftschnitte Marcellus 400 sowie Sora 400, 500 und 600 über
`@import` aus den Paketen `@fontsource/marcellus` und `@fontsource/sora` einbinden. Weder das
Stylesheet noch `index.html` MUST NOT eine Schrift oder ein Stylesheet von einer externen
URL laden.

#### Scenario: Schriftschnitte werden importiert

- **GIVEN** das Stylesheet
- **WHEN** seine `@import`-Zeilen gelesen werden
- **THEN** enthält es genau die vier Zeilen `@import '@fontsource/marcellus/400.css';`,
  `@import '@fontsource/sora/400.css';`, `@import '@fontsource/sora/500.css';` und
  `@import '@fontsource/sora/600.css';` in dieser Reihenfolge vor dem Tokenblock, und keine
  weitere `@import`-Zeile

#### Scenario: Keine externe Schriftquelle

- **GIVEN** das Stylesheet und `index.html`
- **WHEN** der Font-Guard beide Dateien durchsucht
- **THEN** enthält das Stylesheet keine `@font-face`-Regel, kein `url(` mit externer URL und
  kein `@import` mit externer URL, und `index.html` enthält kein `<link>`-Element, dessen
  `href` eine externe URL ist

### Requirement: Grundelemente

Das Stylesheet MUST für jeden Grundelement-Selektor eine Regel enthalten. Der globale
Fokusring MUST über `:focus-visible` mit `outline: 2px solid var(--color-focus)` und
`outline-offset: 2px` gesetzt sein; Eingabefelder MUST stattdessen den goldenen Ring
`outline: 2px solid var(--accent-9)` erhalten, und diese Regel MUST nach der globalen
`:focus-visible`-Regel stehen, damit sie gewinnt.

#### Scenario: Grundelemente vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Grundelement-Selektor gesucht wird
- **THEN** ist jeder der 22 Grundelement-Selektoren vorhanden

#### Scenario: Sichtbarer Fokus

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** die Regel `:focus-visible {` und die Regel
  `input:focus-visible, select:focus-visible, textarea:focus-visible {` gelesen werden
- **THEN** enthält die erste `outline: 2px solid var(--color-focus);` und
  `outline-offset: 2px;`, die zweite `outline: 2px solid var(--accent-9);`, und die erste
  steht im Stylesheet vor der zweiten

### Requirement: Bewegung nur opt-in

Das Stylesheet MUST NOT eine Bewegungsdeklaration außerhalb eines Bewegungsblocks enthalten.

#### Scenario: Übergänge nur unter der Bewegungsabfrage

- **GIVEN** das Stylesheet ohne Kommentare
- **WHEN** jede Bewegungsdeklaration und jede `@keyframes`-Regel per Klammerzählung ihrem
  umschließenden `@media`-Block zugeordnet wird
- **THEN** liegt jede in einem Bewegungsblock, es gibt mindestens eine, und keine
  `@media`-Regel hat eine andere Abfrage als `(prefers-reduced-motion: no-preference)`

### Requirement: Einbindung

Der Einstieg MUST das Stylesheet als Seiteneffekt-Import laden, bevor gerendert wird.

#### Scenario: Der Einstieg lädt das Theme

- **GIVEN** der Einstieg
- **WHEN** seine Import-Zeilen gelesen werden
- **THEN** enthält er die Zeile `import './app/theme.css'`, und sie steht vor dem Aufruf
  von `createRoot`
