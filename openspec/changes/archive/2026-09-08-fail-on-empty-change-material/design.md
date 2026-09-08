## Context

`buildImplPrompt(i)` baut den Auftrag an den implementer in drei Schritten:

```ts
const parts = readChangeParts(i, s)   // Material aus dem Change-Ordner
const spec = formatChangeParts(parts) // zu einem Text zusammengesetzt
// ... spec geht als "# Spec"-Abschnitt in den Prompt ...
```

`readChangeParts` liefert `[]`, sobald das Change-Verzeichnis fehlt — und ebenso, wenn es zwar
existiert, aber weder `proposal.md`, `design.md` noch eine Datei unter `specs/` enthält (jede
fehlende Datei erzeugt bewusst keinen Block, damit keine leere Rubrik entsteht). `[]` durchläuft
`formatChangeParts` zu `''` und ergibt einen Auftrag, der gültig aussieht, aber keine Spec trägt.

Zwei Ursachen führen dorthin, und der Mensch muss sie unterscheiden können: das Verzeichnis
fehlt, oder der Change-Name in `status.json` (`s.change`) zeigt auf ein anderes. Beide Male ist
`parts` leer; nur die Meldung kann sagen, welcher der beiden Fälle vorliegt.

Motivation: siehe `proposal.md` — Why, und Issue #33. Verhalten: siehe
`specs/harness-spec-delivery/spec.md`.

## Goals / Non-Goals

**Goals:**
- Ein leerer Auftrag wird nie an den implementer delegiert.
- Der Abbruch benennt das erwartete Change-Verzeichnis, sodass die Ursache ohne Suche erkennbar
  ist.

**Non-Goals:**
- Keine Änderung an `readChangeParts`, `formatChangeParts` oder `checkPreflight`.
- Keine Änderung am Verhalten des test-author-Auftrags (`buildTestReworkPrompt`): dort ist ein
  leerer Change kein Abbruchgrund derselben Art.

## Decisions

### D1 — Die Prüfung steht in `buildImplPrompt`, nicht in `readChangeParts`

`readChangeParts` ist eine reine Lesefunktion und hat mit `readChangeSpec` einen zweiten
Aufrufer (den `buildTestReworkPrompt` benutzt). Ein leerer Change ist nicht in jedem Kontext ein
Abbruchgrund — der Abbruch gehört an die Stelle, die den leeren Auftrag tatsächlich an eine Rolle
gäbe. Das ist `buildImplPrompt`, unmittelbar nach dem Lesen und vor dem Zusammensetzen.

Damit bleibt die Trennung erhalten, die die Capability schon zwischen „Material lesen" und
„Auftrag bauen" zieht: `readChangeParts` sagt, was da ist; `buildImplPrompt` entscheidet, ob das
für einen Auftrag genügt.

### D2 — Geprüft wird `parts.length === 0`, nicht `existsSync(dir)`

Der Abbruchgrund ist „der Auftrag hätte keine Spec", nicht „das Verzeichnis fehlt". Beides fällt
meist zusammen, aber nicht immer: ein existierendes, aber materialloses Verzeichnis führt zum
selben leeren `# Spec` und verdient denselben Abbruch. `parts.length === 0` misst genau die
Bedingung, die schadet — der leere Auftrag —, statt einer ihrer Ursachen. Ein zweiter
`existsSync`-Aufruf im Prompt-Bauer wäre zudem eine Dopplung der Abfrage, die `readChangeParts`
bereits trifft.

### D3 — Die Meldung nennt das erwartete Change-Verzeichnis

`readChangeParts` bildet das Verzeichnis als `join(worktreeDir(i), 'openspec', 'changes',
s.change ?? i)`. Dieselbe Bildung nennt die Meldung, damit der Mensch den Pfad sieht, den der
Harness erwartet hat: existiert er nicht, fehlt das Verzeichnis; existiert er, aber leer, ist der
Change-Name falsch oder das Material nie angelegt worden. Der Pfad wird in der Form des
Betriebssystems genannt — es ist eine Ortsangabe für einen Menschen an seinem Dateisystem, keine
Pfadspezifikation an Git (dort gilt die Forward-Slash-Regel aus `harness-path-matching`).

### D4 — Der Abbruch nutzt `fail()`, wie die übrigen harten Abbrüche

`fail(msg)` schreibt die Meldung auf stderr und beendet mit Exit 1 — dieselbe Mechanik, mit der
`assertNoTestLeak` und die Rollen-Prüfung abbrechen. Kein neues Fehlerkonstrukt; der Abbruch
reiht sich in die bestehenden ein und ist im Test über den `process.exit`-Spy prüfbar wie sie.
