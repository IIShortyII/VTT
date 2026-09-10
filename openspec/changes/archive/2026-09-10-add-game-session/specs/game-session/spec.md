## Purpose

Gibt dem VTT den Raum, in dem gespielt wird: ein Spielleiter legt eine Spielsitzung an,
Mitspieler treten ihr per Code bei und bleiben Mitglied, der Spielleiter steuert ihren
Zustand, und alle im Raum sehen in Echtzeit, wer Mitglied und wer gerade verbunden ist. Legt
zugleich fest, dass jede Aktion über die Socket-Verbindung einzeln autorisiert wird.

## Begriffe

- **Spielsitzung**: der dauerhafte Raum einer Spielrunde (Modell `GameSession`). Nicht zu
  verwechseln mit der **Anmelde-Sitzung** aus `user-auth` (Cookie `sid`).
- **Mitgliedschaft**: dauerhafte Zuordnung Nutzer ↔ Spielsitzung mit Rolle `spielleiter`
  oder `spieler`. Ein Nutzer ist je Spielsitzung höchstens einmal Mitglied.
- **Zustand** einer Spielsitzung: `geschlossen`, `geoeffnet`, `gestartet` oder `pausiert`.
- **Anwesend** ist ein Mitglied, dessen Socket-Verbindung den Raum der Spielsitzung betreten
  hat. Anwesenheit ist flüchtig und wird nicht gespeichert.
- **Raum**: die Menge der anwesenden Verbindungen einer Spielsitzung; Empfänger aller
  Server-Ereignisse zu dieser Spielsitzung.
- **Acknowledgement**: Antwort des Servers an den Absender eines Client-Ereignisses, entweder
  `{ ok: true, ... }` oder `{ ok: false, message }`.

Drahtformat: REST unter `/api/sessions`; Socket-Ereignisse `session:enter` und
`session:transition` (Client → Server, jeweils mit Acknowledgement) sowie
`session:participants`, `session:status`, `session:replaced` und `session:ended`
(Server → Client). Eine Spielsitzung wird nach außen als
`{ id, name, status, role, code? }` dargestellt; `code` ist nur für den Spielleiter enthalten.
Ein Teilnehmer als `{ userId, email, role, online }`.

## ADDED Requirements

### Requirement: Spielsitzung erstellen

Das System SHALL einem angemeldeten Nutzer über `POST /api/sessions` erlauben, eine
Spielsitzung mit einem Namen (1 bis 60 Zeichen nach Trimmen) anzulegen. Der Erstellende
SHALL Mitglied mit Rolle `spielleiter` werden. Die Spielsitzung SHALL im Zustand
`geschlossen` beginnen und einen vom Server vergebenen Sitzungscode tragen: 6 Zeichen aus
dem Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne `0`, `O`, `1`, `I`), eindeutig über
alle Spielsitzungen. Ohne gültige Anmelde-Sitzung SHALL die Anfrage mit `401` beantwortet
werden; ein ungültiger Name mit `400` und `field` gleich `name`.

#### Scenario: Erstellen mit gültigem Namen

- **GIVEN** ein angemeldeter Nutzer mit gültigem Cookie
- **WHEN** `POST /api/sessions` mit `{ "name": "Freitagsrunde" }` eingeht
- **THEN** antwortet der Server mit `201` und `{ id, name: "Freitagsrunde", status:
  "geschlossen", role: "spielleiter", code }`, wobei `code` genau 6 Zeichen aus dem
  Alphabet trägt; in der Datenbank existiert genau eine Spielsitzung mit diesem Namen und
  Code und genau eine Mitgliedschaft dieses Nutzers zu ihr mit Rolle `spielleiter`

#### Scenario: Erstellen mit ungültigem Namen

- **GIVEN** ein angemeldeter Nutzer
- **WHEN** `POST /api/sessions` mit einem Namen aus nur Leerzeichen eingeht
- **THEN** antwortet der Server mit `400` und `field` gleich `name`, und in der Datenbank
  entsteht weder Spielsitzung noch Mitgliedschaft

### Requirement: Beitritt per Sitzungscode

