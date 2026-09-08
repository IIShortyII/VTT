## Context

Der Orchestrator (`.harness/orchestrator.ts`) ist der deterministische Kern des Loops: ein
Zustandsautomat über `status.json` je Issue, dessen Übergänge in `next()` liegen. Jeder
Schrittwechsel läuft durch genau eine Funktion — `emit(issue, action, role)`, die den
`active-role`-Marker schreibt und die Aktion als JSON zurückgibt. Vier Schritte laufen daran
vorbei, weil sie keine Aktion emittieren, sondern ein Ergebnis feststellen: `confirmRed`,
`gate`, `cleanup` und — noch gar nicht existent — der Beginn der Spezifikation, der vor
`pnpm harness start` liegt.

Das Projekt-Board ist ein GitHub Project (v2) mit einem Single-Select-Feld „Status". Solche
Felder werden nicht über die REST-API gesetzt, sondern über eine GraphQL-Mutation mit drei
IDs: Projekt, Feld, Option. Das Item-Handle eines Issues ist eine vierte, pro Issue
verschiedene ID und muss aufgelöst werden.

Motivation: siehe `proposal.md` — Why, und Issue #26. Verhalten: siehe
`specs/harness-board-status/spec.md`. Die fünf offenen Fragen des Issues sind mit dem Menschen
geklärt; die Entscheidungen stehen unten als D2–D6.

## Goals / Non-Goals

**Goals:**
- Der Board-Status folgt dem Loop ohne Zutun eines Menschen und ohne dass eine Stelle
  vergessen wird.
- Der deterministische Kern bleibt unberührt: dieselbe Aktion, derselbe Run-State, derselbe
  Exit-Code — ob das Board antwortet oder nicht.
- Die Grenze des Schreibzugriffs ist Mechanik, nicht Prosa.

**Non-Goals:**
- Keine Abbildung von Feldern jenseits des Status (Assignee, Iteration, Größe).
- Keine Gegenrichtung: der Harness liest das Board nie, um daraus einen Schritt abzuleiten.
  Wer die Spalte von Hand verschiebt, ändert am Lauf nichts — und soll das auch nicht können.
- Keine Wiederholungslogik. Ein fehlgeschlagener Statuswechsel wird nicht nachgeholt; der
  nächste Schritt setzt den dann gültigen Status ohnehin neu.

## Decisions

### D1 — Eigenes Modul, eine wirkende Funktion, die nie wirft

`.harness/board.ts` hält die ID-Tabelle, die GraphQL-Aufrufe und die Fehlerkapselung.
Exportiert wird im Kern:

```ts
export type BoardStatus = 'backlog' | 'spec' | 'test-rot' | 'implementierung'
                        | 'gate-review' | 'app-test' | 'fertig'
export function setBoardStatus(issue: string, status: string, run = ghRunner): BoardResult
```

`setBoardStatus` fängt jeden Fehler ab und gibt `{ ok, reason? }` zurück — Aufrufer im
Orchestrator werten das Ergebnis nicht aus, sondern ignorieren es bewusst.

Verworfene Alternative: alles in `orchestrator.ts`. Der Kern besitzt laut `constitution.md`
§8.1 die harten Invarianten; ein Beiwerk, das ausdrücklich fehlschlagen darf, gehört nicht in
dieselbe Datei. Die Trennung macht auch im Test sichtbar, dass ein kaputtes Board den
Automaten nicht berührt.

Der dritte Parameter (`run`) ist der Ausführungskanal und existiert allein zur Prüfbarkeit:
ein Test übergibt einen Stellvertreter, der die Argumente festhält, statt `gh` zu starten. Er
hat einen Vorgabewert, damit kein Aufrufer ihn kennen muss.

