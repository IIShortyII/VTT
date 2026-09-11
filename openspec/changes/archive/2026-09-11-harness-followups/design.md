## Context

Vier Stellen in `.harness/orchestrator.ts`, die nichts miteinander zu tun haben außer der
Herkunft (Issue #44) und der Größe:

- `emit()` ist der Trichter jedes Schrittwechsels und setzt dort schon Rollenmarker und
  Board-Status; `cleanup()` entfernt Worktree und Marker.
- `start()` legt Worktree, Change-Docs und Run-State an und ruft `next()`; `confirmRed()`
  bestätigt das Rot und setzt die Phase auf `implement`. `assertNoTestLeak(prompt, i, parts)`
  prüft den fertigen Prompt gegen Testpfade und -inhalt und hält mit Fundstelle an — bisher
  nur in `buildImplPrompt`.
- Der Dispatch nimmt für `record-round-summary` und `record-review` wahlweise `-` (stdin)
  oder das JSON als Argument.
- `removeUntrackedSourceDocs` fragt `git ls-files --error-unmatch` und liest den Exit-Code.

Motivation: `proposal.md` — Why, Issue #44 Punkte 4, 6, 7, 8.

## Decisions

### D1 — Portbelegung statt Prozesssuche (Punkt 4)

Das Issue schlug vor, nach Prozessen mit `.harness/wt/<issue>` in der Kommandozeile zu
suchen. Unter Windows startet `pnpm dev:server` den Server als `node --import tsx
src/server/index.ts` — relativ, ohne Worktree-Pfad; das Arbeitsverzeichnis eines fremden
Prozesses ist dort ohne Zusatzwerkzeug nicht lesbar. Was der Mensch braucht, ist ohnehin
etwas anderes: welcher Prozess den Port hält, den der neue Server gleich brauchen wird.

`busyPorts(run, platform)` liefert je belegtem Port aus `APP_PORTS = [3001, 5173]` PID und
Kommandozeile:

- **win32:** `netstat -ano -p tcp`, Zeilen mit lokaler Adresse `…:<port>` und Gegenstelle
  `0.0.0.0:0` bzw. `[::]:0` (horchend; die Statusspalte ist lokalisiert und wird nicht
  gelesen), letzte Spalte PID. Kommandozeile per
  `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>').CommandLine"`.
- **POSIX:** `ss -ltnpH`, Zeilen mit `:<port>` und `pid=<n>`; Kommandozeile per
  `ps -o args= -p <pid>`.

Scheitert das erste Werkzeug, liefert die Funktion keine Ports und einen `hinweis`; scheitert
nur die Kommandozeilen-Abfrage, bleibt die PID stehen. Die Funktion ist rein über `run`
und `platform`, damit beide Plattformen ohne echtes `netstat`/`ss` testbar sind.

`warnBusyPorts(run)` schreibt je Port eine Zeile auf stderr und ist Beiwerk wie das Board:
kein Rückgabewert, kein Abbruch, keine Änderung am Automaten. Aufgerufen in `emit()`, wenn
die Aktion `present-app-review` ist — derselbe Trichter, über den auch der Board-Status
`app-test` gesetzt wird —, und in `cleanup()` nach dem Entfernen des Worktree. `next()` und
`cleanup()` bekommen dafür einen optionalen `Sh`-Parameter, der an `emit()` durchgereicht
wird; alle internen Aufrufer von `next()` nutzen den Default.

### D2 — Der Leak-Wächter läuft in `start` und in `confirm-red` (Punkt 6)

Ein Check nur in `start` (Issue-Vorschlag) sieht die Tests von `origin/main`, nicht die des
Laufs — die Dateinamen aus dem #6-Fall existieren dort noch nicht. Deshalb zwei Stellen,
beide mit derselben Funktion und demselben Material wie `buildImplPrompt`:

- **`start`**, nach `seedChangeDocs` und vor `writeStatus`: `readChangeParts` aus dem
  Worktree, `assertNoTestLeak(formatChangeParts(parts), i, parts)`. Ein Treffer hält mit
  Fundstelle an, bevor Run-State und Rollenmarker entstehen — die Sitzung ist rollenlos und
  korrigiert die Docs direkt. Die Docs liegen dann bereits im Worktree (committed) und sind
  aus dem Hauptrepo entfernt; ein erneutes `start` findet den Worktree vor, überspringt das
  Seeding (Quelle fehlt) und prüft die korrigierten Docs erneut. Das ist der dokumentierte
  Weg nach einem Abbruch.
- **`confirm-red`**, nach bestätigtem Rot und vor dem Übergang nach `implement`: dieselbe
  Prüfung gegen die jetzt vorhandenen Tests. Ein Treffer hält an, die Phase bleibt `red`, der
  Marker `test-author`. Die Korrektur braucht eine Pause (Docs liegen außerhalb jeder Rolle),
  aber sie passiert vor dem Rollenwechsel, ohne dass `next` je `invoke-implementer` emittiert
  hätte — und ohne dass ein Rundenzähler oder Board-Status bewegt wurde.

Kein Rot aus dem falschen Grund: ein Leak-Treffer ist kein Testergebnis. `confirm-red`
meldet ihn als Abbruch (`fail`), nicht als `{ red: false }`.

### D3 — JSON nur über stdin (Punkt 7)

`jsonArgOrStdin(arg)`: `-` liest stdin, alles andere bricht ab und nennt den Grund. Ein
Argument-Weg, der auf einer Plattform je nach Inhalt bricht, ist kein Weg — er ist eine
Falle, die genau dann zuschnappt, wenn die Zusammenfassung Klammern enthält. Der Skill
verlangt seit Langem `-`; der Orchestrator erzwingt es jetzt.

### D4 — Tracked-Abfrage an der Ausgabe, nicht am Exit-Code (Punkt 8)

`git ls-files -- <pfad>` listet getrackte Dateien und ist bei „nichts getrackt" leise mit
Exit 0 und leerer Ausgabe. `--error-unmatch` macht daraus Exit 1 plus `error: pathspec …`
auf stderr, und `sh` reicht stderr des Kindprozesses durch. Entschieden wird jetzt an
`out.trim() !== ''`. Die Pfadspezifikation bleibt in Forward-Slashes
(`harness-path-matching`); die bestehenden Tests dazu werden auf die neue Antwortform
umgestellt (getrackt = nichtleere Ausgabe), ihr Szenario ändert sich nicht.

### D5 — Dokumentation statt Mechanik für den Server-Start

`pnpm dev:server` lädt keine `.env` (Vite tut das für den Client, tsx nicht für den Server).
Der funktionierende Aufruf für den App-Test steht in `AGENTS.md`; ein Harness-Verb dafür
gäbe es erst, wenn der App-Test selbst mechanisiert wird — das ist er nicht (§3.4:
Menschensache).
