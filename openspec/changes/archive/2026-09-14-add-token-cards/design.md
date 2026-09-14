# Design — add-token-cards (#95)

Reiner Client-Change auf einem bestehenden, vollständig spezifizierten Serververtrag
(`session-token`). Kein `session:token-*`-Ereignis, keine Filterung, kein Schema ändert sich
— nur die Darstellung und die Bedienwege im Reiter `Tokens`.

## D1 — Zwei Modale, schlanke Karte

`Anlegen` und die vollständige Werte-/Conditions-Bearbeitung verlassen die Zeile:
- **Anlege-Modal.** Der Panel-Kopf trägt neben `Tokens` einen Knopf `Token anlegen`
  (`ui-menu`/Button, kein Eigenbau). Er öffnet ein `Modal` (`ui-dialog`) mit dem Titel
  `Token anlegen`, das das bisherige Formular (Felder `Name`, `Farbe`, Optionszeile `Symbol`,
  `Größe`, `Spalte`, `Zeile`, Absende-Schaltfläche `Anlegen`) unverändert enthält. Ein
  bestätigendes Acknowledgement schließt das Modal und setzt die Felder zurück; ein
  ablehnendes lässt Modal und Eingaben stehen und zeigt die Meldung.
- **Bearbeiten-Modal.** Der Menüeintrag `Bearbeiten` öffnet ein `Modal` mit dem Titel
  `<Tokenname> bearbeiten`, das die fünf Zahlenfelder (`<Tokenname> HP`,
  `<Tokenname> HP-Maximum`, `<Tokenname> Temp-HP`, `<Tokenname> RK`, `<Tokenname> Initiative`),
  die Schaltfläche `<Tokenname> Werte speichern`, das Auswahlfeld `<Tokenname> Markierung
  wählen`, das Textfeld `<Tokenname> Markierung` mit `<Tokenname> Markierung hinzufügen` und
  je gesetzter Markierung `<Tokenname> Markierung <Markierung> entfernen` trägt.

Die zugänglichen Namen dieser Bedienelemente **bleiben identisch** zu heute — dadurch bleibt
jeder Sendepfad (`session:token-stats`, `session:token-conditions`) und seine Absende-Logik
unverändert; nur der Ort wandert ins Modal. Das hält die Änderung an `SessionRoom`-Handlern
klein und die Traceability zur bestehenden Spec eng.