Das System SHALL einem angemeldeten Nutzer über `POST /api/sessions/join` mit `{ code }`
den Beitritt zu der Spielsitzung mit diesem Code gewähren, sofern sie nicht `geschlossen`
ist. Der Code SHALL vor dem Abgleich normalisiert werden: Leerraum entfernt, in
Großbuchstaben. Ein erfolgreicher Beitritt SHALL eine Mitgliedschaft mit Rolle `spieler`
anlegen und mit `200` und der Spielsitzung antworten. Ist der Nutzer bereits Mitglied, SHALL
der Beitritt mit `200` und der bestehenden Mitgliedschaft (unveränderte Rolle) antworten,
ohne eine zweite anzulegen.

Ein Code, zu dem keine Spielsitzung existiert, und ein Code einer `geschlossenen`
Spielsitzung SHALL mit identischem Statuscode (`404`) und identischer Meldung beantwortet
werden (`constitution.md` §9.2); in beiden Fällen MUST NOT eine Mitgliedschaft entstehen.

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
- **THEN** antworten beide mit `404`, Statuscode und `message` beider Antworten sind
  identisch, und in der Datenbank existiert zu diesem Nutzer keine Mitgliedschaft

#### Scenario: Erneuter Beitritt eines Mitglieds ist idempotent

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, deren Spielleiter angemeldet ist
- **WHEN** `POST /api/sessions/join` mit dem Code dieser Spielsitzung vom Spielleiter eingeht
- **THEN** antwortet der Server mit `200` und `role: "spielleiter"`, und in der Datenbank
  existiert weiterhin genau eine Mitgliedschaft dieses Nutzers zu dieser Spielsitzung

### Requirement: Meine Spielsitzungen

Das System SHALL einem angemeldeten Nutzer über `GET /api/sessions` alle Spielsitzungen
liefern, in denen er Mitglied ist, jeweils mit seiner Rolle und dem aktuellen Zustand,
unabhängig vom Zustand (auch `geschlossen`). Den Sitzungscode SHALL die Antwort nur bei
Einträgen mit Rolle `spielleiter` enthalten (`constitution.md` §9.2). Spielsitzungen ohne
Mitgliedschaft MUST NOT enthalten sein.

#### Scenario: Liste enthält nur eigene Mitgliedschaften mit Rolle

- **GIVEN** ein angemeldeter Nutzer, der Spielleiter der Spielsitzung `A` und Spieler in der
  Spielsitzung `B` (Zustand `geschlossen`) ist, sowie eine Spielsitzung `C` ohne ihn
- **WHEN** `GET /api/sessions` mit seinem Cookie eingeht
- **THEN** antwortet der Server mit `200` und genau zwei Einträgen: `A` mit `role:
  "spielleiter"` und dem Feld `code`, `B` mit `role: "spieler"`, `status: "geschlossen"` und
  ohne Feld `code`; `C` fehlt

### Requirement: Sitzungsrouten verlangen eine Anmeldung

Alle Routen unter `/api/sessions` SHALL ohne gültige Anmelde-Sitzung mit `401` antworten
und MUST NOT in die Datenbank schreiben.

#### Scenario: Sitzungsrouten ohne Cookie

- **GIVEN** kein Sitzungscookie
- **WHEN** `POST /api/sessions` mit gültigem Namen, `POST /api/sessions/join` mit einem
  gültigen Code und `GET /api/sessions` eingehen
- **THEN** antwortet der Server jedes Mal mit `401`, und die Anzahl der Spielsitzungen und
  Mitgliedschaften in der Datenbank ist unverändert

### Requirement: Verbindung und Betreten des Raums

Das System SHALL Socket-Verbindungen nur mit vorhandenem Sitzungscookie annehmen; ohne
Cookie SHALL der Verbindungsaufbau mit einem Fehler abgelehnt werden. Ein Client betritt den
Raum einer Spielsitzung mit `session:enter` `{ sessionId }`. Der Server SHALL das Betreten
nur einem Mitglied gewähren; einem Mitglied mit Rolle `spieler` nur, wenn die Spielsitzung
nicht `geschlossen` ist; dem Spielleiter in jedem Zustand. Ein erfolgreiches Betreten SHALL
mit `{ ok: true, session, participants }` bestätigt werden, wobei `session.code` nur für den
Spielleiter enthalten ist, und der Betretende SHALL in `participants` als `online: true`
erscheinen. Eine Verbindung ist in höchstens einem Raum; ein `session:enter` für eine andere
Spielsitzung SHALL den bisherigen Raum verlassen.

