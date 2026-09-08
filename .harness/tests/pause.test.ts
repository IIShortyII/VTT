// Tests zum Change add-harness-pause (Issue #23), Capability harness-role-marker.
// Ein Test je GIVEN/WHEN/THEN-Szenario, Testname = Szenarioname (constitution.md §4.1).
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, cpSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  readStatus, writeStatus, next, pause, resume, start, gate, confirmRed, confirmTestRework,
  confirmAppReview, recordReview, recordRoundSummary, runDir, worktreeDir,
  cleanup as cleanupRun, ROLE_FOR_PHASE,
} from '../orchestrator.js'
import type { Status, Role, Sh } from '../orchestrator.js'
import { makeDeps, evaluate } from '../guard.js'

const write = (file_path: string) => ({ tool_name: 'Write', tool_input: { file_path } })
// Spiegelt EINEN Lauf in frische tmp-Verzeichnisse und baut den Guard-Fallback darauf. Ohne das
// liefe die Rollenermittlung gegen die echten .harness/runs und .harness/wt, in denen parallel
// andere Laeufe liegen (Review-Befund zur Testisolation).
function gespiegelt(issue: string) {
  const runs = mkdtempSync(join(tmpdir(), 'pause-test-runs-'))
  const wt = mkdtempSync(join(tmpdir(), 'pause-test-wt-'))
  cpSync(runDir(issue), join(runs, issue), { recursive: true })
  if (existsSync(worktreeDir(issue))) mkdirSync(join(wt, issue), { recursive: true })
  return {
    deps: makeDeps(runs, wt),
    aufraeumen: () => { rmSync(runs, { recursive: true, force: true }); rmSync(wt, { recursive: true, force: true }) },
  }
}

let counter = 0
// Aufgeraeumt wird in afterEach, nicht am Ende des Testkoerpers (Review-Befund): die Fixtures
// legen echte Laeufe unter .harness/runs UND .harness/wt an, und das ist seit der
// Lebenszeichen-Pruefung per Definition ein AKTIVER Lauf. Bliebe einer nach einer
// fehlgeschlagenen Assertion liegen, zwaenge er danach jedem Aufruf ohne zuordenbares Issue
// seine Rolle auf - genau die 999001-Pathologie, die dieser Change beseitigt.
const angelegt: string[] = []
function freshIssue(): string {
  counter += 1
  const issue = `__pause_test_${counter}__`
  angelegt.push(issue)
  return issue
}
afterEach(() => {
  while (angelegt.length > 0) cleanup(angelegt.pop()!)
})
function makeStatus(issue: string, overrides: Partial<Status> = {}): Status {
  const status: Status = { issue, branch: `feat/${issue}`, round: 0, phase: 'implement', rounds: [], ...overrides }
  writeStatus(status)
  return status
}
function cleanup(issue: string) {
  rmSync(runDir(issue), { recursive: true, force: true })
  rmSync(worktreeDir(issue), { recursive: true, force: true })
}
const markerPath = (issue: string) => join(runDir(issue), 'active-role')
const boardLogPath = (issue: string) => join(runDir(issue), 'board.log')
const statusRaw = (issue: string) => readFileSync(join(runDir(issue), 'status.json'), 'utf8')
const readMarker = (issue: string) => (existsSync(markerPath(issue)) ? readFileSync(markerPath(issue), 'utf8').trim() : '')
const writeMarker = (issue: string, role: Role) => {
  mkdirSync(runDir(issue), { recursive: true })
  writeFileSync(markerPath(issue), role)
}

