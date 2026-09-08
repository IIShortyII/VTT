# Tasks

Harness-Change nach `constitution.md` §1.4 — eigener Branch `feat/23-harness-pause`, eigener
PR, kein Anwendungscode. Die Rollen des Feature-Loops greifen hier nicht: `.harness/` liegt
außerhalb der Schreibbereiche von test-author (`tests/`) und implementer (`src/`, `prisma/`);
die Sitzung arbeitet direkt, test-first, mit `pnpm test:harness` als Gate.

## 1. Tests (zuerst, rot bestätigt)

- [x] 1.1 `pause` gibt den Rollenmarker frei, ohne Phase oder Rundenzähler zu ändern, und hält
      Grund und Zeitpunkt im Run-State fest
- [x] 1.2 `pause` ohne Grund wird abgelehnt, ohne irgendeinen Zustand zu verändern
- [x] 1.3 Ein pausierter Lauf beansprucht bei der Rollenermittlung ohne zuordenbares Issue
      keine Rolle
- [x] 1.4 Jedes Automatenverb ist während der Pause wirkungslos (keine Aktion, kein Marker,
      kein Board-Zugriff, kein Unterprozess, unveränderter Run-State) und verweist auf `resume`
- [x] 1.5 `resume` setzt die Rolle der aktuellen Phase, beendet die Pause und lässt Phase und
      Rundenzähler unverändert
- [x] 1.6 Die von `resume` gesetzte Rolle stimmt für **jede** Phase mit der überein, die
      `next()` aus demselben Run-State setzt (Drift-Sicherung zu design.md D3)
- [x] 1.7 `resume` auf einem nicht pausierten Lauf wird abgelehnt, ohne Zustand zu verändern
- [x] 1.8 Pausieren und Fortsetzen lassen den Rundenzähler unangetastet (die ursprünglich
      geplante Rundenrückgabe ist in Runde 2 gestrichen worden, siehe 7.1)
- [x] 1.11 Der Guard blockt `pause` und `resume` unter aktiver Rolle
- [x] 1.12 Der Guard lässt `pause` und `resume` ohne aktive Rolle durch
- [x] 1.13 Ein Lauf ohne Worktree wird bei der Rollenermittlung ohne zuordenbares Issue
      übergangen
- [x] 1.14 Ein Lauf mit Worktree bleibt bei der Rollenermittlung ohne zuordenbares Issue
      maßgeblich
- [x] 1.15 Ein direkt über den Pfad adressierter Lauf gilt auch ohne existierenden Worktree
- [x] 1.16 Tests als rot bestätigt (aus dem richtigen Grund: fehlende Implementierung, kein
      Setup- oder Compile-Fehler)

## 2. Orchestrator

- [x] 2.1 `Status` um das Feld `paused` erweitern (Grund, Zeitpunkt)
- [x] 2.2 Phase→Rolle-Tabelle für `resume` (design.md D3)
- [x] 2.3 Verb `pause <issue> "<grund>"`
- [x] 2.4 Verb `resume <issue>`
- [x] 2.5 Sperrklausel in den Automatenverben (design.md D2)
- [x] 2.6 Dispatch um beide Verben erweitern

## 3. Guard

- [x] 3.1 Steuerdatei-Tabu um `pause`/`resume` erweitern (design.md D6)
- [x] 3.2 `makeDeps` um den Worktree-Pfad erweitern, Lebenszeichen-Prüfung in
      `soleActiveRole()` (design.md D5)

## 4. Dokumentation

- [x] 4.1 `AGENTS.md`: beide Verben unter „Kommandos", der menschliche Kanal, die
      Schrittgrenze und der unantastbare Rundenzähler
- [x] 4.2 `.claude/skills/feature-loop/SKILL.md`: wann die Sitzung pausiert, und dass nach
      einem Eingriff `resume` vor dem nächsten `next` steht

## 5. Abnahme