Ein abgelehntes Betreten SHALL mit `{ ok: false, message }` beantwortet werden und MUST NOT
den Absender in den Raum aufnehmen. Ein Ereignis, dessen Payload nicht dem Vertrag entspricht,
SHALL ebenso mit `{ ok: false, message }` beantwortet werden und MUST NOT etwas verändern.

#### Scenario: Mitglied betritt geöffnete Spielsitzung

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` und ein Spieler-Mitglied mit
  Socket-Verbindung samt gültigem Cookie
- **WHEN** es `session:enter` mit der `sessionId` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, session, participants }` mit
  `session.status` gleich `geoeffnet`, `session.role` gleich `spieler`, ohne Feld
  `session.code`, und `participants` enthält den Spieler mit `online: true`

#### Scenario: Der Code erreicht nur den Spielleiter

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit Spielleiter und einem Spieler, beide
  verbunden
- **WHEN** beide `session:enter` senden
- **THEN** enthält das Acknowledgement des Spielleiters `session.code` mit dem Code der
  Spielsitzung, das des Spielers kein Feld `session.code`, und in keinem der beiden
  `participants`-Einträge kommt ein Code vor

#### Scenario: Nicht-Mitglied kann den Raum nicht betreten

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit anwesendem Spielleiter und ein
  angemeldeter Nutzer ohne Mitgliedschaft mit Socket-Verbindung
- **WHEN** dieser `session:enter` mit der `sessionId` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Teilnehmerliste, die
  der Spielleiter zuletzt erhalten hat, nennt diesen Nutzer nicht

#### Scenario: Spieler kann geschlossene Spielsitzung nicht betreten

- **GIVEN** eine Spielsitzung im Zustand `geschlossen` und ein Spieler-Mitglied mit
  Socket-Verbindung
- **WHEN** es `session:enter` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`

#### Scenario: Spielleiter betritt geschlossene Spielsitzung

- **GIVEN** eine Spielsitzung im Zustand `geschlossen` und ihr Spielleiter mit
  Socket-Verbindung
- **WHEN** er `session:enter` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, session, participants }` mit
  `session.status` gleich `geschlossen` und `session.code`

#### Scenario: Verbindung ohne Cookie wird abgelehnt

- **GIVEN** kein Sitzungscookie
- **WHEN** eine Socket-Verbindung aufgebaut wird
- **THEN** meldet der Client einen Verbindungsfehler (`connect_error`), und es kommt keine
  Verbindung zustande

#### Scenario: Ereignis mit ungültiger Payload

- **GIVEN** ein Spieler-Mitglied einer geöffneten Spielsitzung mit Socket-Verbindung
- **WHEN** es `session:enter` mit einer Payload sendet, die kein Objekt mit `sessionId` ist
  (etwa eine Zahl)
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und ein anschließendes
  gültiges `session:enter` zeigt den Spieler in `participants` nur einmal

### Requirement: Autorisierung pro Aktion

Der Server SHALL für jedes eingehende Socket-Ereignis die Anmelde-Sitzung aus dem beim
Verbindungsaufbau übergebenen Cookie, die Mitgliedschaft und den Zustand der Spielsitzung
erneut aus der Datenbank bestimmen. Eine bestehende Verbindung MUST NOT als Erlaubnis gelten
(`constitution.md` §9.3): endet die Anmelde-Sitzung, SHALL die nächste Aktion derselben
Verbindung mit `{ ok: false, message }` abgelehnt werden und nichts verändern.

#### Scenario: Abmeldung wirkt auf eine bestehende Verbindung

- **GIVEN** ein Spielleiter, der seine Spielsitzung im Zustand `geoeffnet` betreten hat
- **WHEN** `POST /api/auth/logout` mit seinem Cookie eingeht und er danach über dieselbe
  Socket-Verbindung `session:transition` mit `action: "starten"` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung steht in
  der Datenbank weiterhin auf `geoeffnet`

### Requirement: Teilnehmerliste in Echtzeit

Der Server SHALL allen Verbindungen im Raum ein `session:participants`
`{ sessionId, participants }` senden, wenn sich Mitgliedschaft oder Anwesenheit ändert: bei
einem Beitritt per Code, beim Betreten des Raums und beim Verlassen (Verbindungsabbruch oder
Wechsel in einen anderen Raum). `participants` SHALL jedes Mitglied genau einmal enthalten,
mit `userId`, `email`, `role` und `online`. Ein Mitglied, dessen Verbindung endet, bleibt
Mitglied und wird `online: false`.

