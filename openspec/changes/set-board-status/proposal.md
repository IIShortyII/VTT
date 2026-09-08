## Why

Das GitHub-Project „VTT" hat eine Statusspalte, die dem Harness-Loop nachempfunden ist —
Backlog, Spec, Test rot, Implementierung, Gate + Review, App-Test (Mensch), Fertig. Gesetzt
wird sie nie. Wer aufs Board schaut, sieht bei jedem Issue „Backlog", auch wenn gerade der
Reviewer läuft.

`constitution.md` §7.4 verlangt, dass der Fortschritt jederzeit sichtbar ist. Sichtbar ist er
bisher nur im Terminal der laufenden Sitzung — also für niemanden sonst, und nach dem
Schließen des Terminals für niemanden mehr. Der Harness kennt den Schritt, in dem er steht,
und ist damit die einzige Stelle, die den Status ohne Zutun eines Menschen richtig setzen
kann. Siehe Issue #26.

## What Changes

- **Neu: `.harness/board.ts`** — ein Modul mit der ID-Tabelle des Boards (Projekt, Statusfeld,
  sieben Optionen), der GraphQL-Auflösung des Item-Handles und einer einzigen exportierten
  Wirkfunktion `setBoardStatus(issue, status)`, die **nie wirft**. Bewusst getrennt vom
  Orchestrator: der deterministische Kern (§8.1) und ein Beiwerk, das ausdrücklich fehlschlagen
  darf, gehören nicht in dieselbe Datei.
- **Neu: Verb `pnpm harness board <issue> <status>`** — der einzige Weg, einen Status von
  außerhalb des Automaten zu setzen. Kommt ohne `status.json` aus, weil die Spezifikation
  entsteht, bevor `pnpm harness start` je gelaufen ist.
- **Fünf Aufrufstellen im Orchestrator**, jede zu *Beginn* ihres Schritts:
  - `emit()` bekommt eine Aktions→Status-Tabelle (`invoke-implementer` → Implementierung,
    `present-app-review` → App-Test). `emit()` ist der einzige Trichter, durch den jeder
    Schrittwechsel läuft, und setzt dort schon heute den `active-role`-Marker.
  - `gate()` setzt „Gate + Review", bevor Typecheck/Lint/Jest laufen.
  - `confirmRed()` setzt „Test rot" **nur** im bestätigten Rot-Zweig.
  - `cleanup()` setzt „Fertig", **nur** wenn das Issue tatsächlich geschlossen ist.
- **Neu: Kill-Switch `HARNESS_BOARD=off`** — schaltet jeden Board-Zugriff ab. Die
  Harness-Jest-Config setzt ihn, damit Tests, die `next()` aufrufen, keine echten
  `gh`-Aufrufe auslösen; dem Menschen dient er als Notausschalter.
- **`AGENTS.md`** dokumentiert das Verb, den Kill-Switch und die Grenze des Schreibzugriffs.
  **`.claude/skills/feature-loop/SKILL.md`** bekommt die Zeile zum Spec-Aufruf.

**Unverändert:** Zustandsautomat, Rundenzähler, Gate-Reihenfolge, Rollenrouting und
`status.json` — der Board-Status ist eine Projektion des Zustands, nie seine Quelle. Ein
fehlgeschlagener Board-Zugriff ändert weder die emittierte Aktion noch den Exit-Code.

**Nicht im Umfang:**
- Der Status **„Backlog"** wird von niemandem gesetzt; er ist der Ausgangszustand, den das
  Board beim Anlegen eines Items selbst vergibt. Die Option bleibt in der Tabelle, damit eine
  Korrektur von Hand über dasselbe Verb läuft.
- **Kein Anlegen von Project-Items.** Alle 21 Issues liegen bereits als Items auf Board 3;
  ein fehlendes Item ist der Ausnahmefall und wird gemeldet, nicht behoben.
- **Kein GitHub-Workflow auf `issues: closed`.** Er wäre die lückenlosere Quelle für „Fertig",
  bräuchte aber ein langlebiges PAT als Repo-Secret — das `GITHUB_TOKEN` einer Action darf
  Projects-v2-Felder nicht schreiben. Siehe design.md D4.
- Die übrigen Befunde aus Epic #27 (#21, #22, #23, #24) — jeder bekommt seinen eigenen Change.

## Capabilities

### New Capabilities
- `harness-board-status`: Wann der Harness den Status eines Issues auf dem Projekt-Board
  setzt, worauf sein Schreibzugriff dabei begrenzt ist und wie er sich verhält, wenn das
  Board nicht erreichbar ist.

### Modified Capabilities
Keine — `openspec/specs/` ist leer.

## Impact

- `.harness/board.ts` (neu), `.harness/orchestrator.ts` (fünf Aufrufstellen, ein Verb),
  `.harness/jest.config.cjs` (Kill-Switch für Tests), `.harness/tests/board.test.ts` (neu),
  `.harness/tests/orchestrator.test.ts`, `AGENTS.md`,
  `.claude/skills/feature-loop/SKILL.md`
- Kein Anwendungscode (`constitution.md` §1.4: Harness und Anwendung nie im selben PR)
- Keine neuen Dependencies — `gh` ist als CLI ohnehin Voraussetzung des Loops
- **Berechtigung:** Der Schreibzugriff läuft autonom nach §5.3. Er ist nicht in §5.2
  aufgezählt (Deploys, Dependencies, CI/CD, Repo-Settings), ist verlustfrei umkehrbar, und
  §7.4 verlangt die Sichtbarkeit ausdrücklich. Eine Freigabe pro Schrittwechsel würde den Loop
  sechs- bis zehnmal je Feature anhalten und damit genau das aufbrauchen, was der Change
  bringen soll. Die Grenze steht dafür im Code, nicht in Prosa (§8.1): nur das Statusfeld,
  nur ein vorhandenes Item, nur das eine Projekt.
- **Voraussetzung:** `gh` braucht den `project`-Scope. Er liegt auf dem aktiven Account vor;
  fehlt er, meldet der Harness es und läuft weiter.
