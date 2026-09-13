## Purpose

Transiente Rückmeldungen für Gelungenes: ein Toast-Host unten in der Anwendung, in dem kurze
Textpillen erscheinen und von selbst wieder verschwinden — mit fester Lebensdauer,
begrenztem Stapel und Dedupe gleicher Texte. Der Toast ist ausschließlich der Kanal für
gelungene Aktionen ohne Folgeentscheidung; Validierungs- und Verbindungsfehler bleiben
inline (Epic #102). Aussehen nimmt der menschliche App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Toast-Host**: das Element `<div class="toast-host" role="status" aria-live="polite">`,
  das der Toast-Provider als letztes Kind seines Teilbaums rendert — genau eines, auch wenn
  kein Toast sichtbar ist.
- **Toast**: ein Kind des Toast-Hosts `<div class="toast">` mit genau dem Text, der beim
  Auslösen übergeben wurde. Die Toasts stehen im Host in der Reihenfolge ihres Auslösens:
  der älteste zuerst.
- **Auslösen**: der Aufruf `push(text)` des Hooks `useToasts()` mit einem nicht-leeren Text.
- **Lebensdauer**: 2,8 Sekunden ab dem Auslösen bzw. dem letzten erneuten Auslösen
  desselben Textes (exportierte Konstante `TOAST_TTL_MS = 2800`).
- **Stapelgrenze**: höchstens drei Toasts gleichzeitig (exportierte Konstante
  `TOAST_MAX = 3`).
- **Sichtbar**: ein Toast ist sichtbar, solange er als Kind des Toast-Hosts im DOM steht.
- **Stylesheet**: `src/client/app/theme.css` (siehe `ui-theme`, „Begriffe").
- **Bewegungsblock**: siehe `ui-theme`, „Begriffe".

## ADDED Requirements

### Requirement: Toast-Host und Auslösen

Die Anwendung SHALL innerhalb des Toast-Providers genau einen Toast-Host rendern, auch
solange kein Toast sichtbar ist. Ein Auslösen SHALL im Toast-Host einen Toast mit genau
dem übergebenen Text sichtbar machen, hinter allen bereits sichtbaren Toasts. Ein Toast
MUST NOT eine Schaltfläche, einen Link oder ein fokussierbares Element enthalten. Die
Anwendung als Ganzes (`App`) SHALL vom Toast-Provider umschlossen sein, sodass jede
Ansicht auslösen kann.

#### Scenario: Der Host ist auch ohne Toast vorhanden

- **GIVEN** ein Teilbaum innerhalb des Toast-Providers, in dem nichts ausgelöst wurde
- **WHEN** er gerendert wird
- **THEN** gibt es genau ein Element mit `role="status"`, es trägt `aria-live="polite"` und
  die Klasse `toast-host`, und es hat kein Kind

#### Scenario: Auslösen zeigt einen Toast mit dem Text

- **GIVEN** ein Teilbaum innerhalb des Toast-Providers
- **WHEN** `Code kopiert` ausgelöst wird
- **THEN** enthält der Toast-Host genau ein Kind mit der Klasse `toast` und dem Text
  `Code kopiert`, und dieses Kind enthält weder eine Schaltfläche noch einen Link

#### Scenario: Mehrere Toasts stehen in Auslöse-Reihenfolge

- **GIVEN** ein Teilbaum innerhalb des Toast-Providers
- **WHEN** nacheinander `Erster`, `Zweiter` und `Dritter` ausgelöst werden
- **THEN** enthält der Toast-Host genau drei Toasts, deren Texte in Dokumentreihenfolge
  `Erster`, `Zweiter`, `Dritter` lauten

### Requirement: Lebensdauer

Ein Toast SHALL nach Ablauf seiner Lebensdauer von selbst aus dem Toast-Host verschwinden,
ohne Handlung des Nutzers. Vor Ablauf der Lebensdauer SHALL er sichtbar bleiben.

#### Scenario: Toast verschwindet nach Ablauf der Lebensdauer

- **GIVEN** ein Toast `Token angelegt` wurde vor 2,7 Sekunden ausgelöst und ist sichtbar
- **WHEN** weitere 0,1 Sekunden vergehen
- **THEN** enthält der Toast-Host keinen Toast mehr; unmittelbar vor diesem Zeitpunkt war
  `Token angelegt` noch sichtbar

### Requirement: Stapelgrenze

Es SHALL höchstens `TOAST_MAX` Toasts gleichzeitig sichtbar sein. Löst ein weiterer Toast
aus, während die Grenze erreicht ist, SHALL der älteste sichtbare Toast sofort verschwinden
und der neue hinten erscheinen; die übrigen behalten ihre Reihenfolge und ihre restliche
Lebensdauer.

#### Scenario: Der vierte Toast verdrängt den ältesten

- **GIVEN** die Toasts `Erster`, `Zweiter` und `Dritter` sind in dieser Reihenfolge sichtbar
- **WHEN** `Vierter` ausgelöst wird
- **THEN** enthält der Toast-Host genau drei Toasts mit den Texten `Zweiter`, `Dritter`,
  `Vierter` in dieser Reihenfolge, und `Erster` ist nicht mehr sichtbar

### Requirement: Dedupe gleicher Texte

Wird ein Text ausgelöst, der genau so (zeichengleich) bereits als sichtbarer Toast steht,
MUST NOT ein zweiter Toast mit diesem Text erscheinen; stattdessen SHALL die Lebensdauer des
sichtbaren Toasts erneut von vorn beginnen. Der Toast SHALL dabei seine Position im Host
behalten.

#### Scenario: Erneutes Auslösen verlängert statt zu stapeln

- **GIVEN** ein Toast `Karte eingehängt` wurde vor 2 Sekunden ausgelöst und ist sichtbar
- **WHEN** `Karte eingehängt` erneut ausgelöst wird und danach 2 Sekunden vergehen
- **THEN** enthält der Toast-Host zu jedem Zeitpunkt höchstens einen Toast `Karte eingehängt`,
  er ist 2 Sekunden nach dem erneuten Auslösen noch sichtbar, und 0,8 Sekunden später ist
  er nicht mehr sichtbar

#### Scenario: Dedupe trifft auch einen älteren Toast

- **GIVEN** die Toasts `Erster` und `Zweiter` sind in dieser Reihenfolge sichtbar
- **WHEN** `Erster` erneut ausgelöst wird
- **THEN** enthält der Toast-Host genau zwei Toasts mit den Texten `Erster`, `Zweiter` in
  dieser Reihenfolge

### Requirement: Räumen beim Unmount

Wird der Toast-Provider aus dem Baum entfernt, SHALL er alle laufenden Lebensdauer-Timer
abbrechen; nach dem Entfernen MUST NOT ein Timer des Providers mehr ausstehen oder feuern.

#### Scenario: Unmount lässt keinen Timer zurück

- **GIVEN** ein Teilbaum innerhalb des Toast-Providers, in dem zwei Toasts sichtbar sind
- **WHEN** der Teilbaum samt Provider aus dem Baum entfernt wird und danach 3 Sekunden
  vergehen
- **THEN** steht kein Timer mehr aus, und es wird kein Fehler geworfen

### Requirement: Auslösen ohne Provider

Außerhalb eines Toast-Providers SHALL `useToasts()` ein `push` liefern, dessen Aufruf
nichts tut: kein Toast, kein Fehler, kein Toast-Host.

#### Scenario: Ohne Provider passiert nichts

- **GIVEN** eine Komponente außerhalb jedes Toast-Providers, die `useToasts()` verwendet
- **WHEN** sie gerendert wird und `Verloren` auslöst
- **THEN** wird kein Fehler geworfen, und es gibt im Dokument kein Element mit
  `role="status"` und keinen Text `Verloren`

### Requirement: Auslöser im Raum

Die Raumansicht SHALL nach einem bestätigten Acknowledgement (`ok: true`) folgender
Absichten einen Toast mit dem Text der aktiven Sprache (`ui-text`) auslösen: Token anlegen
(`session:token-create`) → `Token angelegt`; Karte einhängen (Antwort `201` auf
`POST /api/sessions/:id/maps`) → `Karte eingehängt`; eine einzelne Anmerkung entfernen
(`session:annotation-delete` mit `kind: "eine"`) → `Anmerkung entfernt`; mehrere Anmerkungen
entfernen (`kind: "meine"` oder `kind: "geteilte"`) → `Anmerkungen entfernt`. Nach einem
abgelehnten Acknowledgement MUST NOT ein Toast erscheinen; die Ablehnung bleibt die
bestehende Meldung im Raum. Die Anzeige des Bestands SHALL weiterhin ausschließlich dem
Server folgen (`constitution.md` §9.1) — der Toast ist eine Rückmeldung, keine Änderung des
angezeigten Bestands.

#### Scenario: Angelegtes Token wird gemeldet

- **GIVEN** die Raumansicht des Spielleiters mit aktiver Karte, und das Acknowledgement von
  `session:token-create` bestätigt mit `ok: true`
- **WHEN** der Spielleiter über das Formular ein Token `Goblin` anlegt
- **THEN** zeigt der Toast-Host einen Toast `Token angelegt`

#### Scenario: Abgelehntes Token zeigt keinen Toast

- **GIVEN** die Raumansicht des Spielleiters mit aktiver Karte, und das Acknowledgement von
  `session:token-create` lehnt mit `ok: false` und der Meldung `Kein Platz.` ab
- **WHEN** der Spielleiter über das Formular ein Token `Goblin` anlegt
- **THEN** zeigt die Raumansicht die Meldung `Kein Platz.`, und der Toast-Host zeigt keinen
  Toast

#### Scenario: Eingehängte Karte wird gemeldet

- **GIVEN** die Kartenverwaltung des Spielleiters im Raum mit einer Bibliothekskarte
  `Taverne`, und `POST /api/sessions/:id/maps` antwortet mit `201`
- **WHEN** der Spielleiter `Taverne` einhängt
- **THEN** zeigt der Toast-Host einen Toast `Karte eingehängt`

#### Scenario: Entfernte Anmerkung wird gemeldet

- **GIVEN** die Raumansicht mit einer eigenen Anmerkung in der Anmerkungsliste, und das
  Acknowledgement von `session:annotation-delete` bestätigt mit `ok: true`
- **WHEN** die Schaltfläche `Entfernen` dieser Anmerkung ausgelöst wird
- **THEN** zeigt der Toast-Host einen Toast `Anmerkung entfernt`

#### Scenario: Entfernte eigene Anmerkungen werden gemeldet

- **GIVEN** die Raumansicht mit Anmerkungsliste, und das Acknowledgement von
  `session:annotation-delete` bestätigt mit `ok: true`
- **WHEN** die Schaltfläche `Meine entfernen` ausgelöst wird
- **THEN** zeigt der Toast-Host einen Toast `Anmerkungen entfernt`

#### Scenario: Toast-Text folgt der aktiven Sprache

- **GIVEN** die aktive Sprache ist Englisch, die Raumansicht des Spielleiters mit aktiver
  Karte, und das Acknowledgement von `session:token-create` bestätigt mit `ok: true`
- **WHEN** der Spielleiter über das Formular ein Token `Goblin` anlegt
- **THEN** zeigt der Toast-Host einen Toast `Token created` und keinen Toast `Token angelegt`

### Requirement: Stylesheet der Toasts

Das Stylesheet SHALL Regeln für die Selektoren `.toast-host` und `.toast` enthalten und den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
neues `@media` außer dem Bewegungsblock, kein `@import`). Das Einblenden SHALL als
`@keyframes toast-in` samt der zugehörigen `animation`-Deklaration ausschließlich in einem
Bewegungsblock stehen.

#### Scenario: Toast-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach den Selektoren gesucht wird
- **THEN** sind `.toast-host {` und `.toast {` vorhanden, und die Regel `.toast-host {`
  enthält die Deklaration `position: fixed;`

#### Scenario: Einblenden nur im Bewegungsblock

- **GIVEN** das Stylesheet ohne Kommentare
- **WHEN** jede `@keyframes`-Regel und jede `animation`-Deklaration per Klammerzählung ihrem
  umschließenden `@media`-Block zugeordnet wird
- **THEN** gibt es genau eine Regel `@keyframes toast-in`, sie liegt in einem
  Bewegungsblock, und außerhalb eines Bewegungsblocks steht keine `animation`-Deklaration