Dasselbe Muster bekommen `confirmRed`, `gate` und `cleanup` im Orchestrator — je ein
Vorgabe-Parameter für ihren Ausführungskanal. Sie starten heute unbedingt `pnpm`, `git` und
`gh` als Unterprozesse, weshalb bisher kein Test sie überhaupt aufrufen konnte: die drei
Szenarien „Der Gate-Start setzt Gate + Review", „Bestätigtes Rot setzt Test rot" und „Rot aus
dem falschen Grund schaltet das Board nicht weiter" wären sonst nicht prüfbar, ohne echte
Werkzeuge in einem Wegwerf-Worktree laufen zu lassen. Rein additiv: kein Aufrufer im Dispatch
ändert sich, das Laufzeitverhalten bleibt gleich.

### D2 — Der Trichter: eine Tabelle in `emit()`, drei Sonderfälle daneben

Zwei der sieben Statuswerte hängen an einer emittierten Aktion:

| Aktion | Status |
|---|---|
| `invoke-implementer` | Implementierung |
| `present-app-review` | App-Test (Mensch) |

Beide werden an je **zwei** Stellen emittiert (`next()` und `reworkTo` für die Implementierung;
`next()` in zwei Zweigen für den App-Test). Eine Tabelle in `emit()` deckt alle vier ab und
kann keine übersehen — genau dafür ist `emit()` der Trichter, und es setzt dort schon heute den
`active-role`-Marker.

Verworfene Alternative: an jeder der vier Stellen ein eigener Aufruf. Das hätte den
Nacharbeit-Pfad (`reworkTo`) mit hoher Wahrscheinlichkeit vergessen — genau den Pfad, den man
auf dem Board am dringendsten sehen will.

Die übrigen drei Werte hängen nicht an einer Aktion, sondern an einer Feststellung, und werden
dort einzeln gesetzt: `confirmRed` (nur im Zweig `red === true`, §3.1), `gate` (erste Zeile,
siehe D3) und `cleanup` (siehe D4). „Backlog" setzt niemand — es ist der Ausgangszustand des
Boards; die Option bleibt nur in der Tabelle, damit eine Korrektur von Hand über dasselbe Verb
läuft.

Der Beginn der Spezifikation ist der einzige Statuswechsel ohne Automaten: er passiert, bevor
`pnpm harness start` das Issue überhaupt kennt. Dafür das Verb
`pnpm harness board <issue> <status>`, das keinen Run-State liest und keinen anlegt. Verworfen:
den Propose-Skill den Status setzen zu lassen — er ist eingespieltes Fremdmaterial
(`openspec init --tools claude` überschreibt ihn) und kennt die Issue-Nummer nicht.

### D3 — „Gate + Review" beginnt beim Gate, nicht beim Reviewer

Die Spalte nennt beides, das Gate läuft zuerst und in jeder Nacharbeit-Runde erneut. Wird der
Status erst beim Reviewer gesetzt, steht ein Issue jede Gate-Runde sichtbar auf
„Implementierung", obwohl der Implementer längst fertig ist und nur noch Typecheck, Lint und
Jest laufen. Der Status wird deshalb als erste Anweisung in `gate()` gesetzt, vor allen
Werkzeugaufrufen.

Folge, die ausdrücklich gewollt ist: Bei roter Nacharbeit pendelt das Board sichtbar zwischen
„Implementierung" und „Gate + Review". Das ist der tatsächliche Verlauf, und wer aufs Board
schaut, soll ihn sehen. Verworfen: die Spalte in zwei Optionen aufzuteilen — ein Eingriff ins
Board-Schema, der über den Zuschnitt des Issues hinausgeht.

### D4 — „Fertig" hängt am Aufräumen, mit Gegenprobe am Issue-Zustand

Gemergt wird ausschließlich vom Menschen (`constitution.md` §5.1); der Orchestrator erfährt vom
Merge nichts. `pnpm harness cleanup <issue>` ist die einzige Harness-Aktion nach dem Merge und
laut `AGENTS.md` ohnehin vorgesehen — dort wird „Fertig" gesetzt.

