> Umsetzung über den Harness-Loop (`pnpm harness start 84 add-app-shell`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/ui-shell/spec.md` — 6 „Top-Bar", 2 „Inhaltsbereich und Footer", 1 „Stylesheet der
> Shell" — plus die Umstellung der Tests zu den MODIFIED-Szenarien in `user-auth`,
> `game-session` und `map-library`) und werden rot bestätigt; der implementer sieht sie nie.
> „Gate grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
> Orchestrator.

## 0. Vorbereitung (Mensch, vor dem test-author)

- [x] 0.1 Im Feature-Worktree `vite.config.ts` durch die von der Sitzung bereitgestellte
      Fassung mit `define` (`__APP_VERSION__`, `__BUILD_SHA__`) ersetzen, in `package.json`
      `"version": "0.1.0"` setzen und beides committen
      (`chore(build): Version und Build-SHA als Vite-Defines (#84)`) — beide Dateien liegen
      außerhalb der Rollen-Pfadbereiche (design.md D2, constitution.md §2.4)

## 1. Tests (test-author)

- [x] 1.1 Komponententests für die Shell (jsdom-Docblock, `@testing-library/react`): die
      neun Szenarien aus `specs/ui-shell/spec.md`, Testname = Szenarioname; `App` ohne Props
      rendern, `fetch` nach dem Muster der bestehenden Auth-/Sitzungs-/Bibliothekstests
      mocken, den Raum nach dem Socket-Mock-Muster der Sitzungstests; Adressen ausschließlich
      nach design.md D6 (Landmarks `banner`/`main`/`contentinfo`, Schaltflächen `Zurück` und
      `Abmelden` beim Namen, `document.activeElement` für den Fokus). Das
      Stylesheet-Szenario liest `theme.css` als Text (Helfer wie in der Theme-Suite, dort
      nichts ändern). Verifizieren, dass jeder Test an seiner Assertion rot ist (kein
      `<header>`, keine Schaltfläche `Zurück`, kein `<footer>`), nicht an einem Lade- oder
      Typfehler
- [x] 1.2 Bestehende Tests zu den MODIFIED-Szenarien umstellen: „Fehlgeschlagene Abmeldung
      wird angezeigt" (Verbleib über Nutzername und `Abmelden` in der Top-Bar statt
      „Angemeldet als"), „Angemeldete Ansicht bietet die Passwortänderung an" (ohne Bezug
      auf eine Abmeldung daneben), „Sitzungsliste mit Erstellen und Beitreten" (keine
      Abmeldung in der Liste, keine Schaltfläche `Zurück`), „Verlassen gibt die
      Kartenansicht frei" (Schaltfläche `Zur Bibliothek`); keine anderen Tests anfassen

## 2. Implementierung (implementer)

- [x] 2.1 `src/client/app/build-info.ts` (neu, `BuildInfo`, `FALLBACK_BUILD`) und
      `src/client/vite-env.d.ts` (neu, Deklaration der beiden Defines) nach design.md D2
- [x] 2.2 `src/client/app/AppShell.tsx` (neu) genau nach design.md D1: Header mit
      `Zurück` (nur bei `canGoBack`, `autoFocus`, Chevron aria-hidden), Marke (`VTT` in
      eigenem Element), Konto (Nutzername · `Abmelden`); `main.app-shell` mit globalem
      Hinweis (`role="alert"`) und `children`; Footer `Version <version> · Build <sha>`
- [x] 2.3 `src/client/app/App.tsx` nach design.md D3: jede Ansicht in `AppShell`,
      `canGoBack`/`onBack`/`account`/`onLogout`/`hinweis`/`build` verdrahtet, Prop
      `build?: BuildInfo`; `src/client/main.tsx` liest die Defines mit `typeof`-Wächter und
      übergibt `build`
- [x] 2.4 Ansichten nach design.md D4: `SessionList` ohne „Angemeldet als", `Abmelden`,
      `hinweis` (Props `onLogout`/`hinweis` entfernt); `SessionRoom` ohne „Zurück zur Liste"
      (Prop `onLeave` entfernt); `MapLibrary` ohne „Zurück zur Sitzungsliste" (Prop `onBack`
      entfernt), innere Schaltfläche `Zur Bibliothek`
- [x] 2.5 `src/client/app/theme.css`: Abschnitt „Shell" mit den sieben Selektoren nach
      design.md D5, vor dem Bewegungsblock, Format-Vertrag von `ui-theme` eingehalten;
      verifizieren mit `pnpm typecheck:src`, `pnpm lint` und `pnpm build`

## 3. Abschluss

- [x] 3.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [x] 3.2 App-Test durch den Menschen (Worktree: `.env` kopieren, Dev-DB migrieren, Server
      und Vite starten): Top-Bar sticky mit Gold-Haarlinie, Marke mittig in der Serif mit
      weitem Letter-Spacing, rechts Nutzername · Abmelden; Anmeldeformular ohne Konto und
      ohne Zurück; Sitzungsliste ohne Zurück, ohne „Angemeldet als"; Raum und Bibliothek mit
      `Zurück` links, das nach dem Wechsel den Fokus hat (Tab-Ring sichtbar) und zur Liste
      führt; Kartenansicht mit `Zur Bibliothek`; Inhalt zentriert (max. 55rem); Footer
      unten mit echter Version `0.1.0` und dem Kurz-SHA des Worktree-Commits; Abmelden aus
      dem Raum heraus führt zum Anmeldeformular; Server stoppen → Hinweis erscheint oben
      im Inhaltsbereich
- [x] 3.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-app-shell/` verschieben
      (Delta in `openspec/specs/ui-shell/` (neu) sowie die MODIFIED-Blöcke in
      `user-auth`, `game-session` und `map-library` einsynchronisieren) und PR mit
      `Closes #84` öffnen (constitution.md §3.6)
