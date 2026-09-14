## Why

Ein Spieler sieht im Raum heute dieselbe geteilte Session-Bar wie der Spielleiter
(`session-bar`, #93, ohne Code und Steuerung) und darunter die Reiterliste `Bereiche`
(`session-tabs`, #94) mit `Karte`, `Tokens`, `Teilnehmer` — die `PlayerTokenList`
(`Tokenwerte`) und das Panel `Messen & Zeichnen` liegen in Reitern, der Sitzungs- und
Verbindungszustand ist nur über die Zustandspille bzw. das globale Banner (#91) sichtbar.
Epic #104 (Spieleransicht) legt für alle Kinder fest: **Die Karte ist der einzige dauerhaft
sichtbare Bereich; alles Weitere (Tokenwerte, Anmerkungen) wird zum On-Demand-Trigger mit
Badge.** Issue #98 baut dafür die Spieler-Sitzungsleiste — die erste eigene Oberfläche für
den Spieler.

Entscheidungen aus dem Issue-Text (#98, #104) und der Explore-Runde (2026-09-14):
- **Neue Capability `player-bar`** für die Spieler-Leiste, ihre drei On-Demand-Trigger, das
  Tokens-Badge, die Verbindungsanzeige, die drei Modals, das Spieler-Raumlayout und ihr
  Stylesheet. `session-bar` bleibt die Leiste des Spielleiters; `session-tabs` bleibt seine
  Reiter-Oberfläche.
- **Kein Sitzungscode für den Spieler.** Szenario 3 des Issues (Avatar-Popover mit maskiertem
  Code) ist von #93 überholt: der Server sendet dem Spieler bewusst keinen Code
  (`constitution.md` §9.2). Der Avatar trägt stattdessen den Anzeigenamen des Spielers als
  zugänglichen Namen (Identität ohne Code); kein Popover, kein Serverumbau. Verworfen: dem
  Spieler den Code doch zu senden — das zöge die Vertrauensgrenze neu, ohne Gewinn.
- **Trigger öffnen Modals (`ui-dialog`)**, keinen neuen Drawer-Baustein: `Tokens` →
  Tokenwerte-Modal, `Anmerkungen` → Modal mit `Messen & Zeichnen`, `Teilnehmer` → Modal mit
  den Teilnehmerkarten. Der Trigger `Anmerkungen` ist ohne aktive Karte gesperrt.
- **Drei Trigger statt der bisherigen Reiter.** Der Spieler verliert die Reiterliste; die
  drei Panels wandern in ihre Modals. `Teilnehmer` bleibt als dritter Trigger erhalten (kein
  Funktionsverlust gegenüber dem heutigen Reiter), das Teilnehmer-Modal ohne Einladen und
  ohne Code (§9.2).
- **Tokens-Badge server-getrieben (§9.1):** Anzahl = die dem Spieler zugewiesenen Tokens
  (`ownerId === userId`); Farbe teal, wenn über `session:tokens` ein zuvor herausgefilterter
  Wert eines eigenen Tokens neu ankommt (null → nicht `null`), solange das Modal geschlossen
  ist — Öffnen quittiert (gold). Kein lokal geschätzter Zähler; kein Puls (der liegt bei
  #99).
- **Verbindungsanzeige** als Punkt in der Trigger-Gruppe, der dem Verbindungszustand aus
  `disconnect`/`reconnect` folgt (Bedeutung über den zugänglichen Namen, nicht nur Farbe).
- **Kein Verwaltungsmenü** in der Spieler-Leiste: der Spieler leitet die Sitzung nicht.
  `Zurück` (Top-Bar) führt zur Liste, `Austreten` (eigene Teilnehmerkarte, #70) verlässt die
  Mitgliedschaft — beide bleiben.
- **Alle neuen Texte über `ui-text`** in beiden Sprachen (Regel aus #87 für Epic B–D); die
  Trigger wiederverwenden `tabs.tokens`/`tabs.participants`.

Nicht in diesem Change (spätere Kinder): die Tokenwerte-Karten mit Puls (#99), Responsive/
Touch (#100).

## What Changes

- **Neue Capability `player-bar`:** Komponente `src/client/session/PlayerBar.tsx`, der
  Spieler-Zweig der Raumansicht in `SessionRoom.tsx` (Leiste statt Session-Bar, dauerhafte
  Karte statt Reiter, drei Modals, Badge-/Verbindungslogik) und ein Stylesheet-Abschnitt.
- **`session-tabs` (MODIFIED „Bereiche der Raumansicht", „Tastaturbedienung der Reiter"):**
  Die Reiterliste `Bereiche` wird Spielleiter-only; die beiden Spieler-Szenarien entfallen,
  das Tastatur-Spieler-Szenario wird ein Spielleiter-Szenario, die Token-Panel-Zeile nennt
  nur noch die Verwaltung.
- **`session-token` (MODIFIED „Tokenansicht im Raum"):** die Testaufbau-Konvention verweist
  für die Spieler-Liste `Tokenwerte` auf das Tokens-Modal der Spieler-Leiste statt auf den
  Reiter `Tokens`; die Liste selbst bleibt unverändert.
- **`game-session` (MODIFIED „Sitzungsoberfläche"):** die Kopfleiste ist rollenabhängig
  (Session-Bar bzw. Spieler-Leiste); dem Spieler folgt die dauerhafte Karte statt der
  Reiterliste, seine Teilnehmerkarten liegen im Teilnehmer-Modal; das Szenario „Raumansicht
  des Spielers" und „Spieler tritt über die eigene Zeile aus" werden entsprechend angepasst.
- **`ui-text` (MODIFIED „Sprachschalter in der Top-Bar"):** neues englisches Szenario für die
  Spieler-Raumansicht (Session-Gruppe, `Running`, `Player`, Trigger `Tokens`/`Annotations`/
  `Participants`).
- **Wörterbücher (`ui-text`):** neue Schlüssel `playerBar.label`, `playerBar.annotations`,
  `playerBar.tokensTitle`, `playerBar.connected`, `playerBar.disconnected`,
  `playerBar.newValues` in `de` und `en`.

## Capabilities

### New Capabilities
- `player-bar`: Aufbau der Spieler-Leiste, Verbindungsanzeige, Tokens-Trigger und Badge,
  On-Demand-Modals, Spieler-Raumlayout, Stylesheet.

### Modified Capabilities
- `session-tabs`: Requirements „Bereiche der Raumansicht" (Reiter nur für den Spielleiter)
  und „Tastaturbedienung der Reiter" (Spieler-Szenario → Spielleiter).
- `session-token`: Requirement „Tokenansicht im Raum" (Spieler-`Tokenwerte` im Modal statt im
  Reiter).
- `game-session`: Requirement „Sitzungsoberfläche" (rollenabhängige Kopfleiste, Spieler ohne
  Reiter, Teilnehmer im Modal).
- `ui-text`: Requirement „Sprachschalter in der Top-Bar" (englisches Spieler-Szenario).

## Impact

- Neu: `src/client/session/PlayerBar.tsx`.
- Geändert (Client): `src/client/session/SessionRoom.tsx` (Spieler-Zweig: `PlayerBar` statt
  `SessionBar`, dauerhafte Karte statt `TabList`/`TabPanel`, Modals für Tokenwerte/
  Anmerkungen/Teilnehmer, `tokenEvent`-Erkennung im `tokens`-Handler, Trigger-/Modal-State),
  `src/client/i18n/de.ts`, `en.ts`, `src/client/app/theme.css` (Abschnitt „Spieler-Leiste").
- Unverändert: Server, Vertrag (`shared/`), Prisma-Schema, `SessionBar.tsx`,
  `PlayerTokenList`/`TokenCard` (`TokenStats.tsx`), `AnnotationPanel`, `ParticipantCard`,
  `TabList`/`TabPanel` (weiter für den Spielleiter), Fassade.
- Keine neue Dependency.
- **Erwarteter Testbruch (Cross-Capability, bekanntes Muster):** Bestehende Tests der
  `session-tabs`- und `session-token`-Suiten, die einen Spieler über Reiter adressieren,
  sowie die `game-session`-Spieler-Szenarien (Reiter → Modal) werden rot und in der Pause
  über den test-author an die neuen Spec-Stände angeglichen.
