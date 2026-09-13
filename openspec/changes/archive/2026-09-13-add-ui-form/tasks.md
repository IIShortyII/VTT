## 1. Baustein und Wörterbücher

- [x] 1.1 `src/client/ui/form.tsx` nach design.md D1 anlegen (`SLOW_AFTER_MS`, `Field` mit Feldhülle/Label/Feldfehler und Steuerelement-Props, `SubmitButton` mit `disabled`/`aria-busy`/Spinner/Timer und Cleanup); prüfen: `pnpm typecheck:src` und `pnpm lint` grün, Importe nur `react` und `locale`
- [x] 1.2 Schlüssel `form.stillWorking` aus design.md D9 in `src/client/i18n/de.ts` und `en.ts` ergänzen; prüfen: `pnpm typecheck:src` grün (Schlüsselgleichheit)

## 2. Server

- [x] 2.1 `src/server/session/routes.ts` nach design.md D8: neue `JOIN_FAILURE_MESSAGE`, `404` des Beitritts mit `field` `code`; `src/server/auth/routes.ts`: beide `409` der vergebenen E-Mail mit `field` `email`; prüfen: `pnpm typecheck:src` grün, keine weiteren Textänderungen

## 3. Formulare

- [x] 3.1 `LoginForm.tsx`, `RegisterForm.tsx`, `ChangePasswordForm.tsx` nach design.md D2–D4 umstellen (`form-grid`, `Field` je Feld, `fieldErrors`/`formError`, `valid` aus dem Schema, `SubmitButton` in `form-actions`, Formularfehler nach dem letzten Feld); prüfen: Beschriftungen, `id`s, `name`-Attribute, `autoComplete` buchstabengleich
- [x] 3.2 `SessionList.tsx` nach design.md D5 umstellen (beide Dialogformulare, `form-actions` statt `panel-actions`, `Abbrechen` nie gesperrt, `open`/`close` leeren alle Fehler); prüfen: `autoFocus`/`required` bleiben, Formularname per `aria-label` bleibt
- [x] 3.3 `MapLibrary.tsx` nach design.md D6 umstellen (nur Formular „Neue Karte"; Upload-Ablehnung als Formularfehler); prüfen: Rasterformular der Kartenansicht unverändert
- [x] 3.4 `TokenPanel.tsx` und `SessionRoom.tsx` nach design.md D7 umstellen (`onCreate` liefert `Promise<boolean>`, `pending` bis zum Acknowledgement, Name nur bei `true` leeren, `Field` je Feld, Optionszeile `Symbol`, `valid` aus `CreateTokenInputSchema` ohne `sessionId`); prüfen: Ablehnung weiterhin als `tokenError` im Raum, Toast bei Erfolg bleibt

## 4. Stylesheet

- [x] 4.1 Abschnitt „Formulare (ui-form, #90)" nach design.md D10 vor dem Bewegungsblock in `theme.css` ergänzen, `.auth-panel form` und `.start-account form` entfernen, `@keyframes spin` samt `.spinner { animation … }` in den bestehenden Bewegungsblock einfügen; prüfen: kein Farbwert außerhalb `:root`, kein zweites `@media`, `.panel-actions` und `.auth-panel` weiterhin vorhanden, `pnpm lint` grün

## 5. Abschluss

- [x] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 90` meldet grün
- [x] 5.2 App-Test: Anmelden mit leerem Feld → Schaltfläche gesperrt; falsches Passwort → Formularfehler unter den Feldern; Registrieren mit vergebenem Nutzernamen/vergebener E-Mail → Fehler am Feld, rot umrandet; Beitreten mit falschem Code → Fehler am Feld `Sitzungscode` mit neuem Text; langsame Antwort (Netzwerk drosseln) → Spinner, nach 4 s Rückversicherungstext; Token anlegen ohne Namen gesperrt, mit Namen Spinner bis zum Ack; Karte anlegen mit Fehler am Namen; Spinner ohne Drehung unter „Bewegung reduzieren"; prüfen: menschliche Freigabe (`constitution.md` §3.4)
