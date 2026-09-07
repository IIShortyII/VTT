import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { evaluate, issueFromPath, issueFromCommand, isTest, isSrc, defaultDeps, makeDeps } from '../guard.js'

const REPO_ROOT = join(__dirname, '..', '..')

const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } })
const write = (file_path: string) => ({ tool_name: 'Write', tool_input: { file_path } })
const read = (file_path: string) => ({ tool_name: 'Read', tool_input: { file_path } })

describe('Pfadrollen: implementer', () => {
  const deps = { readRole: () => 'implementer' }

  it('blockiert Lesen einer Testdatei', () => {
    expect(evaluate(read('.harness/wt/1/tests/foo.test.ts'), deps).blocked).toBe(true)
  })
  it('erlaubt Lesen einer Quelldatei', () => {
    expect(evaluate(read('.harness/wt/1/src/foo.ts'), deps).blocked).toBe(false)
  })
  it('blockiert Schreiben ausserhalb von src/prisma', () => {
    expect(evaluate(write('.harness/wt/1/openspec/changes/x/proposal.md'), deps).blocked).toBe(true)
  })
  it('erlaubt Schreiben in src/', () => {
    expect(evaluate(write('.harness/wt/1/src/foo.ts'), deps).blocked).toBe(false)
  })
})

describe('Suchwerkzeuge (Grep/Glob) als Umgehung der Leseschranke', () => {
  const deps = { readRole: () => 'implementer' }
  const grep = (tool_input: Record<string, unknown>) => ({ tool_name: 'Grep', tool_input })
  const glob = (tool_input: Record<string, unknown>) => ({ tool_name: 'Glob', tool_input })

  it('blockiert eine Inhaltssuche mit tests/ als Suchwurzel', () => {
    expect(evaluate(grep({ pattern: 'expect\(', path: '.harness/wt/1/tests' }), deps).blocked).toBe(true)
  })
  it('blockiert eine Suche ohne einschraenkenden Pfad (wuerde tests/ einschliessen)', () => {
    expect(evaluate(grep({ pattern: 'toBe' }), deps).blocked).toBe(true)
  })
  it('blockiert einen Glob-Dateifilter auf Testdateien', () => {
    expect(evaluate(grep({ pattern: 'toBe', path: '.harness/wt/1/src', glob: '**/*.test.ts' }), deps).blocked).toBe(true)
  })
  it('blockiert ein Glob-Muster auf Testdateien', () => {
    expect(evaluate(glob({ pattern: '**/*.test.ts', path: '.harness/wt/1/src' }), deps).blocked).toBe(true)
  })
  it('erlaubt eine Suche innerhalb der Quellpfade', () => {
    expect(evaluate(grep({ pattern: 'useQuery', path: '.harness/wt/1/src' }), deps).blocked).toBe(false)
  })
  it('laesst den test-author uneingeschraenkt suchen (tests/ ist sein Bereich)', () => {
    const ta = { readRole: () => 'test-author' }
    expect(evaluate(grep({ pattern: 'toBe' }), ta).blocked).toBe(false)
    expect(evaluate(grep({ pattern: 'toBe', path: '.harness/wt/1/tests' }), ta).blocked).toBe(false)
  })
})

describe('Testsuite-Ausfuehrung durch den implementer', () => {
  const deps = { readRole: () => 'implementer' }

  it('blockiert `pnpm test` (Ausgabe enthaelt Codeframes aus den Testdateien)', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm test'), deps).blocked).toBe(true)
  })
  it('blockiert einen direkten jest-Aufruf', () => {
    expect(evaluate(bash('cd .harness/wt/1 && npx jest --watch=false'), deps).blocked).toBe(true)
  })
  it('erlaubt Typecheck und Lint', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm typecheck'), deps).blocked).toBe(false)
    expect(evaluate(bash('cd .harness/wt/1 && pnpm lint'), deps).blocked).toBe(false)
  })
  it('laesst den test-author die Suite laufen (Rot-Bestaetigung, constitution.md 3.1)', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm test'), { readRole: () => 'test-author' }).blocked).toBe(false)
  })
})

