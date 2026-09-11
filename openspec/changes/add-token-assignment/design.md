## Context

Vorhanden aus #14: Modell `Token` an der Karteninstanz, `shared/token.ts` als gemeinsamer
Vertrag, `server/session/tokens.ts` mit `toToken`/`loadTokens`/`broadcastTokens` und den drei
Handlern nach dem Muster zod-Parse → `authorizeAction` → aktive Instanz aus der Spielsitzung
→ Token mit `id` **und** `instanceId` laden → Schreiben → `broadcastTokens` →
Acknowledgement; `client/map/canvas.ts` mit Tokenebene und Ziehen, das pauschal am
Vorhandensein von `onTokenMove` hängt; `SessionRoom`, das `onTokenMove` nur dem Spielleiter
gibt und die Token-Meldung (`tokenError`) an `TokenPanel` durchreicht; `TokenPanel` mit
Formular und Liste. Aus #6/#45: `Participant` `{ userId, username, alias?, role, online }`
und `displayName` in `shared/session.ts`; `authorizeAction` liefert `user`, `membership`
und `gameSession` und prüft optional eine Rolle. `SessionRoom` kennt `currentUserId` als
Prop.

Die Entscheidungen (1:n, Nutzerverweis, nur Absetzen, nur Berechtigung, Auswahlfeld je
Token, Zuweisung sichtbar) stehen in proposal.md. Verhalten: Delta in
`specs/session-token/spec.md`. Bindend und nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- Genau **eine** Regel „wer darf dieses Token bewegen", in `shared/`, benutzt vom Server
  (Entscheidung) und vom Client (Greifbarkeit). Der Client kann damit nicht großzügiger sein
  als der Server — und wenn doch, entscheidet der Server (§9.1).
- Die Berechtigung wird bei jeder Bewegung gegen die **gespeicherte** Zuweisung geprüft —
  nichts an der Verbindung, kein Zwischenspeicher (§9.3).
- Alles Bestehende bleibt in Form und Reihenfolge: `session:tokens` bleibt das einzige
  Verteilereignis, `broadcastTokens` die einzige Verteilstelle.
- Keine bestehende Assertion außerhalb der zwei im Proposal genannten Szenarien bricht.

**Non-Goals:**
- Kein Diff im Canvas; `setTokens` baut weiterhin alle Container neu — gerade deshalb wirkt
  eine geänderte Zuweisung ohne Sonderpfad mit dem nächsten Bestand.
- Keine Anzeige des Besitzers als Text auf dem Canvas — der Spielleiter sieht ihn im
  Auswahlfeld, der Spieler an der Kennzeichnung seiner Tokens.

## Decisions

### D1 — Datenmodell

```prisma
model Token {
  // ... bestehende Felder
  ownerId    String?
  owner      User?       @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  @@index([instanceId])
  @@index([ownerId])
}
```
`User` bekommt die Gegenrelation `tokens Token[]`.
- **Nullable Spalte am Token, kein Join-Modell**: 1:n ist entschieden; eine Spalte ist die
  kleinste Form davon. „Gehört dem Spielleiter" ist `null` — der Spielleiter darf ohnehin
  jedes Token, ein gespeicherter Verweis auf ihn hätte keine zweite Bedeutung und müsste bei
  einem (noch nicht existierenden) Spielleiterwechsel mitgezogen werden.
- **Verweis auf `User`, nicht auf `Membership`** (entschieden): die Teilnehmerliste trägt
  bereits `userId`, `authorizeAction` liefert `user.id`; ein Verweis auf die Mitgliedschaft
  brächte eine zweite Kennung ins Drahtformat. Dass der Besitzer Mitglied der Spielsitzung
  ist, prüft der Zuweisungs-Handler (D3) — die Datenbank prüft es nicht, und muss es nicht:
  ein Spieler, der später kein Mitglied mehr wäre, kommt an `authorizeAction` nicht vorbei.
- **`onDelete: SetNull`**: ein gelöschter Nutzer hinterlässt ein besitzerloses Token, kein
  gelöschtes. Es gibt keinen Löschpfad für Nutzer; die Regel ist Vorsorge und kein
  Testgegenstand.
- **Migration** per `ALTER TABLE "Token" ADD COLUMN "ownerId" TEXT REFERENCES "User" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE` plus `CREATE INDEX "Token_ownerId_idx"` — dasselbe
  Muster wie `activeInstanceId` in `20260910150000_add-map-instance` (nullable Spalte, kein
  Tabellen-Neuaufbau). Bestehende Zeilen werden `null`, also das bisherige Verhalten.

