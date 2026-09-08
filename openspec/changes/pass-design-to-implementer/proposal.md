## Why

`readChangeSpec` (`.harness/orchestrator.ts`) baut den Auftrag an den implementer aus
`proposal.md` und den Dateien unter `specs/`. **`design.md` bleibt außen vor.**

Genau dort stehen aber die technischen Entscheidungen, gegen die der test-author seine Tests
schreibt: Verzeichnisschnitt, Datenmodell, Hashformat, Cookie-Name und -Attribute,
Uhr-Injektion, Client-Aufbau. Beim Lauf zu #12 waren das D1–D12.

Die Lücke ist keine Bequemlichkeitsfrage, sondern eine Folge der Rollentrennung. Der
test-author bekommt laut `SKILL.md` den **Change-Pfad** und liest den Ordner selbst, `design.md`
eingeschlossen. Der implementer bekommt stattdessen ein gebautes Extrakt, weil sein Prompt
durch `assertNoTestLeak` laufen muss — er darf den Ordner nicht selbst durchsuchen. Beide
Rollen arbeiten also am selben Change, aber nur eine kennt die getroffenen Entscheidungen.

Ohne `design.md` beantwortet der implementer dieselben Fragen ein zweites Mal — möglicherweise
anders als der test-author. Das Gate wäre dann rot aus reiner Uneinigkeit über eine Benennung,
nicht wegen eines Fehlers, und jede solche Runde zählt gegen `constitution.md` §3.5.

Beim Lauf zu #12 wurde der implementer im Kopf der Delegation von Hand auf den Change-Ordner
verwiesen. Das ist eine Umgehung, keine Lösung: `SKILL.md` verlangt, den Prompt **wörtlich** zu
übergeben, und je mehr die Session frei ergänzt, desto weniger gilt Leitplanke G1
(getemplatete Delegationen). Siehe Issue #22.

## What Changes

- **`readChangeSpec` liest zusätzlich `design.md`** — eingehängt zwischen `proposal.md` und den
  Dateien unter `specs/`. Die Reihenfolge folgt der Lesart des Change-Ordners: warum
  (`proposal.md`) → wie entschieden (`design.md`) → was genau (`specs/`). Fehlt die Datei —
  nicht jeder Change hat eine —, entsteht der Auftrag ohne sie und ohne Platzhalter.
- **Jeder Block nennt seine Herkunft.** Bisher wurden die Teile mit `---` aneinandergehängt,
  ohne dass der implementer sieht, welcher Text woher stammt. Mit einer dritten Datei wird das
  spürbar: er soll wissen, ob er eine Absicht, eine Entscheidung oder eine Anforderung liest.
  Jeder Block bekommt deshalb eine Quellenzeile mit seinem Pfad relativ zum Change-Verzeichnis
  (`proposal.md`, `design.md`, `specs/<capability>/spec.md`).
- **Der Leak-Wächter benennt die Fundstelle.** `assertNoTestLeak` bricht bei einem Treffer
  weiterhin ab — daran ändert sich nichts. Neu ist, dass die Meldung sagt, **welche Datei des
  Change** den Treffer enthält. `design.md` nennt erfahrungsgemäß konkrete Dateipfade und ist
  damit die wahrscheinlichste Quelle eines künftigen Abbruchs; ohne diese Angabe sucht der
  Mensch den Treffer im ganzen Change-Ordner.

**Unverändert:** Der Zustandsautomat, der Rundenzähler, die Gate-Reihenfolge und das
Rollenrouting. `assertNoTestLeak` bleibt in Wirkung und Härte gleich — es filtert nichts
heraus und degradiert nichts, es hält den Lauf an. Ein Wächter, der bei einem Treffer
weiterläuft, wäre keiner (G1).

**Nicht im Umfang:**
- **`tasks.md` wandert nicht in den Prompt.** Die Schrittliste nennt erfahrungsgemäß
  Testdateien und würde `assertNoTestLeak` regelmäßig auslösen — der Lauf stünde dann bei
  jedem zweiten Change still. Was der implementer zu tun hat, steht in den Requirements.
- **Kein Zugriff des implementer auf den Change-Ordner selbst.** Das Extrakt bleibt der einzige
  Weg; es ist die Stelle, an der der Leak-Wächter greift.
- **Der wirkungslose Pfad-Vergleich im Leak-Wächter.** Bei der Arbeit an diesem Change ist
  aufgefallen, dass `assertNoTestLeak` Testpfade gegen den vollen Worktree-Pfad in nativer
  Schreibweise prüft und eine übliche Nennung (`tests/foo.test.ts`) deshalb nie trifft. Das
  ist derselbe Defekt wie in #21 und dort dokumentiert — er wird nicht hier miterledigt,
  sondern in dem Change, der die Pfad-Schreibweise im Harness insgesamt geraderückt.
- Die übrigen Befunde aus Epic #27 (#21, #24, #25) — jeder bekommt seinen eigenen Change.

## Capabilities

### New Capabilities
- `harness-spec-delivery`: Welches Material aus einem OpenSpec-Change in den Auftrag an eine
  Rolle eingeht, in welcher Form es gekennzeichnet ist und wie der Leak-Wächter dabei greift.

### Modified Capabilities
Keine — `openspec/specs/` ist leer.

## Impact

- `.harness/orchestrator.ts` (`readChangeSpec`, `assertNoTestLeak`),
  `.harness/tests/orchestrator.test.ts`
- Kein Anwendungscode (`constitution.md` §1.4: Harness und Anwendung nie im selben PR)
- Keine neuen Dependencies
- **Wirkung auf beide Prompt-Bauer:** `readChangeSpec` speist sowohl `buildImplPrompt` als auch
  `buildTestReworkPrompt`. Der test-author bekommt `design.md` damit ebenfalls — das ist
  erwünscht, weil er den Ordner ohnehin sehen darf und beide Rollen dieselbe Entscheidungslage
  brauchen. Ein Auseinanderdriften der beiden Aufträge wäre der Fehler, nicht die Gleichheit.
