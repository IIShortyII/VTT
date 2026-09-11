> Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR, kein Anwendungscode.
> Die Harness-Tests liegen außerhalb der App-Testsuite (`pnpm test:harness`) und unterliegen
> nicht den Rollen-Pfadregeln von test-author/implementer (`AGENTS.md`). Umgesetzt wird deshalb
> ohne Rollentrennung, aber test-first (§1.2).

## 1. Tests zuerst

- [x] 1.1 `.harness/tests/guard.test.ts` um je einen Test pro Szenario aus
      `specs/harness-migration-guard/spec.md` ergänzen (9 Szenarien, drei Requirements) —
      über `evaluate(bash(...))` mit gesetzter bzw. gelöschter `process.env.DATABASE_URL`
      (`withDbUrl`), nicht über die interne Hilfsfunktion
- [x] 1.2 Rot bestätigen (§3.1): die drei Durchlass-Szenarien und das Szenario „Inline auf
      produktive DB blockt trotz ephemerer Umgebung" scheitern an der Zusicherung; die übrigen
      fünf sind Negativ-Zusicherungen, die das heutige Verhalten trivial erfüllt.
      **Ehrlichkeitsvermerk / Mutationsproben** nach der Implementierung: Mehrfachnennung
      ungeprüft → „Zwei Nennungen" rot; Trenner hinter Präfix ignoriert → „Präfix vor anderem
      Kommando" rot; Semikolon als Teil des Werts erlaubt → „ohne export vor Trenner" rot;
      Umgebungs-Rückfall liefert Wegwerf-DB → „Ohne Nennung gilt die Umgebung" rot (plus die
      vier Alt-Tests der Sperre); Migration nur am Kommandoanfang gematcht → „Heredoc bleibt
      geblockt" rot (plus vier weitere). Jeweils zurückgedreht.

## 2. Die Quelle bestimmen (design.md D1–D5, D7)

- [x] 2.1 `databaseUrlForCommand(cmd, env)` in `guard.ts`: keine Nennung → `env ?? ''`; genau
      eine Nennung (`\bDATABASE_URL\b`) in Präfix-, env- oder export-Form → zugewiesener Wert;
      sonst `undefined`
- [x] 2.2 Präfix/env: nach dem Wert muss ein Kommando folgen, und der Rest darf keinen
      Trenner tragen (`;`, `&&`, `||`, `|`, Zeilenumbruch, `$(`, Backtick). export: Wert, dann
      `&&`, `;` oder Zeilenumbruch, dann Kommando
- [x] 2.3 Migrationssperre in `decide()`: `url === undefined || !EPHEMERAL_DB.test(url)` →
      blocken; Meldung nennt bei unbekannter Form, dass der Wert nicht sicher bestimmbar ist

## 3. Dokumentation (D6)

- [x] 3.1 `AGENTS.md`, Kritische Grenzen: Migration gegen die Wegwerf-DB per Inline-Zuweisung
      (`DATABASE_URL=file:./prisma/test.db …`); Texte, die das Migrationskommando nur nennen,
      per `--body-file`/Write-Tool statt Heredoc

## 4. Abschluss

- [x] 4.1 `pnpm test:harness`, `pnpm typecheck`, `pnpm lint` grün; `openspec validate
      guard-inline-db-url --strict` valide
- [x] 4.2 Reviewer-Subagent (read-only) gegen den Diff, Runde 1: **nacharbeit**. Block-Finding:
      `EPHEMERAL_DB` ist ein Teilstring-Match, gegen den agentengeschriebenen Kommandotext ein
      Fail-open (`postgres://user@prod-host/db?options=test.db`, `$(…)?schema=test.db`). Zwei
      Hinweise: `\s` trennt auch Unicode-Leerraum, die Shell nicht; D2/D3-Zusagen ohne Test.

- [x] 4.3 Nacharbeit Runde 1 (design.md D8) — Spec: Requirement „Der Wegwerf-Charakter wird am ganzen Wert geprüft" mit vier
      Szenarien; drei Szenarien für die D2/D3-Zusagen (Zusatzzuweisung, export mit `;`/`\n`,
      Pipe als Trenner); ASCII-Leerraum im Requirement „unbekannte Form"
- [x] 4.4 Tests je Szenario, rot bestätigt: die beiden Teilstück-Szenarien (inline, Umgebung)
      scheitern an der Zusicherung. Die übrigen fünf neuen sind Negativ- bzw.
      Durchlass-Zusicherungen, die der alte Stand trivial erfüllt; Mutationsproben: „Teilstring-Match
      statt Wert als Ganzes" → beide Teilstück-Szenarien rot; „Zeichenvorrat des Werts
      freigegeben" → „Kommandosubstitution im Wert" rot; „Userinfo darf `/` enthalten" →
      „localhost hinter dem echten Host" rot
- [x] 4.5 `guard.ts`: `EPHEMERAL_DB` durch `isEphemeralDbUrl(value)` ersetzen (Wert als
      Ganzes, drei Formen); `DB_URL_VALUE` auf URL-Zeichenvorrat; `\s` → `[ \t]` in den
      Inline-Mustern
- [ ] 4.6 Gate erneut grün, Reviewer erneut (§3.3: jede Nacharbeit-Runde durchläuft Gate und
      Review)
- [ ] 4.7 Menschliche Freigabe (`constitution.md` §3.4 — kein App-Test, kein Anwendungscode;
      geprüft wird das Guard-Urteil)
- [ ] 4.8 `openspec archive guard-inline-db-url --yes`, Purpose der neuen Capability
      ausfüllen, PR als Teil 2 von 3 zu #44 (kein `Closes`, Admin-Bypass wie bei #53);
      menschlicher Merge
