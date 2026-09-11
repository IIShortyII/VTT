## Context

Vorhanden aus #61: `Token` mit fünf nullable Wertespalten und der Markierungstabelle
`TokenCondition`; `shared/token.ts` mit `TokenSchema`, den Input-Schemas, den Acks,
`SESSION_TOKEN_EVENTS` und der Regel `canMoveToken(token, mover)`; `server/session/tokens.ts`
mit `TOKEN_INCLUDE`, `toToken`, `TokenViewer`, `redactToken(token, viewer)` (Spielleiter oder
Besitzer: unverändert, sonst fünf Werte `null` und `conditions` leer), `loadTokens`,
`loadTokensFor`, `broadcastTokens` (je Verbindung, Rolle aus der **jetzt** geladenen
Mitgliedschaft) und sechs Handlern nach dem Muster zod-Parse → `authorizeAction` → aktive
Instanz aus der Spielsitzung → Token mit `id` **und** `instanceId` laden → Schreiben →
`broadcastTokens` → Acknowledgement. `handleMoveToken` filtert sein Ack bereits mit
`redactToken` für den Absender. Client: `client/session/socket.ts` (Fassade, Mock-Grenze der
Komponententests), `TokenPanel` mit einer `TokenRow` je Token (nur Spielleiter),
`TokenStats.tsx` mit `TokenStatsText` und `PlayerTokenList` (Spieler), `SessionRoom` mit
einem Handler je Token-Aktion, alle mit derselben `tokenError`-Meldung.

#61 hat vorweggenommen, was hier passiert: „#62 ändert genau diese eine Funktion
(`redactToken`) und ihre Datenbasis, sonst nichts an den Sendepfaden." Genau das ist der
Plan. Die Entscheidungen (Zielgruppe je Token und Stat, `keine`/`alle`/Liste, Besitzer oder
Spielleiter, keine Sperre, NPC nur Spielleiter) stehen in proposal.md. Verhalten: Delta in
`specs/session-token/spec.md`. Bindend und nicht wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- **Eine Sichtbarkeitsregel, eine Stelle**: `isStatVisible(token, stat, viewer)` in
  `server/session/tokens.ts`, benutzt ausschließlich von `redactToken`. Alle Sendepfade
  (Enter-Ack, `broadcastTokens`, Acks mit Tokendarstellung) laufen weiter über `redactToken`
  bzw. `loadTokensFor` — kein neuer Sendepfad, keine Änderung an `broadcastTokens`.
- **Die Zielgruppen sind Teil der geladenen Tokenzeile** (`TOKEN_INCLUDE`), nicht eine
  zweite Abfrage je Empfänger: `redactToken` bleibt eine reine Funktion ohne DB.
