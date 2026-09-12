## MODIFIED Requirements

### Requirement: Top-Bar

Die Shell SHALL in jeder Ansicht eine Top-Bar als `<header>` rendern, die vor dem
Inhaltsbereich im Dokument steht und die Marke zeigt. In einer Unteransicht SHALL die
Top-Bar links eine Schaltfläche `Zurück` zeigen, die das erste fokussierbare Element im
Dokument ist und beim Erscheinen den Fokus erhält; ihr Auslösen SHALL zur Sitzungsliste
führen. Das Chevron der Schaltfläche SHALL ein dekoratives Icon aus `ui-icons`
(`<svg aria-hidden="true">`) sein, ihr zugänglicher Name bleibt `Zurück`. In der
Startansicht MUST NOT eine Schaltfläche `Zurück` vorhanden sein. Für einen angemeldeten
Nutzer SHALL die Top-Bar rechts den Nutzernamen und die Schaltfläche `Abmelden` zeigen;
für einen nicht angemeldeten Besucher MUST NOT sie ein Konto zeigen. `Abmelden` SHALL die
Abmeldung aus `user-auth` auslösen; der Wechsel in den anonymen Zustand folgt der
Bestätigung des Servers (`constitution.md` §9.1), nicht dem Klick. Die angemeldete
Startansicht ist an der Schaltfläche `Sitzung leiten` erkennbar (`ui-start`).

#### Scenario: Startansicht ohne Zurück

- **GIVEN** der Server meldet einen angemeldeten Nutzer mit dem Nutzernamen `Gandalf`, und
  `GET /api/sessions` liefert eine leere Liste
- **WHEN** die Anwendung gerendert wird und die Schaltfläche `Sitzung leiten` erschienen ist
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
  erste Schaltfläche in Dokumentreihenfolge, sie hat den Fokus (`document.activeElement`),
  und sie enthält genau ein `<svg aria-hidden="true">` und keinen Textknoten `‹`

#### Scenario: Zurück führt aus der Bibliothek zur Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer sieht die Kartenbibliothek
- **WHEN** er die Schaltfläche `Zurück` auslöst
- **THEN** zeigt die Anwendung die Sitzungsliste (Schaltfläche `Sitzung leiten`), die
  Bibliothek ist nicht mehr gerendert, und es gibt keine Schaltfläche `Zurück` mehr

#### Scenario: Zurück führt aus dem Raum zur Sitzungsliste

- **GIVEN** ein angemeldeter Nutzer hat eine Spielsitzung betreten, und die Raumansicht ist
  gerendert
- **WHEN** er die Schaltfläche `Zurück` in der Top-Bar auslöst
- **THEN** zeigt die Anwendung die Sitzungsliste (Schaltfläche `Sitzung leiten`), und die
  Raumansicht ist nicht mehr gerendert

#### Scenario: Abmelden über die Top-Bar

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `POST /api/auth/logout` wird
  vom Server bestätigt; die Sitzungsliste ist erschienen (Schaltfläche `Sitzung leiten`)
- **WHEN** der Nutzer die Schaltfläche `Abmelden` in der Top-Bar auslöst
- **THEN** zeigt die Anwendung das Anmeldeformular, und das `<header>` enthält weder den
  Nutzernamen noch eine Schaltfläche `Abmelden`
