## Context

`.harness/guard.ts` entscheidet vor jedem Werkzeugaufruf, was die geltende Rolle darf. Seine
Regeln sind an drei Angriffspunkten aufgebaut, weil ein Werkzeug eine Datei auf drei Arten
adressiert: über `file_path` (Read/Write/Edit), über eine Kommandozeile (Bash) und über eine
Suchwurzel samt Muster (Grep/Glob). Für Testdateien sind alle drei geschlossen. Für den
Run-State ist keiner geschlossen.

Der erste Anlauf dieser Sperre entstand in #21 und wurde nach dem dritten Review wieder
herausgelöst: er schloss nur Weg 1, und sein Test war **durch einen Zufall** grün — geblockt
wurde nicht der Run-State, sondern der Dateiname `jest.json` durch `TEST_RUNNER_COMMANDS`. Das
ist die Fehlerklasse, die dieser Change vermeiden muss; sie steht in den Aufgaben als
ausdrückliche Prüfvorschrift (Meldung prüfen, nicht nur das Blockiertsein; Dateiname ohne
„jest").

Motivation: siehe `proposal.md` — Why, und Issue #34. Verhalten: siehe
`specs/harness-run-state-access/spec.md`.

## Goals / Non-Goals

**Goals:**
- Keine geltende Rolle kommt an den ungefilterten Run-State — über keinen der drei Wege.
- Die Ablehnung nennt ihren tatsächlichen Grund, nicht einen zufällig danebenliegenden.
- Die §8.3-Prüfung des Rollenmarkers bleibt möglich.
- Ohne Rolle bleibt alles wie bisher.

**Non-Goals:**
- Keine Änderung an bestehenden Sperren. Die Regel ist rein additiv.
- Kein Schutz gegen absichtliche Umgehung über einen Interpreter (`node -e`, `python -c`) mit
  zusammengesetztem Pfad. Der Guard ist dort best-effort, so wie bei den Testdateien auch — die
  Kommando-Form dieser Regel trifft aber jede *geschriebene* Nennung, auch in
  Anführungszeichen und innerhalb eines Schnipsels (siehe D3).
- Keine Whitelist für die Suchwurzeln von test-author und reviewer (siehe D5).

## Decisions

### D1: Ein eigenes Prädikat statt einer Erweiterung von `isTest`

`isTest()` beantwortet die Frage „ist das eine Testdatei". Der Run-State enthält keine Tests,
sondern deren Ausgabe — und er ist aus einem anderen Grund gesperrt (§8.2 G4: der Orchestrator
reicht Aufbereitetes weiter; die Rohform bleibt bei ihm). Zwei Fragen, zwei Prädikate. Eine
Erweiterung von `isTest` hätte außerdem die Meldungen mitverdorben: „darf Testdateien nicht
lesen/ändern" für ein `status.json` schickt den Aufrufer in die Irre — genau der Befund, an dem
der erste Anlauf gescheitert ist.

### D2: Pfad-Form und Kommando-Form getrennt, wie beim Steuerdatei-Tabu

`CONTROL_FILE_TABOO` und `CONTROL_VERB_TABOO` stehen aus demselben Grund nebeneinander: „das
eine zielt auf Pfade und das andere auf Kommandos". Hier ebenso.

- **Pfad-Form** (`file_path`, Suchwurzel, Glob): verankert, `(^|/)\.harness/runs(/|$)`. Sie muss
  auch das Verzeichnis selbst treffen, ohne nachfolgenden Pfad — Grep und Glob bekommen eine
  Suchwurzel übergeben, keine Datei. Verankerung, weil ein Pfad hier vollständig vorliegt.
- **Kommando-Form**: `\.harness/runs\b`, unverankert, gegen die ganze normalisierte
  Kommandozeile. Ein Pfad steht dort in Anführungszeichen, hinter einem `cd`, mit einem Glob,
  als Teil eines `node -e`-Schnipsels. Eine tokenweise Prüfung (wie `extractTestReferences`)
  würde `cat ".harness/runs/12/status.json"` durchlassen, weil das Anführungszeichen die
  Verankerung bricht. Die unverankerte Form über die ganze Zeile hat diese Lücke nicht.

Beide Formen prüfen auf normalisierten Pfaden (`norm`), also unabhängig von der Schreibweise des
Betriebssystems — dieselbe Lehre wie aus #21.

### D3: Der Rollenmarker ist von der **Pfad**-Form ausgenommen, nicht von der Kommando-Form

`constitution.md` §8.3 verlangt, dass die Sitzung den Marker prüft, **bevor** irgendein
Werkzeugaufruf für den anstehenden Schritt erfolgt. Zu diesem Zeitpunkt trägt er noch die Rolle
des vorigen Schritts, und der `soleActiveRole`-Fallback wendet sie auf die Sitzung an: eine
pauschale Sperre würde also genau die Prüfung blocken, die den Rollenfehler auffangen soll. Die
Alternative — die Prüfung aus der Ausgabe von `pnpm harness next` zu lesen — hängt sie an das
Verb, dessen Schrittwechsel sie absichern soll, und `next` ist selbst ein Werkzeugaufruf, den
§8.3 erst nach der Prüfung erlaubt.

Preisgeben kann der Marker nichts: er enthält ein Wort aus einer festen Rollenmenge.
Geschrieben bleibt er durch `CONTROL_FILE_TABOO` gesperrt — die Ausnahme gilt nur der Leseform.

Für **Kommandos** gibt es die Ausnahme nicht, und sie fehlt nicht: dort ist der Marker schon vor
diesem Change vollständig tabu, weil einem Kommandotext nicht anzusehen ist, ob er liest oder
schreibt (`sed -i`, `>`, `truncate`, `chmod`). Das ist keine Einschränkung der §8.3-Prüfung; die
läuft über das Read-Werkzeug.

### D4: Für jede Rolle, nicht nur für die schreibenden

Die Regel steht in Block 0 des Guards, bei den Tabus, die für jede Rolle gelten — nicht in den
rollenspezifischen Blöcken. Drei Gründe:

1. **Mechanik statt Ausnahmeliste.** Steuerdatei- und Worktree-Tabu gelten ebenfalls für jede
   Rolle. Eine Regel ohne Ausnahmen ist schwerer zu unterlaufen und leichter zu prüfen.
2. **Der reviewer hat dort etwas zu holen.** `lastReview.findings` und `rejected-review.json`
   sind die Urteile der vorherigen Runden; sie zu lesen prägt das eigene vor. Sein Auftrag kommt
   vom Orchestrator, der Run-State gehört nicht dazu.
3. **Für den test-author gilt §2.1.** Er korrigiert Tests gegen die Spec, nie gegen die
   Implementierung — im Run-State stünde beides.

### D5: Was den Run-State erfasst, ohne ihn zu nennen, bleibt offen — und wird als offen benannt

Die Regel greift, wo der Run-State **genannt** wird. Ein Zugriff, der ihn nur *erfasst*, geht
durch. Das ist keine Randerscheinung, sondern eine ganze Klasse, und sie ist breiter als die
erste Fassung dieses Abschnitts behauptete (Review-Befund):

- **Suchwerkzeuge:** jede Suchwurzel, die Vorfahre des Run-State ist — `path: '.harness'`,
  `path: '.'`, oder gar kein `path`. Sie passieren `isRunState` und erfassen `.harness/runs`
  trotzdem. Für den **implementer** ist das geschlossen, weil seine Suchwurzel ein Quellpfad
  sein MUSS (bestehende Whitelist); für test-author und reviewer ist es offen.
- **Kommandos:** `grep -r x .harness`, `find . -name '*.json' -exec cat {} \;` und
  Verwandte nennen den Run-State nicht und treffen `RUN_STATE_TABOO` deshalb nicht. Das gilt
  für **jede** Rolle, den implementer eingeschlossen — genau wie beim Testdatei-Tabu, das an
  derselben Stelle best-effort ist.

Geschlossen wird das nicht, und der Grund ist nicht Bequemlichkeit: für Suchwerkzeuge verlangte
es eine positive Whitelist der zulässigen Suchwurzeln, und die des reviewers — der den gesamten
Diff beurteilen muss — ist „alles"; eine Whitelist, die alles enthält, ist keine. Für Kommandos
verlangte es, den Effekt eines beliebigen Programms vorherzusagen, was der Guard an keiner
Stelle tut.

Die Aussage lautet deshalb genau: **die drei Wege sind gegen jede Nennung des Run-State
geschlossen** — bei Weg 1 und 3 vollständig, bei Weg 2 (Bash) so weit, wie eine Textprüfung
reicht. Gegen einen Zugriff, der ihn nicht nennt, schützt keiner der drei. Das steht so auch in
der `proposal.md` unter „Nicht im Umfang"; als geschlossen wird es nirgends ausgegeben.

### D5a: Die Reichweite hängt an der Rollenermittlung

Ein Run-State-Pfad trägt nie ein `.harness/wt/<issue>/`-Segment, also löst weder
`issueFromPath` noch `issueFromCommand` ein Issue auf: die Rolle kommt für diese Aufrufe
**immer** aus dem `soleActiveRole`-Fallback. Laufen zwei Issues mit verschiedenen Rollen
gleichzeitig, liefert der Fallback bewusst „rollenlos", und die Sperre greift nicht.

Das ist ererbtes, an anderer Stelle begründetes Verhalten (aktuell läuft ein Issue zur Zeit) und
kein Defekt dieses Change — aber es bestimmt seine Reichweite und gehört deshalb genannt, damit
die Sperre später nicht als unbedingt gelesen wird.

**Nicht** gemacht: das Issue aus dem Run-State-Pfad selbst abzuleiten. Das koppelte die Sperre an
den Marker des dort genannten, womöglich längst abgeschlossenen Laufs — und wäre damit schwächer
als der Fallback, nicht stärker.

### D6: Die Reihenfolge im Guard entscheidet über die Begründung

Die Regel steht in Block 0, also **vor** `TEST_RUNNER_COMMANDS`. Sonst bliebe
`cat .harness/runs/12/jest.json` bei der alten, falschen Begründung („implementer führt die
Testsuite nicht selbst aus") — dem Zufallstreffer, an dem der erste Anlauf hing.

Innerhalb von Block 0 steht sie **hinter** `CONTROL_FILE_TABOO` und `CONTROL_VERB_TABOO`: ein
`rm .harness/runs/1/active-role` und ein `pnpm harness pause 12 "..."` behalten ihre eigenen,
genaueren Meldungen.
