## Why

`App.tsx` hält `AuthState` und `SessionView` als reinen React-State, und es gibt keine
gemeinsame Chrome-Schicht: keine Top-Bar, kein Footer, kein einheitlicher Inhaltsrahmen.
Abmelden und „Angemeldet als" liegen in der Sitzungsliste, obwohl sie unabhängig von der
aktuellen Ansicht erreichbar sein sollten; Raum und Kartenbibliothek bringen je eigene
„Zurück zur Liste"-Schaltflächen mit, an unterschiedlichen Stellen. Mit #83 (`ui-theme`)
stehen Tokens, Schriften und Grundelemente — dieser Change (Issue #84, Kind des Epics #101)
legt die Hülle darum: eine sticky Top-Bar mit drei Zonen, genau eine zentrierte
Inhaltsspalte und ein ruhiger Footer mit Version und Build-Kennung.

Entscheidungen aus dem Issue-Text (#84, #101) und der Explore-Runde (2026-09-12):
- **Eine Hülle, kein Router.** Navigation bleibt State-basiert; die Shell ist reine
  Präsentationsschicht um die bestehenden Ansichten, ohne eigenen Serverzustand.
- **Ein Zurück-Pfad.** „Zurück" liegt ausschließlich in der Top-Bar (nur in Unteransichten,
  erstes fokussierbares Element im Dokument). Die eigenen Schaltflächen „Zurück zur Liste"
  (Raum) und „Zurück zur Sitzungsliste" (Bibliothek) entfallen. Die innere Schaltfläche der
  Kartenbibliothek (Kartenansicht → Kartenliste) bleibt, heißt aber `Zur Bibliothek`, damit
  es im Dokument nie zwei Schaltflächen mit dem Namen „Zurück" gibt.
- **Konto in der Top-Bar.** Rechts stehen Nutzername und `Abmelden`. Die Passwortänderung
  bleibt als Formular in der Sitzungsliste — ein Kontomenü kommt mit #92 (Kontextmenüs).
- **Der globale Hinweis** (Server nicht erreichbar, fehlgeschlagene Abmeldung, beendete
  Spielsitzung) wird von der Shell gezeigt, nicht mehr von der Sitzungsliste — er gehört
  zur Hülle, nicht zu einer Ansicht.
- **Version und Build-SHA** kommen als Vite-Defines (`__APP_VERSION__` aus `package.json`,
  `__BUILD_SHA__` aus `git rev-parse --short HEAD`) über `main.tsx` in die Shell; ohne
  Vite-Lauf gelten Rückfallwerte. `vite.config.ts` und `package.json` liegen außerhalb
  jedes Rollen-Pfadbereichs und werden deshalb vom Menschen im Worktree geändert (wie die
  Dependencies bei #83), bevor der test-author startet.
- **Capability heißt `ui-shell`.** Das Stylesheet der Shell liegt im bestehenden
  `theme.css` (`ui-theme`) und hält dessen Format-Vertrag ein.
- **Das Chevron „‹" bleibt Text.** Die Icon-Registry (#85) entsteht parallel; #86 stellt
  die Shell auf `<Icon name="back">` um, sobald beide gemergt sind.

## What Changes

- **Shell** `src/client/app/AppShell.tsx` (neu): `<header>` mit `Zurück` (nur in
  Unteransichten, `autoFocus`), Marke `VTT`, Konto (Nutzername · `Abmelden`);
  `<main class="app-shell">` mit globalem Hinweis und aktueller Ansicht;
  `<footer>` mit `Version <version> · Build <sha>`.
- **Build-Angaben** `src/client/app/build-info.ts` (neu) und `src/client/vite-env.d.ts`
  (neu): Typ `BuildInfo`, Rückfallwerte `0.0.0-dev`/`dev`, Deklaration der Defines.
- **`App.tsx`**: rendert jede Ansicht in der Shell, reicht `canGoBack`/`onBack`, Konto,
  `onLogout`, `hinweis` und `build` weiter; neue optionale Prop `build`.
- **`main.tsx`**: liest die Defines und übergibt sie als `build` an `App`.
- **Sitzungsliste**: ohne „Angemeldet als", ohne `Abmelden`, ohne `hinweis`; Props
  `onLogout` und `hinweis` entfallen. `Kartenbibliothek` und Passwortänderung bleiben.
- **Raumansicht**: beide „Zurück zur Liste"-Schaltflächen entfallen, Prop `onLeave`
  entfällt.
- **Kartenbibliothek**: „Zurück zur Sitzungsliste" entfällt (Prop `onBack` entfällt);
  die innere Schaltfläche heißt `Zur Bibliothek`.
- **Stylesheet** `src/client/app/theme.css`: Abschnitt „Shell" mit den sieben
  Shell-Selektoren, vor dem Bewegungsblock.
- **Vite-Defines** (Mensch): `vite.config.ts` mit `define`, `package.json` mit
  `"version": "0.1.0"`.

**Nicht im Umfang:** Icons in der Shell (#85/#86); Hero und Sitzungskarten (#86);
Textschlüssel (#87); Toasts, Modals, Banner, Kontextmenüs (#88–#92); Session-Bar und
Werkzeugleisten im Raum (#93, #96); Responsive-Regeln (#100); ein Kontomenü in der Top-Bar;
ein Router.

## Capabilities

### New Capabilities

- `ui-shell`: Top-Bar (6 Szenarien), Inhaltsbereich und Footer (2), Stylesheet der
  Shell (1).

### Modified Capabilities

- `user-auth`: „Anmeldeoberfläche" — das Szenario „Fehlgeschlagene Abmeldung wird
  angezeigt" beschreibt das Verbleiben in der angemeldeten Ansicht über die Top-Bar
  (Nutzername, `Abmelden`) statt über „Angemeldet als"; „Passwortänderung in der
  Oberfläche" — das Formular liegt in der Sitzungsliste, nicht mehr „neben der Abmeldung".
- `game-session`: „Sitzungsoberfläche" — Abmelden liegt in der Top-Bar; Raum und
  Bibliothek zeigen keine eigene Rückkehr zur Sitzungsliste; das Szenario „Sitzungsliste
  mit Erstellen und Beitreten" verlangt keine Abmeldung in der Liste mehr.
- `map-library`: „Bibliotheksoberfläche" — die innere Schaltfläche heißt
  `Zur Bibliothek`, die Rückkehr zur Sitzungsliste liegt in der Top-Bar; das Szenario
  „Verlassen gibt die Kartenansicht frei" nennt die Schaltfläche beim Namen.

## Impact

**Keine neue Dependency. Kein Schema, keine Migration, kein Server-Code.**

**Geänderter Code:**
- `src/client/app/AppShell.tsx`, `src/client/app/build-info.ts`, `src/client/vite-env.d.ts`
  (neu)
- `src/client/app/App.tsx`, `src/client/main.tsx`
- `src/client/session/SessionList.tsx`, `src/client/session/SessionRoom.tsx`,
  `src/client/map/MapLibrary.tsx`
- `src/client/app/theme.css` (Abschnitt „Shell")
- `vite.config.ts`, `package.json` (Mensch, vor dem test-author; design.md D2)

**Bestehende Tests:** Assertionen auf „Angemeldet als", auf die Abmeldung innerhalb der
Sitzungsliste und auf eine Schaltfläche „Zurück" in der Kartenbibliothek ändern ihre
Aussage — die betroffenen Szenarien sind als MODIFIED geführt, der test-author stellt die
zugehörigen Tests um. Alle übrigen Tests rendern `App` weiter ohne Props und sehen die
Shell mit Rückfall-Build-Angaben; Landmarks (`banner`, `main`, `contentinfo`) kommen hinzu,
bestehende Adressen (Formulare, Listen, Schaltflächen der Ansichten) bleiben.

**Parallel zu #85 (`add-icon-registry`):** beide Changes ergänzen `theme.css` am Ende vor
dem Bewegungsblock und beide berühren `package.json` (Version bzw. Dependency). Der zweite
gemergte Branch löst den Konflikt beim Rebase; inhaltlich überschneiden sie sich nicht.
