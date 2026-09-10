## MODIFIED Requirements

### Requirement: Kartenbild abrufen

Das System SHALL über `GET /api/maps/:id/image` das Bild einer Karte liefern — dem Besitzer
sowie jedem Mitglied (jeder Rolle) einer Spielsitzung, deren aktive Karte eine Instanz dieser
Karte ist (`session-map`, „Aktive Karte"): `200`, `Content-Type` gleich dem beim Upload
angegebenen Typ, Body gleich der abgelegten Datei, und `Cache-Control: private, no-store`.
Eine Karte ohne Bild SHALL mit `404` beantwortet werden. Für jeden anderen Anfragenden —
auch ein Mitglied einer Spielsitzung, in der die Karte eingehängt, aber nicht aktiv ist —
SHALL die Karte wie eine unbekannte Karte mit `404` und derselben Meldung beantwortet werden
(`constitution.md` §9.2) — die Route MUST NOT verraten, ob eine Karte existiert. Die
Berechtigung SHALL pro Anfrage geprüft werden; ein zuvor erlaubter Abruf ist keine Erlaubnis
für den nächsten (§9.3). Das Bild MUST NOT über einen anderen Pfad (statisches Verzeichnis)
erreichbar sein.

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
  in seiner Spielsitzung eingehängt und aktiv, und `sam` ist Spieler-Mitglied dieser
  Spielsitzung
- **WHEN** `GET /api/maps/:id/image` mit dem Cookie von `sam` auf „Taverne" eingeht
- **THEN** antwortet der Server mit `200`, `Content-Type: image/png` und einem Body, der
  byteweise dem hochgeladenen Bild gleicht

#### Scenario: Eingehängte, nicht aktive Karte bleibt für Mitglieder unsichtbar

- **GIVEN** ein Spielleiter besitzt die Karten „Taverne" (aktiv in seiner Spielsitzung) und
  „Wald" (mit Bild, in derselben Spielsitzung eingehängt, nicht aktiv), `sam` ist
  Spieler-Mitglied, und es gibt keine Karte mit der `id` `unbekannt`
- **WHEN** je ein `GET /api/maps/:id/image` von `sam` auf „Wald" und auf `unbekannt` eingeht
- **THEN** antworten beide mit `404`, und Statuscode und `message` beider Antworten sind
  identisch

### Requirement: Karte löschen

Das System SHALL dem Besitzer über `DELETE /api/maps/:id` erlauben, eine Karte zu löschen:
`204`, die Datenbankzeile ist entfernt, und ein etwaiges Bild ist aus dem Upload-Verzeichnis
entfernt. Ist die Karte in mindestens einer Spielsitzung eingehängt (`session-map`,
„Karteninstanz"), SHALL die Anfrage mit `409` beantwortet werden, und Karte, Bild und
Instanzen bleiben unverändert — erst aushängen, dann löschen. Fremde und unbekannte Karten
SHALL wie in „Karte ändern" mit `404` beantwortet werden, ohne Änderung.

#### Scenario: Löschen entfernt Karte und Bild

- **GIVEN** ein angemeldeter Nutzer besitzt eine Karte mit einem hochgeladenen Bild
- **WHEN** `DELETE /api/maps/:id` eingeht
- **THEN** antwortet der Server mit `204`, die Karte existiert nicht mehr in der Datenbank,
  und das Upload-Verzeichnis ist leer

#### Scenario: Fremde Karte bleibt bestehen

- **GIVEN** Nutzer B besitzt eine Karte, Nutzer A ist angemeldet
- **WHEN** `DELETE /api/maps/:id` von A auf die Karte von B eingeht
- **THEN** antwortet der Server mit `404`, und die Karte von B existiert weiterhin

#### Scenario: Eingehängte Karte kann nicht gelöscht werden

- **GIVEN** ein Spielleiter besitzt die Karte „Taverne" mit einem hochgeladenen Bild, und sie
  ist in seiner Spielsitzung eingehängt
- **WHEN** `DELETE /api/maps/:id` mit seinem Cookie auf „Taverne" eingeht
- **THEN** antwortet der Server mit `409`, die Karte und ihre Karteninstanz existieren
  weiterhin in der Datenbank, und im Upload-Verzeichnis liegt weiterhin genau eine Datei

#### Scenario: Nach dem Aushängen ist die Karte löschbar

- **GIVEN** ein Spielleiter besitzt die Karte „Taverne", die in seiner Spielsitzung
  eingehängt war und per `DELETE /api/sessions/:id/maps/:instanceId` ausgehängt wurde
- **WHEN** `DELETE /api/maps/:id` auf „Taverne" eingeht
- **THEN** antwortet der Server mit `204`, und die Karte existiert nicht mehr in der
  Datenbank
