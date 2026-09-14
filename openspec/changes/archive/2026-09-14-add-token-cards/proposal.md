## Why

`TokenPanel.tsx` reiht heute je Token eine lange Zeile aneinander: Zuweisung, die fünf
Wertefelder als Formular, Schaden/Heilung, Conditions (Schnellwahl + Freitext), das ⋮-Menü
(#92). Es gibt keine visuelle Priorisierung — ein Token bei 2 von 50 HP sieht aus wie eines
bei voller Stärke, und das Anlege-Formular steht dauerhaft offen im Reiter `Tokens`
(#94 ließ dessen Form offen: „#95 entscheidet seine Form"). Die Spieler-Liste `Tokenwerte`
zeigt dieselben Werte als flachen Text.

Dieser Change (Issue #95, drittes Kind des Epics #103) macht aus jeder Token-Zeile eine
Karte: Kopf mit Symbol, Name und Zuweisungs-Pill, ein HP-Balken mit Anteil (unter 25 % rot),
`dl`-Wertezeilen, Conditions als Chips (Icon + Label, nie Farbe allein) und ein kompakter
Inline-Schaden/Heilung. Anlegen und die vollständige Werte-/Conditions-Bearbeitung wandern
in je ein Modal; das ⋮-Menü bündelt zusätzlich `Auf Karte zentrieren`.

Entscheidungen aus dem Issue-Text (#95, #103) und der Explore-Runde (2026-09-14):
- **Zwei Modale statt Inline-Formular.** Anlegen öffnet über `+ Token` im Panel-Kopf ein
  Modal; `Bearbeiten` im ⋮-Menü öffnet ein Modal mit den fünf Wertefeldern und der
  Conditions-Verwaltung (Schnellwahl + Freitext + Entfernen). Die Karte bleibt schlank.
  Schaden/Heilung bleibt als kompakte Inline-Eingabe auf der Karte (häufigste Aktion im
  Kampf, kein Modal wert).
- **Beide Rollen-Listen als Karten.** Auch die Spieler-Liste `Tokenwerte` wird zu
  (read-only) Karten mit HP-Balken und Chips — ein Kartenbild für die ganze Sitzung. Die
  Spieler-Karte trägt kein Anlege-/Bearbeiten-Modal; ihr ⋮-Menü hat nur `Freigeben…` und
  `Auf Karte zentrieren` aktiv.
- **`Auf Karte zentrieren` in #95.** Neuer Menüeintrag für jede Rolle; er zentriert die
  lokale Sicht der Kartenansicht auf die Ankerzelle des Tokens. Die Sichtmathematik bleibt
  eine reine Funktion (`viewport.ts`, `centerOn`), die Fassade bekommt `centerOn(cell)`, die
  Kartenansicht reicht ein Handle an die Raumansicht durch. Das echte Zentrieren nimmt der
  App-Test ab (Pixi nicht unit-getestet).
- **Neues Registry-Icon `locate`** (Lucide `LocateFixed`) für den Zentrier-Eintrag — ein
  Fadenkreuz ist eindeutiger als ein wiederverwendetes Symbol.

## What Changes

- **`session-token`** — Requirement „Tokenansicht im Raum": Token-Verwaltung (Spielleiter)
  und Liste `Tokenwerte` (Spieler) rendern je Token eine Karte (`article.token-card`) mit
  Kopf (Symbol · Name · Zuweisungs-Pill · ⋮-Trigger), HP-Balken (`--pct`, Low-Klasse unter
  25 %), `dl`-Wertezeilen und Condition-Chips. Anlegen läuft über einen Kopf-Knopf
  `Token anlegen`, der ein Modal öffnet; `Bearbeiten` öffnet ein Modal mit den fünf
  Wertefeldern und der Conditions-Verwaltung; Schaden/Heilung bleibt inline auf der Karte.
  Das ⋮-Menü erhält `Auf Karte zentrieren` (Icon `locate`, für jede Rolle aktiv) vor
  `Entfernen`.
- **`map-library`** — Requirement „Sicht mit Schwenken und Zoomen": die reine Sichtmathematik
  bekommt das Zentrieren auf einen Weltpunkt (`centerOn`), die Canvas-Fassade
  (`MapCanvasHandle`) die Methode `centerOn(cell)`.
- **`ui-icons`** — Requirement „Registry": neues Icon `locate` (Registry 55 → 56).

## Impact

- Betroffene Specs: `session-token`, `map-library`, `ui-icons`.
- Betroffener Code: `src/client/session/TokenPanel.tsx` (Umbau auf Karten + Modale),
  `src/client/session/TokenStats.tsx` (Spieler-Karten), `src/client/session/token-menu.ts`
  (Eintrag `Auf Karte zentrieren`), `src/client/map/viewport.ts` (reine `centerOn`-Funktion),
  `src/client/map/canvas.ts` (`MapCanvasHandle.centerOn`), `src/client/map/MapCanvas.tsx`
  (Handle an die Raumansicht durchreichen), `src/client/session/SessionRoom.tsx` (Modale,
  Karten-Verdrahtung, Zentrier-Ruf), `src/client/ui/icons.ts` (`locate`),
  `src/client/app/theme.css` (Karten-, Balken- und Chip-Stile).
- Kein Serververtrag ändert sich: dieselben `session:token-*`-Ereignisse, dieselbe
  serverseitige Filterung (`constitution.md` §9).
