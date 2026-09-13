## Purpose

Das Formularmuster des Clients: eine Feldhülle, die Label, Steuerelement und Fehlertext
eines Feldes verdrahtet (`aria-invalid`, `aria-describedby`), eine Absende-Schaltfläche,
die gesperrt bleibt, solange das Formular ungültig oder eine Anfrage ausstehend ist, und
nach vier Sekunden ohne Antwort eine Rückversicherung zeigt, sowie das Formularraster im
Stylesheet. Fehler stehen am betroffenen Feld, nicht irgendwo im Formular; ob eine Eingabe
angenommen wurde, entscheidet allein die Antwort des Servers (`constitution.md` §9.1) — die
clientseitige Gültigkeitsprüfung sperrt nur die Schaltfläche, sie ersetzt keine Prüfung an
der Grenze. Aussehen nimmt der menschliche App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Feld**: die Komponente `Field` aus `src/client/ui/form.tsx` mit den Props `id` (Text),
  `label` (Text), `error` (Text oder `null`, optional) und `children` — eine
  Render-Funktion, die die **Steuerelement-Props** erhält und das Steuerelement zurückgibt.
  Das Feld rendert die **Feldhülle** `<div class="form-field">`, darin zuerst das
  **Feldlabel** `<label class="field-label" for="<id>">` mit dem Text `label`, dann das
  Steuerelement, dann — nur mit `error` — den **Feldfehler**: ein Absatz mit `id`
  `<id>-error`, Klasse `field-error`, `role="alert"` und dem Text `error`, außerhalb des
  Labels.
- **Steuerelement-Props**: `{ id, 'aria-invalid', 'aria-describedby' }` — `id` gleich
  `id` des Feldes; mit `error` ist `aria-invalid` `true` und `aria-describedby` gleich
  `<id>-error`; ohne `error` sind beide `undefined` (das Steuerelement trägt dann keines
  der beiden Attribute).
- **Absende-Schaltfläche**: die Komponente `SubmitButton` aus `src/client/ui/form.tsx` mit
  den Props `pending` (Wahrheitswert), `disabled` (Wahrheitswert, optional), `className`
  (Text, optional) und `children` (die **Beschriftung**). Sie rendert genau ein
  `<button type="submit">`, das `disabled` ist, wenn `disabled` oder `pending` wahr ist,
  und `aria-busy="true"` genau dann trägt, wenn `pending` wahr ist. Während `pending`
  steht als erstes Kind der **Spinner** `<span class="spinner" aria-hidden="true">`.
