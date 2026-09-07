#!/usr/bin/env tsx
// PreToolUse-Guard (Port von guard.sh, design.md D6/D7). Liest das Tool-JSON von stdin,
// den active-role-Marker pro Issue vom Skript. Fail-closed: jede unbehandelte Exception
// blockt statt durchzulassen (Gegenteil des bash-Crash-Verhaltens - dort war ein Absturz
// gleichbedeutend mit "kein exit 2", also fail-open).
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'

export type GuardResult = { blocked: boolean; message?: string }
export type Deps = { readRole: (issue: string | undefined) => string }

// --- Projektspezifische Konfiguration -------------------------------------------------------
// Schreibbereich des implementers. Ein Projekt mit weiteren Quellbereichen (Schema-,
// Migrations-, Codegen-Verzeichnisse) traegt sie hier nach - der Guard ist die einzige
// Stelle, die diese Grenze durchsetzt.
const SRC_DIRS = ['src', 'prisma']
// Kommandos, die eine Migration/Schemaaenderung gegen eine echte Datenbank ausfuehren
// (constitution.md 6.1). Stack-abhaengig: hier die Kommandos des eigenen ORM eintragen.
// Bewusst inklusive der lokalen Entwicklungs-Varianten (migrate dev/reset) - auch sie
// schreiben gegen das, was in DATABASE_URL steht.
const MIGRATION_COMMANDS = /prisma\s+(migrate\s+(deploy|dev|reset)|db\s+push)/
// Hostnamen/Muster, die eine ephemere Wegwerf-DB kennzeichnen. Alles andere gilt als
// produktiv und wird geblockt (fail-closed: ein leeres DATABASE_URL matcht nichts).
const EPHEMERAL_DB = /localhost|127\.0\.0\.1|-test/
// Kommandos, die die Testsuite ausfuehren. Fuer den implementer tabu: Jest & Co. geben bei
// Matcher-Fehlern Codeframes aus den Testdateien aus und umgehen damit die Pfadsperre aus
// (1) vollstaendig (constitution.md 2.2). Das Gate ruft die Suite als Subprozess des
// Orchestrators auf, nicht als Session-Tool-Call - es ist von dieser Sperre nicht betroffen.
const TEST_RUNNER_COMMANDS = /\b(jest|vitest|mocha|ava)\b|\b(pnpm|npm|yarn|npx)\s+(run\s+)?test\b/
// ---------------------------------------------------------------------------------------------

const norm = (p: string): string => p.replace(/\\/g, '/')
// Der Verzeichnisname matcht auch ohne nachfolgenden Pfad ("(/|$)"): Grep/Glob bekommen ein
// Verzeichnis als Suchwurzel uebergeben ("path": "src"), nicht nur Dateipfade.
export const isTest = (p: string): boolean => { const n = norm(p); return /(^|\/)tests(\/|$)/.test(n) || /\.test\.tsx?$/.test(n) }
export const isSrc = (p: string): boolean => { const n = norm(p); return SRC_DIRS.some(d => new RegExp(`(^|/)${d}(/|$)`).test(n)) }

