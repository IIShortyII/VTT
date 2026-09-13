## 1. Baustein und Wörterbücher

- [x] 1.1 `src/client/ui/menu.tsx` nach design.md D1–D4 anlegen (`useFloating` mit stabilen Funktionen, `ActionMenu` mit Klemmen, roving `tabindex`, Tastatur, Klick außerhalb und Auswahlreihenfolge Fokus → schließen → `onSelect`, `MenuTrigger` in drei Varianten, `ActionMenuButton`, `Popover`); prüfen: `pnpm typecheck:src` und `pnpm lint` grün, Importe nur `react`, `Icon` und der Typ `IconName`
- [x] 1.2 Schlüssel aus design.md D10 in `src/client/i18n/de.ts` und `en.ts` ergänzen, `start.account.password` in beiden entfernen; prüfen: `pnpm typecheck:src` grün (Schlüsselgleichheit), Texte buchstabengleich zur Tabelle

## 2. Token-Menü

- [x] 2.1 `src/client/session/token-menu.ts` nach design.md D5 (`tokenMenuEntries` mit vier Einträgen, Sperren aus Rolle und `shares`); `TokenPanel.tsx` und `TokenStats.tsx` auf ⋮-Trigger, Rechtsklick und `menuEntries`-Prop umstellen, Schaltfläche `<Name> entfernen`, Auswahlfeld `<Name> zuweisen` und `TokenShareControls` aus den Zeilen entfernen; prüfen: Wertefelder, Schaden/Heilung, Markierungsbedienung und `TokenStatsText` unverändert
- [x] 2.2 `SessionRoom.tsx` nach design.md D5: `handleTokenAction` (Fokus ins HP-Feld, Zuweisen-Modal mit `AssignTokenDialog`, Freigaben-Modal mit `TokenShareControls` am Live-Token, Bestätigung vor `handleTokenRemove`), Menü der Karte (`mapMenu`, `mapMenuTokenId`, `onTokenContextMenu` an `MapCanvas`); prüfen: Modals verschwinden, wenn das Token aus `state.tokens` fällt
- [x] 2.3 `map/canvas.ts` und `MapCanvas.tsx` nach design.md D5: Option `onTokenContextMenu` (nur beim Erzeugen), `contextmenu` auf dem Canvas immer unterdrückt und im `destroy` abgemeldet, `rightdown` auf jedem Token-Container, `button === 2` in `onPointerDown` ignoriert; prüfen: Schwenken und Ziehen mit der linken Taste unverändert, `pixi.js` bleibt außerhalb der statischen Importkette

## 3. Weitere Einsätze

- [x] 3.1 `MapPanel.tsx` nach design.md D6 (`MapInstanceRow` mit Menü `Aktivieren`/`Aushängen`, Schaltflächen entfallen) und `MapLibrary.tsx` nach design.md D7 (`LibraryRow` mit Menü `Öffnen`/`Löschen`, `handleDeleteFromList` mit Bestätigung, `listError`); prüfen: Detailansicht und Formulare unverändert
- [x] 3.2 Kontomenü nach design.md D8: `AppShell.tsx` mit `ActionMenuButton` (Variante `text`) und Prop `onChangePassword`, `App.tsx` mit `passwordOpen` und Modal `Passwort ändern`, `ChangePasswordForm.tsx` mit `onSuccess` und `autoFocus`, `SessionList.tsx` ohne `<details>`; prüfen: `Abmelden` nur noch als Menüeintrag
- [x] 3.3 Sitzungscode-Popover nach design.md D9 in `SessionRoom.tsx` (Maske, Trigger `Sitzungscode anzeigen`, Popover `Sitzungscode` mit Klartext und `Kopieren`); prüfen: für einen Spieler nichts davon gerendert, Toast-Verhalten unverändert

## 4. Stylesheet

- [x] 4.1 Abschnitt „Menüs (ui-menu, #92)" nach design.md D11 vor dem Bewegungsblock in `theme.css` ergänzen, `.start-account` entfernen, `menu-in` im Bewegungsblock; prüfen: kein Farbwert außerhalb `:root`, genau ein `@media`, keine `animation`/`transition` außerhalb des Bewegungsblocks, `pnpm lint` grün

## 5. Abschluss

- [x] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 92` meldet grün
- [x] 5.2 App-Test: ⋮ und Rechtsklick auf eine Token-Zeile, Rechtsklick auf ein Token der Karte (Menü am Zeiger, Browser-Menü unterdrückt, Rechtsklick ins Leere tut nichts), Tastatur (↑↓ über gesperrte Einträge, Home/End, Enter, Esc, Tab, Fokus zurück auf ⋮), Menü am rechten/unteren Rand bleibt sichtbar, `Bearbeiten` springt ins HP-Feld, `Zuweisen…`/`Freigeben…` als Modal, `Entfernen` mit Bestätigung und Fokusrückgabe, Spieler sieht gesperrte Einträge, Karten-Zeile und Bibliothekskarte mit Menü und Löschen aus der Liste, Kontomenü mit `Passwort ändern` (Modal, schließt nach Erfolg) und `Abmelden`, Sitzungscode maskiert mit Popover und `Kopieren`, Rechtsklick auf ein Eingabefeld zeigt das Browser-Menü, Sprache EN; prüfen: menschliche Freigabe (`constitution.md` §3.4)