Weil `cleanup` auch auf einem archivierten, aber noch nicht gemergten Lauf laufen kann, fragt
es vorher den Zustand des Issues ab und setzt „Fertig" nur, wenn das Issue geschlossen ist.
Ein `Closes #<n>` im PR schließt es beim Merge; der Issue-Zustand ist damit der genaueste
Zeuge, den der Harness ohne zusätzliche Berechtigung erreicht. Schlägt die Abfrage fehl, gilt
dasselbe wie für jeden anderen Board-Fehler (D6): Meldung, Protokoll, weiterlaufen — kein
„Fertig" auf Verdacht.

Verworfen: ein GitHub-Workflow auf `issues: closed`. Er wäre lückenlos und bräuchte keinen
Agentenschritt, aber das `GITHUB_TOKEN` einer Action darf Projects-v2-Felder nicht schreiben.
Nötig wäre ein langlebiges PAT mit `project`-Scope als Repo-Secret — eine Dauer-Credential im
Repo für eine Spaltenfarbe, gegen den Geist von §6.2, dazu eine CI-Änderung, die nach §1.4
nicht in einen Harness-PR gehört. Bleibt als Nachfolger möglich, falls sich das Vergessen von
`cleanup` als echtes Problem zeigt.

Verworfen auch: „Fertig" beim Öffnen des PR. Der PR kann abgelehnt werden oder tagelang offen
liegen; das Board würde behaupten, was nicht stimmt.

### D5 — Item-Handle bei jedem Aufruf auflösen, kein Cache

Zwei GraphQL-Aufrufe je Statuswechsel: erst das Item-Handle des Issues im Projekt auflösen,
dann die Feldmutation.

```graphql
query($owner:String!,$repo:String!,$number:Int!) {
  repository(owner:$owner, name:$repo) {
    issue(number:$number) { projectItems(first:20) { nodes { id project { id } } } }
  }
}
```

