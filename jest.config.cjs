const { availableParallelism } = require('node:os')

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Speicherbegrenzung (#140, openspec limit-test-memory): ohne maxWorkers startet Jest
  // "Kerne - 1" Worker, jeder mit eigenem ts-jest-TypeScript-Programm - auf 20 Kernen 8,4 GB.
  // Hoechstens 4: gemessen 3,6 GB bei 80 s statt 8,4 GB bei 141 s (design.md D1). Nie mehr als
  // Jests Vorgabe "Kerne - 1", sonst stiege die Worker-Zahl auf kleinen CI-Runnern. Worker ueber
  // 1 GB werden zwischen zwei Testdateien neu gestartet (D2).
  maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
  workerIdleMemoryLimit: '1GB',
  // testMatch (Glob) statt testRegex vermeiden: jest-utils replacePathSepForGlob laesst unter
  // Windows den Backslash vor ".harness" unveraendert (der Punkt ist von der Glob-Escape-Ersetzung
  // ausgenommen), wodurch der Glob in Worktree-Pfaden wie .harness/wt/<issue> nichts mehr matcht.
  // testRegex prueft den Pfad direkt per RegExp ohne Glob-Uebersetzung und ist davon nicht betroffen.
  roots: ['<rootDir>/tests'],
  // Die Backslashes sind doppelt: diese Muster sind JS-Strings, aus denen Jest erst eine RegExp
  // baut. In einem String ist "\." kein Escape, sondern faellt zu einem nackten "." zusammen -
  // und "." matcht jedes Zeichen. Genau daran ist der erste Integrationslauf gescheitert: der
  // Mapper unten griff mit unescapten Punkten auch auf "./v3/external.cjs" (das ".js" traf
  // "cjs"), verstuemmelte den Pfad und liess jeden Import von zod ins Leere laufen.
  testRegex: '\\.test\\.tsx?$',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    // tsconfig.json nutzt NodeNext -> Quellcode/Tests importieren mit ".js"-Endung (TS-Konvention
    // fuer die spaetere kompilierte Datei). Jests CommonJS-Resolver braucht dafuer die echte
    // ".ts(x)"-Datei, daher hier die Endung vor der Aufloesung entfernen. Nur echte ".js"-Endungen,
    // nicht ".cjs"/".mjs" - siehe Kommentar oben.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Projektspezifische Mappings (CSS-Mocks, Pakete mit "exports"-only-Subpfaden, ...) hier
    // ergaenzen - der ts-jest-Transform oben erzwingt moduleResolution "node" und ignoriert
    // damit das "exports"-Feld eines Pakets.
  },
}
