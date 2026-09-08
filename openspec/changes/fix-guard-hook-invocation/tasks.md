# Tasks

Harness-Change nach `constitution.md` §1.4 — eigener Branch `fix/29-guard-hook`, eigener PR,
kein Anwendungscode. Die Rollen des Feature-Loops greifen nicht: `.harness/` und `.claude/`
liegen außerhalb der Schreibbereiche von test-author (`tests/`) und implementer (`src/`,
`prisma/`). Die Sitzung arbeitet direkt, test-first, mit `pnpm test:harness` als Gate.

## 1. Test (zuerst, rot bestätigt)

- [ ] 1.1 `.harness/tests/hook.test.ts`: der aus `.claude/settings.json` gelesene
      PreToolUse-Kommandostring blockt einen unzulässigen Aufruf mit Exit 2 und Begründung auf
      stderr — in einer Umgebung ohne `node_modules/.bin` im PATH
- [ ] 1.2 derselbe Kommandostring lässt einen zulässigen Aufruf mit Exit 0 durch
- [ ] 1.3 Test als rot bestätigt, und zwar aus dem richtigen Grund: Exit 127
      („command not found"), nicht ein Fehler des Tests selbst

## 2. Behebung

- [ ] 2.1 `.claude/settings.json`: Hook-Kommando auf `node .harness/guard.ts` (design.md D1)

## 3. Abnahme

- [ ] 3.1 Gate grün: `pnpm test:harness`, `pnpm typecheck`, `pnpm lint`
- [ ] 3.2 Reviewer-Durchgang ohne blockierende Findings
- [ ] 3.3 Menschlicher Test: in einer frischen Sitzung greift der Guard nachweislich — ein
      Aufruf, der geblockt gehört, wird geblockt
- [ ] 3.4 Change nach `openspec/changes/archive/` verschieben (gleicher Branch), PR öffnen
