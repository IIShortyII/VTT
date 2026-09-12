# ui-shell Specification

## Purpose

Die gemeinsame Hülle um alle Ansichten des Clients: eine sticky Top-Bar mit Zurück-Pfad,
Marke und Konto, ein zentrierter Inhaltsbereich und ein ruhiger Footer mit Version und
Build-Kennung. Die Shell ist reine Präsentationsschicht ohne eigenen Serverzustand; sie
entscheidet nichts, sondern zeigt den Zustand, den `App` hält (Auth-Zustand, aktuelle
Ansicht). Navigation bleibt State-basiert — kein Router. Aussehen und Layout nimmt der
menschliche App-Test ab (`constitution.md` §3.4).

## Begriffe

- **Shell**: die Komponente `AppShell` (`src/client/app/AppShell.tsx`), gerendert von `App`
  um jede Ansicht — auch um das Anmelde-/Registrierungsformular und den Ladehinweis.
- **Top-Bar**: das `<header>`-Element der Shell (Landmark `banner`) mit drei Zonen: links
  die Schaltfläche `Zurück`, Mitte die Marke, rechts das Konto.
- **Marke**: der Text `VTT` in der Mitte der Top-Bar.
- **Konto**: der Nutzername des angemeldeten Nutzers und die Schaltfläche `Abmelden`; für
  einen nicht angemeldeten Besucher ist die Zone leer.
