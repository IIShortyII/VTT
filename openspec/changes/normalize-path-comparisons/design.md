## Context

Drei Stellen in `.harness/orchestrator.ts` vergleichen Pfade als Text:

- `removeUntrackedSourceDocs(src)` übergibt `src` als **Git-Pathspec** an
  `git ls-files --error-unmatch`. Git versteht dort keine Backslashes.
- `assertNoTestLeak(prompt, i, parts)` fragt, ob der Prompt eine Testdatei **nennt**. Quelle des
  Texts sind von Menschen geschriebene Dokumente: `proposal.md`, `design.md`, die
  `ort`-Angaben aus Reviewer-Findings.
- `parseJestFailures(i)` fragt dasselbe über die Gate-Ausgabe. Quelle ist Jest.

Alle drei bekommen ihre Pfade aus `join()` — unter Windows also mit Backslashes und relativ zum
Repo-Wurzelverzeichnis (`.harness\wt\<issue>\tests\x.test.ts`).

Gegengeprüft am Lauf zu #12: Jest nennt Testdateien **absolut**
(`C:\…\ACS_Homework\.harness\wt\12\tests\user-auth.integration.test.ts`), ebenfalls mit
Backslashes. Der relative Pfad ist darin als Suffix enthalten — deshalb funktioniert
`parseJestFailures` heute, obwohl es dieselbe Annahme trifft wie die beiden defekten Stellen.

`guard.ts` löst das Problem seit jeher richtig, mit `norm(p) = p.replace(/\\/g, '/')` vor jedem
Vergleich. `truncateAtTestReference` ebenfalls, mit `/tests[\\/][^\s:()]+/`. Das Wissen ist im
Repo vorhanden, nur nicht an den drei Stellen, um die es hier geht.

Motivation: siehe `proposal.md` — Why, und Issue #21 samt Kommentar. Verhalten: siehe
`specs/harness-path-matching/spec.md`.

## Goals / Non-Goals

**Goals:**
- Die Schutzabfrage vor dem Löschen wirkt.
- Eine Testdatei, die im Auftrag genannt wird, wird als Nennung erkannt — gleich in welcher
  Schreibweise.
- Beide Wächter beantworten diese Frage mit **demselben** Code.

**Non-Goals:**
- Keine Änderung an der **Wirkung** der Wächter. `assertNoTestLeak` bricht ab,
  `parseJestFailures` degradiert einen einzelnen Failure — das bleibt so.
- Keine Aufweichung. Der Erkenner ist strenger als der heutige Zustand, nie nachsichtiger.
- Keine allgemeine Pfad-Abstraktion für den Harness. Nur die drei benannten Stellen.
- Kein Quoting-Fix an `git worktree add` (eigener Befund, harness-intern konstruierter Pfad).

## Decisions

### D1 — Ein Erkenner, zwei Aufrufer

`nennt Text eine Testdatei?` wird zu einer Funktion, die beide Wächter benutzen. Heute steht
die Antwort zweimal im Code, einmal richtig und einmal falsch — und keine der beiden Stellen
weiß von der anderen.

Das ist dieselbe Begründung, aus der `readChangeSpec` in #22 zur einzigen Quelle beider
Prompt-Bauer wurde: zwei Antworten auf dieselbe Frage driften auseinander, und die Korrektur
an der einen Stelle zieht an der anderen vorbei. Bei einer Sicherheitsnaht (`constitution.md`
§2.2, §8.1) ist das der teuerste Ort für eine Dopplung.

Die Funktion liefert **welche** Datei genannt wurde, nicht nur ob — `assertNoTestLeak` braucht
den Namen für seine Meldung, `parseJestFailures` nur das Ob.

### D2 — Erkannt wird jede Form, in der eine Testdatei auftauchen kann

Erkannt wird jede Schreibweise — geprüft wird jeweils die **kürzeste**, weil jede längere auf
sie endet und darüber mitgefunden wird. Wie kurz das sein darf, hängt von der Datei ab:

