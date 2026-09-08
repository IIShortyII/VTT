// Prueft die Ebene ueber der Guard-Logik: kommt der Guard ueberhaupt zur Ausfuehrung?
//
// Alle uebrigen Tests importieren evaluate() direkt und pruefen damit die ENTSCHEIDUNG. Ob der
// Hook, der diese Entscheidung einholt, sich starten laesst, prueft keiner von ihnen - guard.test.ts
// startet zwar einen Prozess, aber ueber einen im Test wiederholten Kommandostring. Der kann
// richtig sein, waehrend der registrierte falsch ist; genau das war der Fall (Issue #29).
import { readFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = join(__dirname, '..', '..')

// design.md D3: das Kommando stammt aus settings.json selbst. Eine Kopie hier wuerde denselben
// Fehler wiederholen, den dieser Test aufdecken soll.
//
// Ausgewaehlt wird der Eintrag, der den Guard startet - nicht "der einzige". Ein spaeter
// nachgetragener, voellig harmloser zweiter PreToolUse-Hook (Formatter, Logger) wuerde sonst
// beide Szenarien mit einer Exception umwerfen, die nach einem kaputten Guard aussieht,
// obwohl der Guard unveraendert korrekt ist (Review-Befund). Gestartet wird weiterhin der
// registrierte String unveraendert.
function registeredPreToolUseCommand(): string {
  const settings = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'))
  const commands: string[] = (settings.hooks?.PreToolUse ?? [])
    .flatMap((matcher: { hooks?: { command?: string }[] }) => matcher.hooks ?? [])
    .map((h: { command?: string }) => h.command)
    .filter((c: string | undefined): c is string => typeof c === 'string' && c.includes('guard.ts'))
  if (commands.length !== 1)
    throw new Error(`Erwartet genau einen PreToolUse-Hook auf guard.ts in settings.json, gefunden: ${commands.length}`)
  return commands[0]
}

// design.md D2: die Testsuite laeuft ueber pnpm und hat ./node_modules/.bin im PATH - ein dort
// gestartetes `tsx ...` findet seinen Interpreter und wuerde dem kaputten Hook Wirksamkeit
// bescheinigen. Claude Code startet den Hook NICHT ueber den Paketmanager; diese Eintraege
// muessen deshalb weg. Bewusst kein leerer PATH: dann waere auch `node` selbst unauffindbar und
// der Test schluege aus dem falschen Grund fehl.
function hookEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  // PATH und DATABASE_URL case-insensitiv aussortieren: unter Windows heisst die Variable "Path",
  // und ein aufgespreiztes process.env brächte beide Schreibweisen nebeneinander in die Umgebung.
  for (const [k, v] of Object.entries(process.env))
    if (!/^(path|database_url)$/i.test(k)) env[k] = v
  env.PATH = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(p => !/node_modules[\\/]\.bin/i.test(p))
    .join(delimiter)
  return env
}

function runHook(input: unknown) {
  return spawnSync(registeredPreToolUseCommand(), {
    input: JSON.stringify(input),
    cwd: REPO_ROOT,
    env: hookEnv(),
    shell: true,
    encoding: 'utf8',
  })
}

// Beide Eingaben sind bewusst unabhaengig vom Rollenmarker gewaehlt: der echte Prozess liest
// .harness/runs/, dessen Inhalt sich von Lauf zu Lauf aendert. Ein rollenabhaengiger Fall waere
// hier nicht deterministisch.
// - Blockiert: die Migrationssperre greift fail-closed, wenn DATABASE_URL fehlt (hookEnv entfernt
//   es), unabhaengig von jeder Rolle.
// - Erlaubt: ein Read auf eine Datei, die weder Test- noch Steuerdatei ist, ist fuer JEDE Rolle
//   zulaessig.
const BLOCKED_CALL = { tool_name: 'Bash', tool_input: { command: 'prisma migrate deploy' } }
const ALLOWED_CALL = { tool_name: 'Read', tool_input: { file_path: 'README.md' } }

describe('Der registrierte PreToolUse-Hook blockt ohne projektlokalen PATH', () => {
  // Die Begruendung wird VOR dem Status geprueft, aus zwei Gruenden (Review-Befund):
  // 1. Ein blosses /Blockiert/ wuerde auch der Fail-Closed-Zweig am Prozesseinstieg erfuellen -
  //    ein Guard, der aus einem ganz anderen Grund pauschal alles blockt, machte den Test gruen.
  //    Die Spec verlangt aber die Begruendung DER ABLEHNUNG. Gepinnt wird deshalb die
  //    tatsaechlich getroffene Entscheidung (Migrationssperre).
  // 2. Scheitert der Test, zeigt Jest bei einer Status-Assertion nur "expected 2, received 1".
  //    Die eigentliche Ursache - "command not found", oder Nodes Meldung bei nicht-strippbarer
  //    Syntax in guard.ts - steht auf stderr und waere sonst unsichtbar.
  it('Ein unzulaessiger Aufruf wird geblockt', () => {
    const r = runHook(BLOCKED_CALL)
    expect(r.stderr).toMatch(/Migration nur gegen die ephemere Test-DB/)
    expect(r.status).toBe(2)
  }, 30000)

  it('Ein zulaessiger Aufruf wird durchgelassen', () => {
    const r = runHook(ALLOWED_CALL)
    expect(r.stderr).not.toMatch(/Blockiert/)
    expect(r.status).toBe(0)
  }, 30000)
})
