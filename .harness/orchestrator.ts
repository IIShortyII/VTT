#!/usr/bin/env tsx
// Deterministischer Kern des Feature-Loops. Die Rollen (test-author/implementer/
// reviewer) ruft der Orchestrator (Session) laut SKILL.md; dieses Skript besitzt
// die harten Invarianten und setzt den active-role-Marker als Seiteneffekt.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { setBoardStatus, setBoardStatusIfIssueClosed } from './board.js'
import type { BoardStatus, GhRunner } from './board.js'

export const MAX_ROUNDS = 3 // Leitplanke: eine Runde = ein Nacharbeit-Versuch, unabhaengig von der Rolle (§3.5)
const ROLES: Role[] = ['test-author', 'implementer', 'reviewer', 'none']

export type Role = 'test-author' | 'implementer' | 'reviewer' | 'none'
type Scope = 'impl' | 'test' | 'human'
export type Failure = { name: string; message: string }
export type RoundRecord = {
  round: number; role: Role; summary?: unknown; geänderte_dateien?: string[]
  gateGreen?: boolean; reviewRecommendation?: 'ok' | 'nacharbeit'
}
// Pausenzustand (add-harness-pause/design.md D1): liegt im Run-State, nicht in einer eigenen
// Datei. Der Rollenmarker traegt waehrenddessen `none` - der Guard braucht keine eigene Kenntnis
// der Pause, sie faellt bei ihm in eine bestehende Regel.
export type Pause = { grund: string; seit: string }
export type Status = {
  issue: string; branch: string; round: number; change?: string
  phase: 'red' | 'implement' | 'gate' | 'review' | 'rework-tests' | 'app-review' | 'done' | 'archived' | 'escalated'
  lastGate?: { green: boolean; failures?: Failure[] }
  lastReview?: { recommendation: 'ok' | 'nacharbeit'; findings: unknown[] }
  lastAppReview?: { freigegeben: boolean; feedback?: string }
  rounds?: RoundRecord[]
  pendingTestFindings?: unknown[]
  paused?: Pause
}
// Welche Rolle zu welcher Phase gehoert. Zweite Stelle neben next() (add-harness-pause/design.md
// D3): next() taugt nicht als Quelle, weil es Zustandsuebergaenge als Seiteneffekt hat, die ein
// resume gerade nicht ausloesen darf. Gegen die Drift steht ein Test, der jeden Run-State
// durchgeht und beide Wege vergleicht - nicht die Sorgfalt des naechsten Lesers.
//
// 'none' steht hier fuer beides: Schritte, die keiner Rolle gehoeren (das Gate laeuft als
// Unterprozess des Orchestrators), und Schritte, die einen Zustandsuebergang verlangen. Den
// vollzieht allein next(); resume nimmt ihn weder vorweg noch loest es ihn aus.
export const ROLE_FOR_PHASE: Record<Status['phase'], Role> = {
  red: 'test-author',
  implement: 'implementer',
  'rework-tests': 'test-author',
  gate: 'none',
  review: 'reviewer',
  'app-review': 'none',
  done: 'none',
  archived: 'none',
  escalated: 'none',
}
// Die Phase allein genuegt nicht (Review-Befund): next() verzweigt in 'gate' UND in 'review'
// zusaetzlich am uebrigen Run-State.
//
// Die Leitregel dahinter: verlangt der naechste Schritt einen Zustandsuebergang - eine
// Nacharbeit-Runde mit erhoehtem Zaehler, ein Phasenwechsel -, bleibt resume rollenlos. Den
// Uebergang vollzieht allein next(); resume stellt einen Zustand her, es bewegt ihn nicht.
// Kommt der naechste Schritt ohne Uebergang aus, traegt resume genau die Rolle nach, die next()
// setzen wuerde (§8.3).
//
// Der eine Fall, in dem das ueber die Tabelle hinausgeht, ist kein Randfall, sondern der
// Normalbetrieb: nach einem gruenen Gate emittiert next() 'invoke-reviewer' OHNE Phasenwechsel -
// die Phase bleibt auf 'gate', waehrend der gesamte Reviewer-Schritt laeuft, und der Marker
// steht die ganze Zeit auf 'reviewer'.
export function roleForStatus(s: Status): Role {
  if (s.phase === 'gate') {
    const gruenUndNichtsOffen = s.lastGate?.green === true
      && !(s.pendingTestFindings && s.pendingTestFindings.length > 0)
    return gruenUndNichtsOffen ? 'reviewer' : 'none'
  }
  // Liegt bereits ein Review-Ergebnis vor, geht der naechste Schritt in den App-Test oder in
  // eine Nacharbeit-Runde - beides Uebergaenge. Ohne Ergebnis steht der Reviewer-Schritt an.
  if (s.phase === 'review') return s.lastReview ? 'none' : 'reviewer'
  return ROLE_FOR_PHASE[s.phase]
}

export const runDir = (i: string) => join('.harness', 'runs', i)
const statusPath = (i: string) => join(runDir(i), 'status.json')
// Worktree je Issue: alle Datei-/Prozesszugriffe, die den tatsaechlichen Feature-Code oder die
// OpenSpec-Docs der Änderung betreffen, muessen hier verankert werden - NICHT im process.cwd()
// des Orchestrators, der (Hauptrepo) auf einem beliebigen anderen Branch stehen kann.
export const worktreeDir = (i: string) => join('.harness', 'wt', i)
// Loader-Fallback (Migration Altformat, tasks.md 4.1): rounds fehlt in vor dieser Aenderung
// geschriebenen status.json-Dateien; ohne Default wuerde jeder Zugriff auf s.rounds crashen.
export function readStatus(i: string): Status {
  const s = JSON.parse(readFileSync(statusPath(i), 'utf8')) as Status
  if (!s.rounds) s.rounds = []
  return s
}
export function writeStatus(s: Status) { mkdirSync(runDir(s.issue), { recursive: true }); writeFileSync(statusPath(s.issue), JSON.stringify(s, null, 2)) }
// Ausfuehrungskanal der Verben, die Unterprozesse starten. Als Typ herausgezogen, damit ein
// Test einen Stellvertreter uebergeben kann (set-board-status/design.md D1) - ohne ihn koennte
// kein Test gate() oder confirmRed() aufrufen, ohne pnpm und git wirklich laufen zu lassen.
export type Sh = (cmd: string, cwd?: string) => { ok: boolean; out: string }
const sh: Sh = (cmd, cwd) => { try { return { ok: true, out: execSync(cmd, { encoding: 'utf8', cwd }) } } catch (e: any) { return { ok: false, out: (e.stdout ?? '') + (e.stderr ?? '') } } }
// active-role liegt pro Issue (design.md D7) - eine globale Markerdatei wuerde parallele
// Runs verschiedener Issues gegenseitig die Rolle ueberschreiben lassen.
function setRole(issue: string, role: Role) { mkdirSync(runDir(issue), { recursive: true }); writeFileSync(join(runDir(issue), 'active-role'), role) }
// Zwei der sieben Board-Status haengen an einer emittierten Aktion - und beide werden an je
// ZWEI Stellen emittiert (next() und reworkTo fuer den Implementierungsschritt, zwei Zweige
// von next() fuer den App-Test). Die Tabelle in emit() deckt alle vier ab und kann keine
// uebersehen; emit() ist ohnehin der Trichter jedes Schrittwechsels und setzt hier schon den
// active-role-Marker (set-board-status/design.md D2).
const ACTION_STATUS: Record<string, BoardStatus> = {
  'invoke-implementer': 'implementierung',
  'present-app-review': 'app-test',
}
function emit(issue: string, a: string, role: Role = 'none'): string {
  setRole(issue, role)
  const status = ACTION_STATUS[a]
  if (status) setBoardStatus(issue, status) // Beiwerk: wirft nie, Rueckgabe bewusst ungeprueft
  return JSON.stringify({ action: a })
}
function fail(msg: string): never { console.error(msg); process.exit(1) }
// add-harness-pause/design.md D2: waehrend der Pause bewegt kein Verb den Automaten. Ohne diese
// Sperre wuerde der naechste Schrittwechsel ueber emit() den Rollenmarker neu setzen und die
// Pause stumm beenden - der Eingriff liefe dann unter genau der Rolle, die ihn verbietet. Die
// Sperre sitzt in den Verben, nicht in emit(): emit() ist der Trichter NACH der Entscheidung,
// und eine Sperre dort traefe pause/resume selbst.
function assertNotPaused(s: Status): void {
  if (!s.paused) return
  fail(`Lauf ${s.issue} ist pausiert seit ${s.paused.seit}: ${s.paused.grund}\n`
    + `Erst fortsetzen, dann weiterarbeiten: pnpm harness resume ${s.issue}`)
}