describe('Pfadrollen: test-author', () => {
  const deps = { readRole: () => 'test-author' }

  it('blockiert Schreiben ausserhalb von tests/', () => {
    expect(evaluate(write('.harness/wt/1/src/foo.ts'), deps).blocked).toBe(true)
  })
  it('erlaubt Schreiben in tests/', () => {
    expect(evaluate(write('.harness/wt/1/tests/foo.test.ts'), deps).blocked).toBe(false)
  })
})

describe('Bash-Umgehung (beobachtet: cat > src/... nach geblocktem Write)', () => {
  const deps = { readRole: () => 'implementer' }

  it('blockiert Umleitung in eine Testdatei', () => {
    expect(evaluate(bash('cat foo.txt > .harness/wt/1/tests/x.test.ts'), deps).blocked).toBe(true)
  })
  it('erlaubt Umleitung in eine Quelldatei', () => {
    expect(evaluate(bash('echo hi > .harness/wt/1/src/x.ts'), deps).blocked).toBe(false)
  })
  it('blockiert tee in eine Testdatei', () => {
    expect(evaluate(bash('echo hi | tee .harness/wt/1/tests/x.test.ts'), deps).blocked).toBe(true)
  })
  it('blockiert cp auf eine Testdatei', () => {
    expect(evaluate(bash('cp a.ts .harness/wt/1/tests/x.test.ts'), deps).blocked).toBe(true)
  })
})

describe('Bash-Referenz auf Testdateien (implementer)', () => {
  const deps = { readRole: () => 'implementer' }

  it('blockiert cat auf eine Testdatei', () => {
    expect(evaluate(bash('cat .harness/wt/1/tests/x.test.ts'), deps).blocked).toBe(true)
  })
  it('erlaubt cat auf eine Quelldatei', () => {
    expect(evaluate(bash('cat .harness/wt/1/src/x.ts'), deps).blocked).toBe(false)
  })
})

describe('Windows-Backslash-Normalisierung (dokumentierter Fehlblock)', () => {
  const deps = { readRole: () => 'implementer' }

  it('erkennt eine Quelldatei trotz Backslash-Pfad', () => {
    expect(evaluate(write('.harness\\wt\\1\\src\\x.ts'), deps).blocked).toBe(false)
  })
  it('erkennt eine Testdatei trotz Backslash-Pfad', () => {
    expect(evaluate(read('.harness\\wt\\1\\tests\\x.test.ts'), deps).blocked).toBe(true)
  })
})

describe('Harness-Steuerdateien sind tabu', () => {
  const deps = { readRole: () => 'implementer' }

  it('blockiert Entfernen des active-role-Markers', () => {
    expect(evaluate(bash('rm .harness/runs/1/active-role'), deps).blocked).toBe(true)
  })
  // Bewusst nicht `pnpm test`: die Testsuite auszufuehren ist fuer den implementer eine
  // eigene Sperre (siehe 'Testsuite-Ausfuehrung durch den implementer') und waere hier
  // kein unbeteiligtes Kommando mehr.
  it('erlaubt ein unbeteiligtes Kommando', () => {
    expect(evaluate(bash('pnpm typecheck --pretty false'), deps).blocked).toBe(false)
  })
})

