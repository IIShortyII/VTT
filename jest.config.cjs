module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // testMatch (Glob) statt testRegex vermeiden: jest-utils replacePathSepForGlob laesst unter
  // Windows den Backslash vor ".harness" unveraendert (der Punkt ist von der Glob-Escape-Ersetzung
  // ausgenommen), wodurch der Glob in Worktree-Pfaden wie .harness/wt/<issue> nichts mehr matcht.
  // testRegex prueft den Pfad direkt per RegExp ohne Glob-Uebersetzung und ist davon nicht betroffen.
  roots: ['<rootDir>/tests'],
  testRegex: '\.test\.tsx?$',
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    // tsconfig.json nutzt NodeNext -> Quellcode/Tests importieren mit ".js"-Endung (TS-Konvention
    // fuer die spaetere kompilierte Datei). Jests CommonJS-Resolver braucht dafuer die echte
    // ".ts(x)"-Datei, daher hier die Endung vor der Aufloesung entfernen.
    '^(\.{1,2}/.*)\.js$': '$1',
    // Projektspezifische Mappings (CSS-Mocks, Pakete mit "exports"-only-Subpfaden, ...) hier
    // ergaenzen - der ts-jest-Transform oben erzwingt moduleResolution "node" und ignoriert
    // damit das "exports"-Feld eines Pakets.
  },
}
