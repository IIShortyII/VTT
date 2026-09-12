Ergänzung des Drahtformats (gilt zusammen mit dem bestehenden Abschnitt „Drahtformat"):
`GET /api/maps/:id/image` liefert das Bild wieder ausschließlich dem Besitzer. Mitglieder
einer Spielsitzung erhalten das Bild der aktiven Karte über
`GET /api/sessions/:id/map-image` (`session-fog`, Requirement „Kartenbild der
Spielsitzung") — der Spielleiter das Original, ein Spieler das maskierte Bild.

## MODIFIED Requirements

### Requirement: Kartenbild abrufen

Das System SHALL über `GET /api/maps/:id/image` das Bild einer Karte ausschließlich ihrem
Besitzer liefern: `200`, `Content-Type` gleich dem beim Upload angegebenen Typ, Body gleich
der abgelegten Datei, und `Cache-Control: private, no-store`. Eine Karte ohne Bild SHALL
mit `404` beantwortet werden. Für jeden anderen Anfragenden — auch ein Mitglied einer
Spielsitzung, in der die Karte eingehängt oder aktiv ist — SHALL die Karte wie eine
unbekannte Karte mit `404` und derselben Meldung beantwortet werden (`constitution.md`
§9.2: das vollständige Bild einer aktiven Karte erreicht Mitglieder nur über
`GET /api/sessions/:id/map-image`, und dort nur den Spielleiter — `session-fog`) — die Route
MUST NOT verraten, ob eine Karte existiert. Die Berechtigung SHALL pro Anfrage geprüft
werden; ein zuvor erlaubter Abruf ist keine Erlaubnis für den nächsten (§9.3). Das Bild MUST
NOT über einen anderen Pfad (statisches Verzeichnis) erreichbar sein.

#### Scenario: Besitzer erhält das Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit einem hochgeladenen PNG
- **WHEN** `GET /api/maps/:id/image` mit seinem Cookie eingeht
- **THEN** antwortet der Server mit `200`, `Content-Type: image/png`, `Cache-Control:
  private, no-store` und einem Body, der byteweise dem hochgeladenen Bild gleicht

#### Scenario: Karte ohne Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte ohne Bild
- **WHEN** `GET /api/maps/:id/image` eingeht
- **THEN** antwortet der Server mit `404`

#### Scenario: Fremdes Bild ist nicht erreichbar

- **GIVEN** Nutzer B besitzt eine Karte mit Bild, Nutzer A ist angemeldet, und es gibt keine
  Karte mit der `id` `unbekannt`
- **WHEN** je ein `GET /api/maps/:id/image` von A auf die Karte von B und auf `unbekannt`
  eingeht
- **THEN** antworten beide mit `404`, und Statuscode und `message` beider Antworten sind
  identisch

#### Scenario: Mitglied erhält das Bild der aktiven Karte

- **GIVEN** ein Spielleiter besitzt die Karte „Taverne" mit einem hochgeladenen PNG, sie ist
  in seiner Spielsitzung eingehängt und aktiv, `sam` ist Spieler-Mitglied dieser
  Spielsitzung, und es gibt keine Karte mit der `id` `unbekannt`
- **WHEN** je ein `GET /api/maps/:id/image` mit dem Cookie von `sam` auf „Taverne" und auf
  `unbekannt` eingeht, und danach `GET /api/sessions/:id/map-image` mit dem Cookie von `sam`
  auf die Spielsitzung
- **THEN** antworten die beiden Abrufe der Bibliotheksroute mit `404`, Statuscode und
  `message` beider Antworten sind identisch, und der Abruf über die Spielsitzung antwortet
  mit `200` und `Content-Type: image/webp` (`session-fog`, Requirement „Kartenbild der
  Spielsitzung")

#### Scenario: Eingehängte, nicht aktive Karte bleibt für Mitglieder unsichtbar

- **GIVEN** ein Spielleiter besitzt die Karten „Taverne" (aktiv in seiner Spielsitzung) und
  „Wald" (mit Bild, in derselben Spielsitzung eingehängt, nicht aktiv), `sam` ist
  Spieler-Mitglied, und es gibt keine Karte mit der `id` `unbekannt`
- **WHEN** je ein `GET /api/maps/:id/image` von `sam` auf „Wald" und auf `unbekannt` eingeht
- **THEN** antworten beide mit `404`, und Statuscode und `message` beider Antworten sind
  identisch
