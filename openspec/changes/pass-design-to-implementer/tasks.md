> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [ ] 1.1 `.harness/tests/orchestrator.test.ts` um die sechs Szenarien aus
      `specs/harness-spec-delivery/spec.md` ergänzen, je einen Test pro Szenario: „Ein Change
      mit design.md liefert die Entscheidungen an den implementer", „Die Entscheidungen stehen
      vor den Anforderungen" (Reihenfolge über Indexvergleich, nicht über einen erwarteten
      Gesamtstring), „Ein Change ohne design.md ergibt einen Auftrag ohne Lücke", „Jeder Block
      trägt seine Quelldatei" (vier Blöcke, zwei Capabilities), „Die Test-Nacharbeit sieht
      dieselben Entscheidungen" (Vergleich der Spec-Anteile beider Prompt-Bauer), „Ein
      Testpfad in design.md hält den Lauf an und nennt die Datei"
- [ ] 1.2 Hilfsfunktion für die Testfälle: legt im Worktree eines frischen Issues einen
      Change-Ordner mit wählbaren Dateien an (`proposal.md`, `design.md`, Capabilities) und
      schreibt den Change-Namen nach `status.json`; die Ausgabe von `buildImplPrompt` /
      `buildTestReworkPrompt` wird über einen `console.log`-Spy abgegriffen
- [ ] 1.3 Rot bestätigen (§3.1): `pnpm test:harness` — die neuen Fälle scheitern an der
      erwarteten Zusicherung (fehlender `design.md`-Text, fehlende Quellenzeile, fehlende
      Datei in der Leak-Meldung), nicht an einem Import- oder Compile-Fehler

## 2. Der Change als Blockliste

- [ ] 2.1 `readChangeParts(issue, status)` in `.harness/orchestrator.ts` anlegen: liefert
      `{ quelle, text }[]` in der Reihenfolge `proposal.md`, `design.md`,
      `specs/<capability>/spec.md` (design.md D1/D3); `quelle` ist der Pfad relativ zum
      Change-Verzeichnis, fehlende Dateien erzeugen keinen Block (D5); verifizieren mit den
      Testfällen zu Reihenfolge und fehlender `design.md`
- [ ] 2.2 `readChangeSpec` auf `readChangeParts` setzen und die Blöcke mit vorangestellter
      Zeile `## Quelle: <pfad>` verketten, Trennung wie bisher `\n\n---\n\n` (D2); Signatur und
      Rückgabetyp bleiben unverändert; verifizieren mit den Testfällen „Jeder Block trägt seine
      Quelldatei" und „Ein Change mit design.md liefert die Entscheidungen an den implementer"

## 3. Die Fundstelle in der Leak-Meldung

- [ ] 3.1 `assertNoTestLeak` um den Parameter der Blockliste erweitern (D4): geprüft wird
      weiterhin der **fertige Prompt**; erst bei einem Treffer wird der Block gesucht, der ihn
      enthält, und in der Meldung benannt. Kein Treffer in einem Block → heutige Meldung;
      verifizieren mit dem Testfall „Ein Testpfad in design.md hält den Lauf an und nennt die
      Datei"
- [ ] 3.2 `buildImplPrompt` reicht die Blockliste an `assertNoTestLeak` durch, ohne den Prompt
      selbst anders aufzubauen; verifizieren mit denselben Testfällen

## 4. Abschluss

- [ ] 4.1 `pnpm test:harness` und `pnpm lint` grün
- [ ] 4.2 Gegenprobe am echten Material: für einen archivierten Change mit `design.md`
      (`2026-09-07-add-user-auth`) den Auftrag bauen lassen und prüfen, dass die
      Design-Entscheidungen mit Quellenzeile darin stehen und die Reihenfolge stimmt
- [ ] 4.3 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe aus 4.2)
- [ ] 4.4 Change nach `openspec/changes/archive/` verschieben (gleicher Branch/Commit-Bereich)
      und PR mit `Closes #22` öffnen; menschlicher Merge