- **Berechtigung zum Teilen = Berechtigung zum Bewegen** (Spielleiter oder Besitzer), als
  eigene benannte Regel `canShareToken` im gemeinsamen Vertrag — heute gleicher Körper wie
  `canMoveToken`, aber ein eigener Name, damit eine spätere Spielleiter-Sperre (proposal.md,
  „Nicht im Umfang") nur eine Regel ändert.
- **Der Client trägt keinen Formularzustand für die Freigaben**: jedes Kästchen zeigt den
  Serverstand und sendet bei Änderung genau eine Absicht (`constitution.md` §9.1).
- Keine bestehende Assertion außerhalb der im Proposal genannten Stellen bricht.

**Non-Goals:**
- Keine Sichtbarkeitsregel im Client — er bekommt nur, was er sehen darf, und rendert
  Schalter genau dort, wo der Server `shares` mitgeschickt hat.
- Keine Reihenfolgegarantie zwischen den `session:tokens` verschiedener Empfänger.
- Keine Bereinigung der Zielgruppen beim Verlassen einer Spielsitzung (es gibt kein
  Verlassen) — ein Empfänger ohne Mitgliedschaft bekommt ohnehin nichts (`broadcastTokens`
  überspringt ihn, `authorizeAction` lässt ihn nicht betreten).

## Decisions

### D1 — Datenmodell

```prisma
model TokenShare {
  id      String  @id @default(cuid())
  tokenId String
  stat    String
  userId  String?
  token   Token   @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user    User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tokenId, stat, userId])
  @@index([tokenId])
  @@index([userId])
}
```
Dazu `Token.shares TokenShare[]` und `User.tokenShares TokenShare[]` als Gegenrelationen.

- **Eine Tabelle, eine Zeile je Empfänger**: `keine` = keine Zeile für (Token, Stat); `alle`
  = genau eine Zeile mit `userId` `null`; Liste = eine Zeile je `userId`. Verworfen: *zwei
  Tabellen (Zielgruppe mit `audience`-Spalte plus Empfängertabelle)* — ein Join mehr, zwei
  Modelle, und die Invariante „`alle` und Empfänger schließen sich aus" müsste trotzdem der
  Handler halten. Hier hält sie das Ersetzen als Ganzes (D3): jeder Schreibpfad löscht erst
  alle Zeilen des Stats und legt dann entweder die `alle`-Zeile **oder** die Empfängerzeilen
  an — nie beides. `toToken` liest defensiv (eine `alle`-Zeile gewinnt, D3).
- **`stat` als `String` mit zod-Enum an der Grenze** (`TokenStatSchema`), kein
  Prisma-`enum` — Muster `GameSession.status`, `GameMap.gridType`.
- **`onDelete: Cascade` an beiden Fremdschlüsseln**: „Entfernen nimmt die Zielgruppen mit"
  ist eine Schemaeigenschaft; ein gelöschter Nutzer verschwindet aus allen Listen.
- **`@@unique([tokenId, stat, userId])`**: verhindert doppelte Empfänger auf DB-Ebene. SQLite
  behandelt `NULL` im Unique-Index als je verschieden — zwei `alle`-Zeilen wären technisch
  möglich, entstehen aber durch D3 nie; `toToken` ist dagegen robust.
- **Migration** `prisma/migrations/<stamp>_add-token-share/migration.sql`: `CREATE TABLE
  "TokenShare"` mit beiden Fremdschlüsseln `ON DELETE CASCADE ON UPDATE CASCADE`,
  `CREATE UNIQUE INDEX "TokenShare_tokenId_stat_userId_key"`, `CREATE INDEX
  "TokenShare_tokenId_idx"`, `CREATE INDEX "TokenShare_userId_idx"` — Muster
  `TokenCondition` in `20260911140000_add-token-stats`. Nichts Bestehendes wird angefasst.

### D2 — Vertrag in `shared/token.ts`

- `TOKEN_STATS = ['hp', 'tempHp', 'ac', 'initiative', 'conditions'] as const`,
  `TokenStatSchema = z.enum(TOKEN_STATS)`, `TokenStat`. `hpMax` ist bewusst **kein** Stat —
  er hängt an `hp` (proposal.md).
- `TokenAudienceSchema`: Union aus `z.literal('keine')`, `z.literal('alle')` und einer
  Liste von `z.string()` mit `min(1)` und `refine` „alle verschieden" (Muster
  `TokenConditionsInputSchema`). Eine leere Liste ist **ungültig**, nicht „keine": der
  Client sendet `'keine'` selbst (D7), und damit ist eine Liste in `shares` nie leer.
  `TokenAudience`.
- `TokenSharesSchema = z.object({ hp, tempHp, ac, initiative, conditions })`, jedes Feld
  `TokenAudienceSchema`; `TokenShares`; Konstante `NO_SHARES: TokenShares` mit fünfmal
  `'keine'` (für den Client als Rückfall und für Tests als Fixture-Baustein).
- `TokenSchema` bekommt `shares: TokenSharesSchema.nullable()` — `null` heißt „für diesen
  Empfänger nicht sichtbar" (spec.md „Tokendarstellung"). Flach neben den Werten, wie
  `ownerId` und `conditions`.
- `ShareTokenInputSchema = { sessionId, tokenId, stat: TokenStatSchema, audience:
  TokenAudienceSchema }`, `ShareTokenInput`; `ShareTokenAck = { ok: true; token } | { ok:
  false; message }`; `SESSION_TOKEN_EVENTS.share = 'session:token-share'`.
