## Purpose

Der Modal-Baustein des Clients und der darauf aufbauende Bestätigungsdialog: ein Dialog
über einem abdunkelnden Backdrop, der den Fokus hält, per Esc, Backdrop-Klick und
Schließen-Schaltfläche schließt und den Fokus an seinen Auslöser zurückgibt; dazu eine
Promise-API `confirm()`, die eine destruktive Absicht abfragt, statt sie mit einem zweiten
Klick oder `window.confirm` zu bestätigen. Ob die bestätigte Aktion gelingt, entscheidet
weiterhin allein der Server (`constitution.md` §9.1). Aussehen nimmt der menschliche
App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Modal**: die Komponente `Modal` aus `src/client/ui/Modal.tsx` mit den Props `title`
  (Text), `onClose` (Funktion), optional `role` (`dialog`, Standard, oder `alertdialog`),
  `description` (Text), `wide` (Wahrheitswert) und Kindern.
- **Backdrop**: das äußere Element des Modals (`<div class="modal-backdrop">`).
- **Box**: das innere Element des Modals mit der Rolle `dialog` bzw. `alertdialog`, Klasse
  `modal` (mit `wide` zusätzlich `modal--wide`), `aria-modal="true"` und
  `aria-labelledby` auf den **Titel** — eine Überschrift der Ebene 2 mit dem Text von
  `title`. Mit `description` trägt die Box `aria-describedby` auf die **Beschreibung**, ein
  Absatz mit diesem Text.
- **Schließen-Schaltfläche**: die Icon-only-Schaltfläche (`ui-icons`, Icon `close`) mit dem
  Namen `Schließen` (`ui-text`, `dialog.close`); sie ist das erste Element in der Box.
- **Fokussierbar**: ein Element der Box, das auf den Selektor `a[href]`, `button`,
  `input`, `select`, `textarea` (jeweils nicht `disabled`) oder `[tabindex]` (nicht `-1`)
  passt, in Dokumentreihenfolge.
- **Auslöser**: das Element, das beim Mount des Modals den Fokus trägt
  (`document.activeElement`).
- **Bestätigungsdialog**: das Modal mit Rolle `alertdialog`, das `ConfirmProvider`
  (`src/client/ui/confirm.tsx`) rendert, solange eine Anfrage offen ist: Titel `title`,
  Beschreibung `message`, darunter die Schaltflächen `Abbrechen` (`ui-text`,
  `dialog.cancel`) und die **bestätigende Schaltfläche** mit dem Text `confirmLabel`
  (Klasse `danger`, wenn `danger` wahr ist, sonst `primary`).
- **Anfrage**: der Aufruf `confirm(options)` des Hooks `useConfirm()` mit
  `options: { title, message, confirmLabel, danger? }`; sie liefert ein Promise auf einen
  Wahrheitswert. Die Anfrage ist **offen**, solange das Promise nicht aufgelöst ist.
