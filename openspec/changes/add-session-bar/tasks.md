## 1. Vertrag und Server

- [ ] 1.1 `src/shared/session.ts` nach design.md D1: `SessionNameSchema` herausziehen und in `CreateSessionInputSchema` verwenden, `RenameInputSchema`, `RenameInput`, `RenameAck`, `RenamedEvent`, `SESSION_EVENTS.rename`/`renamed`, Drahtformat-Kommentar; prüfen: `pnpm typecheck:src` grün, Meldungen der Namensprüfung unverändert
- [ ] 1.2 `src/server/session/socket.ts` nach design.md D2: `handleRename` (Parsen, `authorizeAction` mit Rolle `spielleiter`, `gameSession.update`, Broadcast `session:renamed` an den Raum inklusive Absender, Acknowledgement) und Registrierung; prüfen: kein Zustandsfilter, kein weiterer Broadcast

## 2. Client-Bausteine

- [ ] 2.1 `src/client/session/socket.ts` nach design.md D3 (`rename`, `on('renamed')`, `wireEventFor`); `session-status.ts` nach D4 (`TRANSITION_ICONS`); `src/client/ui/icons.ts` nach D7 (`copy` nach `close`, 55 Namen); prüfen: `pnpm typecheck:src` grün
- [ ] 2.2 Schlüssel aus design.md D8 in `src/client/i18n/de.ts` und `en.ts` ergänzen, `session.copyCode` in beiden entfernen; prüfen: Schlüsselgleichheit per Typecheck, Texte buchstabengleich zur Tabelle
- [ ] 2.3 `src/client/session/SessionBar.tsx` nach design.md D5 anlegen (`SessionBar` mit vier Gruppen, Maskenzustand, Steuerung mit Sperren aus `allowedActions`, Verwaltungsmenü; `RenameSessionForm` mit Vorprüfung über `SessionNameSchema`, Feld- und Formularfehler); prüfen: Importliste nach D11, `pnpm lint` grün

## 3. Raumansicht

- [ ] 3.1 `SessionRoom.tsx` nach design.md D6: Bar statt `<h1>`, Zustandsabsatz, Code-Absatz und Übergangs-Schaltflächen; `transitionError` mit Bestätigung vor `beenden` und Acknowledgement-Auswertung; `renamed` in `wireSocket`; Umbenennen-Modal mit `handleRename` und Toast nach Erfolg; Prop `onOpenLibrary`; `App.tsx` reicht den Bibliothekswechsel durch; prüfen: `codeFloating`/`Popover`/`MenuTrigger` in der Raumansicht entfernt, Karten-Menü unverändert, für einen Spieler keine Code-Gruppe und keine Steuerung

## 4. Stylesheet

- [ ] 4.1 Abschnitt „Session-Bar (session-bar, #93)" nach design.md D9 vor dem Bewegungsblock in `theme.css` ergänzen, `.session-room-status`, `.session-room-code`, `.session-code-mask`, `.session-code` entfernen; prüfen: kein Farbwert außerhalb `:root`, genau ein `@media`, keine `animation`/`transition` außerhalb des Bewegungsblocks, `pnpm lint` grün

## 5. Abschluss

- [ ] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 93` meldet grün
- [ ] 5.2 App-Test: Bar am Kopf des Raums mit Haarlinien, langer Name schrumpft per Ellipsis ohne horizontales Scrollen, Maske/Auge/Kopieren (Toast), vier runde Übergänge mit Sperren je Zustand (`geschlossen` → nur `Öffnen`), `Beenden` rot bei Hover und mit Bestätigung, abgelehnter Übergang als Meldung, ⚙ mit `Umbenennen…`/`Kartenbibliothek`/`Verlassen`, Umbenennen-Modal (leerer Name → Feldfehler, Erfolg → Toast, Name beim Spieler aktualisiert), Spieler ohne Code und Steuerung mit gesperrtem `Umbenennen…`, Sprache EN; prüfen: menschliche Freigabe (`constitution.md` §3.4)
