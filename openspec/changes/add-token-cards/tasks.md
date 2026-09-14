# Tasks — add-token-cards (#95)

## 1. Icon-Registry
- [ ] 1.1 `locate` (Lucide `LocateFixed`) in `src/client/ui/icons.ts` aufnehmen — Import,
  `ICON_NAMES` zwischen `library` und `lock`, `ICON_REGISTRY`-Eintrag.

## 2. Sichtmathematik & Fassade
- [ ] 2.1 Reine Funktion `centerOn(view, world, screen)` in `src/client/map/viewport.ts`.
- [ ] 2.2 `MapCanvasHandle.centerOn(cell)` in `src/client/map/canvas.ts` (Zellmittelpunkt +
  Bühnengröße → `centerOn`, Sicht auf den Wurzel-Container anwenden).
- [ ] 2.3 `MapCanvas` (`src/client/map/MapCanvas.tsx`) reicht das Handle über
  `forwardRef`/`useImperativeHandle` (bzw. `onHandle`-Rückruf) an die Raumansicht durch.

## 3. Token-Menü
- [ ] 3.1 `tokenMenuEntries` (`src/client/session/token-menu.ts`) um `Auf Karte zentrieren`
  (Icon `locate`, für jede Rolle aktiv) vor `Entfernen` erweitern; Aktion `zentrieren`
  ergänzen.

## 4. Karten & Modale (Spielleiter)
- [ ] 4.1 `TokenPanel.tsx` auf Karten (`article.token-card`) umbauen: Kopf (Symbol · Name ·
  Zuweisungs-Pill · ⋮), HP-Balken (`--pct` + Low-Klasse), `dl`-Werte, Condition-Chips,
  Inline-Schaden/Heilung.
- [ ] 4.2 Anlege-Modal `Token anlegen` (Kopf-Knopf `Token anlegen`); Formular hinein, Reset +
  Schließen bei bestätigendem Ack.
- [ ] 4.3 Bearbeiten-Modal `<Name> bearbeiten` mit den fünf Wertefeldern, `Werte speichern`
  und der Conditions-Verwaltung (Schnellwahl, Freitext, Entfernen).

## 5. Karten (Spieler)
- [ ] 5.1 `TokenStats.tsx`/Spieler-Liste `Tokenwerte` auf read-only Karten (Kopf, HP-Balken,
  `dl`-Werte, Chips) umbauen; ⋮-Menü wie gehabt.

## 6. Verdrahtung
- [ ] 6.1 `SessionRoom.tsx`: Modale-Zustände (Anlegen/Bearbeiten), Zuweisungs-Pill aus der
  Teilnehmerliste, `handleTokenAction` um `zentrieren` (Ruf `centerOn` der aktiven
  Kartenansicht) erweitern; `Bearbeiten` öffnet das Modal statt HP-Fokus.

## 7. Stylesheet
- [ ] 7.1 `src/client/app/theme.css`: `.token-card`, `.token-card__name`,
  `.token-card__hp-bar`, `.token-card__hp-bar--low`, `.token-card__conditions` (Farbwerte nur
  aus dem Tokenblock, `ui-theme`-Vertrag).

## 8. Archivierung (nach menschlicher App-Freigabe)
- [ ] 8.1 Haupt-Specs nachziehen: `ui-icons` Begriffe 55 → 56 (`locate`); `map-library` und
  `session-token` Requirements aus den Deltas; Change nach `openspec/changes/archive/`.
