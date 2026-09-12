> Umsetzung über den Harness-Loop (`pnpm harness start 86 add-start-view`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/ui-start/spec.md` — 2 „Hero der Startansicht", 6 „Erstellen und Beitreten auf
> Anforderung", 3 „Sitzungskarten", 3 „Leerzustand", 1 „Stylesheet der Startansicht" —
> plus die Umstellung der Tests zu den MODIFIED-Szenarien in `game-session`, `ui-shell`
> und `user-auth`) und werden rot bestätigt; der implementer sieht sie nie. „Gate grün"
> heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
> Orchestrator.

## 1. Tests (test-author)

- [ ] 1.1 Komponententests für die Startansicht (`tests/ui-start.unit.test.tsx`,
      jsdom-Docblock, `@testing-library/react`): die fünfzehn Szenarien aus
      `specs/ui-start/spec.md`, Testname = Szenarioname; `App` ohne Props rendern, `fetch`
      nach dem Muster der bestehenden Auth-/Sitzungs-/Shell-Tests mocken (für „Antwort
      steht noch aus" ein von Hand aufzulösendes Promise), den Raum nach dem
      Socket-Mock-Muster der Sitzungstests; Adressen ausschließlich nach design.md D8
      (Überschrift Ebene 1, Formulare beim Namen, Liste `Meine Spielsitzungen` und
      Einträge per `within`, Absenden `Beitreten` innerhalb des Formulars,
      `document.activeElement` für den Fokus, `aria-expanded` per Attribut). Das
      Stylesheet-Szenario liest `theme.css` als Text (Helfer wie in der Theme-Suite, dort
      nichts ändern). Verifizieren, dass jeder Test an seiner Assertion rot ist (kein
      `Deine Runde`, keine Schaltfläche `Sitzung leiten`, keine Liste mit Namen, kein
      Leerzustand, Selektoren fehlen), nicht an einem Lade- oder Typfehler
- [ ] 1.2 Bestehende Tests zu den MODIFIED-Szenarien umstellen: `game-session`
      „Sitzungsliste mit Erstellen und Beitreten" (Karte mit `Spielleiter`/`Geschlossen`,
      Schaltflächen `Sitzung leiten`/`Beitreten`, Name-Feld erst nach `Sitzung leiten`,
      Code-Feld erst nach `Beitreten`) und „Beendete Spielsitzung führt zur Liste zurück"
      (Anker `Sitzung leiten`); `ui-shell` „Startansicht ohne Zurück", „Zurück führt aus
      der Bibliothek zur Sitzungsliste", „Zurück führt aus dem Raum zur Sitzungsliste",
      „Abmelden über die Top-Bar" (Anker `Sitzung leiten` statt `Neue Spielsitzung`) und
      „Unteransicht zeigt Zurück als erstes fokussierbares Element" (genau ein
      `svg[aria-hidden="true"]` in der Schaltfläche, kein `‹`); `user-auth` „Angemeldete
      Ansicht bietet die Passwortänderung an" (`details.start-account` ohne `open`,
      Summary `Passwort ändern`, Felder darin); keine anderen Tests anfassen

## 2. Implementierung (implementer)

- [ ] 2.1 `src/client/app/Hero.tsx` (neu) genau nach design.md D1: Overline `Deine Runde`
      (Striche nur per CSS), `<h1 className="hero-title">`, Subline, optionale
      Aktionszeile
- [ ] 2.2 `src/client/session/session-status.ts` (neu) nach design.md D3:
      `SESSION_STATUS_PRESENTATION` (Text, Icon, Varianten-Klasse je Zustand) und
      `ROLE_LABELS`
- [ ] 2.3 `src/client/session/SessionList.tsx` nach design.md D4: Hero mit `Sitzung leiten`
      (`primary`, `aria-expanded`), `Beitreten` (`aria-expanded`), `Kartenbibliothek`
      (`link`); Erstellen-/Beitreten-Formular als `.panel` nur bei geöffnetem `panel`
      (`aria-labelledby` auf die `h2`, `autoFocus` auf dem Feld, `Abbrechen`, Erfolg
      schließt und lädt neu, Ablehnung bleibt offen); `sessions` `null` bis geladen;
      Leerzustand `.empty-state`; Liste `ul.session-cards` mit `aria-label`, Karten mit
      `h3`, Zustandspille (`status-pill` + Variante, Icon + Text), Rolle (Icon + Text),
      `Betreten`; `details.start-account` mit Summary `Passwort ändern`; Prop `user`
      entfernt
- [ ] 2.4 `src/client/app/App.tsx` nach design.md D2: anonymer Zweig mit `Hero` und
      `div.panel.auth-panel` um `LoginForm`/`RegisterForm`; `SessionList` ohne `user`;
      `src/client/auth/LoginForm.tsx` und `RegisterForm.tsx`: `<h2>` statt `<h1>`, Labels
      `field-label`, Fehler `field-error`, Absenden `primary`, Umschalter `link` (Texte
      unverändert); `src/client/auth/ChangePasswordForm.tsx` nach D5 ohne `<h2>`, Labels
      `field-label`
- [ ] 2.5 `src/client/app/AppShell.tsx` nach design.md D6: `<Icon name="back" />` statt
      `‹`, zugänglicher Name `Zurück` unverändert
- [ ] 2.6 `src/client/app/theme.css`: Abschnitt „Startansicht" mit den zwölf Selektoren
      und Hilfsregeln nach design.md D7, nach dem Icons-Abschnitt und vor dem
      Bewegungsblock, Format-Vertrag von `ui-theme` eingehalten (nur `var(--…)`, kein
      Farbwert, kein `@media`, keine Bewegungsdeklaration); verifizieren mit
      `pnpm typecheck:src`, `pnpm lint` und `pnpm build`

## 3. Abschluss

- [ ] 3.1 Gate grün (Typecheck, Lint, komplette Jest-Suite inkl. der bestehenden Tests),
      Review „ok"
- [ ] 3.2 App-Test durch den Menschen (Worktree: `.env` kopieren, Dev-DB migrieren, Server
      und Vite starten): anonym Hero mit Gold-Overline „— DEINE RUNDE —", Serif-Titel,
      muted Subline, Anmeldekarte mittig (max. 26rem), Umschalter als Link; Registrierung
      mit demselben Hero; angemeldet Hero „Meine Spielsitzungen" mit Gold-Schaltfläche
      `Sitzung leiten`, `Beitreten`, Link `Kartenbibliothek` mit Icons; ohne Sitzungen der
      Leerzustand; `Sitzung leiten` klappt das Panel auf, Fokus im Namensfeld, `Abbrechen`
      schließt, zweiter Klick schließt; `Beitreten` schließt das Erstellen-Panel;
      erstellte Sitzung erscheint als Karte (Serif-Name, Pille mit Icon, Rolle, `Betreten`
      rechts); Pillen-Farben für Läuft/Pausiert/Geöffnet/Geschlossen (Sitzung im Raum
      starten/pausieren/beenden, zurück zur Liste); abgelehnter Code zeigt die Meldung im
      Panel; Passwortänderung unten zugeklappt, aufklappbar, funktioniert; `Zurück` in
      Raum und Bibliothek mit Chevron-Icon; keine Konsolenfehler
- [ ] 3.3 Change nach `openspec/changes/archive/YYYY-MM-DD-add-start-view/` verschieben
      (Delta in `openspec/specs/ui-start/` (neu) sowie die MODIFIED-Blöcke in
      `game-session`, `ui-shell` und `user-auth` einsynchronisieren) und PR mit
      `Closes #86` öffnen (constitution.md §3.6)
