## Why

Die Formulare des Clients sind kontrolliert und tragen `<label htmlFor>`, aber ein Fehler
landet als `<p role="alert">` irgendwo im Formular, nicht am betroffenen Feld — es gibt
keine Verknüpfung per `aria-invalid`/`aria-describedby`, obwohl der Server in den meisten
Ablehnungen das Feld bereits nennt. Die Absende-Schaltfläche ist während der Anfrage zwar
gesperrt, aber ein leeres Pflichtformular lässt sich abschicken, und bei einer langsamen
Verbindung gibt es keine Rückversicherung. Zwei Formulare (Karte anlegen, Token anlegen)
haben nicht einmal die Feldklassen aus `ui-theme`. Dieser Change (Issue #90, drittes Kind
des Epics #102) führt das Formularmuster als Baustein ein und wendet es auf die sieben
Formulare des Clients an.

Entscheidungen aus dem Issue-Text (#90, #102) und der Explore-Runde (2026-09-13):
- **Neue Capability `ui-form`.** Der Baustein (Feldhülle, Absende-Schaltfläche,
  Formularraster) bekommt eine eigene Capability wie Toast (#88) und Dialog (#89); die
  Einsätze sind MODIFIED-Deltas an `user-auth`, `ui-start`, `game-session`, `map-library`
  und `session-token`. Epic C/D beziehen sich künftig auf `ui-form`, nicht auf eines der
  Formulare, die sie umbauen.
- **Zwei Komponenten in einer Datei.** `Field` rendert Label, Steuerelement und Feldfehler
  und reicht `id`, `aria-invalid`, `aria-describedby` als Props an eine Render-Funktion —
  kein `cloneElement`. `SubmitButton` hält `aria-busy`, Spinner und den 4-Sekunden-Timer
  selbst; sieben Formulare, die das je einzeln nachbauen, wären sieben Abweichungen.
- **Fehler ohne Feldbezug bleiben Formularfehler.** Der Server nennt das Feld, wo genau eines
  verantwortlich ist — neu auch beim unbekannten Sitzungscode (`code`) und bei der vergebenen
  E-Mail (`email`). „E-Mail oder Passwort ist falsch" betrifft beide Felder, ein Netzfehler
  keines; dafür rendert das Formular unter dem letzten Feld einen Formularfehler im selben
  Stil. Ein erfundenes Rückfallfeld würde bei „E-Mail oder Passwort" das Falsche sagen.
- **Karte anlegen voll, Token anlegen ohne Feldfehler.** Karte anlegen ist REST mit
  Ergebnis und `field` wie die fünf anderen. Token anlegen feuert ein Socket-Event; das
  Formular wartet künftig auf das Acknowledgement (`pending`), die Ablehnung bleibt aber
  Raum-Meldung, weil die Requirement „Tokenansicht im Raum" das für alle Token-Aktionen so
  festlegt und #95 die Token-Karten neu schneidet.
- **Gültigkeit aus den gemeinsamen Schemata.** Jedes Formular parst seinen Zustand mit dem
  zod-Schema aus `src/shared/`, das der Server an der Grenze benutzt — dieselbe Regel an
  beiden Enden (AGENTS.md), unabhängig davon, wie weit jsdoms Constraint-Validierung reicht.
  Bewusster Trade-off aus dem Issue: ein zu kurzes Passwort sperrt die Schaltfläche, ohne
  den Grund zu nennen (Browser-Tooltips erscheinen erst beim Absenden).
- **Nur die Beitrittsmeldung wird umformuliert.** Der Server antwortet auf unbekannten Code
  und geschlossene Sitzung weiterhin identisch, jetzt mit „Sitzungscode prüfen und ob die
  Spielleitung die Sitzung geöffnet hat." — nennt die Handlung, verrät nicht den Grund. Alle
  übrigen Servertexte bleiben bis #109 (Fehlercodes).
- **Feldfehler tragen `role="alert"`.** `aria-describedby` allein liest ein Screenreader
  erst beim nächsten Fokus vor; ein Fehler nach dem Absenden braucht die Ansage sofort.

## What Changes

- **Neue Capability `ui-form`:** `Field` (Feldhülle `form-field`, Label `field-label`,
  Feldfehler `field-error` mit `role="alert"` außerhalb des Labels, Steuerelement-Props
  `id`/`aria-invalid`/`aria-describedby`), `SubmitButton` (`disabled` bei ungültig oder
  ausstehend, `aria-busy` und Spinner während `pending`, Rückversicherungstext nach
  `SLOW_AFTER_MS` = 4000 ms, Timer-Cleanup), Formularfehler `form-error`, Formularraster
  `form-grid`/`form-actions`/`form-field--row`, Stylesheet-Abschnitt mit Spinner-Drehung
  ausschließlich im Bewegungsblock.
- **`user-auth` (MODIFIED):** Server — vergebene E-Mail antwortet `409` mit `field` `email`.
  Client — Anmelden, Registrieren und Passwort ändern folgen dem Formularmuster
  (Feldfehler bei `field`, Formularfehler sonst, Schaltfläche gesperrt bei ungültig, Ladezustand
  mit Rückversicherung).
- **`game-session` (MODIFIED):** `POST /api/sessions/join` antwortet bei unbekanntem Code und
  geschlossener Sitzung mit `404`, `field` `code` und der neuen Meldung.
- **`ui-start` (MODIFIED):** Erstellen- und Beitreten-Formular folgen dem Formularmuster;
  Ablehnungen erscheinen am Feld `Name` bzw. `Sitzungscode`; `Abbrechen` nie gesperrt.
- **`map-library` (MODIFIED):** Formular „Neue Karte" folgt dem Formularmuster; Ablehnung
  von `POST /api/maps` am Feld `Name`, Upload-Ablehnung als Formularfehler.
- **`session-token` (MODIFIED):** Formular `Tokens` folgt dem Formularmuster ohne Feldfehler;
  `Anlegen` gesperrt bei ungültig oder ausstehendem Acknowledgement; Name wird nur nach
  bestätigendem Acknowledgement geleert.
- **Wörterbücher (`ui-text`):** `form.stillWorking` in `de` und `en`.

## Capabilities

### New Capabilities
- `ui-form`: Feldhülle (Markup, `aria`-Verdrahtung), Absende-Schaltfläche (Sperre,
  Ladezustand, Rückversicherung nach 4 s, Timer-Cleanup), Rückversicherungstext in der
  aktiven Sprache, Stylesheet der Formulare.

### Modified Capabilities
- `user-auth`: Requirements „Kontoregistrierung" (409 mit `field` `email`),
  „Anmeldeoberfläche", „Passwortänderung in der Oberfläche", „Registrierungsoberfläche"
  (Formularmuster, Feldfehler, Sperre, Ladezustand).
- `game-session`: Requirement „Beitritt per Sitzungscode" (404 mit `field` `code` und neuer
  Meldung).
- `ui-start`: Requirement „Erstellen und Beitreten auf Anforderung" (Formularmuster,
  Feldfehler an `Name`/`Sitzungscode`, Sperre).
- `map-library`: Requirement „Bibliotheksoberfläche" (Formular „Neue Karte" im
  Formularmuster, Feldfehler an `Name`).