describe('Prisma-Migrationssperre', () => {
  const withDbUrl = (url: string | undefined, fn: () => void) => {
    const prev = process.env.DATABASE_URL
    if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url
    try { fn() } finally { if (prev === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prev }
  }

  it('blockiert Migration gegen eine entfernte DB', () => {
    withDbUrl('sqlserver://kunde.database.windows.net', () => {
      expect(evaluate(bash('prisma migrate deploy'), defaultDeps).blocked).toBe(true)
    })
  })
  it('erlaubt Migration gegen die ephemere Test-DB', () => {
    withDbUrl('sqlserver://localhost:1433', () => {
      expect(evaluate(bash('prisma migrate deploy'), defaultDeps).blocked).toBe(false)
    })
  })
  // migrate dev/reset schreiben ebenso gegen das, was in DATABASE_URL steht - eine Sperre nur
  // auf `deploy`/`db push` liesse den lokal naheliegendsten Aufruf offen.
  it('blockiert auch die lokalen Migrations-Varianten gegen eine entfernte DB', () => {
    withDbUrl('sqlserver://kunde.example.net', () => {
      expect(evaluate(bash('pnpm prisma migrate dev --name init'), defaultDeps).blocked).toBe(true)
      expect(evaluate(bash('pnpm prisma migrate reset --force'), defaultDeps).blocked).toBe(true)
      expect(evaluate(bash('prisma db push'), defaultDeps).blocked).toBe(true)
    })
  })
  // Fail-closed: ohne gesetztes DATABASE_URL ist nicht feststellbar, wogegen migriert wuerde.
  it('blockiert bei fehlendem DATABASE_URL', () => {
    withDbUrl(undefined, () => {
      expect(evaluate(bash('prisma migrate deploy'), defaultDeps).blocked).toBe(true)
    })
  })
})

describe('Guard fail-closed', () => {
  it('blockiert bei interner Exception statt durchzulassen', () => {
    const throwingDeps = { readRole: () => { throw new Error('boom') } }
    const result = evaluate(write('.harness/wt/1/src/x.ts'), throwingDeps)
    expect(result.blocked).toBe(true)
    expect(result.message).toMatch(/fail-closed/)
  })

  // Deckt den Prozess-Einstieg ab, nicht nur evaluate(): ein kaputtes Hook-JSON auf stdin
  // darf den Tool-Call nicht durchlassen (Review-Befund - vorher nur auf Funktionsebene
  // getestet, der ungeschuetzte readFileSync/JSON.parse-Block am Skriptende blieb ungedeckt).
  it('blockiert (Exit 2) bei kaputtem Hook-JSON auf stdin am echten Prozesseinstieg', () => {
    let exitCode: number | undefined
    try {
      execSync('pnpm exec tsx .harness/guard.ts', {
        input: 'DAS IST KEIN JSON', cwd: REPO_ROOT, stdio: ['pipe', 'ignore', 'ignore'],
      })
      exitCode = 0
    } catch (e) {
      exitCode = (e as { status?: number }).status
    }
    expect(exitCode).toBe(2)
  }, 30000)
})

describe('Tool-Calls ausserhalb eines Worktrees sind rollenlos', () => {
  it('ignoriert die Rolle, wenn der Pfad zu keinem Worktree gehoert', () => {
    // Realistische Simulation: readRole liefert nur fuer ein aufgeloestes Issue eine Rolle -
    // ein Pfad ausserhalb von .harness/wt/<issue>/ loest kein Issue auf (siehe issueFromPath),
    // die Rolle bleibt damit leer, unabhaengig vom Marker-Inhalt.
    const deps = { readRole: (issue: string | undefined) => (issue ? 'implementer' : '') }
    expect(evaluate(write('openspec/changes/x/proposal.md'), deps).blocked).toBe(false)
  })
})

describe('Fallback auf die einzige aktive Rolle (kein Issue aus Pfad/Kommando ableitbar)', () => {
  // Review-Befund: guard.sh wandte den EINEN globalen Marker auf jeden Aufruf an. Ein Pfad ohne
  // .harness/wt/<issue>/-Praefix (z.B. relative Pfade bei cwd=Worktree, oder eine Bash-Referenz
  // ohne Worktree-Praefix) darf deshalb nicht ungeprueft "rollenlos" werden, solange erkennbar
  // genau ein Issue gerade eine Rolle traegt - das restauriert das alte, sicherere Verhalten fuer
  // den heute einzig moeglichen Fall (kein paralleler Mehr-Issue-Betrieb, siehe proposal.md).
  //
  // Testisolation (Review-Befund Runde 2): NICHT gegen defaultDeps/.harness/runs pruefen - das
  // ist geteilter, unkontrollierter Zustand (parallele Jest-Worker anderer Testdateien, liegen
  // gebliebene echte Runs). makeDeps mit einem eigenen tmp-Verzeichnis isoliert den Fallback
  // vollstaendig von allem anderen.
  let tmpRunsDir: string
  let deps: ReturnType<typeof makeDeps>

  beforeEach(() => { tmpRunsDir = mkdtempSync(join(tmpdir(), 'guard-test-runs-')); deps = makeDeps(tmpRunsDir) })
  afterEach(() => rmSync(tmpRunsDir, { recursive: true, force: true }))

  it('wendet die Rolle des einzigen aktiven Issues auf einen relativen Pfad an', () => {
    const dir = join(tmpRunsDir, 'issue-a')
    mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'active-role'), 'implementer')
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(true)
    expect(evaluate(write('src/x.ts'), deps).blocked).toBe(false)
  })

  it('bleibt rollenlos, wenn mehrere Issues gleichzeitig eine Rolle tragen (mehrdeutig)', () => {
    const dirA = join(tmpRunsDir, 'issue-a'); const dirB = join(tmpRunsDir, 'issue-b')
    mkdirSync(dirA, { recursive: true }); writeFileSync(join(dirA, 'active-role'), 'implementer')
    mkdirSync(dirB, { recursive: true }); writeFileSync(join(dirB, 'active-role'), 'test-author')
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(false)
  })

  it('ignoriert den Marker eines abgeschlossenen Runs (status.json-Phase terminal)', () => {
    const dir = join(tmpRunsDir, 'issue-done')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'active-role'), 'implementer')
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ phase: 'done' }))
    // Kein anderer aktiver Run -> ohne den Terminal-Filter waere dies faelschlich "die eine
    // aktive Rolle"; mit dem Filter bleibt der Aufruf rollenlos.
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(false)
  })
})