function pushRound(s: Status, rec: Omit<RoundRecord, 'round'>) {
  const rounds = s.rounds ?? []
  rounds.push({ round: s.round, ...rec })
  s.rounds = rounds
}
function updateLastRound(s: Status, patch: Partial<RoundRecord>) {
  const rounds = s.rounds ?? []
  if (rounds.length === 0) rounds.push({ round: s.round, role: 'none' })
  rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], ...patch }
  s.rounds = rounds
}

// --- Die harten Invarianten: der Zustandsautomat ---
export function next(i: string): string {
  const s = readStatus(i)
  assertNotPaused(s)
  switch (s.phase) {
    case 'red':       return emit(i, 'invoke-test-author', 'test-author')
    case 'implement': return emit(i, 'invoke-implementer', 'implementer')
    case 'rework-tests': return emit(i, 'invoke-test-author-rework', 'test-author')
    case 'gate':
      if (!s.lastGate) return emit(i, 'run-gate')
      if (!s.lastGate.green) return reworkImplementer(s)
      // Gemischte Block-Findings aus einer vorherigen Review-Runde: die test-scoped Findings
      // wurden geparkt (design.md D1) und muessen behoben sein, BEVOR der Reviewer erneut
      // laeuft - sonst reviewt Opus zweimal denselben Stand (kein Rundenverbrauch, da Teil
      // derselben Nacharbeit-Runde).
      if (s.pendingTestFindings && s.pendingTestFindings.length > 0) {
        s.phase = 'rework-tests'; writeStatus(s)
        return emit(i, 'invoke-test-author-rework', 'test-author')
      }
      return emit(i, 'invoke-reviewer', 'reviewer')
    case 'review':
      // Seit dem §3.2-Fix (confirmTestRework routet immer ueber 'gate') im Normalbetrieb
      // unerreicht - defensiver Fallback fuer den Fall, dass status.json von Hand korrigiert
      // wurde (z.B. bei einer Eskalations-Nachbearbeitung durch den Menschen) und lastReview
      // dabei geloescht, phase aber auf 'review' stehen gelassen wurde.
      if (!s.lastReview) return emit(i, 'invoke-reviewer', 'reviewer')
      if (s.lastReview.recommendation === 'ok') { s.phase = 'app-review'; writeStatus(s); return emit(i, 'present-app-review') }
      return reviewRework(s)
    case 'app-review':
      if (!s.lastAppReview) return emit(i, 'present-app-review')
      if (s.lastAppReview.freigegeben) { s.phase = 'done'; writeStatus(s); return next(i) }
      return reworkImplementer(s) // Ablehnung zaehlt als Nacharbeit-Runde (constitution.md §3.4/§3.5)
    case 'done': {
      const chk = checkPreflight(i) // design.md D5: mechanischer Check statt Review-Finding
      if (!chk.ok) return emit(i, 'fix-tasks')
      // Entscheidung fest in status.json verankern (Phase 'archived'), BEVOR archive-and-open-pr
      // ausgefuehrt wird: das Archivieren verschiebt den Change-Ordner, den checkPreflight prueft.
      // Ein erneuter next()-Aufruf danach (SKILL.md verlangt das nach JEDEM Schritt) wuerde sonst
      // "change-dir-missing" liefern und faelschlich wieder fix-tasks emittieren (Review-Befund).
      s.phase = 'archived'; writeStatus(s)
      return emit(i, 'archive-and-open-pr')
    }
    case 'archived': return emit(i, 'archive-and-open-pr') // Endzustand, idempotent - kein erneuter Preflight-Check
    case 'escalated': return emit(i, 'escalate')
  }
}
// Gemeinsamer Rundenzaehler fuer JEDE Nacharbeit, unabhaengig von der Zielrolle
// (constitution.md §3.3-Ergaenzung / spec.md "Eskalationsgarantie bleibt rollenunabhaengig").
export function reworkTo(s: Status, phase: Status['phase'], action: string, role: Role): string {
  if (s.round >= MAX_ROUNDS) { s.phase = 'escalated'; writeStatus(s); escalate(s.issue); return emit(s.issue, 'escalate') }
  s.round += 1; s.phase = phase; writeStatus(s)
  return emit(s.issue, action, role)
}
function reworkImplementer(s: Status): string { return reworkTo(s, 'implement', 'invoke-implementer', 'implementer') }
// design.md D1: Nacharbeit wird an die Rolle geroutet, deren Artefakt fehlerhaft ist.
export function reviewRework(s: Status): string {
  const findings = (s.lastReview!.findings ?? []) as Record<string, unknown>[]
  const blocks = findings.filter(f => f.schwere === 'block')
  const scopes = blocks.map(scopeOfFinding)
  // Nur 'human'-scoped Blocks (CI-Config, openspec-Proposal, ...) -> keine Rolle kann das
  // beheben, sofortige Eskalation ohne Rundenverbrauch.
  if (scopes.includes('human')) { s.phase = 'escalated'; writeStatus(s); escalate(s.issue); return emit(s.issue, 'escalate') }
  if (blocks.length > 0 && scopes.every(sc => sc === 'test')) {
    s.pendingTestFindings = blocks
    return reworkTo(s, 'rework-tests', 'invoke-test-author-rework', 'test-author')
  }
  // Gemischte oder rein implementer-scoped Block-Findings -> wie bisher Implementer-Runde;
  // test-scoped Anteile werden fuer spaeter geparkt (siehe 'gate'-Fall in next()).
  const testBlocks = blocks.filter(f => scopeOfFinding(f) === 'test')
  if (testBlocks.length > 0) s.pendingTestFindings = testBlocks
  return reworkTo(s, 'implement', 'invoke-implementer', 'implementer')
}
// design.md D1 verallgemeinert isImplementerScopedFinding zu scopeOfFinding: 'ort' ausserhalb
// von src/prisma/tests gilt als 'human' (z.B. openspec/-Proposal, CI-Config, constitution.md) -
// konservativer Default, der im Zweifel eskaliert statt eine Rolle falsch zu adressieren.
export function scopeOfFinding(f: unknown): Scope {
  const ort = fwd(String((f as Record<string, unknown>).ort ?? ''))
  if (/(^|\/)(src|prisma)\//.test(ort)) return 'impl'
  if (/(^|\/)tests\//.test(ort) || /\.test\.tsx?$/.test(ort)) return 'test'
  return 'human'
}

// --- Verbs ---
export function start(i: string, change?: string, run: Sh = sh) {
  // Auch start bewegt den Automaten (es schreibt den Run-State und ruft next()): auf einem
  // pausierten Lauf wuerde es den Pausenzustand mitsamt Grund ueberschreiben und den Marker neu
  // setzen - der stumme Pausenabbruch, den design.md D2 verhindert.
  if (existsSync(statusPath(i))) assertNotPaused(readStatus(i))
  const branch = `feat/${i}`
  run('git fetch origin main --quiet')
  run(`git worktree add -B ${branch} ${worktreeDir(i)} origin/main`) // Basis immer origin/main, nie der zufaellige HEAD des Hauptrepos
  // Der Worktree ist seit add-harness-pause das Lebenszeichen des Laufs (design.md D5). Schlaegt
  // sein Anlegen fehl, entstuende ein Lauf mit Rollenmarker, den die Rollenermittlung fuer tot
  // haelt - jeder Aufruf ohne ableitbares Issue waere dann rollenlos und damit ungeprueft. Das
  // ist die einzige Richtung, in die der neue Check fail-OPEN kippen kann, und sie entstuende
  // aus einem verschluckten Fehler. Deshalb hier abbrechen, bevor Marker und Run-State entstehen.
  if (!existsSync(worktreeDir(i)))
    fail(`Worktree ${worktreeDir(i)} konnte nicht angelegt werden — kein Lauf ohne Worktree.`)
  if (change) seedChangeDocs(i, change)
  writeStatus({ issue: i, branch, round: 0, phase: 'red', change, rounds: [] })
  console.log(next(i))
}
// Der OpenSpec-Change (proposal/design/tasks/specs) entsteht per openspec-propose noch im
// Hauptrepo, bevor `start` laeuft, und muss vor dem ersten next()-Aufruf (der die Rolle sofort
// auf test-author setzt) in den frischen Worktree gelangen - danach sperrt guard.ts jeden
// Schreibzugriff der Session ausserhalb tests/ (inkl. Reset der active-role-Markerdatei selbst),
// es gibt also keine spaetere Gelegenheit mehr dafuer. Diese Funktion laeuft als Node-Subprozess
// des Orchestrator-Skripts, nicht als eigener Tool-Aufruf der Session, und ist damit von
// guard.ts (das nur PreToolUse-Hooks auf Session-Tool-Aufrufe abfaengt) nicht betroffen.
function seedChangeDocs(i: string, change: string) {
  const src = join('openspec', 'changes', change)
  if (!existsSync(src)) return // z.B. aelterer Run ohne uebergebenen change-Namen
  const dest = join(worktreeDir(i), 'openspec', 'changes', change)
  cpSync(src, dest, { recursive: true })
  sh(`git add openspec/changes/${change}`, worktreeDir(i))
  sh(`git commit -m "docs: OpenSpec-Change ${change} (Issue #${i})" --quiet`, worktreeDir(i))
  removeUntrackedSourceDocs(src)
}
// Die Archivierung passiert im Feature-Worktree/-Branch (constitution.md §3.6), nie im
// Hauptrepo - die Propose-Originale unter openspec/changes/<change>/ im Hauptrepo blieben
// deshalb nach dem Merge als Geister-Ordner liegen (wiederholt beobachtet). Aufraeumen NUR,
// wenn sie im Hauptrepo untracked sind -
// sind sie getrackt (z.B. versehentlich committet), koennte noch etwas darauf verweisen, dann
// nichts loeschen.
export function removeUntrackedSourceDocs(src: string, run: Sh = sh) {
  // Die Pfadspezifikation mit Forward-Slashes (design.md D4). Fuer PATHSPECS - anders als fuer
  // Verzeichnisargumente - sind sie die einzige auf allen Plattformen gueltige Form; mit den
  // Trennzeichen des Betriebssystems antwortet git "did not match any file(s) known to git",
  // und zwar unabhaengig davon, ob die Dateien getrackt sind. Die Abfrage waere damit keine
  // mehr: sie sagte immer "untracked", und geloescht wuerde immer.
  //
  // `src` bleibt nativ, weil er auch an existsSync/rmSync geht - dort ist die native Form die
  // richtige. Ein Pfad, zwei Verwendungen, zwei Schreibweisen; die Umwandlung gehoert an die
  // Stelle, die sie braucht.
  const tracked = run(`git ls-files --error-unmatch -- "${fwd(src)}"`)
  if (tracked.ok) return
  rmSync(src, { recursive: true, force: true })
}
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
export function confirmRed(i: string, run: Sh = sh) {
  const s = readStatus(i)
  assertNotPaused(s)
  const r = run('pnpm test --silent', worktreeDir(i))
  const out = stripAnsi(r.out)
  // TS-Fehler, die aus fehlender Implementierung entstehen (der TDD-Regelfall) zaehlen
  // als gueltiges Rot, nicht als Setup-/Compile-Fehler des Tests selbst. TS2459 ("declares
  // X locally, but it is not exported") ist der typische Fall, wenn ein Test ein Symbol
  // importiert, das erst der implementer noch exportieren muss (siehe design.md-Vorgabe).
  const missingImpl = /error TS2307|error TS2305|error TS2339|error TS2459|Cannot find module|has no exported member|is not exported/.test(out)
  const compileError = !missingImpl && /error TS\d+|SyntaxError/.test(out)
  const red = !r.ok && !compileError
  s.phase = red ? 'implement' : 'red'; writeStatus(s)
  // Nur das BESTAETIGTE Rot schaltet das Board weiter: ein Rot aus dem falschen Grund
  // (Setup-/Compile-Fehler, constitution.md §3.1) ist kein erreichter Schritt.
  if (red) setBoardStatus(i, 'test-rot')
  console.log(JSON.stringify({ red, reason: red ? 'assertion/impl-missing' : compileError ? 'test-compile-error' : 'unexpected-green' }))
}
// design.md D1: Revalidierungspflicht nach jeder test-author-Nacharbeit. Beide Ausgaenge
// laufen durch das REGULAERE Gate (Test + Typecheck + Lint) - nicht nur durch einen isolierten
// Jest-Lauf: Review-Befund, ein direkter Sprung nach 'review' bei gruenen Tests wuerde §3.2
// verletzen (Typecheck/Lint muessen VOR dem Reviewer gruen sein, nicht erst danach zufaellig
// auffallen). Der Unterschied zur Erst-Implementierung ist rein routingseitig: next() im
// 'gate'-Fall geht bei Gruen OHNE pendingTestFindings direkt zu invoke-reviewer (keine
// Implementer-Runde noetig), bei Rot ganz regulaer zu reworkImplementer mit Gate-Feedback.
export function confirmTestRework(i: string) {
  const s = readStatus(i)
  assertNotPaused(s)
  s.pendingTestFindings = undefined
  s.lastReview = undefined
  s.lastGate = undefined
  s.phase = 'gate'
  writeStatus(s)
  console.log(next(i))
}
export function gate(i: string, run: Sh = sh) {
  // Die Pausenpruefung steht VOR dem Board-Zugriff: ein pausierter Lauf darf die Spalte nicht
  // weiterschalten, sonst zeigte das Board einen Schritt an, der gar nicht laeuft.
  const s = readStatus(i)
  assertNotPaused(s)
  // Dann das Board, vor jedem Werkzeugaufruf: die Spalte heisst "Gate + Review" und deckt
  // beides ab. Erst beim Reviewer gesetzt, stuende ein Issue jede Gate-Runde sichtbar auf
  // "Implementierung", obwohl der Implementer laengst fertig ist (set-board-status/design.md D3).
  setBoardStatus(i, 'gate-review')
  const wt = worktreeDir(i)
  const jestOut = join(process.cwd(), runDir(i), 'jest.json') // absolut: Ausgabe landet im Run-State, unabhaengig vom Worktree-cwd
  const tsBuildInfo = join(process.cwd(), runDir(i), 'tsconfig.tsbuildinfo')
  // Alte jest.json aus einer vorherigen Runde nie stehen lassen: schlaegt der Jest-Prozess
  // dieser Runde fehl, ohne selbst eine Datei zu schreiben (Crash, Config-Fehler), wuerden
  // sonst veraltete Failures einer frueheren Runde als aktuelles Gate-Feedback interpretiert.
  if (existsSync(jestOut)) rmSync(jestOut)
  // design.md D4: Runde 0/1 = Volllauf als Referenzlauf; ab Runde 2 (zweite Nacharbeit) zuerst
  // eine `--onlyFailures`-Abkuerzung - bleibt sie rot, spart das den Volllauf von typecheck/lint
  // fuer diese Runde. Gruen wird NUR nach bestaetigtem Volllauf gemeldet (§3.2 bleibt unveraendert).
  if (s.round >= 2) {
    // --passWithNoTests: eine vorherige Runde kann allein an typecheck/lint gescheitert sein,
    // waehrend Jest selbst schon gruen war - --onlyFailures kennt dann keine roten Tests und
    // wuerde ohne dieses Flag faelschlich mit "No failed test found" als Fehlschlag durchgehen.
    const quick = run(`pnpm test --onlyFailures --passWithNoTests --json --outputFile="${jestOut}"`, wt)
    if (!quick.ok) {
      recordGateResult(s, false, parseJestFailures(i))
      console.log(next(i))
      return
    }
  }
  // Kein "--"-Trenner: pnpm reicht nachgestellte Argumente an das Skript durch, ohne dass
  // eine Disambiguierung noetig waere - mit "--" wuerde pnpm den Trenner selbst mit an tsc
  // weiterreichen (tsc bricht dann mit "error TS5023: Unknown compiler option '--'" ab).
  const tc = run(`pnpm typecheck --incremental --tsBuildInfoFile "${tsBuildInfo}"`, wt)
  const lint = run('pnpm lint', wt)
  const test = run(`pnpm test --json --outputFile="${jestOut}"`, wt)
  const green = tc.ok && lint.ok && test.ok
  recordGateResult(s, green, green ? undefined : parseJestFailures(i))
  console.log(next(i))
}
function recordGateResult(s: Status, green: boolean, failures?: Failure[]) {
  s.lastGate = { green, failures }
  updateLastRound(s, { gateGreen: green })
  s.phase = 'gate'; writeStatus(s)
}
const CODEFRAME_LIMIT = 4000
export function parseJestFailures(i: string): Failure[] {
  // Kapselt gegen ein defektes/fehlendes jest.json (Jest-Absturz, Config-Fehler, abgebrochener
  // Testcontainer): eine unbehandelte Exception hier wuerde den deterministischen Kern crashen
  // (Review-Befund) statt ein - wenn auch generisches - rotes Gate-Ergebnis zu liefern.
  try {
    const j = JSON.parse(readFileSync(join(runDir(i), 'jest.json'), 'utf8'))
    const testFiles = listTestFiles(i)
    // Inhalts-Matching (Zeile-fuer-Zeile-Vergleich) nur gegen plausible Quelldateien, nicht
    // gegen JEDE Datei unter tests/: Snapshots/Fixtures enthalten regulaer lange Zeilen, die bei
    // Matcher-Fehlern (Snapshot-Diff, DOM-Dump) legitim in der Ausgabe auftauchen und sonst jeden
    // solchen Failure unnoetig auf die Erstzeilen-Form degradieren wuerden (Review-Befund Runde 2).
    // Das PFAD-Matching bleibt bewusst auf ALLE Dateien unter tests/ (nicht nur Quelldateien).
    const sourceLikeFiles = testFiles.filter(f => /\.(ts|tsx|js|jsx|cjs|mjs)$/.test(f) && !/__snapshots__/.test(f))
    const testLines = sourceLikeFiles.flatMap(f => readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(l => l.length > 20))
    const out: Failure[] = []
    for (const file of j.testResults ?? [])
      for (const t of file.assertionResults ?? [])
        if (t.status === 'failed') {
          const raw = (t.failureMessages ?? []).join('\n')
          const trimmed = truncateAtTestReference(raw).slice(0, CODEFRAME_LIMIT)
          // Letzte Instanz (design.md D2): enthaelt die durchgereichte Message trotz Abschneiden
          // woertlichen Testinhalt, degradiert NUR dieser Failure auf die alte Erstzeilen-Form,
          // statt den ganzen Run zu blockieren.
          // Derselbe Erkenner wie in assertNoTestLeak (design.md D1) - zwei Waechter, dieselbe
          // Frage, eine Antwort. Was er hier ZUSAETZLICH faengt, ist die Form ohne Verzeichnis
          // (D5): truncateAtTestReference schneidet oben bereits an tests/ bzw. tests\ ab, der
          // blosse Dateiname aus "Cannot find module './x' from 'y.unit.test.tsx'" bleibt aber
          // stehen.
          const leakt = (text: string) => testFiles.some(f => testFileMention(text, f, i) !== undefined)
            || testLines.some(l => text.includes(l))
          // Geprueft wird, was tatsaechlich WEITERGEREICHT wird - nicht, was zuerst gebildet
          // wurde. Der Rueckfall auf die erste Zeile greift genau dann, wenn das Kuerzen nichts
          // uebrig liess, und das ist der Regelfall bei "Cannot find module './x' from
          // 'tests/y.test.ts'": die Nennung steht dort in Zeile 0, truncateAtTestReference
          // schneidet davor ab, der geprueft Text waere leer - und der Rueckfall holte
          // anschliessend genau die Zeile zurueck, die der Waechter verhindern soll
          // (Review-Befund Runde 1). Eine Pruefung, an der eine spaetere Ersetzung vorbeilaeuft,
          // schuetzt die Ausgabe nicht, die beim implementer ankommt.
          const kandidat = trimmed || firstErrorLine(raw)
          out.push({ name: t.title, message: leakt(kandidat) ? degradeToFirstLine(i, t.title, raw, leakt) : kandidat })
        }
    return out
  } catch (e) {
    // Nur die Fehlerklasse, nicht die volle Meldung: ein ENOENT/SyntaxError-Text kann den vollen
    // (potenziell Testpfad enthaltenden) Dateipfad einschliessen (Review-Befund Runde 2).
    return [{ name: 'gate', message: `Gate-Ausgabe nicht auswertbar (${(e as Error).name}).` }]
  }
}
// Schneidet Jest-Failure-Messages VOR dem Codeframe ab: Jest zeigt bei Matcher-Fehlern
// standardmaessig einen Quellcode-Ausschnitt der Testdatei (nummerierte Zeilen mit "|"), bevor
// die Stacktrace-Zeile mit dem Dateipfad folgt - der Codeframe selbst ist daher der eigentliche
// Leak-Vektor, nicht nur die Pfadzeile am Ende. Die Pfad-Regex ist bewusst allgemein (nicht nur
// auf *.test.ts(x) begrenzt): tests/__mocks__/... o.ae. sind ebenso Leak-Flaeche.
export function truncateAtTestReference(m: string): string {
  const lines = m.split('\n')
  const idx = lines.findIndex(l =>
    /^\s*>?\s*\d+\s*\|/.test(l) ||
    /tests[\\/][^\s:()]+/.test(l))
  return (idx === -1 ? lines : lines.slice(0, idx)).join('\n').trim()
}
// Die Kurzform ist die erste Zeile - und genau dort steht die Nennung, wenn Jest sie in die
// Kopfzeile schreibt ("Cannot find module './x' from 'y.unit.test.tsx'"). Eine Degradierung,
// die den Leak mitnimmt, ist keine: dann wird der Failure ganz zurueckgehalten und nur benannt,
// dass zurueckgehalten wurde. Der implementer verliert damit dieses eine Feedback - der Preis
// ist niedriger als eine Preisgabe (constitution.md §2.2 vor §8.2 G3), und der Mensch findet
// den Vorgang im Protokoll.
function degradeToFirstLine(i: string, testName: string, raw: string, leakt: (t: string) => boolean): string {
  const kurz = firstErrorLine(raw)
  const zurueckgehalten = leakt(kurz)
  appendFileSync(join(runDir(i), 'leak-degradations.log'),
    `[${new Date().toISOString()}] ${zurueckgehalten ? 'zurückgehalten' : 'degradiert'}: ${testName}\n`)
  // Ein zurueckgehaltener Failure kostet den implementer sein Feedback, waehrend der
  // Rundenzaehler nach §3.5 weiterlaeuft. Trifft es alle Failures einer Runde, liefe der Lauf
  // bis zur Eskalation, ohne dass der Mensch den Grund saehe - das Protokoll liest niemand von
  // allein. Deshalb zusaetzlich auf stderr, wie beim Board-Beiwerk (Review-Befund Runde 1).
  if (zurueckgehalten)
    console.error(`[gate] Ausgabe zu "${testName}" zurückgehalten: sie nennt eine Testdatei.`)
  return zurueckgehalten
    ? 'Ausgabe zurückgehalten: sie nennt eine Testdatei (siehe leak-degradations.log).'
    : kurz
}
function firstErrorLine(m: string): string {
  return (m.split('\n').find(l => l.trim().length > 0) ?? '').trim().slice(0, 300)
}
export function buildImplPrompt(i: string) {
  const s = readStatus(i)
  const parts = readChangeParts(i, s)
  const spec = formatChangeParts(parts)
  const gateFeedback = s.lastGate && !s.lastGate.green
    ? s.lastGate.failures!.map(f => `## ${f.name}\n${f.message}`).join('\n\n') : ''
  const reviewFeedback = s.lastReview && s.lastReview.recommendation === 'nacharbeit'
    ? formatReviewFindings((s.lastReview.findings as unknown[]).filter(f => scopeOfFinding(f) === 'impl')) : ''
  // Kostentreiber 3 aus proposal.md ("Rework ohne Gedaechtnis"): eine Ablehnung im menschlichen
  // App-Test loeste bisher eine Implementer-Runde OHNE das Feedback selbst aus - der Rundenzaehler
  // lief mit, aber der Implementer wusste nicht, was der Mensch beanstandet hat.
  const appReviewFeedback = s.lastAppReview && !s.lastAppReview.freigegeben && s.lastAppReview.feedback
    ? s.lastAppReview.feedback : ''
  const history = formatRoundsHistory(s)
  const prompt =
`Implementiere den folgenden Change ausschließlich aus Spec und Konventionen.
Du siehst die Tests nicht. Ziel: grünes Gate (Tests + Typecheck + Lint).

# Spec
${spec}

# Konventionen
Siehe AGENTS.md und constitution.md.${gateFeedback ? `\n\n# Fehlgeschlagene Szenarien (vollständige Matcher-Ausgabe, kein Testcode)\n${gateFeedback}` : ''}${reviewFeedback ? `\n\n# Reviewer-Findings aus vorheriger Runde (beheben)\n${reviewFeedback}` : ''}${appReviewFeedback ? `\n\n# Ablehnung aus dem menschlichen App-Test (beheben)\n${appReviewFeedback}` : ''}${history}`
  assertNoTestLeak(prompt, i, parts) // G1: bricht ab bei Testpfad/-inhalt
  console.log(prompt)
}
// test-author korrigiert Tests gegen die SPEC, nie gegen die Implementierung (constitution.md
// §2.1-Abgrenzung, design.md D1) - der Prompt enthaelt deshalb Spec + Findings, aber keinen
// Implementierungs-Diff. Kein assertNoTestLeak noetig: die Findings referenzieren per Definition
// Testpfade, und Tests sind fuer den test-author ohnehin sichtbar (kein Leak in dieser Richtung).
export function buildTestReworkPrompt(i: string) {
  const s = readStatus(i)
  const spec = readChangeSpec(i, s)
  const findings = (s.pendingTestFindings ?? []).filter(f => scopeOfFinding(f) !== 'human')
  const feedback = formatReviewFindings(findings)
  const prompt =
`Korrigiere die folgenden Tests ausschließlich gegen die Spezifikation unten - nicht gegen die
aktuelle Implementierung. Bestätige anschließend, ob die geänderten Tests gegen den aktuellen
Stand grün laufen.

# Spec
${spec}

# Reviewer-Findings zu den Tests (beheben)
${feedback}`
  console.log(prompt)
}
// design.md D3: schema-gebundene Zusammenfassung jeder Runde (test-author ODER implementer),
// damit ein neu gestarteter Implementer-Prompt den Verlauf kennt, statt bei jeder Runde bei
// null anzufangen. Wird von der Session direkt nach der Rollen-Antwort aufgerufen, vor
// confirm-red/gate/confirm-test-rework.
// Rolle als CLI-Argument ist ungepruefter Freitext (Review-Befund/G1): ein Tippfehler wie
// "testauthor" wuerde sonst still im implementer-Zweig von formatRoundsHistory landen und
// eine test-author-Runde (Testpfade!) als vermeintliche Implementer-Historie in den naechsten
// Implementer-Prompt schreiben - abgefangen erst nachtraeglich von assertNoTestLeak.
export function recordRoundSummary(i: string, role: Role, json: string) {
  if (!ROLES.includes(role)) fail(`Unbekannte Rolle für record-round-summary: "${role}"`)
  const s = readStatus(i)
  assertNotPaused(s)
  const data = JSON.parse(json) as Record<string, unknown>
  const geänderte_dateien = (data.geänderte_dateien ?? data.tests_geschrieben) as string[] | undefined
  pushRound(s, { role, summary: data, geänderte_dateien })
  writeStatus(s)
  console.log(JSON.stringify({ ok: true }))
}
// Fuer den Implementer-Prompt sichtbare Historie: test-author-Runden zeigen bewusst KEINE
// Dateipfade/Zusammenfassung (waeren Testpfade - G1-Grenzfall), nur das Gate-/Review-Ergebnis.
// Implementer-Runden zeigen die eigene vorherige Arbeit (unproblematisch, kein Leak).
export function formatRoundsHistory(s: Status): string {
  const rows = (s.rounds ?? []).filter(r => r.round < s.round)
  if (rows.length === 0) return ''
  const lines = rows.map(r => {
    const outcome = `${r.gateGreen !== undefined ? ` Gate: ${r.gateGreen ? 'grün' : 'rot'}.` : ''}${r.reviewRecommendation ? ` Review: ${r.reviewRecommendation}.` : ''}`
    if (r.role === 'test-author') return `- Runde ${r.round} (test-author): Tests wurden gegen die Spec angepasst.${outcome}`
    const zusammenfassung = (r.summary as Record<string, unknown> | undefined)?.zusammenfassung
    return `- Runde ${r.round} (implementer): ${zusammenfassung ?? ''} Geänderte Dateien: ${(r.geänderte_dateien ?? []).join(', ')}.${outcome}`
  })
  return `\n\n# Verlauf der bisherigen Runden\n${lines.join('\n')}`
}
function formatReviewFindings(findings: unknown[]): string {
  return findings.map(f => {
    const r = f as Record<string, unknown>
    const sev = r.schwere ? `[${r.schwere}] ` : ''
    return `- ${sev}${r.ort ? r.ort + ' — ' : ''}${r.problem}${r.vorschlag ? ` (Vorschlag: ${r.vorschlag})` : ''}`
  }).join('\n')
}
// Geprueft wird der FERTIGE Prompt, nicht die Blockliste (design.md D4): pruefte der Waechter
// die Bloecke, entstuende eine Luecke fuer alles, was buildImplPrompt danach anhaengt - und das
// Gate-Feedback ist die Stelle, an der Testmaterial nachweislich schon einmal durchgesickert ist
// (constitution.md §8.2 G3). Die Bloecke dienen allein dazu, einen Treffer zu verorten:
// design.md nennt erfahrungsgemaess konkrete Dateipfade und ist damit die wahrscheinlichste
// Quelle eines Abbruchs; ohne die Angabe sucht der Mensch den Treffer im ganzen Change-Ordner.
//
// Der Abbruch bleibt hart. Filtern wuerde die betroffene Zeile entfernen und den Lauf
// weiterlaufen lassen - mit einer Spec, die der implementer nur unvollstaendig sieht, ohne dass
// es jemand merkt. Ein Waechter, der bei einem Treffer weiterlaeuft, waere keiner (G1).
function assertNoTestLeak(prompt: string, i: string, parts: ChangePart[] = []) {
  const fundstelle = (fund: string) => {
    const p = parts.find(x => x.text.includes(fund))
    return p ? ` (Fundstelle: ${p.quelle})` : ''
  }
  const konventionen = readKonventionen(i)
  for (const f of listTestFiles(i)) {
    const genannt = testFileMention(prompt, f, i)
    if (genannt) fail(`Leak: Prompt referenziert Testpfad ${f}${fundstelle(genannt)}`)
    // Die Ausnahme gilt dem Inhalts-Zweig: geprueft wird eine ZEILE, und eine Zeile, die auch
    // in den Konventionen steht, ist keine geheime. Fuer den Pfad-Zweig darueber gilt sie
    // NICHT (normalize-path-comparisons/design.md D6): AGENTS.md nennt Testpfade als Muster
    // (tests/<name>.unit.test.tsx), aber keine existierende Datei beim Namen. Eine Nennung, die
    // auf eine reale Datei des Laufs passt, ist deshalb auch dann eine Preisgabe, wenn in den
    // Konventionen ein aehnliches Muster steht.
    for (const line of readFileSync(f, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l.length > 20 && !konventionen.includes(l)))
      if (prompt.includes(line)) fail(`Leak: Prompt enthält Testinhalt aus ${f}${fundstelle(line)}`)
  }
}
// Die eine Stelle, an der beantwortet wird, ob ein Text eine Testdatei des Laufs NENNT
// (normalize-path-comparisons/design.md D1). Vorher stand die Antwort zweimal im Code - in
// assertNoTestLeak und in parseJestFailures -, einmal falsch und einmal aus einem Zufall
// richtig, und keine der beiden Stellen wusste von der anderen. Bei einer Sicherheitsnaht
// (constitution.md §2.2, §8.1) ist das der teuerste Ort fuer eine Dopplung.
//
// Geprueft wird der blosse DATEINAME - und der allein genuegt, weil jede laengere Schreibweise
// auf ihn endet (normalize-path-comparisons/design.md D2): der absolute Pfad
// (C:\...\.harness\wt\12\tests\x.test.ts, so gibt Jest ihn aus) auf den repo-relativen, dieser
// auf den worktree-relativen, dieser auf den Namen. Eine Liste laengerer Formen daneben waere
// totes Gewicht; eine Mutationsprobe hat sie als solches nachgewiesen - kein Test wurde rot,
// als sie entfiel.
//
// Der Name ist zugleich die Form, die in einer design.md tatsaechlich steht, und er verraet
// dasselbe wie der Pfad: welche Testdatei existiert und wie das Verhalten geschnitten ist. Ein
// Fehlalarm ist hier der billige Fehler (er haelt den Lauf an und nennt seit #22 die
// Fundstelle), ein uebersehener Leak der teure.
//
// Case-sensitiv (D3): die Schreibweise anzugleichen waere eine Annahme ueber das Dateisystem,
// die auf einem Linux-Laeufer falsch ist.
//
// Zurueckgegeben wird die gefundene Form, nicht bloss ein Wahrheitswert: assertNoTestLeak
// braucht sie, um die Fundstelle im Change zu bestimmen.
export function testFileMention(text: string, testFile: string, i: string): string | undefined {
  for (const form of mentionForms(testFile, i)) if (text.includes(form)) return form
  return undefined
}
// Wie kurz eine Nennung sein darf, haengt von der Datei ab (D2).
//
// Eine erkennbare Testdatei nennt schon ihr NAME: "user-auth.integration.test.ts" kommt in
// gewoehnlicher Prosa nicht vor, und in einer design.md steht ohnehin er statt des Pfads.
//
// Fuer alles andere unter tests/ - Fixtures, Mocks, Platzhalter - gilt das nicht. Der Beleg
// kam aus der Gegenprobe am echten Material: listTestFiles liefert auch tests/.gitkeep, und
// ".gitkeep" steht in der proposal.md von add-user-auth ("src/ enthaelt heute nur .gitkeep").
// Ein Erkenner, der darauf anschlaegt, haelt Auftraege an, die nichts preisgeben. Fuer solche
// Dateien zaehlt deshalb erst die Nennung MIT Pfadanteil.
//
// Laengere Schreibweisen brauchen keinen eigenen Eintrag: ein absoluter Pfad endet auf den
// repo-relativen, dieser auf den worktree-relativen, dieser auf den Namen. Genau dieser
// Umstand traegt parseJestFailures, wo Jest absolute Pfade ausgibt.
//
// Case-sensitiv (D3): die Schreibweise anzugleichen waere eine Annahme ueber das Dateisystem,
// die auf einem Linux-Laeufer falsch ist.
const IST_TESTDATEI = /\.test\.[jt]sx?$/
function mentionForms(testFile: string, i: string): string[] {
  const slash = fwd(testFile)
  const wurzel = fwd(worktreeDir(i)) + '/'
  const wtRelativ = slash.startsWith(wurzel) ? slash.slice(wurzel.length) : slash
  if (IST_TESTDATEI.test(slash)) return [slash.slice(slash.lastIndexOf('/') + 1)]
  // Beide Trennzeichen LITERAL, nicht ueber `sep`: auf einem Linux-Laeufer waere sep === '/',
  // die Backslash-Form entfiele - und ausgerechnet die design.md-Dateien dieses Repos entstehen
  // auf Windows und koennen einen Backslash-Pfad enthalten. Ein Erkenner, der je nach Plattform
  // nachsichtiger ist, waere keine Unabhaengigkeit von der Schreibweise (Review-Befund Runde 1).
  return [...new Set([wtRelativ, wtRelativ.replace(/\//g, '\\')])]
}
const fwd = (p: string): string => p.replace(/\\/g, '/')
// design.md D6: was in den Konventionsdateien steht, ist kein Leak. Anlass war kein
// hypothetischer - die echte design.md zu #12 liess den Waechter an `/** @jest-environment
// jsdom */` anschlagen, einer Zeile, die AGENTS.md fuer Komponententests VORSCHREIBT und die
// deshalb notwendig auch in jeder solchen Testdatei steht. Der Prompt verweist den implementer
// im Abschnitt "Konventionen" ausdruecklich auf beide Dateien; was er ohnehin lesen darf, kann
// ihm eine Testdatei nicht verraten.
//
// Verglichen wird als TEILSTRING ueber den ganzen Text, nicht zeilenweise - und das ist die
// Bedingung dafuer, dass die Ausnahme ueberhaupt greift: Konventionen stehen in AGENTS.md
// eingebettet in Fliesstext und Backticks, der ausloesende Fall als
// "`/** @jest-environment jsdom */`-Docblock am Dateianfang statt globaler jsdom-Umgebung —".
// Ein Vergleich auf ganze Zeilen faende dort nichts. Die Frage ist nicht, ob eine Zeile in den
// Konventionen isoliert steht, sondern ob ihr Inhalt dort nachzulesen ist.
//
// Nur die Fassungen im WORKTREE zaehlen, nicht die im Hauptrepo, in dem der Orchestrator
// laeuft: der implementer arbeitet im Worktree und liest dessen AGENTS.md. Eine Zeile, die nur
// in der weitergezogenen Fassung auf main steht, waere fuer ihn nicht oeffentlich. Fehlen die
// Dateien, greift keine Ausnahme - der Waechter faellt auf die strengere Seite.
const KONVENTIONSDATEIEN = ['AGENTS.md', 'constitution.md']
function readKonventionen(i: string): string {
  const texte: string[] = []
  for (const datei of KONVENTIONSDATEIEN) {
    const p = join(worktreeDir(i), datei)
    if (existsSync(p)) texte.push(readFileSync(p, 'utf8'))
  }
  return texte.join('\n')
}
// G2 (schema-gebundene Rollen-Summaries): eine vom Schema abweichende Reviewer-Antwort
// (wiederkehrender Vorfall) darf next() nicht unbemerkt als
// "nacharbeit ohne jedes Finding" interpretieren - das wuerde still eine Runde verbrauchen, ohne
// dass der Implementer irgendein Feedback bekommt (Review-Befund).
// Schreibt die verworfene Rohantwort weg, BEVOR fail() den Prozess beendet: eine mit Opus
// erzeugte Reviewer-Antwort ist teuer - bei einem Schemaverstoss soll der Mensch sie von Hand
// ummappen koennen, statt den Reviewer neu laufen zu lassen.
function rejectReview(i: string, json: string, reason: string): never {
  writeFileSync(join(runDir(i), 'rejected-review.json'), json)
  fail(`Reviewer-Antwort weicht vom Schema ab: ${reason} (Rohantwort in rejected-review.json)`)
}
export function recordReview(i: string, json: string) {
  const s = readStatus(i)
  assertNotPaused(s)
  const r = JSON.parse(json)
  if (r.freigabe_empfehlung !== 'ok' && r.freigabe_empfehlung !== 'nacharbeit')
    rejectReview(i, json, `freigabe_empfehlung="${r.freigabe_empfehlung}"`)
  if (r.findings !== undefined && !Array.isArray(r.findings))
    rejectReview(i, json, 'findings ist kein Array')
  const findings = (r.findings ?? []) as Record<string, unknown>[]
  // "nacharbeit" ohne jedes Block-Finding waere ein Schemaverstoss: reviewRework wuerde eine
  // volle Implementer-Runde ohne jegliches Feedback verbrauchen (still eine der drei Runden
  // kosten). Der Reviewer soll in diesem Fall "ok" mit reinen Hinweis-Findings liefern.
  if (r.freigabe_empfehlung === 'nacharbeit' && !findings.some(f => f.schwere === 'block'))
    rejectReview(i, json, '"nacharbeit" ohne jedes Block-Finding')
  s.lastReview = { recommendation: r.freigabe_empfehlung, findings }
  updateLastRound(s, { reviewRecommendation: r.freigabe_empfehlung })
  s.phase = 'review'; writeStatus(s)
  console.log(next(i))
}
// Menschlicher App-Test vor dem PR (constitution.md §3.4): der Mensch bestaetigt nach eigenem
// manuellem Test in der laufenden App explizit per Chat - kein automatisches "ok" moeglich, da
// dieser Verb nur durch eine echte Session-Eingabe ausgeloest wird, nie durch eine Rolle.
export function confirmAppReview(i: string, entscheidung: string, feedback?: string) {
  const s = readStatus(i)
  assertNotPaused(s)
  const freigegeben = entscheidung === 'ja'
  s.lastAppReview = { freigegeben, feedback }
  s.phase = 'app-review'; writeStatus(s)
  console.log(next(i))
}
// design.md D5: mechanischer Check statt Review-Finding ("tasks.md nicht abgehakt" war in 7/7
// Pilot-Runs ein Finding und verstopfte die Findings-Liste). Laeuft intern vor jedem
// archive-and-open-pr; bei Verstoss liefert next() stattdessen die Aktion 'fix-tasks'.
export function checkPreflight(i: string): { ok: boolean; reason?: string } {
  const s = readStatus(i)
  const dir = join(worktreeDir(i), 'openspec', 'changes', s.change ?? i)
  if (!existsSync(dir)) return { ok: false, reason: 'change-dir-missing' }
  const tasksPath = join(dir, 'tasks.md')
  if (!existsSync(tasksPath)) return { ok: false, reason: 'tasks-missing' }
  // Eingerueckte Unteraufgaben ("  - [ ] 1.1") und "*"-Aufzaehlungen sind in tasks.md ueblich -
  // eine zu enge Regex wuerde sie faelschlich als abgehakt werten (Review-Befund).
  const unchecked = (readFileSync(tasksPath, 'utf8').match(/^\s*[-*]\s*\[ \]/gm) ?? []).length
  return unchecked === 0 ? { ok: true } : { ok: false, reason: `${unchecked} offene Task(s)` }
}
function preflightArchive(i: string) { console.log(JSON.stringify(checkPreflight(i))) }
// Gegenstueck zu start(): dort entsteht je Issue ein Worktree, den bis dahin nichts wieder
// entfernt hat. Ohne Cleanup sammeln sich Worktrees, Feature-Branches und aktive
// Rollenmarker unbegrenzt an - guard.ts muss tote Marker abgeschlossener Runs bereits aus
// seinem soleActiveRole-Fallback herausfiltern, behandelt damit aber nur das Symptom.
// Bewusst nur fuer terminale Phasen: ein laufender Run wuerde sich selbst den Boden
// entziehen, und ein eskalierter Run muss fuer den Menschen inspizierbar bleiben.
const CLEANUP_PHASES = new Set<Status['phase']>(['done', 'archived'])
export function cleanup(i: string, run?: GhRunner) {
  const s = readStatus(i)
  assertNotPaused(s)
  if (!CLEANUP_PHASES.has(s.phase))
    fail(`Kein Cleanup in Phase "${s.phase}" — aufgeräumt wird nur nach ${[...CLEANUP_PHASES].join('/')}.`)
  // Die einzige Harness-Aktion nach dem Merge - und damit die Stelle fuer "Fertig". Weil
  // cleanup auch auf einem archivierten, aber noch nicht gemergten Lauf laufen kann, prueft
  // das Board-Modul vorher den Zustand des Issues (set-board-status/design.md D4).
  setBoardStatusIfIssueClosed(i, run)
  const wt = worktreeDir(i)
  const worktreeEntfernt = existsSync(wt) ? sh(`git worktree remove --force "${wt}"`).ok : false
  sh('git worktree prune')
  // Das Run-Verzeichnis bleibt als Audit-Trail liegen (status.json, jest.json, Eskalationen).
  // Entfernt wird nur der Rollenmarker: er ist der einzige Teil des Run-State, den guard.ts
  // zur Laufzeit auswertet.
  const marker = join(runDir(i), 'active-role')
  if (existsSync(marker)) rmSync(marker)
  console.log(JSON.stringify({ ok: true, phase: s.phase, worktreeEntfernt }))
}
// --- Pause & Fortsetzen (add-harness-pause, Issue #23) ---
// Der Zustand zwischen den Rollen: der naechste sinnvolle Schritt gehoert keiner. Ohne dieses
// Verb blieb dem Menschen nur, den Rollenmarker von Hand zu schreiben - einer aktiven Rolle
// verboten (guard.ts, Steuerdatei-Tabu) und nirgends festgehalten.
// Beide Verben tippt der Mensch nach der neuen Arbeitsteilung (design.md D6) regelmaessig von
// Hand - eine vertippte Laufkennung ist damit der Regelfall, nicht die Ausnahme. Ohne diese
// Huelle liefe readStatus in ein readFileSync und stuerbe mit rohem ENOENT-Stacktrace samt
// vollem Pfad (Review-Befund).
function readRunOrFail(i: string, was: string): Status {
  if (!existsSync(statusPath(i))) fail(`Kein Lauf "${i}" — nichts ${was}.`)
  try {
    return readStatus(i)
  } catch (e) {
    // Dieselbe Fehlerklasse wie beim vertippten `phase`: waehrend der Pause korrigiert der
    // Mensch status.json von Hand, ein Komma zu viel ist dort so wahrscheinlich wie ein
    // Buchstabendreher. Nur die Fehlerklasse ausgeben, nicht die volle Meldung - die enthaelt
    // den vollen Dateipfad (wie in parseJestFailures).
    return fail(`Run-State von "${i}" ist nicht lesbar (${(e as Error).name}) — status.json prüfen.`)
  }
}
export function pause(i: string, grund?: string) {
  // Der Grund wird VOR dem Run-State geprueft: eine Pause ohne festgehaltenen Anlass waere
  // dieselbe undokumentierte Handkorrektur wie bisher, nur mit einem Verb davor.
  const text = (grund ?? '').trim()
  if (text === '') fail(`Pausieren verlangt einen Grund: pnpm harness pause ${i} "<grund>"`)
  const s = readRunOrFail(i, 'zu pausieren')
  if (s.paused)
    fail(`Lauf ${i} ist bereits pausiert seit ${s.paused.seit}: ${s.paused.grund}`)
  s.paused = { grund: text, seit: new Date().toISOString() }
  writeStatus(s)
  // Zuletzt der Marker: waere er vor dem Schreiben des Run-State freigegeben und writeStatus
  // schluege fehl, stuende der Lauf rollenlos da, ohne dass etwas von einer Pause wuesste.
  setRole(i, 'none')
  console.log(JSON.stringify({ ok: true, paused: s.paused }))
}
// Die Rolle stammt aus der PHASE, nicht aus einem bei pause gesicherten Wert (design.md D3):
// waehrend der Pause korrigiert der Mensch den Lauf - genau dafuer ist sie da -, und ein
// gesicherter Wert waere danach womoeglich die Rolle des falschen Schritts.
export function resume(i: string) {
  const s = readRunOrFail(i, 'fortzusetzen')
  if (!s.paused)
    fail(`Lauf ${i} ist nicht pausiert — kein Pausenzustand, der fortzusetzen wäre.`)
  // Vor dem ersten Schreibzugriff (Review-Befund): waehrend der Pause korrigiert der Mensch den
  // Run-State von Hand - ein Vertippen in `phase` ist dort der Regelfall. Ohne diese Pruefung
  // liefe resume in ein writeFileSync(path, undefined) und stuerbe mit rohem Stacktrace, NACHDEM
  // es den Pausenzustand schon geloescht hat: zurueck bliebe ein Lauf, der nicht mehr pausiert
  // ist, dessen Marker noch den alten Wert traegt und dessen Abbruch nichts erklaert.
  // hasOwnProperty statt `in`: `in` trifft auch die Prototypenkette, ein handgeschriebenes
  // phase: "constructor" oder "toString" kaeme sonst durch (Review-Befund).
  if (!Object.prototype.hasOwnProperty.call(ROLE_FOR_PHASE, s.phase))
    fail(`Unbekannte Phase "${s.phase}" in ${i}. Zulässig: ${Object.keys(ROLE_FOR_PHASE).join(', ')}`)
  s.paused = undefined
  writeStatus(s)
  const rolle = roleForStatus(s)
  setRole(i, rolle)
  console.log(JSON.stringify({ ok: true, rolle, phase: s.phase, runde: s.round }))
}

// Der einzige Statuswechsel ohne Automaten: die Spezifikation entsteht ueber /opsx:propose,
// also bevor `start` das Issue ueberhaupt kennt. Liest deshalb keinen Run-State und legt
// keinen an (set-board-status/design.md D2). Taugt zugleich zur Korrektur von Hand.
export function boardVerb(i: string, status: string) {
  console.log(JSON.stringify(setBoardStatus(i, status)))
}
export function escalate(i: string) {
  const s = readStatus(i)
  writeFileSync(join(runDir(i), 'ESCALATION.md'),
    `# Eskalation nach ${s.round} Runden\nPhase: ${s.phase}\nGate: ${JSON.stringify(s.lastGate)}\nReview: ${JSON.stringify(s.lastReview)}\n`)
}

// Der OpenSpec-Change liegt (wie der Feature-Code) auf dem Issue-Branch im Worktree, nicht
// zwingend auf dem Branch, den das Hauptrepo gerade zufaellig ausgecheckt hat. Der Change-Name
// (Verzeichnis unter openspec/changes/) wird bei `start` in status.json abgelegt; ohne
// explizites Mapping wird die Issue-Nummer selbst als Verzeichnisname versucht (Fallback fuer
// aeltere Runs).
export function readChangeSpec(i: string, s: Status): string {
  return formatChangeParts(readChangeParts(i, s))
}
// Reihenfolge = Lesart des Change-Ordners (design.md D1): warum (proposal.md) -> wie
// entschieden (design.md) -> was genau (specs/). Der implementer liest von oben; jede Zeile vor
// den Requirements ist Kontext, gegen den er sie auslegt. Stuenden die Entscheidungen dahinter,
// haette er die Anforderungen bereits einmal frei interpretiert, bevor er erfaehrt, dass die
// Frage schon beantwortet war - genau die doppelte Beantwortung, die Issue #22 aufgefallen ist.
//
// Blockliste statt fertigem String (D3), damit assertNoTestLeak einen Treffer einer Quelldatei
// zuordnen kann. Die Zuordnung aus dem fertigen Prompt zurueckzurechnen waere falsch, sobald der
// Treffer im angehaengten Gate-Feedback steht - dessen Abschnitte sind mit `## <testname>`
// ueberschrieben.
export type ChangePart = { quelle: string; text: string }
export function readChangeParts(i: string, s: Status): ChangePart[] {
  const dir = join(worktreeDir(i), 'openspec', 'changes', s.change ?? i)
  if (!existsSync(dir)) return []
  const parts: ChangePart[] = []
  // Fehlende Dateien erzeugen keinen Block (D5) - ein Auftrag mit leerer Rubrik laedt zu der
  // Annahme ein, es gaebe dort etwas zu holen.
  const lies = (quelle: string, ...pfad: string[]) => {
    const p = join(dir, ...pfad)
    if (existsSync(p)) parts.push({ quelle, text: readFileSync(p, 'utf8') })
  }
  lies('proposal.md', 'proposal.md')
  lies('design.md', 'design.md')
  const specsDir = join(dir, 'specs')
  if (existsSync(specsDir))
    // Forward-Slashes, nicht join() (D2): die Quelle ist Text fuer einen Leser, keine
    // Pfadangabe fuer das Dateisystem, und soll so erscheinen, wie der Change sie selbst
    // ueberall fuehrt. Ein Backslash-Pfad waere hier die Fehlerklasse aus Issue #21.
    for (const capability of readdirSync(specsDir))
      lies(`specs/${capability}/spec.md`, 'specs', capability, 'spec.md')
  return parts
}
// Die Quellenzeile traegt den Praefix "Quelle:", weil die eingebetteten Dateien selbst
// ##-Ueberschriften fuehren (## Why, ## Context, ## ADDED Requirements) - eine nackte
// `## design.md` stuende ununterscheidbar zwischen ihnen. Ein Level-1-# scheidet aus: der
// umgebende Prompt gliedert seine Abschnitte so (# Spec, # Konventionen), ein # mitten im
// Spec-Block wuerde die Spec optisch beenden.
function formatChangeParts(parts: ChangePart[]): string {
  return parts.map(p => `## Quelle: ${p.quelle}\n\n${p.text}`).join('\n\n---\n\n')
}
// Rekursiv und ohne Endungsfilter (Review-Befund): Hilfsdateien wie tests/__mocks__/*.tsx sind
// ebenso Leak-Flaeche wie *.test.ts(x) selbst - der 4000-Zeichen-Ausschnitt aus D2 vergroessert
// die Angriffsflaeche gegenueber der alten Erstzeilen-Form, die Waechterabdeckung muss mitziehen.
export function listTestFiles(i: string): string[] {
  const dir = join(worktreeDir(i), 'tests')
  if (!existsSync(dir)) return []
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p); else out.push(p)
    }
  }
  walk(dir)
  return out
}

// --- Dispatch ---
// Hinter einem isMain-Guard (wie guard.ts, siehe dortiger Kommentar zu import.meta unter
// ts-jest/commonjs): ohne ihn wuerde jeder Test-Import dieser Datei den Dispatch mit
// process.argv der Test-Runner-Invocation ausfuehren (verb=undefined -> fail() -> exit 1,
// der Testprozess stuerbe sofort ab).
const invokedPath = process.argv[1] !== undefined ? resolvePath(process.argv[1]) : undefined
const isMain = invokedPath !== undefined && /orchestrator\.ts$/.test(invokedPath.replace(/\\/g, '/'))
if (isMain) {
  const [verb, ...a] = process.argv.slice(2)
  const stdin = () => readFileSync(0, 'utf8')
  switch (verb) {
    case 'start': start(a[0], a[1]); break
    case 'confirm-red': confirmRed(a[0]); break
    case 'gate': gate(a[0]); break
    case 'build-impl-prompt': buildImplPrompt(a[0]); break
    case 'build-test-rework-prompt': buildTestReworkPrompt(a[0]); break
    case 'record-round-summary': recordRoundSummary(a[0], a[1] as Role, a[2] === '-' ? stdin() : a[2]); break
    case 'record-review': recordReview(a[0], a[1] === '-' ? stdin() : a[1]); break
    case 'confirm-test-rework': confirmTestRework(a[0]); break
    case 'confirm-app-review': confirmAppReview(a[0], a[1], a[2]); break
    case 'preflight-archive': preflightArchive(a[0]); break
    case 'board': boardVerb(a[0], a[1]); break
    case 'pause': pause(a[0], a[1]); break
    case 'resume': resume(a[0]); break
    case 'next': console.log(next(a[0])); break
    case 'escalate': escalate(a[0]); break
    case 'cleanup': cleanup(a[0]); break
    default: fail(`Unbekanntes Verb: ${verb}`)
  }
}
