import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  readStatus, writeStatus, next, reviewRework, confirmTestRework, confirmAppReview, checkPreflight,
  scopeOfFinding, parseJestFailures, recordRoundSummary, recordReview, runDir, worktreeDir,
  cleanup as cleanupRun,
  confirmRed, gate, boardVerb,
  buildImplPrompt, buildTestReworkPrompt, readChangeSpec, removeUntrackedSourceDocs,
  MAX_ROUNDS,
} from '../orchestrator.js'
import type { Status, Sh } from '../orchestrator.js'
import { BOARD } from '../board.js'
import type { GhRunner } from '../board.js'

let counter = 0
function freshIssue(): string {
  counter += 1
  return `__orch_test_${counter}__`
}
function makeStatus(issue: string, overrides: Partial<Status> = {}): Status {
  const status: Status = { issue, branch: `feat/${issue}`, round: 0, phase: 'implement', rounds: [], ...overrides }
  writeStatus(status)
  return status
}
function cleanup(issue: string) {
  rmSync(runDir(issue), { recursive: true, force: true })
  rmSync(worktreeDir(issue), { recursive: true, force: true })
}

describe('scopeOfFinding', () => {
  it('ordnet src/ und prisma/ der impl-Rolle zu', () => {
    expect(scopeOfFinding({ ort: 'src/foo.ts' })).toBe('impl')
    expect(scopeOfFinding({ ort: 'prisma/schema.prisma' })).toBe('impl')
  })
  it('ordnet tests/ der test-Rolle zu', () => {
    expect(scopeOfFinding({ ort: 'tests/foo.unit.test.ts' })).toBe('test')
    expect(scopeOfFinding({ ort: 'tests/__mocks__/styleMock.cjs' })).toBe('test')
  })
  it('ordnet alles andere konservativ der human-Rolle zu', () => {
    expect(scopeOfFinding({ ort: 'openspec/changes/x/proposal.md' })).toBe('human')
    expect(scopeOfFinding({ ort: '.github/workflows/ci.yml' })).toBe('human')
  })
})

describe('Spec-Szenario: Test-scoped Block-Findings gehen an den test-author', () => {
  const issue = freshIssue()
  afterEach(() => cleanup(issue))

  it('routet ausschließlich test-scoped Block-Findings an invoke-test-author-rework und erhöht die Runde', () => {
    const s = makeStatus(issue, {
      round: 0,
      lastReview: { recommendation: 'nacharbeit', findings: [{ schwere: 'block', ort: 'tests/foo.test.ts', problem: 'x' }] },
    })
    const action = reviewRework(s as Parameters<typeof reviewRework>[0])
    expect(JSON.parse(action).action).toBe('invoke-test-author-rework')
    const after = readStatus(issue)
    expect(after.round).toBe(1)
    expect(after.phase).toBe('rework-tests')
    expect(after.pendingTestFindings).toHaveLength(1)
  })

  it('parkt bei gemischten Block-Findings nur den test-scoped Anteil und routet an den implementer', () => {
    const s = makeStatus(issue, {
      round: 0,
      lastReview: {
        recommendation: 'nacharbeit',
        findings: [
          { schwere: 'block', ort: 'src/foo.ts', problem: 'impl-problem' },
          { schwere: 'block', ort: 'tests/foo.test.ts', problem: 'test-problem' },
        ],
      },
    })
    const action = reviewRework(s as Parameters<typeof reviewRework>[0])
    expect(JSON.parse(action).action).toBe('invoke-implementer')
    const after = readStatus(issue)
    expect(after.phase).toBe('implement')
    expect(after.pendingTestFindings).toHaveLength(1)
    expect((after.pendingTestFindings![0] as Record<string, unknown>).ort).toBe('tests/foo.test.ts')
  })

  it('eskaliert sofort ohne Rundenverbrauch bei einem human-scoped Block-Finding', () => {
    const s = makeStatus(issue, {
      round: 1,
      lastReview: { recommendation: 'nacharbeit', findings: [{ schwere: 'block', ort: 'openspec/changes/x/proposal.md', problem: 'x' }] },
    })
    const action = reviewRework(s as Parameters<typeof reviewRework>[0])
    expect(JSON.parse(action).action).toBe('escalate')
    const after = readStatus(issue)
    expect(after.phase).toBe('escalated')
    expect(after.round).toBe(1) // unveraendert - keine Rolle haette es beheben koennen
  })
})

describe('Spec-Szenario: Revalidierung nach Test-Nacharbeit', () => {
  const issue = freshIssue()
  afterEach(() => cleanup(issue))

  it('confirmTestRework setzt IMMER auf Phase gate zurueck statt direkt auf review (§3.2: Typecheck/Lint muessen vor dem Review laufen)', () => {
    makeStatus(issue, {
      round: 1, phase: 'rework-tests',
      pendingTestFindings: [{ schwere: 'block', ort: 'tests/foo.test.ts', problem: 'x' }],
      lastReview: { recommendation: 'nacharbeit', findings: [] },
      lastGate: { green: true },
    })
    confirmTestRework(issue)
    const after = readStatus(issue)
    expect(after.phase).toBe('gate')
    expect(after.lastGate).toBeUndefined()
    expect(after.lastReview).toBeUndefined()
    expect(after.pendingTestFindings).toBeUndefined()
  })

  it('geht bei gruenem Gate ohne offene Test-Findings direkt zum Reviewer, ohne Implementer-Runde', () => {
    const before = makeStatus(issue, { round: 1, phase: 'gate', lastGate: { green: true } })
    const action = next(issue)
    expect(JSON.parse(action).action).toBe('invoke-reviewer')
    expect(readStatus(issue).round).toBe(before.round) // keine Implementer-Runde => kein Rundenverbrauch
  })

  it('geht bei weiterhin rotem Gate reguraer zur Implementer-Runde mit Gate-Feedback', () => {
    makeStatus(issue, { round: 1, phase: 'gate', lastGate: { green: false, failures: [{ name: 'x', message: 'y' }] } })
    const action = next(issue)
    expect(JSON.parse(action).action).toBe('invoke-implementer')
    expect(readStatus(issue).round).toBe(2)
  })
})

