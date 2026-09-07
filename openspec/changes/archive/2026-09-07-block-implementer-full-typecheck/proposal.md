## Why

`constitution.md` §2.2 verlangt, dass der implementer die Tests nie sieht. Der Guard setzt das
über zwei Sperren durch: Deny-Read auf Testpfade und ein Verbot, die Testsuite auszuführen.
Beim ersten Feature-Run (#12) hat sich ein dritter Kanal gezeigt, den keine der beiden deckt.

`tsconfig.json` schließt `tests/**` in `include` ein. `pnpm typecheck` prüft die Testdateien
damit mit und gibt bei einem Fehler Pfad, Zeile, Symbolnamen und die betroffene Quellzeile
aus. Der implementer hat auf diesem Weg erfahren, wie die Tests seine Fabrikfunktion nennen,
und sie umbenannt — ohne es darauf anzulegen und ohne dass eine Sperre angeschlagen hätte.

Das ist kein Stilfehler, sondern trifft den Kern des Verfahrens: kann der implementer gegen
die Tests statt gegen die Spezifikation arbeiten, misst der Loop nicht mehr, was er zu messen
vorgibt. Siehe Issue #18.

## What Changes

- **Neu: `tsconfig.src.json`** — erbt von `tsconfig.json`, prüft ausschließlich `src/**`.
- **Neu: Skript `typecheck:src`** — `tsc --noEmit -p tsconfig.src.json`. Das ist der Typecheck,
  den der implementer fährt.
- **`guard.ts` sperrt dem implementer den vollen Typecheck** — inklusive eines nackten
  `tsc`-Aufrufs, der dieselbe Wirkung hätte. Die Meldung verweist auf `typecheck:src`, damit
  die Sperre nicht als Sackgasse erscheint.
- **Zwei bestehende Guard-Tests werden korrigiert**: `.harness/tests/guard.test.ts:66` und
  `:135` halten den heutigen Zustand ausdrücklich als gewollt fest.
- **`AGENTS.md` und `.claude/agents/implementer.md`** nennen die Grenze ausdrücklich — bisher
  ist dort nur von der Testsuite die Rede.

**Unverändert:** Das Gate fährt weiterhin den vollen Typecheck über `tests/`. Es läuft als
Subprozess des Orchestrators, nicht als Werkzeugaufruf einer Rolle, und ist von der Sperre
nicht betroffen — §3.2 bleibt wortgleich in Kraft. Auch für test-author und reviewer ändert
sich nichts.

**Nicht im Umfang:** Weitere Leckkanäle, die derselbe Run zutage gefördert hat (`pnpm build`,
Editor-Sprachdienste), sind hier weder untersucht noch geschlossen. Ebenso wenig die beiden
kosmetischen Harness-Befunde aus demselben Run (Backslash-Pfad in `seedChangeDocs`, fehlendes
`design.md` in `buildImplPrompt`) — jeder Befund bekommt seinen eigenen Change.

## Capabilities

### New Capabilities
- `harness-role-isolation`: Die Grenzen, die der Guard zwischen den Rollen des Loops
  durchsetzt — welche Werkzeugaufrufe einer Rolle erlaubt sind und welche ihr Testwissen
  verschaffen würden, das sie nach `constitution.md` §2.2 nicht haben darf.

### Modified Capabilities
Keine — `openspec/specs/` ist leer.

## Impact

- `tsconfig.src.json` (neu), `package.json` (ein Skript), `.harness/guard.ts`,
  `.harness/tests/guard.test.ts`, `AGENTS.md`, `.claude/agents/implementer.md`
- Kein Anwendungscode (`constitution.md` §1.4: Harness und Anwendung nie im selben PR)
- Keine neuen Dependencies

**Bekannte Nebenwirkung im CI:** Der `test`-Job des `pr-gate` läuft `pnpm test` gegen ein noch
leeres `tests/`-Verzeichnis auf `main` und endet mit „No tests found". Das gilt für jeden PR
gegen den aktuellen `main` und ist von diesem Change weder verursacht noch behoben.