Aus den Knoten wird der genommen, dessen `project.id` der hinterlegten Projekt-ID entspricht —
ein Issue kann auf mehreren Boards liegen. Findet sich keiner, endet der Vorgang ohne
Schreibversuch (Spec: „Ein fehlendes Item wird gemeldet, ohne Schreibversuch").

```graphql
mutation($project:ID!,$item:ID!,$field:ID!,$option:String!) {
  updateProjectV2ItemFieldValue(input:{
    projectId:$project, itemId:$item, fieldId:$field,
    value:{ singleSelectOptionId:$option }
  }) { projectV2Item { id } }
}
```

`projectId` und `fieldId` stammen dabei immer aus den Konstanten des Moduls, nie aus einem
Aufrufer-Argument — das ist die Grenze aus der Spec als Mechanik. Ebenso die Option: der
Aufrufer nennt ein Statuswort, das über die Tabelle in eine Option-ID übersetzt wird; ein
unbekanntes Wort führt zu keinem Aufruf, statt eine fremde ID durchzureichen.

Kein Cache des Item-Handles: der Zeitgewinn wäre ein Roundtrip von einigen hundert
Millisekunden gegenüber einem Rollenaufruf von Minuten, der Preis ein veralteter Handle,
falls jemand das Item entfernt und neu anlegt.

Aufgerufen wird `gh` über `execFileSync` mit Argumentliste — nicht über eine Shell-Zeile. Die
GraphQL-Texte enthalten Anführungszeichen, geschweifte Klammern und Zeilenumbrüche; jede
Shell-Zitierung davon wäre eine Fehlerquelle, und unter Windows eine andere als unter Linux.

### D6 — Laut, aber folgenlos

Der Aufruf läuft synchron mit `timeout: 10_000`. Schlägt er fehl — kein `gh`, fehlender
`project`-Scope, abgelaufenes Token, Netzwerk, fehlendes Item, unbekannter Status —, dann:

- eine Zeile auf `stderr`, mit `[board]` präfigiert,
- eine Zeile mit Zeitstempel in `.harness/runs/<issue>/board.log` (Verzeichnis wird bei Bedarf
  angelegt — beim Status „Spec" existiert es noch nicht),
- Rückgabe `{ ok: false, reason }`, die kein Aufrufer auswertet.

Exit-Code, emittierte Aktion, `active-role` und `status.json` bleiben unberührt. Synchron statt
abgesetzt, weil ein losgelöster Prozess weder Ergebnis noch Protokoll liefert und ein hängender
Aufruf unsichtbar bliebe; der Timeout deckelt den Schaden auf zehn Sekunden je Schritt.

Erfolgreiche Wechsel werden ebenfalls protokolliert — dieselbe Zeile, anderes Verdikt. Das
Log ist damit die Antwort auf „warum steht das Board falsch", ohne dass jemand den Lauf
wiederholen muss.

### D7 — Kill-Switch `HARNESS_BOARD=off`

`setBoardStatus` prüft als Allererstes `process.env.HARNESS_BOARD`. Steht es auf `off`,
passiert nichts — kein Aufruf, kein Log, keine Meldung.

Das ist nicht nur Bequemlichkeit: `.harness/tests/orchestrator.test.ts` ruft `next()` in
mehreren Tests direkt auf. Ohne Schalter würde jeder dieser Tests echte `gh`-Aufrufe gegen das
Board absetzen und den Status fremder Issues verstellen — mit erfundenen Issue-Nummern wie
`__orch_test_3__`, deren Auflösung fehlschlägt, aber eben erst nach einem Netzwerk-Roundtrip.
Die Harness-Jest-Config setzt den Schalter deshalb über `setupFiles`. Für den Menschen ist er
zugleich der Notausschalter, wenn das Board klemmt.

### D8 — IDs im Code, neben dem Kommentar, der sie erklärt

Projekt-ID, Feld-ID, die sieben Option-IDs sowie Owner und Repository stehen als Konstanten in
`board.ts`. Sie sind nicht geheim, ändern sich praktisch nie und gehören zusammen. Verworfen:
eine `board.json` — eine Datei mehr, ein Ladepfad mehr, eine Fehlerquelle mehr, für Werte, die
sich nur ändern, wenn jemand das Board umbaut. Tut er das, meldet sich der Fehlschlag laut
(D6), und die Korrektur ist eine Zeile.

## Risks / Trade-offs

- **Jemand baut die Spalte um, die IDs veralten** → Der Fehlschlag ist laut (stderr + Log),
  nicht still; der Lauf geht weiter. Kosten: eine Zeile im Modul.
- **Mehr Statuswechsel je Issue als bisher** (Pendeln zwischen Implementierung und
  Gate + Review) → Gewollt, siehe D3. Wer nur den groben Stand sehen will, sieht ihn auch bei
  jedem Zwischenstand richtig.
- **`cleanup` wird vergessen, „Fertig" bleibt aus** → Das Board bleibt auf „App-Test (Mensch)"
  stehen. Kein Schaden am Lauf, und das Issue selbst ist geschlossen — die Wahrheit ist also
  weiterhin an einer Stelle sichtbar. Nachfolger: D4, Absatz zum Workflow.
- **Zwei zusätzliche Netzwerk-Roundtrips je Schritt** → Gegenüber einem Rollenaufruf von
  Minuten vernachlässigbar; der Timeout deckelt den Ausreißer.
- **`emit()` bekommt einen zweiten Seiteneffekt** → Es hat bereits einen (`active-role`), und
  beide sind derselben Art: eine Projektion des Schrittwechsels nach außen. Die Alternative
  (D2) wäre fehleranfälliger.
- **Der Kill-Switch könnte versehentlich gesetzt bleiben** → Dann schweigt das Board
  vollständig; erkennbar daran, dass `board.log` leer bleibt. Bewusst kein „ich bin
  abgeschaltet"-Rauschen bei jedem Schritt: der Schalter existiert vor allem für die Tests,
  die sonst hunderte solcher Zeilen produzieren würden.

## Migration Plan

Keine. Rein additiv: ein neues Modul, ein neues Verb, fünf Aufrufstellen, ein Schalter.
Rollback ist das Zurücknehmen des Commits; bis dahin genügt `HARNESS_BOARD=off`, um den
Zustand vor diesem Change herzustellen. Bestehende Läufe unter `.harness/runs/` sind nicht
betroffen — das Board-Feature liest den Run-State nicht.
