## Why

Lauf zu #14 (2026-09-11): Nach einer App-Test-Ablehnung (`confirm-app-review nein`), einer
Implementer-Runde, grünem Gate und Review „ok" meldete `record-review` korrekt
`present-app-review`. Der laut Skill nach jedem Schritt vorgeschriebene Aufruf
`pnpm harness next 14` lieferte danach `invoke-implementer`, erhöhte den Rundenzähler von 2
auf 3 und setzte den Rollenmarker auf `implementer` — für eine Nacharbeit, die niemand
angefordert hatte. Die Sitzung stand danach unter einer Rolle, die ihr den Run-State sperrt,
und der Lauf brauchte eine Pause durch den Menschen.

Ursache: `next()` löscht beim Übergang Review „ok" → Phase `app-review` die vorige
Ablehnung `lastAppReview` nicht. In Phase `app-review` wertet `next()` sie erneut aus, als
hätte der Mensch gerade abgelehnt, und bucht über `reworkImplementer` eine Runde. Der
Rundenzähler — eine harte Invariante nach `constitution.md` §8.1 — wird damit durch ein
wiederholtes `next` verändert, obwohl sich am Lauf nichts geändert hat.

Siehe Issue #57.

## What Changes

- **`.harness/orchestrator.ts`**: Der Übergang Review „ok" → `app-review` in `next()`
  verwirft eine gespeicherte App-Test-Ablehnung. In Phase `app-review` liegt danach keine
  Entscheidung vor, bis der Mensch erneut `confirm-app-review` aufruft; `next` bleibt
  idempotent (`present-app-review`) und verbraucht keine Runde.
- **`.harness/tests/orchestrator.test.ts`**: ein Szenario für genau diesen Ablauf
  (Ablehnung → Nacharbeit → Review „ok" → zweimal `next`), das den Rundenzähler und die
  Aktion prüft.
- **`openspec/specs/harness-role-marker/spec.md`**: neue Requirement „Eine App-Test-Ablehnung
  wird genau einmal verbraucht" neben „Kein Verb senkt den Rundenzähler" — beide sichern
  denselben Zähler, in beide Richtungen.

Kein Anwendungscode. Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR;
der Feature-Branch zu #14 wartet pausiert.

## Capabilities

### New Capabilities
- keine

### Modified Capabilities
- `harness-role-marker`: neue Requirement „Eine App-Test-Ablehnung wird genau einmal
  verbraucht" (ADDED). Bestehende Requirements unverändert.

## Impact

- `.harness/orchestrator.ts` — eine Zeile im `review`-Zweig von `next()`
- `.harness/tests/orchestrator.test.ts` — ein neues Szenario
- `openspec/specs/harness-role-marker/spec.md` — eine Requirement

**Dependencies:** keine neuen.
