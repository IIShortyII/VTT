#!/usr/bin/env node
// PreToolUse-Guard (Port von guard.sh, design.md D6/D7). Liest das Tool-JSON von stdin,
// den active-role-Marker pro Issue vom Skript. Fail-closed: jede unbehandelte Exception
// blockt statt durchzulassen (Gegenteil des bash-Crash-Verhaltens - dort war ein Absturz
// gleichbedeutend mit "kein exit 2", also fail-open).
//
// BEDINGUNG AN DIESE DATEI (Issue #29): settings.json startet sie als `node .harness/guard.ts`,
// also OHNE Transpiler - Node strippt die Typen selbst. Diese Datei muss deshalb dauerhaft
// type-stripping-tauglich bleiben: keine `enum`, keine `namespace`, keine
// Parameter-Properties, keine Importe lokaler Module (nur `node:`-Builtins). Der Grund fuer
// das nackte `node`: der Hook laeuft vor JEDEM Werkzeugaufruf, und `pnpm exec tsx` kostet
// dabei 3,1 s statt 0,44 s. Der Grund gegen `tsx`: es liegt nur in node_modules/.bin, das im
// PATH der Hook-Shell fehlt - der Hook starb dann mit "command not found", und weil ein
// PreToolUse-Hook ausschliesslich bei Exit 2 blockt, lief jeder Aufruf durch (still
// fail-open). Ein Verstoss gegen die Bedingung faellt in .harness/tests/hook.test.ts auf,
// nicht im Typecheck - ts-jest transpiliert enums klaglos.
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
// Formen, die eine ephemere Wegwerf-DB kennzeichnen - am GANZEN Wert geprueft, nicht als
// Teilstueck (guard-inline-db-url/design.md D8): seit der Wert auch aus dem agentengeschriebenen
// Kommandotext stammen kann, waere ein Teilstring-Match fail-open
// (postgres://user@prod-host/db?options=test.db enthaelt "test.db", verbindet aber zu prod-host).
// Alles, was keine der Formen trifft, gilt als produktiv und wird geblockt (fail-closed: ein
// leeres DATABASE_URL trifft nichts).
// SQLite adressiert ueber Dateipfade statt Hostnamen - die Wegwerf-DB der Integrationstests
// heisst daher per Konvention "test.db" (bzw. laeuft in-memory). Die lokale Entwicklungs-DB
// (dev.db) trifft bewusst NICHT: Migrationen sind Menschensache (constitution.md 5.1), der
// Agent schreibt das Schema, fuehrt es aber nicht aus. localhost/127.0.0.1 als Host einer
// Server-URL bleibt fuer einen spaeteren Umzug auf eine Server-DB enthalten - die Userinfo
// davor darf keinen "/" tragen, sonst liesse sich "localhost" dort verstecken und der echte
// Host dahinter.
// Die beiden SQLite-Formen lassen einen beliebigen Query-Teil zu - anders als die Server-URL
// unten: SQLite ist rein lokal, kein Query-Parameter adressiert einen anderen Host. Kommt je ein
// dateibasierter Treiber mit host-artigen Parametern hinzu, gehoert die Whitelist auch hierher.
const SQLITE_TEST_FILE = /^file:(?:[^?"']*\/)?test\.db(?:\?[^"']*)?$/
const SQLITE_MEMORY = /^(?:file|sqlite)::memory:(?:\?[^"']*)?$/
const LOCAL_SERVER_URL = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/"']*@)?(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^?"']*)?(?:\?([^"']*))?$/i
// libpq und Prisma lesen den Zielhost auch aus dem Query-Teil (?host=/cloudsql/..., ?socket=) -
// "localhost" in der Authority verbindet dann nirgends hin (design.md D8, Punkt 3, Review-Befund
// Runde 2). Deshalb eine Whitelist harmloser Schluessel statt einer Sperrliste, die beim
// naechsten Treiber unvollstaendig waere: jeder andere Schluessel macht den Wert zur unbekannten Form.
const HARMLESS_QUERY_KEYS = new Set(['schema', 'sslmode', 'connection_limit', 'pool_timeout', 'connect_timeout', 'pgbouncer', 'sslaccept'])
export function isEphemeralDbUrl(raw: string): boolean {
  const value = raw.replace(/^["']/, '').replace(/["']$/, '') // Anfuehrungszeichen aussen, wie die Shell sie entfernt
  if (SQLITE_TEST_FILE.test(value) || SQLITE_MEMORY.test(value)) return true
  const server = LOCAL_SERVER_URL.exec(value)
  if (!server) return false
  const query = server[1] ?? ''
  return query === '' || query.split('&').every(p => HARMLESS_QUERY_KEYS.has(p.split('=')[0].toLowerCase()))
}
// Welche Quelle fuer DATABASE_URL das Migrationskommando tatsaechlich sieht
// (guard-inline-db-url/design.md D1-D5). process.env ist die Umgebung des HOOK-Prozesses, nicht
// die des Kommandos: eine Inline-Zuweisung im Text ersetzt sie (D1). Rein - kein
// process.env-Zugriff hier, den macht decide() (D7).
const DB_URL_MENTION = /\bDATABASE_URL\b/g
// Der Wert ist auf den Zeichenvorrat einer URL beschraenkt, Anfuehrungszeichen aussen inklusive
// (D8): $, Backtick, Klammern, Backslash und alles ausserhalb von ASCII sind kein Teil eines
// Werts, sondern der Beginn einer unbekannten Form - was die Shell daraus macht, sieht der Guard
// nicht. `DATABASE_URL=x;` liefert damit KEINEN Wert: das Semikolon klebt am Wert, die Form
// faellt in "unbekannt" (D5). Leerraum ist ASCII-Leerraum wie bei der Shell - \\s naehme auch ein
// geschuetztes Leerzeichen als Grenze, das die Shell als Teil des Werts durchreicht.
const DB_URL_VALUE = '([A-Za-z0-9_./:@%?=+\\-"\']+)'
// Praefix und env: die Zuweisung wirkt auf genau das Kommando, das direkt folgt (D2). Weitere
// VAR=wert-Zuweisungen davor sind erlaubt. Nach dem Wert muss ein Kommandowort folgen, kein
// Trenner; der Rest wird auf Trenner geprueft (D3).
const PREFIX_FORM = new RegExp(`^[ \\t]*(?:env[ \\t]+)?(?:[A-Za-z_]\\w*=[^ \\t]*[ \\t]+)*DATABASE_URL=${DB_URL_VALUE}[ \\t]+(?![;&|])([^ \\t][\\s\\S]*)$`)
// export wirkt auf alles danach (D2) - ein Trenner zwischen Zuweisung und Kommando ist hier gerade
// die erwartete Form.
const EXPORT_FORM = new RegExp(`^[ \\t]*export[ \\t]+DATABASE_URL=${DB_URL_VALUE}[ \\t]*(?:&&|;|\\r?\\n)[ \\t]*[^ \\t\\r\\n]`)
// Hinter diesen Trennern gilt ein Praefix nicht mehr (D3) - auch die Pipe: bei
// `DATABASE_URL=x true | prisma migrate` sieht nur die linke Seite den Wert.
const COMMAND_SEPARATOR = /;|&&|\|\||\||\n|\$\(|`/
export function databaseUrlForCommand(cmd: string, env: string | undefined): string | undefined {
  const mentions = (cmd.match(DB_URL_MENTION) ?? []).length
  if (mentions === 0) return env ?? ''
  // Jede zweite Nennung - Zuweisung, unset, $DATABASE_URL - ist ein Weg, den geprueften Wert vor
  // der Migration umzubiegen (D4). Fail-closed.
  if (mentions > 1) return undefined
  const prefix = PREFIX_FORM.exec(cmd)
  if (prefix) return COMMAND_SEPARATOR.test(prefix[2]) ? undefined : prefix[1]
  const exported = EXPORT_FORM.exec(cmd)
  if (exported) return exported[1]
  return undefined
}
// Kommandos, die die Testsuite ausfuehren. Fuer den implementer tabu: Jest & Co. geben bei
// Matcher-Fehlern Codeframes aus den Testdateien aus und umgehen damit die Pfadsperre aus
// (1) vollstaendig (constitution.md 2.2). Das Gate ruft die Suite als Subprozess des
// Orchestrators auf, nicht als Session-Tool-Call - es ist von dieser Sperre nicht betroffen.
const TEST_RUNNER_COMMANDS = /\b(jest|vitest|mocha|ava)\b|\b(pnpm|npm|yarn|npx)\s+(run\s+)?test\b/
// Kommandos, die den Typecheck ueber das GESAMTE Projekt fahren. tsconfig.json schliesst
// tests/** in "include" ein - tsc nennt bei einem Fehler Pfad, Zeile, Symbolnamen und die
// betroffene Quellzeile der Testdatei und umgeht die Pfadsperre aus (1) damit genauso
// vollstaendig wie ein direkter Testlauf (beobachtet im ersten Feature-Run, Issue #18: der
// implementer erfuhr so den von den Tests erwarteten Namen seiner Fabrikfunktion).
// Der nackte Compiler-Aufruf gehoert mit hinein - `npx tsc --noEmit` braucht das
// Projektskript gar nicht und steht in jeder TypeScript-Dokumentation.
const TYPECHECK_COMMANDS = /\b(?:pnpm|npm|yarn|npx)\s+(?:run\s+)?typecheck(?![:\w-])|\btsc\b/
// Der erlaubte Ersatz: das ":src"-Skript bzw. ein tsc-Aufruf, der die auf src/ eingeschraenkte
// Projektdatei nennt. Ein ersatzloses Verbot waere der schlechtere Tausch - AGENTS.md weist
// Struktur und Mechanik ausdruecklich dem Typecheck zu, und ohne ihn fiele jeder Tippfehler
// erst im Gate auf, dessen Runden gegen constitution.md 3.5 zaehlen.
const SRC_ONLY_TYPECHECK = /\btypecheck:src\b|tsconfig\.src\.json/
// Steuerdateien und -verben der Rollensteuerung. Beide Muster fuehren zur selben Ablehnung;
// getrennt gehalten, weil das eine auf Pfade zielt und das andere auf Kommandos.
//
// Der Weg dorthin steht in beiden Schreibungen: vom Repo-Wurzelverzeichnis aus (".harness/…")
// und relativ aus einem Worktree heraus ("../../runs/<issue>/active-role", "../../guard.ts") -
// dieselbe Alternative wie in RUN_STATE_PATH. Ohne sie waere die Leseausnahme fuer den
// Rollenmarker (isRunState) breiter als die Sperre, die sie traegt: der Marker faellt in beiden
// Schreibungen aus dem Run-State-Tabu heraus, blieb aber nur in einer davon gegen Schreiben
// geschuetzt. Fuer den reviewer war `Write ../../runs/<i>/active-role` damit offen, fuer die
// beiden anderen Rollen blockte nur zufaellig die Schreib-Whitelist (Review-Befund zu #34).
const CONTROL_FILE_TABOO = /(?:\.harness\/|(?:\.\.\/)+)(?:runs\/[^/\s'"]+\/active-role|guard\.ts)\b/
const CONTROL_VERB_TABOO = /\b(?:harness|orchestrator\.ts)\s+(?:pause|resume)\b/
// Der Worktree ist seit add-harness-pause Teil der Rollensteuerung: die Rollenermittlung nimmt
// seine Existenz als Lebenszeichen. Wer ihn entfernt, erklaert seinen eigenen Lauf fuer tot und
// macht damit jeden Aufruf ohne ableitbares Issue rollenlos - also ungeprueft. Deshalb dasselbe
// Tabu wie fuer den Rollenmarker.
//
// Verboten ist die WURZEL, nicht ihr Inhalt: `.harness/wt/<issue>` (mit oder ohne Schraegstrich
// am Ende), gefolgt von Leerzeichen, Anfuehrungszeichen oder Zeilenende. Ein Muster, das jeden
// Pfad UNTERHALB des Worktrees erfasst, sperrte den Rollen ihren eigenen Arbeitsbereich:
// `rm .harness/wt/23/src/veraltet.ts` (der implementer hat kein Delete-Werkzeug, das laeuft
// zwangsläufig ueber Bash) und `mv .../tests/a.test.ts .../tests/b.test.ts` (test-author
// benennt um) waeren geblockt - mit einer Begruendung, die den Aufrufer in die Irre schickt
// (Review-Befund Runde 3). Auch `\n` gehoert aus der Luecke heraus, sonst verbindet ein
// mehrzeiliges Kommando ein beliebiges `rm` mit einer spaeteren Zeile, die den Worktree nennt.
const WORKTREE_TABOO = /\b(?:rm|rmdir|mv)\b[^|;&\n]*\.harness\/wt\/[^/\s'"]+\/?(?=[\s'"]|$)|\bgit\s+worktree\s+(?:remove|prune)\b/
// Der Run-State eines Laufs (Issue #34). `.harness/runs/<issue>/` traegt die Rohform dessen, was
// der Orchestrator gefiltert weiterreicht: jest.json mit Codeframes und absoluten Testpfaden,
// status.json mit den geparsten Failures, den geaenderten Dateien jeder Runde und den
// Review-Findings samt test-scoped Fundstellen. constitution.md 8.2 G4 haelt diese Rohform
// bewusst beim Orchestrator - wer die Quelle lesen darf, umgeht assertNoTestLeak,
// parseJestFailures und formatRoundsHistory auf einmal und braucht das Aufbereitete nicht mehr.
// Gesperrt fuer JEDE geltende Rolle, wie Steuerdatei- und Worktree-Tabu: der reviewer faende
// dort die Urteile der vorherigen Runden (lastReview.findings, rejected-review.json), die sein
// eigenes vorpraegen, und der test-author die Implementierung, gegen die er seine Tests nach 2.1
// gerade nicht korrigieren soll.
//
// Zwei Formen, aus demselben Grund getrennt wie CONTROL_FILE_TABOO/CONTROL_VERB_TABOO - die eine
// zielt auf Pfade, die andere auf Kommandos:
// - Pfad-Form: verankert, trifft auch das Verzeichnis selbst ohne nachfolgende Datei ("(/|$)"),
//   denn Grep/Glob bekommen eine Suchwurzel uebergeben, keinen Dateipfad.
// - Kommando-Form: unverankert gegen die ganze Zeile. Ein Pfad steht dort in Anfuehrungszeichen,
//   hinter einem `cd`, mit einem Glob oder in einem `node -e`-Schnipsel; eine tokenweise Pruefung
//   (wie extractTestReferences) liefe an `cat ".harness/runs/12/status.json"` vorbei, weil das
//   Anfuehrungszeichen die Verankerung bricht.
//
// Beide Formen kennen zwei Schreibungen des Weges dorthin. Vom Repo-Wurzelverzeichnis aus heisst
// er ".harness/runs/<issue>/…"; aus einem Worktree heraus (cwd = .harness/wt/<issue>) heisst er
// "../../runs/<issue>/…" und kommt ohne das Wort ".harness" aus. Die zweite Form ist keine
// Verschleierung, sondern die natuerliche Schreibweise am Arbeitsort der Rollen - an der
// Gegenprobe zu diesem Change aufgefallen, nachdem die erste Fassung nur die erste Form kannte.
const RUN_STATE_PATH = /(^|\/)(?:\.harness\/|(?:\.\.\/)+)runs(\/|$)/
const RUN_STATE_TABOO = /\.harness\/runs\b|(?:^|[\s'"(;&|=])(?:\.\.\/)+runs\b/
// Ausnahme fuer den Rollenmarker, und nur fuer die Pfad-Form: constitution.md 8.3 verlangt seine
// Pruefung, BEVOR irgendein Werkzeugaufruf fuer den anstehenden Schritt erfolgt - zu dem
// Zeitpunkt traegt er noch die Rolle des vorigen Schritts, und der soleActiveRole-Fallback wendet
// sie auf die Sitzung selbst an. Eine pauschale Sperre blockte also genau die Pruefung, die den
// Rollenfehler auffangen soll. Preisgeben kann der Marker nichts: ein Wort aus einer festen
// Rollenmenge. Geschrieben bleibt er durch CONTROL_FILE_TABOO gesperrt - deshalb keine Ausnahme
// in der Kommando-Form: einem Kommandotext ist nicht anzusehen, ob er liest oder schreibt
// (`sed -i`, `>`, `truncate`, `chmod`).
const ROLE_MARKER_PATH = /(^|\/)(?:\.harness\/|(?:\.\.\/)+)runs\/[^/]+\/active-role$/
// ---------------------------------------------------------------------------------------------

const norm = (p: string): string => p.replace(/\\/g, '/')
// Der Verzeichnisname matcht auch ohne nachfolgenden Pfad ("(/|$)"): Grep/Glob bekommen ein
// Verzeichnis als Suchwurzel uebergeben ("path": "src"), nicht nur Dateipfade.
export const isTest = (p: string): boolean => { const n = norm(p); return /(^|\/)tests(\/|$)/.test(n) || /\.test\.tsx?$/.test(n) }
export const isSrc = (p: string): boolean => { const n = norm(p); return SRC_DIRS.some(d => new RegExp(`(^|/)${d}(/|$)`).test(n)) }
// Bewusst kein Anbau an isTest(): das Run-Verzeichnis enthaelt keine Tests, sondern deren
// Ausgabe, und es ist aus einem anderen Grund gesperrt. Eine gemeinsame Funktion haette auch die
// Meldungen mitverdorben - "darf Testdateien nicht lesen/aendern" fuer ein status.json schickt
// den Aufrufer an die falsche Stelle. Genau daran ist die erste Fassung dieser Sperre (#21)
// gescheitert: sie blockte jest.json, aber als Testrunner-Aufruf.
export const isRunState = (p: string): boolean => { const n = norm(p); return RUN_STATE_PATH.test(n) && !ROLE_MARKER_PATH.test(n) }
// Eine Meldung fuer alle drei Wege; `wo` benennt die Herkunft der Angabe (Suchziel,
// Bash-Referenz), wie bei den uebrigen Meldungen des Guards.
const runStateBlock = (wo?: string): GuardResult => ({
  blocked: true,
  message: `Blockiert: der Run-State (.harness/runs/) ist für diese Rolle tabu${wo ? ` (${wo})` : ''} — er trägt die ungefilterte Gate-Ausgabe samt Testpfaden und die Findings der vorherigen Runden. Was eine Rolle davon braucht, reicht der Orchestrator gefiltert weiter.`,
})

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

// runsDir und wtDir sind injizierbar (Review-Befund Runde 2: Testisolation) - Tests fuer den
// Fallback duerfen nicht gegen die echten .harness/runs/ und .harness/wt/ pruefen, die durch
// parallele Jest-Worker (andere Testdateien) oder liegen gebliebene echte Runs unkontrollierten
// Zustand enthalten koennen.
export function makeDeps(runsDir: string, wtDir: string): Deps {
  const activeRolePath = (issue: string) => join(runsDir, issue, 'active-role')
  const readRoleForIssue = (issue: string): string => {
    const p = activeRolePath(issue)
    return existsSync(p) ? readFileSync(p, 'utf8').trim() : ''
  }
  // Ein abgebrochener/liegen gelassener Run haelt seinen active-role-Marker fuer immer, da
  // .harness/runs/ nie aufgeraeumt wird. Ohne diesen Filter wuerde ein toter Marker entweder
  // faelschlich als "die eine aktive Rolle" gelten (Fehlblock fuer unbeteiligte Aufrufe) oder,
  // mit einem zweiten toten Marker, den Fallback dauerhaft und unbemerkt auf rollenlos zwingen.
  // Zweite Bedingung (add-harness-pause/design.md D5): der Worktree als Lebenszeichen. Phase und
  // Marker bleiben liegen, wenn ein Lauf abgebrochen wird - der Worktree ist das einzige
  // Artefakt mit sauberem Lebenszyklus (`start` legt ihn an, `cleanup` entfernt ihn). Ein Marker
  // ohne Worktree gehoert zu einem Lauf, der nichts hat, woran er arbeiten koennte, und darf
  // keinem fremden Aufruf eine Rolle aufzwingen. Beobachtet an einem liegen gebliebenen
  // Handversuch, der jeder Sitzung ohne zuordenbares Issue die Rolle `implementer` gab.
  const isRunActive = (issue: string): boolean => {
    if (!existsSync(join(wtDir, issue))) return false
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
export const defaultDeps: Deps = makeDeps(join('.harness', 'runs'), join('.harness', 'wt'))

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

  // 0) Die Verben, die den Rollenmarker setzen (add-harness-pause/design.md D6). Steht VOR allen
  //    uebrigen Regeln: `pnpm harness pause 12 "jest.config kaputt"` traefe sonst zuerst die
  //    Sperre fuer Testsuite-Aufrufe (\bjest\b matcht auch in einem Begruendungstext) und wuerde
  //    mit einer Begruendung abgelehnt, die den Aufrufer in die Irre schickt.
  //    Bewusst fuer JEDE Rolle, auch den reviewer - wer pausieren kann, schaltet die Sperre ab,
  //    unter der er selbst steht: `pause` schreibt `none` in den Marker, danach gilt fuer ihn
  //    keine Regel mehr.
  //    Der Guard kann nicht unterscheiden, ob ein Aufruf von der orchestrierenden Sitzung oder
  //    von einem Subagenten kommt. Die Regel trifft deshalb notwendig beide: entweder darf kein
  //    Agent pausieren oder jeder. Der vorgesehene Kanal ist die Eingabe des Menschen, die den
  //    Guard nicht durchlaeuft (an Issue #23 nachgemessen); die Sitzung fordert das Pausieren an,
  //    statt es auszufuehren - so steht es in AGENTS.md und in der Skill-Datei.
  //    `resume` bleibt trotzdem erreichbar: waehrend einer Pause traegt der Marker `none`, fuer
  //    den Aufruf gilt also keine Rolle. Kein Loch, sondern die Gegenrichtung - resume stellt
  //    eine Rolle wieder her, statt eine abzuschalten.
  //    Der Worktree steht in derselben Regel, aus demselben Grund und ebenfalls fuer jede Rolle:
  //    seit die Rollenermittlung ihn als Lebenszeichen liest, entwaffnet sich, wer ihn entfernt.
  if (cmd && role !== '' && role !== 'none') {
    // Die Steuerdateien selbst stehen hier und nicht mehr im Block fuer implementer/test-author:
    // die Spec verweist fuer das Verb-Tabu auf "dieselbe Begruendung wie beim Zugriff auf die
    // Steuerdateien" - dann muss dieser Zugriff auch fuer dieselbe Rollenmenge gesperrt sein.
    // Sonst koennte der reviewer sich in einem Schritt entwaffnen (`echo none > ...active-role`)
    // und danach greift fuer ihn keine Regel mehr, das Verb-Tabu eingeschlossen (Review-Befund).
    if (CONTROL_FILE_TABOO.test(norm(cmd)))
      return { blocked: true, message: 'Blockiert: die Harness-Steuerdateien sind für diese Rolle tabu.' }
    if (CONTROL_VERB_TABOO.test(norm(cmd)))
      return { blocked: true, message: 'Blockiert: die Harness-Steuerdateien sind für diese Rolle tabu — pausieren und fortsetzen ist Sache des Menschen (`pnpm harness pause <issue> "<grund>"` in seiner eigenen Shell).' }
    if (WORKTREE_TABOO.test(norm(cmd)))
      return { blocked: true, message: 'Blockiert: der Worktree ist für diese Rolle tabu — die Rollenermittlung liest seine Existenz als Lebenszeichen des Laufs.' }
    // Der Run-State steht hier und nicht im Block fuer implementer/test-author, aus zwei
    // Gruenden. Erstens gilt er fuer jede Rolle (siehe RUN_STATE_TABOO). Zweitens die
    // Reihenfolge: stuende er weiter unten, behielte `cat .harness/runs/<i>/jest.json` seine
    // alte Begruendung "implementer fuehrt die Testsuite nicht selbst aus" - TEST_RUNNER_COMMANDS
    // matcht zufaellig auf den Dateinamen. Genau dieser Zufall trug den Test der ersten Fassung
    // (#21) und liess die Luecke als geschlossen erscheinen. Hinter den beiden Tabus darueber
    // bleibt sie, damit Rollenmarker und Pause-Verben ihre genaueren Meldungen behalten.
    if (RUN_STATE_TABOO.test(norm(cmd))) return runStateBlock('Bash-Referenz')
  }

  // 1) Write/Edit/Read ueber file_path.
  if (path) {
    const isWrite = /Write|Edit/.test(tool)
    // Der Rollenmarker ist fuer JEDE Rolle unantastbar, nicht nur fuer die mit Schreibbereich -
    // ein Write darauf ist derselbe Selbstentwaffnungsschritt wie `echo none > ...` (Regel 0).
    if (isWrite && role !== '' && role !== 'none' && CONTROL_FILE_TABOO.test(norm(path)))
      return { blocked: true, message: 'Blockiert: die Harness-Steuerdateien sind für diese Rolle tabu.' }
    // Fuer jede Rolle und fuer Lesen wie Schreiben - der Weg ueber file_path war der einzige, den
    // die erste Fassung (#21) geschlossen hat. Der Rollenmarker faellt ueber isRunState heraus
    // (constitution.md 8.3); die Zeile darueber haelt ihn weiterhin gegen Schreiben.
    if (role !== '' && role !== 'none' && isRunState(path)) return runStateBlock()
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
  // 2a) Dieselbe Frage fuer den Run-State, aber fuer JEDE Rolle: die Pruefung unten gilt nur dem
  //     implementer, und fuer test-author und reviewer war das Suchwerkzeug damit der offene
  //     dritte Weg. Bekannte Grenze (design.md D5): eine Suche OHNE einschraenkenden Pfad erfasst
  //     den Run-State, ohne ihn zu nennen. Fuer den implementer ist sie durch die Whitelist unten
  //     bereits ausgeschlossen; fuer die beiden anderen Rollen liesse sie sich nur durch eine
  //     eigene Whitelist schliessen, und die des reviewers - er beurteilt den gesamten Diff -
  //     waere "alles". Eine Whitelist, die alles enthaelt, schraenkt nichts ein.
  if ((tool === 'Grep' || tool === 'Glob') && role !== '' && role !== 'none') {
    // Bei Glob ist "pattern" der Pfad-Glob, bei Grep der Regex-Suchbegriff (dort filtert "glob").
    const pathLike = [searchPath, searchGlob, tool === 'Glob' ? searchPattern : ''].filter(Boolean)
    if (pathLike.some(isRunState)) return runStateBlock('Suchziel')
  }

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
    if (CONTROL_FILE_TABOO.test(norm(cmd)))
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
      // Zweiter Kanal derselben Art: der volle Typecheck deckt tests/ mit ab und meldet
      // Fehler samt Quellzeile der Testdatei.
      if (TYPECHECK_COMMANDS.test(cmd) && !SRC_ONLY_TYPECHECK.test(cmd))
        return { blocked: true, message: 'Blockiert: implementer prüft Typen mit `pnpm typecheck:src` — der volle Typecheck schließt tests/ ein und gibt bei Fehlern Pfad, Symbolnamen und Quellzeile der Testdatei aus. Den vollen Lauf fährt das Gate.' }
    }
  }

  // Teilstring-Match bleibt (guard-inline-db-url/design.md D6): auch eine blosse Erwaehnung des
  // Migrationskommandos (Heredoc, echo, Commit-Nachricht) blockt. Die Unterscheidung
  // "Kommandoposition oder Zitat" hiesse Shell-Syntax parsen - ein Fehler dort waere fail-open an
  // einer Grenze, die constitution.md 5.1 dem Menschen vorbehaelt. Ausweg: --body-file / Write-Tool.
  if (MIGRATION_COMMANDS.test(cmd)) {
    const dbUrl = databaseUrlForCommand(cmd, process.env.DATABASE_URL)
    if (dbUrl === undefined)
      return { blocked: true, message: 'Blockiert: Migration — nicht sicher bestimmbar, welches DATABASE_URL das Kommando sieht (mehrere Nennungen oder unbekannte Form). Erkannt werden `DATABASE_URL=… <cmd>`, `env DATABASE_URL=… <cmd>` und `export DATABASE_URL=… && <cmd>`.' }
    if (!isEphemeralDbUrl(dbUrl))
      return { blocked: true, message: 'Blockiert: Migration nur gegen die ephemere Test-DB (file:…/test.db, :memory:, Server-URL auf localhost), nie gegen eine produktive Zielumgebung.' }
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

// Kein import.meta.url-Vergleich: guard.ts wird produktiv per node (ESM, Type-Stripping)
// ausgefuehrt, aber von
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
