# AGENTS.md

Kanonische Anweisungsdatei für Coding-Agenten. Gilt zusätzlich zur `constitution.md`
(dort die bindenden Invarianten). Diese Datei beschreibt, *wie* in diesem Repo gearbeitet wird.

> **Blaupause:** Die Abschnitte *Kommandos*, *Projektstruktur*, *Konventionen* und
> *Versionen* sind projektspezifisch und beim Aufsetzen eines neuen Projekts zu füllen.
> Alles darunter (*Tests*, *Harness-Gate*, *Kritische Grenzen*, *Commits & PRs*) beschreibt
> das Verhalten der Harness selbst und wird unverändert übernommen.

## Kommandos
- Install: `pnpm install` (CI: `pnpm install --frozen-lockfile`)
- Dev: `pnpm dev` — **noch nicht konfiguriert.** Die Harness startet damit die App für den
  menschlichen App-Test (constitution.md §3.4); ohne dieses Skript bricht der Loop dort ab.
- Build: `pnpm build` — **noch nicht konfiguriert.**
- Typecheck: `pnpm typecheck` (tsc --noEmit)
- Lint: `pnpm lint` · Autofix: `pnpm lint:fix`
- Format: `pnpm format` (Prettier)
- Unit-Tests: `pnpm test:unit`
- Integrationstests (ephemere DB): `pnpm test:integration`
  — muss eine ephemere Wegwerf-Instanz hochfahren, migrieren und danach aufräumen
  (z. B. Testcontainers). Braucht Docker/WSL2.
- Alle Tests: `pnpm test`
- Harness-eigene Tests: `pnpm test:harness`
- Migrationen laufen NUR gegen die ephemere Test-DB (über `test:integration`).
  Niemals lokal gegen eine produktive Zielumgebung (siehe constitution.md §6).

## Projektstruktur
- `src/` — Anwendungscode
- `tests/` — Tests (`*.unit.test.ts(x)`, `*.integration.test.ts`)
- `openspec/` — Specs & Changes (Intent-Quelle)
- `.claude/agents/` — Subagent-Definitionen
- `.harness/` — Orchestrierungs-Skill/Skript & Run-State (`runs/`, `wt/` sind gitignored)

## Konventionen (projektspezifisch — beim Aufsetzen füllen)
Hier gehören die Stack-Entscheidungen hin, die ein Agent nicht aus dem Code ableiten kann.
Format: **eine Regel, ein Codebeispiel** — knapp genug, dass die Datei in jeden Prompt passt.
Erfahrungsgemäß lohnen sich Einträge zu:

- Server-State / Datenabruf (welche Bibliothek, welches Muster)
- Datenzugriff (ORM/Query-Layer; ob rohes SQL zulässig ist)
- Eingabe-Validierung an den Systemgrenzen (welche Bibliothek, wo sie greift)
- Fehler-Handling (zentraler Handler; kein stilles `catch {}`)
- HTTP-Mocking in Tests (Bibliothek statt Patchen von `fetch`)
- UI-/Komponenten-Bibliothek und ob Basis-Elemente selbst gebaut werden dürfen
- Bekannte Import-/Resolver-Stolpersteine des Stacks samt Workaround
- Testumgebung pro Testart (z. B. Docblock statt globaler Umgebung, damit Backend-Tests
  weiter unter `node` laufen)

Was hier steht, ist für den `implementer` die einzige Quelle für Stilfragen — er sieht die
Tests nicht und kann sich nicht an ihnen orientieren.

## Tests
- Pro GIVEN/WHEN/THEN-Szenario genau ein Test; Testname = Szenarioname.
- Verhalten mit DB-Bezug → Integrationstest gegen die ephemere DB.
  Reine Logik/Komponenten → Unit-Test.
- Der Test entsteht vor der Implementierung und wird rot bestätigt.
- Harness-eigene Tests (Guard-Regeln etc.) liegen unter `.harness/tests/`, außerhalb der
  App-Testsuite, und laufen über `pnpm test:harness` — sie unterliegen nicht den
  Rollen-Pfadregeln von test-author/implementer.

## Harness-Gate (`pnpm harness gate <issue>`)
- Runde 0/1 (erster Implementierungsversuch bzw. erste Nacharbeit): Volllauf als
  Referenzlauf — Typecheck + Lint + komplette Jest-Suite.
- Ab Runde 2: zuerst `jest --onlyFailures` als Abkürzung; bleibt das rot, wird der Volllauf
  für diese Runde übersprungen (Kostenersparnis bei bekanntermaßen noch fehlerhaften Tests).
  Erst wenn die Abkürzung grün ist, folgt der bestätigende Volllauf. Grün meldet das Gate
  ausschließlich nach bestätigtem Volllauf — die Abkürzung ist reine Optimierung im Rot-Fall,
  ändert nichts an §3.2 der constitution.md.
- Typecheck läuft durchgehend mit `tsc --incremental` (tsBuildInfo im Run-Verzeichnis unter
  `.harness/runs/<issue>/`, nicht im Worktree — vermeidet Commit-Rauschen).
- Fehlerfeedback an den Implementer enthält die vollständige Matcher-Ausgabe (Diff,
  DOM-Ausgabe) bis zur Codeframe-/Stacktrace-Grenze, nie Testquellcode.

## Kritische Grenzen (immer)
- Niemals Secrets/Credentials committen oder ausgeben.
- Niemals Migrationen/Deploys gegen die produktive Zielumgebung ausführen (nur CI-Pipeline).
- Niemals direkt auf `main` pushen; Änderungen nur per PR.
- Keine neuen Dependencies ohne menschliche Freigabe — Bedarf + Begründung
  nennen, nicht selbst installieren.
- implementer: Testdateien weder lesen noch ändern. Auch die Testsuite selbst nicht
  ausführen — ihre Ausgabe enthält Testquellcode. Das Gate läuft über den Orchestrator.

## Commits & PRs
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Branch: `feat/<issue>-<kurz>`; ein OpenSpec-Change je Branch.
- Vor dem Öffnen eines PR (siehe constitution.md §3.4): App im Feature-Worktree starten
  (`pnpm dev`), dem Menschen den lokalen Link plus eine Liste der Changes zum manuellen
  Testen präsentieren und auf explizite Freigabe warten. Erst danach wird der zugehörige
  OpenSpec-Change ins `archive/`-Verzeichnis verschoben (im selben Branch/Commit) und der
  PR geöffnet — ein nachträglicher, separater Archivierungs-PR entfällt damit.
- Jeder PR verlinkt sein Issue (`Closes #<n>`) und seinen OpenSpec-Change. Squash-Merge.
- Review-Sign-off: GitHub verbietet Autoren, den eigenen PR zu approven. Reviewer-
  Rolle liefert das inhaltliche Urteil (siehe constitution.md §2/§3.3); der
  menschliche Sign-off erfolgt als PR-Review vom Typ **Comment** (nicht Approve)
  durch den freigebenden Menschen, danach regulärer Squash-Merge. Der
  Admin-Bypass ist nur für den Fall reserviert, dass ein Required Check aus
  akzeptiertem Grund rot bleibt (z. B. `traceability` bei reinen Chore-PRs).
- Nach dem Merge: `pnpm harness cleanup <issue>` entfernt den Feature-Worktree.

## Versionen
- Es gelten die Versionen aus `package.json`. Keine Major-Upgrades ohne Freigabe.
