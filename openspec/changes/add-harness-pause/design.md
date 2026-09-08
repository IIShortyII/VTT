# Design

## D1 — Die Pause schreibt in den vorhandenen Marker, nicht in eine zweite Datei

`pause` setzt `.harness/runs/<issue>/active-role` auf `none`, statt einen eigenen
Pausen-Marker anzulegen, den `guard.ts` zusätzlich lesen müsste.

`guard.ts` liest genau eine Stelle, um zu entscheiden, was ein Aufruf darf. Ein zweiter
Zustandsträger daneben wäre eine zweite Wahrheit über dieselbe Frage — und die Sorte Fehler,
bei der beide Dateien für sich stimmig aussehen und der Guard trotzdem das Falsche tut.
`none` ist zudem schon heute der Wert, den `soleActiveRole()` herausfiltert; die Pause braucht
im Guard also gar keine eigene Kenntnis, sie fällt in eine bestehende Regel.

Der *Pausenzustand* selbst (Grund, Zeitpunkt, erfolgte Rundenrückgabe) gehört dagegen in
`status.json` unter ein Feld `paused`: das ist der Run-State, den `readStatus()` ohnehin lädt,
und der Ort, an dem der Orchestrator alle seine Entscheidungen herleitet. Der Guard liest ihn
nicht — er muss nur wissen, dass keine Rolle aktiv ist, und das steht im Marker.

## D2 — Automatenverben verweigern während der Pause, statt sie zu übergehen

Jeder Schrittwechsel läuft durch `emit()`, und `emit()` setzt als Seiteneffekt den
Rollenmarker. Ein `next` während der Pause würde also den Marker neu setzen und die Pause
beenden, ohne dass irgendwo „Pause vorbei" stünde — der Eingriff liefe dann unter genau der
Rolle, die ihn verbietet, und der Guard würde ihn ablehnen. Das ist der Zustand, den dieser
Change abschafft; ihn über einen Nebeneffekt wieder herzustellen wäre absurd.

Die Sperre sitzt deshalb in den Verben, nicht in `emit()`: `emit()` ist der Trichter *nach*
der Entscheidung, die Verben sind die Einstiegspunkte davor. Eine Sperre in `emit()` würde
zudem `pause`/`resume` selbst treffen, sobald sie je eine Aktion emittieren wollten.

Betroffen sind alle Verben, die Zustand fortschreiben oder Unterprozesse starten: `start`,
`next`, `gate`, `confirm-red`, `confirm-test-rework`, `confirm-app-review`, `record-review`,
`record-round-summary`, `cleanup`. `start` gehört ausdrücklich dazu: es überschriebe den
Run-State samt Pausengrund und riefe `next()`, setzte also den Marker neu — derselbe stumme
Pausenabbruch. Nicht betroffen: `pause`, `resume`, `board`, `escalate`, `preflight-archive`,
`build-impl-prompt`, `build-test-rework-prompt` — sie lesen nur bzw. sind ausdrücklich die
Werkzeuge des Menschen im Eingriff.

## D3 — `resume` leitet die Rolle aus der Phase ab, statt sie bei `pause` zu sichern

Der naheliegende Entwurf — `pause` merkt sich die Rolle, `resume` schreibt sie zurück — ist
der falsche. Während der Pause korrigiert der Mensch den Lauf; das ist ihr ganzer Zweck. Wird
dabei die Phase berichtigt (etwa nach einer Eskalation), wäre die gesicherte Rolle danach die
des falschen Schritts, und `constitution.md` §8.3 verlangt ausdrücklich das Gegenteil: der
Marker muss zum *anstehenden* Schritt passen.

`resume` liest daher den Run-State und schlägt die Rolle nach — im Regelfall über die Phase:

| Phase | Rolle |
|---|---|
| `red` | `test-author` |
| `implement` | `implementer` |
| `rework-tests` | `test-author` |
| `gate` | `none` |
| `review` | `reviewer` |
| `app-review` | `none` |
| `done`, `archived`, `escalated` | `none` |

