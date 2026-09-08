> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird
> deshalb ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/orchestrator.test.ts` um die acht Szenarien aus
      `specs/harness-spec-delivery/spec.md` ergänzen, je einen Test pro Szenario: „Ein Change
      mit design.md liefert die Entscheidungen an den implementer", „Die Entscheidungen stehen
      vor den Anforderungen" (Reihenfolge über Indexvergleich, nicht über einen erwarteten
      Gesamtstring), „Ein Change ohne design.md ergibt einen Auftrag ohne Lücke", „Jeder Block
      trägt seine Quelldatei" (vier Blöcke, zwei Capabilities), „Die Test-Nacharbeit sieht
      dieselben Entscheidungen" (Vergleich der Spec-Anteile beider Prompt-Bauer),
      „Testinhalt in design.md hält den Lauf an und nennt die Datei", „Eine zitierte
      Konvention ist kein Leak", „Ein Treffer außerhalb der Blöcke meldet keine
      Fundstelle" (in Runde 2 ergänzt, siehe 5.2)
- [x] 1.2 Hilfsfunktion für die Testfälle: legt im Worktree eines frischen Issues einen
      Change-Ordner mit wählbaren Dateien an (`proposal.md`, `design.md`, Capabilities) und
      schreibt den Change-Namen nach `status.json`; die Ausgabe von `buildImplPrompt` /
      `buildTestReworkPrompt` wird über einen `console.log`-Spy abgegriffen
- [x] 1.3 Rot bestätigen (§3.1): `pnpm test:harness` — die neuen Fälle scheitern an der
      erwarteten Zusicherung (fehlender `design.md`-Text, fehlende Quellenzeile, fehlende
      Datei in der Leak-Meldung), nicht an einem Import- oder Compile-Fehler

## 2. Der Change als Blockliste

- [x] 2.1 `readChangeParts(issue, status)` in `.harness/orchestrator.ts` anlegen: liefert
      `{ quelle, text }[]` in der Reihenfolge `proposal.md`, `design.md`,
      `specs/<capability>/spec.md` (design.md D1/D3); `quelle` ist der Pfad relativ zum
      Change-Verzeichnis, **mit Forward-Slashes** und nicht über `join()` gebildet (D2),
      fehlende Dateien erzeugen keinen Block (D5); verifizieren mit den Testfällen zu
      Reihenfolge und fehlender `design.md`
- [x] 2.2 `readChangeSpec` auf `readChangeParts` setzen und die Blöcke mit vorangestellter
      Zeile `## Quelle: <pfad>` verketten, Trennung wie bisher `\n\n---\n\n` (D2); Signatur und
      Rückgabetyp bleiben unverändert; verifizieren mit den Testfällen „Jeder Block trägt seine
      Quelldatei" und „Ein Change mit design.md liefert die Entscheidungen an den implementer"

## 3. Die Fundstelle in der Leak-Meldung

- [x] 3.1 `assertNoTestLeak` um den Parameter der Blockliste erweitern (D4): geprüft wird
      weiterhin der **fertige Prompt**; erst bei einem Treffer wird der Block gesucht, der ihn
      enthält, und in der Meldung benannt. Kein Treffer in einem Block → heutige Meldung;
      verifizieren mit dem Testfall „Testinhalt in design.md hält den Lauf an und nennt die
      Datei"
- [x] 3.2 `buildImplPrompt` reicht die Blockliste an `assertNoTestLeak` durch, ohne den Prompt
      selbst anders aufzubauen; verifizieren mit denselben Testfällen
- [x] 3.3 Ausnahme für Konventionszeilen nach design.md D6: der Wächter überspringt jede
      Zeile, die wörtlich in `AGENTS.md` oder `constitution.md` steht — genau diese beiden
      Dateien, wörtlicher Vergleich, einmal je Aufruf gelesen; verifizieren mit dem Testfall
      „Eine zitierte Konvention ist kein Leak" **und** mit der Gegenprobe aus 6.2, die den
      Fehlalarm ausgelöst hat

## 4. Nacharbeit Runde 1 (Reviewer-Befunde)

- [x] 4.1 **Block:** Der Test „Eine zitierte Konvention ist kein Leak" wies nur den
      ausbleibenden Abbruch nach, nicht das Ankommen der zitierenden Zeile — eine
      Implementierung, die sie still herausfiltert, wäre grün gewesen (genau die von
      `spec.md` verbotene Variante). Zusicherung ergänzt; `spec.md` und die THEN-Klausel um
      „unverändert im Auftrag ankommen" geschärft
