## Why

Die Spieler-Liste `Tokenwerte` (`PlayerTokenList` in `TokenStats.tsx`) rendert seit #95
dieselben Karten wie die Token-Verwaltung: Kopf, HP-Balken, `dl`-Werte, Condition-Chips. Nur
freigegebene Werte je Token/Stat/Spieler erreichen den Client (#17, PR #66) — die Karte zeigt
ausschließlich, was im empfangenen Datensatz steht, sie blendet nichts clientseitig aus
(`constitution.md` §9.2). Was fehlt, ist eine sichtbare Rückmeldung, **wenn** ein Wert sich
ändert: Heilung sieht heute identisch aus wie ein unveränderter Zustand.

Dieser Change (Issue #99, Kind des Epics #104) gibt dem Spieler diese Rückmeldung: steigt ein
sichtbarer Zahlenwert eines Tokens gegenüber dem zuletzt empfangenen Bestand, pulsiert seine
Anzeige einmal (0,9 s, bewegungsabhängig); sinkt oder bleibt er, bleibt sie ruhig. Zusätzlich
präzisiert der Change den Leerzustand der Spieler-Liste auf die Zuweisungs-Perspektive des
Spielers.

Entscheidung aus dem Issue-Text (#99) und der Explore-Runde (2026-09-15):
- **Alle sichtbaren Zahlenwerte pulsieren bei Anstieg**, nicht nur `HP` — `HP` (aus `hp`),
  `Temp-HP`, `RK`, `Initiative`. Die Regel ist einheitlich (steigt → Puls) und passt zur
  wertneutralen Klasse `token-card__value--pulse`. Jeder Wert bekommt sein eigenes Szenario,
  damit `Temp-HP`/`RK`/`Initiative` nicht ungetestet mitlaufen.
- **Nur die Spieler-Liste pulsiert.** Der Puls ist ein Merkmal von `PlayerTokenList`; die
  gemeinsame `TokenCard` erhält einen optionalen Puls-Eingang, den nur die Spieler-Liste
  setzt. Die Token-Verwaltung des Spielleisters (`TokenPanel`) reicht ihn nicht durch und
  pulsiert nicht.
- **Puls nur bei bekanntem Vorwert.** Erscheint ein Wert erstmals (Betreten, neu zugewiesenes
  Token), pulsiert er nicht — ein Anstieg setzt einen früheren, niedrigeren Wert voraus.
- **Leerzustand nennt die Zuweisung.** Der Hinweis der leeren Spieler-Liste wechselt von
  „Sobald die Spielleitung Tokens auf die Karte setzt, erscheinen sie hier." zu
  „Die Spielleitung weist dir ein Token zu." — der Titel `Noch keine Tokens` bleibt.

## What Changes

- **`session-token`** — Requirement „Tokenansicht im Raum": jede Wertanzeige (`dd`) trägt die
  Klasse `token-card__value`. In der Spieler-Liste `Tokenwerte` trägt sie zusätzlich
  `token-card__value--pulse`, sobald ein `session:tokens`-Update den Zahlenwert über den zuvor
  empfangenen Bestand hebt (`HP` aus `hp`, `Temp-HP`, `RK`, `Initiative`); sinkt, bleibt gleich
  oder erscheint erstmals: keine Klasse. Der Puls ist einmalig (`animationend` entfernt ihn),
  bewegungsabhängig, und bleibt der Spieler-Liste vorbehalten. Der Leerzustand-Hinweis lautet
  neu „Die Spielleitung weist dir ein Token zu.".

## Impact

- Betroffene Specs: `session-token`.
- Betroffener Code: `src/client/session/TokenStats.tsx` (`TokenCard` erhält den optionalen
  Puls-Eingang und die Basisklasse `token-card__value` je `dd`; `PlayerTokenList` merkt sich
  den zuletzt empfangenen Bestand und leitet die gestiegenen Werte ab),
  `src/client/i18n/de.ts` und `src/client/i18n/en.ts` (`empty.tokenValues.hint`),
  `src/client/app/theme.css` (`.token-card__value--pulse` + `@keyframes value-pulse` im
  bestehenden `@media (prefers-reduced-motion: no-preference)`-Block).
- Kein Serververtrag ändert sich: dieselben `session:tokens`-Ereignisse, dieselbe
  serverseitige Filterung (`constitution.md` §9). Der Puls ist reine, aus zwei aufeinander
  folgenden autoritativen Beständen abgeleitete Präsentation.
