## 1. Tests (test-first, vor der Implementierung)

- [x] 1.1 Test „start installiert die Abhängigkeiten im neuen Worktree" in
  `.harness/tests/orchestrator.test.ts`: Worktree-Dir von Hand anlegen, `run`-Stellvertreter
  protokolliert Kommandos, `start(issue, change, run)` aufrufen; verifizieren, dass `run` einen
  `pnpm install`-Aufruf mit `cwd = worktreeDir(issue)` erhält.
- [x] 1.2 Test „Fehlende .env wird als Vorbedingung gemeldet, ohne sie anzulegen": im Worktree
  `.env.example` anlegen, `.env` weglassen; `console.error`-Spy; verifizieren, dass eine
  benannte `.env`-Vorbedingung gemeldet wird, keine `.env` entsteht und `start` nicht abbricht.
- [x] 1.3 Test „Vorhandene .env erzeugt keine Meldung": `.env.example` **und** `.env` im
  Worktree; verifizieren, dass keine `.env`-Vorbedingungsmeldung erfolgt.
- [x] 1.4 Test „Mit Change-Name entsteht feat/<issue>-<change>": `start(issue, change, run)`;
  verifizieren, dass der `git worktree add -B`-Aufruf den Branch `feat/<issue>-<change>` trägt
  und `status.json` denselben Branch festhält.
- [x] 1.5 Test „Ohne Change-Name fällt der Name auf feat/<issue> zurück":
  `start(issue, undefined, run)`; verifizieren, dass der Branch `feat/<issue>` heißt.
- [x] 1.6 Alle fünf Tests laufen und sind aus dem richtigen Grund rot (erwartete Assertion,
  kein Setup-/Compile-Fehler) — Rot bestätigen via `pnpm test:harness`.

## 2. Implementierung (`.harness/orchestrator.ts`, `start`)

- [x] 2.1 Branchname: `feat/${i}` durch `change ? \`feat/${i}-${change}\` : \`feat/${i}\``
  ersetzen; berechneten Namen in `git worktree add -B` und `writeStatus({ branch })` verwenden.
  Verifikation: Tests 1.4/1.5 grün.
- [x] 2.2 Nach der Worktree-Existenzprüfung, vor `seedChangeDocs`: `run('pnpm install',
  worktreeDir(i))`. Verifikation: Test 1.1 grün.
- [x] 2.3 Danach `.env`-Vorbedingung melden: existiert `<worktree>/.env.example` und fehlt
  `<worktree>/.env`, eine benannte Zeile über `console.error` — kein `fail()`, kein Schreiben.
  Verifikation: Tests 1.2/1.3 grün.

## 3. Gate & Review

- [x] 3.1 Deterministisches Gate grün: `pnpm test:harness` + `pnpm typecheck` + `pnpm lint`.
- [x] 3.2 Reviewer-Subagent gegen Spec, Konventionen und Defekt-Checkliste; Empfehlung „ok".

## 4. App-Test & Archivierung

- [x] 4.1 Menschlicher Nachweis: `start` in einem realen Durchlauf beobachten (frischer
  Worktree hat `node_modules`, Branch heißt `feat/<issue>-<change>`, `.env`-Meldung erscheint
  bei fehlender `.env`); explizite Freigabe des Menschen abwarten.
- [x] 4.2 OpenSpec-Change nach `openspec/changes/archive/YYYY-MM-DD-setup-start-worktree/`
  verschieben (gleicher Branch/Commit-Bereich) und PR öffnen (`Closes #24` + Verweis auf den
  archivierten Change).
