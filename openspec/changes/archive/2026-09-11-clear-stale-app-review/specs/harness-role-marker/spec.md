## ADDED Requirements

### Requirement: Eine App-Test-Ablehnung wird genau einmal verbraucht

Eine Ablehnung aus dem menschlichen App-Test (`confirm-app-review nein`) SHALL genau eine
Nacharbeit-Runde buchen — die, die `confirm-app-review` selbst über `next` auslöst. Sobald
der Lauf danach erneut die Phase `app-review` erreicht (Review „ok" nach der Nacharbeit),
SHALL die gespeicherte Ablehnung verworfen sein: `next` in dieser Phase SHALL
`present-app-review` liefern, den Rundenzähler unverändert lassen und keine Rolle setzen,
bis der Mensch erneut entscheidet.

Der Grund ist derselbe wie bei „Kein Verb senkt den Rundenzähler": der Zähler ist eine
Invariante des Skripts (`constitution.md` §8.1). Ein wiederholtes `next` ohne neue Eingabe
darf ihn weder senken noch erhöhen — sonst entscheidet die Zahl der Aufrufe, wann ein Lauf
eskaliert.

#### Scenario: Review „ok" nach einer App-Test-Ablehnung verbraucht die Ablehnung

- **GIVEN** ein Lauf in Phase `app-review`, dessen App-Test mit `nein` abgelehnt wurde, dessen
  Implementer-Runde danach ein grünes Gate und ein Review mit Empfehlung „ok" durchlaufen hat
- **WHEN** `next` in Phase `review` und danach noch zweimal `next` aufgerufen wird
- **THEN** liefert jeder der drei Aufrufe `present-app-review`, der Rundenzähler ist
  unverändert, die Phase bleibt `app-review`, und im Run-State liegt keine App-Test-Ablehnung
  mehr vor
