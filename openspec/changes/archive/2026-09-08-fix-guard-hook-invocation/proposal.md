## Why

`.claude/settings.json` registriert den PreToolUse-Guard als `tsx .harness/guard.ts`. `tsx`
liegt ausschließlich in `node_modules/.bin/` und ist im PATH der Hook-Shell nicht auflösbar;
der Hook stirbt mit `command not found`, Exit 127. Ein PreToolUse-Hook blockt **ausschließlich**
bei Exit 2 — jeder andere Ausgang lässt den Werkzeugaufruf durch. Der Guard ist damit still
fail-open.

Nachgewiesen, beide Aufrufe gegen denselben Guard mit demselben Input:

```
$ echo '{"tool_name":"Read","tool_input":{"file_path":".harness/tests/guard.test.ts"}}' \
    | ./node_modules/.bin/tsx .harness/guard.ts
Blockiert: implementer darf Testdateien nicht lesen/ändern.     exit=2

$ tsx .harness/guard.ts        # so, wie settings.json ihn startet
bash: tsx: command not found                                     exit=127
```

Die Logik ist intakt und hätte korrekt geblockt. Sie wird nur nie gefragt. Praktisch
beobachtet: eine Sitzung, für die `soleActiveRole()` die Rolle `implementer` liefert, konnte
`.harness/tests/guard.test.ts` im Klartext lesen.

Das Verdeckende daran: `pnpm harness …` funktioniert, weil pnpm `node_modules/.bin` in den
PATH legt. Der Hook wird aber nicht über pnpm gestartet. Und ein nicht blockender Guard
verhält sich von außen exakt wie ein zufriedener.

Die gesamte Rollentrennung zur Laufzeit hängt an diesem einen Hook — `settings.json` erlaubt
`Read`, `Edit`, `Write`, `Grep` und `Glob` pauschal. `guard.ts` ist innen mit Sorgfalt
fail-closed gebaut (der `try/catch` am Prozesseinstieg existiert ausdrücklich, damit ein
kaputtes Hook-JSON nicht mit Exit 1 durchrutscht), aber diese Sorgfalt greift erst, wenn der
Interpreter überhaupt startet.

Siehe Issue #29.

## What Changes

- **`.claude/settings.json`**: der Hook wird so registriert, dass er unabhängig vom PATH der
  Hook-Shell startet (design.md D1).
- **Neu: `.harness/tests/hook.test.ts`** — startet den **in `settings.json` registrierten**
  Kommandostring als Prozess, in einer Umgebung ohne `node_modules/.bin` im PATH, und verlangt
  Exit 2 für einen Aufruf, den der Guard ablehnt, sowie Exit 0 für einen, den er zulässt.

Der Test ist der eigentliche Gegenstand dieses Change. Die Korrektur des Kommandos ist ein
Wort; dass der Bruch unbemerkt blieb, liegt nicht am Wort, sondern daran, dass ihn nichts
bemerken konnte. Die bestehenden Tests importieren `evaluate()` direkt und prüfen damit die
Entscheidung, nicht den Start. Die eine Ausnahme, `guard.test.ts` („blockiert (Exit 2) bei
kaputtem Hook-JSON auf stdin am echten Prozesseinstieg"), startet den Guard zwar als Prozess —
aber über einen **im Test wiederholten** Kommandostring (`pnpm exec tsx .harness/guard.ts`),
der zufällig funktioniert. Sie war deshalb durchgehend grün, während das registrierte Kommando
danebenlag. Genau diese Konstellation — eine richtige Kopie neben einem falschen Original —
ist der Grund, warum der neue Test das Kommando aus `settings.json` lesen muss (design.md D3).

**Unverändert:** `guard.ts` selbst, seine Entscheidungslogik und alle bestehenden Tests
dagegen. Dieser Change berührt nur die Frage, ob der Guard gestartet wird.

## Impact

- `.claude/settings.json` — Hook-Kommando.
- `.harness/tests/hook.test.ts` — neu.

Kein Anwendungscode. Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR.
Voraussetzung für den menschlichen App-Test von #23 — solange der Hook nicht läuft, sind die
dortigen Guard-Änderungen nicht beobachtbar.
