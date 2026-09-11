## Why

`guard.ts` blockt die Prisma-Migrationskommandos (`migrate dev|deploy|reset`, `db push`),
wenn `process.env.DATABASE_URL` nicht wie eine Wegwerf-DB aussieht. Das ist die Umgebung des
**Hook-Prozesses** — die Claude-Sitzung —, nicht die Umgebung des Kommandos. Ein Aufruf mit
vorangestellter Zuweisung

```
DATABASE_URL=file:./prisma/test.db pnpm prisma migrate dev --name init
```

wird deshalb geblockt, obwohl die Wegwerf-DB im Kommando steht. Der implementer hat das bei
#13 empirisch verifiziert, auch mit `env …` und `export … && …`. Das Design von #13 sah genau
dieses Kommando vor; die Migrationsdatei entstand deshalb von Hand.

Die Sperre ist damit an der falschen Stelle streng: sie liest einen Wert, den das Kommando
gar nicht benutzt, und ignoriert den, den es benutzt. Fail-closed bleibt richtig
(`constitution.md` §5.1, §6.1) — aber gegen die Quelle, die tatsächlich wirkt.

Issue #44, Punkt 3. Nach `constitution.md` §1.4 eigener Branch, eigener PR, kein
Anwendungscode. Teil 2 von 3 zu #44.

## What Changes

- **Der Guard liest `DATABASE_URL` aus dem Kommandotext, wenn es dort zugewiesen wird.** Drei
  Shell-Formen gelten als Zuweisung, die auf das Migrationskommando wirkt: das Präfix
  (`DATABASE_URL=… cmd`), `env DATABASE_URL=… cmd` und `export DATABASE_URL=… && cmd`
  (bzw. `;`). Die Inline-Zuweisung **ersetzt** `process.env` als geprüfte Quelle — so arbeitet
  die Shell, und die Sitzungsumgebung trägt in der Regel nichts oder die `dev.db`.
- **Ohne Zuweisung im Text gilt `process.env` wie bisher**, leer blockt.
- **Jede andere Form blockt.** Zwei Nennungen von `DATABASE_URL` im Text (ein zweiter Wert
  könnte den ersten mitten im Kommando umbiegen), eine Zuweisung, hinter der ein
  Kommandotrenner steht, bevor die Migration kommt (das Präfix gälte nur dem ersten Kommando),
  eine Zuweisung ohne `export`, die per `;` getrennt ist (die Variable erreicht das Kindprozess
  nicht) — alles unbekannte Formen, alle fail-closed.
- **Erwähnungen bleiben geblockt.** Ein Kommando, das das Migrationskommando nur in einem
  String trägt (Heredoc, `echo`, `git commit -m`), wird weiter geblockt. Die Unterscheidung
  „Kommandoposition oder Zitat" hieße Shell-Syntax parsen, und jeder Fehler dort wäre
  fail-open an einer §5.1-Grenze. `AGENTS.md` nennt den Ausweg (`--body-file`, Write-Tool).
  Entscheidung des Menschen vom 2026-09-10.

## Capabilities

### New Capabilities
- `harness-migration-guard`: Wogegen die Migrationssperre prüft — welche Quelle für
  `DATABASE_URL` gilt, welche Inline-Formen erkannt werden, und dass alles Unerkannte blockt.
  `harness-guard-hook` beschreibt bewusst nur, *ob* der Hook läuft; die Sperrlogik hatte
  bisher keine Capability.

### Modified Capabilities
- keine.

## Impact

- `.harness/guard.ts` (Migrationssperre, neue Funktion `databaseUrlForCommand`)
- `.harness/tests/guard.test.ts`
- `AGENTS.md`: Hinweis zu Erwähnungen des Migrationskommandos
- Kein Anwendungscode, keine neuen Dependencies

**Nicht im Umfang:**
- Kein Matching an Kommandoposition (siehe oben).
- Keine Auswertung von `.env`-Dateien oder `dotenv`/`--env-file`-Aufrufen: was das Kommando
  aus einer Datei lädt, sieht der Guard nicht, also gilt dafür weiter `process.env` — und die
  Sitzung trägt in der Regel nichts, also blockt es. Der Weg ist die Inline-Zuweisung.
