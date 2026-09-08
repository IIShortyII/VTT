// Der Board-Status des laufenden Issues auf dem GitHub-Project "VTT".
//
// Bewusst getrennt vom Orchestrator (design.md D1): der deterministische Kern besitzt die
// harten Invarianten (constitution.md §8.1), dieses Modul ein Beiwerk, das ausdruecklich
// fehlschlagen darf. NICHTS hier wirft, und kein Aufrufer wertet das Ergebnis aus - ein nicht
// erreichbares Board, ein abgelaufenes Token oder ein fehlendes Item duerfen den Lauf weder
// anhalten noch seinen Zustand veraendern.
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// IDs des Projects "VTT" (Project 3) und seines Single-Select-Felds "Status". Nicht geheim,
// aendern sich nur, wenn jemand das Board umbaut - dann meldet sich der Fehlschlag laut (D6),
// und die Korrektur ist eine Zeile. Bewusst im Code statt in einer Konfigurationsdatei (D8).
// Auslesbar mit: gh project field-list 3 --owner IIShortyII --format json
export const BOARD = {
  owner: 'IIShortyII',
  repo: 'VTT',
  projectId: 'PVT_kwHOBMGBxM4Bit4v',
  statusFieldId: 'PVTSSF_lAHOBMGBxM4Bit4vzhhk2Iw',
  options: {
    backlog: '57f85ab8',
    spec: 'c56ebbef',
    'test-rot': '38ef1192',
    implementierung: '4daed554',
    'gate-review': '0e93c3b2',
    'app-test': 'b42fa494',
    fertig: 'd8b03fa1',
  },
} as const

export type BoardStatus = keyof typeof BOARD.options
export type GhRunner = (args: string[]) => { ok: boolean; out: string }
export type BoardResult = { ok: boolean; reason?: string }

const GH_TIMEOUT_MS = 10_000

// Zwei Aufrufe je Statuswechsel (design.md D5). Das Item-Handle wird bei jedem Wechsel neu
// aufgeloest: der Zeitgewinn eines Caches waere ein Roundtrip gegenueber einem Rollenaufruf von
// Minuten, der Preis ein veralteter Handle, wenn jemand das Item entfernt und neu anlegt.
const ITEM_QUERY =
  'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo)' +
  '{issue(number:$number){projectItems(first:20){nodes{id project{id}}}}}}'
const SET_STATUS_MUTATION =
  'mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue' +
  '(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}})' +
  '{projectV2Item{id}}}'

// Argumentliste statt Shell-Zeile: die GraphQL-Texte enthalten Anfuehrungszeichen, geschweifte
// Klammern und Doppelpunkte - jede Shell-Zitierung davon waere eine Fehlerquelle, und unter
// Windows eine andere als unter Linux.
function ghRunner(args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS, windowsHide: true }) }
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, out: (err.stderr ?? err.message ?? String(e)).trim() }
  }
}

// Eigene Kopie des Pfadhelfers statt eines Imports aus orchestrator.ts: der Orchestrator
// importiert dieses Modul, ein Rueckimport waere ein Zyklus.
const boardLogPath = (issue: string) => join('.harness', 'runs', issue, 'board.log')

// Laut, aber folgenlos (design.md D6): jeder Versuch landet mit Zeitstempel im Run-Verzeichnis,
// jeder Fehlschlag zusaetzlich auf stderr. Ein stumm gestorbenes Board ist schlechter als gar
// keins - man vertraut dann einem Stand, der seit mehreren Schritten falsch ist.
// `leise` unterscheidet den Fehlschlag von der bewussten Enthaltung: dass ein Issue noch offen
// ist, ist kein Defekt und gehoert ins Protokoll, aber nicht als Warnung auf stderr.
function report(issue: string, status: string, ok: boolean, reason?: string, leise = false): BoardResult {
  const zeile = `[${new Date().toISOString()}] #${issue} ${status}: ${ok ? 'gesetzt' : `${leise ? 'uebersprungen' : 'fehlgeschlagen'} — ${reason}`}`
  try {
    mkdirSync(join('.harness', 'runs', issue), { recursive: true })
    appendFileSync(boardLogPath(issue), `${zeile}\n`)
  } catch {
    // Selbst ein nicht schreibbares Log darf den Lauf nicht anhalten.
  }
  if (!ok && !leise) console.error(`[board] #${issue} ${status}: ${reason}`)
  return ok ? { ok } : { ok, reason }
}

function abgeschaltet(): boolean {
  return process.env.HARNESS_BOARD === 'off'
}

