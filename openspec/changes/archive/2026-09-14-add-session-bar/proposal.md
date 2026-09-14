## Why

Die Raumansicht reiht ihren Kopf heute linear untereinander: eine `<h1>` mit dem Namen, ein
Absatz mit der Zustandspille, ein Absatz mit `Code:`, Maske und Info-Popover, darunter die
Teilnehmerliste und erst dann — nur die im aktuellen Zustand erlaubten — Übergangs-
Schaltflächen als Textknöpfe, die je nach Zustand erscheinen und verschwinden. Der Name
lässt sich nirgends ändern (der Server kennt dafür weder Route noch Ereignis), das
Verlassen des Raums und der Weg in die Kartenbibliothek liegen ausschließlich in der
Top-Bar bzw. auf der Startansicht, und ein abgelehnter Übergang verschwindet still in der
Konsole. Dieser Change (Issue #93, erstes Kind des Epics #103) legt die Session-Bar an, unter
der #94 die Tabs einhängt.

Entscheidungen aus dem Issue-Text (#93, #103) und der Explore-Runde (2026-09-13):
- **Neue Capability `session-bar`** für die Steuerzeile: Gruppen, Code-Umschalter,
  Übergänge mit Sperre, Verwaltungsmenü, Umbenennen-Modal und Stylesheet. `game-session`
  behält die Serverseite (neues Requirement „Spielsitzung umbenennen") und verweist in
  „Sitzungsoberfläche" auf die Bar. #98 (Spieler-Bar) kann dieselbe Capability erweitern.
- **Umbenennen als Socket-Ereignis wie der Alias.** `session:rename` `{ sessionId, name }`
  mit Acknowledgement `{ ok, name }`, nur Spielleiter, Name durch dasselbe Schema wie beim
  Erstellen; Broadcast `session:renamed` `{ sessionId, name }` an den Raum. Der angezeigte
  Name folgt dem Broadcast, nicht der Eingabe. Verworfen: `PATCH /api/sessions/:id` — zwei
  Wege (REST plus Socket) für einen Vorgang, der wie jede Raumaktion pro Aktion autorisiert
  wird.
- **Auge-Umschalter statt Popover.** Der Code steht als `<code>` in der Bar, maskiert, mit
  einer Umschalt-Schaltfläche `Sitzungscode anzeigen` (`aria-pressed`) und einer
  Schaltfläche `Sitzungscode kopieren`, die auch bei geschlossener Maske kopiert. Der
  Popover-Einsatz aus #92 entfällt im Raum; der Baustein `Popover` in `ui-menu` bleibt.
- **Vier runde Übergangs-Tasten in fester Reihenfolge** — `Öffnen`, `Starten`, `Pausieren`,
  `Beenden` — jede sichtbar und `disabled`, wenn `allowedActions` sie nicht enthält (#103:
  „disabled, nicht ausgeblendet"). `Öffnen` gehört dazu, weil `geschlossen → geoeffnet` ein
  Übergang des Vertrags ist; Icon `players` wie die Pille `Geöffnet`. Verworfen: `Öffnen`
  als eigene Textschaltfläche nur im Zustand `geschlossen` (bricht die Regel), und ein
  Play-Knopf mit zwei Bedeutungen.
- **`Beenden` mit Bestätigung** (`ui-dialog`, gefährlich), Hover in Rot; ein abgelehnter
  Übergang erscheint als Inline-Meldung unter der Bar.
- **Verwaltungsmenü ⚙ `Sitzungsverwaltung`** mit `Umbenennen…` (gesperrt für Spieler),
  `Kartenbibliothek` und `Verlassen`. Kein Eintrag `Teilnehmer`: die Teilnehmer werden mit
  #94 ein Tab und mit #97 eine Kartenliste — ein Sprung zur heutigen Liste wäre Wegwerfarbeit.
- **Icon `copy`** kommt in die Registry (`ui-icons`, 55 Namen).
- **Alle neuen Texte über `ui-text`** in beiden Sprachen (Regel aus #87 für Epic B–D).

## What Changes

- **Neue Capability `session-bar`:** Komponente `src/client/session/SessionBar.tsx`,
  Umbenennen-Modal und Bestätigung in `SessionRoom.tsx`, Stylesheet-Abschnitt.
- **`game-session` (ADDED „Spielsitzung umbenennen"):** `session:rename` mit
  Acknowledgement und Broadcast `session:renamed`; Vertrag in `src/shared/session.ts`,
  Handler in `src/server/session/socket.ts`.
- **`game-session` (MODIFIED „Sitzungsoberfläche"):** die Bar ersetzt Überschrift, Zustands-
  absatz, Code-Absatz und Übergangs-Schaltflächen; `Verlassen` als zweiter Weg zur Liste;
  Maske mit Umschalter statt Popover; Übergänge gesperrt statt ausgeblendet.
- **`ui-icons` (MODIFIED „Registry"):** Name `copy` (Lucide `Copy`) nach `close`.
- **`ui-text` (MODIFIED „Sprachschalter in der Top-Bar"):** das englische Raum-Szenario
  findet Umschalter, Kopieren, Umbenennen, die vier Übergänge und das Verwaltungsmenü.
- **Wörterbücher (`ui-text`):** Schlüssel `bar.*`, `menu.rename`, `menu.library`,
  `menu.leave`, `session.rename.*`, `session.end.*`, `toast.sessionRenamed` in `de` und
  `en`; `session.copyCode` entfällt.
- **`App.tsx`:** `SessionRoom` bekommt `onOpenLibrary` (Wechsel in die Bibliothek).

## Capabilities

### New Capabilities
- `session-bar`: Aufbau der Bar, Sitzungscode, Übergänge, Verwaltungsmenü, Umbenennen,
  Stylesheet.

### Modified Capabilities
- `game-session`: ADDED Requirement „Spielsitzung umbenennen" (Server); MODIFIED Requirement
  „Sitzungsoberfläche" (Bar statt Kopfzeilen, `Verlassen`, Umschalter, gesperrte Übergänge).
- `ui-icons`: Requirement „Registry" (55 Namen, `copy`).
- `ui-text`: Requirement „Sprachschalter in der Top-Bar" (englisches Raum-Szenario).

## Impact

- Neu: `src/client/session/SessionBar.tsx`.
- Geändert (shared): `src/shared/session.ts` (`SessionNameSchema`, `RenameInputSchema`,
  `RenameAck`, `RenamedEvent`, `SESSION_EVENTS.rename`/`renamed`).
- Geändert (Server): `src/server/session/socket.ts` (`handleRename`).
- Geändert (Client): `src/client/session/socket.ts` (`rename`, `on('renamed')`),
  `SessionRoom.tsx` (Bar, Umbenennen-Modal, Bestätigung vor `beenden`, Bar-Meldung,
  `renamed`-Verdrahtung, Prop `onOpenLibrary`), `session-status.ts` (`TRANSITION_ICONS`),
  `src/client/app/App.tsx`, `src/client/ui/icons.ts`, `src/client/i18n/de.ts`, `en.ts`,
  `src/client/app/theme.css` (Abschnitt „Session-Bar", Regeln `.session-room-status`,
  `.session-room-code`, `.session-code-mask`, `.session-code` entfallen).
- Unverändert: Prisma-Schema (Spalte `name` existiert), REST-Routen, Toast, Modal,
  Formular, Menü-Baustein, Zustandsanzeigen, Kartenfläche.
- Keine neue Dependency.
- Bestehende Tests: Szenarien, die den Popover `Sitzungscode`, die Schaltfläche `Kopieren`
  im Raum, das Fehlen von `Öffnen`/`Pausieren` oder die Übergänge als Textschaltflächen
  adressieren, ändern ihre Erwartung (Namen bleiben). Szenarien, die die Raumansicht an der
  Überschrift der Ebene 1 erkennen, bleiben gültig.