### D2 — Eine Regel in `shared/token.ts`

```ts
export interface TokenMover { role: MemberRole; userId: string }
export function canMoveToken(token: Pick<Token, 'ownerId'>, mover: TokenMover): boolean {
  return mover.role === 'spielleiter' || token.ownerId === mover.userId
}
```
- `Pick<Token, 'ownerId'>`, damit der Server sie mit der Prisma-Zeile aufrufen kann, ohne
  vorher `toToken` zu bemühen; `MemberRole` kommt per `import type` aus `session.ts` —
  `session.ts` importiert bereits `Token` aus `token.ts`, ein Typ-Import in Gegenrichtung
  erzeugt keinen Laufzeitzyklus.
- Verworfen: *Regel nur im Server, Client bekommt eine Liste greifbarer `id`s* — dann wäre
  die Greifbarkeit ein zweiter Zustand im Raum, der bei jedem Bestand neu zu berechnen wäre;
  die Regel selbst ist eine Zeile.

Weiter in `shared/token.ts`: `TokenSchema` bekommt `ownerId: z.string().nullable()`;
`AssignTokenInputSchema` `{ sessionId, tokenId, ownerId: z.string().nullable() }` (nullable,
nicht optional — ein bewusstes `null` ist „zurücknehmen", ein fehlendes Feld ist ungültig,
Muster `instanceId` in `session-map.ts`); `AssignTokenAck` `{ ok: true; token } | { ok:
false; message }`; `SESSION_TOKEN_EVENTS.assign = 'session:token-assign'`.

### D3 — Server (`server/session/tokens.ts`)