- [x] 5.1 Gate grün: `pnpm test:harness` (104/104), `pnpm typecheck`, `pnpm lint`
- [x] 5.2 Reviewer-Durchgang: drei Durchgänge, Runden 1–3 dokumentiert in Abschnitt 6–8
- [x] 5.3 Menschlicher Test durchgeführt (siehe 8.8)
      vorführen — er ist der reale Auslöser und muss danach keinem fremden Aufruf mehr eine
      Rolle aufzwingen
- [x] 5.4 Change nach `openspec/changes/archive/` verschieben (gleicher Branch), PR öffnen

## 6. Nacharbeit-Runde 1 (Reviewer-Befund)

- [x] 6.1 **Block:** Das Verb-Tabu sperrte die Sitzung aus dem Fall aus, für den das Verb
      existiert (`soleActiveRole()` liefert beim Pausieren-Wollen genau `implementer`), während
      `resume` nie geschützt war (Marker steht während der Pause auf `none`). Aufgelöst: der
      Guard kann Sitzung und Subagent nicht unterscheiden, also gilt die Sperre für **jede**
      Rolle, und der vorgesehene Kanal ist die Eingabe des Menschen — nachgemessen, dass
      `!`-Kommandos den Hook nicht durchlaufen. Spec, design.md D6, `AGENTS.md` und `SKILL.md`
      entsprechend umgeschrieben; Testfälle nun über den echten Fallback statt über ein
      handgereichtes `readRole`
- [x] 6.2 Verb-Tabu vor alle übrigen Bash-Regeln gezogen — `\bjest\b` traf sonst den
      Begründungstext von `pause` und lieferte eine irreführende Ablehnung
- [x] 6.3 Tabu auf `reviewer` ausgeweitet (trägt seinen Marker den ganzen Review-Schritt)
- [x] 6.4 `roleForStatus()`: nach grünem Gate bleibt die Phase auf `gate`, während der
      Reviewer-Schritt läuft — eine reine Phasentabelle setzte dort rollenlos. Drift-Test läuft
      jetzt über Run-States statt Phasen und deckt die `gate`-Zweige mit ab
- [x] 6.5 `resume` prüft die Phase vor dem ersten Schreibzugriff (Handkorrektur mit Tippfehler
      hinterließ sonst einen nicht mehr pausierten Lauf mit rohem Stacktrace)
- [x] 6.6 `start` in die Pausensperre aufgenommen; bricht ab, wenn der Worktree nicht angelegt
      wurde — die einzige Richtung, in die die Lebenszeichen-Prüfung fail-open kippt
- [x] 6.7 Testisolation: „Ein pausierter Lauf beansprucht keine Rolle mehr" prüft gegen eine
      tmp-Spiegelung statt gegen die echten `.harness/runs`/`.harness/wt`, und über
      `evaluate(...)` statt über den Zwischenwert `readRole`
- [x] 6.8 Proposal: der Absatz zum toten Guard war seit dem Merge von #29 überholt — er war die
      Annahme, unter der der Selbstblock unentdeckt blieb
- [x] 6.9 Gate erneut grün: `pnpm test:harness` (106/106), `pnpm typecheck`, `pnpm lint`
- [x] 6.10 Zweiter Reviewer-Durchgang (Ergebnis in Abschnitt 7)

## 7. Nacharbeit-Runde 2 (Reviewer-Befund)

- [x] 7.1 **Block:** Die Rundenrückgabe hing am agentischen Verb `resume` — die Sitzung hätte
      sich selbst eine Runde zurückgeben können, gesichert nur durch Prosa. Verschieben auf
      `pause` half nicht: der Guard sperrt nur, solange eine Rolle gilt, und in `gate`,
      `app-review`, `done`, `archived` und `escalated` ist die Sitzung regulär rollenlos. Es
      gibt keinen Kanal, den nur ein Mensch erreicht. **Die Rundenrückgabe ist gestrichen**
      (menschliche Entscheidung), `constitution.md` §8.1 bleibt damit unberührt
- [x] 7.2 `roleForStatus()` deckt jetzt auch `review` ab — `next()` verzweigt dort ebenso am
      übrigen Run-State; Drift-Test um `review`- und `app-review`-Zweige erweitert
