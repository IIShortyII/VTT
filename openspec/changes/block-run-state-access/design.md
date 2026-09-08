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

### D5: Die rollenlose Suche ohne Pfad bleibt offen — und wird als offen benannt

Ein `Grep` ohne `path` erfasst alles unterhalb des Arbeitsverzeichnisses, also auch
`.harness/runs`, ohne den Pfad zu nennen. Für den **implementer** ist dieser Weg bereits
geschlossen: seine Suchwurzel MUSS ein Quellpfad sein (bestehende Whitelist). Für test-author
und reviewer ist er offen, und dieser Change schließt ihn nicht.

Der Grund ist nicht Bequemlichkeit, sondern dass die Schließung nichts einschränken würde: sie
verlangte eine positive Whitelist der zulässigen Suchwurzeln, und die des reviewers — der den
gesamten Diff beurteilen muss — ist „alles". Eine Whitelist, die alles enthält, ist keine.

Diese Grenze wird ausdrücklich **nicht** als geschlossen ausgegeben (`proposal.md`, „Nicht im
Umfang"). Sie betrifft die beiden Rollen, für die es um §2.1 und die Unabhängigkeit des Urteils
geht — nicht den implementer, für den §2.2 gilt und dessen drei Wege vollständig zu sind.

### D6: Die Reihenfolge im Guard entscheidet über die Begründung

Die Regel steht in Block 0, also **vor** `TEST_RUNNER_COMMANDS`. Sonst bliebe
`cat .harness/runs/12/jest.json` bei der alten, falschen Begründung („implementer führt die
Testsuite nicht selbst aus") — dem Zufallstreffer, an dem der erste Anlauf hing.

Innerhalb von Block 0 steht sie **hinter** `CONTROL_FILE_TABOO` und `CONTROL_VERB_TABOO`: ein
`rm .harness/runs/1/active-role` und ein `pnpm harness pause 12 "..."` behalten ihre eigenen,
genaueren Meldungen.
