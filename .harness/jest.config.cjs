module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  // Bewusst getrennt von der App-Testsuite (roots: tests/) - Harness-eigene Tests duerfen nicht
  // den Rollen-Pfadregeln der App (test-author/implementer) unterliegen, siehe proposal.md.
  roots: ['<rootDir>/.harness/tests'],
  testRegex: '\\.test\\.tsx?$',
  // Schaltet den Board-Zugriff fuer die gesamte Suite ab - Begruendung in tests/setup.ts.
  setupFiles: ['<rootDir>/.harness/tests/setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    // NodeNext-Konvention (tsconfig.json): Imports nutzen ".js" fuer die spaetere kompilierte
    // Datei, Jests CommonJS-Resolver braucht dafuer die echte ".ts"-Datei.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
