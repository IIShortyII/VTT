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
- Keine Änderung an `MIGRATION_COMMANDS`; Erwähnungen bleiben geblockt. (`EPHEMERAL_DB` wird
  nach dem Review-Befund in D8 doch angefasst: vom Teilstring-Match zur Prüfung am ganzen
  Wert.)

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
ändern nichts daran, was das Kommando sieht. Der Wert besteht aus dem Zeichenvorrat einer
URL (Buchstaben, Ziffern, `_ . / : @ % ? = + -`) und optionalen Anführungszeichen (D8);
Leerraum ist ASCII-Leerraum (Leerzeichen, Tab), so wie die Shell trennt — `\s` würde auch
ein geschütztes Leerzeichen als Grenze nehmen, das die Shell als Teil des Werts durchreicht.

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

### D8 — Der Wegwerf-Charakter wird am ganzen Wert geprüft (Review-Befund Runde 1)

Vor diesem Change war `EPHEMERAL_DB` ein Teilstring-Match gegen `process.env.DATABASE_URL`
— einen Wert, den der Mensch gesetzt hat. Mit der Inline-Zuweisung prüft derselbe Match einen
Text, den der Agent frei schreibt, und wird damit zum Fail-open: `postgres://user@prod-host/db?options=test.db`
enthält `test.db`, verbindet aber zu `prod-host`. Ebenso `$(cat prod-url)?schema=test.db`:
der Literaltext trägt das Muster, die Shell setzt etwas anderes ein.

Deshalb zwei Verschärfungen, beide für Inline- **und** Umgebungswert (eine Regel, nicht zwei —
der Umgebungswert ist zwar menschengesetzt, aber nichts spricht dafür, ihn lockerer zu prüfen):

1. **Der Wert wird als Ganzes geprüft**, mit optionalen Anführungszeichen außen:
   - SQLite-Datei: `file:` + Pfad, der auf `test.db` endet, optional Query
   - In-Memory: `file::memory:` oder `sqlite::memory:`, optional Query
   - Server-URL: Schema `://`, optionale Userinfo (`…@`, ohne `/` darin), dann **genau**
     `localhost` oder `127.0.0.1` als Host, optional Port, Pfad, Query

   Userinfo darf keinen `/` enthalten, sonst ließe sich `localhost` in die Userinfo schreiben
   und der echte Host dahinter verstecken; ein `@` im Pfad ist dagegen unschädlich, weil der
   Host schon vorher feststeht.
2. **Der Inline-Wert ist auf den URL-Zeichenvorrat beschränkt.** `$`, Backtick, `(`, `)`,
   `{`, `}`, `\`, `<`, `>`, `*`, `~`, `&`, `;`, `|` und alles außerhalb von ASCII sind kein
   Teil eines Werts, sondern der Beginn einer unbekannten Form. Eine legitime Wegwerf-URL
   braucht keins davon (`&` in einer Query bräuchte Quotes, die der Guard nicht auswertet — also
   blockt, fail-closed).

3. **Der Query-Teil einer Server-URL ist eine Whitelist** (Review-Befund Runde 2). libpq und
   Prisma lesen den Ziel-Host auch aus `?host=` — das dokumentierte Cloud-SQL-Muster ist
   `postgresql://localhost/db?host=/cloudsql/proj:region:instance`, und dort verbindet
   `localhost` nirgends hin. Eine Sperrliste (`host`, `socket`) wäre die zweite Liste, die man
   beim nächsten Treiber vergisst; deshalb umgekehrt: nur `schema`, `sslmode`,
   `connection_limit`, `pool_timeout`, `connect_timeout`, `pgbouncer` und `sslaccept` sind
   erlaubt, jeder andere Schlüssel macht den Wert zur unbekannten Form. Schlüssel werden
   case-insensitiv verglichen, `&` trennt (inline kommt es wegen des Zeichenvorrats nicht vor,
   im Umgebungswert schon).

Der Preis: `EPHEMERAL_DB` als Teilstring-Match entfällt; wer eine exotische Wegwerf-Adresse
oder einen weiteren Query-Schlüssel braucht, erweitert die Liste im Code, nicht den Match.

### D7 — `databaseUrlForCommand` ist exportiert und rein

Die Funktion nimmt Kommandotext und Umgebungswert und liefert die geprüfte Quelle oder
`undefined`. Kein Zugriff auf `process.env` darin — den macht der Aufrufer in `decide()`.
So lässt sich jede Form ohne `withDbUrl`-Gymnastik testen, und die Sperre bleibt in einem
Ausdruck lesbar: `url === undefined || !EPHEMERAL_DB.test(url)` → blocken.
