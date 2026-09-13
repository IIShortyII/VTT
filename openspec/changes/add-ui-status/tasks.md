## 1. Baustein und Wörterbücher

- [ ] 1.1 `src/client/ui/status.tsx` nach design.md D1 anlegen (`StatusBanner` mit `role="status"` und Icon `warning`, `MapOverlay` mit Rolle `region`, `aria-labelledby`, Titel und Subline, `EmptyState` mit dem Markup der Startansicht); prüfen: `pnpm typecheck:src` und `pnpm lint` grün, Importe nur `react`, `Icon` und der Typ `IconName`
- [ ] 1.2 Schlüssel aus design.md D7 in `src/client/i18n/de.ts` und `en.ts` ergänzen; prüfen: `pnpm typecheck:src` grün (Schlüsselgleichheit), Texte buchstabengleich zur Tabelle

## 2. Raumansicht

- [ ] 2.1 `SessionRoom.tsx` nach design.md D2 umbauen: State `disconnected`, Refs `endedRef`/`pushRef`/`tRef`/`onEndedRef`/`onLeaveRef`, `disconnect`-Handler mit Grund-Regel, `reconnect`-Handler räumt Banner und pusht `toast.reconnected`, Grundgerüst `banner`/`content`/`dialogs` in jedem Zustand, `wireSocket` nur noch abhängig von `sessionId`/`currentUserId`; prüfen: kein früher `return` mehr für `replaced`, `handleReconnect` setzt `disconnected` zurück
- [ ] 2.2 Ersetzt-Dialog nach design.md D3 und Sitzungsende-Dialog mit Timer nach design.md D4 (`ENDED_REDIRECT_MS`, Cleanup), Props `onEnded`/`onLeave` ohne Argument; `App.tsx` setzt den Hinweis `session.ended.hint` selbst und übergibt `onLeave`; prüfen: `ENDED_MESSAGE`/`REPLACED_MESSAGE` entfernt, Esc und `Schließen` beider Dialoge führen zur Liste
- [ ] 2.3 Overlay nach design.md D5: `SESSION_OVERLAY` in `session-status.ts`, Bühne `map-stage` um die Kartenansicht, `MapOverlay` nur für `spieler` in `pausiert`/`geoeffnet` mit dem Icon aus `SESSION_STATUS_PRESENTATION`; prüfen: kein Overlay für den Spielleiter, keines ohne aktive Karte

## 3. Leerzustände

- [ ] 3.1 `TokenPanel.tsx`, `TokenStats.tsx` (`PlayerTokenList`), `FogPanel.tsx`, `AnnotationPanel.tsx` nach design.md D6: `EmptyState` statt leerem `<ul>` mit den Schlüsseln der Tabelle; prüfen: Überschriften, Formulare, Schaltflächen und Reihenfolge unverändert
- [ ] 3.2 `MapPanel.tsx` und `MapLibrary.tsx` nach design.md D6: Listenstate `null` bis zur ersten Antwort, danach `EmptyState` bei `[]`, bei Ladefehler weiterhin nur die Meldung; `SessionList.tsx` nutzt `EmptyState` mit den bisherigen Schlüsseln; prüfen: Ableitungen in `MapPanel` mit `instances ?? []`, Einhängen-Sperre unverändert

## 4. Stylesheet

- [ ] 4.1 Abschnitt „Zustandsanzeigen (ui-status, #91)" nach design.md D8 vor dem Bewegungsblock in `theme.css` ergänzen; prüfen: kein Farbwert außerhalb `:root`, kein zweites `@media`, keine `animation`/`transition` außerhalb des Bewegungsblocks, `pnpm lint` grün

## 5. Abschluss

- [ ] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 91` meldet grün
- [ ] 5.2 App-Test: API-Server neu starten → amber Banner im Raum, nach dem Neustart Toast `Verbindung wiederhergestellt` und Banner weg; Spieler in pausierter und in geöffneter Sitzung → Overlay über der Karte, kein Ziehen/Schwenken, Spielleitung ohne Overlay; `Starten` entfernt das Overlay beim Spieler; zweiter Tab desselben Spielers → Dialog `An anderer Stelle geöffnet` im ersten Tab, `Hier weiterspielen` und `Zur Übersicht` prüfen; `Beenden` → Dialog `Sitzung beendet` beim Spieler, Timer 4 s und `Zur Übersicht`, danach Hinweis auf der Liste; Leerzustände in Token-Verwaltung, Tokenwerte, Fog-Bereichen, Anmerkungen, Kartenverwaltung, Bibliothek; Sprache EN; prüfen: menschliche Freigabe (`constitution.md` §3.4)