- `session-token`: Requirement „Tokenansicht im Raum" (Formular `Tokens` im Formularmuster
  ohne Feldfehler, Sperre bis zum Acknowledgement).

## Impact

- Neu: `src/client/ui/form.tsx` (`Field`, `SubmitButton`, `SLOW_AFTER_MS`).
- Geändert (Client): `src/client/auth/LoginForm.tsx`, `RegisterForm.tsx`,
  `ChangePasswordForm.tsx`, `src/client/session/SessionList.tsx`, `TokenPanel.tsx`,
  `SessionRoom.tsx` (Rückgabe von `handleTokenCreate`), `src/client/map/MapLibrary.tsx`
  (Formular „Neue Karte"), `src/client/i18n/de.ts`, `en.ts` (ein Schlüssel),
  `src/client/app/theme.css` (Abschnitt „Formulare" und Ergänzung des Bewegungsblocks).
- Geändert (Server): `src/server/auth/routes.ts` (409 E-Mail mit `field`),
  `src/server/session/routes.ts` (404 Beitritt mit `field` und neuem Text).
- Unverändert: `shared/`, Prisma-Schema, Socket-Verträge, `AppShell`, Toast, Modal,
  Icon-Registry, das Rasterformular der Kartenansicht (Epic C), alle übrigen Servertexte.
- Keine neue Dependency. Kein Datenbank-Vertragswechsel; der API-Vertrag wird nur um das
  optionale `field` in zwei Antworten und einen Meldungstext erweitert.
- Bestehende Tests: die Szenarien „Fehlgeschlagene Anmeldung wird angezeigt", „Abgelehnte
  Passwortänderung wird angezeigt", „Vergebener Nutzername wird angezeigt", „Abgelehntes
  Erstellen bleibt im Formular", „Geschlossene Spielsitzung und unbekannter Code sind nicht
  unterscheidbar", „Registrierung mit bereits vergebener E-Mail", „Einstieg aus der
  Sitzungsliste", „Spielleiter legt ein Token über das Formular an" und „Abgelehnte Aktion
  zeigt die Meldung" ändern ihre Erwartung (Namen bleiben). Szenarien, die ein Formular mit
  leeren Feldern abschicken, müssen die Felder künftig füllen — die Schaltfläche ist sonst
  gesperrt.
