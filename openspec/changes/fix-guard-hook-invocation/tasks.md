# Tasks

Harness-Change nach `constitution.md` §1.4 — eigener Branch `fix/29-guard-hook`, eigener PR,
kein Anwendungscode. Die Rollen des Feature-Loops greifen nicht: `.harness/` und `.claude/`
liegen außerhalb der Schreibbereiche von test-author (`tests/`) und implementer (`src/`,
`prisma/`). Die Sitzung arbeitet direkt, test-first, mit `pnpm test:harness` als Gate.

## 1. Test (zuerst, rot bestätigt)

- [x] 1.1 `.harness/tests/hook.test.ts`: der aus `.claude/settings.json` gelesene
      PreToolUse-Kommandostring blockt einen unzulässigen Aufruf mit Exit 2 und Begründung auf
      stderr — in einer Umgebung ohne `node_modules/.bin` im PATH
- [x] 1.2 derselbe Kommandostring lässt einen zulässigen Aufruf mit Exit 0 durch
- [x] 1.3 Test als rot bestätigt, und zwar aus dem richtigen Grund: der Interpreter wird nicht
      gefunden („Der Befehl »tsx« … konnte nicht gefunden werden"), nicht ein Fehler des Tests
      selbst. Der Exit-Code dabei hängt an der Shell — cmd liefert 1, bash 127; entscheidend ist
      allein, dass er nicht 2 ist und der Aufruf damit durchliefe

## 2. Behebung

- [x] 2.1 `.claude/settings.json`: Hook-Kommando auf `node .harness/guard.ts` (design.md D1)

## 3. Abnahme

- [x] 3.1 Gate grün: `pnpm test:harness` (89/89), `pnpm typecheck`, `pnpm lint`
- [x] 3.2 Reviewer-Durchgang ohne blockierende Findings (Empfehlung „ok", sechs Hinweise).
      Fünf davon eingearbeitet: Begründung der Ablehnung gepinnt statt bloßem `/Blockiert/`
      (ein pauschal blockender Guard hätte den Test sonst grün gemacht); Hook-Eintrag gezielt
      über `guard.ts` ausgewählt statt „genau einer"; Shebang und Kommentarblock in `guard.ts`
      auf `node` korrigiert und die Type-Stripping-Bedingung dort dauerhaft hinterlegt, weil
      `design.md` archiviert wird; `engines: node >=22.18` plus Spiegelung in `AGENTS.md` und
      `README.md`; GIVEN des ersten Szenarios um die fehlende Datenbank-URL ergänzt.
      Nicht eingearbeitet: die Umstellung auf `$CLAUDE_PROJECT_DIR` — eine nicht gesetzte
      Variable ergäbe `node /.harness/guard.ts` und damit dieselbe stille Wirkungslosigkeit,
      die dieser Change beseitigt. Stattdessen als bewusst akzeptierte Grenze in
      `README.md` festgehalten.
- [ ] 3.3 Menschlicher Test: in einer frischen Sitzung greift der Guard nachweislich — ein
      Aufruf, der geblockt gehört, wird geblockt
- [ ] 3.4 Change nach `openspec/changes/archive/` verschieben (gleicher Branch), PR öffnen
