## Why

Der Zustandsautomat kennt nur Rollenzustände. Wer gerade am Zug ist, steht in
`.harness/runs/<issue>/active-role`, und `guard.ts` leitet daraus ab, was ein Werkzeugaufruf
darf. Es fehlt der Zustand dazwischen: der Moment, in dem der nächste sinnvolle Schritt
*keiner* Rolle gehört.

Im ersten Feature-Run (#12) trat er dreimal ein — `jest.config.cjs` mit kaputten
Regex-Escapes, ein fehlendes `--experimental-vm-modules` in `package.json`, eine fehlende
SQLite-Regel in `.gitignore`. Alle drei liegen außerhalb von `src/`, `prisma/` und `tests/`
und sind damit sowohl dem implementer als auch dem test-author gesperrt — und, weil der Guard
die Rolle aus dem Marker ableitet, auch der Sitzung selbst. Der Mensch musste den Marker jedes
Mal von Hand auf `none` setzen. Dieselbe Reibung entsteht bei jedem Befund, den
`constitution.md` §3.3 „ohne Zuordnung zu einer Rolle" an den Menschen eskaliert.

`constitution.md` §8.3 verlangt, dass ein Rollenfehler **vor** dem ersten Werkzeugaufruf
auffällt und nicht erst durch eine Guard-Ablehnung. Faktisch ist der Marker aber der einzige
Weg, den Guard zu beruhigen — und ihn zu setzen ist einer aktiven Rolle verboten
(`guard.ts`, Steuerdatei-Tabu). Das ist in sich konsistent, es fehlt nur der vorgesehene Weg.

Dazu kommt ein zweiter Befund, aufgenommen bei der Spezifikation dieses Change: In
`.harness/runs/999001/` liegt ein Lauf mit `phase: "implement"` und
`active-role: implementer`, der nie einen Worktree hatte. `soleActiveRole()` in `guard.ts`
hält jeden Lauf mit nicht-terminaler Phase für aktiv, findet also genau diesen einen Marker
und wendet ihn auf **jeden** Aufruf an, dem sich kein Issue zuordnen lässt — auch auf eine
Sitzung, die mit diesem Lauf nichts zu tun hat. Ein `pause` für den eigenen Lauf hilft
dagegen nicht: der vergiftende Marker gehört einem fremden. Beide Befunde beantworten
dieselbe Frage — *welche Rolle hat dieser Aufrufer gerade?* — und gehören deshalb in denselben
Change.

Siehe Issue #23.

## What Changes

- **Neu: Verb `pnpm harness pause <issue> "<grund>"`** — setzt den Rollenmarker auf `none`,
  hält Grund und Zeitpunkt im Run-State fest und lässt Phase wie Rundenzähler unberührt. Der
  Grund ist Pflicht: eine Pause ohne Anlass wäre genau die handgeschriebene Korrektur, die
  dieser Change ersetzen soll, nur mit einem Verb davor.
- **Neu: Verb `pnpm harness resume <issue>`** — beendet die Pause und stellt die Rolle wieder
  her, die dem **aktuellen** Schritt gehört. Die Rolle wird aus dem Run-State abgeleitet, nicht
  bei `pause` gesichert (design.md D3).
- **Ein pausierter Lauf steht still.** Jedes Verb, das den Automaten bewegt (`next`, `gate`,
  `confirm-red`, `record-review`, …), verweigert während der Pause und verweist auf `resume`.
  Ohne diese Sperre würde der nächste `next`-Aufruf über `emit()` den Marker neu setzen und
  die Pause unbemerkt beenden.
- **Keine Rundenrückgabe.** Der Entwurf sah eine vor — für Runden, die nur eine kaputte
  Umgebung gemessen haben statt einer Implementierung. Sie ist gestrichen: sie wäre nur über
  ein Verb einlösbar, jedes Verb ist von einem Agenten aufrufbar (der Guard sperrt nur, solange
  eine Rolle gilt), und die Rundenzahl läge damit im Ermessen eines Modells — was
  `constitution.md` §8.1 namentlich ausschließt (design.md D4).
- **`guard.ts`: die neuen Verben ins Steuerdatei-Tabu, für jede Rolle.** Die bestehende Regex
  sperrt den *Pfad* `.harness/runs/*/active-role`, aber kein *Kommando* — ohne Erweiterung
  könnte ein Subagent sich per `pnpm harness pause` selbst entwaffnen. Weil der Guard Sitzung
  und Subagent nicht unterscheiden kann, gilt die Sperre notwendig für beide: **pausieren und
  fortsetzen sind Kommandos des Menschen**, abgesetzt in seiner eigenen Shell, die den Hook
  nicht durchläuft. Die Sitzung fordert das Pausieren an, statt es auszuführen (design.md D6).
- **`guard.ts`: der Worktree als Lebenszeichen.** Ein Lauf zählt bei der Rollenermittlung im
  Fallback nur dann als aktiv, wenn `.harness/wt/<issue>/` existiert — zusätzlich zur
  bestehenden Phasenprüfung. `start` legt den Worktree an, `cleanup` entfernt ihn; ein Marker
  ohne Worktree hat nichts, woran er arbeiten könnte.
- **`AGENTS.md`** dokumentiert die beiden Verben, den menschlichen Kanal und die Schrittgrenze.
  **`.claude/skills/feature-loop/SKILL.md`** beschreibt, wann die Sitzung pausiert und dass
  nach einem Eingriff `resume` vor dem nächsten `next` steht.

**Unverändert:** Gate-Reihenfolge, Rot-Bestätigung, Rollenrouting, die Obergrenze von drei
Runden und das Verhalten des Guards bei direkt adressiertem Issue. Die Pause verschiebt keinen
Schritt, sie hält ihn an.

## Impact

- `.harness/orchestrator.ts` — zwei Verben, ein Pausenfeld im Run-State, eine Sperrklausel in
  den Automatenverben, eine Phase→Rolle-Tabelle.
- `.harness/guard.ts` — Steuerdatei-Tabu um die Verben erweitert, Lebenszeichen-Prüfung im
  Fallback.
- `.harness/tests/` — Tests zu diesem Change (`pnpm test:harness`).
- `AGENTS.md`, `.claude/skills/feature-loop/SKILL.md` — Dokumentation.

Kein Anwendungscode. Harness-Change nach `constitution.md` §1.4: eigener Branch, eigener PR,
nie im selben PR wie ein Feature.

## Voraussetzung

Der PreToolUse-Guard war bis Issue #29 wirkungslos: `settings.json` startete ihn als
`tsx .harness/guard.ts`, `tsx` war im PATH der Hook-Shell nicht auflösbar, und ein Hook, der
nicht mit Exit 2 endet, blockt nicht. Das ist behoben (`node .harness/guard.ts`, abgesichert
durch `openspec/specs/harness-guard-hook/spec.md`) und **hier vorausgesetzt**: sämtliche
Guard-Aussagen dieses Change gelten unter einem tatsächlich laufenden Hook. Beim ersten Entwurf
war das nicht der Fall, und genau deshalb fiel nicht auf, dass das Verb-Tabu die Sitzung selbst
aussperrt (siehe design.md D6).
