## Why

Der Reiter `Teilnehmer` ist heute ein `<ul>` (`SessionRoom.tsx:1395`): je Mitglied ein
`<li>` mit Anzeigename und Präsenz als Text „anwesend"/„abwesend"; die eigene Zeile trägt
ein inline geöffnetes Alias-Formular, und `Austreten`/`Entfernen` (#70) sind blanke Buttons
ohne Bestätigung. Das ist der letzte Bereich des Spielleiter-Pults (#103), der noch die alte
lineare Form trägt, während Tokens (#95) und Werkzeuge (#96) bereits als Karten bzw.
Icon-Leisten stehen. Es fehlt außerdem ein Ort, an dem der Spielleiter zum Einladen an den
Sitzungscode kommt, ohne die Session-Bar zu bemühen, und der Bezug „welcher Spieler hat
welche Tokens" ist im Teilnehmerbereich unsichtbar.

Dieser Change (Issue #97, fünftes und letztes Kind des Epics #103) macht aus jedem Mitglied
eine Karte (`article.participant-card`): Avatar-Kreis, Anzeigename, Rollen-Pill, Präsenz als
Punkt + Text und die diesem Mitglied zugewiesenen Tokens als Chips. Die eigene Karte trägt
`Alias ändern` (öffnet ein Modal statt des Inline-Formulars). Ein ⋮-Menü (#92) bündelt die
Aktionen; destruktive laufen über den Confirm-Baustein (#89). Ein Popover `Einladen` (#92)
stellt dem Spielleiter den maskierten Code mit Kopieren-Aktion bereit.

Entscheidungen aus dem Issue-Text (#97, #103) und der Explore-/Grill-Runde (2026-09-14):
- **Alias wandert ins Modal.** `Alias ändern` (✎) auf der eigenen Karte öffnet ein Modal
  (`ui-dialog`) mit dem Feld `Alias` und `Alias setzen`; das Inline-Formular entfällt. Der
  Sendeweg (`session:alias`, `AliasAck`) und die serverautoritative Benennung
  (`constitution.md` §9.1) bleiben unverändert.
- **Alle Kartenaktionen im ⋮-Menü, destruktive hinter Confirm.** Die fremde Spielerkarte
  (Spielleiter) trägt `Tokens zuweisen` und `Entfernen` (danger); die eigene Spielerkarte
  trägt `Alias ändern` und `Austreten` (danger); die eigene Spielleiter-Karte nur
  `Alias ändern`. `Austreten`/`Entfernen` senden wie bisher `DELETE
  /api/sessions/:id/members/:userId`, jetzt aber erst nach einem Bestätigungsdialog (#89,
  Epic-#103-Vorgabe „nie über einen Zwei-Klick-Button"). Ein Spieler sieht an fremden Karten
  keine Aktionen (§9.3, serverseitige Rolle entscheidet).
- **Zugewiesene Tokens als Chips + Zuweisen-Modal.** Jede Karte zeigt die Tokens, deren
  `ownerId` gleich ihrer `userId` ist, als read-only Chips (`ownerId` ist öffentliche
  Tokendarstellung, §9.2). Der ⋮-Eintrag `Tokens zuweisen` (nur Spielleiter, nur an
  Spielerkarten) öffnet ein Modal, in dem der Spielleiter je Sitzungs-Token an-/abwählt, ob
  es diesem Mitglied gehört; jede Umschaltung sendet das bestehende `session:token-assign`
  (`session-token`, „Token zuweisen") mit `ownerId` = `userId` bzw. `null`.
- **`Einladen`-Popover zusätzlich zur Session-Bar.** Der Teilnehmer-Panel-Kopf trägt für den
  Spielleiter einen Trigger `Einladen`, der ein Popover (`ui-menu`, „Popover") mit dem
  maskierten Code und `Code kopieren` zeigt; der Klartext steht nie in der Ansicht (§9.2), das
  Kopieren legt ihn in die Zwischenablage und löst den Toast `Sitzungscode kopiert` aus. Der
  Code der Session-Bar (#93) bleibt unberührt.
- **Kein neuer Serververtrag, kein neues Icon.** Alle Ereignisse (`session:alias`,
  `session:token-assign`, `DELETE …/members/:userId`) bestehen; alle Icons (`edit`, `more`,
  `token`, `logout`, `delete`, `copy`, `players`) sind in der Registry. Rollen-Pill nutzt die
  bestehenden Labels `session.role.gm`/`session.role.player`.

## What Changes

- **`game-session`** — Requirement „Sitzungsoberfläche" (MODIFIED): der Reiter `Teilnehmer`
  rendert Karten statt einer Liste; der Alias liegt hinter `Alias ändern` im Modal;
  `Austreten`/`Entfernen` liegen im ⋮-Menü und laufen über einen Bestätigungsdialog. Die
  serverbezogenen Sendewege bleiben. Neues Requirement „Teilnehmerkarten" (ADDED): Aufbau der
  Karte (Avatar, Name, Rollen-Pill, Präsenzpunkt, Token-Chips), das ⋮-Menü je Rolle, die
  Bestätigungsdialoge, das `Einladen`-Popover und das Zuweisen-Modal.
- **`session-tabs`** — Requirement „Bereiche der Raumansicht" (MODIFIED): der Inhalt des
  Reiters `Teilnehmer` sind die Teilnehmerkarten statt „Teilnehmerliste und Alias-Formular";
  die beiden Szenarien, die das Textfeld `Alias` bzw. die Liste adressieren, werden auf
  Karten und das `Alias ändern`-Modal umgestellt (Szenarionamen bleiben).

## Impact

- Betroffene Specs: `game-session`, `session-tabs`. Kein `session-token`-Vertrag ändert sich
  (die Zuweisung nutzt das bestehende `session:token-assign`); keine `ui-icons`-Änderung.
- Betroffener Code: `src/client/session/SessionRoom.tsx` (Reiter `Teilnehmer` auf Karten,
  Alias-/Zuweisen-Modal-Zustände, ⋮-Menü je Karte, Confirm für `Austreten`/`Entfernen`,
  `Einladen`-Popover), ggf. neue Komponenten `ParticipantCard`/`AliasForm`/`AssignTokensForm`
  im selben Bereich, `src/client/i18n/de.ts` + `en.ts` (neue Schlüssel `presence.*`,
  `alias.*`, `menu.assignTokens`, `invite.*`, `participant.*`),
  `src/client/app/theme.css` (Karten-, Avatar-, Präsenz-, Rollen-Pill-Stile).
- Kein Servercode, kein Schema, keine Migration.