- **Startansicht**: die Sitzungsliste (`game-session`, „Sitzungsoberfläche") sowie jede
  Ansicht eines nicht angemeldeten Besuchers. In der Startansicht gibt es keine Schaltfläche
  `Zurück`.
- **Unteransicht**: die Raumansicht (`game-session`) und die Kartenbibliothek
  (`map-library`) — jede angemeldete Ansicht außer der Sitzungsliste.
- **Inhaltsbereich**: das `<main>`-Element der Shell (Landmark `main`) mit der Klasse
  `app-shell`; es enthält den globalen Hinweis (falls gesetzt) und die aktuelle Ansicht.
- **Globaler Hinweis**: der Hinweistext, den `App` hält (Server beim Start nicht erreichbar,
  fehlgeschlagene Abmeldung, beendete Spielsitzung) — gerendert von der Shell als
  `<p role="alert">` am Anfang des Inhaltsbereichs, nicht mehr von der Sitzungsliste.
- **Footer**: das `<footer>`-Element der Shell (Landmark `contentinfo`) mit dem Text
  `Version <version> · Build <sha>`.
- **Build-Angaben**: `version` und `sha`, die `main.tsx` aus den Vite-Defines
  `__APP_VERSION__` und `__BUILD_SHA__` liest und an `App` übergibt. Fehlen sie (kein
  Vite-Lauf, z. B. im Test), gelten die Rückfallwerte `0.0.0-dev` und `dev`.
- **Stylesheet**: `src/client/app/theme.css` (`ui-theme`), als Text gelesen; die
  Shell-Selektoren sind `.app-shell-topbar`, `.app-shell-back`, `.app-shell-brand`,
  `.app-shell-account`, `main.app-shell`, `.app-shell-hinweis` und `.app-shell-footer`. Ein
  Selektor ist **vorhanden**, wenn das Stylesheet nach Normalisierung (`\s+` → ein
  Leerzeichen, Kommentare entfernt) die Zeichenfolge `<selektor> {` enthält.

## Requirements

### Requirement: Top-Bar

Die Shell SHALL in jeder Ansicht eine Top-Bar als `<header>` rendern, die vor dem
Inhaltsbereich im Dokument steht und die Marke zeigt. In einer Unteransicht SHALL die
Top-Bar links eine Schaltfläche `Zurück` zeigen, die das erste fokussierbare Element im
Dokument ist und beim Erscheinen den Fokus erhält; ihr Auslösen SHALL zur Sitzungsliste
führen. In der Startansicht MUST NOT eine Schaltfläche `Zurück` vorhanden sein. Für einen
angemeldeten Nutzer SHALL die Top-Bar rechts den Nutzernamen und die Schaltfläche
`Abmelden` zeigen; für einen nicht angemeldeten Besucher MUST NOT sie ein Konto zeigen.
`Abmelden` SHALL die Abmeldung aus `user-auth` auslösen; der Wechsel in den anonymen
Zustand folgt der Bestätigung des Servers (`constitution.md` §9.1), nicht dem Klick.

#### Scenario: Startansicht ohne Zurück

- **GIVEN** der Server meldet einen angemeldeten Nutzer mit dem Nutzernamen `Gandalf`, und
  `GET /api/sessions` liefert eine leere Liste
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält das `<header>` den Text `VTT`, den Text `Gandalf` und eine Schaltfläche
  `Abmelden`, und es gibt im Dokument keine Schaltfläche `Zurück`

#### Scenario: Anonyme Ansicht zeigt nur die Marke

- **GIVEN** der Server meldet keinen angemeldeten Nutzer
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält das `<header>` den Text `VTT`, und es gibt im Dokument weder eine
  Schaltfläche `Abmelden` noch eine Schaltfläche `Zurück`; das Anmeldeformular liegt im
  `<main>`

#### Scenario: Unteransicht zeigt Zurück als erstes fokussierbares Element

- **GIVEN** ein angemeldeter Nutzer hat aus der Sitzungsliste die Kartenbibliothek geöffnet
- **WHEN** die Kartenbibliothek gerendert ist
- **THEN** gibt es genau eine Schaltfläche `Zurück`, sie liegt im `<header>`, sie ist die
  erste Schaltfläche in Dokumentreihenfolge, und sie hat den Fokus (`document.activeElement`)

#### Scenario: Zurück führt aus der Bibliothek zur Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer sieht die Kartenbibliothek
- **WHEN** er die Schaltfläche `Zurück` auslöst
- **THEN** zeigt die Anwendung die Sitzungsliste (Formular `Neue Spielsitzung`), die
  Bibliothek ist nicht mehr gerendert, und es gibt keine Schaltfläche `Zurück` mehr

#### Scenario: Zurück führt aus dem Raum zur Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer hat eine Spielsitzung betreten, und die Raumansicht ist
  gerendert
- **WHEN** er die Schaltfläche `Zurück` in der Top-Bar auslöst
- **THEN** zeigt die Anwendung die Sitzungsliste, und die Raumansicht ist nicht mehr
  gerendert

#### Scenario: Abmelden über die Top-Bar

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `POST /api/auth/logout` wird
  vom Server bestätigt
- **WHEN** der Nutzer die Schaltfläche `Abmelden` in der Top-Bar auslöst
- **THEN** zeigt die Anwendung das Anmeldeformular, und das `<header>` enthält weder den
  Nutzernamen noch eine Schaltfläche `Abmelden`

### Requirement: Inhaltsbereich und Footer

Die Shell SHALL die aktuelle Ansicht in genau einem `<main class="app-shell">` rendern und
den globalen Hinweis, falls gesetzt, als `<p role="alert">` am Anfang dieses Bereichs
zeigen. Nach dem Inhaltsbereich SHALL ein `<footer>` mit dem Text
`Version <version> · Build <sha>` stehen; ohne Build-Angaben SHALL er die Rückfallwerte
zeigen. Header, Main und Footer SHALL in dieser Reihenfolge im Dokument stehen.

#### Scenario: Inhalt liegt im Hauptbereich

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert
  eine Spielsitzung `Freitagsrunde`
- **WHEN** die Anwendung gerendert wird
- **THEN** gibt es genau ein `<main>`, es trägt die Klasse `app-shell`, es enthält den
  Eintrag `Freitagsrunde`, und `<header>`, `<main>` und `<footer>` stehen in dieser
  Reihenfolge im Dokument

#### Scenario: Footer nennt Version und Build

- **GIVEN** die Anwendung wird ohne eingebettete Build-Angaben gerendert (kein Vite-Lauf)
- **WHEN** die Anwendung gerendert wird
- **THEN** enthält das `<footer>` genau den Text `Version 0.0.0-dev · Build dev`

### Requirement: Stylesheet der Shell

Das Stylesheet SHALL für jeden Shell-Selektor eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine weiteren `@import`-Zeilen).

#### Scenario: Shell-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Shell-Selektor gesucht wird
- **THEN** ist jeder der sieben Shell-Selektoren vorhanden
