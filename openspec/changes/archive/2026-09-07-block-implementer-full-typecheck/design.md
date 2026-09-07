## Context

Der Guard (`.harness/guard.ts`) ist ein PreToolUse-Hook: er bekommt das Tool-JSON auf stdin,
leitet aus dem Pfad bzw. dem Kommando das Issue ab, liest dessen `active-role`-Marker und
entscheidet. Er kennt heute drei Sperren gegen Testwissen des implementers — Pfadrollen
(Regel 1), Suchwerkzeuge (Regel 2) und Bash-Umwege inklusive Testrunner (Regel 3). Der
Typecheck fällt durch alle drei.

Motivation: siehe `proposal.md` und Issue #18. Verhalten: siehe
`specs/harness-role-isolation/spec.md`.

## Goals / Non-Goals

**Goals:**
- Der Kanal ist geschlossen, ohne dem implementer die Typprüfung zu nehmen.
- Die Sperre ist als Guard-Test festgehalten, nicht nur als Kommentar.

**Non-Goals:**
- Keine Suche nach weiteren Leckkanälen. Dieser Change schließt den einen beobachteten.
- Keine Änderung an Gate, Rundenlogik oder Rollenrouting.

## Decisions

### D1 — Zweite Projektdatei statt Sperre ohne Ersatz

`tsconfig.src.json` erbt von `tsconfig.json` und überschreibt allein `include`:

```json
{ "extends": "./tsconfig.json", "include": ["src/**/*.ts", "src/**/*.tsx"] }
```

Verworfene Alternative: dem implementer den Typecheck ersatzlos verbieten. Das hätte ihn auf
Gate-Runden angewiesen gemacht, um Tippfehler zu finden — jede Runde zählt gegen §3.5, und
der Typecheck ist genau das Werkzeug, das strukturelle Fehler *ohne* Testwissen findet.
`AGENTS.md` weist Struktur und Mechanik ausdrücklich dem Typecheck zu (§4.2).

Verworfen auch: `tests/**` aus `tsconfig.json` herausnehmen und den Testtypen eine eigene
Projektdatei geben. Das hätte den Typecheck der Tests aus dem Standardlauf entfernt — Gate und
CI hätten Typfehler in Tests nicht mehr gesehen, ein schlechterer Tausch.

### D2 — Auch der nackte Compiler-Aufruf wird gesperrt

Die Sperre greift nicht nur beim Projektskript, sondern bei jedem `tsc`-Aufruf ohne Verweis
auf `tsconfig.src.json`. Ohne das wäre `npx tsc --noEmit` die offene Hintertür, und zwar die
naheliegende: sie steht in jeder TypeScript-Dokumentation.

Erkannt wird über zwei Muster — eines für das Skript (`pnpm|npm|yarn|npx … typecheck`, ohne
`:`-Suffix zu treffen), eines für den Compiler (`tsc`). Wer eines davon aufruft und dabei
weder `typecheck:src` noch `tsconfig.src.json` nennt, wird geblockt. Fail-closed: im Zweifel
sperren, der erlaubte Weg ist explizit zu benennen.

### D3 — Zwei bestehende Tests sind mit zu korrigieren

`.harness/tests/guard.test.ts:66` behauptet „erlaubt Typecheck und Lint", `:135` benutzt
`pnpm typecheck --pretty false` als Beispiel für ein „unbeteiligtes Kommando". Beide halten
die Annahme fest, die dieser Change widerlegt. Sie werden geändert, nicht gelöscht: der
Lint-Teil bleibt erhalten, das unbeteiligte Kommando wird `pnpm lint`.

## Risks / Trade-offs

- **Der implementer sieht Typfehler in Testdateien nicht mehr** → Genau das ist die Absicht.
  Sie fallen im Gate auf, das den vollen Lauf fährt, und ein Typfehler in einer Testdatei ist
  ohnehin ein Befund für den test-author, nicht für ihn.
- **Zwei Projektdateien können auseinanderlaufen** → `tsconfig.src.json` erbt und überschreibt
  nur `include`; jede Einstellung bleibt an einer Stelle.
- **`typecheck:src` scheitert, solange `src/` leer ist** → `tsc` meldet `TS18003` („No inputs
  were found"), wenn kein `include`-Muster greift. Das trifft genau den heutigen `main`, auf
  dem `src/` nur `.gitkeep` enthält, und endet mit dem ersten Change, der Quellcode bringt
  (#12, bereits geschrieben). Bewusst nicht umgangen: eine Platzhalterdatei nur zur
  Beruhigung des Compilers wäre Code ohne Zweck, und das Skript wird von keinem CI-Job
  gefahren. Ein implementer schreibt seine Dateien, bevor er den Typecheck braucht.
- **Die Mustererkennung ist umgehbar** (`node_modules/.bin/tsc`, ein Skript, das `tsc`
  aufruft) → Wie bei der bestehenden Testrunner-Sperre ist das best-effort gegen den
  Regelfall, nicht gegen böse Absicht. Der beobachtete Vorfall war beiläufig, nicht
  absichtlich; genau solche deckt die Sperre ab.

## Migration Plan

Keine. Reine Ergänzung: eine neue Projektdatei, ein neues Skript, eine zusätzliche
Guard-Regel. Rollback ist das Zurücknehmen des Commits.
