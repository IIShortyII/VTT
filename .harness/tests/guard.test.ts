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
  // Frueher stand hier "erlaubt Typecheck und Lint". Der volle Typecheck ist inzwischen ein
  // eigener Leckkanal (tsconfig.json schliesst tests/** ein) und hat eine eigene Sperre -
  // siehe 'Typecheck-Umgehung der Leseschranke (implementer)'.
  it('erlaubt Lint und den auf die Quellpfade eingeschraenkten Typecheck', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm lint'), deps).blocked).toBe(false)
    expect(evaluate(bash('cd .harness/wt/1 && pnpm typecheck:src'), deps).blocked).toBe(false)
  })
  it('laesst den test-author die Suite laufen (Rot-Bestaetigung, constitution.md 3.1)', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm test'), { readRole: () => 'test-author' }).blocked).toBe(false)
  })
})

// Beobachtet im ersten Feature-Run (#12, Issue #18): der implementer erfuhr aus der Ausgabe
// von `pnpm typecheck`, wie die Tests seine Fabrikfunktion nennen, und benannte sie um.
// tsconfig.json schliesst tests/** in "include" ein - tsc gibt bei einem Fehler Pfad, Zeile,
// Symbolnamen und die betroffene Quellzeile aus und umgeht damit die Pfadsperre aus Regel 1
// genauso wie ein direkter Testlauf (constitution.md 2.2).
describe('Typecheck-Umgehung der Leseschranke (implementer)', () => {
  const deps = { readRole: () => 'implementer' }

  it('blockiert den vollen Typecheck und nennt den erlaubten Weg', () => {
    const result = evaluate(bash('cd .harness/wt/1 && pnpm typecheck'), deps)
    expect(result.blocked).toBe(true)
    expect(result.message).toMatch(/typecheck:src/)
  })
  it('erlaubt den auf die Quellpfade eingeschraenkten Typecheck', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm typecheck:src'), deps).blocked).toBe(false)
  })
  // Ohne diese Sperre waere `npx tsc --noEmit` die naheliegende Hintertuer - sie steht in
  // jeder TypeScript-Dokumentation und braucht das Projektskript gar nicht.
  it('blockiert einen nackten Compiler-Aufruf', () => {
    expect(evaluate(bash('cd .harness/wt/1 && npx tsc --noEmit'), deps).blocked).toBe(true)
  })
  it('erlaubt den Compiler-Aufruf mit der Quellpfad-Projektdatei', () => {
    expect(evaluate(bash('cd .harness/wt/1 && npx tsc --noEmit -p tsconfig.src.json'), deps).blocked).toBe(false)
  })
  it('laesst den test-author den vollen Typecheck fahren (tests/ ist sein Bereich)', () => {
    expect(evaluate(bash('cd .harness/wt/1 && pnpm typecheck'), { readRole: () => 'test-author' }).blocked).toBe(false)
  })
  // Das Gate faehrt den vollen Typecheck als Subprozess des Orchestrators - es unterliegt dem
  // Guard ohnehin nicht, aber ein rollenloser Aufruf darf ebenso wenig haengenbleiben.
  it('laesst einen rollenlosen Aufruf den vollen Typecheck fahren', () => {
    expect(evaluate(bash('pnpm typecheck'), { readRole: () => '' }).blocked).toBe(false)
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
  // Bewusst weder `pnpm test` noch `pnpm typecheck`: beide auszufuehren ist fuer den
  // implementer eine eigene Sperre (siehe 'Testsuite-Ausfuehrung durch den implementer' und
  // 'Typecheck-Umgehung der Leseschranke') und waere hier kein unbeteiligtes Kommando mehr.
  it('erlaubt ein unbeteiligtes Kommando', () => {
    expect(evaluate(bash('pnpm lint --max-warnings 0'), deps).blocked).toBe(false)
  })
})

describe('Prisma-Migrationssperre', () => {
  const withDbUrl = (url: string | undefined, fn: () => void) => {
    const prev = process.env.DATABASE_URL
    if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url
    try { fn() } finally { if (prev === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prev }
  }

  it('blockiert Migration gegen eine entfernte DB', () => {
    withDbUrl('file:/var/lib/vtt/prod.db', () => {
      expect(evaluate(bash('prisma migrate deploy'), defaultDeps).blocked).toBe(true)
    })
  })
  it('erlaubt Migration gegen die ephemere Test-DB', () => {
    withDbUrl('file:./prisma/test.db', () => {
      expect(evaluate(bash('prisma migrate deploy'), defaultDeps).blocked).toBe(false)
    })
    withDbUrl('file::memory:', () => {
      expect(evaluate(bash('prisma migrate deploy'), defaultDeps).blocked).toBe(false)
    })
  })
  // Die lokale Entwicklungs-DB ist keine Wegwerf-DB: Migrationen sind Menschensache
  // (constitution.md 5.1), der Agent schreibt das Schema, fuehrt es aber nicht aus.
  it('blockiert Migration gegen die lokale Entwicklungs-DB', () => {
    withDbUrl('file:./prisma/dev.db', () => {
      expect(evaluate(bash('pnpm prisma migrate dev --name init'), defaultDeps).blocked).toBe(true)
    })
  })
  // migrate dev/reset schreiben ebenso gegen das, was in DATABASE_URL steht - eine Sperre nur
  // auf `deploy`/`db push` liesse den lokal naheliegendsten Aufruf offen.
  it('blockiert auch die lokalen Migrations-Varianten gegen eine entfernte DB', () => {
    withDbUrl('file:/var/lib/vtt/prod.db', () => {
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
  let tmpWtDir: string
  let deps: ReturnType<typeof makeDeps>

  // Jeder Lauf hier bekommt einen Worktree (add-harness-pause/design.md D5): seit der
  // Lebenszeichen-Pruefung ist ein Lauf ohne Worktree ohnehin inaktiv. Ohne ihn wuerde jeder
  // Test dieses Blocks aus dem falschen Grund gruen - insbesondere der zum Terminal-Filter,
  // der dann gar nicht mehr die Phase pruefte.
  const anlegen = (issue: string, role: string, status?: object) => {
    const dir = join(tmpRunsDir, issue)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'active-role'), role)
    if (status) writeFileSync(join(dir, 'status.json'), JSON.stringify(status))
    mkdirSync(join(tmpWtDir, issue), { recursive: true })
  }

  beforeEach(() => {
    tmpRunsDir = mkdtempSync(join(tmpdir(), 'guard-test-runs-'))
    tmpWtDir = mkdtempSync(join(tmpdir(), 'guard-test-wt-'))
    deps = makeDeps(tmpRunsDir, tmpWtDir)
  })
  afterEach(() => {
    rmSync(tmpRunsDir, { recursive: true, force: true })
    rmSync(tmpWtDir, { recursive: true, force: true })
  })

  it('wendet die Rolle des einzigen aktiven Issues auf einen relativen Pfad an', () => {
    anlegen('issue-a', 'implementer')
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(true)
    expect(evaluate(write('src/x.ts'), deps).blocked).toBe(false)
  })

  it('bleibt rollenlos, wenn mehrere Issues gleichzeitig eine Rolle tragen (mehrdeutig)', () => {
    anlegen('issue-a', 'implementer')
    anlegen('issue-b', 'test-author')
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(false)
  })

  it('ignoriert den Marker eines abgeschlossenen Runs (status.json-Phase terminal)', () => {
    // Worktree vorhanden, damit ausschliesslich die terminale Phase den Lauf inaktiv macht.
    anlegen('issue-done', 'implementer', { phase: 'done' })
    // Kein anderer aktiver Run -> ohne den Terminal-Filter waere dies faelschlich "die eine
    // aktive Rolle"; mit dem Filter bleibt der Aufruf rollenlos.
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(false)
  })
})

// --- add-harness-pause (Issue #23) ---------------------------------------------------------

describe('Eine aktive Rolle kann sich nicht selbst entpausieren', () => {
  it('Eine aktive Rolle darf das Pausieren nicht aufrufen', () => {
    for (const rolle of ['implementer', 'test-author']) {
      const deps = { readRole: () => rolle }
      for (const cmd of [
        'pnpm harness pause 23 "jest.config kaputt"',
        'pnpm harness resume 23',
        'tsx .harness/orchestrator.ts pause 23 "x"',
        'tsx .harness/orchestrator.ts resume 23 --runde-zurueck',
      ]) {
        const result = evaluate(bash(cmd), deps)
        expect([cmd, rolle, result.blocked]).toEqual([cmd, rolle, true])
        // Dieselbe Begruendung wie beim direkten Zugriff auf die Steuerdateien: es ist dieselbe
        // Frage, ob dieser Aufrufer die Rollensteuerung anfassen darf.
        expect(result.message).toMatch(/Steuerdateien/)
      }
    }
  })

  it('Ohne aktive Rolle sind die Verben erlaubt', () => {
    const deps = { readRole: () => '' }
    expect(evaluate(bash('pnpm harness pause 23 "jest.config kaputt"'), deps).blocked).toBe(false)
    expect(evaluate(bash('pnpm harness resume 23 --runde-zurueck'), deps).blocked).toBe(false)
  })
})

describe('Ein Lauf ohne Worktree beansprucht keine Rolle', () => {
  // Eigene tmp-Verzeichnisse fuer runs/ UND wt/: der Lebenszeichen-Test darf weder gegen das
  // echte .harness/runs noch gegen das echte .harness/wt pruefen (dort liegen echte Laeufe).
  let tmpRunsDir: string
  let tmpWtDir: string

  const anlegen = (issue: string, role: string, mitWorktree: boolean) => {
    const dir = join(tmpRunsDir, issue)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'active-role'), role)
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ phase: 'implement' }))
    if (mitWorktree) mkdirSync(join(tmpWtDir, issue), { recursive: true })
  }

  beforeEach(() => {
    tmpRunsDir = mkdtempSync(join(tmpdir(), 'guard-test-runs-'))
    tmpWtDir = mkdtempSync(join(tmpdir(), 'guard-test-wt-'))
  })
  afterEach(() => {
    rmSync(tmpRunsDir, { recursive: true, force: true })
    rmSync(tmpWtDir, { recursive: true, force: true })
  })

  it('Ein Lauf ohne Worktree wird bei der Rollenermittlung übergangen', () => {
    anlegen('issue-tot', 'implementer', false)
    const deps = makeDeps(tmpRunsDir, tmpWtDir)
    // Rollenlos: ein relativer Pfad loest kein Issue auf, und der einzige Marker gehoert zu
    // einem Lauf, der nichts hat, woran er arbeiten koennte.
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(false)
  })

  it('Ein Lauf mit Worktree bleibt maßgeblich', () => {
    anlegen('issue-lebt', 'implementer', true)
    const deps = makeDeps(tmpRunsDir, tmpWtDir)
    expect(evaluate(write('tests/x.test.ts'), deps).blocked).toBe(true)
    expect(evaluate(write('src/x.ts'), deps).blocked).toBe(false)
  })

  it('Ein direkt adressierter Lauf bleibt von der Prüfung unberührt', () => {
    // Kein Worktree - der Aufruf nennt sein Issue aber selbst im Pfad. Die Lebenszeichen-Pruefung
    // gilt nur im Fallback; hier belegt der Pfad die Zustaendigkeit bereits.
    anlegen('77', 'implementer', false)
    const deps = makeDeps(tmpRunsDir, tmpWtDir)
    expect(evaluate(write('.harness/wt/77/tests/x.test.ts'), deps).blocked).toBe(true)
    expect(evaluate(write('.harness/wt/77/src/x.ts'), deps).blocked).toBe(false)
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