- `canShareToken(token: Pick<Token, 'ownerId'>, actor: TokenMover): boolean` — Rolle
  `spielleiter` oder `ownerId === actor.userId`. Gleicher Körper wie `canMoveToken`, eigener
  Name (Goals). Der Client benutzt sie **nicht** zum Ein-/Ausblenden der Schalter (das
  entscheidet `shares !== null`, D7); sie ist die Serverregel und steht im Vertrag, damit sie
  neben `canMoveToken` sichtbar ist.
- Verworfen: *`audience` als Objekt `{ kind, userIds }`* — mehr Tipparbeit in jedem Test und
  jeder Fixture ohne Gewinn; die Union `'keine' | 'alle' | string[]` ist auf der Leitung und
  im Code eindeutig (`Array.isArray`).

### D3 — Server (`server/session/tokens.ts`)

- **`TOKEN_INCLUDE`** bekommt `shares: { orderBy: { userId: 'asc' } }` neben `conditions`.
  `TokenRow` wird `PrismaToken & { conditions: …; shares: PrismaTokenShare[] }`.
- **`toToken(row)`** baut `shares` aus den Zeilen: je Stat die Zeilen mit diesem `stat`;
  enthält eine davon `userId` `null` → `'alle'`; sonst mindestens eine → die `userId`s
  (aufsteigend, durch das `orderBy`); sonst `'keine'`. Das Ergebnis ist **immer** ein Objekt —
  `null` entsteht erst in `redactToken`.
- **`isStatVisible(token: Token, stat: TokenStat, viewer: TokenViewer): boolean`** — reine
  Funktion: `viewer.role === 'spielleiter'` oder `token.ownerId === viewer.userId` oder
  Zielgruppe `'alle'` oder Liste mit `viewer.userId`. Liest `token.shares`; ist es `null`
  (kann bei serverseitig geladenen Tokens nicht vorkommen, aber der Typ erlaubt es), gilt
  `NO_SHARES`.
- **`redactToken(token, viewer)`**: bei Spielleiter oder Besitzer unverändert (wie bisher —
  inklusive `shares`). Sonst: `hp`/`hpMax` nur bei `isStatVisible(…, 'hp')`, `tempHp`, `ac`,
  `initiative` je für sich, `conditions` bei `isStatVisible(…, 'conditions')` sonst `[]`,
  und **`shares: null`**. Signatur und Aufrufer unverändert — `loadTokensFor`,
  `broadcastTokens`, `handleMoveToken` bleiben, wie sie sind.