Verworfen: alles inline auf der Karte (die Karte bliebe so voll wie die heutige Zeile) und
ein Werte-Modal ohne Conditions (zwei Orte für „bearbeiten").

## D2 — Schaden/Heilung bleibt inline auf der Karte

Das Zahlenfeld `<Tokenname> Änderung` mit `<Tokenname> Schaden` und `<Tokenname> Heilung`
bleibt auf der Karte (nicht im Modal): es ist die häufigste Aktion während eines Kampfes und
soll ohne Modalöffnung erreichbar sein. Die Rechenregel (Schaden `hp − Änderung`, min 0;
Heilung `hp + Änderung`, max `hpMax`; bei `hp` `null` oder nicht-positiver Änderung nichts
senden) bleibt wie in `add-token-stats` (#61).

## D3 — HP-Balken

`article.token-card` enthält bei gesetztem `hp` **und** `hpMax` ein Element
`div.token-card__hp-bar` mit dem Inline-Stil `--pct: <ganzzahliger Prozentwert>` (gerundet,
`Math.round(hp / hpMax * 100)`, auf 0…100 geklemmt). Ist der Anteil **höchstens 25 %** (so
das Issue-Szenario: 10 von 40 = 25 % trägt die Rot-Klasse), trägt das Element zusätzlich die
Klasse `token-card__hp-bar--low`. Ohne `hp`/`hpMax` wird kein Balken
gerendert. Breite und Farbe setzt das Stylesheet (`theme.css`) über `--pct` und die
Low-Klasse — kein Farbwert im TSX (`ui-theme`-Vertrag).

## D4 — Conditions als Chips (read-only auf der Karte)

`div.token-card__conditions` enthält je Markierung einen `span.chip` mit dem dekorativen
Katalog-Icon (`conditionIcon`, sonst keins) und dem Label als Text — nie Bedeutung allein
über Farbe (`ui-icons`-Zugänglichkeit). Auf der Karte sind die Chips **anzeigend**; das
Hinzufügen/Entfernen liegt im Bearbeiten-Modal (D1). Die angezeigte Liste kommt immer vom
Server (`token.conditions`), nie aus lokalem Zwischenstand.

## D5 — Zuweisungs-Pill

Der Kartenkopf trägt einen `span.chip` mit dem Anzeigenamen des Besitzers (Alias, sonst
Nutzername) oder `Unzugewiesen`, wenn `ownerId` `null` ist. Der Name wird wie im
Zuweisen-Modal aus der Teilnehmerliste aufgelöst; `ownerId` ist Teil der vom Server
gefilterten Tokendarstellung (jeder, der das Token sieht, sieht seinen Besitzer).

## D6 — `Auf Karte zentrieren`

`tokenMenuEntries` (`token-menu.ts`) bekommt einen fünften Eintrag `Auf Karte zentrieren`
(Icon `locate`) vor `Entfernen`, **für jede Rolle aktiv** (Zentrieren ist eine lokale
Sichtaktion, keine Berechtigung nötig). `SessionRoom` reicht der Kartenansicht einen Rückruf
`onCenterToken(token)` bzw. hält ein Handle der aktiven Kartenansicht und ruft beim Auslösen
`centerOn` der Canvas-Fassade mit der Ankerzelle `{ col, row }` des Tokens auf.

Testbar ist der Fassadenruf (wie die bestehenden Szenarien `setTokens`/`onTokenMove` gegen
die gemockte Fassade prüfen); das tatsächliche Rücken der Sicht nimmt der App-Test ab.

## D7 — Sichtmathematik & Handle

`viewport.ts` bekommt die reine Funktion `centerOn(view, world, screen)` neben `panBy`/
`zoomAt`: sie setzt die Sicht so, dass `world` in der Canvas-Mitte liegt
(`x = width/2 − world.x·scale`, `y = height/2 − world.y·scale`), `scale` unverändert —
direkt unit-testbar. `MapCanvasHandle` bekommt `centerOn(cell)`: es liest den Zellmittelpunkt
(`cellCenter`) und die Bühnengröße (`app.screen`) und wendet die reine Funktion an. `MapCanvas`
reicht das intern gehaltene Handle über `useImperativeHandle`/`forwardRef` (oder einen
`onHandle`-Rückruf) an `SessionRoom` durch — dieselbe gemockte Fassade wie heute liefert im
Test ein `centerOn`-Mock.

## D8 — Icon `locate`

`ui-icons`-Registry bekommt `locate` (Lucide `LocateFixed`) in der Oberflächen-Gruppe
zwischen `library` und `lock` (alphabetisch); `ICON_NAMES` 55 → 56. Reiner Registry-Zuwachs,
kein neuer Abhängigkeitsbedarf (`lucide-react` ist installiert).

## D9 — Beide Rollen-Listen als Karten

Die presentational Kartenanzeige (Kopf, HP-Balken, `dl`-Werte, Chips) ist für Spielleiter-
und Spieler-Liste dieselbe; die Spieler-Karte (`TokenStats.tsx`) trägt zusätzlich **nichts
Bedienbares** außer dem ⋮-Menü (dort `Bearbeiten`/`Zuweisen…`/`Entfernen` gesperrt,
`Freigeben…` je `shares`, `Auf Karte zentrieren` aktiv). Die Spieler-Karte hat kein
Anlege-/Bearbeiten-Modal und keine Schaden/Heilung-Eingabe. Die Werte kommen serverseitig
gefiltert; ein für den Spieler verborgener Wert erzeugt weder `dl`-Zeile noch Balken.

## D10 — Testkonvention

Wie seit `session-tabs` (#94): Szenarien, die Elemente des Reiters `Tokens` adressieren,
setzen voraus, dass der Testaufbau den Reiter vorher per Klick aktiviert hat. Szenarien, die
ein Wertefeld, die Conditions-Bedienung oder das Anlege-Formular adressieren, setzen zusätzlich
voraus, dass das jeweilige Modal (`Token anlegen` bzw. `<Tokenname> bearbeiten`) über den
Kopf-Knopf bzw. den Menüeintrag `Bearbeiten` geöffnet wurde.
