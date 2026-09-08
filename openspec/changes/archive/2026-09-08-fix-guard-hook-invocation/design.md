# Design

## D1 — `node .harness/guard.ts` als Hook-Kommando

Gemessen auf der Entwicklungsmaschine, gleicher Guard, gleicher Input, alle drei Varianten
mit korrektem Exit 2:

| Variante | Dauer |
|---|---|
| `node .harness/guard.ts` | 0,44 s |
| `node ./node_modules/tsx/dist/cli.mjs .harness/guard.ts` | 1,52 s |
| `pnpm exec tsx .harness/guard.ts` | 3,10 s |

Der Hook läuft vor **jedem** `Read`, `Edit`, `Write`, `Grep`, `Glob` und `Bash`. Der
Unterschied ist damit keine Mikrooptimierung, sondern der Unterschied zwischen einem Guard,
den man vergisst, und einem, den man umgehen möchte.

`node` liegt global im PATH — Claude Code selbst läuft darauf. Die Variante kommt damit ganz
ohne `node_modules` aus und kann nicht erneut daran scheitern, dass ein projektlokaler Pfad
fehlt. Genau das war der Defekt.

**Preis, ausdrücklich benannt:** Node strippt Typen ohne Transpilation. Das setzt Node ≥ 22.18
voraus und verlangt, dass `guard.ts` type-stripping-tauglich bleibt — keine `enum`, keine
`namespace`, keine Parameter-Properties, keine Importe lokaler `.ts`-Module über die
`.js`-Konvention des Projekts. `guard.ts` importiert heute ausschließlich `node:`-Builtins und
erfüllt das. `orchestrator.ts` täte es nicht (`./board.js`), ist aber auch kein Hook.

Diese Bedingung wird nicht durch Sorgfalt gehalten, sondern durch den Test aus D2: er startet
den registrierten Kommandostring als Prozess. Verletzt jemand die Bedingung, endet der Guard
mit einem Syntaxfehler statt mit Exit 2 — und der Test fällt um, statt dass der Guard erneut
still fail-open geht.

## D2 — Der Test muss den PATH der Hook-Shell nachbauen

Der naheliegende Test — Kommando starten, Exit 2 erwarten — wäre **heute schon grün** und
damit wertlos. `pnpm test:harness` legt `./node_modules/.bin` in den PATH seiner
Kindprozesse; ein dort gestartetes `tsx .harness/guard.ts` findet seinen Interpreter und
blockt korrekt. Der Test bescheinigte dem kaputten Hook also Wirksamkeit.

Der Test entfernt deshalb alle PATH-Einträge, die auf `node_modules/.bin` zeigen, bevor er
den Prozess startet. Er prüft damit nicht „läuft das Kommando irgendwo", sondern „läuft es
dort, wo Claude Code es startet" — und das ist die einzige Umgebung, auf die es ankommt.

Bewusst nicht gewählt: ein leerer oder minimaler PATH. Er würde auch `node` selbst
unauffindbar machen und den Test in einen Fehlschlag aus dem falschen Grund verwandeln —
dieselbe Verwechslung, gegen die `confirmRed()` im Orchestrator eine eigene Heuristik hat.

## D3 — Der Test liest das Kommando aus `settings.json`, nie aus einer Kopie

Eine im Test wiederholte Kommandozeile könnte richtig sein, während die registrierte falsch
ist. Das ist wörtlich der Fehler, der hier behoben wird — ein Guard, dessen Logik stimmt,
während sein Aufruf ins Leere geht. Der Test parst deshalb `.claude/settings.json`, sucht den
`PreToolUse`-Eintrag und startet dessen `command` unverändert über eine Shell, so wie Claude
Code es tut.

## D4 — Was dieser Change nicht anfasst

`guard.ts` und seine Entscheidungslogik bleiben unverändert, ebenso alle bestehenden Tests
dagegen. Sie waren nie falsch — sie haben nur eine Frage geprüft, die nicht die entscheidende
war.