// D7: das Issue wird aus dem Worktree-Pfad des Tool-Calls ermittelt (.harness/wt/<issue>/...).
// Tool-Calls ausserhalb eines Worktrees (Orchestrator-Arbeit im Hauptrepo) liefern kein Issue
// und sind damit rollenlos - keine Einschraenkung.
export function issueFromPath(p: string): string | undefined {
  return norm(p).match(/(?:^|\/)\.harness\/wt\/([^/]+)\//)?.[1]
}
// Kein zwingender Trailing-Slash nach der Issue-Nummer: "cd .harness/wt/34 && cat tests/x.ts"
// (Issue-Segment gefolgt von Leerzeichen/&&/Zeilenende) muss ebenso matchen wie
// ".harness/wt/34/tests/x.ts" - sonst bleibt das Issue unerkannt und die Rolle faellt auf
// "rollenlos" zurueck, obwohl das Kommando faktisch im Worktree dieses Issues operiert.
export function issueFromCommand(cmd: string): string | undefined {
  return norm(cmd).match(/\.harness\/wt\/([^/\s'";&|)]+)/)?.[1]
}
// Phasen, in denen ein Run keine aktive Rolle mehr beansprucht - fehlt/ist unlesbar das
// status.json (z.B. sehr alter Run ohne dieses Feld), wird konservativ "noch aktiv" angenommen.
const TERMINAL_PHASES = new Set(['done', 'archived', 'escalated'])

// runsDir ist injizierbar (Review-Befund Runde 2: Testisolation) - Tests fuer den Fallback duerfen
// nicht gegen das echte .harness/runs/ pruefen, das durch parallele Jest-Worker (andere
// Testdateien) oder liegen gebliebene echte Runs unkontrollierten Zustand enthalten kann.
export function makeDeps(runsDir: string): Deps {
  const activeRolePath = (issue: string) => join(runsDir, issue, 'active-role')
  const readRoleForIssue = (issue: string): string => {
    const p = activeRolePath(issue)
    return existsSync(p) ? readFileSync(p, 'utf8').trim() : ''
  }
  // Ein abgebrochener/liegen gelassener Run haelt seinen active-role-Marker fuer immer, da
  // .harness/runs/ nie aufgeraeumt wird. Ohne diesen Filter wuerde ein toter Marker entweder
  // faelschlich als "die eine aktive Rolle" gelten (Fehlblock fuer unbeteiligte Aufrufe) oder,
  // mit einem zweiten toten Marker, den Fallback dauerhaft und unbemerkt auf rollenlos zwingen.
  const isRunActive = (issue: string): boolean => {
    const statusPath = join(runsDir, issue, 'status.json')
    if (!existsSync(statusPath)) return true
    try {
      const phase = JSON.parse(readFileSync(statusPath, 'utf8')).phase
      return !TERMINAL_PHASES.has(phase)
    } catch {
      return true
    }
  }
  // Fallback, wenn sich kein Issue aus Pfad/Kommando ableiten laesst (z.B. relative Pfade bei
  // cwd=Worktree, oder eine Bash-Referenz ohne .harness/wt/<issue>/-Praefix): guard.sh kannte nur
  // EINEN globalen Marker und wandte ihn auf jeden Aufruf an. Solange nur ein Issue gleichzeitig
  // laeuft (aktueller Stand, siehe proposal.md Non-Goals), stellt "die eine aktive Rolle" exakt
  // das alte, sicherere Verhalten wieder her, statt bei Nichterkennung fail-open auf "" zurueck-
  // zufallen. Sind mehrere Issues gleichzeitig aktiv, bleibt der Aufruf bewusst rollenlos (keine
  // Rolle ist dann eindeutig zustaendig) statt eine falsche zu raten.
  const soleActiveRole = (): string => {
    if (!existsSync(runsDir)) return ''
    const active = readdirSync(runsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && isRunActive(d.name))
      .map(d => readRoleForIssue(d.name))
      .filter(r => r !== '' && r !== 'none')
    return new Set(active).size === 1 ? active[0] : ''
  }
  return { readRole: (issue) => (issue ? readRoleForIssue(issue) : soleActiveRole()) }
}
// Bekannte, akzeptierte Grenze (Review-Hinweis): '.harness/runs' ist relativ zu process.cwd(),
// nicht zum Skript-Standort. Claude Code fuehrt PreToolUse-Hooks mit cwd = Projekt-Root aus
// (settings.json registriert den Hook projektbezogen) - das ist der einzige produktive
// Aufrufkontext. Eine argv[1]-basierte Herleitung des Wurzelverzeichnisses waere unter
// tsx (CLI) vs. ts-jest (Modul-Import in Tests) uneinheitlich und wuerde neue, schwerer zu
// durchschauende Fehlerquellen schaffen, ohne einen realen Aufrufpfad abzudecken.
export const defaultDeps: Deps = makeDeps(join('.harness', 'runs'))

function extractWriteTargets(cmd: string): string[] {
  const targets = new Set<string>()
  for (const m of cmd.matchAll(/>{1,2}\s*([^\s|;&<>]+)/g)) targets.add(m[1])
  for (const m of cmd.matchAll(/\btee\b\s+(?:-a\s+)?([^\s|;&<>]+)/g)) targets.add(m[1])
  for (const m of cmd.matchAll(/\b(?:cp|mv)\b\s+([^|;&]+)/g)) {
    const parts = m[1].trim().split(/\s+/)
    if (parts.length > 0) targets.add(parts[parts.length - 1])
  }
  return [...targets].filter(t => t !== '/dev/null')
}
function extractTestReferences(cmd: string): string[] {
  const tokens = cmd.replace(/([|;&><])/g, ' $1 ').split(/\s+/).filter(Boolean)
  return tokens.filter(t => isTest(t))
}

// Kern-Regelwerk: Pfadrollen, Suchwerkzeuge, Bash-Zielerkennung ueber >, >>, tee, cp, mv,
// Testdatei-Referenzen, Testsuite-Ausfuehrung, Steuerdatei-Tabu, Migrationssperre.
function decide(input: Record<string, unknown>, deps: Deps): GuardResult {
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>
  const path = String(toolInput.file_path ?? '')
  const cmd = String(toolInput.command ?? '')
  const tool = String(input.tool_name ?? '')
  // Grep/Glob adressieren nicht ueber file_path, sondern ueber eine Suchwurzel (path) und ein
  // Muster (pattern; bei Grep zusaetzlich glob als Dateifilter).
  const searchPath = String(toolInput.path ?? '')
  const searchPattern = String(toolInput.pattern ?? '')
  const searchGlob = String(toolInput.glob ?? '')
  // issueFromCommand statt issueFromPath fuer die Suchwurzel: sie zeigt oft auf das
  // Worktree-Verzeichnis selbst (".harness/wt/34"), ohne nachfolgenden Pfad.
  const issue = (path && issueFromPath(path)) || (cmd && issueFromCommand(cmd)) || (searchPath && issueFromCommand(searchPath))
  const role = deps.readRole(issue)

  // 1) Write/Edit/Read ueber file_path.
  if (path) {
    const isWrite = /Write|Edit/.test(tool)
    if (role === 'implementer') {
      if (isTest(path)) return { blocked: true, message: 'Blockiert: implementer darf Testdateien nicht lesen/ändern.' }
      if (isWrite && !isSrc(path)) return { blocked: true, message: 'Blockiert: implementer schreibt nur in src/ oder prisma/.' }
    } else if (role === 'test-author') {
      if (isWrite && !isTest(path)) return { blocked: true, message: 'Blockiert: test-author schreibt nur in tests/.' }
    }
  }

  // 2) Grep/Glob als Umgehung von 1): eine Inhaltssuche liefert Testquellcode, ohne je ein
  //    file_path-Feld zu setzen - Regel 1 greift dort nicht. Fuer den implementer gilt daher
  //    Whitelisting statt Blacklisting: die Suchwurzel MUSS ein Quellpfad sein. Eine Suche ohne
  //    "path" laeuft ueber das gesamte Worktree und schliesst tests/ mit ein; sie zu erlauben
  //    hiesse, die Sperre an der breitesten Stelle offen zu lassen (fail-closed, siehe 2.2).
  //    Der test-author darf uneingeschraenkt lesen - fuer ihn ist tests/ der eigene Bereich.
  if ((tool === 'Grep' || tool === 'Glob') && role === 'implementer') {
    // Bei Glob ist "pattern" der Pfad-Glob, bei Grep der Regex-Suchbegriff (dort filtert "glob").
    const pathLike = [searchGlob, tool === 'Glob' ? searchPattern : ''].filter(Boolean)
    if (isTest(searchPath) || pathLike.some(isTest))
      return { blocked: true, message: 'Blockiert: implementer darf Testdateien nicht lesen/ändern (Suchziel).' }
    if (!isSrc(searchPath))
      return { blocked: true, message: `Blockiert: implementer sucht nur innerhalb der Quellpfade (${SRC_DIRS.join(', ')}) — eine Suche ohne einschränkenden Pfad würde tests/ einschließen.` }
  }

  // 3) Bash als Umgehung von 1): best-effort Erkennung von Schreibzielen (>, >>, tee, cp, mv)
  //    und Testdatei-Referenzen in der Kommandozeile. Kein vollstaendiger Schutz gegen
  //    absichtliche Umgehung (z.B. ueber node/python-Dateizugriffe) - schliesst aber den
  //    beobachteten Vorfall (`cat > src/...` als Reaktion auf ein geblocktes Write) und die
  //    naheliegenden Varianten (tee/cp/mv, Testdatei-Reads via cat/sed/grep).
  if (tool === 'Bash' && cmd && (role === 'implementer' || role === 'test-author')) {
    // Die Rollen-Markerdatei darf von einer aktiven Rolle weder umgeschrieben noch
    // entfernt/geleert werden (rm, sed -i, truncate, chmod, ...) - sonst faellt der
    // Guard fuer alle Folgeaufrufe Fail-Open statt Fail-Closed zurueck.
    if (/\.harness\/(runs\/[^/\s'"]+\/active-role|guard\.ts)\b/.test(norm(cmd)))
      return { blocked: true, message: 'Blockiert: die Harness-Steuerdateien sind für diese Rolle tabu.' }

    for (const t of extractWriteTargets(cmd)) {
      if (role === 'implementer') {
        if (isTest(t)) return { blocked: true, message: `Blockiert: implementer darf Testdateien nicht lesen/ändern (Bash-Ziel: ${t}).` }
        if (!isSrc(t)) return { blocked: true, message: `Blockiert: implementer schreibt nur in src/ oder prisma/ (Bash-Ziel: ${t}).` }
      } else if (role === 'test-author') {
        if (!isTest(t)) return { blocked: true, message: `Blockiert: test-author schreibt nur in tests/ (Bash-Ziel: ${t}).` }
      }
    }

    if (role === 'implementer') {
      for (const ref of extractTestReferences(cmd))
        return { blocked: true, message: `Blockiert: implementer darf Testdateien nicht lesen/ändern (Bash-Referenz: ${ref}).` }
      // Der breiteste Leak-Pfad: `pnpm test` referenziert keine einzige Testdatei und passiert
      // die Referenzpruefung oben, liefert aber die volle Jest-Ausgabe inklusive Codeframes
      // aus den Testdateien zurueck - genau das, was truncateAtTestReference() im Orchestrator
      // aus dem Gate-Feedback herausschneidet.
      if (TEST_RUNNER_COMMANDS.test(cmd))
        return { blocked: true, message: 'Blockiert: implementer führt die Testsuite nicht selbst aus — ihre Ausgabe enthält Testquellcode. Das Gate läuft über den Orchestrator (`pnpm harness gate`).' }
    }
  }

  if (MIGRATION_COMMANDS.test(cmd)) {
    const dbUrl = process.env.DATABASE_URL ?? ''
    if (!EPHEMERAL_DB.test(dbUrl))
      return { blocked: true, message: 'Blockiert: Migration nur gegen die ephemere Test-DB, nie gegen eine produktive Zielumgebung.' }
  }

  return { blocked: false }
}

export function evaluate(input: Record<string, unknown>, deps: Deps = defaultDeps): GuardResult {
  try {
    return decide(input, deps)
  } catch (e) {
    return { blocked: true, message: `Blockiert: guard.ts-Fehler (fail-closed): ${(e as Error).message}` }
  }
}

// Kein import.meta.url-Vergleich: guard.ts wird produktiv per tsx (ESM) ausgefuehrt, aber von
// ts-jest fuer Tests nach CommonJS transpiliert (siehe .harness/jest.config.cjs) - import.meta
// ist unter dem commonjs-Modul-Target ein Parse-Fehler, unabhaengig davon, ob der Zweig je
// ausgefuehrt wuerde. resolvePath normalisiert relative/absolute Formunterschiede von argv[1];
// eine falsch-negative Erkennung wuerde den CLI-Zweig NICHT ausfuehren und den Prozess mit
// Exit 0 enden lassen, ohne je zu pruefen (fail-open) - daher bewusst eine simple, robuste
// Pruefung statt einer filigranen, die unter einem Modul-Target bricht.
const invokedPath = process.argv[1] !== undefined ? resolvePath(process.argv[1]) : undefined
const isMain = invokedPath !== undefined && /guard\.ts$/.test(norm(invokedPath))
if (isMain) {
  // Fail-closed gilt fuer den GESAMTEN Prozess-Einstieg, nicht nur fuer evaluate(): ein
  // kaputtes/abgeschnittenes Hook-JSON oder ein stdin-Lesefehler wuerde sonst eine
  // unbehandelte Exception werfen, der Prozess mit Exit 1 enden - und Exit 1 ist fuer den
  // PreToolUse-Hook KEIN Block (nur Exit 2 blockt), der Tool-Call liefe durch.
  try {
    const raw = readFileSync(0, 'utf8')
    const input = raw.trim() ? JSON.parse(raw) : {}
    const result = evaluate(input)
    if (result.blocked) {
      process.stderr.write(`${result.message}\n`)
      process.exit(2)
    }
    process.exit(0)
  } catch (e) {
    process.stderr.write(`Blockiert: guard.ts-Fehler am Prozesseinstieg (fail-closed): ${(e as Error).message}\n`)
    process.exit(2)
  }
}
