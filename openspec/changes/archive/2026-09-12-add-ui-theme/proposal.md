## Why

Mit #11 (PR #67) ist die Roadmap #5–#17 in `main` und der Client funktional komplett — aber
ungestylt: `index.html` lädt kein Stylesheet, es gibt keine Tokens, keine Schriften, kein
Farbschema, nur drei Inline-Styles für Canvas-Höhen. Jede künftige Oberfläche müsste ihre
eigene Ad-hoc-Formatierung mitbringen, und kein zwei Panels sähen gleich aus. Dieser Change
(Issue #83, erstes Kind des Epics #101) legt das Fundament: ein globales Stylesheet mit
Design-Tokens, zwei self-hosted Schriften und den Grundelementen, auf denen #84–#100
aufbauen.

Das Produkt ist ein Werkzeug für laufende Spielrunden; Spielleitung und Spieler arbeiten
gleichzeitig an derselben Karte. Ein kohärentes, dunkles Bedienkonzept mit festen Bausteinen
senkt die kognitive Last dort, wo während einer Sitzung wenig Zeit für Interpretation bleibt.

Entscheidungen aus dem Issue-Text (#83, #101) und der Explore-Runde (2026-09-12):
- **Dark-only.** Genau ein Theme mit `color-scheme: dark`, kein Umschalter.
- **Semantische Tokens statt Farbwerte.** Komponenten lesen `--color-panel`,
  `--color-text-muted` usw.; außerhalb des `:root`-Blocks steht kein Farbwert im Stylesheet.
- **Eine 12-stufige Neutral-Rampe** (dunkles Schiefergrau) und **drei Statusfamilien**: teal
  (aktiv/info), amber (pausiert/warnung), rot (gefahr/beendet) — jede mit Textfarbe, getönter
  Fläche und Rahmen.
- **Gold ist die alleinige Markenfarbe:** primäre Aktion, aktiver Tab, aktiver Chip, Fokus in
  Eingabefeldern, Namens-/Rollen-Pills — sonst nichts.
- **Spacing in sieben Stufen, Radius mit je einer festen Rolle** (4 Raster · 6 Buttons/Inputs
  · 8 Zeilen · 10 Panels/Popups · pill), **eine Typo-Skala**.
- **Zwei Schriften, klare Arbeitsteilung:** Display-Serif „Marcellus" nur für `h1`/`h2` und
  Namen, humanistische Sans „Sora" für alles andere — beide self-hosted über
  `@fontsource/marcellus` und `@fontsource/sora`, eingebunden per `@import` am Anfang des
  Stylesheets. Kein Netzaufruf zu einem Font-Dienst.
- **Bewegung ist opt-in:** `transition`/`animation` ausschließlich innerhalb
  `@media (prefers-reduced-motion: no-preference)`.
- **Sichtbarer Fokus überall:** globales `:focus-visible` in teal (2px, Offset 2px);
  Eingabefelder bekommen stattdessen den goldenen Fokusring.
- **Capability heißt `ui-theme`** (Tokens, Schriften, Grundelemente). Die Shell (#84), die
  Icon-Registry (#85) und die Rückmeldungen (#88 ff.) bekommen eigene Capabilities.
- **Ein Stylesheet, eine Datei:** `src/client/app/theme.css`, eingebunden aus `main.tsx`.
  Keine CSS-Module, kein CSS-in-JS.
- **Keine Komponente wird in diesem Change umgebaut.** Elementselektoren (`body`, `h1`,
  `button`, `input`, …) greifen sofort; die Klassen (`.panel`, `.chip`, `.status-pill`, …)
  werden von den Folge-Issues an die bestehenden Panels gelegt. Die drei Inline-Styles für
  Canvas-Höhen bleiben (Layout, Sache von #84/#96).
- **Kontrast ist Spezifikation, nicht Geschmack:** Textpaare ≥ 4.5:1, Nicht-Text-Paare
  (Fokusring, Rahmen der Eingabe, abgeschwächter Text für nicht-informative Elemente) ≥ 3:1,
  je nach der WCAG-Formel gerechnet und per Test gegen die Tokenwerte geprüft.

## What Changes

- **Globales Stylesheet** `src/client/app/theme.css` (neu): `@import` der vier
  Schriftschnitte (Marcellus 400, Sora 400/500/600), ein `:root`-Block mit allen Tokens
  (Neutral-Rampe, semantische Neutrale, Gold, drei Statusfamilien, Fokus, Spacing, Radius,
  Typografie, Inhaltsbreite, Schatten), Basis (`box-sizing`, `body`, `h1`/`h2`), die
  Grundelemente `button` (Standard, `.primary`, `.danger`, `.link`), `input`/`select`/
  `textarea` mit goldenem Fokusring, `.panel` mit uppercase-`h3`, `.chip` (+ `.is-active`),
  `.status-pill` (+ `--active`/`--paused`/`--ended`), `.field-label`, `.field-error`,
  `.empty-state`, globales `:focus-visible`, und ein Bewegungsblock unter
  `prefers-reduced-motion: no-preference`.
- **Einbindung:** `src/client/main.tsx` importiert `./app/theme.css` vor dem Rendern.
- **Sonst nichts.** `index.html` bleibt unverändert (kein `<link>`), keine Komponente ändert
  Markup oder Verhalten.

**Nicht im Umfang:** Shell/Top-Bar/Footer (#84); Icons (#85); Hero und Sitzungskarten (#86);
Textschlüssel (#87); Toasts, Modals, Banner, Kontextmenüs (#88–#92); Anwenden der Klassen auf
bestehende Panels und Formulare (#93–#99); Responsive-Regeln (#100); ein helles Theme (bewusst
ausgeschlossen); Icon-Fonts; `--font-size-hero` und `--content-max` werden definiert, aber
erst von #84/#86 benutzt.

## Capabilities

### New Capabilities

- `ui-theme`: Design-Tokens (4 Szenarien), Schriften (2), Grundelemente (2), Bewegung (1),
  Einbindung (1).

### Modified Capabilities

Keine. Kein bestehendes Requirement ändert seine Aussage; das Stylesheet greift nur über
Elementselektoren in bestehendes Markup ein, was für die vorhandenen Komponententests
unsichtbar ist (jsdom rechnet keine Styles aus, und kein Test importiert `main.tsx`).

## Impact

**Zwei neue Dependencies** (freigegeben vom Menschen am 2026-09-12, constitution.md §5.2):
`@fontsource/marcellus` und `@fontsource/sora` — self-hosted Schriftdateien, versioniert im
Bundle, kein externer Netzaufruf beim Laden der App. Der Mensch installiert sie im
Feature-Worktree und committet `package.json` + `pnpm-lock.yaml`, bevor der test-author
startet (design.md D8).

**Kein Schema, keine Migration, kein Server-Code.**

**Geänderter Code:**
- `src/client/app/theme.css` (neu) — das gesamte Stylesheet (design.md D1–D6)
- `src/client/main.tsx` — eine Zeile: `import './app/theme.css'`

**Bestehende Tests:** keine ändert ihre Aussage. Kein bestehender Test importiert
`main.tsx` oder eine CSS-Datei; das Jest-`moduleNameMapper` braucht deshalb keinen
CSS-Mock. Die neuen Tests lesen das Stylesheet und `main.tsx` als Text von der Platte
(design.md D7) — kein jsdom, kein Rendering.
