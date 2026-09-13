## Why

Ein Verbindungsabbruch ist im Raum unsichtbar: die Socket-Fassade kennt das Ereignis
`disconnect`, die Raumansicht verdrahtet es nicht — nur der automatische Wiedereintritt bei
`reconnect` läuft im Hintergrund. Wer während einer Spielrunde die Verbindung verliert, sieht
eine Karte, die nicht mehr reagiert, und weiß nicht, ob er noch dabei ist. `session:replaced`
ersetzt die ganze Ansicht durch einen Absatz mit Schaltfläche, `session:ended` wirft den
Spieler kommentarlos auf die Sitzungsliste, und eine pausierte Sitzung unterscheidet sich für
einen Spieler nur durch die Zustandspille von einer laufenden. Leere Listen rendern als
leeres `<ul>` — die Startansicht (#86) hat als Einzige einen Leerzustand. Dieser Change
(Issue #91, viertes Kind des Epics #102) macht Verbindungs- und Sitzungszustand sichtbar und
gibt jeder leeren Liste des Clients einen Leerzustand.

Entscheidungen aus dem Issue-Text (#91, #102) und der Explore-Runde (2026-09-13):
- **Neue Capability `ui-status`.** Drei Bausteine — Zustandsbanner, Karten-Overlay,
  Leerzustand — bekommen eine eigene Capability wie Toast (#88), Dialog (#89) und Formular
  (#90); die Einsätze sind Deltas an `game-session` und den fünf Listen-Capabilities. Epic C/D
  beziehen sich künftig auf `ui-status`, nicht auf ein Raum-Szenario.
- **Overlay nur für Spieler, und es fängt Eingaben ab.** In `pausiert` und `geoeffnet` liegt
  das Overlay über der Karte eines Spielers und lässt weder Ziehen noch Schwenken zu. Die
  Spielleitung sieht kein Overlay — sie bereitet in genau diesen Zuständen die Karte vor
  (Tokens, Fog). Der Server lehnt Züge in der Pause heute nicht ab; das Overlay ist eine
  Oberflächenregel, keine Berechtigung (`constitution.md` §9.1 bleibt beim Server).
- **Jeder Schließweg der Dialoge führt definiert weiter.** Sitzungsende: `Zur Übersicht`,
  Esc, `Schließen` und ein Timer von 4 s führen zur Liste, dort bleibt der bisherige Hinweis
  (wer nach dem Timer zurückkommt, sieht warum). Ersetzt: `Hier weiterspielen` baut eine neue
  Verbindung auf, `Zur Übersicht`, Esc und `Schließen` verlassen den Raum. Solange ersetzt,
  erscheint kein Banner — der Server hat bewusst getrennt, es wird nicht neu verbunden.
- **Bannertext nach Trennungsgrund.** `io server disconnect` (bewusste Trennung, socket.io
  verbindet nicht neu) zeigt `Verbindung vom Server getrennt.` ohne
  Wiederverbindungsversprechen; jeder andere Grund zeigt
  `Verbindung unterbrochen — verbinde neu…`. Der Grund kommt vom Socket, nicht aus einer
  Heuristik; `io client disconnect` (Unmount, Ersetzen) zeigt nichts.
- **Toast nur bei gelungener Wiederverbindung** (`ui-feedback`, Regel aus #88): das Ereignis
  `reconnect` der Fassade feuert erst, wenn der Server die Verbindung angenommen hat.
- **Leerzustand statt leerer Liste**, überall, wo heute ein `<ul>` leer rendern kann:
  Token-Verwaltung, Tokenwerte, Fog-Bereiche, Anmerkungen, eingehängte Karten, Bibliothek.
  Die Teilnehmerliste ist nie leer (der Betrachter steht selbst darin), Markierungen je Token
  sind Teil einer Zeile, kein Panel — beide bleiben unverändert.
- **Alle neuen Texte über `ui-text`** in beiden Sprachen (Regel aus #87 für Epic B–D).

## What Changes

- **Neue Capability `ui-status`:** `StatusBanner` (`role="status"`, Klasse `status-banner`,
  Icon `warning`), `MapOverlay` (Bühne `map-stage`, Overlay `map-overlay` mit Rolle
  `region`, Titel und Subline, fängt Zeigerereignisse ab), `EmptyState` (Absatz
  `empty-state` mit Titel und Hinweis — dasselbe Markup wie der Leerzustand der
  Startansicht), Stylesheet-Abschnitt.
- **`game-session` (MODIFIED „Sitzungsoberfläche", ADDED „Verbindungs- und Sitzungszustand
  im Raum"):** `session:replaced` und `session:ended` als `alertdialog` (`ui-dialog`),
  Banner bei `disconnect`, Toast `Verbindung wiederhergestellt` bei `reconnect`, Overlay
  `Pausiert` / `Noch nicht gestartet` für Spieler.
- **`session-token`, `session-fog`, `session-annotation`, `session-map`, `map-library`
  (MODIFIED):** je ein Leerzustand statt der leeren Liste.
- **`ui-start` (unverändert):** die Startansicht nutzt den Baustein `EmptyState` — Markup
  und Texte bleiben buchstabengleich.
- **Wörterbücher (`ui-text`):** Schlüssel `status.*`, `overlay.*`, `session.ended.*`,
  `session.replaced.*`, `session.toList`, `toast.reconnected`, `empty.*` in `de` und `en`.

## Capabilities

### New Capabilities
- `ui-status`: Zustandsbanner, Karten-Overlay, Leerzustand — Markup, Rollen, Klassen,
  Stylesheet.

### Modified Capabilities
- `game-session`: Requirement „Sitzungsoberfläche" (Ersetzt- und Sitzungsende-Dialog,
  Schließwege, Timer); neue Requirement „Verbindungs- und Sitzungszustand im Raum" (Banner,
  Toast, Overlay).
- `session-token`: Requirement „Tokenansicht im Raum" (Leerzustand der Token-Verwaltung und
  der Liste `Tokenwerte`).
- `session-fog`: Requirement „Fog-Ansicht im Raum" (Leerzustand der Bereiche).
- `session-annotation`: Requirement „Anmerkungsansicht im Raum" (Leerzustand der
  Anmerkungen).
- `session-map`: Requirement „Kartenansicht im Raum" (Leerzustand der eingehängten Karten).
- `map-library`: Requirement „Bibliotheksoberfläche" (Leerzustand der Bibliothek).

## Impact

- Neu: `src/client/ui/status.tsx` (`StatusBanner`, `MapOverlay`, `EmptyState`).
- Geändert (Client): `src/client/session/SessionRoom.tsx` (Verbindungszustand, beide
  Dialoge, Overlay, Props `onEnded`/`onLeave`), `src/client/app/App.tsx` (Hinweis nach
  Sitzungsende, `onLeave`), `src/client/session/session-status.ts` (Overlay-Tabelle),
  `TokenPanel.tsx`, `TokenStats.tsx`, `FogPanel.tsx`, `AnnotationPanel.tsx`, `MapPanel.tsx`,
  `src/client/map/MapLibrary.tsx`, `src/client/session/SessionList.tsx` (Baustein statt
  eigenem Markup), `src/client/i18n/de.ts`, `en.ts`, `src/client/app/theme.css` (Abschnitt
  „Zustandsanzeigen").
- Unverändert: Server, `shared/`, Prisma-Schema, Socket-Verträge, die Socket-Fassade
  (`disconnect`/`reconnect` sind dort bereits vorhanden), `AppShell`, Toast, Modal, Formular,
  Icon-Registry (kein neues Icon).
- Keine neue Dependency.
- Bestehende Tests: die Szenarien „Ersetzte Verbindung verbindet sich nicht neu" und
  „Beendete Spielsitzung führt zur Liste zurück" ändern ihre Erwartung (Namen bleiben).
  Szenarien, die einen Raum ohne Tokens, Bereiche, Anmerkungen oder eingehängte Karten
  rendern, sehen statt eines leeren `<ul>` den Leerzustand — kein bestehendes Szenario
  adressiert eine dieser Listen im leeren Zustand.
