# Agentic Coding Harness — Blaupause

Ein TDD-Loop für Coding-Agenten, dessen harte Entscheidungen in Code liegen statt im
Ermessen eines Modells. Drei isolierte Rollen (`test-author`, `implementer`, `reviewer`)
arbeiten an einem spezifizierten Change; ein Zustandsautomat sequenziert sie, ein
PreToolUse-Guard erzwingt ihre Grenzen zur Laufzeit, und nichts erreicht `main` ohne
grünes Gate, bestandenen Review und menschliche Freigabe.

Dies ist die projektneutrale Ausgangsversion. Was zu füllen ist, steht unter
[Aufsetzen](#aufsetzen).

## Der Loop

```
start ──► red ──► implement ──► gate ──► review ──► app-review ──► done ──► archived
            │         │           │        │            │
            │         └───────────┴────────┴────────────┘
            │                  Nacharbeit (max. 3 Runden, dann Eskalation)
            └─ test-author schreibt Tests aus der Spec und bestätigt sie als rot
```

1. **red** — der `test-author` leitet aus dem OpenSpec-Change je GIVEN/WHEN/THEN-Szenario
   einen Test ab. Der Orchestrator prüft, dass sie aus dem *richtigen* Grund rot sind
   (erwartete Assertion oder fehlende Implementierung — nicht Tippfehler im Test).
2. **implement** — der `implementer` baut das Feature. Er sieht die Tests nie, weder als
   Datei noch als Prompt-Inhalt noch als Testausgabe.
3. **gate** — Typecheck + Lint + komplette Testsuite. Deterministisch, läuft vor dem Review.
4. **review** — der `reviewer` (nur lesend) urteilt über das, was Typecheck und Lint nicht
   fangen können. Seine Findings werden nach Pfad an die zuständige Rolle geroutet.
5. **app-review** — die App wird gestartet, ein Mensch testet manuell und gibt frei.
6. **archived** — der Change wandert ins Archiv, der PR wird geöffnet. Der Merge bleibt
   menschlich.

Jede Nacharbeit zählt in einen gemeinsamen Rundenzähler, unabhängig davon, welche Rolle
sie übernimmt — nach drei Runden übernimmt ein Mensch.

## Warum der `implementer` die Tests nicht sieht

Ein Agent, der seine Tests kennt, optimiert gegen sie statt gegen die Spezifikation. Diese
Trennung ist die zentrale Invariante der Harness (`constitution.md` §2.2) und in vier
Schichten abgesichert:

1. `guard.ts` blockt Lese- und Schreibzugriffe auf Testpfade rollenabhängig.
2. Umgehungen über Bash (`>`, `>>`, `tee`, `cp`, `mv`, `cat tests/…`), über Suchwerkzeuge
   (Grep/Glob) und über das Ausführen der Testsuite werden ebenfalls geblockt.
3. Gate-Feedback wird vor dem Codeframe abgeschnitten — der Implementer bekommt die
   vollständige Matcher-Ausgabe, nie Testquellcode.
4. Ein Leak-Wächter vergleicht den fertigen Prompt zeilenweise gegen alle Testdateien.

Kein Schutz gegen absichtliche Umgehung (ein `node -e`-Skript kann jede Datei lesen) — die
Schichten adressieren das, was ein Agent im Normalbetrieb versucht.

## Dateien

| Pfad | Inhalt |
|---|---|
| `constitution.md` | Bindende Invarianten. Ranghöchstes Dokument, Änderung ist freigabepflichtig. |
| `AGENTS.md` | Wie in diesem Repo gearbeitet wird — Kommandos, Konventionen, Grenzen. |
| `.harness/orchestrator.ts` | Zustandsautomat, Gate, Prompt-Bau, Leak-Wächter. |
| `.harness/guard.ts` | PreToolUse-Hook. Erzwingt die Rollengrenzen zur Laufzeit, fail-closed. |
| `.harness/tests/` | Tests der Harness selbst (`pnpm test:harness`, eigener CI-Job). |
| `.claude/agents/` | Die drei Rollendefinitionen samt Werkzeug- und Modellwahl. |
| `.claude/skills/feature-loop/` | Anleitung für die orchestrierende Session. |
| `.claude/commands/opsx/`, `.claude/skills/openspec-*` | OpenSpec-Workflow (Spec-Erzeugung). |
| `.github/` | PR-Gate, Deploy-Gerüst, CODEOWNERS, Branch-Ruleset. |

Laufzeitzustand liegt unter `.harness/runs/<issue>/` (Status, Gate-Ausgaben, Eskalationen)
und `.harness/wt/<issue>/` (ein Git-Worktree je Issue). Beides ist gitignored.

## Kommandos

```bash
pnpm harness start <issue> <change>   # Worktree anlegen, Change einspielen, Loop starten
pnpm harness next <issue>             # nächste Aktion erfragen — nach JEDEM Schritt
pnpm harness gate <issue>             # Typecheck + Lint + Tests
pnpm harness cleanup <issue>          # Worktree nach dem Merge entfernen
pnpm test:harness                     # Tests der Harness selbst
```

Die orchestrierende Session ruft die übrigen Verben (`confirm-red`, `record-review`,
`build-impl-prompt`, …) laut `feature-loop/SKILL.md`. Sie rät nie den nächsten Schritt,
sondern fragt `next`.

## Aufsetzen

0. **Node ≥ 22.18.** Der PreToolUse-Guard läuft als `node .harness/guard.ts`, ohne
   Transpiler — auf älterem Node endet der Hook mit Exit 1, und da ein PreToolUse-Hook
   ausschließlich bei Exit 2 blockt, wäre der Guard damit wirkungslos, ohne dass es auffällt.
   `pnpm test:harness` (Schritt 7) deckt den Fall ab.
1. Authentifizierung läuft über die Claude-Subscription — im Repo liegt kein API-Key und
   keine Endpunkt-Konfiguration. Welches Modell eine Rolle benutzt, steht in der Frontmatter
   der jeweiligen Definition unter `.claude/agents/` (`opus` für `test-author` und
   `reviewer`, `sonnet` für den `implementer`); das Modell der orchestrierenden Session
   wählt der Mensch per `/model`.
2. In `package.json` die Skripte `dev` und `build` eintragen. `dev` braucht der Loop für den
   menschlichen App-Test — ohne bricht er in `app-review` ab.
3. `AGENTS.md`: Abschnitte *Kommandos*, *Projektstruktur*, *Konventionen* und *Versionen*
   füllen. Für den `implementer` ist das die einzige Quelle für Stilfragen.
4. `.harness/guard.ts`, Block *Projektspezifische Konfiguration*: Quellverzeichnisse
   (`SRC_DIRS`) und die Migrationskommandos des eigenen Stacks eintragen.
5. `tsconfig.json` und `jest.config.cjs` an den Stack anpassen (Frontend: `jsx` und `DOM`;
   Mappings für CSS-Mocks und Pakete mit `exports`-only-Subpfaden).
6. `.github/workflows/deploy.yml` füllen und `.github/CODEOWNERS` auf die eigenen Handles
   setzen. Das Ruleset aus `.github/rulesets/protect-main.json` im Repo aktivieren — es
   verlangt die Checks `typecheck`, `lint`, `test`, `harness` und `traceability`.
7. `pnpm install && pnpm test:harness` — muss grün sein, bevor der erste Change läuft.

## Bekannte Grenzen

- **Bash bleibt die breiteste Restfläche.** Die Erkennung von Schreibzielen und
  Testreferenzen ist musterbasiert; ein Agent, der Dateien über `node -e` oder ein Skript
  liest, wird nicht erfasst.
- **Der Rollen-Fallback des Guards braucht Eindeutigkeit.** Lässt sich aus einem Tool-Call
  kein Issue ableiten, gilt die Rolle des einzigen aktiven Runs. Laufen mehrere Issues
  gleichzeitig, bleibt der Aufruf bewusst rollenlos — parallele Runs sind nicht abgedeckt.
- **Der `implementer` hat kein `Edit`**, nur `Write`; er schreibt Dateien vollständig neu.
  Bewusst eng gehalten, aber bei großen Dateien teuer.
- **Der Hook-Aufruf ist relativ zum Arbeitsverzeichnis.** `settings.json` startet
  `node .harness/guard.ts`, und `guard.ts` sucht `.harness/runs/` ebenfalls relativ. Beides
  setzt voraus, dass Claude Code den Hook mit dem Projekt-Root als Arbeitsverzeichnis
  startet. Trifft das einmal nicht zu, findet der Hook sein Skript nicht (Exit 1 — kein
  Block) oder liest ein leeres `runs/` und hält jeden Aufruf für rollenlos. Bewusst nicht
  über `$CLAUDE_PROJECT_DIR` abgesichert: ist die Variable nicht gesetzt, ergäbe das
  `node /.harness/guard.ts` und damit dieselbe stille Wirkungslosigkeit — nur schwerer zu
  sehen. `.harness/tests/hook.test.ts` prüft den Hook deshalb ausdrücklich mit dem
  Projekt-Root als Arbeitsverzeichnis und kann diese Grenze nicht abdecken.
- **`confirm-red` kennt keinen Rundenzähler.** Läuft die Suite unerwartet grün, geht es
  zurück an den `test-author`, ohne dass eine Runde verbraucht wird.