**Die Phase allein genügt aber nicht.** In `gate` entscheidet der Automat feiner, und ein Zweig
davon ist kein Randfall, sondern der Normalbetrieb: nach einem grünen Gate emittiert `next()`
`invoke-reviewer` **ohne Phasenwechsel** — die Phase bleibt auf `gate`, während der gesamte
Reviewer-Schritt läuft, und der Marker steht die ganze Zeit auf `reviewer`. Wer dort pausiert,
bekäme von einer reinen Phasentabelle `none` zurück, wo der Automat `reviewer` gesetzt hätte.
`roleForStatus()` liest deshalb den Run-State: für `gate` gilt `reviewer`, wenn das Gate grün
war und keine Test-Findings offen sind, sonst `none`.

Die übrigen `gate`-Zweige (rotes Gate, offene Test-Findings) verlangen einen
**Zustandsübergang** — eine Nacharbeit-Runde mit erhöhtem Rundenzähler. Den vollzieht allein
`next()`. `resume` bleibt dort rollenlos und nimmt ihn weder vorweg noch löst er ihn aus; das
ist keine Lücke, sondern die Arbeitsteilung: `resume` stellt einen Zustand her, es bewegt ihn
nicht.

`next()` selbst taugt nicht als Quelle, denn genau diese Übergänge sind sein Seiteneffekt.

Die Drift wird mechanisch gesichert statt durch Sorgfalt: ein Test durchläuft jeden
**Run-State**, den der Automat unterscheidet — jede Phase plus alle `gate`-Zweige —, lässt
`next()` und `resume` getrennt darauf laufen und vergleicht. Wo `next()` einen Übergang
vollzieht, wird `none` erwartet, sonst Gleichheit. Die erste Fassung dieses Tests verglich nur
Phasen und übersah die `gate`-Divergenz genau deshalb.

## D4 — Rundenrückgabe: eine, nie unter null, und die Grenze ergibt sich von selbst

`--runde-zurueck` verringert den Zähler um genau eins. „Höchstens einmal je Pause" braucht keine
eigene Mechanik: `resume` beendet die Pause, es gibt also kein zweites `resume` innerhalb
derselben. Bei Zähler null wird die Rückgabe abgelehnt statt still ignoriert — ein still
ignoriertes Flag ließe den Menschen glauben, er habe eine Runde zurück, die er nicht hat, und
der Lauf eskalierte eine Runde früher als erwartet.

Der Grund der Rückgabe ist der Grund der Pause. Ein zweiter Pflichttext an dieser Stelle wäre
Doppelung: die Pause wird ja gerade deshalb eingelegt, weil etwas außerhalb der
Implementierung kaputt war, und genau dieser Text rechtfertigt die Rückgabe.

**Bekannte Grenze:** wiederholte `pause`/`resume`-Zyklen könnten Runden nachfüllen. Das ist
bewusst nicht weiter verriegelt. Der Pausenzustand selbst endet mit dem Fortsetzen und bleibt
nicht liegen — jede **Rückgabe** dagegen wird dauerhaft festgehalten, mit Zeitpunkt, Grund und
den beiden Zählerständen. Genau das ist der Missbrauchsvektor: Runden nachfüllen geht nur über
Rückgaben, und die stehen alle im Run-State. `constitution.md` §7.3 legt die Verantwortung
ohnehin beim freigebenden Menschen. Eine Verriegelung dagegen (etwa ein Gesamtbudget an
Rückgaben) würde eine Zahl erfinden, für die es keinen Anhaltspunkt gibt.

## D5 — Der Worktree als Lebenszeichen, nur im Fallback

`soleActiveRole()` bekommt zusätzlich zur Phasenprüfung die Bedingung, dass
`.harness/wt/<issue>/` existiert. Der Worktree ist das einzige Artefakt eines Laufs mit
sauberem Lebenszyklus: `start` legt ihn an, `cleanup` entfernt ihn. Phase und Marker dagegen
bleiben liegen, wenn ein Lauf abgebrochen wird — genau das ist bei `999001` passiert, dessen
Marker seitdem jeder Sitzung ohne zuordenbares Issue die Rolle `implementer` aufzwingt.

Die Prüfung greift **nur** im Fallback, nicht in `readRoleForIssue()`. Ergibt sich das Issue
aus Pfad oder Kommando, stammt es per Konstruktion aus einem `.harness/wt/<issue>/`-Pfad; die
Existenz dort noch einmal zu prüfen brächte nichts und würde einen `Write` auf eine noch nicht
angelegte Datei im Worktree zum Fail-Open machen.

