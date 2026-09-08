---
name: feature-loop
description: Fährt eine Arbeitseinheit (OpenSpec-Change) durch den TDD-Loop mit test-author, implementer und reviewer. Nutzen, wenn ein Feature/Change umgesetzt werden soll.
---
# Feature-Loop

Du bist der Orchestrator. Du **sequenzierst** die Rollen; alle harten Entscheidungen triffst
du NICHT selbst, sondern rufst `pnpm harness <verb>` und befolgst dessen Ausgabe.

Noch **vor** dem Start, sobald die Spezifikation des Change beginnt (`/opsx:propose`):
`pnpm harness board <issue> spec`. Das ist der einzige Statuswechsel, den der Automat nicht
selbst auslöst — zu dem Zeitpunkt kennt er das Issue noch gar nicht. Alle weiteren setzt der
Loop von allein (siehe AGENTS.md, „Board-Status"). Schlägt der Aufruf fehl, ist das kein Grund
anzuhalten: er meldet es und du machst weiter.

Start: `pnpm harness start <issue> <change>`. Danach nach *jedem* Schritt erneut
`pnpm harness next <issue>` fragen und die zurückgegebene Aktion ausführen — nie den
nächsten Schritt raten:

- `invoke-test-author` → delegiere an den `test-author` mit dem Change-Pfad. Nach dessen
  Antwort `pnpm harness record-round-summary <issue> test-author -` (JSON der Rolle über
  stdin), dann `pnpm harness confirm-red <issue>`.
- `invoke-implementer` → hole `pnpm harness build-impl-prompt <issue>` und übergib die Ausgabe
  dem `implementer` **wörtlich** (nichts hinzufügen, keine Testdatei referenzieren). Nach
  dessen Antwort `pnpm harness record-round-summary <issue> implementer -`, dann
  `pnpm harness gate <issue>`.
- `invoke-test-author-rework` → hole `pnpm harness build-test-rework-prompt <issue>` und
  übergib die Ausgabe dem `test-author` wörtlich. Der test-author korrigiert die Tests gegen
  die Spec (nie gegen die Implementierung, constitution.md §2.1). Nach dessen Antwort
  `pnpm harness record-round-summary <issue> test-author -`, dann
  `pnpm harness confirm-test-rework <issue>` — liefert immer `run-gate` (siehe unten): das
  reguläre Gate entscheidet danach automatisch zwischen direkter Review-Phase (alles grün,
  keine Implementer-Runde nötig) und einer regulären Implementer-Runde (weiterhin rot).
- `run-gate` → `pnpm harness gate <issue>` ausführen; dessen Ausgabe direkt weiterverwenden
  (gate() ruft intern bereits `next` auf).
- `invoke-reviewer` → delegiere an den `reviewer`, übergib dessen JSON an
  `pnpm harness record-review <issue> -`.
- `fix-tasks` → mechanischer Verstoß vor dem Archivieren (offene Checkboxen in
  `openspec/changes/<change>/tasks.md` oder fehlendes Change-Verzeichnis im Worktree, siehe
  `pnpm harness preflight-archive <issue>`). Hake abgeschlossene Tasks anhand des tatsächlichen
  Stands (Gate grün, Review ok, App-Test freigegeben) ab; bei inhaltlicher Unklarheit an den
  Menschen eskalieren statt zu raten. Danach erneut `pnpm harness next <issue>`.
- `present-app-review` → App im Worktree starten (`pnpm dev` in `.harness/wt/<issue>`), dem
  Menschen den lokalen Link sowie eine Liste der Changes zum manuellen Testen präsentieren
  (z. B. aus `tasks.md`/`git diff` abgeleitet). Dann **stoppen und auf eine echte Chat-Antwort
  des Menschen warten** — niemals selbst "ja" annehmen oder simulieren. Erst bei einer
  expliziten Antwort `pnpm harness confirm-app-review <issue> ja` bzw. bei Ablehnung
  `pnpm harness confirm-app-review <issue> nein "<Feedback>"` aufrufen und mit dessen Ausgabe
  weiterfahren. Bei Ablehnung zählt das als Nacharbeit-Runde (zurück zu `invoke-implementer`).
- `archive-and-open-pr` → Erst den OpenSpec-Change nach `openspec/changes/archive/YYYY-MM-DD-<name>/`
  verschieben (im selben Branch, gleicher Commit-Bereich wie das Feature), dann einen einzigen
  PR öffnen (`Closes #<n>` + Verweis auf den archivierten OpenSpec-Change). Kein separater
  Archivierungs-PR.
- `escalate` → Automatik stoppen, an den Menschen übergeben (Zusammenfassung liegt im Run-Verzeichnis).

## Wenn der nächste Schritt keiner Rolle gehört

Steht ein Eingriff an, der außerhalb von `src/`, `prisma/` und `tests/` liegt — eine kaputte
Werkzeugkonfiguration, eine fehlende `.gitignore`-Regel, ein Befund ohne Rollenzuordnung nach
`constitution.md` §3.3 —, dann **nicht** den Rollenmarker von Hand schreiben und auch nicht
selbst pausieren. `pause` ist dir immer verboten (`guard.ts`), und zwar mit Absicht: der Guard
kann dich nicht von einem Subagenten unterscheiden; dürftest du pausieren, dürfte der
`implementer` es auch — und damit die Sperre abschalten, unter der er steht. `resume` ist dir
nur verboten, solange der Marker eine Rolle trägt; während einer Pause trägt er `none`, und
dann darfst du.

Stattdessen:

1. **Warte, bis die laufende Rolle geantwortet hat.** Pausiert wird an einer Schrittgrenze, nie
   mitten in einem Rollenschritt: die Pause gibt den Marker für *jeden* laufenden Aufruf frei,
   ein noch arbeitender Subagent verlöre dabei seine Sperren.
2. **Bitte den Menschen**, in seiner eigenen Shell `pnpm harness pause <issue> "<grund>"`
   auszuführen (im Chat mit `!` davor) — seine Eingabe läuft nicht durch den Guard. Nenne den
   Grund, den er einsetzen soll. Das gibt den Marker frei; Phase und Rundenzähler bleiben
   stehen, und jedes Automatenverb verweigert, bis fortgesetzt wird.
3. Den Eingriff durchführen — jetzt bist du rollenlos und kommst an die Datei.
4. `pnpm harness resume <issue>` — das darfst du selbst. Erst danach wieder
   `pnpm harness next <issue>`.

Eine Runde, die nur eine kaputte Umgebung gemessen hat, lässt sich **nicht** zurückgeben: der
Rundenzähler ist eine harte Invariante im Code (`constitution.md` §8.1), und jedes Verb, das
ihn senken könnte, wäre von dir aufrufbar. Der Lauf eskaliert dann eben eine Runde früher an
den Menschen — der ohnehin schon danebensteht, weil er die Pause gesetzt hat.

Reiche zwischen Rollen nur strukturierte Rückgaben weiter, nie Rohprosa oder Testcode.
Der Rundenzähler (max 3, Implementer-, test-author- und App-Test-Nacharbeit zusammengezählt)
und die Gate-Reihenfolge liegen im Skript; halte dich an dessen Verdikt. Ein Reviewer-Finding,
dessen Block-Findings ausschließlich Testpfade betreffen, führt automatisch zu
`invoke-test-author-rework` statt `invoke-implementer` — das entscheidet `pnpm harness next`,
nicht die Session.