describe('Spec-Szenario: Eskalationsgarantie bleibt rollenunabhängig', () => {
  const issue = freshIssue()
  afterEach(() => cleanup(issue))

  it('eskaliert nach der dritten Nacharbeit-Runde ueber drei verschiedene reale Einstiegspunkte (rotes Gate, test-scoped Review, App-Test-Ablehnung)', () => {
    // Runde 1: rotes Gate -> next() routet an den implementer (reworkImplementer intern).
    makeStatus(issue, { round: 0, phase: 'gate', lastGate: { green: false, failures: [{ name: 'x', message: 'y' }] } })
    expect(JSON.parse(next(issue)).action).toBe('invoke-implementer')
    expect(readStatus(issue).round).toBe(1)

    // Runde 2: Reviewer meldet ausschliesslich test-scoped Block-Findings -> reviewRework routet
    // an den test-author (der andere reale Einstiegspunkt in denselben Zaehler).
    writeStatus({
      ...readStatus(issue), phase: 'review',
      lastReview: { recommendation: 'nacharbeit', findings: [{ schwere: 'block', ort: 'tests/x.test.ts', problem: 'x' }] },
    })
    expect(JSON.parse(next(issue)).action).toBe('invoke-test-author-rework')
    expect(readStatus(issue).round).toBe(2)

    // Runde 3: menschliche App-Test-Ablehnung -> dritter Einstiegspunkt (confirmAppReview).
    writeStatus({ ...readStatus(issue), phase: 'app-review' })
    confirmAppReview(issue, 'nein', 'gefaellt mir noch nicht')
    expect(JSON.parse(next(issue)).action).toBe('invoke-implementer') // idempotent: Runde bereits von confirmAppReview gebucht
    expect(readStatus(issue).round).toBe(3)
    expect(readStatus(issue).round).toBe(MAX_ROUNDS)

    // 4. Nacharbeit waere noetig (z.B. erneut rotes Gate) -> Eskalation statt einer vierten Runde.
    writeStatus({ ...readStatus(issue), phase: 'gate', lastGate: { green: false, failures: [] } })
    expect(JSON.parse(next(issue)).action).toBe('escalate')
    expect(readStatus(issue).phase).toBe('escalated')
    expect(readStatus(issue).round).toBe(MAX_ROUNDS) // kein weiterer Rundenverbrauch bei der Eskalation selbst
  })
})

describe('Spec-Szenario: Mehrzeiliger Diff wird durchgereicht', () => {
  const issue = freshIssue()
  afterEach(() => cleanup(issue))

  it('reicht den vollstaendigen Expected/Received-Diff durch und schneidet den Codeframe/Stacktrace ab', () => {
    mkdirSync(runDir(issue), { recursive: true })
    const jest = {
      testResults: [{
        assertionResults: [{
          status: 'failed',
          title: 'GIVEN etwas WHEN etwas passiert THEN etwas anderes',
          failureMessages: [
            [
              'expect(received).toEqual(expected)',
              '',
              'Expected: {"a": 1, "b": 2}',
              'Received: {"a": 1, "b": 3}',
              '',
              '  10 |',
              '> 11 |   expect(x).toEqual(y)',
              '     |             ^',
              '',
              '  at Object.<anonymous> (tests/foo.unit.test.ts:11:20)',
            ].join('\n'),
          ],
        }],
      }],
    }
    writeFileSync(join(runDir(issue), 'jest.json'), JSON.stringify(jest))
    const failures = parseJestFailures(issue)
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toContain('Expected: {"a": 1, "b": 2}')
    expect(failures[0].message).toContain('Received: {"a": 1, "b": 3}')
    expect(failures[0].message).not.toContain('tests/foo.unit.test.ts')
    expect(failures[0].message).not.toContain('expect(x).toEqual(y)')
  })
})

describe('Spec-Szenario: Leak degradiert statt zu blockieren', () => {
  const issue = freshIssue()
  afterEach(() => cleanup(issue))

  it('degradiert auf die Erstzeilen-Form, wenn die Failure-Message woertlichen Testinhalt enthaelt, statt den Run zu blockieren', () => {
    const testDir = join(worktreeDir(issue), 'tests')
    mkdirSync(testDir, { recursive: true })
    const testLine = 'expect(berechneGesamtsummeFuerMehrereEintraege(sammlung)).toBe(42)'
    writeFileSync(join(testDir, 'foo.unit.test.ts'), `it('x', () => {\n  ${testLine}\n})\n`)
    mkdirSync(runDir(issue), { recursive: true })
    const leakedMessage = `Custom matcher error\n\n${testLine}\n\nirgendein DOM-Auszug ohne Codeframe-Marker`
    const jest = { testResults: [{ assertionResults: [{ status: 'failed', title: 'Szenario X', failureMessages: [leakedMessage] }] }] }
    writeFileSync(join(runDir(issue), 'jest.json'), JSON.stringify(jest))
    const failures = parseJestFailures(issue)
    expect(failures).toHaveLength(1)
    expect(failures[0].message).not.toContain(testLine)
    expect(failures[0].message).toBe('Custom matcher error')
  })
})

describe('preflight-archive (mechanischer Check statt Review-Finding)', () => {
  const issue = freshIssue()
  const change = 'x'
  afterEach(() => cleanup(issue))

  function writeTasks(content: string) {
    const dir = join(worktreeDir(issue), 'openspec', 'changes', change)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'tasks.md'), content)
  }

  it('meldet offene Tasks, auch eingerueckt oder mit "*"-Aufzaehlung', () => {
    makeStatus(issue, { change })
    writeTasks('# Tasks\n- [ ] 1.1 x\n  - [ ] 1.1.1 y\n* [ ] 1.2 z\n')
    expect(checkPreflight(issue).ok).toBe(false)
  })
  it('ist ok, wenn alle Tasks abgehakt sind', () => {
    makeStatus(issue, { change })
    writeTasks('# Tasks\n- [x] 1.1 x\n  - [x] 1.1.1 y\n')
    expect(checkPreflight(issue).ok).toBe(true)
  })
  it('meldet ein fehlendes Change-Verzeichnis', () => {
    makeStatus(issue, { change: 'existiert-nicht' })
    expect(checkPreflight(issue)).toEqual({ ok: false, reason: 'change-dir-missing' })
  })
})

