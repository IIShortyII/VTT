## Why

`pnpm harness start` legt den Worktree an und kopiert den OpenSpec-Change hinein — mehr nicht.
Was ein frischer Worktree zum Arbeiten braucht, fehlt danach und muss von Hand nachgeholt
werden: ohne `node_modules` scheitert jeder Gate-Lauf am fehlenden Jest, und ohne `.env`
verweigert `loadConfig()` beim menschlichen App-Test (§3.4) den Dienst. Beim ersten Feature-Run
(#12) kam jeder Punkt einzeln und als Überraschung. Zusätzlich widerspricht der Branchname:
`start` bildet `feat/<issue>`, `AGENTS.md` schreibt `feat/<issue>-<kurz>`. Siehe Issue #24.

## What Changes

- **`start` installiert die Abhängigkeiten im neuen Worktree.** Nach erfolgreichem
  `git worktree add` und der bestehenden Worktree-Existenzprüfung führt `start`
  `pnpm install` im Worktree-Verzeichnis aus — vor `seedChangeDocs`, `writeStatus` und dem
  ersten `next()`. Ohne diesen Schritt hat der frische Worktree kein Jest, und das erste Gate
  scheitert nicht an den Tests, sondern an der fehlenden Werkzeugkette.
- **`start` meldet eine fehlende `.env` als benannte Vorbedingung.** Existiert `.env.example`,
  fehlt aber `.env` im Worktree, gibt `start` eine benannte Warnung auf der Fehlerausgabe aus.
  Es **kopiert oder erzeugt keine `.env`**: die Datei trägt real gelesene Config/Credentials,
  deren Umgang `constitution.md` §5.1 dem Menschen vorbehält. Gemeldet, nicht gehandelt — wie
  beim Umgang mit Migrationen. Der Lauf wird dadurch **nicht** abgebrochen.
- **Der Branchname folgt der Konvention `feat/<issue>-<kurz>`.** `<kurz>` wird aus dem an
  `start` übergebenen OpenSpec-Change-Namen abgeleitet (bereits kebab-case, deterministisch,
  liegt `start` ohnehin vor — kein zusätzlicher `gh`-Aufruf für den Issue-Titel). Ohne
  übergebenen Change-Namen bleibt es beim Fallback `feat/<issue>`. Ersetzt das bisherige harte
  `feat/${i}`.

**Unverändert:** Zustandsautomat, Rundenzähler, Gate-Reihenfolge, Rollenrouting, Run-State,
`seedChangeDocs` und die Worktree-Existenzprüfung (die fail-closed bleibt). Die neuen Schritte
hängen sich zwischen die Existenzprüfung und `seedChangeDocs`; die Reihenfolge davor und danach
bleibt.

**Nicht im Umfang:**
- **Keine Migrations-Vorbedingung.** Ob ein Change das Prisma-Schema ändert, entscheidet sich
  erst in der Implementierung — die *nach* `start` läuft. Zur `start`-Zeit ist der Worktree
  `origin/main` plus eingeseedete Docs; eine Schemaänderung ist dort nicht detektierbar. Die
  Migrations-Erinnerung gehört an den App-Test (`present-app-review`) und wird, falls nötig, zu
  einem eigenen Folge-Issue.
- **Keine `.env`-Vorbelegung.** `start` legt die Datei nicht aus `.env.example` an (§5.1).
- **Keine Änderung an `AGENTS.md`.** Die dort dokumentierte Konvention `feat/<issue>-<kurz>`
  wird vom Code jetzt erfüllt, nicht umgeschrieben.

## Capabilities

### New Capabilities
- `harness-worktree-setup`: Was `pnpm harness start` beim Anlegen eines Worktree über das
  Klonen hinaus einrichtet — Installation der Abhängigkeiten, Meldung fehlender Vorbedingungen
  ohne Eingriff in Credentials — und nach welcher Regel der Feature-Branch benannt wird.

### Modified Capabilities
Keine — `start` hat bisher keine eigene Spec.

## Impact

- `.harness/orchestrator.ts` (`start`: Branchname, `pnpm install`, `.env`-Meldung),
  `.harness/tests/orchestrator.test.ts` (neue Szenarien)
- Kein Anwendungscode (`constitution.md` §1.4: Harness und Anwendung nie im selben PR)
- Keine neuen Dependencies — `pnpm` ist Voraussetzung des Loops, die `Sh`-Injektion (`run`) für
  das Mocken der Aufrufe ist im `start`-Signatur bereits vorhanden
- **Berechtigung:** `pnpm install` im Worktree läuft autonom nach §5.3 (lokaler Build/Install).
  Die `.env`-Meldung ist reines Lesen und Melden; ein Schreiben in die Credential-Datei
  unterbleibt bewusst (§5.1).
