import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { BOARD, setBoardStatus } from '../board.js'
import type { GhRunner } from '../board.js'

const ISSUE = '4242' // numerisch, aber ohne Entsprechung auf dem echten Board
const logPath = (issue: string) => join('.harness', 'runs', issue, 'board.log')
const readLog = (issue: string) => (existsSync(logPath(issue)) ? readFileSync(logPath(issue), 'utf8') : '')

type Call = string[]
const queryOf = (args: Call) => args.find(a => a.startsWith('query='))?.slice('query='.length) ?? ''
const isMutation = (args: Call) => /\bmutation\b/.test(queryOf(args))

const ITEM_RESPONSE = (projectId = BOARD.projectId) =>
  JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [{ id: 'PVTI_test', project: { id: projectId } }] } } } } })
const MUTATION_RESPONSE = JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } } } })

// Nimmt Argumentlisten entgegen, startet aber nie gh (design.md D1: der Ausfuehrungskanal ist
// injizierbar, damit die Grenze des Schreibzugriffs pruefbar ist statt nur behauptet).
function recordingRunner(responses: (args: Call) => { ok: boolean; out: string }) {
  const calls: Call[] = []
  const run: GhRunner = args => {
    calls.push(args)
    return responses(args)
  }
  return { run, calls }
}

describe('Board-Status', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    // setup.ts schaltet das Board fuer die gesamte Suite ab; diese Datei prueft genau das
    // abgeschaltete Verhalten und nimmt den Schalter deshalb fuer ihre Dauer zurueck.
    delete process.env.HARNESS_BOARD
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    rmSync(join('.harness', 'runs', ISSUE), { recursive: true, force: true })
  })
  afterEach(() => {
    process.env.HARNESS_BOARD = 'off'
    errorSpy.mockRestore()
    rmSync(join('.harness', 'runs', ISSUE), { recursive: true, force: true })
  })

  it('Ein Statuswechsel schreibt nur das Statusfeld', () => {
    const { run, calls } = recordingRunner(args => ({ ok: true, out: isMutation(args) ? MUTATION_RESPONSE : ITEM_RESPONSE() }))

    const result = setBoardStatus(ISSUE, 'gate-review', run)

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2) // Aufloesung des Item-Handles, dann genau ein schreibender Aufruf
    const writes = calls.filter(isMutation)
    expect(writes).toHaveLength(1)
    const mutation = queryOf(writes[0])
    expect(mutation).toContain('updateProjectV2ItemFieldValue')
    expect(mutation).toContain('singleSelectOptionId')
    // Projekt und Feld stammen aus den Konstanten des Moduls, die Option aus der Statustabelle -
    // kein Wert davon aus einem Aufrufer-Argument.
    expect(writes[0]).toContain(`project=${BOARD.projectId}`)
    expect(writes[0]).toContain(`field=${BOARD.statusFieldId}`)
    expect(writes[0]).toContain(`option=${BOARD.options['gate-review']}`)
    expect(writes[0]).toContain('item=PVTI_test')
    // Keine Item-Erzeugung, kein zweites Feld, kein anderes Projekt.
    const alleAufrufe = calls.map(queryOf).join('\n')
    expect(alleAufrufe).not.toMatch(/addProjectV2ItemById|createProjectV2|deleteProjectV2Item/)
  })

  it('Ein unbekanntes Statuswort führt zu keinem Schreibzugriff', () => {
    const { run, calls } = recordingRunner(() => ({ ok: true, out: '{}' }))

    const result = setBoardStatus(ISSUE, 'fast-fertig', run)

    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalled()
    expect(readLog(ISSUE)).toContain('fast-fertig')
  })

  it('Ein fehlgeschlagener Zugriff wird gemeldet und protokolliert', () => {
    const { run } = recordingRunner(() => ({ ok: false, out: 'gh: authentication token expired' }))

    const result = setBoardStatus(ISSUE, 'implementierung', run) // wirft nicht

    expect(result.ok).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[board]'))
    const log = readLog(ISSUE)
    expect(log).toContain('implementierung')
    expect(log).toMatch(/\d{4}-\d{2}-\d{2}T/) // Zeitstempel
  })

  it('Ein fehlendes Item wird gemeldet, ohne Schreibversuch', () => {
    // Das Issue liegt auf einem anderen Board, aber nicht auf diesem - der Knoten passt nicht.
    const { run, calls } = recordingRunner(() => ({ ok: true, out: ITEM_RESPONSE('PVT_einAnderesProjekt') }))

    const result = setBoardStatus(ISSUE, 'spec', run)

    expect(result.ok).toBe(false)
    expect(calls.filter(isMutation)).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalled()
    expect(readLog(ISSUE)).toContain('spec')
  })
})
