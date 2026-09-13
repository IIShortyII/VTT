## Why

Meldungen laufen heute durchgängig über ein inline `<p role="alert">`; Erfolg und Fehler
landen im selben Element (das Passwortformular zeigt `Passwort geändert.` als `role="alert"`),
und für Gelungenes ohne Folgeentscheidung gibt es keine eigene, unaufdringliche Form —
Token anlegen, Karte einhängen und Anmerkung entfernen erzeugen heute gar keine
Rückmeldung, nur der Bestand vom Server ändert sich. Ein Sitzungscode lässt sich nicht
kopieren, nur abschreiben. Dieser Change (Issue #88, erstes Kind des Epics #102) führt den
Toast als Kanal für Gelungenes ein: ein Host unten mittig, Textpillen mit fester
Lebensdauer, begrenztem Stapel und Dedupe, dazu die Umstellung der vorhandenen
Erfolgsstellen und ein minimaler Kopieren-Knopf für den Sitzungscode.

Entscheidungen aus dem Issue-Text (#88, #102) und der Explore-Runde (2026-09-13):
- **Kopieren-Knopf minimal mit dabei.** Neben `Code: ABC234` eine Schaltfläche mit Text
  `Kopieren` (kein Icon — die Registry aus `ui-icons` hat kein `copy`, und ein neues Icon
  hieße ein Delta an einer festen Namensliste), die über die Zwischenablage des Browsers
  kopiert und danach `Sitzungscode kopiert` auslöst. Scheitert das Kopieren, bleibt es ohne
  Toast. Die Session-Bar (#93) baut die Stelle ohnehin um und kann dann ein Icon ergänzen.
- **Provider mit Kontext, kein Modul-Store.** Anders als bei `t()` (#87), das auch außerhalb
  von React gebraucht wird, sind alle Auslöser React-Komponenten. Ein Provider bindet Liste
  und Timer an den Lebenszyklus des Baums: das Räumen beim Unmount ist ein normaler
  Effekt-Cleanup, unter StrictMode sauber, und Tests derselben Datei teilen keine globalen
  Timer. Außerhalb des Providers ist `push` ein No-Op — Teilbäume ohne Provider bleiben
  in bestehenden Tests grün.
- **Regeln bewusst knapp.** Dedupe gegen alle sichtbaren Toasts (Position bleibt, Timer
  startet neu), der vierte verdrängt den ältesten sofort, Reihenfolge ältester oben und
  jüngster unten am Bildrand, keine Interaktion (kein Schließen per Klick, kein Anhalten
  bei Hover, kein Fokus), `push(text)` ohne Optionen, Lebensdauer fest 2,8 s als Konstante.
  Jede weitere Regel wäre eine weitere Stelle, an der test-author und implementer
  aneinander vorbeiraten; Varianten kommen erst mit einem Anlass.
- **Schnitt: eine neue Capability, zwei kleine MODIFIED-Deltas.** Die drei Auslöser im
  Raum (Token, Karte, Anmerkung) sind reine Client-Darstellung nach einem
  `ok`-Acknowledgement und liegen als Requirement in `ui-feedback`; die Server-Specs
  `session-token`, `session-map`, `session-annotation` bleiben unberührt. MODIFIED nur dort,
  wo sich sichtbares Verhalten ändert (`user-auth`: Erfolg als Toast statt `role="alert"`)
  oder ein Element neu entsteht (`game-session`: Schaltfläche `Kopieren`).
- **Texte über `ui-text`.** Sechs neue Schlüssel in beiden Wörterbüchern; das Passwort
  nutzt den vorhandenen `auth.password.changed`. Die übrigen Rohstrings der Raum-Panels
  bleiben wie in #87 entschieden bis Epic C.

## What Changes

- **Neue Capability `ui-feedback`:** Toast-Provider mit Host (`role="status"
  aria-live="polite"`, immer vorhanden), Hook `useToasts()` mit `push(text)`, Lebensdauer
  2,8 s, höchstens drei Toasts (ältester fliegt zuerst), Dedupe gleicher Texte (Timer neu,
  Position bleibt), Räumen der Timer beim Unmount, No-Op ohne Provider, Auslöser im Raum
  (Token angelegt, Karte eingehängt, Anmerkung(en) entfernt) in der aktiven Sprache,
  Stylesheet-Abschnitt mit Slide-in ausschließlich im Bewegungsblock.
- **`user-auth` (MODIFIED):** Requirement „Passwortänderung in der Oberfläche" — der Erfolg
  erscheint als Toast `Passwort geändert.`, das Formular zeigt danach keine Meldung mit
  `role="alert"`; eine Ablehnung bleibt inline. Zwei Szenarien nennen den Kanal.
- **`game-session` (MODIFIED):** Requirement „Sitzungsoberfläche" — Schaltfläche `Kopieren`
  neben dem Sitzungscode (nur Spielleiter), Toast `Sitzungscode kopiert` bei Erfolg, kein
  Toast bei Ablehnung durch die Zwischenablage; zwei bestehende Szenarien nennen die
  Schaltfläche, zwei neue prüfen Kopieren und Scheitern.
- **Anwendung:** `App` ist vom Toast-Provider umschlossen; der Host steht nach dem Footer.
- **Wörterbücher (`ui-text`):** `session.copyCode`, `toast.codeCopied`, `toast.tokenCreated`,
  `toast.mapMounted`, `toast.annotationRemoved`, `toast.annotationsRemoved` in `de` und `en`.

## Capabilities

### New Capabilities
- `ui-feedback`: Toast-Provider, Host und Hook; Lebensdauer, Stapelgrenze, Dedupe, Räumen
  beim Unmount, No-Op ohne Provider; Auslöser im Raum; Stylesheet der Toasts.

### Modified Capabilities
- `user-auth`: Requirement „Passwortänderung in der Oberfläche" — Erfolg als Toast, kein
  `role="alert"` nach Erfolg; Ablehnung inline ohne Toast.
- `game-session`: Requirement „Sitzungsoberfläche" — Schaltfläche `Kopieren` beim
  Sitzungscode, Toast bei Erfolg, kein Toast bei Scheitern; ein Spieler sieht die
  Schaltfläche nicht.

## Impact

- Neu: `src/client/ui/toast.tsx` (Provider, Host, Hook, Konstanten).
- Geändert: `src/client/app/App.tsx` (Provider um die Shell), `src/client/auth/ChangePasswordForm.tsx`
  (Erfolg als Toast, `message` nur noch für Ablehnungen), `src/client/session/SessionRoom.tsx`
  (Schaltfläche `Kopieren`, Toasts nach `ok` bei Token anlegen und Anmerkung entfernen),
  `src/client/session/MapPanel.tsx` (Toast nach erfolgreichem Einhängen),
  `src/client/i18n/de.ts`, `src/client/i18n/en.ts` (sechs Schlüssel),
  `src/client/app/theme.css` (Abschnitt „Rückmeldungen" und Ergänzung des Bewegungsblocks).
- Unverändert: Server, `shared/`, Prisma-Schema, `AppShell`, Icon-Registry, alle
  Fehlermeldungen mit `role="alert"` (Validierungs- und Verbindungsfehler bleiben inline,
  #90/#91), der globale Hinweis der Shell.
- Keine neue Dependency. Kein Datenbank- oder API-Vertragswechsel.
- Bestehende Tests: das Szenario „Erfolgreiche Passwortänderung wird bestätigt" prüft
  künftig den Toast-Host; die beiden Raumansicht-Szenarien aus `game-session` nennen die
  Schaltfläche `Kopieren`. Alle übrigen Anker bleiben — der Toast-Host liegt außerhalb von
  `main` und stört keine darauf gescopte Abfrage; `getByRole('status')` war bisher in
  keinem Test in Gebrauch.