- `toToken` kopiert `ownerId` (bleibt `null`, wenn `null`).
- **`session:token-assign`** in `registerTokenHandlers`, Reihenfolge wie die übrigen:
  zod-Parse → `authorizeAction(…, { role: 'spielleiter' })` → Token mit `{ id, instanceId:
  activeInstanceId }` laden (`Token nicht gefunden.`; ohne aktive Karte ist `instanceId`
  `null`, also ebenfalls kein Treffer) → bei `ownerId !== null`: `membership.findUnique({
  where: { sessionId_userId: { sessionId, userId: ownerId } } })`, Treffer muss Rolle
  `spieler` haben, sonst `Spieler nicht gefunden.` (eine Meldung für „kein Mitglied" und „der
  Spielleiter selbst" — beides ist aus Sicht des Clients dasselbe: kein wählbarer Eintrag)
  → `token.update({ data: { ownerId } })` → `broadcastTokens` → `{ ok: true, token }`.
  Reihenfolge Token-vor-Mitglied, damit ein nicht auffindbares Token dieselbe Meldung
  liefert wie beim Bewegen, unabhängig vom `ownerId`.
- **`session:token-move`**: `authorizeAction(…, socket, sessionId)` **ohne** Rolle; Token
  laden wie bisher (unverändert `Token nicht gefunden.` für alles, was nicht auf der aktiven
  Instanz liegt — §9.2 vor der Berechtigung, sonst verriete die Meldung einem Spieler, ob
  eine `id` existiert); danach `canMoveToken(existing, { role:
  MemberRoleSchema.parse(authResult.membership.role), userId: authResult.user.id })`, bei
  `false` → `Dieses Token darfst du nicht bewegen.` und Rückkehr vor jedem Schreiben und vor
  `broadcastTokens`. Die Rolle kommt aus der Mitgliedschaft, die `authorizeAction` **jetzt**
  geladen hat, der Besitzer aus der Zeile, die **jetzt** geladen wurde — keine der beiden
  Angaben stammt aus der Payload oder aus einem früheren Aufruf (§9.3).
- `create` und `remove` bleiben unverändert (Rolle `spielleiter`); `create` schreibt kein
  `ownerId` — der Datenbank-Default ist `null`.
- Neue Meldungskonstanten: `NOT_TOKEN_OWNER_MESSAGE = 'Dieses Token darfst du nicht
  bewegen.'`, `PLAYER_NOT_FOUND_MESSAGE = 'Spieler nicht gefunden.'`.

### D4 — Client-Fassade (`client/session/socket.ts`)

`assignToken(sessionId, tokenId, ownerId: string | null): Promise<AssignTokenAck>` — emit
`SESSION_TOKEN_EVENTS.assign` mit `{ sessionId, tokenId, ownerId }`. Kein neues
Server→Client-Ereignis; `on('tokens', …)` bleibt die einzige Rückrichtung.

### D5 — Greifbarkeit pro Token im Canvas (`client/map/canvas.ts`, `MapCanvas.tsx`)

- `MapCanvasOptions` bekommt `canMoveToken?: (token: Token) => boolean` neben `onTokenMove`.
  `MapCanvasProps` entsprechend; beide werden — wie `onTokenMove` schon — nur beim Erzeugen
  übergeben (Rolle und eigene `userId` ändern sich im Raum nicht).
- `buildTokenContainer`: greifbar ist ein Token genau dann, wenn `onTokenMove` gesetzt ist
  **und** `canMoveToken` fehlt oder `true` liefert. Nur dann `eventMode = 'static'`, `cursor
  = 'grab'` und der `pointerdown`-Handler. Weil `drawTokens` alle Container bei jedem
  `setTokens` neu baut, wird die Regel mit jedem Bestand neu ausgewertet — eine Zuweisung,
  die der Spielleiter ändert, wirkt beim Spieler mit dem nächsten `session:tokens`, ohne
  eigenen Pfad.
- Kennzeichnung greifbarer Tokens: ein zweiter Kreisrand (`Graphics`-Ring) außerhalb des
  weißen Rands in einer festen Akzentfarbe (`TOKEN_MOVABLE_RING_COLOR`), nur bei greifbaren
  Tokens. Der Spielleiter sieht ihn damit an jedem Token, der Spieler an seinen. Aussehen:
  App-Test. Kein Test hängt daran.
- Verworfen: *`onTokenMove` weiterhin nur greifbaren Rollen geben und die Fassade filtern* —
  „greifbar" ist keine Eigenschaft der Rolle mehr, sondern des Tokens; ein Rückruf pro Token
  wäre dasselbe wie ein Prädikat, nur schwerer zu mocken.

### D6 — Raumansicht (`client/session/SessionRoom.tsx`)

- `MapCanvas` bekommt für **jede Rolle** `onTokenMove={handleTokenMove}` und
  `canMoveToken={(token) => canMoveToken(token, { role: state.role, userId: currentUserId })}`
  — die Regel aus D2, mit der Rolle aus dem Enter-Acknowledgement und der eigenen `userId`
  aus den Props.
- `tokenError` wird in der Raumansicht selbst gerendert: `<p role="alert">{tokenError}</p>`
  direkt unter der Kartenansicht, für jede Rolle. `TokenPanel` verliert die Prop `error` und
  rendert keine Meldung mehr — sonst stünde dieselbe Meldung zweimal im DOM, und
  `getByText` im bestehenden Szenario „Abgelehnte Aktion zeigt die Meldung" fände zwei
  Treffer. `handleTokenMove`, `handleTokenCreate`, `handleTokenRemove` und das neue
  `handleTokenAssign` setzen alle dieselbe `tokenError` (bei `ok: true` auf `null`).
- `handleTokenAssign(tokenId, ownerId)` → `socket.assignToken(sessionId, tokenId, ownerId)`;
  keine lokale Änderung des Bestands — der Server verteilt (§9.1).
- `TokenPanel` bekommt `participants={state.participants}` und `onAssign={handleTokenAssign}`.

### D7 — Token-Verwaltung (`client/session/TokenPanel.tsx`)

Props: `tokens`, `participants: Participant[]`, `onCreate`, `onRemove`, `onAssign(tokenId,
ownerId: string | null)`. Prop `error` entfällt (D6). Je Token in der Liste ein
Auswahlfeld; der Wert ist `token.ownerId ?? ''` (kontrolliert, folgt dem Bestand vom Server,
nie der letzten Auswahl); `onChange` ruft `onAssign(token.id, value === '' ? null : value)`.
Die Einträge sind `Spielleiter` (Wert `''`) und danach jeder Teilnehmer mit `role ===
'spieler'` mit `displayName(participant)` als Text und `userId` als Wert — der Spielleiter
selbst erscheint nicht als Eintrag (er wäre serverseitig ohnehin `Spieler nicht gefunden.`).

**Schnittstelle** (Adressen für Test und Implementierung, Layout frei) — ergänzt die Tabelle
aus #14 D7, die unverändert gilt:

| Element | Beschriftung / Attribut |
|---|---|
| Zuweisung je Token | `<select name="owner">` mit `aria-label` genau `<Name> zuweisen`; `value` = `ownerId` oder `''` |
| Eintrag „kein Besitzer" | erste `<option value="">` mit Text `Spielleiter` |
| Eintrag je Spieler | `<option value="<userId>">` mit Text `displayName(participant)` (Alias, sonst Nutzername), nur für `role === 'spieler'` |
| Meldung abgelehnter Token-Aktionen | `<p role="alert">` in der **Raumansicht** (nicht mehr in der Verwaltung), für jede Rolle |

Sichtbarer Text `Spielleiter` als Option: kein Teilstring-Risiko wie in #45 — Options werden
per `getByRole('option', { name })` bzw. über den `select`-Wert adressiert, nicht per
`getByText` auf der Seite. `Tokens`, `Anlegen`, `<Name> entfernen` bleiben.

### D8 — Testaufbau

- **Socket-Szenarien** wie in #14 D8 (echte Socket.IO-Clients, Aufbau über Routen und
  direkte DB-Anlage). Für GIVEN „Besitzer ist `sam`" wird das Token direkt in der DB mit
  `ownerId` angelegt (der bestehende Helfer `createTokenDirect` bekommt ein optionales
  `ownerId`). Das Szenario „Entzogene Zuweisung wirkt mit der nächsten Bewegung" nutzt
  **eine** Spieler-Verbindung für beide Bewegungen — das ist der Kern von §9.3. „erhält kein
  `session:tokens`" wie bisher als kurze Wartezeit ohne Ereignis.