describe("'done'-Phase ist terminal (kein Ruecksturz in fix-tasks nach dem Archivieren)", () => {
  const issue = freshIssue()
  const change = 'x'
  afterEach(() => cleanup(issue))

  it('bleibt nach dem Uebergang in "archived" bei archive-and-open-pr, auch wenn das Change-Verzeichnis inzwischen fehlt', () => {
    const dir = join(worktreeDir(issue), 'openspec', 'changes', change)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'tasks.md'), '- [x] 1.1 erledigt\n')
    makeStatus(issue, { change, phase: 'done' })

    const first = next(issue)
    expect(JSON.parse(first).action).toBe('archive-and-open-pr')
    expect(readStatus(issue).phase).toBe('archived')

    // Simuliert das tatsaechliche Verschieben des Change-Verzeichnisses beim Archivieren.
    rmSync(dir, { recursive: true, force: true })

    const second = next(issue)
    expect(JSON.parse(second).action).toBe('archive-and-open-pr') // NICHT fix-tasks
  })
})

describe('Rollen-Validierung (G1/G2)', () => {
  const issue = freshIssue()
  let exitSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    makeStatus(issue)
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => { exitSpy.mockRestore(); errorSpy.mockRestore(); cleanup(issue) })

  it('lehnt record-round-summary mit unbekannter Rolle ab, statt sie als implementer-Historie zu verwenden', () => {
    expect(() => recordRoundSummary(issue, 'testauthor' as never, '{}')).toThrow(/process\.exit/)
  })

  it('lehnt eine Reviewer-Antwort ab, die vom Schema abweicht (freigabe_empfehlung fehlt)', () => {
    expect(() => recordReview(issue, JSON.stringify({ findings: [] }))).toThrow(/process\.exit/)
  })

  it('lehnt "nacharbeit" ohne jedes Block-Finding ab, statt eine Runde ohne Feedback zu verbrauchen', () => {
    const json = JSON.stringify({ freigabe_empfehlung: 'nacharbeit', findings: [{ schwere: 'hinweis', ort: 'src/x.ts', problem: 'kosmetisch' }] })
    expect(() => recordReview(issue, json)).toThrow(/process\.exit/)
  })

  it('persistiert eine schemawidrige Reviewer-Antwort statt sie zu verwerfen (teure Opus-Antwort)', () => {
    const json = JSON.stringify({ freigabe_empfehlung: 'vielleicht' })
    expect(() => recordReview(issue, json)).toThrow(/process\.exit/)
    const persisted = readFileSync(join(runDir(issue), 'rejected-review.json'), 'utf8')
    expect(persisted).toBe(json)
  })
})

describe('Cleanup nach dem Merge', () => {
  const issue = freshIssue()
  let exitSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => { exitSpy.mockRestore(); errorSpy.mockRestore(); logSpy.mockRestore(); cleanup(issue) })

  it('raeumt einen laufenden Run nicht auf (wuerde sich selbst den Boden entziehen)', () => {
    makeStatus(issue, { phase: 'implement' })
    expect(() => cleanupRun(issue)).toThrow(/process\.exit/)
  })

  it('raeumt einen eskalierten Run nicht auf (muss fuer den Menschen inspizierbar bleiben)', () => {
    makeStatus(issue, { phase: 'escalated' })
    expect(() => cleanupRun(issue)).toThrow(/process\.exit/)
  })

  it('entfernt nach dem Archivieren den Rollenmarker, behaelt aber den Audit-Trail', () => {
    makeStatus(issue, { phase: 'archived' })
    const marker = join(runDir(issue), 'active-role')
    writeFileSync(marker, 'implementer')
    cleanupRun(issue)
    expect(existsSync(marker)).toBe(false)
    expect(existsSync(join(runDir(issue), 'status.json'))).toBe(true)
  })
})

