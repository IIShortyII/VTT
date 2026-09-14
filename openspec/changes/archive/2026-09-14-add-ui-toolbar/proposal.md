## Why

Die Werkzeugwahl im Raum läuft heute über Radio-Gruppen in `<fieldset>`: `FogPanel.tsx`
(Schwenken/Aufdecken/Verdecken/Bereich markieren) und `AnnotationPanel.tsx`
(Bewegen/Strecke/Kreis/Winkel/Zeichnen plus Modus/Sichtbarkeit/Farbe/Einheit). Die Bedienung
ist rein mausgetrieben, es gibt keine Tastenkürzel, und der Auswahlfortschritt beim Markieren
von Bereichen (`Auswahl: <n> Zellen`) ist keine Live-Region — ein Screenreader liest den
wachsenden Zähler nicht vor. Beide Panels codieren ihre Beschriftungen zudem als Rohstrings
(`TOOL_LABELS` etc.), obwohl Epic C (#103) sichtbare Texte über `t()` verlangt. Dieser Change
(Issue #96, Kind des Epics #103) baut die Werkzeugwahl zu barrierefreien Icon-Leisten um.

Entscheidungen aus dem Issue-Text (#96, #103) und der Explore-Runde (2026-09-14):
- **Neue Capability `ui-toolbar`** für die wiederverwendbare Werkzeugleisten-Mechanik:
  `Toolbar`/Icon-Werkzeugbuttons (`role="toolbar"`, `aria-pressed`, `title` **und**
  `aria-label`, ≥ 44 px generell als `min-size`-Basisregel), bereichsweite Tastenkürzel, `ChipGroup`
  (aria-pressed-Umschaltgruppe) und `ColorChipGroup` (Farbchips). `session-fog` und
  `session-annotation` verweisen nur darauf, **welche** Werkzeuge und Chips sie zeigen — die
  Mechanik ist einmal spezifiziert (Muster `ui-menu`, `ui-form`, `session-tabs`→`ui/tabs.tsx`).
- **Icon-Leiste statt Radios.** Die Werkzeugwahl wird `role="toolbar"` mit Icon-Buttons; das
  aktive Werkzeug trägt `aria-pressed="true"` und wird Gold (Aussehen im App-Test). Jeder
  Button trägt `title` (mit Kürzel) und `aria-label`.
- **Tastenkürzel im Bereich.** V Bewegen, R Aufdecken, H Verdecken, M Messen (Strecke),
  D Zeichnen — wirksam, während der Fokus in der jeweiligen Werkzeugleiste liegt, und im
  `title` des zugehörigen Buttons genannt. Kürzel sind bereichsweit (Handler an der
  Toolbar), damit sich Fog- und Anmerkungsleiste trotz gemeinsamem Werkzeugzustand nicht ins
  Gehege kommen.
- **Auswahlzähler als Live-Region.** `Auswahl: <n> Zellen` wird `<p role="status">` mit dem
  Text `<n> Zellen markiert` — der Fortschritt beim Markieren wird vorgelesen.
- **Modifikatoren als Chips.** Modus, Sichtbarkeit und Einheit werden aria-pressed-Chips,
  Farbe wird eine Reihe Farbchips (Swatch + zugänglicher Name der Farbe). Deaktiviert, wo das
  Werkzeug den Modifikator nicht anbietet (wie heute).
- **Zeilenaktionen über `ui-menu` (Epic C).** In der Bereichsliste bleibt der Aufdeck-Zustand
  ein Inline-Umschalter (`aria-pressed`, `<Name> aufgedeckt`); `Löschen` wandert in ein
  ⋮-Menü `Aktionen für <Name>`. In der Anmerkungsliste trägt jede Zeile, in der der Betrachter
  entfernen darf, ein ⋮-Menü `Aktionen für <Eintrag>` mit dem Eintrag `Entfernen`; die
  Sammelaktionen `Meine entfernen`/`Alle geteilten entfernen` bleiben Schaltflächen.
- **Beschriftungen über `t()`.** Die neu gebauten Bedien-Texte beider Panels (Werkzeugnamen,
  Chip-Beschriftungen, Zähler, Button- und Menütexte) sowie die vom Client komponierten
  Chrome-Wörter der Anmerkungszeilen (Art-Präfix, Sichtbarkeit, `unbekannt`) laufen über das
  Nachschlagen `t()` (`de`/`en`). Das Mess-Etikett aus `shared/annotation.ts`
  (`annotationLabel`: `3 Felder (4,5 m)`, `45°`, `r … · ⌀ …`) bleibt unangetastet — es wird
  auch vom Pixi-Canvas gezeichnet und von `session-annotation`/„Messgeometrie" mit exakten
  Strings festgenagelt.
- **Vier neue Registry-Icons** (`ui-icons`): `move` (Bewegen/Schwenken), `area` (Bereich
  markieren), `circle` (Kreis), `angle` (Winkel) — damit jedes Werkzeug ein Icon-Button wird.

## What Changes

- **Neu: `src/client/ui/toolbar.tsx`** — `Toolbar` (`role="toolbar"`, Icon-Werkzeugbuttons
  über `IconButton` mit `aria-pressed`/`title`/`aria-label`, bereichsweite Tastenkürzel),
  `ChipGroup` (`role="group"`, aria-pressed-Umschalter) und `ColorChipGroup` (Farbchips). Die
  Datei importiert nur `react`, `./Icon.js` und den Typ `IconName`.
- **Fog-Verwaltung** (`FogPanel.tsx`): Werkzeugwahl als `Toolbar` (Schwenken/Aufdecken/
  Verdecken/Bereich markieren) mit Kürzeln R/H; Auswahlzähler als `role="status"`; je Bereich
  ein Inline-Umschalter `<Name> aufgedeckt` und ein ⋮-Menü `Aktionen für <Name>` mit `Löschen`;
  Beschriftungen über `t()`.
- **Panel `Messen & Zeichnen`** (`AnnotationPanel.tsx`): Werkzeugwahl als `Toolbar`
  (Bewegen/Strecke/Kreis/Winkel/Zeichnen) mit Kürzeln V/M/D; Modus/Sichtbarkeit/Einheit als
  `ChipGroup`, Farbe als `ColorChipGroup`; je Zeile mit Löschrecht ein ⋮-Menü
  `Aktionen für <Eintrag>` mit `Entfernen`; komponierte Chrome-Wörter und Beschriftungen über
  `t()`.
- **Icon-Registry** (`icons.ts`): vier Namen `move`, `area`, `circle`, `angle` in die
  Oberfläche eingeordnet (alphabetisch), Mapping `Move`/`BoxSelect`/`Circle`/`Angle`.
- **Wörterbücher** (`de.ts`/`en.ts`): neue Schlüssel für Werkzeugnamen, Chips, Zähler,
  Menütexte und die Chrome-Wörter der Anmerkungszeilen.
- **Stylesheet** (`theme.css`): Abschnitt „Werkzeugleisten (ui-toolbar, #96)" — `role`-neutrale
  Klassen `tool-button`/`tool-button--active`, `chip`/`chip--active`, `color-chip` und das
  ≥ 44 px-Touch-Ziele als `min-size`-Basisregel ohne eigenes `@media`.
- **Specs:** neue Capability `ui-toolbar`; MODIFIED in `session-fog` („Fog-Ansicht im Raum"),
  `session-annotation` („Anmerkungsansicht im Raum") und `ui-icons` („Registry").

## Capabilities

### New Capabilities
- `ui-toolbar`: Werkzeugleiste, bereichsweite Tastenkürzel, Umschalt-Chips und Farbchips als
  wiederverwendbare Bausteine der Raumansicht.

### Modified Capabilities
- `session-fog`: „Fog-Ansicht im Raum" — Werkzeugwahl als Icon-Leiste (`ui-toolbar`) mit
  Kürzeln, Auswahlzähler als Live-Region, Bereichszeile mit Inline-Umschalter und ⋮-Menü.
- `session-annotation`: „Anmerkungsansicht im Raum" — Werkzeugwahl als Icon-Leiste mit
  Kürzeln, Modifikatoren als Chips/Farbchips, Zeilenaktionen über ⋮-Menü, Chrome-Wörter über
  `t()`.
- `ui-icons`: „Registry" — vier neue Namen `move`, `area`, `circle`, `angle` (60 Namen inkl. `locate`).

## Impact

- Client: `src/client/ui/toolbar.tsx` (neu), `src/client/session/FogPanel.tsx`,
  `src/client/session/AnnotationPanel.tsx`, `src/client/ui/icons.ts`,
  `src/client/i18n/de.ts`, `src/client/i18n/en.ts`, `src/client/app/theme.css`.
- Server: unverändert. Kein neues Ereignis, keine Route, kein Schema. Server bleibt
  autoritativ über Aufdeckung und Sichtbarkeit (`constitution.md` §9.2); die Werkzeugleiste
  hält nur die lokale Werkzeug- und Modifikatorwahl.
- Bestehende Tests: die Szenarien von „Fog-Ansicht im Raum" und „Anmerkungsansicht im Raum",
  die die Darstellung der Werkzeugwahl, den Zähler oder die Zeilenaktionen betreffen, prüfen
  jetzt `aria-pressed`, `role="status"` und das ⋮-Menü statt Radios/Checkbox/Entfernen-Button;
  die verhaltensbezogenen Szenarien (Senden der Absicht, Canvas-Übergabe) bleiben unverändert.
- #95 (`add-token-cards`) ist gemergt (`origin/main`, bff1269); der Worktree-Basisstand trägt
  `locate` (56 Namen). Dieser Change ergänzt vier Namen (`move`, `area`, `circle`, `angle`);
  die exakte Namensliste steht daher auf 60 — `locate` bleibt zwischen `library` und `lock`.
- Keine neue Dependency (`Move`/`BoxSelect`/`Circle`/`Angle` sind in `lucide-react` 1.45.0).
