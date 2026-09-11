## ADDED Requirements

### Requirement: Die Migrationssperre prüft den Wert, den das Kommando sieht

Trägt der Kommandotext eine Zuweisung an `DATABASE_URL` in einer erkannten Form, MUST der
Guard diesen zugewiesenen Wert gegen die Wegwerf-Muster prüfen — nicht die Umgebung des
Hook-Prozesses. Die erkannten Formen sind das Präfix (`DATABASE_URL=… <kommando>`), `env`
(`env DATABASE_URL=… <kommando>`) und `export` (`export DATABASE_URL=…`, gefolgt von `&&`,
`;` oder Zeilenumbruch und dem Kommando). Trägt der Text keine Nennung von `DATABASE_URL`,
MUST wie bisher die Umgebung des Hook-Prozesses gelten; ein leerer Wert blockt.

#### Scenario: Ein Präfix auf die Wegwerf-DB lässt die Migration durch

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `DATABASE_URL=file:./prisma/test.db pnpm prisma migrate dev --name init` geprüft wird
- **THEN** wird er nicht geblockt

#### Scenario: Die env-Form auf die Wegwerf-DB lässt die Migration durch

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `env DATABASE_URL=file:./prisma/test.db prisma migrate deploy` geprüft wird
- **THEN** wird er nicht geblockt

#### Scenario: Die export-Form auf die Wegwerf-DB lässt die Migration durch

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `export DATABASE_URL=file:./prisma/test.db && pnpm prisma migrate dev --name init` geprüft wird
- **THEN** wird er nicht geblockt

#### Scenario: Eine Inline-Zuweisung auf eine produktive DB blockt trotz ephemerer Umgebung

- **GIVEN** die Umgebung des Hook-Prozesses trägt `DATABASE_URL=file:./prisma/test.db`
- **WHEN** ein Bash-Aufruf `DATABASE_URL=file:/var/lib/vtt/prod.db prisma migrate deploy` geprüft wird
- **THEN** wird er geblockt — geprüft wird der Wert, den das Kommando sieht

#### Scenario: Ohne Nennung im Text gilt die Umgebung wie bisher

- **GIVEN** die Umgebung des Hook-Prozesses trägt `DATABASE_URL=file:./prisma/dev.db`
- **WHEN** ein Bash-Aufruf `pnpm prisma migrate dev --name init` geprüft wird
- **THEN** wird er geblockt — die Entwicklungs-DB ist keine Wegwerf-DB

### Requirement: Jede nicht erkannte Form blockt

Der Guard MUST blocken, wenn nicht sicher ist, welchen Wert das Migrationskommando sieht:
bei mehr als einer Nennung des Bezeichners `DATABASE_URL` im Text (Zuweisung, `unset`,
`$DATABASE_URL`), bei einem Präfix oder `env`, hinter dem vor dem Migrationskommando ein
Kommandotrenner steht (`;`, `&&`, `||`, `|`, Zeilenumbruch, `$(`, Backtick), und bei einer
Zuweisung ohne `export`, die durch einen Trenner vom Kommando getrennt ist. Fail-closed:
im Zweifel wird geblockt, nie durchgelassen.

#### Scenario: Zwei Nennungen von DATABASE_URL blocken

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `export DATABASE_URL=file:./prisma/test.db && DATABASE_URL=file:/var/lib/vtt/prod.db prisma migrate deploy` geprüft wird
- **THEN** wird er geblockt

#### Scenario: Ein Präfix vor einem anderen Kommando schützt die Migration dahinter nicht

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `DATABASE_URL=file:./prisma/test.db echo ok && prisma migrate deploy` geprüft wird
- **THEN** wird er geblockt — das Präfix gilt nur dem ersten Kommando

#### Scenario: Eine Zuweisung ohne export vor einem Trenner blockt

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `DATABASE_URL=file:./prisma/test.db; prisma migrate deploy` geprüft wird
- **THEN** wird er geblockt — eine nicht exportierte Shell-Variable erreicht das Kindprozess nicht

### Requirement: Eine Erwähnung des Migrationskommandos bleibt geblockt

Der Guard MUST ein Kommando, das den Text eines Migrationskommandos trägt, auch dann blocken,
wenn der Text nur zitiert wird (Heredoc, `echo`, Commit-Nachricht). Die Unterscheidung
zwischen Kommandoposition und Zitat MUST NOT versucht werden — sie hieße Shell-Syntax
parsen, und ein Fehler dort wäre fail-open an einer Grenze, die `constitution.md` §5.1 dem
Menschen vorbehält. Der Ausweg (Text per Datei statt per Heredoc) steht in `AGENTS.md`.

#### Scenario: Ein Heredoc mit dem Migrationskommando im Text bleibt geblockt

- **GIVEN** die Umgebung des Hook-Prozesses trägt kein `DATABASE_URL`
- **WHEN** ein Bash-Aufruf `gh issue create --body "$(cat <<'EOF'\nBitte prisma migrate dev nicht lokal ausführen.\nEOF\n)"` geprüft wird
- **THEN** wird er geblockt