// Die Aufrufstellen des Board-Status (spec.md "Der Board-Status folgt dem Schritt").
//
// Geprueft wird hier die VERDRAHTUNG - dass der jeweilige Schritt den richtigen Status
// anfordert -, nicht der Schreibzugriff selbst; der steht in board.test.ts. Die Issue-Nummern
// dieser Tests sind bewusst keine echten (`__orch_test_N__`): setBoardStatus bricht daran ab,
// bevor gh gestartet wird, und hinterlaesst genau eine Zeile in board.log. Diese Zeile ist der
// Zeuge dafuer, mit welchem Status der Schritt das Board angesprochen hat.
describe('Board-Status an den Schritten des Loops', () => {
  const boardLog = (issue: string) => {
    const p = join(runDir(issue), 'board.log')
    return existsSync(p) ? readFileSync(p, 'utf8').trim() : ''
  }
  const logZeilen = (issue: string) => boardLog(issue).split('\n').filter(l => l.length > 0)

  let errorSpy: jest.SpyInstance
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    // setup.ts schaltet den Board-Zugriff fuer die Suite ab; diese Tests brauchen ihn an.
    delete process.env.HARNESS_BOARD
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env.HARNESS_BOARD = 'off'
    errorSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('Beginn der Spezifikation setzt „Spec"', () => {
    const issue = freshIssue()
    try {
      boardVerb(issue, 'spec') // kein start() vorher: das Verb kommt VOR dem Lauf
      expect(existsSync(join(runDir(issue), 'status.json'))).toBe(false)
      expect(boardLog(issue)).toContain('spec')
    } finally { cleanup(issue) }
  })

  it('Bestätigtes Rot setzt „Test rot"', () => {
    const issue = freshIssue()
    try {
      makeStatus(issue, { phase: 'red' })
      const rot: Sh = () => ({ ok: false, out: 'expect(received).toBe(expected)\n\nExpected: 3\nReceived: undefined' })
      confirmRed(issue, rot)
      expect(readStatus(issue).phase).toBe('implement') // Rot aus dem richtigen Grund
      expect(boardLog(issue)).toContain('test-rot')
    } finally { cleanup(issue) }
  })

  it('Rot aus dem falschen Grund schaltet das Board nicht weiter', () => {
    const issue = freshIssue()
    try {
      makeStatus(issue, { phase: 'red' })
      const kaputt: Sh = () => ({ ok: false, out: "foo.unit.test.ts:3:1 - error TS1005: ';' expected" })
      confirmRed(issue, kaputt)
      expect(readStatus(issue).phase).toBe('red') // kein bestaetigtes Rot (constitution.md §3.1)
      expect(boardLog(issue)).toBe('')
    } finally { cleanup(issue) }
  })

  it('Jeder Einstieg in einen Implementierungsschritt setzt „Implementierung"', () => {
    const issue = freshIssue()
    try {
      // Erster Einstieg: regulaer nach bestaetigtem Rot.
      makeStatus(issue, { phase: 'implement' })
      expect(JSON.parse(next(issue)).action).toBe('invoke-implementer')

      // Zweiter Einstieg: Nacharbeit nach rotem Gate, ueber reworkTo statt ueber next().
      writeStatus({ ...readStatus(issue), phase: 'gate', lastGate: { green: false, failures: [] } })
      expect(JSON.parse(next(issue)).action).toBe('invoke-implementer')
      expect(readStatus(issue).round).toBe(1)

      const zeilen = logZeilen(issue)
      expect(zeilen).toHaveLength(2)
      expect(zeilen.every(z => z.includes('implementierung'))).toBe(true)
    } finally { cleanup(issue) }
  })

  it('Der Gate-Start setzt „Gate + Review"', () => {
    const issue = freshIssue()
    try {
      makeStatus(issue, { phase: 'gate' })
      let logBeimErstenWerkzeug = ''
      const werkzeuge: Sh = () => {
        if (logBeimErstenWerkzeug === '') logBeimErstenWerkzeug = boardLog(issue)
        return { ok: true, out: '' }
      }
      gate(issue, werkzeuge)
      // Der Status steht schon, bevor Typecheck/Lint/Testlauf ueberhaupt beginnen.
      expect(logBeimErstenWerkzeug).toContain('gate-review')
      expect(logZeilen(issue)[0]).toContain('gate-review')
    } finally { cleanup(issue) }
  })

  it('Die Ankündigung des App-Tests setzt „App-Test (Mensch)"', () => {
    const issue = freshIssue()
    try {
      makeStatus(issue, { phase: 'review', lastReview: { recommendation: 'ok', findings: [] } })
      expect(JSON.parse(next(issue)).action).toBe('present-app-review')
      expect(boardLog(issue)).toContain('app-test')
    } finally { cleanup(issue) }
  })

  it('Aufräumen nach dem Merge setzt „Fertig"', () => {
    const issue = '9042' // numerisch: der Issue-Zustand wird tatsaechlich abgefragt
    try {
      makeStatus(issue, { phase: 'archived' })
      const calls: string[][] = []
      const gh: GhRunner = args => {
        calls.push(args)
        if (args.includes('issue')) return { ok: true, out: JSON.stringify({ state: 'CLOSED' }) }
        if (args.some(a => /\bmutation\b/.test(a))) return { ok: true, out: '{"data":{}}' }
        return { ok: true, out: JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [{ id: 'PVTI_test', project: { id: BOARD.projectId } }] } } } } }) }
      }
      cleanupRun(issue, gh)
      const mutation = calls.find(a => a.some(x => /\bmutation\b/.test(x)))
      expect(mutation).toBeDefined()
      expect(mutation).toContain(`option=${BOARD.options.fertig}`)
    } finally { cleanup(issue) }
  })

  it('Aufräumen bei noch offenem Issue setzt „Fertig" nicht', () => {
    const issue = '9043'
    try {
      makeStatus(issue, { phase: 'archived' })
      const marker = join(runDir(issue), 'active-role')
      writeFileSync(marker, 'implementer')
      const calls: string[][] = []
      const gh: GhRunner = args => {
        calls.push(args)
        return { ok: true, out: JSON.stringify({ state: 'OPEN' }) }
      }
      cleanupRun(issue, gh)
      expect(calls.some(a => a.some(x => /\bmutation\b/.test(x)))).toBe(false)
      expect(existsSync(marker)).toBe(false) // das Aufraeumen selbst laeuft trotzdem durch
    } finally { cleanup(issue) }
  })

  it('Der Zustandsautomat verhält sich mit und ohne Board identisch', () => {
    const issue = freshIssue()
    const lauf = () => {
      makeStatus(issue, { phase: 'implement', round: 0 })
      const action = next(issue)
      return {
        action,
        status: readFileSync(join(runDir(issue), 'status.json'), 'utf8'),
        rolle: readFileSync(join(runDir(issue), 'active-role'), 'utf8'),
      }
    }
    try {
      process.env.HARNESS_BOARD = 'off'
      const abgeschaltet = lauf()
      expect(boardLog(issue)).toBe('') // kein Zugriff, kein Protokoll
      cleanup(issue)

      delete process.env.HARNESS_BOARD
      const scheiternd = lauf()
      expect(boardLog(issue)).not.toBe('') // der Zugriff wurde versucht und ist gescheitert

      expect(scheiternd.action).toBe(abgeschaltet.action)
      expect(scheiternd.status).toBe(abgeschaltet.status)
      expect(scheiternd.rolle).toBe(abgeschaltet.rolle)
    } finally { cleanup(issue) }
  })
})