- [x] 4.2 **Abgelehnt:** zeilenweiser statt Teilstring-Vergleich in `readKonventionen`. Der
      auslösende Fall steht in `AGENTS.md` nicht als eigene Zeile, sondern eingebettet
      (`` `/** @jest-environment jsdom */`-Docblock am Dateianfang … ``) — mit
      Zeilengleichheit griffe die Ausnahme nie und der Fehlalarm wäre zurück. Stattdessen
      D6 und `spec.md` präzisiert: maßgeblich ist, ob der Inhalt in den Konventionen
      nachzulesen ist, nicht ob er dort isoliert steht. Der Test hält das Eingebettetsein
      ausdrücklich fest
- [x] 4.3 Der Hauptrepo-Zweig aus `readKonventionen` entfernt: der implementer liest die
      `AGENTS.md` des Worktrees, eine nur auf `main` weitergezogene Fassung wäre für ihn nicht
      öffentlich. Der Test legt die Konventionsdateien nun im Worktree an, wie es
      `git worktree add` tut; gegengeprobt an echtem Material — ohne sie Abbruch, mit ihnen
      Durchlauf
- [x] 4.4 Testnamen ohne Umlaut-Transliteration auf die Szenarionamen aus `spec.md`
      zurückgeführt (`AGENTS.md`: Testname = Szenarioname) und die Fundstellen-Zusicherung
      auf `(Fundstelle: design.md)` verschärft

## 5. Hinweise aus Runde 2 (Review „ok", nicht blockierend)

- [x] 5.1 Der Worktree-Bezug der Konventions-Ausnahme hatte keinen Regressionsschutz — der
      Test kopierte die Hauptrepo-Fassung in den Worktree, eine wieder das Hauptrepo lesende
      Implementierung wäre genauso grün gewesen. Gegenprobe ergänzt: ohne die Fassung im
      Worktree bricht der Bau ab. Das belegt zugleich die zweite Hälfte von D6
- [x] 5.2 Achtes Szenario „Ein Treffer außerhalb der Blöcke meldet keine Fundstelle" in
      `spec.md` und Test dazu. Die MUST-Klausel dazu stand bisher ohne Prüfung da, obwohl sie
      der von D4 begründete Kern ist: ein Fundstellen-Fallback würde den Menschen genau dort
      in die Irre schicken, wo er sich auf die Auskunft verlässt
- [x] 5.3 `DESIGN` mehrzeilig, damit „der vollständige Text" prüfbar ist — mit einzeiliger
      Fixture wäre eine Implementierung grün gewesen, die `design.md` auf ihre erste Zeile
      kürzt (die von der Spec verbotene Auswahl innerhalb der Datei)
- [x] 5.4 `readFileSync('AGENTS.md')` im Test an die Modulwurzel gebunden statt ans
      Arbeitsverzeichnis des Jest-Aufrufs
- [x] 5.5 Beide neuen Zusicherungen per Mutationsprobe geprüft: ein Fundstellen-Fallback auf
      den ersten Block und ein Rückfall auf die Hauptrepo-Konventionen machen je genau einen
      Test rot
- [ ] 5.6 **Offen, eigenes Issue:** `readChangeParts` liefert bei fehlendem Change-Verzeichnis
      still `[]`; der Auftrag entsteht dann mit leerem `# Spec`-Abschnitt und der implementer
      arbeitet gegen nichts. Vorbestehend und nicht von diesem Change verursacht, aber gegen
      die `AGENTS.md`-Konvention „kein stilles catch". Gehört als eigener Befund in Epic #27

## 6. Abschluss

- [x] 6.1 `pnpm test:harness` und `pnpm lint` grün
- [x] 6.2 Gegenprobe am echten Material: für einen archivierten Change mit `design.md`
      (`2026-09-07-add-user-auth`) den Auftrag bauen lassen und prüfen, dass die
      Design-Entscheidungen mit Quellenzeile darin stehen und die Reihenfolge stimmt —
      **mit den echten Testdateien daneben**, damit der Leak-Wächter tatsächlich läuft (in
      dieser Konstellation ist der Fehlalarm aus D6 aufgefallen)
- [ ] 6.3 Menschliche Freigabe einholen (`constitution.md` §3.4 — kein App-Test, der Change
      berührt keinen Anwendungscode; geprüft wird die Ausgabe aus 6.2)
- [ ] 6.4 Change nach `openspec/changes/archive/` verschieben (gleicher Branch/Commit-Bereich)
      und PR mit `Closes #22` öffnen; menschlicher Merge
