## Why

Die Teilnehmerliste einer Spielsitzung (#6) zeigt jedem Mitspieler die E-Mail-Adresse der
anderen — weil das Nutzerkonto aus #12 nichts anderes hat. Das ist ein Verstoß gegen
`constitution.md` §9.2: die E-Mail ist Anmeldename, keine Information für andere Mitspieler.
Alles, was später einen Spieler benennt (Tokens in #8, Chat), würde diese Lücke erben.
Dieser Change gibt dem Nutzer einen **Nutzernamen** (instanzweit einmalig, bei der
Registrierung vergeben) und je Spielsitzung einen optionalen **Alias** (Charaktername, frei
wählbar) — und nimmt die E-Mail aus jedem Drahtformat, das andere Mitspieler erreicht
(Issue #45).

Die offenen Fragen des Issues sind in der Explore-Runde (2026-09-10) entschieden und in
`design.md` begründet: Zeichenvorrat und Case-Insensitivität des Nutzernamens (D1), Anmeldung
bleibt E-Mail-only (D2), keine Bestandskonten-Migration (D3), Alias nur durch das Mitglied
selbst (D4).

## What Changes

- **Nutzername bei der Registrierung** — Pflichtfeld `username`: 3 bis 24 Codepoints nach
  Trimmen, Unicode-Buchstaben und -Ziffern sowie `_`, `-`, `.`; keine Leerzeichen. Instanzweit
  einmalig **unabhängig von der Schreibweise** (`Gandalf` = `gandalf`), erzwungen durch die
  Datenbank über einen normalisierten Schlüssel, nicht durch den Client. Die E-Mail bleibt
  Anmeldename und bleibt einmalig. **BREAKING** für den Registrierungsvertrag: eine
  Registrierung ohne `username` wird mit `400` abgelehnt.
- **Nutzername in der Nutzerdarstellung** — Registrierung, Anmeldung und `GET /api/auth/me`
  liefern `{ id, email, username }`. Die Anmeldung selbst bleibt E-Mail + Passwort.
- **Alias pro Mitgliedschaft** — ein anwesendes Mitglied setzt über das Socket-Ereignis
  `session:alias` `{ sessionId, alias }` seinen eigenen Alias in dieser Spielsitzung: 1 bis 40
  Codepoints nach Trimmen, frei bis auf Steuerzeichen, nicht einmalig (zwei „Gandalf" sind
  erlaubt). Ein leerer Wert setzt den Alias zurück. Der Alias hängt an der Mitgliedschaft,
  nicht am Nutzer. Nur das Mitglied selbst ändert ihn; Prüfung pro Aktion (§9.3).
- **Teilnehmer-Drahtformat** — `{ userId, username, alias?, role, online }`. Das Feld `email`
  entfällt aus `session:participants` und dem Acknowledgement von `session:enter`.
  **BREAKING** für Clients, die `email` lasen.
- **Anzeige** — Teilnehmerliste zeigt Alias, falls gesetzt, sonst Nutzername; die Regel liegt
  als gemeinsamer Helfer im `shared/`-Vertrag, damit Tokens und Chat später dieselbe benutzen.
  Die eigene Zeile der Teilnehmerliste bietet ein Eingabefeld für den Alias; die angezeigte
  Benennung folgt der vom Server gesendeten Teilnehmerliste, nicht der Eingabe (§9.1).
- **Registrierungsoberfläche** — das Registrierungsformular bekommt ein Feld für den
  Nutzernamen und zeigt eine Ablehnung des Servers (vergeben, ungültig) an.
- Nicht enthalten: Anmeldung per Nutzername, Änderung des Nutzernamens nach der
  Registrierung, Eingriff des Spielleiters in fremde Aliasse, Nachhol-Dialog für Konten ohne
  Nutzernamen (es gibt keine — Entwicklungsphase, DB wird geleert).

## Capabilities

### New Capabilities

_keine_

### Modified Capabilities

- `user-auth`: Requirement „Kontoregistrierung" verlangt einen Nutzernamen und prüft dessen
  Form und Einmaligkeit; neue Requirements „Nutzername in der Nutzerdarstellung" (Antworten
  tragen `username`) und „Registrierungsoberfläche" (Formularfeld, Fehleranzeige).
- `game-session`: Requirement „Teilnehmerliste in Echtzeit" nennt Mitglieder mit
  `username`/`alias` statt `email`; neue Requirement „Alias pro Mitgliedschaft"
  (`session:alias`); Requirement „Sitzungsoberfläche" zeigt Alias-oder-Nutzername und bietet
  die Alias-Eingabe an.

## Impact

- **Schema/Migration** (`prisma/`): `User.username` (Pflicht) und `User.usernameKey`
  (normalisiert, `@unique`); `Membership.alias` (optional). Eine Migration; Bestandsdaten
  gibt es nicht.
- **Gemeinsamer Vertrag** (`src/shared/`): `RegisterInputSchema` und `UserOutputSchema` um
  `username` erweitert, `UsernameSchema`; `ParticipantSchema` ohne `email`, mit
  `username`/`alias?`; `AliasInputSchema`, `AliasAck`, Ereignisname `session:alias`,
  Helfer `displayName`.
- **Server**: Registrierungspfad (Nutzername normalisieren, `P2002` auf dem Schlüssel → `409`
  mit `field: "username"`), Nutzerdarstellung, Teilnehmerliste ohne E-Mail, neuer
  Socket-Handler `session:alias` mit `authorizeAction`.
- **Client**: Registrierungsformular, Raumansicht (Anzeige, Alias-Feld, eigene Zeile über die
  Nutzer-ID aus `/api/auth/me`), Socket-Fassade um `alias(...)` erweitert.
- **Bestehende Tests** (`tests/`): jede Registrierung in den Integrationstests und jedes
  Teilnehmer-Fixture in den Komponententests muss auf den neuen Vertrag umgestellt werden
  (Sache des test-author, siehe `tasks.md` 1.1).
- Keine neue Dependency.
