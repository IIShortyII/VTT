## Why

`buildImplPrompt` (`.harness/orchestrator.ts`) baut den Auftrag an den implementer aus dem
Material des OpenSpec-Change. Das Material holt `readChangeParts`, und diese Funktion beginnt mit:

```ts
const dir = join(worktreeDir(i), 'openspec', 'changes', s.change ?? i)
if (!existsSync(dir)) return []
```

Fehlt das Verzeichnis, liefert sie eine leere Liste. `formatChangeParts([])` ergibt `''`, und
`buildImplPrompt` schreibt daraufhin einen vollständig gültig aussehenden Auftrag mit **leerem
`# Spec`-Abschnitt**. Der implementer bekommt ihn wörtlich übergeben und implementiert gegen
nichts.

Auffallen kann das erst spät: der Leak-Wächter greift nicht (es gibt nichts zu finden), und das
Gate meldet den Fehlschlag Minuten später als rote Tests — also in der Gestalt eines
Implementierungsfehlers, der keiner ist. `checkPreflight` kennt den Fall (`change-dir-missing`),
prüft ihn aber erst vor dem Archivieren, nicht vor der Delegation.

Das ist genau der stille Fehlschlag, den `AGENTS.md` unter Konventionen ausschließt
(„**Fehler sprudeln bis zum zentralen Handler**; kein stilles `catch {}`") — nur ohne `catch`,
mit einem `return []`. Dazu kommt der Rundenzähler: eine Implementierungsrunde gegen einen
leeren Auftrag ist verbraucht wie jede andere und zählt nach `constitution.md` §3.5 mit. Der
Lauf verliert eine seiner drei Runden an eine Ursache, die eine Zeile vorher mechanisch
feststellbar gewesen wäre (§8.1).

Das Verhalten ist **vorbestehend** und nicht von #22 verursacht; dort ist es aufgefallen, weil
`readChangeParts` seither die einzige Materialquelle des implementer ist. Gefunden im Review zu
#22 (PR #32), Kind von Epic #27. Siehe Issue #33.

## What Changes

- **`buildImplPrompt` bricht ab, wenn der Change kein Material liefert.** Nach `readChangeParts`
  wird auf `parts.length === 0` geprüft und mit `fail()` abgebrochen — bevor der leere Auftrag
  entsteht und delegiert wird.
- **Die Meldung nennt das erwartete Change-Verzeichnis.** So sieht der Mensch sofort, ob das
  Verzeichnis fehlt oder der Change-Name in `status.json` falsch ist — die beiden Ursachen, aus
  denen `readChangeParts` leer zurückkommt.

## Capabilities

### Modified Capabilities
- `harness-spec-delivery`: erhält ein Requirement, das den leeren Auftrag ausschließt. Die
  Capability regelt bereits, welches Material in den Auftrag eingeht und wie eine **fehlende**
  `design.md` behandelt wird (ohne Lücke); der Fall „gar kein Material" war dort nicht geregelt.

## Impact

- `.harness/orchestrator.ts` (`buildImplPrompt`), `.harness/tests/orchestrator.test.ts`
- Kein Anwendungscode (`constitution.md` §1.4)
- Keine neuen Dependencies

**Nicht im Umfang:**
- **Die Prüfung gehört nicht in `readChangeParts`.** Diese Funktion hat mit `readChangeSpec`
  (und darüber `buildTestReworkPrompt`) einen zweiten Aufrufer, und ein leerer Change ist nicht
  in jedem Kontext ein Abbruchgrund. Der Abbruch gehört an die Stelle, die den leeren Auftrag
  tatsächlich delegieren würde.
- **`checkPreflight` bleibt, wie es ist.** Es prüft vor dem Archivieren, aus einem anderen
  Grund; die hier ergänzte Prüfung ersetzt es nicht und wird nicht mit ihm zusammengelegt.