#### Scenario: Neues Mitglied erscheint sofort in der Liste

- **GIVEN** ein Spielleiter, der seine Spielsitzung (`geoeffnet`) betreten hat, und ein
  angemeldeter Nutzer, der nicht Mitglied ist
- **WHEN** dieser per `POST /api/sessions/join` beitritt
- **THEN** erhält der Spielleiter ein `session:participants`, das den neuen Nutzer mit
  `role: "spieler"` und `online: false` enthält

#### Scenario: Betreten setzt das Mitglied auf anwesend

- **GIVEN** ein Spielleiter, der seine Spielsitzung (`geoeffnet`) betreten hat, und ein
  Spieler-Mitglied mit Socket-Verbindung, das den Raum noch nicht betreten hat
- **WHEN** der Spieler `session:enter` sendet
- **THEN** erhält der Spielleiter ein `session:participants`, das den Spieler mit
  `online: true` enthält

#### Scenario: Verbindungsabbruch setzt das Mitglied auf abwesend

- **GIVEN** Spielleiter und ein Spieler haben den Raum betreten
- **WHEN** die Verbindung des Spielers endet
- **THEN** erhält der Spielleiter ein `session:participants`, das den Spieler weiterhin
  enthält, mit `online: false`, und die Mitgliedschaft existiert in der Datenbank weiterhin

### Requirement: Eine Verbindung pro Nutzer und Spielsitzung

Betritt ein Nutzer den Raum einer Spielsitzung, in dem bereits eine andere Verbindung
desselben Nutzers anwesend ist, SHALL die neue Verbindung übernehmen. Die bisherige
Verbindung SHALL `session:replaced` `{ sessionId }` erhalten und danach vom Server getrennt
werden. `participants` SHALL den Nutzer weiterhin genau einmal und als `online: true`
führen. Eine Übernahme ist kein Verlassen: sie MUST NOT den Zustand der Spielsitzung ändern,
auch nicht beim Spielleiter in `gestartet`.

#### Scenario: Zweite Verbindung ersetzt die erste

- **GIVEN** ein Spieler hat den Raum über Verbindung `V1` betreten, der Spielleiter ist
  anwesend
- **WHEN** derselbe Spieler über eine zweite Verbindung `V2` mit demselben Cookie
  `session:enter` sendet
- **THEN** lautet das Acknowledgement an `V2` `{ ok: true, ... }`, `V1` erhält
  `session:replaced` und wird vom Server getrennt (Trennungsgrund `io server disconnect`),
  und das nächste `session:participants` beim Spielleiter enthält den Spieler genau einmal
  mit `online: true`

#### Scenario: Übernahme durch den Spielleiter pausiert nicht

- **GIVEN** eine Spielsitzung im Zustand `gestartet`, deren Spielleiter über `V1` anwesend ist
- **WHEN** der Spielleiter über `V2` `session:enter` sendet und `V1` daraufhin getrennt wird
- **THEN** steht die Spielsitzung in der Datenbank weiterhin auf `gestartet`, und der
  Spielleiter ist in `participants` genau einmal mit `online: true` enthalten

### Requirement: Lebenszyklus durch den Spielleiter

Der Spielleiter SHALL den Zustand seiner Spielsitzung mit `session:transition`
`{ sessionId, action }` schalten. Erlaubt sind genau diese Übergänge:

| von | `oeffnen` | `starten` | `pausieren` | `beenden` |
|---|---|---|---|---|
| `geschlossen` | → `geoeffnet` | — | — | — |
| `geoeffnet` | — | → `gestartet` | — | → `geschlossen` |
| `gestartet` | — | — | → `pausiert` | → `geschlossen` |
| `pausiert` | — | → `gestartet` | — | → `geschlossen` |

Ein erlaubter Übergang SHALL den Zustand in der Datenbank ändern, mit `{ ok: true, status }`
bestätigt werden und allen im Raum ein `session:status` `{ sessionId, status }` senden. Ein
nicht erlaubter Übergang und ein Übergang durch ein Mitglied mit Rolle `spieler` SHALL mit
`{ ok: false, message }` beantwortet werden und MUST NOT den Zustand ändern.

`beenden` SHALL zusätzlich alle anwesenden Spieler aus dem Raum entfernen und jedem von ihnen
`session:ended` `{ sessionId }` senden; ihre Mitgliedschaft bleibt bestehen. Der Spielleiter
bleibt im Raum.

