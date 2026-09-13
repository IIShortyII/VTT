## 1. Bausteine und Wörterbücher

- [x] 1.1 `src/client/ui/Modal.tsx` nach design.md D1/D2 anlegen (Backdrop, Box mit Rolle/`aria-modal`/`aria-labelledby`/`aria-describedby`, Schließen-Schaltfläche als erstes Element, Escape auf `document`, Tab-Zyklus, Fokus beim Öffnen nur wenn kein Kind ihn trägt, Fokusrückgabe mit `isConnected`-Guard); prüfen: `pnpm typecheck:src` und `pnpm lint` grün, Importe nur `react`, `Icon`, `locale`
- [x] 1.2 `src/client/ui/confirm.tsx` nach design.md D3 anlegen (`ConfirmOptions`, `ConfirmProvider` mit `alertdialog`-Modal, `Abbrechen` mit `autoFocus`, bestätigende Schaltfläche `danger`/`primary`, `useConfirm` mit Standardwert „sofort `false`", zweite Anfrage löst die erste mit `false` auf); prüfen: `pnpm typecheck:src` grün
- [x] 1.3 Fünf Schlüssel aus design.md D5 in `src/client/i18n/de.ts` und `en.ts` ergänzen; prüfen: `pnpm typecheck:src` grün (Schlüsselgleichheit)

## 2. Anwendung und Einsätze

- [x] 2.1 `App.tsx` nach design.md D4 vom `ConfirmProvider` umschließen lassen (innerhalb des Toast-Providers); prüfen: `AppShell` unverändert, `pnpm typecheck:src` grün
- [x] 2.2 `MapLibrary.tsx` nach design.md D6 umstellen (`confirmingDelete`/`handleDeleteClick` entfernen, `handleDelete` mit `await confirm(…)`, Schaltfläche `Löschen` mit Klasse `danger`, `useT` nur für `map.delete.*`); prüfen: kein `Wirklich löschen` mehr im Code, Fehlerpfade unverändert
- [x] 2.3 `SessionList.tsx` nach design.md D7 umstellen (`aria-haspopup="dialog"` statt `aria-expanded`, `open`/`close` statt `toggle`, beide Formulare in `Modal` mit `aria-label`, ohne Klasse `panel` und ohne eigene `<h2>`; Felder, `name`-Attribute, `autoFocus`, Fehlermeldung und Schaltflächen buchstabengleich); prüfen: `pnpm typecheck:src` und `pnpm lint` grün

## 3. Stylesheet

- [x] 3.1 Abschnitt „Dialoge (ui-dialog, #89)" nach design.md D8 vor dem Bewegungsblock in `theme.css` ergänzen und `@keyframes modal-in` samt `.modal { animation … }` in den bestehenden Bewegungsblock einfügen; prüfen: kein Farbwert außerhalb `:root`, kein zweites `@media`, `pnpm lint` grün

## 4. Abschluss

- [x] 4.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 89` meldet grün
- [x] 4.2 App-Test: Karte löschen → Dialog mit Frage, `Abbrechen`/Esc/Backdrop/X schließen ohne Anfrage und geben den Fokus an `Löschen` zurück, `Löschen` im Dialog löscht; `Sitzung leiten`/`Beitreten` → Dialog mit Formular, Feld fokussiert, Tab bleibt im Dialog, Esc schließt, Erstellen/Beitritt schließt und lädt die Liste; Einblenden nur ohne „Bewegung reduzieren"; prüfen: menschliche Freigabe (`constitution.md` §3.4)
