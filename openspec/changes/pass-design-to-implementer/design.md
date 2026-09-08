## Context

`readChangeSpec(issue, status)` liegt in `.harness/orchestrator.ts` und liest den
OpenSpec-Change aus dem **Worktree** des Laufs (`.harness/wt/<issue>/openspec/changes/<change>`),
nicht aus dem Hauptrepo — der Change liegt wie der Feature-Code auf dem Issue-Branch. Der
Rückgabewert ist ein einziger String; die Teile werden heute mit `\n\n---\n\n` verkettet.

Zwei Aufrufer:

- `buildImplPrompt` — setzt den String unter die Überschrift `# Spec` und hängt Gate-Feedback,
  Reviewer-Findings, App-Test-Ablehnung und Rundenhistorie an. Der fertige Prompt läuft danach
  durch `assertNoTestLeak`.
- `buildTestReworkPrompt` — setzt denselben String unter `# Spec` und hängt die Test-Findings
  an. Kein Leak-Wächter (Tests sind für den test-author ohnehin sichtbar).

`assertNoTestLeak(prompt, issue)` läuft über alle Dateien unter `<worktree>/tests/` und bricht
ab, wenn der Prompt einen Testpfad oder eine Zeile aus einer Testdatei (Länge > 20) enthält.

Motivation: siehe `proposal.md` — Why, und Issue #22. Verhalten: siehe
`specs/harness-spec-delivery/spec.md`.

## Goals / Non-Goals

**Goals:**
- Der implementer kennt die Entscheidungen, gegen die die Tests geschrieben wurden.
- Beide Rollen bekommen dasselbe Material aus dem Change — kein Auseinanderdriften.
- Der implementer sieht, aus welcher Datei ein Abschnitt stammt.
- Ein Leak-Abbruch ist ohne Suche behebbar.

**Non-Goals:**
- Keine Auswahl innerhalb einer Datei. Der Auftrag bekommt `design.md` ganz oder gar nicht;
  eine Heuristik, die „nur die Decisions" extrahiert, wäre eine stille Interpretation der Spec
  durch den Harness.
- Keine Aufweichung des Leak-Wächters. Er filtert nicht, er hält an.
- Keine Änderung am Zustandsautomaten, am Rundenzähler oder an der Gate-Reihenfolge.

## Decisions

### D1 — `design.md` steht zwischen `proposal.md` und den Requirements

Die Reihenfolge im Auftrag ist die Lesart des Change-Ordners: **warum** (`proposal.md`) →
**wie entschieden** (`design.md`) → **was genau** (`specs/<capability>/spec.md`).

Das ist nicht bloß Geschmack. Der implementer liest von oben; jede Zeile vor den Requirements
ist Kontext, gegen den er die Requirements auslegt. Die Entscheidungen gehören deshalb davor,
nicht dahinter: sonst hat er die Anforderungen bereits einmal frei interpretiert, bevor er
erfährt, dass die Frage schon beantwortet war. Genau diese doppelte Beantwortung ist der
Kostentreiber aus dem Issue.

### D2 — Herkunft als eigene Zeile über jedem Block, nicht als Markdown-Überschrift des Inhalts

Jeder Block bekommt `## Quelle: <pfad>` vorangestellt, der Pfad relativ zum
Change-Verzeichnis (`proposal.md`, `design.md`, `specs/<capability>/spec.md`), die Trennung
zwischen den Blöcken bleibt `\n\n---\n\n`.

Der Präfix `Quelle:` ist der Punkt. Die eingebetteten Dateien führen selbst `##`-Überschriften
(`## Why`, `## Context`, `## ADDED Requirements`) — eine nackte `## design.md` stünde
ununterscheidbar zwischen ihnen. Ein Level-1-`#` scheidet aus, weil der umgebende Prompt seine
eigenen Abschnitte (`# Spec`, `# Konventionen`) so gliedert; ein `#` mitten im Spec-Block
würde die Spec optisch beenden. Der Pfad ist relativ, weil ein absoluter Pfad den
Worktree-Ort in den Prompt trüge, ohne dass die Rolle damit etwas anfangen kann.

### D3 — Die Blöcke entstehen als Liste, der String erst danach

`readChangeSpec` wird auf eine interne Funktion `readChangeParts(issue, status)` gesetzt, die
`{ quelle, text }[]` liefert; `readChangeSpec` formatiert daraus wie bisher einen String und
bleibt in Signatur und Rückgabetyp unverändert.

Der Grund ist D4: der Leak-Wächter muss einen Treffer einer Quelldatei zuordnen können. Er
könnte die Zuordnung auch aus dem fertigen Prompt zurückrechnen, indem er von der Trefferstelle
rückwärts die letzte `## Quelle:`-Zeile sucht — das wäre aber falsch, sobald der Treffer im
angehängten Gate-Feedback steht, das seine Abschnitte mit `## <testname>` überschreibt. Eine
Textsuche, die als Fundstelle einen Testnamen nennt, wäre eine Falschauskunft in genau der
Situation, in der der Mensch sich auf die Auskunft verlässt.

### D4 — Der Leak-Wächter bekommt die Blöcke, meldet weiterhin nur den ersten Treffer und bricht ab

`assertNoTestLeak(prompt, issue, parts)` prüft unverändert den **fertigen Prompt** — nicht die
Blöcke einzeln. Nur wenn er einen Treffer hat, sucht er in den Blöcken nach dem, der ihn
enthält, und nennt ihn in der Meldung. Findet sich keiner (der Treffer stammt dann aus
Gate-Feedback, Review-Findings oder Historie), bleibt die Meldung die heutige.

Die Prüfung am fertigen Prompt zu belassen ist die eigentliche Entscheidung: prüfte der
Wächter die Blöcke, entstünde eine Lücke für alles, was `buildImplPrompt` danach anhängt —
und das Gate-Feedback ist die Stelle, an der Testmaterial nachweislich schon einmal
durchgesickert ist (§8.2 G3).

Der Abbruch bleibt hart. Filtern würde die betroffene Zeile aus dem Auftrag entfernen und den
Lauf weiterlaufen lassen — mit einer Spec, die der implementer nur unvollständig sieht, ohne
dass es jemand merkt. Ein Leak-Treffer in `design.md` ist ein Fehler in der `design.md`, und
den behebt der Mensch dort.

### D5 — Fehlende Dateien sind der Normalfall, kein Sonderfall

Fehlt `design.md`, entsteht kein Block — kein Platzhalter, keine leere Überschrift, kein
Hinweis „keine Designentscheidungen". Das ist die bestehende Behandlung von `proposal.md` und
`specs/` und bleibt es. Ein Auftrag, der eine leere Rubrik führt, lädt zu der Annahme ein, es
gäbe dort etwas zu holen.
