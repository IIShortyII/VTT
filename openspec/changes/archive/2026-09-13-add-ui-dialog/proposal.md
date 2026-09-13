## Why

Es gibt heute kein `role="dialog"`, keinen Focus-Trap und kein Escape-Verhalten. Die
Bestätigung einer destruktiven Aktion ist ein Zwei-Klick-Knopf: `Löschen` wird in der
Kartenbibliothek zu `Wirklich löschen`, ohne Abbruch außer Wegnavigieren. Die Formulare
`Sitzung leiten` und `Beitreten` der Startansicht sind seit #86 Aufklapp-Panels — mit dem
ausdrücklichen Versprechen, dass #89 sie ins Modal hebt, sobald der Baustein da ist. Dieser
Change (Issue #89, zweites Kind des Epics #102) führt den Modal-Baustein und darauf den
Bestätigungsdialog mit Promise-API ein, ersetzt den Zwei-Klick-Knopf und hebt die beiden
Startformulare in den Dialog.

Entscheidungen aus dem Issue-Text (#89, #102) und der Explore-Runde (2026-09-13):
- **Umfang: Bausteine, Karte löschen, Startformulare.** Modal und Confirm als Bausteine;
  einziger Confirm-Einsatz ist das Löschen in der Kartenbibliothek; die Aufklapp-Panels der
  Startansicht werden zu Dialogen. `Sitzung beenden`, `Token entfernen` und
  `Bereich löschen` bleiben ohne Rückfrage — Epic C (#93, #95, #96) baut diese Stellen um
  und nutzt dann `useConfirm()`. `session:replaced` und der `alertdialog` beim Sitzungsende
  gehören zu #91.
- **Neue Capability `ui-dialog`, nicht `ui-feedback`.** `ui-feedback` ist laut Purpose der
  Kanal für transiente, nicht-interaktive Rückmeldungen ohne Folgeentscheidung; ein Dialog
  ist das Gegenteil (blockierend, interaktiv, mit Entscheidung). Die Einsätze sind
  MODIFIED-Deltas an `map-library` und `ui-start`; #91 und #92 beziehen sich künftig auf
  `ui-dialog`.
- **Kein Portal, kein `<dialog>`-Element.** Das Modal rendert an Ort und Stelle mit
  `position: fixed`; kein Vorfahr im Layout trägt `transform`/`filter`, also deckt der
  Backdrop das Fenster. Das native `<dialog>` scheidet aus (#101: kein natives UI; jsdom
  kennt `showModal` nicht). Der Bestätigungsdialog hängt an einem Provider mit Kontext wie
  der Toast (#88) — alle Auslöser sind React-Komponenten; ohne Provider löst `confirm()`
  sofort mit `false` auf.
- **Fokus beim Öffnen: erstes fokussierbares Element, es sei denn, ein Kind hat ihn schon.**
  Das Issue nennt das erste fokussierbare Element (die Schließen-Schaltfläche steht vorn in
  der Box). Für den Bestätigungsdialog ist `Abbrechen` der sichere Startpunkt, für die
  Startformulare das Eingabefeld — beide tragen `autoFocus`, und das Modal lässt einen
  bereits in der Box liegenden Fokus in Ruhe. Keine `initialFocus`-Prop, keine zweite Regel.
- **Zugänglicher Name über den Titel.** Der Dialog trägt `aria-labelledby` auf seine
  Titelüberschrift (Ebene 2) statt eines doppelten `aria-label`; ein `alertdialog` bekommt
  zusätzlich `aria-describedby` auf seinen Beschreibungstext.
- **`aria-haspopup="dialog"` statt `aria-expanded`.** Die Hero-Aktionen öffnen jetzt einen
  Dialog, kein Aufklapp-Panel; ein erneutes Auslösen derselben Aktion ist bei geöffnetem
  Dialog nicht mehr erreichbar (Backdrop). Das Szenario „Beitreten schließt das
  Erstellen-Formular" entfällt, dafür kehrt der Fokus nach `Abbrechen` zum Auslöser zurück.
- **Texte über `ui-text`.** `Schließen` und `Abbrechen` des Bausteins sowie Titel, Satz
  und Verb der Karten-Rückfrage kommen aus den Wörterbüchern; die Kartenbibliothek zieht
  dafür erstmals `useT()` — ihre übrigen Rohstrings bleiben bis Epic C, wie in #87
  entschieden.

## What Changes

- **Neue Capability `ui-dialog`:** Komponente `Modal` (Backdrop, Box mit Rolle `dialog`
  oder `alertdialog`, `aria-modal`, Titel als Überschrift, Schließen-Schaltfläche als
  erstes Element, Focus-Trap per Tab-Zyklus, Schließen per Esc, Backdrop-Klick und
  Schaltfläche, Fokusrückgabe an den Auslöser mit `isConnected`-Guard),
  `ConfirmProvider` und Hook `useConfirm()` mit `confirm(options)` → `Promise<boolean>`
  (Titel als Frage, Satz als Folge, bestätigende Schaltfläche mit Verb, `danger` rot,
  `Abbrechen` mit Fokus; Esc/Backdrop/Abbrechen → `false`; ohne Provider sofort `false`),
  Stylesheet-Abschnitt mit Einblenden ausschließlich im Bewegungsblock.
- **`map-library` (MODIFIED):** Requirement „Bibliotheksoberfläche" — `Löschen` öffnet den
  Bestätigungsdialog `Karte „<Name>" löschen?`; bestätigt sendet `DELETE`, `Abbrechen`
  sendet nichts und gibt den Fokus an `Löschen` zurück. Kein Zwei-Klick-Knopf mehr.
- **`ui-start` (MODIFIED):** Requirements „Hero der Startansicht" und „Erstellen und
  Beitreten auf Anforderung" — `Sitzung leiten`/`Beitreten` tragen `aria-haspopup="dialog"`
  und öffnen ihr Formular in einem Dialog gleichen Namens; `Abbrechen`, Esc und die
  Schließen-Schaltfläche schließen ihn; Absenden, Bestätigung und Ablehnung wie bisher.
- **Anwendung:** `App` ist zusätzlich vom `ConfirmProvider` umschlossen (innerhalb des
  Toast-Providers).
- **Wörterbücher (`ui-text`):** `dialog.close`, `dialog.cancel`, `map.delete.title`,
  `map.delete.message`, `map.delete.confirm` in `de` und `en`.

## Capabilities

### New Capabilities
- `ui-dialog`: Modal-Baustein (Markup, Fokus beim Öffnen, Tab-Zyklus, Schließen, Fokusrückgabe),
  Bestätigungsdialog mit Promise-API, Verhalten ohne Provider, Stylesheet der Dialoge.

### Modified Capabilities
- `map-library`: Requirement „Bibliotheksoberfläche" — Löschen nach Bestätigung im Dialog,
  Abbrechen ohne Anfrage.
- `ui-start`: Requirements „Hero der Startansicht" (Auslöser mit `aria-haspopup="dialog"`,
  kein Dialog ohne Auslösen) und „Erstellen und Beitreten auf Anforderung" (Formulare im
  Dialog, Schließen per Abbrechen/Esc/Schließen, Fokusrückgabe).

## Impact

- Neu: `src/client/ui/Modal.tsx` (Komponente), `src/client/ui/confirm.tsx` (Provider, Hook).
- Geändert: `src/client/app/App.tsx` (Provider), `src/client/map/MapLibrary.tsx` (Confirm
  statt Zwei-Klick, `useT` für die Rückfrage), `src/client/session/SessionList.tsx`
  (Formulare im Modal, `aria-haspopup`), `src/client/i18n/de.ts`, `src/client/i18n/en.ts`
  (fünf Schlüssel), `src/client/app/theme.css` (Abschnitt „Dialoge" und Ergänzung des
  Bewegungsblocks).
- Unverändert: Server, `shared/`, Prisma-Schema, `AppShell`, Toast, Icon-Registry (`close`
  ist vorhanden), `SessionRoom` (alle Raum-Aktionen, `session:replaced`), Passwortformular.
- Keine neue Dependency. Kein Datenbank- oder API-Vertragswechsel.
- Bestehende Tests: das Szenario „Löschen nach Bestätigung" der Bibliothek prüft künftig
  den Dialog statt des zweiten Knopfs; die Szenarien der Startansicht zu Hero-Aktionen und
  Formularen werden auf Dialog und `aria-haspopup` umgestellt (Formularname, Feldnamen und
  Schaltflächen bleiben). Die Raumansicht, die Shell und der Toast-Host sind nicht berührt;
  kein bestehender Test fragt `role="dialog"` ab.
