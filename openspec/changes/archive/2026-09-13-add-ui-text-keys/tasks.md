## 1. Wörterbücher und Modul

- [x] 1.1 `src/client/i18n/de.ts` mit allen Schlüsseln und deutschen Texten aus design.md D2 (`as const`, Export `TextKey`) anlegen; prüfen: `pnpm typecheck:src` grün, Schlüsselzahl entspricht der Tabelle
- [x] 1.2 `src/client/i18n/en.ts` als `Record<TextKey, string>` mit den englischen Texten aus D2 anlegen; prüfen: ein absichtlich entfernter Schlüssel macht `pnpm typecheck:src` rot, danach wieder vollständig
- [x] 1.3 `src/client/i18n/locale.ts` nach design.md D1 (`LOCALES`, `DEFAULT_LOCALE`, `LOCALE_STORAGE_KEY`, `getLocale`, `setLocale`, `subscribe`, `t` mit Platzhaltern, `useLocale`, `useT`; Speicher-Zugriffe in `try/catch`, `<html lang>` beim Laden und bei jedem Wechsel); prüfen: `pnpm typecheck:src` und `pnpm lint` grün

## 2. Zuordnungstabellen und Schalter

- [x] 2.1 `session-status.ts` auf `TextKey`-Labels umstellen und `TRANSITION_LABELS` ergänzen (design.md D3), nur Typ-Imports; prüfen: `pnpm typecheck:src` grün, keine Laufzeit-Importe von React/Pixi in der Datei
- [x] 2.2 `src/client/app/LocaleSwitch.tsx` nach design.md D4 anlegen (Gruppe `Sprache`/`Language`, Schaltflächen `Deutsch`/`English` mit Text `DE`/`EN`, aktive Sprache `disabled` + `aria-current="true"`); prüfen: `pnpm typecheck:src` grün
- [x] 2.3 `AppShell.tsx` nach design.md D5 umbauen (Wrapper `.app-shell-tools` mit Konto und Schalter, `Zurück`/`Abmelden`/Footer über `t`); prüfen: `pnpm typecheck:src` grün

## 3. Ansichten im Umfang

- [x] 3.1 `Hero.tsx` und `App.tsx` nach design.md D6 umstellen (Overline, Ladehinweis, Servermeldung, Abmelde-Fehler mit `{cause}`, anonymer Hero); prüfen: `pnpm typecheck:src` grün, keine Rohstring-Beschriftung mehr in beiden Dateien
- [x] 3.2 `LoginForm.tsx`, `RegisterForm.tsx`, `ChangePasswordForm.tsx` nach D6 umstellen (Überschrift, Labels, Schaltflächen, Fehler-/Erfolgsmeldungen über `auth.*`); prüfen: Felder behalten `id`, `name`, `autoComplete`, `required`; `pnpm typecheck:src` grün
- [x] 3.3 `SessionList.tsx` nach D6 umstellen (Hero, Aktionen, beide Formulare, Leerzustand, Liste, Karten mit `t(status.label)`/`t(ROLE_LABELS[...])`, Summary, Meldungen über `start.*`); prüfen: Adressen aus ui-start D8 unverändert, `pnpm typecheck:src` grün
- [x] 3.4 `SessionRoom.tsx`: Zustandszeile durch die Zustandspille und die Übergangs-Schaltflächen durch `t(TRANSITION_LABELS[action])` ersetzen (D6), sonst nichts ändern; prüfen: kein Textknoten mit `state.sessionStatus` oder `action`, `pnpm typecheck:src` grün

## 4. Stylesheet

- [x] 4.1 Abschnitt „Textschlüssel (ui-text, #87)" nach design.md D7 vor dem Bewegungsblock in `theme.css` ergänzen und `.app-shell-account` um `grid-column`/`justify-self` kürzen; prüfen: kein Farbwert außerhalb `:root`, kein neues `@media`, `pnpm lint` grün

## 5. Abschluss

- [x] 5.1 Gate grün (Typecheck, Lint, gesamte Suite) und Review ohne blockierende Findings; prüfen: `pnpm harness gate 87` meldet grün
- [x] 5.2 App-Test: DE/EN-Schalter in anonymer Ansicht, Startansicht, Raum und Bibliothek; Zustandspille und Verben im Raum; Reload behält die Sprache; `<html lang>` im Inspektor; prüfen: menschliche Freigabe (`constitution.md` §3.4)
