## Context

Die Migrationssperre in `decide()` (`.harness/guard.ts`):

```ts
if (MIGRATION_COMMANDS.test(cmd)) {
  const dbUrl = process.env.DATABASE_URL ?? ''
  if (!EPHEMERAL_DB.test(dbUrl)) return { blocked: true, message: '…' }
}
```

`MIGRATION_COMMANDS` ist ein Teilstring-Match auf den Kommandotext, `EPHEMERAL_DB` die Liste
der Wegwerf-Muster (`:memory:`, `test.db`, `localhost`, `127.0.0.1`). Die Sperre gilt für
jeden Werkzeugaufruf, rollenlos wie unter einer Rolle — sie steht außerhalb des Rollenzweigs.

Der Hook-Prozess erbt die Umgebung der Claude-Sitzung. Die Sitzung trägt `DATABASE_URL` nur,
wenn der Mensch sie so gestartet hat; typischerweise ist der Wert leer oder zeigt auf die
`dev.db`. Beides blockt. Das Kommando aus dem #13-Design setzt den Wert inline und wird
trotzdem geblockt, weil der Guard die Inline-Zuweisung nicht liest.

Motivation: `proposal.md` — Why, Issue #44 Punkt 3. Verhalten:
`specs/harness-migration-guard/spec.md`.

## Goals / Non-Goals

**Goals:**
- Eine Inline-Zuweisung auf eine Wegwerf-DB lässt die Migration durch, unabhängig von
  `process.env`.
- Jede Form, in der nicht sicher ist, welchen Wert das Migrationskommando sieht, blockt.
- Kein Weg, an der Sperre vorbei eine zweite Zuweisung ins Kommando zu bringen.

**Non-Goals:**
- Kein Shell-Parser. Die erkannten Formen sind drei feste Muster am Kommandoanfang.
- Keine Änderung an `MIGRATION_COMMANDS` oder `EPHEMERAL_DB`; Erwähnungen bleiben geblockt.

## Decisions

### D1 — Die Inline-Zuweisung ersetzt `process.env`, sie ergänzt es nicht

Das Issue schlug vor, beide Quellen zu prüfen und zu blocken, sobald eine nicht ephemer ist.
Das hätte die Sperre für den häufigsten Fall unverändert gelassen: `process.env` leer (matcht
nichts) plus Inline-Zuweisung auf `test.db` → geblockt. Die Shell gibt dem Kindprozess den
Inline-Wert; `process.env` des Hooks sieht das Kommando nie. Geprüft wird also, was wirkt:

```
databaseUrlForCommand(cmd, env) =
  keine Nennung von DATABASE_URL im Text  → env ?? ''      (wie bisher; leer blockt)
  genau eine Nennung, in erkannter Form   → der zugewiesene Wert
  sonst                                   → undefined      (unbekannte Form: blockt)
```

Entscheidung des Menschen vom 2026-09-10.

### D2 — Drei erkannte Formen, alle am Kommandoanfang

```
DATABASE_URL=<wert> <kommando…>              Präfix
env DATABASE_URL=<wert> <kommando…>          env
export DATABASE_URL=<wert> && <kommando…>    export, auch mit ; oder Zeilenumbruch
```

Weitere Zuweisungen vor `DATABASE_URL=` (`env FOO=1 DATABASE_URL=… cmd`) sind erlaubt — sie
ändern nichts daran, was das Kommando sieht. Der Wert ist alles bis zum nächsten Leerzeichen,
Anführungszeichen inklusive; `EPHEMERAL_DB` ist ein Teilstring-Match, dem die Quotes nicht im
Weg stehen.

Warum genau diese drei: es sind die, die der implementer bei #13 tatsächlich versucht hat, und
sie sind die einzigen, bei denen ohne Parser klar ist, dass die Zuweisung das
Migrationskommando erreicht. `export` wirkt auf alles danach; das Präfix und `env` wirken auf
das eine Kommando, das direkt folgt.

### D3 — Beim Präfix darf zwischen Zuweisung und Migration kein Kommandotrenner stehen

`DATABASE_URL=test.db echo x && prisma migrate deploy` — das Präfix gilt `echo`, die Migration
läuft mit der Sitzungsumgebung. Deshalb gilt für Präfix und `env`: der Rest des Kommandos
darf keinen Trenner tragen (`;`, `&&`, `||`, `|`, Zeilenumbruch, `$(`, Backtick). Eine Pipe
ist ebenfalls ein Trenner — bei `DATABASE_URL=x true | prisma migrate` gilt das Präfix nur
der linken Seite. Für `export` gilt die Einschränkung nicht: die Variable ist ab da Teil der
Umgebung jedes folgenden Kommandos.

Der Preis: `DATABASE_URL=test.db pnpm prisma migrate dev 2>&1 | tail` blockt. Das ist der
bekannte fail-closed-Fall, kein Defekt — `export … &&` ist die Form dafür.

### D4 — Genau eine Nennung des Bezeichners, nicht nur eine Zuweisung

Gezählt wird `\bDATABASE_URL\b`, nicht `DATABASE_URL=`. Ein zweites `DATABASE_URL=` könnte den
Wert vor der Migration umbiegen; aber auch `unset DATABASE_URL` oder `$DATABASE_URL` in einer
Substitution sind Wege, an der geprüften Zuweisung vorbei den wirksamen Wert zu ändern. Jede
zweite Nennung ist deshalb eine unbekannte Form. Das blockt auch harmlose Fälle
(`export DATABASE_URL=test.db && echo $DATABASE_URL && prisma migrate deploy`) — akzeptiert,
weil der harmlose Fall selten und der Schaden im anderen Fall groß ist.

### D5 — Eine Zuweisung ohne `export`, gefolgt von `;`, ist unbekannt

`DATABASE_URL=test.db; prisma migrate deploy` setzt eine Shell-Variable, die das Kindprozess
nicht erbt: `prisma` sieht die Sitzungsumgebung. Das Präfix-Muster verlangt deshalb, dass
nach dem Wert ein Kommando folgt, kein Trenner. Die Form fällt damit in „unbekannt" und
blockt — richtig, denn sie täte nicht, was sie zu tun scheint.

### D6 — Erwähnungen bleiben geblockt, die Abhilfe steht in AGENTS.md

`MIGRATION_COMMANDS` bleibt ein Teilstring-Match. Ein Heredoc, das `prisma migrate dev` im
Text trägt, blockt weiter. Die Alternative — Matching nur an Kommandoposition — wäre ein
Shell-Parser mit Fehlerfläche, und ein Fehler dort ist fail-open an einer Grenze, die
`constitution.md` §5.1 dem Menschen vorbehält. Der Preis ist ein Satz in `AGENTS.md`:
Texte, die das Kommando nennen, gehen per `--body-file` oder Write-Tool, nicht per Heredoc.
Entscheidung des Menschen vom 2026-09-10.

### D7 — `databaseUrlForCommand` ist exportiert und rein

Die Funktion nimmt Kommandotext und Umgebungswert und liefert die geprüfte Quelle oder
`undefined`. Kein Zugriff auf `process.env` darin — den macht der Aufrufer in `decide()`.
So lässt sich jede Form ohne `withDbUrl`-Gymnastik testen, und die Sperre bleibt in einem
Ausdruck lesbar: `url === undefined || !EPHEMERAL_DB.test(url)` → blocken.
