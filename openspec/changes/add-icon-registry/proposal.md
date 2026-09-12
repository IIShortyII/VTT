## Why

Icons sind heute Emoji-Strings: der Symbolkatalog der Tokens (`TOKEN_ICONS` in
`src/shared/token.ts`, gespeichert als Emoji in `Token.icon`) und der 5e-Zustandskatalog
(`src/client/session/conditions.ts`, Feld `symbol`). Das Rendering hängt vom System-Font
ab, Emoji sind nicht einheitlich skalierbar, tragen keine eigene `aria`-Semantik und lassen
sich nicht in `currentColor` einfärben — im dunklen Theme aus #83 wirken sie wie Fremdkörper.
Dieser Change (Issue #85, Kind des Epics #101) ersetzt beide Kataloge durch eine feste,
semantische Icon-Registry und legt damit den Baustein, den #86–#100 für jede Schaltfläche,
jeden Tab und jede Statusanzeige brauchen.

Entscheidungen aus dem Issue-Text (#85, #101) und der Explore-Runde (2026-09-12):
- **Vollständig statt halb.** Registry-Namen ersetzen die Emoji auch auf der Leitung und
  in der Datenbank (Datenmigration der zehn Emoji → Namen), und die Pixi-Karte zeichnet
  dieselben SVGs wie das DOM. Kein Client-Mapping von gespeicherten Emoji, kein
  Zwitter-Vertrag.
- **Namen sind Rollen, keine Bildbeschreibungen**: `delete`, `reveal`, `fighter`,
  `poisoned` — 54 Namen in drei Gruppen (Oberfläche, Symbolkatalog, Zustandskatalog).
  Was ein Name zeigt, entscheidet allein die Registry; ein Tausch des Bilds ändert genau
  eine Zeile.
- **`lucide-react`** liefert die SVGs (freigegeben vom Menschen am 2026-09-12,
  constitution.md §5.2): baumschüttelbar, `currentColor` und `1em` von Haus aus, deckt alle
  54 Namen ab. Kein Icon-Font, kein Eigenbau.
- **Zugänglichkeit als Regel**: Icon neben Text ist `aria-hidden`; Icon allein trägt
  `role="img"` und `aria-label`; eine Icon-only-Schaltfläche trägt ein `aria-label`. Nie
  Bedeutung allein über Farbe.
- **Die Karte zeichnet SVG über `Graphics.svg()`** (PixiJS 8): der SVG-String wird aus der
  Registry-Komponente erzeugt (`react-dom/server`), einmal je Name und Farbe gecacht und
  als Vektor gezeichnet — dieselbe Form wie im DOM, ohne Texturen zu laden.
- **Symbolauswahl im Token-Formular als Optionsgruppe** (Radio) statt `<select>`: ein
  `<option>` kann kein SVG zeigen; jede Option zeigt Icon plus Beschriftung.
- **Capability heißt `ui-icons`.** Das Stylesheet der Icons liegt im bestehenden
  `theme.css` (`ui-theme`) und hält dessen Format-Vertrag ein.

## What Changes

- **Registry** `src/client/ui/icons.ts` (neu): `ICON_NAMES`, `IconName`, `ICON_REGISTRY`
  (Name → `lucide-react`-Komponente).
- **Komponenten** `src/client/ui/Icon.tsx` (neu): `Icon` (dekorativ/benannt) und
  `IconButton` (Icon-only mit `aria-label`).
- **SVG für die Karte** `src/client/ui/icon-svg.ts` (neu): `iconSvg(name, color)` liefert
  den SVG-String einer Registry-Komponente.
- **Symbolkatalog** `src/shared/token.ts`: `TOKEN_ICONS` sind zehn Registry-Namen;
  `TokenIconSchema` akzeptiert nur noch diese. Beschriftungen in
  `src/client/session/token-icons.ts` (neu).
- **Zustandskatalog** `src/client/session/conditions.ts`: Einträge `{ label, icon }`,
  `conditionIcon(label)` und `conditionAbbreviation(label)` statt `conditionSymbol`.
- **Token-Formular** (`TokenPanel`): Symbolauswahl als Optionsgruppe mit Icons;
  Markierungsliste je Token als Chips mit Icon und Icon-only-`Entfernen`.
- **Karte** (`canvas.ts`): Token-Symbol und Markierungen als SVG-Grafiken statt Text;
  Initiale, Kürzel und „+N" bleiben Text.
- **Datenmigration** `prisma/migrations/<zeitstempel>_icon-names/migration.sql`: die zehn
  Emoji-Werte in `Token.icon` werden auf die neuen Namen umgeschrieben, alles andere auf
  `NULL`. Kein Schemawechsel.
- **Stylesheet** `src/client/app/theme.css`: Abschnitt „Icons" (`.icon`, `.icon-button`).
- **Dependency** `lucide-react` (Mensch, im Worktree, vor dem test-author).

**Nicht im Umfang:** Icons in Shell (#84/#86), Sitzungskarten (#86), Toasts/Modals/Menüs
(#88–#92) und Werkzeugleisten (#96) — sie benutzen die Registry, entstehen aber dort;
Textschlüssel für die Beschriftungen (#87); eigene Icon-Grafiken; ein zweiter Icon-Satz.

## Capabilities

### New Capabilities

- `ui-icons`: Registry (2 Szenarien), Zugänglichkeit der Icons (2), Kataloge
  referenzieren die Registry (2), Stylesheet der Icons (1).

### Modified Capabilities

- `session-token`: „Token anlegen" — `icon` ist ein Symbolname (`undead` statt `💀`), ein
  Emoji wird als ungültig abgelehnt; „Tokenansicht im Raum" — Symbolauswahl als
  Optionsgruppe mit Icons und Beschriftungen, Markierungsliste mit Icon je Katalogeintrag,
  Karte zeichnet Icons statt Emoji. Der Begriff „Symbol" in den Begriffen der Hauptspec
  wird beim Archivieren auf die Namen umgestellt.

## Impact

**Eine neue Dependency** (freigegeben vom Menschen am 2026-09-12, constitution.md §5.2):
`lucide-react` `^1.45` als `dependencies` (landet im Bundle). Der Mensch installiert sie im
Feature-Worktree und committet `package.json` + `pnpm-lock.yaml`, bevor der test-author
startet (design.md D9). `react-dom/server` ist Teil von `react-dom` (vorhanden).

**Datenmigration, kein Schemawechsel:** eine SQL-Migration schreibt bestehende
`Token.icon`-Werte um. Der Agent schreibt sie unter `prisma/`; ausgeführt wird sie gegen die
Wegwerf-DB durch die Tests, gegen die Dev-DB durch den Menschen vor dem App-Test, gegen
Zielumgebungen durch die CI (constitution.md §5.1, §6.1).

**Geänderter Code:**
- `src/client/ui/icons.ts`, `src/client/ui/Icon.tsx`, `src/client/ui/icon-svg.ts`,
  `src/client/session/token-icons.ts` (neu)
- `src/shared/token.ts`, `src/client/session/conditions.ts`,
  `src/client/session/TokenPanel.tsx`, `src/client/map/canvas.ts`
- `src/client/app/theme.css` (Abschnitt „Icons")
- `prisma/migrations/<zeitstempel>_icon-names/migration.sql` (neu)
- `package.json`, `pnpm-lock.yaml` (Mensch)

**Server:** keine Codeänderung — der Server prüft `icon` über `TokenIconSchema` aus
`shared/token.ts` und speichert den Wert unverändert; die Enum-Werte ändern sich, die
Regel nicht.

**Bestehende Tests:** Tests, die `💀` als Symbol senden oder erwarten (Socket-Integration,
Token-Oberfläche), ändern ihre Aussage — die Szenarien sind als MODIFIED geführt, der
test-author stellt sie auf `undead` bzw. die Optionsgruppe um. Tests, die `icon: null`
senden, bleiben gültig. Die Canvas-Fassade ist in allen Komponententests gemockt; die
Karte wird im App-Test abgenommen.

**Parallel zu #84 (`add-app-shell`):** beide Changes ergänzen `theme.css` am Ende vor dem
Bewegungsblock und beide berühren `package.json`. Der zweite gemergte Branch löst den
Konflikt beim Rebase; inhaltlich überschneiden sie sich nicht.