- **Verzögerungsgrenze**: `SLOW_AFTER_MS` aus `src/client/ui/form.tsx`, 4000 Millisekunden.
  Ist `pending` ununterbrochen mindestens so lange wahr, zeigt die Absende-Schaltfläche
  statt der Beschriftung den **Rückversicherungstext** (`ui-text`, `form.stillWorking`:
  „Verbinde noch… das kann einen Moment dauern." / „Still connecting… this may take a
  moment."). Wird `pending` falsch, zeigt sie wieder die Beschriftung; ein späteres
  `pending` zählt von vorn.
- **Formularfehler**: ein Absatz mit Klasse `form-error` und `role="alert"`, den ein
  Formular unter seinem letzten Feld und vor der Buttonleiste rendert — für eine Meldung
  ohne Feldbezug.
- **Formularraster**: `<form class="form-grid">`; die **Buttonleiste** ist
  `<div class="form-actions">`; eine **Optionszeile** ist ein `<fieldset>` mit den Klassen
  `form-field` und `form-field--row`, dessen `<legend>` die Klasse `field-label` trägt.
- **Gültig**: der aktuelle Zustand eines Formulars wird von dem gemeinsamen zod-Schema aus
  `src/shared/`, das der Server für dieselbe Anfrage an der Grenze benutzt, erfolgreich
  geparst (`safeParse(...).success`). Welches Schema gilt, sagt die Requirement des
  jeweiligen Formulars.
- **Formularmuster**: ein Formular folgt dem Formularmuster, wenn es das Formularraster
  benutzt, jedes Eingabefeld ein Feld ist, seine Absende-Schaltfläche eine
  Absende-Schaltfläche mit `disabled` genau dann, wenn das Formular nicht gültig ist, und
  `pending` genau während einer laufenden Anfrage, sein Submit-Handler bei nicht gültig oder
  ausstehend nichts sendet, beim Start einer Anfrage alle Feld- und Formularfehler leert,
  eine Ablehnung des Servers mit `field`, das eines seiner Felder benennt, als Feldfehler
  dieses Feldes zeigt und jede andere Ablehnung sowie einen Netzfehler als Formularfehler;
  Fehler bleiben bis zum nächsten Absenden stehen. Eine Abbrechen-Schaltfläche neben der
  Absende-Schaltfläche ist nie gesperrt.
- **Formular-Selektoren**: `.form-grid`, `.form-field`, `.form-field--row`,
  `.form-actions`, `.form-error` und `.spinner`. Ein Selektor ist **vorhanden**, wenn das
  Stylesheet (`src/client/app/theme.css`, siehe `ui-theme`) nach Normalisierung die
  Zeichenfolge `<selektor> {` enthält.
- **Bewegungsblock**, **Tokenblock**: siehe `ui-theme`, „Begriffe".

## ADDED Requirements

### Requirement: Feldhülle

Das Feld SHALL Feldlabel, Steuerelement und Feldfehler in dieser Reihenfolge in der
Feldhülle rendern und das Steuerelement über `id`/`for` mit dem Label verknüpfen. Mit
`error` SHALL das Steuerelement `aria-invalid="true"` tragen und per `aria-describedby`
auf den Feldfehler zeigen; der Feldfehler SHALL `role="alert"` tragen und MUST NOT
innerhalb des Labels stehen. Ohne `error` MUST NOT das Feld einen Feldfehler rendern, und
das Steuerelement MUST NOT `aria-invalid` oder `aria-describedby` tragen.

#### Scenario: Feld ohne Fehler

- **GIVEN** ein Feld mit `id` `code`, `label` `Sitzungscode`, ohne `error`, dessen
  Render-Funktion ein Textfeld mit den Steuerelement-Props zurückgibt
- **WHEN** es gerendert wird
- **THEN** ist das Textfeld über das Label `Sitzungscode` erreichbar, trägt die `id`
  `code`, weder `aria-invalid` noch `aria-describedby`, sein Elternelement trägt die Klasse
  `form-field`, das Label trägt die Klasse `field-label`, und es gibt kein Element mit der
  Rolle `alert`

#### Scenario: Feld mit Fehler

- **GIVEN** ein Feld mit `id` `code`, `label` `Sitzungscode` und `error`
  `Der Sitzungscode ist ungültig.`
- **WHEN** es gerendert wird
- **THEN** trägt das Textfeld `Sitzungscode` `aria-invalid="true"` und `aria-describedby`
  gleich `code-error`; das Element mit dieser `id` hat die Rolle `alert`, die Klasse
  `field-error` und den Text `Der Sitzungscode ist ungültig.`, sein Elternelement ist die
  Feldhülle (Klasse `form-field`), nicht das Label, und es steht im Dokument nach dem
  Textfeld

### Requirement: Absende-Schaltfläche

Die Absende-Schaltfläche SHALL gesperrt sein, solange `disabled` oder `pending` wahr ist,
und `aria-busy="true"` sowie den Spinner genau während `pending` zeigen. Nach der
Verzögerungsgrenze ununterbrochenen `pending` SHALL sie den Rückversicherungstext statt
der Beschriftung zeigen; endet `pending`, SHALL sie sofort wieder die Beschriftung zeigen.
Der Timer SHALL beim Ende von `pending` und beim Unmount aufgeräumt werden; ein erneutes
`pending` SHALL von vorn zählen.

#### Scenario: Gesperrt, solange das Formular ungültig ist

- **GIVEN** ein Formular mit einer Absende-Schaltfläche `Beitreten` mit `disabled` wahr und
  `pending` falsch, dessen Submit-Handler Aufrufe zählt
- **WHEN** die Schaltfläche `Beitreten` angeklickt wird
- **THEN** ist die Schaltfläche gesperrt, trägt kein `aria-busy` und keinen Spinner, zeigt
  den Text `Beitreten`, und der Submit-Handler wurde nicht aufgerufen

#### Scenario: Ladezustand

- **GIVEN** eine Absende-Schaltfläche `Beitreten` mit `pending` wahr und `disabled` falsch
- **WHEN** sie gerendert wird
- **THEN** ist sie gesperrt, trägt `aria-busy="true"`, ihr erstes Kind ist ein Element mit
  der Klasse `spinner` und `aria-hidden="true"`, und ihr Text ist `Beitreten`

#### Scenario: Rückversicherung nach der Verzögerungsgrenze

- **GIVEN** eine Absende-Schaltfläche `Beitreten` mit `pending` wahr, gerendert unter
  falschen Timern
- **WHEN** 3999 Millisekunden vergehen und danach eine weitere Millisekunde
- **THEN** zeigt sie nach 3999 Millisekunden noch den Text `Beitreten` und nach 4000
  Millisekunden den Text `Verbinde noch… das kann einen Moment dauern.`; sie ist weiterhin
  gesperrt und trägt `aria-busy="true"`

#### Scenario: Ende des Ladezustands stellt die Beschriftung wieder her

- **GIVEN** eine Absende-Schaltfläche `Beitreten`, deren `pending` seit 5000 Millisekunden
  wahr ist und die den Rückversicherungstext zeigt
- **WHEN** `pending` falsch wird und danach erneut wahr wird und 1000 Millisekunden vergehen
- **THEN** zeigt sie nach dem ersten Wechsel sofort den Text `Beitreten`, ist nicht gesperrt
  und trägt kein `aria-busy`; nach dem zweiten Wechsel ist sie gesperrt und zeigt nach den
  1000 Millisekunden weiterhin `Beitreten`

#### Scenario: Unmount räumt den Timer auf

- **GIVEN** eine Absende-Schaltfläche mit `pending` wahr, gerendert unter falschen Timern,
  1000 Millisekunden nach dem Rendern
- **WHEN** sie ausgehängt wird
- **THEN** steht nach dem Unmount und vor jedem weiteren Vorrücken der Zeit kein Timer mehr
  aus, und ein anschließendes Vorrücken um 4000 Millisekunden löst keinen Fehler und keine
  Zustandsänderung aus

### Requirement: Rückversicherungstext in der aktiven Sprache

Der Rückversicherungstext SHALL aus den Wörterbüchern von `ui-text` stammen
(`form.stillWorking`) und der aktiven Sprache folgen.

#### Scenario: Rückversicherung auf Englisch

- **GIVEN** die aktive Sprache ist `en`, und eine Absende-Schaltfläche `Join` mit `pending`
  wahr ist unter falschen Timern gerendert
- **WHEN** 4000 Millisekunden vergehen
- **THEN** zeigt sie den Text `Still connecting… this may take a moment.`

### Requirement: Stylesheet der Formulare

Das Stylesheet SHALL für jeden Formular-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, jede `@keyframes`-Regel und jede
`animation`-Deklaration im Bewegungsblock). Die Drehung des Spinners SHALL ausschließlich
im Bewegungsblock deklariert sein.

#### Scenario: Formular-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Formular-Selektor gesucht wird
- **THEN** ist jeder der sechs Formular-Selektoren vorhanden, und der Text außerhalb des
  Tokenblocks enthält keinen `#`-Hex-Wert und keinen Aufruf von `rgb(`, `rgba(`, `hsl(`
  oder `hsla(`

#### Scenario: Spinner dreht nur opt-in

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert, mit dem per
  Klammerzählung bestimmten Inhalt jedes `@media`-Blocks
- **WHEN** nach `@keyframes spin` und nach einer `animation`-Deklaration für `.spinner`
  gesucht wird
- **THEN** liegen beide innerhalb eines Bewegungsblocks, außerhalb jedes Bewegungsblocks
  gibt es keine `animation`-Deklaration, und keine `@media`-Regel hat eine andere Abfrage
  als `(prefers-reduced-motion: no-preference)`
