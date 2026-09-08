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
- [x] 1.8 `--runde-zurueck` verringert den Zähler um genau eins und hält die Rückgabe mit
      Zeitpunkt und dem Grund der Pause im Run-State fest
- [x] 1.9 `resume` ohne das Flag lässt den Rundenzähler unangetastet und schreibt keine Rückgabe
- [x] 1.10 `--runde-zurueck` bei Zähler null wird abgelehnt; der Lauf bleibt pausiert
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

- [x] 2.1 `Status` um das Feld `paused` erweitern (Grund, Zeitpunkt, erfolgte Rundenrückgabe)
- [x] 2.2 Phase→Rolle-Tabelle für `resume` (design.md D3)
- [x] 2.3 Verb `pause <issue> "<grund>"`
- [x] 2.4 Verb `resume <issue> [--runde-zurueck]`
- [x] 2.5 Sperrklausel in den Automatenverben (design.md D2)
- [x] 2.6 Dispatch um beide Verben erweitern

## 3. Guard

- [x] 3.1 Steuerdatei-Tabu um `pause`/`resume` erweitern (design.md D6)
- [x] 3.2 `makeDeps` um den Worktree-Pfad erweitern, Lebenszeichen-Prüfung in
      `soleActiveRole()` (design.md D5)

## 4. Dokumentation

- [x] 4.1 `AGENTS.md`: beide Verben unter „Kommandos", Rundenrückgabe und die Grenze für
      aktive Rollen
- [x] 4.2 `.claude/skills/feature-loop/SKILL.md`: wann die Sitzung pausiert, und dass nach
      einem Eingriff `resume` vor dem nächsten `next` steht

## 5. Abnahme

- [x] 5.1 Gate grün: `pnpm test:harness` (104/104), `pnpm typecheck`, `pnpm lint`
- [ ] 5.2 Reviewer-Durchgang ohne blockierende Findings
- [ ] 5.3 Menschlicher Test: `pause`/`resume` gegen den liegen gebliebenen Lauf `999001`
      vorführen — er ist der reale Auslöser und muss danach keinem fremden Aufruf mehr eine
      Rolle aufzwingen
- [ ] 5.4 Change nach `openspec/changes/archive/` verschieben (gleicher Branch), PR öffnen

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
- [ ] 6.10 Zweiter Reviewer-Durchgang