Der Worktree-Pfad wird wie `runsDir` injizierbar (`makeDeps(runsDir, wtDir)`), aus demselben
Grund: Tests dürfen nicht gegen das echte `.harness/wt/` prüfen.

**Die Gegenrichtung muss mitgeschlossen werden.** Die Regel schafft einen Weg, auf dem der
Guard fail-*open* kippt: ein Marker ohne Worktree entzieht sich der Prüfung. Bisher verschluckte
`start` den Rückgabewert von `git worktree add` — schlug das Anlegen fehl, entstand ein Lauf mit
Marker, aber ohne Worktree, und jeder Aufruf ohne ableitbares Issue wäre danach rollenlos, also
ungeprüft. `start` bricht deshalb ab, bevor Marker und Run-State entstehen, wenn der Worktree
nicht da ist. Zwischen `start` und dem ersten `next` gibt es kein Fenster: der Worktree entsteht
vor `writeStatus` und vor dem Setzen des Markers.

## D6 — Pausieren ist ein Menschen-Kommando, und zwar notwendigerweise

Der erste Entwurf sperrte die Verben „aktiven Rollen" und ließ sie der Sitzung. Das ging nicht
auf, und der Grund ist grundsätzlich: **der Guard kann Sitzung und Subagent nicht
unterscheiden.** Er sieht einen Werkzeugaufruf und einen Rollenmarker, sonst nichts. Ein
`pnpm harness pause 12 "…"` der Sitzung enthält keinen `.harness/wt/<issue>/`-Pfad, das Issue
ist also nicht ableitbar, und `soleActiveRole()` liefert die Rolle des laufenden Issues — genau
`implementer`, wenn man pausieren will. Der Entwurf blockte damit den Fall, der eintreten
*muss*, und schützte den, der nicht eintreten *kann*: während einer Pause trägt der Marker
ohnehin `none`, `resume` war für jeden frei.

Also gilt: entweder darf kein Agent pausieren oder jeder. „Jeder" hieße, dass ein
`implementer`-Subagent die Sperre abschalten kann, unter der er steht — danach lägen ihm die
Testdateien offen, und `constitution.md` §2.2 wäre an dieser Stelle nur noch Konvention.

Deshalb: **kein Agent.** Der vorgesehene Kanal ist die Eingabe des Menschen. Nachgemessen an
diesem Repo: ein im Chat mit `!` abgesetztes Kommando durchläuft den PreToolUse-Hook nicht,
während derselbe Aufruf als Werkzeugaufruf der Sitzung blockiert wird. Der Mensch kann also
immer pausieren, der Agent nie. Die Sitzung *fordert* das Pausieren an, statt es auszuführen —
so steht es in `AGENTS.md` und in der Skill-Datei.

Das entwertet den Change nicht, es verschiebt nur, was er einlöst. Vorher schrieb der Mensch
eine Steuerdatei von Hand, undokumentiert und ohne dass der Automat davon wusste. Jetzt tippt
er ein Verb mit Pflichtgrund, der Lauf friert nachweislich ein, die Rückgabe einer Runde wird
protokolliert, und `resume` stellt die richtige Rolle wieder her, ohne dass er wissen muss,
welche. Genau das hat Issue #23 verlangt.

Mechanik: erfasst wird das Verb, nicht der Pfad
(`\b(?:harness|orchestrator\.ts)\s+(?:pause|resume)\b`), und die Regel steht **vor** allen
übrigen Bash-Regeln. Sonst träfe `pnpm harness pause 12 "jest.config kaputt"` zuerst die Sperre
für Testsuite-Aufrufe — `\bjest\b` matcht auch mitten in einem Begründungstext — und der
Aufrufer bekäme eine Begründung, die ihn in die Irre schickt. Sie gilt für **jede** Rolle, den
`reviewer` eingeschlossen: er trägt seinen Marker während des gesamten Review-Schritts und wäre
sonst der einzige, der sich entwaffnen könnte.

## D7 — Was dieser Change nicht anfasst

Die Obergrenze von drei Runden, die Gate-Reihenfolge, die Rot-Bestätigung und das
Rollenrouting bleiben unverändert. Die Pause ist ein Halt, keine Abkürzung: sie verschiebt
keinen Schritt und überspringt keinen.
