## Why

Aktionen an einer Zeile haben heute keinen gemeinsamen Ort: die Token-Zeile trägt einen
Knopf `Entfernen`, ein Auswahlfeld zum Zuweisen und ein Kästchenraster für Freigaben, die
Karten-Zeile im Raum zwei Knöpfe, die Bibliothekskarte einen Knopf mit dem Kartennamen, das
Konto in der Top-Bar den Nutzernamen neben `Abmelden`, die Passwortänderung ein
`<details>` unter der Sitzungsliste. Der Sitzungscode steht dauerhaft im Klartext im Raum.
Die Kartenfläche hört nur `pointerdown`/`move`/`up`/`wheel`; ein Rechtsklick auf ein Token
öffnet das Browser-Menü. Dieser Change (Issue #92, fünftes und letztes Kind des Epics
#102) führt Kontextmenüs und einen Info-Popover als Bausteine ein und setzt sie an sechs
Stellen ein, die zusammen jede Mechanik des Bausteins einmal beweisen.

Entscheidungen aus dem Issue-Text (#92, #102) und der Explore-Runde (2026-09-13):
- **Neue Capability `ui-menu`** mit drei Bausteinen in einem Modul: Menü (`role="menu"`),
  Trigger in drei Formen (⋮, Text mit Chevron, Icon-only) und Popover (`role="dialog"`,
  nicht modal). Der Popover gehört zu den Menüs, nicht zu `ui-dialog`: er teilt die
  Schwebe-Mechanik (Anker, Klemmen, Klick außerhalb, Fokusrückgabe), nicht den Fokus-Trap
  des Modals.
- **Sechs Einsätze.** Token-Zeile (⋮ und Rechtsklick), Token auf der Karte (Rechtsklick),
  Karten-Zeile der Kartenverwaltung, Bibliothekskarte, Kontomenü in der Top-Bar,
  Sitzungscode-Popover. Nicht dabei: Sitzungskarten der Startansicht (eine Aktion),
  Fog-Bereiche und Anmerkungen (je nur `Entfernen`, bleibt bis #96), Teilnehmerzeilen (#97).
- **Token-Menü ohne neue Server-Events.** `Bearbeiten` setzt den Fokus in das Feld
  `<Name> HP` der Zeile; `Zuweisen…` öffnet ein Modal mit Auswahlfeld `Spieler`;
  `Freigeben…` öffnet ein Modal mit dem bestehenden Kästchenraster; `Entfernen` ist der
  gefährliche letzte Eintrag und läuft über den Bestätigungsdialog. Auswahlfeld und
  Kästchenraster verschwinden damit aus der Zeile. Aktiv sind `Bearbeiten`, `Zuweisen…`
  und `Entfernen` nur für den Spielleiter (Rolle aus dem Enter-Acknowledgement),
  `Freigeben…` genau dann, wenn `shares` des Tokens nicht `null` ist — also für die
  Empfänger, denen der Server Freigaben sendet (`constitution.md` §9.3). Gesperrte Einträge
  bleiben sichtbar und `aria-disabled`. Die Liste `Tokenwerte` des Spielers bekommt dieselben
  ⋮-Menüs, damit ein Spieler am Touch-Gerät ohne Rechtsklick an seine Freigaben kommt.
- **Rechtsklick nur außerhalb von Formularfeldern.** Auf einem Eingabefeld, Auswahlfeld oder
  einer Schaltfläche bleibt das Browser-Menü (Einfügen). Die Kartenfläche unterdrückt
  `contextmenu` immer; ein Rechtsklick ins Leere tut nichts.
- **Kontomenü.** Der Nutzername wird zum Trigger „`<Nutzername>` ▾" mit `Passwort ändern`
  (Modal mit dem bestehenden Formular, das nach einem Erfolg schließt) und `Abmelden`
  (kein gefährlicher Eintrag). Das `<details>` unter der Sitzungsliste entfällt.
- **Sitzungscode maskiert.** `Code: ••••••` plus Icon-only-Trigger `Sitzungscode anzeigen`;
  der Popover zeigt den Code im Klartext und `Kopieren` (Toast wie bisher). Der Klartext
  steht damit nicht dauerhaft auf einem geteilten Bildschirm. Nur der Spielleiter erhält
  den Code vom Server — unverändert.
- **Trefferfläche ohne zweites `@media`.** Das Issue nennt 44 px unter `pointer: coarse`;
  der Format-Vertrag von `ui-theme` erlaubt nur die Bewegungsabfrage. Trigger und
  Menüeinträge bekommen deshalb überall mindestens 36 px (wie `.icon-button`), keine
  Abfrage des Zeigertyps.
- **Auswahl eines Eintrags gibt den Fokus vor `onSelect` zurück** — damit ein Modal oder
  Bestätigungsdialog, den der Eintrag öffnet, den Trigger als Auslöser vorfindet und der
  Fokus nach dem Dialog wieder auf dem Trigger landet. Genau diese Verkettung braucht #95.
- **Alle neuen Texte über `ui-text`** in beiden Sprachen (Regel aus #87 für Epic B–D).

## What Changes

- **Neue Capability `ui-menu`:** Modul `src/client/ui/menu.tsx` mit `useFloating`,
  `ActionMenu`, `MenuTrigger`, `ActionMenuButton`, `Popover`; Stylesheet-Abschnitt.
- **`session-token` (MODIFIED „Tokenansicht im Raum"):** je Token-Zeile (Verwaltung und
  `Tokenwerte`) ein ⋮-Menü `Aktionen für <Name>` mit `Bearbeiten`, `Zuweisen…`,
  `Freigeben…`, `Entfernen`; Rechtsklick auf die Zeile und auf das Token der Karte öffnen
  dasselbe Menü; Zuweisen und Freigaben in Modals; Entfernen mit Bestätigungsdialog. Das
  Auswahlfeld `<Name> zuweisen`, die Schaltfläche `<Name> entfernen` und die
  Freigabe-Kästchen in der Zeile entfallen.
- **`session-map` (MODIFIED „Kartenansicht im Raum"):** je eingehängter Karte ein Menü
  `Aktionen für <Name>` mit `Aktivieren` und `Aushängen` statt zweier Schaltflächen.
- **`map-library` (MODIFIED „Bibliotheksoberfläche"):** je Bibliothekskarte ein Menü
  `Aktionen für <Name>` mit `Öffnen` und `Löschen` (Bestätigungsdialog, `DELETE`, Liste
  neu laden); der Knopf mit dem Kartennamen bleibt.
- **`ui-shell` (MODIFIED „Top-Bar"):** Konto als Menü-Schaltfläche (Text = Nutzername) mit
  `Passwort ändern` und `Abmelden`.
- **`user-auth` (MODIFIED „Passwortänderung in der Oberfläche"):** das Formular liegt in
  einem Modal `Passwort ändern`, erreichbar über das Kontomenü; nach einem Erfolg schließt
  das Modal.
- **`game-session` (MODIFIED „Sitzungsoberfläche"):** Sitzungscode maskiert, Popover
  `Sitzungscode` mit Klartext und `Kopieren`.
- **`ui-start` (MODIFIED „Stylesheet der Startansicht"):** der Selektor `.start-account`
  entfällt (elf statt zwölf Start-Selektoren).
- **Wörterbücher (`ui-text`):** Schlüssel `menu.*`, `shell.account`,
  `shell.changePassword`, `session.showCode`, `session.code`, `token.assign.*`,
  `token.share.title`, `token.remove.*` in `de` und `en`; `start.account.password` entfällt.

## Capabilities

### New Capabilities
- `ui-menu`: Aktionsmenü, Trigger, Popover — Markup, Rollen, Tastatur, Klemmen,
  Fokusrückgabe, Stylesheet.

### Modified Capabilities
- `session-token`: Requirement „Tokenansicht im Raum" (Token-Menü in Verwaltung, `Tokenwerte`
  und auf der Karte; Zuweisen- und Freigaben-Modal; Bestätigung vor Entfernen).
- `session-map`: Requirement „Kartenansicht im Raum" (Menü je eingehängter Karte).
- `map-library`: Requirement „Bibliotheksoberfläche" (Menü je Bibliothekskarte, Löschen aus
  der Liste).
- `ui-shell`: Requirement „Top-Bar" (Kontomenü).
- `user-auth`: Requirement „Passwortänderung in der Oberfläche" (Modal statt `<details>`).
- `game-session`: Requirement „Sitzungsoberfläche" (maskierter Code, Popover).
- `ui-start`: Requirement „Stylesheet der Startansicht" (ohne `.start-account`).
- `ui-text`: Requirement „Sprachschalter in der Top-Bar" (die englischen Szenarien der
  Start- und Raumansicht finden `Log out` im Kontomenü und den Code im Popover).

## Impact

- Neu: `src/client/ui/menu.tsx`, `src/client/session/token-menu.ts` (Einträge des
  Token-Menüs aus Token, Rolle und Texten).
- Geändert (Client): `src/client/session/TokenPanel.tsx`, `TokenStats.tsx`,
  `SessionRoom.tsx` (Token-Menü der Karte, Zuweisen-/Freigaben-Modal, Bestätigung,
  Sitzungscode-Popover), `MapPanel.tsx`, `src/client/map/MapLibrary.tsx`,
  `src/client/map/canvas.ts` und `MapCanvas.tsx` (`onTokenContextMenu`, `contextmenu`
  unterdrückt, `rightdown` auf Token-Containern), `src/client/app/AppShell.tsx`
  (Kontomenü, Prop `onChangePassword`), `App.tsx` (Passwort-Modal),
  `src/client/auth/ChangePasswordForm.tsx` (Prop `onSuccess`),
  `src/client/session/SessionList.tsx` (ohne `<details>`), `src/client/i18n/de.ts`,
  `en.ts`, `src/client/app/theme.css` (Abschnitt „Menüs", Regel `.start-account`
  entfällt).
- Unverändert: Server, `shared/`, Prisma-Schema, Socket-Verträge, Toast, Modal, Formular,
  Zustandsanzeigen, Icon-Registry (kein neues Icon: `more`, `chevronDown`, `info`, `edit`,
  `user`, `players`, `delete`, `map`, `close`, `lock`, `logout` sind vorhanden).
- Keine neue Dependency.
- Bestehende Tests: Szenarien, die `Abmelden` als Schaltfläche der Top-Bar, das
  `<details>` der Passwortänderung, die Schaltflächen `<Name> aktivieren`/`aushängen`/
  `entfernen`, das Auswahlfeld `<Name> zuweisen`, die Freigabe-Kästchen in der Zeile oder
  den Klartext-Code neben `Kopieren` adressieren, ändern ihre Erwartung (Namen bleiben).
