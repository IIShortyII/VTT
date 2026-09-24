## Why

Beim manuellen Test auf `main` (895b42c, 2026-09-21, Rolle Spieler) fiel links neben dem
Sitzungsnamen in der Spieler-Leiste ein goldener Kreis mit dem Anfangsbuchstaben des
Anzeigenamens auf. `PlayerBar.tsx` rendert ihn als Avatar
(`<span class="player-bar__avatar" role="img" aria-label={ownName}>{initial}</span>`,
player-bar #98, design.md D1). Er trägt keine Information, die nicht schon im Namen steht,
und wirkt wie ein Bedienelement, das keines ist. Issue #137 will ihn entfernen.

## What Changes

- **`player-bar`** — Requirement „Aufbau der Spieler-Leiste": die Identität der Spieler-Leiste
  besteht nur noch aus dem Namen der Spielsitzung (Überschrift der Ebene 1) und der
  Rollen-Pille; ein Avatar (Element der Rolle `img` mit dem Anzeigenamen) MUST NOT mehr in
  der Gruppe `Sitzung` stehen. Die Verbindungsanzeige (`role="img"`, `Verbindung aktiv` /
  `Verbindung getrennt`) bleibt unverändert.
- **`player-bar`** — Requirement „Stylesheet der Spieler-Leiste": `.player-bar__avatar` fällt
  aus der Selektorliste; es bleiben elf Leisten-Selektoren.
- Die Capability `ui-theme` nennt keine Leisten-Selektoren; das Stylesheet-Szenario der
  Spieler-Leiste gehört zu `player-bar`. Deshalb ändert sich nur `player-bar`.

## Impact

- Betroffene Specs: `player-bar` (zwei MODIFIED-Requirements).
- Betroffener Code: `src/client/session/PlayerBar.tsx` (Avatar-Span, Prop `ownName` und
  Ableitung `initial` entfallen), `src/client/session/SessionRoom.tsx` (Prop `ownName` wird
  nicht mehr übergeben; die lokale Ableitung `ownName` entfällt, `self` bleibt für die übrigen
  Verwendungen), `src/client/app/theme.css` (Regel `.player-bar__avatar` entfällt).
- Betroffene Tests: `tests/player-bar.unit.test.tsx` (Szenario „Leiste des Spielers trägt
  Identität, Zustand und drei Trigger") und `tests/player-bar-theme.unit.test.ts` (Szenario
  „Leisten-Selektoren vorhanden").
- Kein Serververtrag ändert sich; der Anzeigename des Spielers bleibt über die
  Teilnehmerkarten (Modal `Teilnehmer`) erreichbar.
- **Haupt-Spec fehlt:** Beim Archivieren von #98 wurde `openspec/specs/player-bar/spec.md`
  nicht angelegt; die Capability liegt nur als Delta unter
  `openspec/changes/archive/2026-09-15-add-player-bar/specs/player-bar/spec.md`. Beim
  Archivieren dieses Changes wird die Haupt-Spec zuerst aus diesem Archiv-Delta angelegt und
  danach das MODIFIED-Delta angewendet (siehe tasks.md 4.1).