- **Zwei bestehende Tests ändern sich**, weil ihre Szenarien sich ändern (Name bleibt):
  „Spieler darf kein Token bewegen" prüft jetzt die feste Meldung und „kein
  `session:tokens`"; „Spieler zieht nicht" erwartet jetzt einen `onTokenMove`-Rückruf und
  eine `canMoveToken`-Regel, die `false` liefert. Alle übrigen Tests der drei Suiten bleiben
  unverändert; sie müssen nach der Umsetzung weiterhin grün sein (Tokendarstellungen in
  Fixtures brauchen `ownerId`, weil `TokenSchema` es verlangt — das betrifft nur die
  Unit-Fixtures `GOBLIN`/`ORK`, deren Typ `Token` ist).
- **Komponententests**: Enter-Acknowledgement mit `participants`, die `meister`
  (`spielleiter`) und `sam` (`spieler`, `userId` `u-sam`, Alias `Gandalf`) enthalten;
  Socket-Fassade zusätzlich mit aufzeichnendem `assignToken`; `canMoveToken` aus den
  aufgezeichneten Canvas-Optionen direkt mit Token-Objekten aufrufen. Auswahlfeld per
  `getByRole('combobox', { name: 'Goblin zuweisen' })`, Auswahl per
  `fireEvent.change(select, { target: { value: 'u-sam' } })`; Options per
  `within(select).getByRole('option', { name })`. Keine `must()`-Helfer mit Kurzmeldung —
  die DOM-Ausgabe der Testing Library ist das Gate-Feedback des implementers.
- Kein Test importiert `pixi.js`; Kennzeichnung und Ziehen nimmt der App-Test ab.

## Risks / Trade-offs

- **Client-Regel und Server-Regel driften** → dieselbe Funktion (D2). Sollte ein Client sie
  umgehen, lehnt der Server ab und die Meldung erscheint (D6). Das Szenario „Spieler darf ein
  fremdes Token nicht bewegen" prüft den Server unabhängig vom Client.
- **Zuweisung wechselt, während ein Spieler gerade zieht** → das Loslassen sendet den
  Antrag, der Server lehnt gegen den neuen Stand ab, die Meldung erscheint, das Token bleibt
  (Container wird beim Loslassen ohnehin zurückgesetzt). Genau das Verhalten, das §9.3
  verlangt.
- **`ownerId` verlässt den Server für alle** → bewusst (proposal.md); es ist eine `userId`,
  die die Teilnehmerliste ohnehin trägt, keine E-Mail.
- **Doppelte Meldung im DOM** → `TokenPanel` rendert keine mehr (D6).
- **`getByText('Spielleiter')`** in bestehenden Tests? Keiner der bestehenden Tests sucht
  diesen Text (die Rolle erscheint nirgends als sichtbarer Text, #45); die neue Option ist
  die erste Stelle. Tests adressieren sie als Option, nicht per Seitentext.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte.

## Migration Plan

`prisma/schema.prisma` bekommt `ownerId`/`owner` an `Token` und `tokens` an `User`; die
Migrations-SQL fügt eine nullable Spalte mit Fremdschlüssel und einen Index hinzu, fasst
nichts Bestehendes an (D1). Agent nur gegen die Wegwerf-DB; Entwicklungs-DB der Mensch,
produktiv die CI (§5.1, §6.1). Rollback: Spalte und Index sind neu, kein Code außerhalb
dieses Change liest sie.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Ob ein Spieler seine eigenen Tokens auch
umbenennen dürfen soll, entscheidet der erste Spielabend — nicht Teil von #15.
