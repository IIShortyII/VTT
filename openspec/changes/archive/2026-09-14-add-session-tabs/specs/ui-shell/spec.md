## MODIFIED Requirements

### Requirement: Inhaltsbereich und Footer

Die Shell SHALL die aktuelle Ansicht in genau einem `<main class="app-shell">` rendern —
in der Raumansicht (`game-session`, „Sitzungsoberfläche") zusätzlich mit der Klasse
`app-shell--wide`, die die Breitenbegrenzung der Inhaltsspalte aufhebt (`session-tabs`,
„Stylesheet der Bereiche"); jede andere Ansicht MUST NOT diese Klasse tragen — und
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

#### Scenario: Raumansicht hebt die Breitenbegrenzung auf

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und die Anwendung hat den Raum
  `s1` betreten
- **WHEN** die Raumansicht gerendert wird
- **THEN** trägt das `<main>` die Klassen `app-shell` und `app-shell--wide`; nach der
  Rückkehr zur Sitzungsliste über `Zurück` trägt es `app-shell`, aber nicht
  `app-shell--wide`
