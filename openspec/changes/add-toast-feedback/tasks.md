## 1. Toast-Modul und Wörterbücher

- [x] 1.1 `src/client/ui/toast.tsx` nach design.md D1 anlegen (`TOAST_TTL_MS`, `TOAST_MAX`, `ToastProvider` mit Host `role="status" aria-live="polite"` immer gerendert, `useToasts` mit No-Op-Standard; Dedupe, Stapelgrenze, Timer-Räumen beim Unmount); prüfen: `pnpm typecheck:src` und `pnpm lint` grün, die Datei importiert nur `react`
- [x] 1.2 Sechs Schlüssel aus design.md D3 in `src/client/i18n/de.ts` und `en.ts` ergänzen; prüfen: `pnpm typecheck:src` grün (Schlüsselgleichheit)

## 2. Anwendung und Auslöser

- [x] 2.1 `App.tsx` nach design.md D2 vom `ToastProvider` umschließen lassen; prüfen: Host steht nach dem Footer, `AppShell` unverändert, `pnpm typecheck:src` grün
- [x] 2.2 `ChangePasswordForm.tsx` nach design.md D4 umstellen (Erfolg als Toast, `message` nur noch für Ablehnung und Netzfehler); prüfen: nach Erfolg kein `role="alert"` im Formular, Felder geleert
- [x] 2.3 `SessionRoom.tsx` nach design.md D4: Schaltfläche `Kopieren` neben dem Code mit `handleCopyCode` (Zwischenablage, Toast nur im `then`, `catch` ohne Toast), Toast nach `ok` in `handleTokenCreate` und `handleAnnotationDelete` (`eine` → Einzahl, sonst Mehrzahl); prüfen: kein Toast vor dem Acknowledgement, Fehlerpfade unverändert, `pnpm typecheck:src` grün
- [x] 2.4 `MapPanel.tsx` nach design.md D4: Toast nach erfolgreichem Einhängen; prüfen: übrige Texte bleiben Rohstrings, `pnpm typecheck:src` grün

## 3. Stylesheet

- [x] 3.1 Abschnitt „Rückmeldungen (ui-feedback, #88)" nach design.md D5 vor dem Bewegungsblock in `theme.css` ergänzen und `@keyframes toast-in` samt `.toast { animation … }` in den bestehenden Bewegungsblock einfügen; prüfen: kein Farbwert außerhalb `:root`, kein zweites `@media`, `pnpm lint` grün

## 4. Abschluss

- [x] 4.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 88` meldet grün
- [x] 4.2 App-Test: Passwort ändern → Toast statt Inline; Sitzungscode kopieren → Toast und Zwischenablage; Token anlegen, Karte einhängen, Anmerkung entfernen → je ein Toast; vier schnelle Toasts → höchstens drei, ältester verschwindet; derselbe Toast zweimal → einer mit verlängerter Dauer; Slide-in nur ohne „Bewegung reduzieren"; prüfen: menschliche Freigabe (`constitution.md` §3.4)
