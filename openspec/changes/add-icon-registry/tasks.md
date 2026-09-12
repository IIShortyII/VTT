> Umsetzung über den Harness-Loop (`pnpm harness start 85 add-icon-registry`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/ui-icons/spec.md` — 2 „Registry", 2 „Zugänglichkeit der Icons", 2 „Kataloge
> referenzieren die Registry", 1 „Stylesheet der Icons" — plus die Umstellung der Tests zu
> den MODIFIED-Szenarien in `session-token`) und werden rot bestätigt; der implementer sieht
> sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite
> über den Orchestrator.

## 0. Dependency (Mensch, vor dem test-author)

- [ ] 0.1 Im Feature-Worktree `pnpm add lucide-react` ausführen und `package.json` +
      `pnpm-lock.yaml` committen (`chore(deps): lucide-react als Icon-Satz (#85)`) —
      freigegeben am 2026-09-12 (design.md D9, constitution.md §5.2)

## 1. Tests (test-author)

- [ ] 1.1 Komponententests für Registry und Icons (jsdom-Docblock,
      `@testing-library/react`): die sieben Szenarien aus `specs/ui-icons/spec.md`,
      Testname = Szenarioname; neue Module (`icons.ts`, `Icon.tsx`) per dynamischem Import
      über eine Pfad-Variable mit Rückfall `null` laden (design.md D8), bestehende Module
      statisch; Katalogeinträge als `Record<string, unknown>` lesen; `TokenIconSchema` über
      `safeParse`; das Stylesheet-Szenario liest `theme.css` als Text (Helfer wie in der
      Theme-Suite, dort nichts ändern). Verifizieren, dass jeder Test an seiner Assertion rot
      ist (Registry fehlt, Katalog trägt `symbol` statt `icon`, `TOKEN_ICONS` sind Emoji,
      Selektoren fehlen), nicht an einem Lade- oder Typfehler
- [ ] 1.2 Bestehende Tests zu den MODIFIED-Szenarien in `session-token` umstellen:
      „Spielleiter legt ein Token an" (`icon` `undead` senden und erwarten), „Ungültige
      Felder werden abgelehnt" (vierter Aufruf mit `icon` `💀`), „Spielleiter legt ein Token
      über das Formular an" (Optionsfeld `Untoter` wählen, `icon` `undead` erwarten, alle
      elf Optionsfelder mit Icon prüfen), „Spielleiter entfernt eine Markierung" (Eintrag
      `Liegend` mit `<svg aria-hidden="true">`, `Segen` ohne). Fixtures, die `💀` als
      gespeichertes Symbol tragen, auf `undead` umstellen; keine anderen Tests anfassen

## 2. Implementierung (implementer)

- [ ] 2.1 `src/client/ui/icons.ts` (neu) mit `ICON_NAMES`, `IconName`, `ICON_REGISTRY`
      genau nach design.md D1 (54 Namen, Zuordnungstabelle, benannte Importe aus
      `lucide-react`); `src/client/ui/Icon.tsx` (neu) mit `Icon` und `IconButton` nach D2
- [ ] 2.2 `src/shared/token.ts`: `TOKEN_ICONS` als die zehn Symbolnamen (D3);
      `src/client/session/token-icons.ts` (neu) mit `TOKEN_ICON_LABELS` und
      `TOKEN_ICON_NAMES`; `src/client/session/conditions.ts`: Einträge `{ label, icon }`,
      `conditionIcon`, `conditionAbbreviation` statt `conditionSymbol` (D4)
- [ ] 2.3 `src/client/session/TokenPanel.tsx` nach design.md D6: Symbolauswahl als
      Optionsgruppe `Symbol` mit `Kein Symbol` und den zehn Katalogeinträgen (Icon +
      Beschriftung, `name="icon"`); Markierungsliste `<Tokenname> Markierungen` als Chips
      mit Icon je Katalogeintrag und Icon-only-Schaltfläche `<Tokenname> Markierung
      <Markierung> entfernen`
- [ ] 2.4 `src/client/ui/icon-svg.ts` (neu, `iconSvg` mit Cache) und
      `src/client/map/canvas.ts` nach design.md D5: Token-Symbol und Katalog-Markierungen
      als `Graphics.svg()`-Grafiken (`pivot` 12/12, `scale` `size / 24`), Initiale, Kürzel
      und „+N" weiterhin als `Text`; Zerstörung mit dem Token-Container
- [ ] 2.5 `prisma/migrations/<zeitstempel>_icon-names/migration.sql` (neu) nach design.md
      D7: zehn `UPDATE`-Anweisungen Emoji → Name, dann unbekannte Werte auf `NULL`;
      `schema.prisma` unverändert
- [ ] 2.6 `src/client/app/theme.css`: Abschnitt „Icons" (`.icon`, `.icon-button`,
      `.chip .icon-button`) nach design.md D10, vor dem Bewegungsblock, Format-Vertrag von
      `ui-theme` eingehalten; verifizieren mit `pnpm typecheck:src`, `pnpm lint` und
      `pnpm build`

## 3. Abschluss

- [ ] 3.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 3.2 App-Test durch den Menschen (Worktree: `.env` kopieren, Dev-DB migrieren — die
      Migration schreibt vorhandene Token-Symbole um —, Server und Vite starten): im
      Token-Formular elf Optionsfelder mit Icons in `currentColor`, Tab-Fokus sichtbar;
      angelegtes Token zeigt auf der Karte das SVG-Symbol (kein Emoji), Größe folgt der
      Tokengröße; Tokens aus der Zeit vor der Migration zeigen ihr umgeschriebenes Symbol
      bzw. die Initiale; Markierungen aus dem Katalog erscheinen als Icons am Tokenrand
      und als Chips mit Icon in der Liste, freie Markierungen als Kürzel bzw. ohne Icon,
      ab der vierten „+N"; `Entfernen` als Icon-only-Schaltfläche mit Tooltip-losem
      Screenreader-Namen (aria-label); `Snake` für `Drache` beurteilen; keine
      Konsolenfehler beim Zeichnen
- [ ] 3.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-icon-registry/` verschieben
      (Delta in `openspec/specs/ui-icons/` (neu) sowie die MODIFIED-Blöcke in
      `session-token` einsynchronisieren; Begriff „Symbol" in den Begriffen von
      `session-token` auf die Namen umstellen) und PR mit `Closes #85` öffnen
      (constitution.md §3.6)
