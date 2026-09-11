# Tasks

Harness-Change nach `constitution.md` §1.4 — eigener Branch `fix/57-clear-stale-app-review`,
eigener PR, kein Anwendungscode. Die Rollen des Feature-Loops greifen nicht: `.harness/` liegt
außerhalb der Schreibbereiche von test-author und implementer. Die Sitzung arbeitet direkt,
test-first, mit `pnpm test:harness` als Gate.

## 1. Test (zuerst, rot bestätigt)

- [x] 1.1 `.harness/tests/orchestrator.test.ts`: Szenario „Review „ok" nach einer
      App-Test-Ablehnung verbraucht die Ablehnung" — Ablauf `confirmAppReview('nein')` →
      Status `review` mit Empfehlung „ok" → dreimal `next`; jedes Mal `present-app-review`,
      Rundenzähler unverändert, Phase `app-review`, `lastAppReview` fehlt
- [x] 1.2 Rot bestätigt aus dem richtigen Grund: der zweite `next` liefert
      `invoke-implementer` und der Zähler steigt

## 2. Behebung

- [x] 2.1 `.harness/orchestrator.ts`: im `review`-Zweig von `next()` bei „ok" `lastAppReview`
      verwerfen (design.md D1)

## 3. Abnahme

- [x] 3.1 Gate grün: `pnpm test:harness`, `pnpm typecheck`, `pnpm lint`
- [x] 3.2 Change archivieren, Delta auf `openspec/specs/harness-role-marker/spec.md`
      anwenden, PR mit `Closes #57`
