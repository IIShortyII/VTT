## 1. Baustein `ui-toolbar`

- [ ] 1.1 `src/client/ui/toolbar.tsx` nach design.md D1–D3 anlegen: `Toolbar` (`role="toolbar"`, Icon-Werkzeugbuttons über `IconButton` mit `aria-pressed`/`title` mit Kürzel/`aria-label`, `onKeyDown` an der Wurzel mit bereichsweiter Kürzel-Auflösung, kein `document`-Listener, Formularfelder ignoriert), `ChipGroup` (`role="group"`, aria-pressed-Umschalter, `disabled`) und `ColorChipGroup` (Farbchips mit Swatch + Farbname als `aria-label`); prüfen: Datei importiert nur `react`, `./Icon.js`, den Typ `IconName`; `pnpm lint` grün
- [ ] 1.2 Registry-Namen `move`, `area`, `circle`, `angle` nach design.md in `src/client/ui/icons.ts` in die Oberfläche einordnen (alphabetisch: `move` nach `more`, `area` nach `angle` nach `add`, `circle` nach `chevronDown`) und `ICON_REGISTRY` mit `Move`/`BoxSelect`/`Circle`/`Angle` ergänzen; prüfen: `ICON_NAMES` hat 59 Einträge in der spezifizierten Reihenfolge, benannte Importe

## 2. Panels

- [ ] 2.1 `src/client/session/FogPanel.tsx` nach design.md D4: Werkzeugwahl als `Toolbar` (Schwenken/Aufdecken/Verdecken/Bereich markieren, Kürzel R/H), Zähler als `<p role="status">`, Bereichszeile mit Inline-Umschalter `<Name> aufgedeckt` (aria-pressed) und `ActionMenuButton` `Aktionen für <Name>` mit Eintrag `Löschen`, alle sichtbaren Texte über `t()`; prüfen: gesendete Ereignisse und Handler-Signaturen unverändert, Leerzustand über `t('empty.fogAreas.*')`
- [ ] 2.2 `src/client/session/AnnotationPanel.tsx` nach design.md D5: Werkzeugwahl als `Toolbar` (Bewegen/Strecke/Kreis/Winkel/Zeichnen, Kürzel V/M/D), Modus/Sichtbarkeit/Einheit als `ChipGroup`, Farbe als `ColorChipGroup` (Deaktivierung wie heute), je Zeile mit Löschrecht ein `ActionMenuButton` `Aktionen für <Eintrag>` mit Eintrag `Entfernen`, Sammelaktionen als Schaltflächen, `entryText`-Chrome-Wörter über `t()`, Mess-Etikett aus `annotationLabel` unverändert; prüfen: gesendete Ziele unverändert, `canDeleteAnnotation`-Gate unverändert

## 3. Wörterbücher & Stylesheet

- [ ] 3.1 Schlüssel aus design.md D6 in `src/client/i18n/de.ts` und `en.ts` ergänzen; prüfen: Schlüsselgleichheit per `pnpm typecheck:src`, Texte buchstabengleich zur Tabelle
- [ ] 3.2 Abschnitt „Werkzeugleisten (ui-toolbar, #96)" nach design.md D7 vor dem Bewegungsblock in `theme.css` ergänzen (`.toolbar`, `.tool-button(--active)`, `.chip(-group)(--active)`, `.color-chip(--*)`, ein `@media (pointer: coarse)` mit ≥ 44 px); prüfen: kein Farbwert außerhalb `:root` außer den Swatch-Werten, genau ein neues `@media`, keine `animation`/`transition` außerhalb des Bewegungsblocks, `pnpm lint` grün

## 4. Abschluss

- [ ] 4.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 96` meldet grün
- [ ] 4.2 App-Test: Fog- und Anmerkungswerkzeuge als Icon-Leisten, aktives Werkzeug Gold; Kürzel V/R/H/M/D wechseln das Werkzeug bei Fokus im Bereich und stehen im Tooltip; Auswahlzähler `<n> Zellen markiert` wächst beim Markieren; Modus/Sichtbarkeit/Einheit als Chips, Farbe als Farbchips mit korrekter Deaktivierung; Bereichszeile mit Aufdeck-Umschalter und ⋮ → `Löschen`; Anmerkungszeile mit ⋮ → `Entfernen` nur wo erlaubt; Touch-Ziele ≥ 44 px; Sprache EN; prüfen: menschliche Freigabe (`constitution.md` §3.4)
