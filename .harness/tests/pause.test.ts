// Tests zum Change add-harness-pause (Issue #23), Capability harness-role-marker.
// Ein Test je GIVEN/WHEN/THEN-Szenario, Testname = Szenarioname (constitution.md §4.1).
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  readStatus, writeStatus, next, pause, resume, gate, confirmRed, confirmTestRework,
  confirmAppReview, recordReview, recordRoundSummary, runDir, worktreeDir,
  cleanup as cleanupRun, ROLE_FOR_PHASE,
} from '../orchestrator.js'
import type { Status, Role, Sh } from '../orchestrator.js'
import { makeDeps } from '../guard.js'

let counter = 0
function freshIssue(): string {
  counter += 1
  return `__pause_test_${counter}__`
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
    cleanup(issue)
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
    cleanup(issue)
  })

  it('Ein pausierter Lauf beansprucht keine Rolle mehr', () => {
    const issue = freshIssue()
    // Vollstaendiger Lauf inkl. Worktree, damit er im Fallback des Guards als aktiv gilt und
    // die Rollenfreigabe die einzige wirksame Aenderung ist.
    makeStatus(issue, { phase: 'implement' })
    mkdirSync(worktreeDir(issue), { recursive: true })
    writeMarker(issue, 'implementer')
    const deps = makeDeps(join('.harness', 'runs'), join('.harness', 'wt'))
    expect(deps.readRole(undefined)).toBe('implementer')

    silenced(() => pause(issue, 'Umgebungsfehler'))

    expect(deps.readRole(undefined)).toBe('')
    cleanup(issue)
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
    cleanup(issue)
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
    cleanup(issue)
  })

  it('Die wiederhergestellte Rolle stimmt in jeder Phase mit dem Automaten überein', () => {
    // Drift-Sicherung zu design.md D3: ROLE_FOR_PHASE ist eine zweite Stelle, die dieselbe
    // Zuordnung trifft wie next(). Kommt eine Phase hinzu oder aendert sich eine Zuordnung,
    // faellt dieser Test um.
    const phasen = Object.keys(ROLE_FOR_PHASE) as Status['phase'][]
    expect(phasen.length).toBeGreaterThan(0)

    for (const phase of phasen) {
      const issueAutomat = freshIssue()
      makeStatus(issueAutomat, { phase })
      silenced(() => next(issueAutomat))
      const rolleLautAutomat = readMarker(issueAutomat)

      const issuePause = freshIssue()
      makeStatus(issuePause, { phase })
      silenced(() => pause(issuePause, 'Eingriff'))
      silenced(() => resume(issuePause))

      // Phase mit in die Erwartung: eine Abweichung soll sagen, WELCHE Phase gedriftet ist.
      expect([phase, readMarker(issuePause)]).toEqual([phase, rolleLautAutomat])
      cleanup(issueAutomat)
      cleanup(issuePause)
    }
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
    cleanup(issue)
  })
})

describe('Eine Runde, die nur die Umgebung gemessen hat, darf zurückgegeben werden', () => {
  it('Die Rückgabe zählt genau eine Runde zurück', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 2 })
    silenced(() => pause(issue, 'Zwei Gate-Läufe maßen eine kaputte Umgebung'))

    silenced(() => resume(issue, { rundeZurueck: true }))

    const s = readStatus(issue)
    expect(s.round).toBe(1)
    expect(s.phase).toBe('implement')
    expect(s.rundenRueckgaben).toEqual([
      expect.objectContaining({
        grund: 'Zwei Gate-Läufe maßen eine kaputte Umgebung',
        von: 2,
        auf: 1,
        zeitpunkt: expect.any(String),
      }),
    ])
    cleanup(issue)
  })

  it('Fortsetzen ohne Anforderung lässt den Zähler unangetastet', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 2 })
    silenced(() => pause(issue, 'Eingriff'))

    silenced(() => resume(issue))

    const s = readStatus(issue)
    expect(s.round).toBe(2)
    expect(s.rundenRueckgaben ?? []).toEqual([])
    cleanup(issue)
  })

  it('Bei Rundenzähler null wird die Rückgabe abgelehnt', () => {
    const issue = freshIssue()
    makeStatus(issue, { phase: 'implement', round: 0 })
    silenced(() => pause(issue, 'Eingriff'))

    const meldung = captureFail(() => resume(issue, { rundeZurueck: true }))

    const s = readStatus(issue)
    expect(meldung).toMatch(/Runde/i)
    expect(s.round).toBe(0)
    expect(s.paused?.grund).toBe('Eingriff')
    expect(readMarker(issue)).toBe('none')
    expect(s.rundenRueckgaben ?? []).toEqual([])
    cleanup(issue)
  })
})