#### Scenario: Öffnen und Starten

- **GIVEN** eine Spielsitzung im Zustand `geschlossen`, deren Spielleiter den Raum betreten hat
- **WHEN** er `session:transition` mit `oeffnen` und danach mit `starten` sendet
- **THEN** lauten die Acknowledgements `{ ok: true, status: "geoeffnet" }` und
  `{ ok: true, status: "gestartet" }`, er erhält je ein `session:status` mit demselben
  Zustand, und die Spielsitzung steht in der Datenbank auf `gestartet`

#### Scenario: Pausieren und erneutes Starten

- **GIVEN** eine Spielsitzung im Zustand `gestartet`, in deren Raum Spielleiter und ein Spieler
  anwesend sind
- **WHEN** der Spielleiter `session:transition` mit `pausieren` und danach mit `starten` sendet
- **THEN** erhält der Spieler nacheinander `session:status` mit `pausiert` und mit
  `gestartet`, und die Spielsitzung steht in der Datenbank auf `gestartet`

#### Scenario: Nicht erlaubter Übergang

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, deren Spielleiter den Raum betreten hat
- **WHEN** er `session:transition` mit `pausieren` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung steht in
  der Datenbank weiterhin auf `geoeffnet`

#### Scenario: Spieler darf nicht schalten

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, in deren Raum ein Spieler anwesend ist
- **WHEN** der Spieler `session:transition` mit `starten` sendet
- **THEN** lautet das Acknowledgement `{ ok: false, message }`, und die Spielsitzung steht in
  der Datenbank weiterhin auf `geoeffnet`

#### Scenario: Beenden trennt die Spieler vom Raum

- **GIVEN** eine Spielsitzung im Zustand `gestartet`, in deren Raum Spielleiter und ein Spieler
  anwesend sind
- **WHEN** der Spielleiter `session:transition` mit `beenden` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, status: "geschlossen" }`, der Spieler
  erhält `session:ended` mit der `sessionId`, der Spielleiter erhält ein
  `session:participants`, das den Spieler mit `online: false` enthält, die Spielsitzung steht
  in der Datenbank auf `geschlossen`, und die Mitgliedschaft des Spielers existiert weiterhin

### Requirement: Abwesenheit des Spielleiters pausiert

Endet die Verbindung des anwesenden Spielleiters (Verbindungsabbruch, kein Wechsel auf eine
andere Verbindung), während die Spielsitzung `gestartet` ist, SHALL der Server sie in der
Datenbank auf `pausiert` setzen und allen im Raum `session:status` mit `pausiert` senden. In
jedem anderen Zustand SHALL der Verbindungsverlust den Zustand unverändert lassen. Die
Rückkehr des Spielleiters MUST NOT den Zustand ändern; eine Pause endet nur durch
`starten`.

Beim Start des Servers SHALL jede Spielsitzung im Zustand `gestartet` auf `pausiert` gesetzt
werden, weil zu diesem Zeitpunkt niemand verbunden ist.

#### Scenario: Verbindungsverlust des Spielleiters in gestartet

- **GIVEN** eine Spielsitzung im Zustand `gestartet`, in deren Raum Spielleiter und ein Spieler
  anwesend sind
- **WHEN** die Verbindung des Spielleiters endet
- **THEN** erhält der Spieler `session:status` mit `pausiert`, und die Spielsitzung steht in
  der Datenbank auf `pausiert`

#### Scenario: Verbindungsverlust des Spielleiters in geöffnet

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet`, in deren Raum Spielleiter und ein Spieler
  anwesend sind
- **WHEN** die Verbindung des Spielleiters endet
- **THEN** erhält der Spieler ein `session:participants` mit dem Spielleiter als
  `online: false`, kein `session:status`, und die Spielsitzung steht in der Datenbank
  weiterhin auf `geoeffnet`

#### Scenario: Rückkehr des Spielleiters setzt nicht fort

- **GIVEN** eine Spielsitzung im Zustand `pausiert`, deren Spielleiter nicht anwesend ist
- **WHEN** der Spielleiter eine Verbindung aufbaut und `session:enter` sendet
- **THEN** lautet das Acknowledgement `{ ok: true, ... }` mit `session.status` gleich
  `pausiert`, und die Spielsitzung steht in der Datenbank weiterhin auf `pausiert`

#### Scenario: Serverstart normalisiert gestartete Spielsitzungen

