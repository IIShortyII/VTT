> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/guard.test.ts` um die Szenarien aus
      `specs/harness-role-isolation/spec.md` ergänzen: voller Typecheck für den implementer
      blockiert (mit Verweis auf `typecheck:src` in der Meldung), `typecheck:src` erlaubt,
      nacktes `tsc` blockiert, `tsc -p tsconfig.src.json` erlaubt, test-author und rollenloser
      Aufruf unbeeinträchtigt; verifizieren mit `pnpm test:harness` — die neuen Fälle sind rot
- [x] 1.2 Die beiden Tests korrigieren, die den alten Zustand festhalten (`guard.test.ts:66`
      „erlaubt Typecheck und Lint" und `:135` „erlaubt ein unbeteiligtes Kommando"); den
      Lint-Anteil erhalten, das unbeteiligte Kommando auf `pnpm lint` umstellen; verifizieren,
      dass kein Test mehr den vollen Typecheck als für den implementer erlaubt behauptet

## 2. Umsetzung

- [x] 2.1 `tsconfig.src.json` anlegen (`extends` auf `tsconfig.json`, `include` nur `src/**`);
      verifizieren mit `pnpm exec tsc --noEmit -p tsconfig.src.json` (läuft durch)
- [x] 2.2 Skript `typecheck:src` in `package.json` ergänzen; verifizieren mit
      `pnpm typecheck:src`
- [x] 2.3 In `.harness/guard.ts` die Sperre nach design.md D2 ergänzen (Muster für Skript und
      Compiler, Ausnahme für `typecheck:src`/`tsconfig.src.json`, Meldung nennt den erlaubten
      Weg); verifizieren mit `pnpm test:harness` — alle Guard-Tests grün
- [x] 2.4 Gegenprobe, dass der eingeschränkte Typecheck echte Fehler findet: vorübergehend
      einen Typfehler in eine Datei unter `src/` setzen, `pnpm typecheck:src` muss ihn melden,
      danach zurücknehmen (Szenario „Ein Typfehler im Quellcode wird gemeldet")

## 3. Dokumentation der Grenze

- [x] 3.1 `AGENTS.md`: unter „Kommandos" `typecheck:src` aufnehmen und unter „Kritische
      Grenzen" den impliziten Satz zum implementer um den Typecheck erweitern; verifizieren
      durch Gegenlesen gegen `specs/harness-role-isolation/spec.md`
- [x] 3.2 `.claude/agents/implementer.md`: den erlaubten Typecheck benennen, damit die Rolle
      den Weg kennt, statt ihn erst über eine Guard-Meldung zu finden

## 4. Abschluss

- [x] 4.1 `pnpm test:harness` und `pnpm lint` grün
- [x] 4.2 Change nach `openspec/changes/archive/` verschieben (gleicher Commit-Bereich) und PR
      mit `Closes #18` öffnen; menschlicher Merge
