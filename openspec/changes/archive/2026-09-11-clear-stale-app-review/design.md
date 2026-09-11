## Context

`next()` in `.harness/orchestrator.ts` ist der Automat des Loops. Im Zweig `review` mit
Empfehlung „ok" setzt er `phase = 'app-review'` und emittiert `present-app-review`. Im Zweig
`app-review` prüft er `s.lastAppReview`: fehlt sie → `present-app-review`; `freigegeben` →
`done`; sonst `reworkImplementer` (Runde buchen, Marker `implementer`). `confirmAppReview`
schreibt `lastAppReview` und ruft `next` sofort auf — damit ist die Runde für eine Ablehnung
gebucht. Beim nächsten Erreichen von `app-review` liegt dieselbe Ablehnung noch im Status.

## Decisions

### D1 — Verwerfen beim Übergang, nicht beim Buchen

`next()` löscht `lastAppReview` im `review`-Zweig, wenn die Empfehlung „ok" ist und die
Phase auf `app-review` wechselt. Nicht in `reworkImplementer` (dort weiß der Automat nicht,
ob er wegen der Ablehnung oder wegen eines Gates ruft) und nicht in `confirmAppReview` (das
Feedback muss für `build-impl-prompt` der folgenden Runde erhalten bleiben — Abschnitt
„Ablehnung aus dem menschlichen App-Test"). Der Übergang Review „ok" → `app-review` ist der
einzige Punkt, an dem feststeht: die Nacharbeit zu dieser Ablehnung ist durch.

Verworfen: *`lastAppReview` mit der Rundennummer versehen und nur dann auswerten, wenn sie
zur aktuellen Runde gehört* — mehr Zustand für denselben Effekt.

### D2 — Test als Ablauf, nicht als Zustandsbild

Das Szenario baut den echten Ablauf mit den bestehenden Verben (`confirmAppReview` → `next`
→ Status auf `review` mit „ok" → `next` → `next` → `next`) und prüft danach Aktion,
Rundenzähler, Phase und das Fehlen von `lastAppReview`. Ein Zustandsbild (`phase:
'app-review'` mit alter Ablehnung) würde den Fehler zwar auch zeigen, aber nicht belegen,
dass der normale Weg dorthin führt.

## Risks / Trade-offs

- **Feedback im Prompt der Folgerunde**: `build-impl-prompt` liest `lastAppReview` für den
  Abschnitt „Ablehnung aus dem menschlichen App-Test". Das Löschen geschieht erst nach dem
  Review der Nacharbeit — der Prompt der Nacharbeit-Runde ist dann längst gebaut. Eine
  zweite Ablehnung schreibt ohnehin neu.
- **Von Hand korrigierte Läufe**: `status.json` des Laufs zu #14 muss der Mensch einmalig
  zurücksetzen (Runde 2, Phase `app-review`, ohne `lastAppReview`); das Skript senkt den
  Zähler nicht (Requirement „Kein Verb senkt den Rundenzähler").