// Das Material, das eine Rolle aus dem OpenSpec-Change bekommt
// (spec.md "harness-spec-delivery").
//
// Geprueft wird die AUSGABE der beiden Prompt-Bauer, nicht readChangeSpec allein: der
// implementer sieht nie den Change-Ordner, sondern ausschliesslich diesen Text (constitution.md
// §2.2). Was hier nicht ankommt, existiert fuer ihn nicht.
describe('Material aus dem OpenSpec-Change', () => {
  const CHANGE = 'ein-change'
  const PROPOSAL = 'Warum dieser Change existiert: die Sitzung verlaengert sich gleitend.'
  const DESIGN = 'D4 - Der Cookie heisst "sid" und traegt HttpOnly, SameSite=Lax, 30 Tage.\n'
    + 'D5 - Gleitende Verlaengerung mit Halbwertsregel und injizierter Uhr.\n'
    + 'D12 - Die Registrierung verraet die Kontoexistenz, der Anmeldepfad nicht.'
  const SPEC_A = '### Requirement: Anmeldung\nDer Server MUST die Sitzung serverseitig fuehren.'
  const SPEC_B = '### Requirement: Abmeldung\nDer Server MUST die Sitzung verwerfen.'
  // Mehrzeilig, damit "der vollstaendige Text" pruefbar ist: die letzte Zeile faellt einer
  // Kuerzung als erste zum Opfer und wird deshalb einzeln zugesichert.
  const DESIGN_LETZTE_ZEILE = 'D12 - Die Registrierung verraet die Kontoexistenz, der Anmeldepfad nicht.'

  // Legt im Worktree eines Issues einen Change-Ordner mit genau den gewuenschten Dateien an und
  // traegt den Change-Namen in status.json ein - readChangeSpec liest aus dem Worktree, nicht
  // aus dem Hauptrepo.
  function makeChange(issue: string, files: { design?: string; specs?: Record<string, string> } = {}) {
    const dir = join(worktreeDir(issue), 'openspec', 'changes', CHANGE)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'proposal.md'), PROPOSAL)
    if (files.design !== undefined) writeFileSync(join(dir, 'design.md'), files.design)
    for (const [capability, text] of Object.entries(files.specs ?? { auth: SPEC_A })) {
      mkdirSync(join(dir, 'specs', capability), { recursive: true })
      writeFileSync(join(dir, 'specs', capability, 'spec.md'), text)
    }
    return makeStatus(issue, { change: CHANGE, phase: 'implement' })
  }
  // Die Prompt-Bauer schreiben auf stdout; abgegriffen wird, was der Rolle tatsaechlich zugeht.
  function promptVon(bauen: () => void): string {
    const zeilen: string[] = []
    const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { zeilen.push(a.map(String).join(' ')) })
    try { bauen() } finally { spy.mockRestore() }
    return zeilen.join('\n')
  }

  it('Ein Change mit design.md liefert die Entscheidungen an den implementer', () => {
    const issue = freshIssue()
    try {
      makeChange(issue, { design: DESIGN })
      const prompt = promptVon(() => buildImplPrompt(issue))
      // DESIGN ist mehrzeilig, und die THEN-Klausel verlangt den VOLLSTAENDIGEN Text: eine
      // Implementierung, die die Datei auf ihre erste Zeile oder auf n Zeichen kuerzte - die
      // von der Spec verbotene Auswahl innerhalb der Datei -, waere sonst hier gruen.
      expect(prompt).toContain(DESIGN)
      expect(prompt).toContain(DESIGN_LETZTE_ZEILE)
    } finally { cleanup(issue) }
  })

  it('Die Entscheidungen stehen vor den Anforderungen', () => {
    const issue = freshIssue()
    try {
      makeChange(issue, { design: DESIGN })
      const prompt = promptVon(() => buildImplPrompt(issue))
      // Positionen statt eines erwarteten Gesamtstrings: geprueft wird die Reihenfolge
      // warum -> wie entschieden -> was genau (design.md D1), nicht die Formatierung dazwischen.
      expect(prompt.indexOf(PROPOSAL)).toBeGreaterThanOrEqual(0)
      expect(prompt.indexOf(DESIGN)).toBeGreaterThan(prompt.indexOf(PROPOSAL))
      expect(prompt.indexOf(SPEC_A)).toBeGreaterThan(prompt.indexOf(DESIGN))
    } finally { cleanup(issue) }
  })

  it('Ein Change ohne design.md ergibt einen Auftrag ohne Lücke', () => {
    const issue = freshIssue()
    try {
      makeChange(issue) // keine design.md
      const prompt = promptVon(() => buildImplPrompt(issue))
      expect(prompt).toContain(PROPOSAL)
      expect(prompt).toContain(SPEC_A)
      expect(prompt).not.toContain('design.md') // kein Platzhalter, keine leere Rubrik
      expect(prompt.match(/^## Quelle: /gm) ?? []).toHaveLength(2)
    } finally { cleanup(issue) }
  })

  it('Jeder Block trägt seine Quelldatei', () => {
    const issue = freshIssue()
    try {
      makeChange(issue, { design: DESIGN, specs: { auth: SPEC_A, session: SPEC_B } })
      const prompt = promptVon(() => buildImplPrompt(issue))
      // Pfade relativ zum Change-Verzeichnis und mit Forward-Slashes (design.md D2) - ein aus
      // join() entstandener Backslash-Pfad waere die Fehlerklasse aus #21.
      expect(prompt).toContain('## Quelle: proposal.md')
      expect(prompt).toContain('## Quelle: design.md')
      expect(prompt).toContain('## Quelle: specs/auth/spec.md')
      expect(prompt).toContain('## Quelle: specs/session/spec.md')
      expect(prompt.match(/^## Quelle: /gm) ?? []).toHaveLength(4)
    } finally { cleanup(issue) }
  })

  it('Die Test-Nacharbeit sieht dieselben Entscheidungen', () => {
    const issue = freshIssue()
    try {
      const s = makeChange(issue, { design: DESIGN })
      s.pendingTestFindings = [{ schwere: 'block', ort: 'tests/auth.integration.test.ts', problem: 'Szenario fehlt' }]
      writeStatus(s)
      const aufbereitet = readChangeSpec(issue, readStatus(issue))
      expect(aufbereitet).toContain(DESIGN)
      expect(aufbereitet).toContain('## Quelle: design.md')
      // Beide Bauer setzen denselben aufbereiteten Change ein; ein Auseinanderdriften waere
      // der Fehler, nicht die Gleichheit.
      expect(promptVon(() => buildImplPrompt(issue))).toContain(aufbereitet)
      expect(promptVon(() => buildTestReworkPrompt(issue))).toContain(aufbereitet)
    } finally { cleanup(issue) }
  })

  it('Testinhalt in design.md hält den Lauf an und nennt die Datei', () => {
    const issue = freshIssue()
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
    const meldungen: string[] = []
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { meldungen.push(a.map(String).join(' ')) })
    try {
      const geleakteZeile = "expect(res.cookies[0].name).toBe('sid') // laenger als zwanzig Zeichen"
      makeChange(issue, { design: `${DESIGN}\n${geleakteZeile}` })
      const testDir = join(worktreeDir(issue), 'tests')
      mkdirSync(testDir, { recursive: true })
      writeFileSync(join(testDir, 'auth.integration.test.ts'), `${geleakteZeile}\n`)

      expect(() => promptVon(() => buildImplPrompt(issue))).toThrow(/process\.exit/)
      const meldung = meldungen.join('\n')
      expect(meldung).toContain('auth.integration.test.ts') // die betroffene Testdatei
      expect(meldung).toContain('(Fundstelle: design.md)')  // als Fundstelle ausgewiesen, nicht bloss erwaehnt
    } finally { exitSpy.mockRestore(); errorSpy.mockRestore(); cleanup(issue) }
  })

  it('Eine zitierte Konvention ist kein Leak', () => {
    const issue = freshIssue()
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      // Der Docblock, den AGENTS.md fuer Komponententests vorschreibt: er steht dort und steht
      // deshalb notwendig auch in jeder solchen Testdatei. Die Zeile stammt aus AGENTS.md
      // selbst, nicht aus einer Kopie hier - sonst pruefte der Test eine eigene Behauptung
      // statt der Konvention. Sie steht dort NICHT als eigene Zeile, sondern in Fliesstext und
      // Backticks eingebettet; ein Vergleich auf ganze Zeilen faende sie nie (design.md D6).
      const konvention = '/** @jest-environment jsdom */'
      // Nicht cwd-relativ: die Modulwurzel steht fest, das Arbeitsverzeichnis des Jest-Aufrufs
      // nicht - sonst schiede der Test an einem ENOENT aus, waehrend der Waechter in Ordnung ist.
      const agents = readFileSync(join(__dirname, '..', '..', 'AGENTS.md'), 'utf8')
      expect(agents).toContain(konvention)
      expect(agents.split('\n').map(l => l.trim())).not.toContain(konvention)

      // Der Worktree traegt seine eigene AGENTS.md - so, wie git worktree add ihn anlegt.
      const zitat = `D10 - Testaufbau: Docblock ${konvention} am Dateianfang.`
      makeChange(issue, { design: `${DESIGN}\n${zitat}` })
      const agentsImWorktree = join(worktreeDir(issue), 'AGENTS.md')
      writeFileSync(agentsImWorktree, agents)
      const testDir = join(worktreeDir(issue), 'tests')
      mkdirSync(testDir, { recursive: true })
      writeFileSync(join(testDir, 'auth-ui.unit.test.tsx'), `${konvention}\n`)

      const prompt = promptVon(() => buildImplPrompt(issue))
      // Die zitierende Zeile muss ANKOMMEN, nicht bloss den Abbruch vermeiden: eine
      // Implementierung, die sie still herausfiltert, waere sonst ebenfalls gruen - genau die
      // Variante, die spec.md dem Waechter verbietet.
      expect(prompt).toContain(DESIGN)
      expect(prompt).toContain(zitat)

      // Gegenprobe zum Worktree-Bezug (D6): ohne die Fassung IM WORKTREE greift keine Ausnahme.
      // Ohne sie waere eine Implementierung, die die Fassung des Hauptrepos liest, genauso
      // gruen - der Test wuerde mehr behaupten, als er zeigt. Zugleich der Beleg fuer die
      // zweite Haelfte von D6: fehlen die Dateien, faellt der Waechter auf die strengere Seite.
      rmSync(agentsImWorktree, { force: true })
      expect(() => promptVon(() => buildImplPrompt(issue))).toThrow(/process\.exit/)
    } finally { exitSpy.mockRestore(); errorSpy.mockRestore(); cleanup(issue) }
  })

  // Deckt die Nebenbedingung aus spec.md ab: "Stammt er aus keinem der Bloecke, MUST die
  // Meldung wie bisher lauten." Das ist der von design.md D4 begruendete Kern - ein Treffer im
  // angehaengten Gate-Feedback darf keine Falschauskunft ueber eine Change-Datei erzeugen. Ein
  // Fallback auf parts[0].quelle bliebe sonst unbemerkt und schickte den Menschen genau dort
  // in die Irre, wo er sich auf die Auskunft verlaesst.
  it('Ein Treffer ausserhalb der Bloecke meldet keine Fundstelle', () => {
    const issue = freshIssue()
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
    const meldungen: string[] = []
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { meldungen.push(a.map(String).join(' ')) })
    try {
      const geleakteZeile = "expect(res.cookies[0].name).toBe('sid') // laenger als zwanzig Zeichen"
      const s = makeChange(issue, { design: DESIGN }) // die design.md enthaelt die Zeile NICHT
      s.lastGate = { green: false, failures: [{ name: 'ein Szenario', message: geleakteZeile }] }
      writeStatus(s)
      const testDir = join(worktreeDir(issue), 'tests')
      mkdirSync(testDir, { recursive: true })
      writeFileSync(join(testDir, 'auth.integration.test.ts'), `${geleakteZeile}\n`)

      expect(() => promptVon(() => buildImplPrompt(issue))).toThrow(/process\.exit/)
      const meldung = meldungen.join('\n')
      expect(meldung).toContain('auth.integration.test.ts')
      expect(meldung).not.toContain('Fundstelle')
    } finally { exitSpy.mockRestore(); errorSpy.mockRestore(); cleanup(issue) }
  })
})