describe('Rollenmarker pro Issue', () => {
  const issueA = '__guard_test_a__'
  const issueB = '__guard_test_b__'
  const dirA = join('.harness', 'runs', issueA)
  const dirB = join('.harness', 'runs', issueB)

  beforeAll(() => {
    // status.json mit terminaler Phase: verhindert, dass diese Test-Marker waehrend der
    // Testlaufzeit als "aktiv" in soleActiveRole() eines ECHTEN, parallel pausierten Runs
    // auftauchen und dessen Fallback kurzzeitig mehrdeutig (=rollenlos) machen (Review-Hinweis).
    // Fuer diese Tests selbst irrelevant, da das Issue immer aus dem Pfad aufgeloest wird.
    mkdirSync(dirA, { recursive: true })
    writeFileSync(join(dirA, 'active-role'), 'implementer')
    writeFileSync(join(dirA, 'status.json'), JSON.stringify({ phase: 'done' }))
    mkdirSync(dirB, { recursive: true })
    writeFileSync(join(dirB, 'active-role'), 'test-author')
    writeFileSync(join(dirB, 'status.json'), JSON.stringify({ phase: 'done' }))
  })
  afterAll(() => { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }) })

  it('liest ausschliesslich den Marker aus dem Issue des Tool-Call-Pfads (A: implementer)', () => {
    expect(evaluate(write(`.harness/wt/${issueA}/src/x.ts`), defaultDeps).blocked).toBe(false)
    expect(evaluate(write(`.harness/wt/${issueA}/tests/x.test.ts`), defaultDeps).blocked).toBe(true)
  })
  it('liest ausschliesslich den Marker aus dem Issue des Tool-Call-Pfads (B: test-author)', () => {
    expect(evaluate(write(`.harness/wt/${issueB}/tests/x.test.ts`), defaultDeps).blocked).toBe(false)
    expect(evaluate(write(`.harness/wt/${issueB}/src/x.ts`), defaultDeps).blocked).toBe(true)
  })
})

describe('Issue-Ermittlung', () => {
  it('liest das Issue aus einem file_path', () => {
    expect(issueFromPath('.harness/wt/42/src/foo.ts')).toBe('42')
  })
  it('liest das Issue aus einem Bash-Kommando', () => {
    expect(issueFromCommand('cat .harness/wt/42/src/foo.ts')).toBe('42')
  })
  it('liest das Issue auch ohne Trailing-Slash nach der Issue-Nummer', () => {
    expect(issueFromCommand('cd .harness/wt/42 && cat tests/x.test.ts')).toBe('42')
  })
  it('liefert kein Issue ausserhalb eines Worktrees', () => {
    expect(issueFromPath('src/foo.ts')).toBeUndefined()
  })
})

describe('isTest/isSrc', () => {
  it('erkennt Testdateien an Pfad oder Endung', () => {
    expect(isTest('tests/foo.test.ts')).toBe(true)
    expect(isTest('src/foo.test.tsx')).toBe(true)
    expect(isTest('src/foo.ts')).toBe(false)
  })
  it('erkennt src/prisma als Quellpfade', () => {
    expect(isSrc('src/foo.ts')).toBe(true)
    expect(isSrc('prisma/schema.prisma')).toBe(true)
    expect(isSrc('openspec/changes/x/proposal.md')).toBe(false)
  })
})
