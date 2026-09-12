> Umsetzung über den Harness-Loop (`pnpm harness start 83 add-ui-theme`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/ui-theme/spec.md` — 4 „Design-Tokens", 2 „Schriften aus dem Bundle", 2
> „Grundelemente", 1 „Bewegung nur opt-in", 1 „Einbindung") und werden rot bestätigt; der
> implementer sieht sie nie. „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die
> vollständige Jest-Suite über den Orchestrator.

## 0. Dependencies (Mensch, vor dem test-author)

- [ ] 0.1 Im Feature-Worktree `pnpm add @fontsource/marcellus @fontsource/sora` ausführen
      und `package.json` + `pnpm-lock.yaml` committen
      (`chore(deps): @fontsource/marcellus und @fontsource/sora self-hosted (#83)`) —
      freigegeben am 2026-09-12 (design.md D8, constitution.md §5.2)

## 1. Tests (test-author)

- [ ] 1.1 Unit-Tests in einer neuen Theme-Suite (`tests/ui-theme.unit.test.ts`, Umgebung
      `node`, kein jsdom): die 10 Szenarien aus `specs/ui-theme/spec.md`, Testname =
      Szenarioname. Dateien per `readFileSync` relativ zu `process.cwd()` als Text lesen, mit
      Fallback auf `''` bei fehlender Datei (design.md D7 Nr. 9); Helfer in der Suite:
      Kommentare entfernen, Whitespace normalisieren, Tokenblock ausschneiden, Tokens in
      eine Map parsen und `var(--…)`-Ketten auflösen, relative Luminanz und
      Kontrastverhältnis nach der Formel in „Begriffe", Klammerzählung für die
      `@media`-Zuordnung. Keine neue Dependency, kein CSS-Parser. Verifizieren, dass alle
      Tests rot sind, weil `theme.css` fehlt (leerer Text → Assertion schlägt fehl) und
      `main.tsx` die Import-Zeile nicht enthält — nicht wegen eines Lese- oder
      Typfehlers

## 2. Stylesheet (implementer)

- [ ] 2.1 `src/client/app/theme.css` (neu) genau nach design.md: vier `@import`-Zeilen (D3),
      `:root`-Block mit allen Tokens (D1), Basis und Grundelemente (D4, in der dort
      genannten Reihenfolge, insbesondere `:focus-visible` vor der Eingabefeld-Fokusregel),
      ein Bewegungsblock am Dateiende (D5); Format-Vertrag D7 einhalten (Kommentare ohne
      Farbwerte, Selektorlisten in der gelisteten Reihenfolge, kein Farbwert außerhalb von
      `:root`); verifizieren mit `pnpm build` (Vite löst die `@fontsource`-Importe auf und
      bündelt die `woff2`-Dateien)
- [ ] 2.2 `src/client/main.tsx`: erste Import-Zeile `import './app/theme.css'` (D6); sonst
      unverändert; `index.html` und alle Komponenten bleiben unverändert; verifizieren mit
      `pnpm typecheck:src` und `pnpm lint`

## 3. Abschluss

- [ ] 3.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 3.2 App-Test durch den Menschen (Worktree: `.env` kopieren, Dev-DB migrieren, Server
      und Vite starten): Netzwerk-Tab ohne Anfragen an externe Hosts (keine Google Fonts);
      dunkler Hintergrund, Text hell, `h1`/`h2` in der Serif (Marcellus), alles andere in
      Sora; Schaltflächen mit Fläche, Rahmen und Radius 6, Hover heller, deaktiviert
      halbtransparent; Eingabefelder dunkel mit goldenem Ring beim Tab-Fokus; Tab-Fokus auf
      Schaltflächen und Links in teal; Formularfehler und Hinweise weiterhin lesbar; im
      Betriebssystem „Bewegung reduzieren" einschalten → keine Übergänge beim Hover;
      Login, Registrierung, Sitzungsliste, Raum und Kartenbibliothek funktional wie zuvor
      (Canvas-Höhen unverändert)
- [ ] 3.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-ui-theme/` verschieben
      (Delta in `openspec/specs/ui-theme/` (neu) einsynchronisieren) und PR mit
      `Closes #83` öffnen (constitution.md §3.6)
