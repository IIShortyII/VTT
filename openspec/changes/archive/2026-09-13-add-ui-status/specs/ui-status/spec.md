## Purpose

Die Zustandsanzeigen des Clients: ein Zustandsbanner für Dauerzustände der Verbindung, ein
Overlay über der Kartenansicht für Sitzungszustände, in denen ein Spieler nicht handeln
soll, und ein Leerzustand für Listen ohne Einträge. Jede Anzeige zeigt ausschließlich, was
Socket oder Server gemeldet haben (`constitution.md` §9.1); keine leitet einen Zustand aus
Zeit oder letztem bekannten Stand ab. Aussehen nimmt der menschliche App-Test ab
(`constitution.md` §3.4).

## Begriffe

- **Zustandsbanner**: die Komponente `StatusBanner` aus `src/client/ui/status.tsx` mit der
  Prop `children` (der Bannertext). Sie rendert `<div class="status-banner" role="status">`
  mit dem Icon `warning` (`ui-icons`, ohne zugänglichen Namen) und dem Text in einem
  `<span>`.
- **Karten-Overlay**: die Komponente `MapOverlay` mit den Props `title` (Text), `subline`
  (Text) und `icon` (Registry-Name aus `ui-icons`). Sie rendert
  `<div class="map-overlay" role="region">`, per `aria-labelledby` benannt nach dem Titel,
  mit dem Icon, dem **Titel** `<p class="map-overlay-title">` und der **Subline**
  `<p class="map-overlay-subline">`. Das Overlay ist ein gewöhnliches Element ohne
  `pointer-events: none` — als letztes Kind der **Bühne** `<div class="map-stage">`, die auch
  die Kartenansicht enthält, liegt es über ihr und fängt Zeigerereignisse ab.
- **Leerzustand**: die Komponente `EmptyState` mit den Props `title` und `hint` (Texte). Sie
  rendert `<p class="empty-state"><strong>title</strong><span>hint</span></p>` — dasselbe
  Markup wie der Leerzustand der Startansicht (`ui-start`, „Leerzustand").

## ADDED Requirements

### Requirement: Zustandsbanner

Das Zustandsbanner SHALL als Element mit `role="status"` und der Klasse `status-banner`
gerendert werden, das das Icon `warning` und den übergebenen Text enthält. Es MUST NOT
zusätzlich `role="alert"` tragen und MUST NOT von selbst verschwinden — Erscheinen und
Verschwinden entscheidet der Aufrufer aus gemeldeten Ereignissen.

#### Scenario: Banner rendert Text mit Rolle status

- **GIVEN** das Zustandsbanner wird mit dem Text `Verbindung unterbrochen — verbinde neu…`
  gerendert
- **WHEN** die Komponente gerendert ist
- **THEN** existiert genau ein Element mit `role="status"`, es trägt die Klasse
  `status-banner`, enthält den Text `Verbindung unterbrochen — verbinde neu…` und ein
  `<svg>` ohne zugänglichen Namen, und kein Element trägt `role="alert"`

### Requirement: Karten-Overlay

Das Karten-Overlay SHALL als Element mit `role="region"` und der Klasse `map-overlay`
gerendert werden, dessen zugänglicher Name der Titel ist (`aria-labelledby` auf den Titel),
mit dem übergebenen Icon, dem Titel in einem Element der Klasse `map-overlay-title` und der
Subline in einem Element der Klasse `map-overlay-subline`. Es MUST NOT `pointer-events: none`
als Inline-Stil tragen.

#### Scenario: Overlay ist eine benannte Region mit Titel und Subline

- **GIVEN** das Karten-Overlay wird mit dem Titel `Pausiert`, der Subline
  `Die Spielleitung hat die Sitzung angehalten.` und dem Icon `pause` gerendert
- **WHEN** die Komponente gerendert ist
- **THEN** existiert ein Element mit der Rolle `region` und dem Namen `Pausiert`, es trägt die
  Klasse `map-overlay`, enthält ein Element der Klasse `map-overlay-title` mit dem Text
  `Pausiert`, ein Element der Klasse `map-overlay-subline` mit dem Text
  `Die Spielleitung hat die Sitzung angehalten.` und ein `<svg>`, und sein `style`-Attribut
  enthält nicht `pointer-events`

### Requirement: Leerzustand

Der Leerzustand SHALL als Absatz mit der Klasse `empty-state` gerendert werden, der den Titel
in einem `<strong>` und den Hinweis in einem `<span>` enthält — in dieser Reihenfolge.

#### Scenario: Leerzustand rendert Titel und Hinweis

- **GIVEN** der Leerzustand wird mit dem Titel `Noch keine Tokens` und dem Hinweis
  `Lege ein Token an, um es auf der Karte zu sehen.` gerendert
- **WHEN** die Komponente gerendert ist
- **THEN** existiert ein Absatz mit der Klasse `empty-state`, dessen erstes Kind ein
  `<strong>` mit dem Text `Noch keine Tokens` und dessen zweites Kind ein `<span>` mit dem
  Text `Lege ein Token an, um es auf der Karte zu sehen.` ist

### Requirement: Stylesheet der Zustandsanzeigen

Das Stylesheet `src/client/app/theme.css` SHALL Regeln für die Selektoren `.status-banner`,
`.map-stage`, `.map-overlay`, `.map-overlay-title` und `.map-overlay-subline` enthalten;
`.map-stage` SHALL `position: relative` und `.map-overlay` `position: absolute` setzen. Die
Regeln SHALL den Format-Vertrag von `ui-theme` einhalten: kein Farbwert außerhalb von `:root`
(Farben nur über `var(--…)` oder `color-mix` über Tokens), kein weiterer `@media`-Block, keine
`animation`- oder `transition`-Deklaration außerhalb des Bewegungsblocks.

#### Scenario: Stylesheet enthält die Selektoren und hält den Vertrag

- **GIVEN** das Stylesheet `theme.css` wird als Text gelesen
- **WHEN** die Regeln geprüft werden
- **THEN** existiert je eine Regel für `.status-banner`, `.map-stage`, `.map-overlay`,
  `.map-overlay-title` und `.map-overlay-subline`, die Regel `.map-stage` enthält
  `position: relative`, die Regel `.map-overlay` enthält `position: absolute`, außerhalb von
  `:root` steht kein Hex-, `rgb(`- oder `hsl(`-Farbwert, es gibt genau einen `@media`-Block,
  und keine der fünf Regeln enthält `animation` oder `transition`
