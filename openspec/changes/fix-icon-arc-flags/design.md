# Design — fix-icon-arc-flags (#124)

## D1. Wo normalisiert wird

Die Normalisierung sitzt in `src/client/ui/icon-svg.ts`, nicht in `canvas.ts`: `iconSvg` ist
die einzige Stelle, an der Registry-Icons zu SVG-Text für Pixi werden, und das Modul ist ohne
Pixi testbar (`react-dom/server` läuft unter der `node`-Umgebung von Jest). `canvas.ts`
bleibt beim Aufruf `new Graphics().svg(iconSvg(name, hex(color)))`.

Neu exportiert: `normalizeArcFlags(d: string): string` — eine reine Funktion auf dem Inhalt
eines einzelnen `d`-Attributs.

`iconSvg` rendert wie bisher per `renderToStaticMarkup`, ersetzt danach den Wert jedes
`d="…"`-Attributs im Markup durch `normalizeArcFlags(<wert>)` und legt erst das Ergebnis im
Cache ab. Alle übrigen Attribute (`stroke`, `width`, `viewBox` …) bleiben unverändert.

## D2. Regel von `normalizeArcFlags`

Grundlage ist die SVG-Pfadgrammatik: ein Arc-Befehl (`A`/`a`) hat je Segment sieben Parameter
`rx ry x-axis-rotation large-arc-flag sweep-flag x y`; weitere Segmente desselben Befehls
folgen ohne erneuten Befehlsbuchstaben. Die Flags (Parameter 4 und 5) sind je genau ein
Zeichen `0` oder `1` und dürfen laut Grammatik ohne Trenner an den Folgeparameter stoßen.

Die Funktion liest die Pfaddaten als Folge von Befehlsbuchstaben und Zahlen. Innerhalb eines
Arc-Befehls zählt sie Parameter modulo 7; an Position 4 und 5 liest sie **genau ein Zeichen**
(`0`/`1`) als Flag, nicht eine ganze Zahl. Ausgabe:

- Zwischen Flag 4 und Flag 5 sowie zwischen Flag 5 und Parameter 6 steht genau ein
  Leerzeichen, **wenn dort im Original kein Trenner stand**. Ein vorhandener Trenner
  (Leerzeichen, Komma, oder das Vorzeichen `-` des Folgeparameters) bleibt wie er ist.
- Zwischen Parameter 3 und Flag 4 gilt dasselbe (Lucide schreibt dort zwar stets ein
  Leerzeichen, die Grammatik verlangt es aber nicht).
- Alles andere — Befehlsbuchstaben, Zahlen außerhalb der Flags, kompakte Zahlenfolgen wie
  `.5.5` oder `1-1.414` in anderen Befehlen — bleibt zeichengenau erhalten.

Beispiele (verbindlich, siehe Spec):

| Eingabe | Ausgabe |
|---|---|
| `M9 16a5 5 0 016 0` | `M9 16a5 5 0 0 1 6 0` |
| `A2 2 0 0021 5.172` | `A2 2 0 0 0 21 5.172` |
| `a1.6 1.6 0 012.277 0` | `a1.6 1.6 0 0 1 2.277 0` |
| `a1.5 1.5 0 00-2.474-1.561` | `a1.5 1.5 0 0 0-2.474-1.561` |
| `a1 1 0 011 1 1 1 0 012 2` | `a1 1 0 0 1 1 1 1 1 0 0 1 2 2` |
| `M3 11a10 10 0 0 1 10 10` | unverändert |
| `M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18` | unverändert |

Die Funktion ist damit idempotent: auf ihre eigene Ausgabe angewandt ändert sie nichts.

## D3. Prüfbarkeit gegen alle Registry-Icons

Ein Szenario rendert `iconSvg(name, '#ffffff')` für jeden Namen aus `ICON_NAMES`, zieht alle
`d`-Attribute aus dem Markup (`/\sd="([^"]*)"/g`) und verlangt, dass jedes ein Fixpunkt von
`normalizeArcFlags` ist — das belegt, dass `iconSvg` die Normalisierung anwendet, für jedes
heutige und künftige Registry-Icon. Zusätzlich muss das Markup von `frightened` die
Zeichenfolge `d="M9 16a5 5 0 0 1 6 0"` enthalten (konkreter Anker, damit eine leere oder
identische Normalisierung den Fixpunkt-Test nicht trivial besteht).

Der Pixi-Parser selbst läuft in Jest nicht (WebGL/DOMParser, AGENTS.md „Tests"); die
Parsbarkeit durch Pixi nimmt der App-Test ab.

## D4. Fehlerfang in `iconGraphics` (ohne Szenario)

`iconGraphics(name, color, size)` in `src/client/map/canvas.ts` klammert
`new Graphics().svg(…)` in `try/catch`. Im Fehlerfall:

- `console.error('Icon konnte nicht gezeichnet werden:', name, error)` — kein stilles
  `catch {}` (AGENTS.md „Konventionen"); der Fehler wird gemeldet, nur nicht weitergeworfen.
- Rückgabe ist eine **leere** `Graphics` mit denselben `pivot`/`scale`-Einstellungen wie im
  Erfolgsfall; zuvor angelegte, halb befüllte Grafik wird per `destroy()` freigegeben. Die
  Aufrufer (Token-Symbol, Markierungs-Slots) bleiben unverändert und platzieren eine leere
  Grafik — das Token selbst, sein Name und die übrigen Markierungen erscheinen weiter.

Begründung für den Verzicht auf ein Szenario: `canvas.ts` hat keine Testumgebung (kein
Pixi-Modul-Mock, die Fassade ist in allen Komponententests gemockt), und der Aufbau eines
Mocks für `createMapCanvas` stünde in keinem Verhältnis zu vier Zeilen Fehlerfang. Mit D1–D3
tritt der Fall für Registry-Icons nicht mehr auf; der Fang ist Absicherung gegen künftige
Parser-Eigenheiten. Abnahme: reviewer (Code) und menschlicher App-Test.

## D5. Testdatei

Die Szenarien von „Icon-Markup für die Karte" landen in `tests/icon-svg.unit.test.ts`
(Umgebung `node`, kein jsdom-Docblock nötig). Importe:
`normalizeArcFlags` und `iconSvg` aus `src/client/ui/icon-svg.ts`, `ICON_NAMES` aus
`src/client/ui/icons.ts`.