// Erfundene Issue-Bezeichner (Testlaeufe, Tippfehler) fallen hier heraus, bevor irgendein
// Prozess startet: die GraphQL-Abfrage erwartet eine Zahl, und ein Netzwerk-Roundtrip nur um
// zu erfahren, dass "__orch_test_3__" kein Issue ist, waere Verschwendung.
function issueNummer(issue: string): number | undefined {
  return /^\d+$/.test(issue) ? Number(issue) : undefined
}

function itemHandle(issue: string, nummer: number, run: GhRunner): { id?: string; reason?: string } {
  const r = run(['api', 'graphql',
    '-f', `query=${ITEM_QUERY}`,
    '-f', `owner=${BOARD.owner}`,
    '-f', `repo=${BOARD.repo}`,
    '-F', `number=${nummer}`])
  if (!r.ok) return { reason: `Board nicht erreichbar (${erstezeile(r.out)})` }
  try {
    const nodes = JSON.parse(r.out)?.data?.repository?.issue?.projectItems?.nodes ?? []
    // Ein Issue kann auf mehreren Boards liegen - nur der Knoten dieses Projekts zaehlt.
    const item = (nodes as { id: string; project?: { id?: string } }[]).find(n => n.project?.id === BOARD.projectId)
    return item ? { id: item.id } : { reason: 'kein Item in diesem Projekt' }
  } catch {
    return { reason: 'Antwort des Boards nicht auswertbar' }
  }
}

const erstezeile = (s: string) => (s.split('\n').find(l => l.trim().length > 0) ?? '').trim().slice(0, 200)

/**
 * Setzt den Status des Issues auf dem Board. Wirft nie; das Ergebnis ist zur Information da,
 * nicht zur Steuerung. Der Schreibzugriff bleibt auf das Statusfeld eines BEREITS vorhandenen
 * Items begrenzt: Projekt- und Feld-ID stammen aus den Konstanten oben, die Option aus der
 * Tabelle - kein Wert davon aus einem Aufrufer-Argument, und kein Aufruf legt ein Item an.
 */
export function setBoardStatus(issue: string, status: string, run: GhRunner = ghRunner): BoardResult {
  if (abgeschaltet()) return { ok: false, reason: 'abgeschaltet' }

  const option = (BOARD.options as Record<string, string | undefined>)[status]
  if (!option) return report(issue, status, false, 'unbekannter Status')

  const nummer = issueNummer(issue)
  if (nummer === undefined) return report(issue, status, false, 'keine Issue-Nummer')

  const item = itemHandle(issue, nummer, run)
  if (!item.id) return report(issue, status, false, item.reason)

  const r = run(['api', 'graphql',
    '-f', `query=${SET_STATUS_MUTATION}`,
    '-f', `project=${BOARD.projectId}`,
    '-f', `item=${item.id}`,
    '-f', `field=${BOARD.statusFieldId}`,
    '-f', `option=${option}`])
  return r.ok ? report(issue, status, true) : report(issue, status, false, `Schreibzugriff abgelehnt (${erstezeile(r.out)})`)
}

/**
 * "Fertig" haengt am Merge, den ausschliesslich ein Mensch ausloest (constitution.md §5.1) und
 * von dem der Orchestrator nichts erfaehrt. `cleanup` laeuft laut AGENTS.md direkt danach und
 * ist die naechstbeste Stelle - aber es kann auch auf einem archivierten, noch nicht gemergten
 * Lauf laufen. Der Zustand des Issues ist die Gegenprobe: `Closes #<n>` schliesst es beim
 * Merge (design.md D4). Kein "Fertig" auf Verdacht.
 */
export function setBoardStatusIfIssueClosed(issue: string, run: GhRunner = ghRunner): BoardResult {
  if (abgeschaltet()) return { ok: false, reason: 'abgeschaltet' }

  const nummer = issueNummer(issue)
  if (nummer === undefined) return report(issue, 'fertig', false, 'keine Issue-Nummer')

  const r = run(['issue', 'view', String(nummer), '--repo', `${BOARD.owner}/${BOARD.repo}`, '--json', 'state'])
  if (!r.ok) return report(issue, 'fertig', false, `Issue-Zustand nicht abrufbar (${erstezeile(r.out)})`)
  let state: string
  try {
    state = String(JSON.parse(r.out)?.state ?? '')
  } catch {
    return report(issue, 'fertig', false, 'Issue-Zustand nicht auswertbar')
  }
  // Kein Fehlschlag, sondern eine bewusste Enthaltung: der PR ist noch nicht gemergt.
  if (state.toUpperCase() !== 'CLOSED') return report(issue, 'fertig', false, 'Issue noch offen', true)

  return setBoardStatus(issue, 'fertig', run)
}
