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

Für jede Datei aus `listTestFiles` gilt als Nennung:

| Form | Beispiel |
|---|---|
| der Pfad, wie er vorliegt | `.harness\wt\12\tests\x.test.ts` |
| derselbe Pfad mit Forward-Slashes | `.harness/wt/12/tests/x.test.ts` |
| worktree-relativ, beide Schreibweisen | `tests/x.test.ts`, `tests\x.test.ts` |
| der bloße Dateiname | `x.test.ts` |

Der absolute Pfad braucht keinen eigenen Eintrag: er endet auf den repo-relativen und wird über
ihn erkannt — genau der Umstand, der `parseJestFailures` heute trägt.

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

### D5 — Die Konventions-Ausnahme aus #22 bleibt unangetastet

Sie beantwortet eine andere Frage: nicht „ist das eine Testdatei", sondern „ist dieser Inhalt
geheim". Sie greift auf dem Inhalts-Zweig und bleibt dort.

Für den Pfad-Zweig gilt sie nicht — und das ist Absicht. `AGENTS.md` nennt Testpfade als Muster
(`tests/<name>.unit.test.tsx`), aber keine **existierende** Testdatei beim Namen. Eine Nennung,
die auf eine reale Datei des Laufs passt, ist deshalb auch dann eine Preisgabe, wenn in den
Konventionen ein ähnliches Muster steht.
