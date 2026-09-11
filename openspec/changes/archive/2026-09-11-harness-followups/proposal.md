## Why

Vier kleine Beobachtungen aus den Läufen zu #13 und #6 (Issue #44, Punkte 4, 6, 7, 8), jede
für sich eine Pause oder eine Fehlsuche wert, keine groß genug für einen eigenen Change:

**4. `cleanup` beendet keine Dev-Server, und niemand merkt es.** Der Server aus dem
#25-Worktree lief nach `cleanup 25` weiter, hielt Port 3001 und die gelöschte `dev.db` per
Handle offen. Beim App-Test zu #13 sah der Mensch über den Vite-Proxy alten Code und ein altes
Konto; der neue Server war still am belegten Port gescheitert. Beim Schreiben dieses Changes
lief auf derselben Maschine wieder ein verwaister `node --import tsx src/server/index.ts` —
ohne Worktree-Pfad in der Kommandozeile, so startet ihn `pnpm dev:server`.

**6. Der Leak-Wächter meldet sich erst nach dem Rollenwechsel.** `assertNoTestLeak` läuft in
`build-impl-prompt`, also wenn der Marker schon auf `implementer` steht. Bei #6 traf er ein
Code-Snippet aus `design.md` und danach die Dateinamen der Testdateien in `design.md` und
`tasks.md` — zwei Pausen, weil die Docs unter einer Rolle nicht korrigierbar sind.

**7. `record-round-summary` mit JSON-Argument scheitert unter cmd.exe.** pnpm reicht das
Argument durch cmd.exe; Klammern und Semikolons brechen dessen Parser (Exit 255), Umlaute
kommen verstümmelt an. Der stdin-Weg (`-`) funktioniert und steht so im Skill; der
Argument-Weg ist trotzdem noch da und lädt zum Fehler ein.

**8. `start` meldet einen Git-Fehler, der keiner ist.** `removeUntrackedSourceDocs` fragt mit
`git ls-files --error-unmatch`, und git schreibt bei „untracked" eine `error: pathspec …`-Zeile
auf stderr — obwohl genau das die erwartete Antwort ist. Kosmetisch, aber jeder Lauf beginnt
mit einer Fehlermeldung.

Teil 3 von 3 zu #44. Nach `constitution.md` §1.4 eigener Branch, eigener PR, kein
Anwendungscode.

## What Changes

- **Portprüfung vor dem App-Test und beim Aufräumen.** Beim Emittieren von
  `present-app-review` und in `cleanup` prüft der Harness, ob Port 3001 oder 5173 belegt ist,
  und nennt je Port PID und Kommandozeile auf stderr (Windows: `netstat -ano` +
  `Get-CimInstance`; POSIX: `ss -ltnp` + `ps`). Beiwerk wie das Board: blockt nie; ein
  fehlendes Werkzeug ergibt eine Zeile, keinen Abbruch. Beenden bleibt Menschensache
  (`constitution.md` §5.1). Entscheidung des Menschen vom 2026-09-11: Portbelegung statt
  Worktree-Pfad in der Kommandozeile — den gibt es unter Windows nicht.
- **Der Leak-Wächter läuft, sobald er etwas prüfen kann.** In `start` gegen die Tests, die
  es auf `origin/main` schon gibt — Abbruch mit Fundstelle, bevor Run-State und Rolle
  entstehen. In `confirm-red` gegen die neu geschriebenen Tests — Abbruch vor dem Übergang
  nach `implement`, solange der Marker noch auf `test-author` steht und die Pause zur
  Korrektur klein ist. Entscheidung des Menschen vom 2026-09-11.
- **JSON-Antworten der Rollen nur über stdin.** `record-round-summary` und `record-review`
  nehmen als JSON-Argument nur noch `-`; ein anderes Argument bricht mit dem Hinweis auf den
  cmd.exe-Grund ab.
- **Tracked-Abfrage ohne Fehlermeldung.** `removeUntrackedSourceDocs` fragt `git ls-files --
  <pfad>` und entscheidet an der Ausgabe (leer = untracked) statt am Exit-Code von
  `--error-unmatch`.
- **Dokumentation:** `pnpm dev:server` lädt keine `.env`; für den App-Test steht die
  funktionierende Form in `AGENTS.md`. Der Skill nennt die Portwarnung beim App-Test.

## Capabilities

### New Capabilities
- `harness-app-test-preflight`: Was der Harness vor dem App-Test und beim Aufräumen über
  laufende Server sagt.

### Modified Capabilities
- `harness-spec-delivery`: Requirement „Der Leak-Wächter läuft, sobald er etwas prüfen
  kann" — Ergänzung zum bestehenden „hält an und benennt die Fundstelle".
- `harness-worktree-setup`: Requirement „Die Tracked-Abfrage der Propose-Originale erzeugt
  keine Fehlermeldung".
- `harness-run-state-access`: Requirement „Rollen-Antworten erreichen den Run-State nur über
  stdin".

## Impact

- `.harness/orchestrator.ts`: `emit`/`next` (Portwarnung), `cleanup`, `start`, `confirmRed`,
  `removeUntrackedSourceDocs`, Dispatch von `record-round-summary`/`record-review`, neue
  Funktionen `busyPorts`, `warnBusyPorts`, `jsonArgOrStdin`
- `.harness/tests/orchestrator.test.ts`
- `AGENTS.md`, `.claude/skills/feature-loop/SKILL.md`
- Kein Anwendungscode, keine neuen Dependencies

**Nicht im Umfang:**
- Kein Beenden von Prozessen durch den Harness (§5.1: Löschen/Beenden ist Menschensache).
- Keine Zuordnung eines Prozesses zu einem Worktree — unter Windows nicht aus der
  Kommandozeile ableitbar; die Warnung nennt PID und Kommandozeile, der Mensch entscheidet.