| Datei | geprüfte Form | Beispiel |
|---|---|---|
| erkennbare Testdatei (`.test.ts(x)`, `.test.js(x)`) | bloßer Dateiname | `x.test.ts` |
| jede andere Datei unter `tests/` | worktree-relativer Pfad, beide Trennzeichen | `tests/.gitkeep`, `tests\.gitkeep` |

Dass ein absoluter Pfad über sein Suffix gefunden wird, ist genau der Umstand, der
`parseJestFailures` heute trägt — Jest gibt absolute Pfade aus. Dasselbe Argument gilt für jede
Zwischenlänge; es endet bei der geprüften Form.

**Die Unterscheidung stammt aus der Gegenprobe, nicht aus dem Entwurf.** Eine erste Fassung
prüfte für jede Datei den bloßen Namen. Am echten Material fiel sofort ein Fehlalarm an:
`listTestFiles` liefert auch `tests/.gitkeep`, und `.gitkeep` steht in der `proposal.md` von
`add-user-auth` (»`src/` enthält heute nur `.gitkeep`«). Das Argument für den bloßen Namen —
er sei charakteristisch und komme in Prosa nicht vor — gilt eben nur für Dateien, deren Name
sie als Test ausweist. Für Fixtures, Mocks und Platzhalter gilt es nicht, und für sie bleibt es
beim Pfad.

Eine erste Fassung führte alle Formen als Liste, um in der Meldung die spezifischste nennen zu
können. Eine Mutationsprobe hat sie als totes Gewicht nachgewiesen: kein Test wurde rot, als
die längeren Formen entfielen — sie ändern an der Erkennung nichts, nur an der Rückgabe, und
diese Verfeinerung war weder von einem Szenario verlangt noch von einem Test gedeckt. Sie ist
deshalb entfallen. Eine ungetestete Verhaltensverfeinerung an einer Sicherheitsnaht ist genau
das, was §8.1 aus dem Ermessen heraushalten will.

Der Preis ist benannt: die Fundstellenangabe sucht den Block, der den **Namen** enthält. Nennen
mehrere Blöcke ihn, wird der erste gemeldet. Das ist eine Auskunft über einen Block, der die
Nennung wirklich enthält — nur nicht zwingend über den einzigen.

**Der bloße Dateiname zählt mit.** In einer `design.md` steht `user-auth.integration.test.ts`,
nicht der volle Pfad — die naheliegendste Nennung wäre sonst die einzige, die durchginge. Und
sie ist keine harmlose: sie verrät, welche Testdatei existiert und wie das Verhalten geschnitten
ist, also genau das, was §2.2 dem implementer vorenthält.

Das Fehlalarmrisiko ist gering, aber nicht null: ein Dateiname ist ein kurzer Teilstring. Er
endet allerdings auf `.test.ts`/`.test.tsx`/`.unit.test.tsx` — Endungen, die in Prosa nicht
vorkommen. Und ein Fehlalarm ist hier der billige Fehler: er hält den Lauf an und benennt seit
#22 die Fundstelle, während ein übersehener Leak unbemerkt bleibt.

### D3 — Verglichen wird case-sensitiv

Windows-Dateisysteme unterscheiden Groß- und Kleinschreibung nicht, der Vergleich hier schon.
Ein Erkenner, der `README.md` und `readme.md` gleichsetzt, wäre auf einem Linux-Läufer falsch,
und die Konvention im Repo schreibt Testdateien ohnehin klein. Die Schreibweise zu normalisieren
hieße, eine plattformabhängige Annahme durch eine andere zu ersetzen.

### D4 — Pfadspezifikationen an Git tragen Forward-Slashes

`removeUntrackedSourceDocs` bildet den Pathspec mit `/`. Git akzeptiert Forward-Slashes auf
allen Plattformen; für **Pathspecs** — anders als für Verzeichnisargumente — sind sie die
einzige Form, die überall funktioniert. Zwei Zeilen darüber tut `sh('git add
openspec/changes/…')` das bereits, nur eben als Literal statt aus `join()`.

Die Alternative wäre, `src` gar nicht erst über `join()` zu bilden. Sie wird nicht gewählt,
weil `src` auch an `existsSync` und `rmSync` geht — dort ist die native Form richtig. Ein Pfad,
zwei Verwendungen, zwei Schreibweisen: die Umwandlung gehört an die Stelle, die sie braucht.

