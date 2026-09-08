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

Betroffen sind alle Verben, die Zustand fortschreiben oder Unterprozesse starten: `next`,
`gate`, `confirm-red`, `confirm-test-rework`, `confirm-app-review`, `record-review`,
`record-round-summary`, `cleanup`. Nicht betroffen: `pause`, `resume`, `board`, `escalate`,
`preflight-archive`, `build-impl-prompt`, `build-test-rework-prompt` — sie lesen nur bzw. sind
ausdrücklich die Werkzeuge des Menschen im Eingriff.

## D3 — `resume` leitet die Rolle aus der Phase ab, statt sie bei `pause` zu sichern

Der naheliegende Entwurf — `pause` merkt sich die Rolle, `resume` schreibt sie zurück — ist
der falsche. Während der Pause korrigiert der Mensch den Lauf; das ist ihr ganzer Zweck. Wird
dabei die Phase berichtigt (etwa nach einer Eskalation), wäre die gesicherte Rolle danach die
des falschen Schritts, und `constitution.md` §8.3 verlangt ausdrücklich das Gegenteil: der
Marker muss zum *anstehenden* Schritt passen.

`resume` liest daher die Phase und schlägt die Rolle in einer Tabelle nach:

| Phase | Rolle |
|---|---|
| `red` | `test-author` |
| `implement` | `implementer` |
| `rework-tests` | `test-author` |
| `gate` | `none` |
| `review` | `reviewer` |
| `app-review` | `none` |
| `done`, `archived`, `escalated` | `none` |

Diese Tabelle ist eine zweite Stelle, die dieselbe Zuordnung trifft wie `next()` — sie kann von
`next()` wegdriften, ohne dass es jemandem auffällt. `next()` selbst taugt nicht als Quelle:
es entscheidet nicht nach Phase allein (in `gate` hängt die Rolle zusätzlich an `lastGate` und
`pendingTestFindings`) und hat Zustandsübergänge als Seiteneffekt, die ein `resume` gerade
nicht auslösen darf.

Die Drift wird deshalb mechanisch gesichert statt durch Sorgfalt: ein Test durchläuft **jede**
Phase und vergleicht die von `resume` gesetzte Rolle mit der, die `next()` aus demselben
Run-State setzt. Kommt eine Phase hinzu oder ändert sich eine Zuordnung, fällt der Test um.

## D4 — Rundenrückgabe: eine, nie unter null, und die Grenze ergibt sich von selbst

`--runde-zurück` verringert den Zähler um genau eins. „Höchstens einmal je Pause" braucht keine
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

## D6 — Das Verb-Tabu erweitert die bestehende Regex, statt eine Regel danebenzustellen

Die Sperre für aktive Rollen sitzt heute in einer Regex auf dem Kommandotext
(`.harness/runs/*/active-role`, `guard.ts`). Die neuen Verben gehören in dieselbe Regex: es ist
dieselbe Frage (*darf dieser Aufrufer die Rollensteuerung anfassen?*), dieselbe Begründung und
dieselbe Fehlermeldung. Eine zweite Regel daneben würde nur die Wahrscheinlichkeit erhöhen,
dass später eine von beiden nachgezogen wird und die andere nicht.

Erfasst wird das Verb, nicht der Pfad: `harness\s+(pause|resume)\b`. Der Aufruf über das
`pnpm`-Skript ist der einzige vorgesehene Weg; ein direkter `tsx .harness/orchestrator.ts
pause`-Aufruf trifft dieselbe Regex, weil auch dort das Wort `pause` hinter `orchestrator.ts`
steht — deshalb matcht die Regex zusätzlich auf `orchestrator\.ts\s+(pause|resume)\b`.

## D7 — Was dieser Change nicht anfasst

Die Obergrenze von drei Runden, die Gate-Reihenfolge, die Rot-Bestätigung und das
Rollenrouting bleiben unverändert. Die Pause ist ein Halt, keine Abkürzung: sie verschiebt
keinen Schritt und überspringt keinen.