// Abbruchpfade laufen wie im uebrigen Orchestrator ueber fail() -> process.exit(1); der Spy
// verwandelt das in eine Exception, damit der Testprozess nicht selbst stirbt. Zurueckgegeben
// wird die Fehlerausgabe, damit ein Test nicht nur den Abbruch, sondern auch dessen Begruendung
// pruefen kann.
function captureFail(fn: () => void): string {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`)
  }) as never)
  const messages: string[] = []
  const errorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { messages.push(args.join(' ')) })
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    expect(fn).toThrow(/process\.exit/)
  } finally {
    exitSpy.mockRestore(); errorSpy.mockRestore(); logSpy.mockRestore()
  }
  return messages.join('\n')
}
function silenced(fn: () => void) {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  try { fn() } finally { logSpy.mockRestore() }
}
// Nimmt den Kill-Switch aus tests/setup.ts fuer die Dauer des Aufrufs zurueck, damit ein
// Board-Zugriff ueberhaupt beobachtbar waere. Ein Netzwerk-Roundtrip entsteht dabei nicht:
// issueNummer() verlangt eine reine Ziffernfolge, die erfundenen Test-Bezeichner fallen davor
// heraus - der Versuch landet aber in board.log und ist damit nachweisbar.
function withBoardBeobachtbar<T>(fn: () => T): T {
  const prev = process.env.HARNESS_BOARD
  delete process.env.HARNESS_BOARD
  try { return fn() } finally { if (prev !== undefined) process.env.HARNESS_BOARD = prev }
}

describe('Ein Lauf lässt sich für einen Eingriff außerhalb der Rollen pausieren', () => {
  it('Pausieren gibt den Rollenmarker frei', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 2 })
    writeMarker(issue, 'implementer')

    silenced(() => pause(issue, 'jest.config.cjs ist kaputt'))

    const s = readStatus(issue)
    expect(readMarker(issue)).toBe('none')
    expect(s.phase).toBe('implement')
    expect(s.round).toBe(2)
    expect(s.paused?.grund).toBe('jest.config.cjs ist kaputt')
    expect(s.paused?.seit).toEqual(expect.any(String))
  })

  it('Pausieren ohne Grund wird abgelehnt', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 2 })
    writeMarker(issue, 'implementer')

    const meldung = captureFail(() => pause(issue, ''))

    const s = readStatus(issue)
    expect(meldung).toMatch(/Grund/i)
    expect(readMarker(issue)).toBe('implementer')
    expect(s.phase).toBe('implement')
    expect(s.round).toBe(2)
    expect(s.paused).toBeUndefined()
  })

  it('Pausieren oder Fortsetzen eines unbekannten Laufs wird sauber abgelehnt', () => {
    // Der Mensch tippt diese Kennung nach der neuen Arbeitsteilung von Hand (design.md D6);
    // ohne Huelle stuerbe readStatus mit rohem ENOENT-Stacktrace samt vollem Pfad ab.
    const issue = freshIssue() // absichtlich kein makeStatus: der Lauf existiert nicht

    expect(captureFail(() => pause(issue, 'Grund'))).toMatch(/Kein Lauf/)
    expect(captureFail(() => resume(issue))).toMatch(/Kein Lauf/)

    expect(existsSync(join(runDir(issue), 'status.json'))).toBe(false)
    expect(existsSync(markerPath(issue))).toBe(false)
  })

  it('Ein pausierter Lauf beansprucht keine Rolle mehr', () => {
    const issue = freshIssue()
    // Vollstaendiger Lauf inkl. Worktree, damit er im Fallback des Guards als aktiv gilt und
    // die Rollenfreigabe die einzige wirksame Aenderung ist.
    makeStatus(issue, { phase: 'implement' })
    mkdirSync(worktreeDir(issue), { recursive: true })
    writeMarker(issue, 'implementer')

    // Gegen eine Spiegelung in tmp pruefen, nicht gegen die echten .harness/runs und
    // .harness/wt (Review-Befund): dort liegen parallel echte Laeufe, und mit einem zweiten
    // aktiven Marker liefert soleActiveRole() '' - der Test waere dann aus dem falschen Grund
    // rot oder gruen. Geprueft wird der Aufruf selbst, nicht der Zwischenwert der Rolle: die
    // Zusicherung lautet "wird nicht wegen einer Rollengrenze geblockt".
    const vorher = gespiegelt(issue)
    try {
      expect(evaluate(write('tests/x.test.ts'), vorher.deps).blocked).toBe(true)
    } finally { vorher.aufraeumen() }

    silenced(() => pause(issue, 'Umgebungsfehler'))

    const nachher = gespiegelt(issue)
    try {
      expect(evaluate(write('tests/x.test.ts'), nachher.deps).blocked).toBe(false)
    } finally { nachher.aufraeumen() }
  })
})

describe('Ein pausierter Lauf steht still', () => {
  it('Der Automat rückt während der Pause nicht vor', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 1 })
    writeMarker(issue, 'implementer')
    silenced(() => pause(issue, 'jest.config.cjs ist kaputt'))

    const zustandVorher = statusRaw(issue)
    // Jeder Unterprozess waehrend der Pause ist ein Fehlschlag: das Gate wuerde Typecheck, Lint
    // und die Testsuite starten, confirmRed die Suite.
    const keinUnterprozess: Sh = () => { throw new Error('Unterprozess während der Pause gestartet') }

    const verben: (() => void)[] = [
      () => start(issue, undefined, keinUnterprozess),
      () => next(issue),
      () => gate(issue, keinUnterprozess),
      () => confirmRed(issue, keinUnterprozess),
      () => confirmTestRework(issue),
      () => confirmAppReview(issue, 'ja'),
      () => recordReview(issue, JSON.stringify({ freigabe_empfehlung: 'ok', findings: [] })),
      () => recordRoundSummary(issue, 'implementer', '{}'),
      () => cleanupRun(issue),
    ]

    for (const aufruf of verben) {
      // Keine Aktion: das Verb bricht ab, statt einen Schritt zu emittieren. Die Meldung nennt
      // den Grund der Pause und den Weg heraus.
      const meldung = withBoardBeobachtbar(() => captureFail(aufruf))
      expect(meldung).toMatch(/jest\.config\.cjs ist kaputt/)
      expect(meldung).toMatch(/resume/)
      expect(readMarker(issue)).toBe('none')
      expect(statusRaw(issue)).toBe(zustandVorher)
      expect(existsSync(boardLogPath(issue))).toBe(false)
    }
  })
})

describe('Ein Lauf ohne Worktree beansprucht keine Rolle', () => {
  it('Ein Lauf entsteht nicht, wenn sein Worktree nicht angelegt werden konnte', () => {
    const issue = freshIssue()
    // Stellvertreter, der jedes Kommando meldet, ohne etwas zu tun: `git worktree add` laeuft
    // ins Leere, der Worktree entsteht nicht.
    const ohneWirkung: Sh = () => ({ ok: true, out: '' })

    const meldung = captureFail(() => start(issue, undefined, ohneWirkung))

    expect(meldung).toMatch(/Worktree/)
    // Weder Marker noch Run-State: sonst bliebe ein Lauf zurueck, den die Rollenermittlung fuer
    // tot haelt - die einzige Richtung, in die die Lebenszeichen-Pruefung fail-open kippt.
    expect(existsSync(markerPath(issue))).toBe(false)
    expect(existsSync(join(runDir(issue), 'status.json'))).toBe(false)
  })
})

describe('Fortsetzen stellt die Rolle des aktuellen Schritts wieder her', () => {
  it('Fortsetzen setzt die Rolle des aktuellen Schritts', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'review', round: 2 })
    writeMarker(issue, 'reviewer')
    silenced(() => pause(issue, 'CI-Konfiguration'))

    silenced(() => resume(issue))

    const s = readStatus(issue)
    expect(readMarker(issue)).toBe('reviewer')
    expect(s.paused).toBeUndefined()
    expect(s.phase).toBe('review')
    expect(s.round).toBe(2)
  })

  it('Die wiederhergestellte Rolle stimmt mit dem Automaten überein', () => {
    // Drift-Sicherung zu design.md D3. Verglichen werden RUN-STATES, nicht bloss Phasen: der
    // Automat entscheidet in 'gate' feiner als die Phase, und genau dort war die Abweichung
    // (nach gruenem Gate bleibt die Phase auf 'gate', waehrend der Reviewer-Schritt laeuft).
    // Ein Test ueber Phasen allein konnte das nicht sehen (Review-Befund).
    const runStates: { name: string; status: Partial<Status> }[] = [
      ...(Object.keys(ROLE_FOR_PHASE) as Status['phase'][]).map(phase => ({ name: phase, status: { phase } })),
      { name: 'gate/grün, nichts offen', status: { phase: 'gate', lastGate: { green: true } } },
      { name: 'gate/grün, Test-Findings offen', status: { phase: 'gate', lastGate: { green: true }, pendingTestFindings: [{ ort: 'tests/x.test.ts' }] } },
      { name: 'gate/rot', status: { phase: 'gate', lastGate: { green: false } } },
      // 'review' verzweigt ebenso am uebrigen Run-State - dieselbe Driftklasse, eine Phase
      // weiter (Review-Befund Runde 2).
      { name: 'review/Ergebnis ok', status: { phase: 'review', lastReview: { recommendation: 'ok' as const, findings: [] } } },
      { name: 'review/Ergebnis nacharbeit', status: { phase: 'review', lastReview: { recommendation: 'nacharbeit' as const, findings: [{ schwere: 'block', ort: 'src/x.ts', problem: 'x' }] } } },
      { name: 'app-review/freigegeben', status: { phase: 'app-review', lastAppReview: { freigegeben: true } } },
      { name: 'app-review/abgelehnt', status: { phase: 'app-review', lastAppReview: { freigegeben: false, feedback: 'x' } } },
    ]

    for (const { name, status } of runStates) {
      const issueAutomat = freshIssue()
      const vorher = makeStatus(issueAutomat, status)
      silenced(() => next(issueAutomat))
      const nachAutomat = readStatus(issueAutomat)
      const rolleLautAutomat = readMarker(issueAutomat)
      // Verlangt der naechste Schritt einen Zustandsuebergang (Nacharbeit-Runde, Test-Nacharbeit),
      // bleibt resume rollenlos: den Uebergang samt Rundenzaehler vollzieht allein der Automat.
      const uebergang = nachAutomat.phase !== vorher.phase || nachAutomat.round !== vorher.round

      const issuePause = freshIssue()
      makeStatus(issuePause, status)
      silenced(() => pause(issuePause, 'Eingriff'))
      silenced(() => resume(issuePause))
      const nachResume = readStatus(issuePause)

      // Name mit in die Erwartung: eine Abweichung soll sagen, WELCHER Run-State gedriftet ist.
      expect([name, readMarker(issuePause)]).toEqual([name, uebergang ? 'none' : rolleLautAutomat])
      expect([name, nachResume.phase, nachResume.round]).toEqual([name, vorher.phase, vorher.round])
      cleanup(issueAutomat)
      cleanup(issuePause)
    }
  })

  it('Fortsetzen bei unbekannter Phase wird abgelehnt, bevor etwas geschrieben ist', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 1 })
    silenced(() => pause(issue, 'Eingriff'))
    // Handkorrektur mit Tippfehler - waehrend der Pause der Regelfall, nicht die Ausnahme.
    const s = readStatus(issue)
    writeStatus({ ...s, phase: 'reviw' as Status['phase'] })
    const zustandVorher = statusRaw(issue)

    const meldung = captureFail(() => resume(issue))

    expect(meldung).toMatch(/Phase/i)
    expect(statusRaw(issue)).toBe(zustandVorher)
    expect(readStatus(issue).paused?.grund).toBe('Eingriff')
    expect(readMarker(issue)).toBe('none')
  })

  it('Fortsetzen eines Laufs, der nicht pausiert ist, wird abgelehnt', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 1 })
    writeMarker(issue, 'implementer')

    const meldung = captureFail(() => resume(issue))

    const s = readStatus(issue)
    expect(meldung).toMatch(/nicht pausiert|kein Pausenzustand/i)
    expect(readMarker(issue)).toBe('implementer')
    expect(s.phase).toBe('implement')
    expect(s.round).toBe(1)
  })
})

describe('Kein Verb senkt den Rundenzähler', () => {
  it('Pausieren und Fortsetzen lassen den Rundenzähler unangetastet', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 2 })

    silenced(() => pause(issue, 'Zwei Gate-Läufe maßen eine kaputte Umgebung'))
    silenced(() => resume(issue))

    expect(readStatus(issue).round).toBe(2)
  })
})