### D5 — Geprüft wird, was weitergereicht wird, nicht was zuerst gebildet wurde

In `parseJestFailures` stehen zwei Stufen. `truncateAtTestReference` schneidet die Ausgabe an
der ersten Zeile ab, die einen Codeframe oder `tests/`…/`tests\`… enthält; der Erkenner ist
die letzte Instanz danach. Entscheidend ist, **worauf** die letzte Instanz angewendet wird:
auf den Text, der tatsächlich beim implementer ankommt.

Das ist keine Formalie. Wird beim Kürzen nichts übrig gelassen — der Regelfall bei
`Cannot find module './x' from 'tests/y.test.ts'`, wo die Nennung in Zeile 0 steht —, greift
ein Rückfall auf die erste Zeile des Originals. Eine Prüfung, die nur den gekürzten Text
ansieht, prüft dann den leeren String und lässt anschließend den Rückfall ungeprüft passieren:
genau die Zeile, die sie verhindern sollte. Der Reviewer hat diesen Weg in Runde 1 gefunden;
er lag offen, weil eine frühere Fassung dieses Absatzes behauptete, eine Nennung mit
Pfadanteil sei „längst abgeschnitten, und das ist gut so".

Sie ist abgeschnitten — und kommt über den Rückfall zurück. Deshalb bildet der Code erst den
Kandidaten (gekürzt, sonst Rückfall) und prüft **ihn**.

Was der Erkenner hier gegenüber dem Abschneiden zusätzlich fängt, bleibt die Form **ohne**
Verzeichnis: der bloße Dateiname aus `Cannot find module './x' from 'auth-ui.unit.test.tsx'`.
Das Abschneiden erfasst sie nicht, weil sie kein Trennzeichen enthält. `spec.md` prüft beide
Formen in je einem Szenario.

### D6 — Die Sperre des Run-State liegt im Guard, nicht im Orchestrator

`.harness/runs/<issue>/` ist die Quelle, aus der der Orchestrator seine gefilterten Ausgaben
baut. Wer sie lesen darf, braucht das Gefilterte nicht — die Wächter über Auftrag und
Gate-Ausgabe schützten dann eine Tür, neben der ein offenes Fenster steht.

Die Regel gehört in `guard.ts`, weil sie einen **Werkzeugaufruf** betrifft und nicht das, was
der Orchestrator selbst weitergibt. `isTest()` deckt sie nicht ab: der Pfad heißt `runs`, nicht
`tests`, und eine Erweiterung von `isTest` wäre irreführend — das Run-Verzeichnis enthält keine
Tests, sondern deren Ausgabe. Deshalb ein eigenes Prädikat `isRunState` und eine eigene Regel.

Sie gilt für **beide** Rollen und lesend wie schreibend, und sie steht vor der
Rollenverzweigung: die Begründung ist für implementer und test-author dieselbe, und der
Run-State gehört keiner von beiden. Ohne aktive Rolle bleibt er lesbar — die orchestrierende
Sitzung arbeitet mit ihm, und der Mensch muss ihn einsehen können.

Die Umwege waren bereits zu (Grep/Glob über das Whitelisting der Quellpfade, Bash über
`CONTROL_FILE_TABOO` und die Schreibziel-Erkennung); offen war allein der direkte `Read`. Ein
Test hält jeden dieser Wege fest, damit die Sperre nicht an einer Stelle repariert und an der
nächsten vergessen wird.

### D7 — Die Konventions-Ausnahme aus #22 bleibt unangetastet

Sie beantwortet eine andere Frage: nicht „ist das eine Testdatei", sondern „ist dieser Inhalt
geheim". Sie greift auf dem Inhalts-Zweig und bleibt dort.

Für den Pfad-Zweig gilt sie nicht — und das ist Absicht. `AGENTS.md` nennt Testpfade als Muster
(`tests/<name>.unit.test.tsx`), aber keine **existierende** Testdatei beim Namen. Eine Nennung,
die auf eine reale Datei des Laufs passt, ist deshalb auch dann eine Preisgabe, wenn in den
Konventionen ein ähnliches Muster steht.