// Pfadvergleiche unabhaengig von der Schreibweise (spec.md "harness-path-matching").
//
// Zwei Stellen, an denen ein Pfad seine Form wechselt: er entsteht als Betriebssystempfad und
// wird als Text weiterverwendet - einmal als Git-Pathspec, einmal als Suchmuster im Auftrag.
// Beide sollen etwas VERHINDERN (eine Loeschung, eine Preisgabe); faellt der Vergleich aus,
// faellt es deshalb nicht auf, solange nichts zu verhindern war.
describe('Pfadvergleiche unabhängig von der Schreibweise', () => {
  const CHANGE = 'ein-change'
  const TESTDATEI = 'user-auth.integration.test.ts'

  // Minimale Fixture: ein Worktree mit Change-Ordner und einer echten Testdatei. Die design.md
  // wird je Szenario anders bestueckt - sie ist die Stelle, an der eine Nennung real auftritt.
  function makeLauf(issue: string, design: string) {
    const dir = join(worktreeDir(issue), 'openspec', 'changes', CHANGE)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'proposal.md'), 'Warum dieser Change existiert.')
    writeFileSync(join(dir, 'design.md'), design)
    const testDir = join(worktreeDir(issue), 'tests')
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, TESTDATEI), 'const x = 1\n')
    return makeStatus(issue, { change: CHANGE, phase: 'implement' })
  }
  function bauenMitAbfangen(issue: string): { warf: boolean; meldung: string } {
    const meldungen: string[] = []
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit') }) as never)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { meldungen.push(a.map(String).join(' ')) })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    let warf = false
    try { buildImplPrompt(issue) } catch { warf = true } finally {
      exitSpy.mockRestore(); errorSpy.mockRestore(); logSpy.mockRestore()
    }
    return { warf, meldung: meldungen.join('\n') }
  }

  it('Eine Nennung mit Forward-Slashes wird erkannt', () => {
    // Der Harness fuehrt den Pfad intern mit den Trennzeichen des Betriebssystems; die
    // design.md schreibt ihn so, wie ein Mensch ihn schreibt. Beide Laengen zaehlen: der
    // worktree-relative Pfad (so steht er in einer design.md) und der vollstaendige (so steht
    // er in einem Reviewer-Finding, das `ort` aus dem Worktree uebernimmt).
    // Geprueft an einer HILFSDATEI, nicht an einer .test.ts: bei letzterer traegt jeder dieser
    // Texte auch den blossen Dateinamen, und schon der reicht fuer den Treffer - der
    // Forward-Slash-Zweig waere dann nur nebenbei mitgetestet. Fuer eine Hilfsdatei zaehlt der
    // Name gerade NICHT, hier haengt der Treffer also wirklich an der Pfadform.
    const HILFSDATEI = 'fixture-daten.json'
    const faelle = [
      () => `tests/${HILFSDATEI}`,
      (i: string) => `${worktreeDir(i).replace(/\\/g, '/')}/tests/${HILFSDATEI}`,
      () => `tests\\${HILFSDATEI}`,
    ]
    for (const form of faelle) {
      const issue = freshIssue()
      try {
        makeLauf(issue, `D10 - Der Ablauf ist in ${form(issue)} festgehalten.`)
        writeFileSync(join(worktreeDir(issue), 'tests', HILFSDATEI), '{}')
        const { warf, meldung } = bauenMitAbfangen(issue)
        expect(warf).toBe(true)
        expect(meldung).toContain(HILFSDATEI)
      } finally { cleanup(issue) }
    }
  })

  it('Der bloße Dateiname gilt als Nennung', () => {
    const issue = freshIssue()
    try {
      makeLauf(issue, `D10 - Siehe ${TESTDATEI} fuer den erwarteten Ablauf.`)
      const { warf, meldung } = bauenMitAbfangen(issue)
      expect(warf).toBe(true)
      expect(meldung).toContain(TESTDATEI)
    } finally { cleanup(issue) }
  })

  it('Der Name einer Hilfsdatei zählt nur mit Pfadanteil', () => {
    // Aufgefallen an echtem Material: listTestFiles liefert auch tests/.gitkeep, und ".gitkeep"
    // steht in der proposal.md von add-user-auth ("src/ enthaelt heute nur .gitkeep"). Das
    // Argument fuer den blossen Namen - er sei charakteristisch - gilt nur fuer Dateien, deren
    // Name sie als Test ausweist.
    const ohne = freshIssue()
    try {
      makeLauf(ohne, 'D1 - Das Verzeichnis enthaelt heute nur .gitkeep.')
      writeFileSync(join(worktreeDir(ohne), 'tests', '.gitkeep'), '')
      expect(bauenMitAbfangen(ohne).warf).toBe(false)
    } finally { cleanup(ohne) }

    // Dieselbe Datei MIT Pfadanteil bleibt eine Nennung - die Ausnahme gilt dem Namen, nicht
    // der Datei.
    const mit = freshIssue()
    try {
      makeLauf(mit, 'D1 - Der Platzhalter liegt in tests/.gitkeep.')
      writeFileSync(join(worktreeDir(mit), 'tests', '.gitkeep'), '')
      const { warf, meldung } = bauenMitAbfangen(mit)
      expect(warf).toBe(true)
      // Auch der GRUND, nicht nur der Abbruch: bauenMitAbfangen faengt jede Exception, ein
      // Absturz aus anderem Grund erfuellte `warf` sonst ebenso (Review-Befund Runde 1).
      expect(meldung).toContain('Leak')
      expect(meldung).toContain('.gitkeep')
    } finally { cleanup(mit) }
  })

  it('Ein Name, der auf keine Testdatei des Laufs passt, hält den Lauf nicht an', () => {
    const issue = freshIssue()
    try {
      // Gegenprobe zur Breite des Erkenners: er darf nicht auf jede Zeichenkette anschlagen,
      // die nach einem Testdateinamen aussieht - nur auf Dateien, die es wirklich gibt.
      makeLauf(issue, 'D10 - Vorbild ist tests/gibt-es-nicht.unit.test.ts aus einem anderen Repo.')
      const { warf } = bauenMitAbfangen(issue)
      expect(warf).toBe(false)
    } finally { cleanup(issue) }
  })

  it('Auch die Rückfallform nach vollständigem Kürzen wird geprüft', () => {
    const issue = freshIssue()
    try {
      makeLauf(issue, 'D10 - keine Nennung hier.')
      // MIT Pfadanteil und in der ERSTEN Zeile: truncateAtTestReference schneidet damit bei
      // Zeile 0 ab und laesst nichts uebrig. Wer nur den gekuerzten Text prueft, prueft den
      // leeren String - und reicht anschliessend ueber den Rueckfall genau die Zeile durch,
      // die er verhindern sollte.
      const message = `Cannot find module './fehlt' from 'tests/${TESTDATEI}'`
      writeFileSync(join(runDir(issue), 'jest.json'), JSON.stringify({
        testResults: [{ assertionResults: [{ status: 'failed', title: 'ein Szenario', failureMessages: [message] }] }],
      }))
      const failures = parseJestFailures(issue)
      expect(failures).toHaveLength(1)
      expect(failures[0].message).not.toContain(TESTDATEI)
    } finally { cleanup(issue) }
  })

  it('Eine Gate-Ausgabe, die eine Testdatei beim Namen nennt, wird degradiert', () => {
    const issue = freshIssue()
    try {
      makeLauf(issue, 'D10 - keine Nennung hier.')
      // Ohne Verzeichnisanteil: truncateAtTestReference schneidet nur an tests/ bzw. tests\ ab
      // und laesst diese Form stehen - erst der Erkenner faengt sie.
      const message = `Cannot find module './fehlt' from '${TESTDATEI}'\nweitere Zeile zur Laenge`
      writeFileSync(join(runDir(issue), 'jest.json'), JSON.stringify({
        testResults: [{ assertionResults: [{ status: 'failed', title: 'ein Szenario', failureMessages: [message] }] }],
      }))
      const failures = parseJestFailures(issue)
      expect(failures).toHaveLength(1)
      expect(failures[0].message).not.toContain(TESTDATEI)
      expect(readFileSync(join(runDir(issue), 'leak-degradations.log'), 'utf8')).toContain('ein Szenario')
    } finally { cleanup(issue) }
  })

  it('Ein Szenarioname, der eine Testdatei nennt, hält den Lauf nicht an', () => {
    const issue = freshIssue()
    try {
      makeLauf(issue, 'D10 - keine Nennung hier.')
      // Der Name geht als "## <name>" in den Auftrag, genau wie die Ausgabe. Bliebe er
      // ungeprueft, traefe ihn erst assertNoTestLeak - und das beendet den ganzen Lauf, statt
      // diesen einen Failure zu degradieren (§8.2 G3).
      writeFileSync(join(runDir(issue), 'jest.json'), JSON.stringify({
        testResults: [{ assertionResults: [{ status: 'failed', title: `Szenario aus ${TESTDATEI}`, failureMessages: ['harmlose Meldung ohne jede Nennung'] }] }],
      }))
      const failures = parseJestFailures(issue)
      expect(failures).toHaveLength(1)
      expect(failures[0].name).not.toContain(TESTDATEI)
      expect(failures[0].message).not.toContain(TESTDATEI)
      expect(readFileSync(join(runDir(issue), 'leak-degradations.log'), 'utf8')).toContain('zurückgehalten')
    } finally { cleanup(issue) }
  })

  it('Getrackte Propose-Originale bleiben erhalten', () => {
    const getrackt: Sh = () => ({ ok: true, out: '' }) // ok = git kennt den Pfad

    // Erstens die Sache selbst: an einem WIRKLICH vorhandenen Verzeichnis, sonst sagt der Test
    // ueber die Loeschverhinderung nichts aus - rmSync mit force:true wirft auf einem nicht
    // existierenden Pfad ebenfalls nicht, und der Test bliebe gruen, wenn die Schutzabfrage
    // entfiele (Review-Befund Runde 2).
    const issue = freshIssue()
    const src = join(runDir(issue), 'propose-original')
    try {
      mkdirSync(src, { recursive: true })
      writeFileSync(join(src, 'proposal.md'), 'x')
      removeUntrackedSourceDocs(src, getrackt)
      expect(existsSync(src)).toBe(true)
    } finally { cleanup(issue) }

    // Zweitens die Form der Pfadspezifikation - hier mit einem LITERALEN Backslash-Pfad, denn
    // auf einem Nicht-Windows-Laeufer lieferte join() ohnehin Forward-Slashes und der Defekt
    // aus #21 waere dort nicht nachstellbar. Im getrackten Zweig folgt kein
    // Dateisystemzugriff, das Verzeichnis muss also nicht existieren.
    const kommandos: string[] = []
    removeUntrackedSourceDocs('openspec\\changes\\__pfadtest__', cmd => {
      kommandos.push(cmd); return getrackt(cmd)
    })
    const lsFiles = kommandos.find(c => c.includes('ls-files'))
    // Ohne Forward-Slashes antwortet git immer "kein Treffer" - die Abfrage waere keine mehr.
    expect(lsFiles).toContain('openspec/changes/__pfadtest__')
    expect(lsFiles).not.toContain('\\')
  })

  it('Untrackte Propose-Originale werden aufgeräumt', () => {
    // Hier muss es das Verzeichnis wirklich geben - geprueft wird ja die Loeschung. Es liegt
    // im Run-Verzeichnis statt unter openspec/changes/, damit ein Abbruch vor dem finally
    // kein Rauschen in git status hinterlaesst.
    const issue = freshIssue()
    const src = join(runDir(issue), 'propose-original')
    try {
      mkdirSync(src, { recursive: true })
      writeFileSync(join(src, 'proposal.md'), 'x')
      const run: Sh = () => ({ ok: false, out: 'did not match any file(s) known to git' })
      removeUntrackedSourceDocs(src, run)
      expect(existsSync(src)).toBe(false)
    } finally { cleanup(issue) }
  })
})
