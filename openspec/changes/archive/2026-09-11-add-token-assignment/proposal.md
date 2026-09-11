## Why

Seit #14 liegen Tokens auf der aktiven Karte, aber nur der Spielleiter darf sie bewegen —
Spieler sehen zu. Dieser Change ist Teil 2 von Epic #8 (Issue #15): der Spielleiter überträgt
das Bewegungsrecht eines Tokens an einen Spieler, nimmt es zurück oder gibt es weiter, und
ein Spieler bewegt ausschließlich die Tokens, die ihm gerade zugewiesen sind. **Ab hier ist
das VTT spielbar.** Es ist zugleich der erste Fall im Projekt, in dem ein Client lügen könnte:
eine Bewegungsnachricht ist ein Antrag, den der Server bei *jeder* Bewegung gegen die
aktuelle Zuweisung prüft — nicht beim Verbindungsaufbau, nicht einmalig beim Zuweisen
(`constitution.md` §9.1, §9.3).

Entscheidungen aus der Klärung mit dem Menschen (2026-09-11): ein Besitzer je Token, ein
Spieler beliebig viele Tokens (1:n, kein n:m); ein neu angelegtes Token gehört dem
Spielleiter, abgebildet als „kein Besitzer"; der Verweis zeigt auf den Nutzer, nicht auf die
Mitgliedschaft; nur das Absetzen wird übertragen, keine Live-Geste; der Server prüft
ausschließlich die Berechtigung, keine Reichweite, keinen Kartenrand, keine Hindernisse;
zugewiesen wird über ein Auswahlfeld je Token in der Token-Verwaltung; die Zuweisung ist für
alle Teilnehmer sichtbar.

## What Changes

- **Besitzer am Token.** `Token` bekommt einen nullablen Verweis `ownerId` auf den Nutzer.
  `null` heißt „gehört dem Spielleiter" — der Spielleiter darf ohnehin immer. Die
  Tokendarstellung auf der Leitung trägt `ownerId` für alle Teilnehmer; wer welchen Token
  führt, ist keine verdeckte Information.
- **Zuweisen, Zurücknehmen, Übergeben — nur Spielleiter.** Ein neues Socket-Ereignis
  `session:token-assign` mit `tokenId` und `ownerId` oder `null`, zod-geprüft,
  `authorizeAction` mit Rolle `spielleiter` pro Aktion, Bezug auf die aktive Instanz wie
  beim Bewegen. Der Zielnutzer muss ein Spieler-Mitglied der Spielsitzung sein. Nach jeder
  Zuweisung geht der vollständige Bestand per `session:tokens` an den Raum — kein eigenes
  Ereignis.
- **Bewegen: Spielleiter alle, Spieler nur die eigenen.** `session:token-move` verlangt
  keine Rolle mehr; der Server lädt das Token der aktiven Instanz und prüft dann: Rolle
  `spielleiter`, oder `ownerId` gleich dem Absender. Eine entzogene Zuweisung wirkt mit der
  nächsten Bewegung (§9.3). Eine abgelehnte Bewegung wird dem Absender mit Meldung
  zurückgemeldet. Anlegen und Entfernen bleiben Spielleiter-Aktionen.
- **Raumansicht.** Die Kartenansicht bekommt für jede Rolle den Rückruf zum Ziehen und
  entscheidet pro Token, ob es greifbar ist — über dieselbe Regel, die der Server anwendet
  (eine Funktion in `shared/`). Greifbare Tokens sind auf dem Canvas gekennzeichnet; das
  Aussehen nimmt der App-Test ab. Die Token-Verwaltung des Spielleiters bekommt je Token ein
  Auswahlfeld mit „Spielleiter" und den Spieler-Mitgliedern. Die Meldung einer abgelehnten
  Token-Aktion wandert aus der Token-Verwaltung in die Raumansicht, damit auch ein Spieler
  sie sieht.

**Nicht im Umfang:** Live-Übertragung der Ziehgeste; Reichweiten-, Kartenrand- oder
Hindernisprüfung; mehrere Besitzer je Token; Zuweisung im Anlegeformular; Bewegen von
Tokens durch Spieler auf nicht aktiven Karten (es gibt für Spieler nur die aktive);
Fog-Filterung (#17); Healthbars und Marker (#10).

## Capabilities

### New Capabilities

- Keine.

### Modified Capabilities

- `session-token`: Requirement „Token bewegen" — Berechtigung ist nicht mehr „Rolle
  `spielleiter`", sondern „Rolle `spielleiter` oder Besitzer des Tokens", geprüft pro
  Bewegung gegen die aktuelle Zuweisung. Neue Requirement „Token zuweisen" (Zuweisen,
  Zurücknehmen, Übergeben, Besitzer in der Tokendarstellung, Vorgabe „kein Besitzer" beim
  Anlegen). Requirement „Tokenansicht im Raum" — Ziehen für jede Rolle mit Greifbarkeit pro
  Token, Auswahlfeld zur Zuweisung in der Token-Verwaltung, Meldung abgelehnter Aktionen in
  der Raumansicht für jede Rolle.

## Impact

**Schema** (`prisma/schema.prisma`): `Token.ownerId String?` mit Relation auf `User`
(`onDelete: SetNull`) und `@@index([ownerId])`; Gegenrelation `tokens` an `User`. Migration
fügt eine nullable Spalte hinzu — bestehende Zeilen werden zu „kein Besitzer", also dem
bisherigen Verhalten. Nur gegen die Wegwerf-DB (§5.1, §6.1).

**Geänderter Code:**
- `src/shared/token.ts` — `ownerId` in `TokenSchema`; `AssignTokenInputSchema`,
  `AssignTokenAck`; Ereignis `assign`; Regel `canMoveToken` (eine Quelle für Server und
  Client)
- `src/server/session/tokens.ts` — `toToken` mit `ownerId`; Handler `session:token-assign`;
  `session:token-move` ohne Rollenanforderung, Prüfung per `canMoveToken`
- `src/client/session/socket.ts` — `assignToken` mit Acknowledgement
- `src/client/map/canvas.ts`, `src/client/map/MapCanvas.tsx` — Greifbarkeit pro Token statt
  pauschal über das Vorhandensein von `onTokenMove`; Kennzeichnung greifbarer Tokens
- `src/client/session/TokenPanel.tsx` — Auswahlfeld je Token; Meldung nicht mehr hier
- `src/client/session/SessionRoom.tsx` — `onTokenMove` für jede Rolle, Greifbarkeitsregel
  mit Rolle und eigener `userId`, `assignToken` über die Fassade, Meldung abgelehnter
  Token-Aktionen als `role="alert"` in der Raumansicht

**Bestehende Tests:** zwei Szenarien behalten ihren Namen, ändern aber ihre Aussage und
damit ihren Test — „Spieler darf kein Token bewegen" (jetzt: ein Token ohne Besitzer, mit
fester Meldung und ohne `session:tokens`) und „Spieler zieht nicht" (jetzt: der Rückruf ist
da, die Greifbarkeitsregel verneint). Der test-author passt sie an; alle übrigen Szenarien
von `session-token`, `session-map` und `game-session` bleiben unverändert grün.

**Dependencies:** keine neuen.
