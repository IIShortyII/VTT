> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Umgesetzt ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/test-resources.test.ts`: ein Test für das Szenario
- [x] 1.2 Rot bestätigen (§3.1): scheitert an der Assertion (`Expected: "50%"`,
      `Received: undefined`; Wert danach per Messung auf 4 geändert, D1)

## 2. Umsetzung

- [x] 2.1 `jest.config.cjs`: `maxWorkers` höchstens 4, nie über Jests Vorgabe, `workerIdleMemoryLimit: '1GB'` (D1, D2)
- [x] 2.2 `--experimental-vm-modules` entfernen — verworfen, 15 Integrations-Suiten rot (D3)

## 3. Prüfen

- [x] 3.1 Gate: `pnpm test:harness`, `pnpm typecheck`, `pnpm lint`
- [x] 3.2 Voller `pnpm test` grün (647/647); Spitzen-RAM 8,4 GB → 3,6 GB (D1)
