## Context

`start` (`.harness/orchestrator.ts`, ~Z. 223) macht heute drei Dinge in dieser Reihenfolge:
Pausenprüfung → `git fetch` + `git worktree add -B feat/${i}` → Existenzprüfung des Worktree
(fail-closed) → `seedChangeDocs` → `writeStatus` → `next()`. Die Unterprozess-Aufrufe laufen
über den bereits vorhandenen `run: Sh = sh`-Parameter (`Sh = (cmd, cwd?) => { ok, out }`),
sodass Tests einen Stellvertreter injizieren können. `seedChangeDocs` nutzt dagegen `sh`
direkt und läuft nur, wenn `openspec/changes/<change>` existiert.

Der Change hängt sich zwischen die Existenzprüfung und `seedChangeDocs`. Alles davor
(fail-closed-Prüfung) und danach (Seeding, Run-State, `next()`) bleibt unberührt.

## Goals / Non-Goals

**Goals:**
- Ein Worktree, der nach `start` ohne Handarbeit gate-fähig ist (`node_modules` vorhanden).
- Eine fehlende `.env` wird an der Stelle gemeldet, an der sie entsteht — nicht erst als
  kryptischer `loadConfig()`-Fehler beim App-Test.
- Der Branchname erfüllt die in `AGENTS.md` dokumentierte Konvention, ohne sie umzuschreiben.

**Non-Goals:**
- Keine Migrations-Erkennung (zur `start`-Zeit nicht möglich, s. proposal.md).
- Kein Anlegen/Kopieren einer `.env` (§5.1).
- Kein Abbruch bei fehlgeschlagenem `pnpm install` — parallel zu den bestehenden, ebenfalls
  ungeprüften `git`-Aufrufen von `start`; ein scheiternder Install fällt spätestens am Gate auf.

## Decisions

**D1 — `pnpm install` über den `run`-Parameter, im Worktree-Verzeichnis, nach der
Existenzprüfung.** `run('pnpm install', worktreeDir(i))` läuft, sobald die fail-closed-Prüfung
den Worktree bestätigt hat, und vor `seedChangeDocs`. Über `run` (nicht `sh`), damit ein Test
den Aufruf ohne echtes `pnpm` abfangen kann — dieselbe Naht, die `start` schon für `git` nutzt.
Bewusst plain `pnpm install`, nicht `--frozen-lockfile`: das ist die lokale Einrichtung einer
Agenten-/Menschen-Maschine (`AGENTS.md` reserviert `--frozen-lockfile` für CI), und ein
minimal abweichender Lockfile soll die lokale Einrichtung nicht hart abbrechen.

**D2 — `.env`-Vorbedingung: melden über `console.error`, kein Abbruch, kein Schreiben.** Nach
dem Install prüft `start`: existiert `join(worktreeDir(i), '.env.example')` und fehlt
`join(worktreeDir(i), '.env')`, geht eine benannte Zeile auf die Fehlerausgabe (wie schon der
Board-Fehlschlag und die Leak-Degradation über `console.error` melden). Kein `fail()` — die
fehlende `.env` ist eine Vorbedingung für den späteren App-Test, kein Grund, den Lauf jetzt
abzubrechen. Geprüft wird im Worktree, nicht im Hauptrepo: dort braucht die App die Datei, und
der frische Worktree trägt die getrackte `.env.example` von `origin/main`, aber nie die
gitignorete `.env`. `start` schreibt die Datei nicht (§5.1: der Umgang mit Credentials ist
Menschensache) — Melden statt Handeln, wie beim Umgang mit Migrationen.

**D3 — Branchname aus dem Change-Namen.** `const branch = change ? \`feat/${i}-${change}\` :
\`feat/${i}\``. Der Change-Name ist der an `start` übergebene OpenSpec-Name; OpenSpec erzwingt
kebab-case, das damit direkt git-ref-tauglich ist — keine Slug-/Sanitize-Logik nötig, kein
`gh`-Aufruf für den Issue-Titel. Ohne Change-Name bleibt der bisherige `feat/${i}` als
Fallback, damit ein `start` ohne Change (älterer Aufrufweg) weiter funktioniert. Der berechnete
Name geht unverändert in `git worktree add -B <branch>` und in `writeStatus({ branch })`.

**D-Test — Naht ohne neuen fs-Stellvertreter.** Die bestehende Testweise (echte Dateien/Ordner
unter `worktreeDir(issue)`, injizierter `run`, `console`-Spies) trägt auch hier: der Test legt
`worktreeDir(issue)` von Hand an (damit die Existenzprüfung greift, ohne echtes
`git worktree add`), erzeugt bzw. lässt `.env.example`/`.env` weg, und übergibt einen `run`,
der die Kommandos protokolliert. `seedChangeDocs` bleibt inert, solange der Test einen
Change-Namen ohne zugehöriges `openspec/changes/<change>`-Verzeichnis übergibt — so löst kein
echter `git`-Aufruf aus.

## Risks / Trade-offs

- **`pnpm install` ist langsam und kann online gehen.** Es läuft einmal je `start`, also einmal
  je Feature — akzeptabel; ohne es scheitert das erste Gate ohnehin und kostet mehr.
- **Die `.env`-Warnung feuert bei fast jedem Lauf** (die `.env` ist gitignored und fehlt im
  frischen Worktree fast immer). Das ist beabsichtigt: sie ist genau dann die richtige
  Erinnerung. Der `.env`-vorhanden-Zweig (keine Meldung) verhindert Rauschen, wenn der Mensch
  die Datei bereits abgelegt hat.
- **Ungeprüfter Install-Rückgabewert** könnte einen stillen Fehlschlag verdecken. Bewusst in
  Kauf genommen (Non-Goal): konsistent mit den vorhandenen `git`-Aufrufen, und der Fehlschlag
  wird am Gate sichtbar. Ein Abbruch hier wäre eigener Scope samt Szenario.