- **Stylesheet**: `src/client/app/theme.css` (siehe `ui-theme`, „Begriffe"); die
  Dialog-Selektoren sind `.modal-backdrop`, `.modal`, `.modal--wide`, `.modal-close`,
  `.modal-title`, `.modal-description` und `.modal-actions`. Ein Selektor ist **vorhanden**,
  wenn das Stylesheet nach Normalisierung die Zeichenfolge `<selektor> {` enthält.
- **Bewegungsblock**: siehe `ui-theme`, „Begriffe".

## ADDED Requirements

### Requirement: Modal-Baustein

Das Modal SHALL Backdrop und Box rendern; die Box SHALL die Rolle `dialog` (Standard) oder
`alertdialog` tragen, `aria-modal="true"`, ihren zugänglichen Namen über den Titel und —
mit `description` — `aria-describedby` auf die Beschreibung. Die Schließen-Schaltfläche
SHALL das erste Element in der Box sein, gefolgt vom Titel, der Beschreibung (falls
vorhanden) und den Kindern. Das Modal MUST NOT ein natives `<dialog>`-Element oder
`window.confirm`/`alert` verwenden.

#### Scenario: Modal rendert Dialog mit Titel, Schließen-Schaltfläche und Inhalt

- **GIVEN** ein Modal mit dem Titel `Beispiel` und einer Schaltfläche `Weiter` als Kind
- **WHEN** es gerendert wird
- **THEN** gibt es genau ein Element mit der Rolle `dialog`, sein zugänglicher Name ist
  `Beispiel`, es trägt `aria-modal="true"` und die Klasse `modal`, sein Elternelement trägt
  die Klasse `modal-backdrop`, seine erste Schaltfläche heißt `Schließen`, es enthält eine
  Überschrift der Ebene 2 `Beispiel` und die Schaltfläche `Weiter`, und es trägt kein
  `aria-describedby`

#### Scenario: Rolle alertdialog mit Beschreibung und breiter Box

- **GIVEN** ein Modal mit Rolle `alertdialog`, Titel `Wirklich?`, Beschreibung
  `Das lässt sich nicht rückgängig machen.` und `wide`
- **WHEN** es gerendert wird
- **THEN** gibt es ein Element mit der Rolle `alertdialog` und dem Namen `Wirklich?`, es
  trägt die Klassen `modal` und `modal--wide`, und das Element, auf das sein
  `aria-describedby` zeigt, hat den Text `Das lässt sich nicht rückgängig machen.`

### Requirement: Fokus beim Öffnen

Beim Mount SHALL das Modal das erste fokussierbare Element der Box fokussieren — außer
ein Element innerhalb der Box trägt den Fokus bereits (etwa ein Kind mit `autoFocus`);
dann MUST NOT das Modal den Fokus verschieben.

#### Scenario: Ohne autoFocus erhält die Schließen-Schaltfläche den Fokus

- **GIVEN** ein Modal mit dem Titel `Beispiel` und einer Schaltfläche `Weiter` ohne
  `autoFocus` als Kind
- **WHEN** es gerendert wird
- **THEN** liegt der Fokus auf der Schaltfläche `Schließen`

#### Scenario: Ein Kind mit autoFocus behält den Fokus

- **GIVEN** ein Modal mit dem Titel `Beispiel`, dessen Kind eine Schaltfläche `Weiter` mit
  `autoFocus` ist
- **WHEN** es gerendert wird
- **THEN** liegt der Fokus auf der Schaltfläche `Weiter`, nicht auf `Schließen`

### Requirement: Tab-Zyklus

Solange das Modal gerendert ist, SHALL `Tab` vom letzten fokussierbaren Element der Box
zum ersten springen und `Umschalt+Tab` vom ersten zum letzten; das Standardverhalten des
Ereignisses SHALL in diesen Fällen unterbunden sein. Zwischen den Elementen der Box SHALL
das Modal den Fokus nicht selbst bewegen.

#### Scenario: Tab auf dem letzten Element springt zum ersten

- **GIVEN** ein Modal mit den Kindern `Eins` und `Zwei` (Schaltflächen), und der Fokus
  liegt auf `Zwei`
- **WHEN** auf `Zwei` die Taste `Tab` gedrückt wird
- **THEN** liegt der Fokus auf der Schaltfläche `Schließen`

#### Scenario: Umschalt+Tab auf dem ersten Element springt zum letzten

- **GIVEN** ein Modal mit den Kindern `Eins` und `Zwei` (Schaltflächen), und der Fokus
  liegt auf `Schließen`
- **WHEN** auf `Schließen` die Taste `Tab` mit Umschalt gedrückt wird
- **THEN** liegt der Fokus auf der Schaltfläche `Zwei`

#### Scenario: Tab zwischen zwei Elementen bewegt den Fokus nicht selbst

- **GIVEN** ein Modal mit den Kindern `Eins` und `Zwei` (Schaltflächen), und der Fokus
  liegt auf `Eins`
- **WHEN** auf `Eins` die Taste `Tab` gedrückt wird
- **THEN** liegt der Fokus weiterhin auf `Eins` (die Umgebung ohne Browser rückt nicht
  vor), und das Ereignis wurde nicht unterbunden

### Requirement: Schließen

Das Modal SHALL `onClose` genau einmal rufen, wenn `Escape` gedrückt wird, wenn der
Backdrop selbst geklickt wird oder wenn die Schließen-Schaltfläche ausgelöst wird. Ein
Klick auf die Box oder in ihren Inhalt MUST NOT `onClose` rufen. Das Modal MUST NOT sich
selbst aus dem Dokument entfernen — ob es geschlossen wird, entscheidet der Aufrufer über
`onClose`.

#### Scenario: Escape ruft onClose

- **GIVEN** ein gerendertes Modal mit einer `onClose`-Funktion
- **WHEN** auf dem Dialog-Element die Taste `Escape` gedrückt wird
- **THEN** wurde `onClose` genau einmal gerufen

#### Scenario: Klick auf den Backdrop ruft onClose

- **GIVEN** ein gerendertes Modal mit einer `onClose`-Funktion
- **WHEN** der Backdrop selbst geklickt wird
- **THEN** wurde `onClose` genau einmal gerufen

#### Scenario: Klick in die Box ruft onClose nicht

- **GIVEN** ein gerendertes Modal mit einer `onClose`-Funktion und einer Schaltfläche
  `Weiter` als Kind
- **WHEN** das Dialog-Element geklickt wird und danach die Schaltfläche `Weiter`
- **THEN** wurde `onClose` nicht gerufen

#### Scenario: Schließen-Schaltfläche ruft onClose

- **GIVEN** ein gerendertes Modal mit einer `onClose`-Funktion
- **WHEN** die Schaltfläche `Schließen` ausgelöst wird
- **THEN** wurde `onClose` genau einmal gerufen

### Requirement: Fokusrückgabe

Beim Unmount SHALL das Modal den Fokus an den Auslöser zurückgeben, sofern dieser noch im
Dokument steht (`isConnected`). Steht er nicht mehr im Dokument, MUST NOT das Modal den
Fokus setzen oder einen Fehler werfen.

#### Scenario: Auslöser erhält den Fokus zurück

- **GIVEN** eine Schaltfläche `Öffnen` trägt den Fokus, und ihr Auslösen rendert ein Modal
  mit dem Titel `Beispiel`
- **WHEN** das Modal geöffnet und danach über `Abbrechen` in seinem Inhalt wieder
  geschlossen wird (der Aufrufer rendert es nicht mehr)
- **THEN** lag der Fokus nach dem Öffnen innerhalb des Dialogs, und nach dem Schließen liegt
  er auf der Schaltfläche `Öffnen`

#### Scenario: Verschwundener Auslöser bekommt keinen Fokus

- **GIVEN** eine Schaltfläche `Öffnen` trägt den Fokus, und ihr Auslösen rendert ein Modal
  mit dem Titel `Beispiel`
- **WHEN** das Modal geöffnet wird und der Aufrufer danach weder Modal noch Schaltfläche
  `Öffnen` rendert
- **THEN** gibt es keine Schaltfläche `Öffnen` mehr, es wurde kein Fehler geworfen, und der
  Fokus liegt auf `document.body`

### Requirement: Bestätigungsdialog

Innerhalb des `ConfirmProvider` SHALL eine Anfrage den Bestätigungsdialog rendern: Rolle
`alertdialog` mit dem Titel als Namen, die Beschreibung mit `message`, die Schaltfläche
`Abbrechen` mit dem Fokus und die bestätigende Schaltfläche mit `confirmLabel` (Klasse
`danger` bei `danger: true`, sonst `primary`). Die Anfrage SHALL mit `true` aufgelöst
werden, wenn die bestätigende Schaltfläche ausgelöst wird, und mit `false`, wenn
`Abbrechen`, die Schließen-Schaltfläche, `Escape` oder der Backdrop ausgelöst wird; in
jedem Fall SHALL der Dialog danach nicht mehr gerendert sein. Solange die Anfrage offen
ist, MUST NOT das Promise aufgelöst sein. Eine zweite Anfrage bei offener erster SHALL die
erste mit `false` auflösen und den Dialog der zweiten zeigen. Die Anwendung als Ganzes
(`App`) SHALL vom `ConfirmProvider` umschlossen sein.

#### Scenario: Anfrage öffnet den Bestätigungsdialog

- **GIVEN** eine Komponente innerhalb des `ConfirmProvider`, deren Schaltfläche `Rückfrage`
  `confirm` mit Titel `Karte löschen?`, Nachricht `Die Karte ist danach weg.`,
  `confirmLabel` `Löschen` und `danger: true` ruft und das Ergebnis als Text `bestätigt`
  bzw. `abgelehnt` rendert
- **WHEN** `Rückfrage` ausgelöst wird
- **THEN** gibt es ein Element mit der Rolle `alertdialog` und dem Namen `Karte löschen?`,
  das Element, auf das sein `aria-describedby` zeigt, hat den Text `Die Karte ist danach
  weg.`, der Dialog enthält die Schaltflächen `Abbrechen` und `Löschen`, `Löschen` trägt
  die Klasse `danger`, der Fokus liegt auf `Abbrechen`, und weder `bestätigt` noch
  `abgelehnt` ist gerendert

#### Scenario: Bestätigen löst mit true auf

- **GIVEN** der Bestätigungsdialog zu einer Anfrage mit `confirmLabel` `Weiter` ohne
  `danger` ist offen
- **WHEN** die Schaltfläche `Weiter` im Dialog ausgelöst wird
- **THEN** trug `Weiter` die Klasse `primary`, der Text `bestätigt` ist gerendert, und es
  gibt kein Element mit der Rolle `alertdialog` mehr

#### Scenario: Abbrechen löst mit false auf

- **GIVEN** der Bestätigungsdialog ist offen
- **WHEN** die Schaltfläche `Abbrechen` im Dialog ausgelöst wird
- **THEN** ist der Text `abgelehnt` gerendert, und es gibt kein Element mit der Rolle
  `alertdialog` mehr

#### Scenario: Escape löst mit false auf

- **GIVEN** der Bestätigungsdialog ist offen
- **WHEN** auf dem Dialog-Element die Taste `Escape` gedrückt wird
- **THEN** ist der Text `abgelehnt` gerendert, und es gibt kein Element mit der Rolle
  `alertdialog` mehr

#### Scenario: Backdrop-Klick löst mit false auf

- **GIVEN** der Bestätigungsdialog ist offen
- **WHEN** der Backdrop selbst geklickt wird
- **THEN** ist der Text `abgelehnt` gerendert, und es gibt kein Element mit der Rolle
  `alertdialog` mehr

#### Scenario: Zweite Anfrage ersetzt die offene

- **GIVEN** der Bestätigungsdialog zu einer Anfrage mit dem Titel `Erste?` ist offen, und
  die Komponente rendert das Ergebnis jeder Anfrage in Reihenfolge als Liste
- **WHEN** eine zweite Anfrage mit dem Titel `Zweite?` gestellt wird
- **THEN** ist das Ergebnis der ersten Anfrage `abgelehnt` gerendert, das der zweiten noch
  nicht, und es gibt genau ein Element mit der Rolle `alertdialog`, mit dem Namen `Zweite?`

### Requirement: Ohne Provider

Außerhalb eines `ConfirmProvider` SHALL `confirm()` sofort mit `false` aufgelöst werden und
MUST NOT einen Dialog rendern oder einen Fehler werfen.

#### Scenario: Anfrage ohne Provider wird sofort abgelehnt

- **GIVEN** dieselbe Komponente wie im Bestätigungsdialog, gerendert ohne `ConfirmProvider`
- **WHEN** `Rückfrage` ausgelöst wird
- **THEN** ist der Text `abgelehnt` gerendert, und es gibt kein Element mit der Rolle
  `alertdialog`

### Requirement: Stylesheet der Dialoge

Das Stylesheet SHALL für jeden Dialog-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, jede `@keyframes`-Regel und jede
`animation`-Deklaration im Bewegungsblock).

#### Scenario: Dialog-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Dialog-Selektor gesucht wird
- **THEN** ist jeder der sieben Dialog-Selektoren vorhanden, und der Text außerhalb des
  Tokenblocks enthält keinen `#`-Hex-Wert und keinen Aufruf von `rgb(`, `rgba(`, `hsl(`
  oder `hsla(`
