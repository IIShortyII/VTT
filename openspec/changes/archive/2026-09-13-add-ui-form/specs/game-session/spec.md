## MODIFIED Requirements

### Requirement: Beitritt per Sitzungscode

Das System SHALL einem angemeldeten Nutzer über `POST /api/sessions/join` mit `{ code }`
den Beitritt zu der Spielsitzung mit diesem Code gewähren, sofern sie nicht `geschlossen`
ist. Der Code SHALL vor dem Abgleich normalisiert werden: Leerraum entfernt, in
Großbuchstaben. Ein erfolgreicher Beitritt SHALL eine Mitgliedschaft mit Rolle `spieler`
anlegen und mit `200` und der Spielsitzung antworten. Ist der Nutzer bereits Mitglied, SHALL
der Beitritt mit `200` und der bestehenden Mitgliedschaft (unveränderte Rolle) antworten,
ohne eine zweite anzulegen.

Ein Code, zu dem keine Spielsitzung existiert, und ein Code einer `geschlossenen`
Spielsitzung SHALL mit identischem Statuscode (`404`), der identischen Meldung
`Sitzungscode prüfen und ob die Spielleitung die Sitzung geöffnet hat.` und `field` gleich
`code` beantwortet werden (`constitution.md` §9.2) — die Meldung nennt die Handlung, nicht
den Grund; in beiden Fällen MUST NOT eine Mitgliedschaft entstehen.

Ein Beitritt SHALL die Teilnehmerliste im Raum dieser Spielsitzung aktualisieren (siehe
Requirement „Teilnehmerliste in Echtzeit").

#### Scenario: Beitritt zu geöffneter Spielsitzung

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit Code `ABC234` und ein angemeldeter
  Nutzer, der nicht Mitglied ist
- **WHEN** `POST /api/sessions/join` mit `{ "code": "ABC234" }` eingeht
- **THEN** antwortet der Server mit `200` und `{ id, name, status: "geoeffnet", role:
  "spieler" }` ohne Feld `code`, und in der Datenbank existiert genau eine Mitgliedschaft
  dieses Nutzers zu dieser Spielsitzung mit Rolle `spieler`

#### Scenario: Code wird normalisiert

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit Code `ABC234` und ein angemeldeter
  Nutzer, der nicht Mitglied ist
- **WHEN** `POST /api/sessions/join` mit `{ "code": " abc 234 " }` eingeht
- **THEN** antwortet der Server mit `200` und der `id` dieser Spielsitzung, und die
  Mitgliedschaft ist angelegt

#### Scenario: Geschlossene Spielsitzung und unbekannter Code sind nicht unterscheidbar

- **GIVEN** eine Spielsitzung im Zustand `geschlossen` mit Code `ABC234` und keine
  Spielsitzung mit Code `ZZZ999`, sowie ein angemeldeter Nutzer, der in keiner Mitglied ist
- **WHEN** je ein `POST /api/sessions/join` mit `ABC234` und mit `ZZZ999` eingeht
- **THEN** antworten beide mit `404`, `message` gleich
  `Sitzungscode prüfen und ob die Spielleitung die Sitzung geöffnet hat.` und `field` gleich
  `code`, Statuscode und `message` beider Antworten sind identisch, und in der Datenbank existiert zu diesem Nutzer keine Mitgliedschaft

#### Scenario: Erneuter Beitritt eines Mitglieds ist idempotent

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, deren Spielleiter angemeldet ist
- **WHEN** `POST /api/sessions/join` mit dem Code dieser Spielsitzung vom Spielleiter eingeht
- **THEN** antwortet der Server mit `200` und `role: "spielleiter"`, und in der Datenbank
  existiert weiterhin genau eine Mitgliedschaft dieses Nutzers zu dieser Spielsitzung
