## Why

Der Harness vergleicht an drei Stellen Pfade als Text — und tut es dreimal verschieden. Unter
Windows entstehen die Pfade über `join()` und tragen Backslashes; verglichen werden sie mit
Text, der sie anders schreibt. Zwei der drei Stellen sind dadurch wirkungslos.

**`removeUntrackedSourceDocs` löscht, was es schützen soll.** Die Schutzabfrage lautet:

```ts
const tracked = sh(`git ls-files --error-unmatch -- "${src}"`)
if (tracked.ok) return
```

`src` entsteht über `join('openspec', 'changes', change)`. `git ls-files` versteht die
Pfadspezifikation mit Backslashes nicht und meldet `did not match any file(s) known to git`.
`tracked.ok` ist damit **immer** `false` — unabhängig davon, ob die Dateien getrackt sind. Beim
Lauf zu #12 war es folgenlos, weil sie tatsächlich untracked waren; das Ergebnis stimmte
zufällig. Wären sie getrackt gewesen, hätte die Abfrage sie trotzdem gelöscht — genau den Fall,
den der Kommentar darüber ausschließt.

**Der Pfad-Zweig des Leak-Wächters trifft nie.** `assertNoTestLeak` vergleicht den Prompt gegen
die Einträge aus `listTestFiles`, also gegen `.harness\wt\<issue>\tests\auth.integration.test.ts`.
Ein Prompt nennt eine Testdatei aber so, wie ein Mensch sie nennt: `tests/auth.integration.test.ts`,
oder bloß `auth.integration.test.ts`. Getragen hat den Schutz bisher allein der zweite Zweig —
Zeilen aus Testdateien mit mehr als 20 Zeichen.

Das ist keine Kosmetik. `constitution.md` §2.2 verbietet dem implementer, Testdateien zu sehen,
und §8.1 verlangt, dass solche Invarianten als Mechanik im Code liegen. Seit #22 die `design.md`
in den Auftrag gibt, ist die Lücke auch nicht mehr theoretisch: `design.md` nennt Testdateien
beim Namen, und diese Nennung geht heute ungeprüft durch.

**`parseJestFailures` stellt dieselbe Frage noch einmal, mit eigener Antwort.** Der Wächter über
der Gate-Ausgabe prüft `trimmed.includes(f)` mit demselben `f`. Er funktioniert — aber aus einem
Zufall: Jest nennt Pfade absolut (`C:\…\.harness\wt\12\tests\x.ts`) und mit Backslashes, und
dieser Text enthält den relativen Pfad als Suffix. Eine Ausgabe in anderer Form ginge auch dort
durch. Zwei Wächter, dieselbe Frage, zwei Implementierungen: sie können auseinanderdriften, und
eine Korrektur an der einen Stelle zieht an der anderen vorbei.

Siehe Issue #21 samt Kommentar zur zweiten Fundstelle.

## What Changes

- **Neu: ein gemeinsamer Erkenner** in `.harness/orchestrator.ts`, der die Frage „nennt dieser
  Text eine Testdatei dieses Laufs?" an genau einer Stelle beantwortet. Er kennt die Formen, in
  denen eine Testdatei auftauchen kann: absoluter Pfad, worktree-relativer Pfad, Pfad relativ
  zum Repo, jeweils mit Backslashes oder Forward-Slashes, und der **bloße Dateiname**.
- **`assertNoTestLeak` und `parseJestFailures` benutzen ihn** statt je eigener
  `includes`-Vergleiche. Ihre Wirkung bleibt, was sie ist: der eine bricht ab, der andere
  degradiert einen einzelnen Failure auf die Kurzform (§8.2 G3).
- **Der bloße Dateiname zählt als Nennung.** In einer `design.md` steht eher
  `user-auth.integration.test.ts` als der volle Pfad, und genau das ist die Information, die
  §2.2 fernhält: welche Testdatei existiert und wie das Verhalten geschnitten ist. Das
  Fehlalarmrisiko ist gering, weil Testdateinamen auf `.test.ts`/`.test.tsx` enden und in Prosa
  sonst nicht vorkommen.
- **`removeUntrackedSourceDocs` bildet die Pfadspezifikation mit Forward-Slashes** — wie es
  `sh('git add openspec/changes/…')` zwei Zeilen darüber schon tut.

**Unverändert:** Zustandsautomat, Rundenzähler, Gate-Reihenfolge, Rollenrouting. Der Erkenner
ist strenger als der bisherige Zustand, nie nachsichtiger: was heute als Leak gilt, gilt auch
danach als einer.

**Nicht im Umfang:**
- **Die Ausnahme für Konventionszeilen** aus #22 bleibt, wie sie ist. Sie beantwortet eine
  andere Frage — nicht „ist das eine Testdatei", sondern „ist dieser Inhalt geheim".
- **`git worktree add ${worktreeDir(i)}`** ohne Anführungszeichen (Zeile 230). Ein Pfad mit
  Leerzeichen bräche dort, aber das ist ein Quoting-Befund, kein Schreibweisen-Befund, und der
  Pfad ist harness-intern konstruiert.
- **`guard.ts` behält sein eigenes `norm()`.** Es ist ein eigenständiges Skript mit eigenem
  Prozess (PreToolUse-Hook) und importiert den Orchestrator nicht; eine geteilte Funktion
  hieße dort, eine Abhängigkeit zwischen zwei bewusst getrennten Programmen einzuführen. In
  `orchestrator.ts` dagegen ist die Dopplung beseitigt — auch `scopeOfFinding` benutzt jetzt
  `fwd` statt einer eigenen Ersetzung.
- Die übrigen Kinder von Epic #27 (#24, #25, #33).

## Capabilities

### New Capabilities
- `harness-path-matching`: Wie der Harness entscheidet, ob ein Text eine Testdatei des Laufs
  nennt, und wie er Pfade an Git übergibt — unabhängig von der Schreibweise des Betriebssystems.

### Modified Capabilities
Keine. `harness-spec-delivery` verlangt bereits, den Auftrag „auf Testpfade und Testinhalt" zu
prüfen — was eine Nennung ist, war dort nie festgelegt und steht jetzt in der neuen Capability.
Das Requirement bleibt wörtlich gültig; es wird nur nicht mehr falsch umgesetzt.

## Impact

- `.harness/orchestrator.ts` (`removeUntrackedSourceDocs`, `assertNoTestLeak`,
  `parseJestFailures`, neuer Erkenner), `.harness/tests/orchestrator.test.ts`
- Kein Anwendungscode (`constitution.md` §1.4)
- Keine neuen Dependencies
- **Wirkung auf laufende Feature-Läufe:** Der Leak-Wächter wird schärfer. Eine `design.md`, die
  eine Testdatei nennt, hält den Lauf ab jetzt an — mit Fundstellen-Angabe aus #22. Das ist die
  Absicht; §2.2 verlangt es. Der Mensch behebt es in der `design.md`.