- **`session:token-share`** (`handleShareToken`): zod-Parse (`ShareTokenInputSchema`, sonst
  `INVALID_PAYLOAD_MESSAGE`) → `authorizeAction` **ohne** Rollenanforderung → Token der
  aktiven Instanz laden (`TOKEN_NOT_FOUND_MESSAGE`, vor jeder Berechtigungsprüfung — sonst
  verriete die Meldung einem Spieler, ob eine `id` existiert) → `actor = { role, userId }`
  aus der **jetzt** geladenen Mitgliedschaft; `!canShareToken(existing, actor)` →
  `NOT_TOKEN_SHARER_MESSAGE = 'Dieses Token darfst du nicht teilen.'` → ist `audience` eine
  Liste: `membership.findMany({ where: { sessionId, role: 'spieler', userId: { in: liste } }
  })`, Trefferzahl ungleich Listenlänge → `PLAYER_NOT_FOUND_MESSAGE` (deckt Nichtmitglied,
  Spielleiter selbst und eine einzelne ungültige `userId` in einer Liste) →
  `prisma.$transaction([ tokenShare.deleteMany({ where: { tokenId, stat } }),
  tokenShare.createMany({ data: zeilen }) ])` mit `zeilen` = `[]` für `'keine'`, `[{ tokenId,
  stat, userId: null }]` für `'alle'`, eine Zeile je `userId` für die Liste (Prisma 6
  unterstützt `createMany` auf SQLite, wie in #61; ein leeres `createMany` ist erlaubt) →
  Token mit `TOKEN_INCLUDE` neu laden → `broadcastTokens` → `{ ok: true, token:
  redactToken(toToken(updated), actor) }` (für Spielleiter und Besitzer ein No-op — genau die
  beiden kommen an diesen Punkt).
- `create`, `move`, `remove`, `assign`, `stats`, `conditions` unverändert: `TOKEN_INCLUDE`
  bringt die Zielgruppen mit, `assign` fasst die Tabelle nicht an („Zuweisung lässt die
  Zielgruppen stehen"), `remove` löscht sie per Cascade, `create` legt keine an.
- Verworfen: *Berechtigung vor der Ladeprüfung* — dieselbe Reihenfolge wie beim Bewegen, aus
  demselben Grund (§9.2). *Zielgruppen in `socket.data` cachen* — §9.3. *Empfänger je Eintrag
  einzeln prüfen* — eine `findMany` mit `in` genügt und ist eine Abfrage.

### D4 — Client-Fassade (`client/session/socket.ts`)

`shareToken(sessionId, tokenId, stat: TokenStat, audience: TokenAudience):
Promise<ShareTokenAck>` — emit `SESSION_TOKEN_EVENTS.share` mit `{ sessionId, tokenId, stat,
audience }`. Kein neues Server→Client-Ereignis.

### D5 — Freigabe-Schalter (`client/session/TokenShare.tsx`, neu)

- `TOKEN_STAT_LABELS: Record<TokenStat, string>` = `hp` → `HP`, `tempHp` → `Temp-HP`, `ac` →
  `RK`, `initiative` → `Initiative`, `conditions` → `Markierungen` — die Beschriftungen aus
  der Schnittstellentabelle (D8); Reihenfolge der Stats wie `TOKEN_STATS`.
- `TokenShareControls({ token, participants, onShare })`: liefert `null`, wenn
  `token.shares === null`. Sonst ein `<fieldset>` mit `<legend>` `<Name> Freigaben` und je
  Stat eine Gruppe: ein Kontrollkästchen „für alle" und je Empfänger eines. `recipients` =
  `participants` mit Rolle `spieler` und `userId !== token.ownerId` (der Besitzer sieht
  ohnehin alles; der Spielleiter ist nie Empfänger — der Server lehnte ihn ab). Anzeigename
  über `displayName` aus `shared/session.ts` (Alias, sonst Nutzername).
- Zustand je Kästchen direkt aus `token.shares[stat]` (kein `useState`): `für alle`
  `checked = audience === 'alle'`; `für <Name>` `checked = Array.isArray(audience) &&
  audience.includes(userId)`, `disabled = audience === 'alle'`.
- Änderung: `für alle` angekreuzt → `onShare(token.id, stat, 'alle')`, abgewählt →
  `onShare(token.id, stat, 'keine')`; `für <Name>` angekreuzt → `onShare(token.id, stat,
  [...liste, userId])` mit `liste` = die Zielgruppe, wenn sie eine Liste ist, sonst `[]`;
  abgewählt → `rest = liste ohne userId`, dann `onShare(token.id, stat, rest.length > 0 ?
  rest : 'keine')`. Die Anzeige springt erst mit dem nächsten Bestand vom Server (§9.1) —
  React setzt ein kontrolliertes Kästchen auf den Prop zurück, genau das ist gewollt.
- Reine React-Komponente ohne Pixi-Import; wird von `TokenRow` (D6) und `PlayerTokenList`
  (D6) gerendert.

### D6 — Token-Verwaltung und Spielerliste

- `TokenPanel` bekommt `onShare(tokenId, stat, audience)`; `TokenRow` rendert
  `TokenShareControls` nach den Wertefeldern. Für den Spielleiter hat jedes Token `shares`
  (Server), also erscheinen die Schalter an jedem Token.
- `PlayerTokenList` bekommt `participants` und `onShare` und rendert je `<li>` nach
  `TokenStatsText` ein `TokenShareControls` — das für fremde Tokens (`shares` `null`) nichts
  rendert. Die Überschrift bleibt `Tokenwerte`; keine Überschrift `Tokens`, keine
  Verwaltungs-Bedienelemente (bestehendes Szenario „Spieler sieht keine Token-Verwaltung").
- `SessionRoom`: `handleTokenShare(tokenId, stat, audience)` → `socket.shareToken(sessionId,
  tokenId, stat, audience)`, `tokenError` wie die übrigen Handler (bei `ok: true` auf
  `null`). `TokenPanel` bekommt `onShare`; `PlayerTokenList` bekommt `participants` und
  `onShare`. Keine lokale Änderung des Bestands (§9.1).

### D7 — Warum `shares !== null` die Schalter steuert

Der Server sendet `shares` genau an Spielleiter und Besitzer — dieselben, die
`session:token-share` senden dürfen (D3). Der Client braucht darum keine zweite Regel; er
zeigt Schalter, wo er Freigaben bekommen hat. Das ist keine Berechtigungsentscheidung im
Client (§9.1/§9.3): drückt jemand die Schalter trotzdem (etwa nach einer entzogenen
Zuweisung, bevor der nächste Bestand ankam), entscheidet der Server und die Raumansicht
zeigt seine Ablehnung (Szenario „Abgelehnte Freigabe zeigt die Meldung").

### D8 — Schnittstelle

Adressen für Test und Implementierung, Layout frei — ergänzt die Tabellen aus #14 D7, #15 D7
und #61 D9, die unverändert gelten:

| Element | Beschriftung / Attribut |
|---|---|
| Gruppe je Token | `<fieldset>` mit `<legend>` genau `<Name> Freigaben` |
| Kästchen „alle" je Stat | `<input type="checkbox" name="share-<stat>-alle">` mit `aria-label` genau `<Name> <Statbeschriftung> für alle`; `checked` = Zielgruppe `alle` |
| Kästchen je Empfänger | `<input type="checkbox" name="share-<stat>-<userId>">` mit `aria-label` genau `<Name> <Statbeschriftung> für <Anzeigename>`; `checked` = `userId` in der Liste; `disabled` = Zielgruppe `alle` |
| Statbeschriftungen | `HP`, `Temp-HP`, `RK`, `Initiative`, `Markierungen` (für `hp`, `tempHp`, `ac`, `initiative`, `conditions`) |
| Empfänger | jedes Mitglied mit Rolle `spieler`, dessen `userId` nicht der `ownerId` des Tokens ist — unter seinem Anzeigenamen (Alias, sonst Nutzername) |
| Meldung abgelehnter Freigaben | unverändert `<p role="alert">` in der Raumansicht |

`<stat>` im `name`-Attribut ist der Drahtwert (`hp`, `tempHp`, …); Tests adressieren über
Rolle `checkbox` und zugänglichen Namen, nicht über `name`.

### D9 — Testaufbau

- **Socket-Szenarien** wie in #61 D11 (echte Socket.IO-Clients, Aufbau über Routen und
  direkte DB-Anlage). Der Helfer zum direkten Anlegen eines Tokens bekommt optionale
  Zielgruppen (je Stat `'alle'` oder eine Liste von `userId`s, angelegt als
  `TokenShare`-Zeilen mit `userId` `null` bzw. je Empfänger). DB-Aussagen „für `<Token>` und
  `<stat>` ist die Zielgruppe `alle` gespeichert" = genau eine `TokenShare`-Zeile mit diesem
  `tokenId`, `stat` und `userId` `null`; „genau `tom` als Empfänger" = genau eine Zeile mit
  `userId` von `tom`; „keine Zielgruppe" = keine Zeile für dieses Paar. Mehrelementige
  Listen in Acks aufsteigend nach `userId` (D3) — beim Vergleich sortieren oder mit
  `arrayContaining` und Länge prüfen. „erhält kein `session:tokens`" wie bisher als kurze
  Wartezeit ohne Ereignis. Drei Verbindungen (Spielleiter, `sam`, `tom`) dort, wo das
  Szenario drei nennt.
- **Komponententests**: Fixtures `GOBLIN`/`ORK` bekommen `shares` — `null` als Grundwert (die
  Spielleiter-Szenarien, die Schalter prüfen, spreaden `shares: NO_SHARES` bzw. ein Objekt
  mit Listen). Socket-Fassaden-Mock um ein aufzeichnendes `shareToken` erweitern (Standard:
  `{ ok: true, token }`). Elemente nach D8 über `getByRole('checkbox', { name })` (genauer
  Name), `queryByRole` für „existiert nicht", Änderung per Klick auf das Kästchen; `checked`
  und `disabled` über die DOM-Eigenschaften. „kein Kontrollkästchen, dessen Name mit `Ork`
  beginnt" über `queryAllByRole('checkbox', { name: /^Ork/ })` mit Länge `0`. Keine
  `must()`-Helfer mit Kurzmeldung — die DOM-Ausgabe der Testing Library ist das
  Gate-Feedback des implementers.
- Teilnehmer-Fixtures: `sam` mit Alias `Gandalf` (Anzeigename ist der Alias), `tom` ohne
  Alias (Anzeigename `tom`), `meister` als Spielleiter — keine Anzeigenamen, die Teilstring
  eines anderen sind.
- Kein Test importiert `pixi.js`; das Aussehen der Schalter nimmt der App-Test ab.

## Risks / Trade-offs

- **Ein Sendepfad umgeht `redactToken`** → alle bestehenden Pfade laufen über
  `loadTokensFor`/`broadcastTokens`/`redactToken`; der einzige neue Pfad ist das Ack von
  `session:token-share`, und das wird für den Absender gefiltert.
- **`shares` verrät einem Spieler die Empfängerliste eines fremden Tokens** → `redactToken`
  setzt `shares: null` für jeden, der weder Spielleiter noch Besitzer ist (Szenario
  „Freigaben sehen nur Spielleiter und Besitzer").
- **Zwei `alle`-Zeilen durch Race zweier Schreiber** → jeder Schreibpfad läuft in einer
  Transaktion (Löschen + Anlegen); SQLite serialisiert Schreibtransaktionen. Sollte es
  dennoch vorkommen, liest `toToken` „`alle` gewinnt" und das nächste Ersetzen räumt auf.
- **Ein Empfänger verliert seine Mitgliedschaft** → es gibt kein Verlassen; würde es kommen,
  bekommt er über `broadcastTokens` (Mitgliedschaft jetzt) und `authorizeAction` nichts
  mehr, unabhängig von den Zeilen.
- **`createMany` mit leerem `data`** → Prisma akzeptiert es (Ergebnis `count: 0`); sollte es
  in der Praxis werfen, den `createMany`-Schritt bei `'keine'` weglassen — gleiches
  Verhalten, weiterhin eine Transaktion.
- **Kästchen-Name kollidiert mit dem Wertefeld** (`Goblin HP` vs. `Goblin HP für alle`) →
  andere Rolle (`spinbutton` vs. `checkbox`) und exakter Name; keine Kollision.
- **Leak-Wächter** → keine Testdatei genannt; keine Code-Zeile, die ein Test wörtlich
  enthalten könnte (Aufrufe als Prosa beschrieben).

## Migration Plan

`prisma/schema.prisma` bekommt das Modell `TokenShare` und die zwei Gegenrelationen; die
Migrations-SQL legt eine Tabelle mit zwei Fremdschlüsseln und drei Indizes an, fasst nichts
Bestehendes an (D1). Agent nur gegen die Wegwerf-DB; Entwicklungs-DB der Mensch, produktiv
die CI (§5.1, §6.1). Rollback: die Tabelle ist neu, kein Code außerhalb dieses Change liest
sie.

## Open Questions

Keine, die Spec, Ansatz oder Tasks ändern würden. Die Spielleiter-Sperre (Lesart B aus der
Explore-Runde) ist bewusst ausgeklammert und wäre ein eigener Change mit einer eigenen
Regel in `canShareToken`.
