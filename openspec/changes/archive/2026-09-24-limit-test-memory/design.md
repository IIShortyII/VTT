## Context

Jest parallelisiert standardmäßig über `os.availableParallelism() - 1` Worker. Jeder Worker
lädt ts-jest mit Typecheck (kein `isolatedModules`) und hält damit ein eigenes
TypeScript-Programm. Der Speicher skaliert also linear mit der Kernzahl, nicht mit dem Bedarf.

## Decisions

### D1 — höchstens 4 Worker, fest statt prozentual
Gemessen (voller `pnpm test`, 20 Kerne, Spitze der Node-Prozesse, je 647/647 grün):

| Worker | Spitze | Dauer |
|---|---|---|
| Standard (19) | 8,40 GB | 141 s |
| `'50%'` (10) | 6,57 GB | 71 s |
| `'25%'` (5) | 4,59 GB | 73 s |
| `4` | 3,62 GB | 80 s |

Über 4 Worker hinaus sinkt die Laufzeit kaum, der Speicher steigt aber linear. Ein
Prozentwert hinge an der Kernzahl der Maschine — genau die Kopplung, die das Problem
verursacht; auf einem 32-Kern-Rechner wäre `'25%'` wieder bei 8 Workern.

Ein fester Wert von 4 hätte auf kleinen Maschinen die Gegenrichtung: ein CI-Runner mit
2 Kernen bekam bisher 1 Worker (Jests Vorgabe „Kerne − 1“) und bekäme 4 (Review-Hinweis).
Deshalb `Math.max(1, Math.min(4, availableParallelism() - 1))` — Jests Vorgabe, nach oben bei 4
gedeckelt. Keine Maschine bekommt mehr Worker als vorher.

### D2 — `workerIdleMemoryLimit: '1GB'`
Jest startet einen Worker zwischen zwei Testdateien neu, wenn er über dem Limit liegt. Das
kappt Speicher, der sich über viele Suiten ansammelt, ohne einzelne Suiten zu beschneiden.

### D3 — `--experimental-vm-modules` bleibt (verworfen)
Ursprünglich geplant, die Option zu entfernen, weil ts-jest nach `commonjs` transpiliert. Der
Versuch machte 15 Integrations-Suiten rot: `@fastify/cookie` lädt in `node_modules` per
dynamischem `import()` nach (`A dynamic import callback was invoked without
--experimental-vm-modules`). `node_modules` wird nicht transformiert, die Option ist also
nötig.

### D4 — Absicherung per Harness-Test
Die Werte sind Konfiguration, kein Verhalten; ein Harness-Test liest `jest.config.cjs` und
sichert die Anforderung, damit ein späterer Change sie nicht still zurückdreht. Er liegt unter
`.harness/tests/`, weil die Datei außerhalb aller Rollenpfade liegt.
