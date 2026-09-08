> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird deshalb
> ohne Rollentrennung, aber test-first (§1.2).

## 1. Test zuerst

- [x] 1.1 `.harness/tests/orchestrator.test.ts` um das Szenario aus
      `specs/harness-spec-delivery/spec.md` ergänzen: „Ein Change ohne Material hält den Lauf an
      und nennt das Verzeichnis" — Status zeigt auf einen Change ohne angelegtes Verzeichnis,
      `buildImplPrompt` bricht ab (`process.exit`-Spy) und die Meldung nennt das erwartete
      Change-Verzeichnis
- [x] 1.2 Rot bestätigen (§3.1): `pnpm test:harness` — der neue Fall scheitert an der erwarteten
      Zusicherung (ausbleibender Abbruch, weil heute ein leerer Auftrag entsteht), nicht an einem
      Import- oder Compile-Fehler

## 2. Der Abbruch

- [x] 2.1 In `buildImplPrompt` nach `readChangeParts` auf `parts.length === 0` prüfen und mit
      `fail()` abbrechen (design.md D1, D2, D4), bevor `formatChangeParts` und der Prompt gebaut
      werden
- [x] 2.2 Die Meldung nennt das erwartete Change-Verzeichnis in derselben Bildung wie
      `readChangeParts` — `join(worktreeDir(i), 'openspec', 'changes', s.change ?? i)` (D3)

## 3. Nacharbeit nach Review (nicht-blockierender Hinweis)

- [x] 3.1 Reviewer-Subagent: Urteil **ok**, kein blockierendes Finding. Ein Hinweis: der
      Requirement-Text und `design.md` D2 versprechen beide Auslöser (Verzeichnis fehlt ODER
      existiert leer), getestet war nur „fehlt" — ein Rückfall auf `existsSync(dir)` käme grün
      durch.
- [x] 3.2 Zweites Szenario „Ein existierendes, aber materialloses Verzeichnis hält den Lauf
      ebenso an" in `spec.md` und als Test ergänzt, der den D2-Zweig festnagelt.
      **Ehrlichkeitsvermerk:** dieser Test ist grün-von-Anfang-an — der Fix deckte den Zweig
      bereits ab; die Rot-Bestätigung ist über eine Mutationsprobe nachgeholt.
- [x] 3.3 Mutationsprobe: Bedingung auf `!existsSync(dir)` zurückgedreht → genau der neue Test
      wird rot, der „fehlt"-Test bleibt grün. Danach zurückgedreht.

## 4. Abschluss

- [x] 4.1 `pnpm test:harness` (137 grün), `pnpm typecheck` und `pnpm lint` grün; `openspec
      validate --strict` valide
- [x] 4.2 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe/der Abbruch)
- [x] 4.3 Change nach `openspec/changes/archive/` verschieben **und die Capability nach
      `openspec/specs/harness-spec-delivery/spec.md` übernehmen** (beides im selben
      Branch/Commit-Bereich), dann PR mit `Closes #33` öffnen; menschlicher Merge