- **GIVEN** in der Datenbank eine Spielsitzung im Zustand `gestartet` und eine im Zustand
  `geoeffnet`
- **WHEN** eine frisch aufgebaute Serverinstanz auf derselben Datenbank betriebsbereit ist
- **THEN** steht die erste in der Datenbank auf `pausiert`, die zweite weiterhin auf
  `geoeffnet`

### Requirement: Sitzungsoberfläche

Die Anwendung SHALL einem angemeldeten Nutzer seine Spielsitzungen mit Rolle und Zustand
zeigen sowie Formulare zum Erstellen (Name) und zum Beitreten (Code) anbieten; Abmelden und
Passwortänderung aus `user-auth` bleiben erreichbar. Nach Auswahl einer Spielsitzung SHALL
die Raumansicht deren Namen, Zustand und die Teilnehmerliste mit Anwesenheitskennzeichen
zeigen. Dem Spielleiter SHALL sie zusätzlich den Sitzungscode und die im aktuellen Zustand
erlaubten Übergänge als Schaltflächen anbieten; einem Spieler MUST NOT sie Code oder
Steuerung zeigen. Der angezeigte Zustand SHALL dem zuletzt vom Server gemeldeten folgen
(`constitution.md` §9.1), nicht der zuletzt geklickten Schaltfläche.

Erhält die Anwendung `session:replaced`, SHALL sie einen Hinweis zeigen, dass die
Spielsitzung an anderer Stelle geöffnet wurde, und MUST NOT sich von selbst neu verbinden
oder den Raum erneut betreten; ein erneutes Betreten erfolgt nur durch eine bewusste
Handlung des Nutzers. Erhält sie `session:ended`, SHALL sie zur Sitzungsliste zurückkehren
und einen Hinweis zeigen.

#### Scenario: Sitzungsliste mit Erstellen und Beitreten

- **GIVEN** der Server meldet einen angemeldeten Nutzer, und `GET /api/sessions` liefert eine
  Spielsitzung `Freitagsrunde` mit `role: "spielleiter"` und `status: "geschlossen"`
- **WHEN** die Anwendung gerendert wird
- **THEN** zeigt sie den Eintrag `Freitagsrunde` mit Rolle und Zustand, ein Eingabefeld für
  den Namen einer neuen Spielsitzung, ein Eingabefeld für einen Sitzungscode sowie weiterhin
  die Abmeldung

#### Scenario: Raumansicht des Spielleiters

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spielleiter"`, `status: "geoeffnet"`, `code: "ABC234"` und zwei Teilnehmer, einen
  mit `online: true`, einen mit `online: false`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie den Code `ABC234`, den Zustand, beide Teilnehmer mit unterscheidbarem
  Anwesenheitskennzeichen sowie Schaltflächen für `starten` und `beenden`, aber keine für
  `oeffnen` oder `pausieren`

#### Scenario: Raumansicht des Spielers

- **GIVEN** die Anwendung hat den Raum betreten, und das Acknowledgement nennt
  `role: "spieler"`, `status: "gestartet"` und kein Feld `code`
- **WHEN** die Raumansicht gerendert wird
- **THEN** zeigt sie Namen, Zustand und Teilnehmerliste, aber keinen Sitzungscode und keine
  Schaltfläche für einen Zustandsübergang

#### Scenario: Zustand folgt dem Server

- **GIVEN** die Raumansicht eines Spielers zeigt den Zustand `geoeffnet`
- **WHEN** die Anwendung `session:status` mit `gestartet` erhält
- **THEN** zeigt sie den Zustand `gestartet`

#### Scenario: Ersetzte Verbindung verbindet sich nicht neu

- **GIVEN** die Raumansicht ist geöffnet und verbunden
- **WHEN** die Anwendung `session:replaced` und danach die Trennung der Verbindung erhält
- **THEN** zeigt sie einen Hinweis, dass die Spielsitzung an anderer Stelle geöffnet wurde,
  und löst weder einen erneuten Verbindungsaufbau noch ein erneutes `session:enter` aus

#### Scenario: Beendete Spielsitzung führt zur Liste zurück

- **GIVEN** die Raumansicht eines Spielers ist geöffnet
- **WHEN** die Anwendung `session:ended` erhält
- **THEN** zeigt sie die Sitzungsliste und einen Hinweis, dass die Spielsitzung beendet wurde
