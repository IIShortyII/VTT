## Why

Fährt das Gate (`pnpm harness gate <issue>`) die Jest-Suite, steigt der RAM-Verbrauch so weit,
dass die Maschine spürbar ausbremst (Issue #140). Gemessen auf `main` (afe892a), voller
`pnpm test`, 20-Kern-Maschine: **8,4 GB Spitze**, 141 s.

Ursache ist die fehlende Worker-Begrenzung: Jest startet „Kerne − 1“ = 19 Worker, jeder mit
eigenem ts-jest-TypeScript-Programm, gut die Hälfte der Suiten zusätzlich mit jsdom. Der
Speicher skaliert mit der Kernzahl statt mit dem Bedarf, und die Worker bremsen sich
gegenseitig aus.

Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.

## What Changes

- `jest.config.cjs`: höchstens 4 Worker (nie mehr als Jests Vorgabe) und `workerIdleMemoryLimit: '1GB'`.
- Neue Capability `harness-test-resources` hält das als Anforderung fest; ein Harness-Test
  sichert es gegen ein stilles Zurückdrehen.

Ergebnis (voller `pnpm test`, 647/647 grün): **3,6 GB Spitze, 80 s**.

## Nicht Teil dieses Changes

- Die Harness-Suite (`.harness/jest.config.cjs`) bleibt unbegrenzt: sie ist klein, lädt
  kein jsdom und war nicht Anlass des Issues.
- `--experimental-vm-modules` entfernen — geprüft und verworfen (design.md D3).
- ts-jest auf reines Transpilieren (`isolatedModules`) umstellen. Das berührt `confirmRed` und
  die `TSError`-Auswertung im Gate und wäre ein eigener Change, falls dieser nicht reicht.

## Impact

- `jest.config.cjs`, `.harness/tests/test-resources.test.ts`
- Gate, `confirm-red` und die Rollen-Agenten laufen alle über `pnpm test` und erben die
  Änderung ohne eigene Anpassung.