- [x] 7.3 `SKILL.md` widersprach sich („verboten" vs. „darfst du selbst"): jetzt getrennt nach
      `pause` (immer verboten) und `resume` (nur unter einer Rolle)
- [x] 7.4 Pausiert wird an einer Schrittgrenze — die Pause entwaffnet jeden laufenden Aufruf,
      nicht nur die Sitzung. In `AGENTS.md`, `SKILL.md` und design.md D6 festgehalten
- [x] 7.5 `hasOwnProperty` statt `in` bei der Phasenprüfung (die Prototypenkette ließ
      `phase: "constructor"` durch)
- [x] 7.6 Testfixtures räumen in `afterEach` auf — sie legten echte, seit der
      Lebenszeichen-Prüfung *aktive* Läufe an und hätten bei einer fehlgeschlagenen Assertion
      selbst 999001-Zombies hinterlassen
- [x] 7.7 `pause`/`resume` auf einem unbekannten Lauf melden sauber statt mit ENOENT-Stacktrace
- [x] 7.8 Der Worktree ist für jede Rolle tabu (`rm`/`mv`/`git worktree remove|prune`) — er ist
      seit der Lebenszeichen-Prüfung Teil der Rollensteuerung
- [x] 7.9 Gate erneut grün: `pnpm test:harness` (106/106), `pnpm typecheck`, `pnpm lint`
- [x] 7.10 Dritter Reviewer-Durchgang (Ergebnis in Abschnitt 8)

## 8. Nacharbeit-Runde 3 (Reviewer-Befund, vom Menschen freigegeben)

- [x] 8.1 **Block:** `WORKTREE_TABOO` war überdehnt — es traf jeden `rm`/`mv` auf einen Pfad
      *innerhalb* eines Worktrees, sperrte dem implementer also das Löschen einer eigenen
      Quelldatei und dem test-author das Umbenennen eines Tests (beide haben kein
      Delete-Werkzeug, das läuft zwangsläufig über Bash). Jetzt auf die Worktree-**Wurzel**
      geankert, `\n` aus der Lücke genommen; drei Negativfälle im Test halten das fest
- [x] 8.2 **Block:** `design.md` behauptete an zwei Stellen noch die gestrichene
      Rundenrückgabe — D1 als Feld des Pausenzustands, D6 als geliefertes Ergebnis, zwei
      Abschnitte unter D4, der ihre Streichung begründet
- [x] 8.3 Das Steuerdatei-Tabu gilt jetzt für jede Rolle (Regel 0 und Write/Edit): die Spec
      begründet das Verb-Tabu mit „derselben Begründung wie beim Zugriff auf die
      Steuerdateien" — der galt für den `reviewer` nie, er konnte sich in einem Schritt
      entwaffnen
- [x] 8.4 Drift-Test um `done/Preflight grün` und `gate/rot an der Rundengrenze` erweitert —
      die zwei Verzweigungen, die nicht am Run-State hängen. Nachgeprüft, dass der
      Preflight-grün-Fall den Übergang `done → archived` wirklich durchläuft
- [x] 8.5 `readRunOrFail` meldet auch ein unlesbares `status.json` sauber (nur die
      Fehlerklasse, nicht den vollen Pfad) — dieselbe Handkorrektur-Fehlerklasse wie 6.5
- [x] 8.6 `AGENTS.md`: Rollenableitung aus dem gesamten Run-State statt nur der Phase, plus
      der Hinweis, dass `{ "rolle": "none" }` nach dem Fortsetzen kein Fehlschlag ist
- [x] 8.7 Gate erneut grün: `pnpm test:harness` (107/107), `pnpm typecheck`, `pnpm lint`,
      `openspec validate --strict`
- [x] 8.8 Menschlicher App-Test: freigegeben. Drei Proben, alle bestanden — (A) Marker `implementer`
      ohne Worktree bindet nicht mehr; (B) derselbe Lauf MIT Worktree bindet weiterhin; (C) voller
      Zyklus: Selbst-Pausieren verweigert, Pause durch den Menschen, `next` eingefroren, Eingriff
      möglich, `resume` stellt `implementer` wieder her, Rundenzähler unverändert
