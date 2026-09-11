## Why

Seit #61 sieht der Spielleiter alle Werte, ein Spieler nur die seines eigenen Tokens — eine
feste Regel. Am Tisch ist das zu starr: die Gruppe will die Trefferpunkte des verletzten
Kämpfers sehen, der Schurke seine Rüstungsklasse nur dem Kleriker zeigen, und der
Spielleiter will die Initiative eines NPC für alle sichtbar machen. Dieser Change ist Teil 2
von Epic #10 (Issue #62): wer welchen Wert eines Tokens sieht, entscheiden Besitzer und
Spielleiter — je Token, je Stat, je Spieler. Die Filterung bleibt, wo sie seit #61 ist: auf
dem Server, pro Empfänger, vor dem Senden (`constitution.md` §9.2); sie bekommt nur eine
zweite Datenquelle neben der Zuweisung.

Entscheidungen aus der Explore-Runde mit dem Menschen (2026-09-11, im Issue festgehalten):
je (Token, Stat) genau eine Zielgruppe `keine`, `alle` oder eine Liste von Spielern; Stats
sind `hp` (aktuell + Maximum zusammen), `tempHp`, `ac`, `initiative`, `conditions` (die ganze
Liste); Ausgangszustand nichts geteilt; der Besitzer sieht immer alles (Regel, kein Eintrag);
Zuweisen/Entziehen lässt Zielgruppen stehen; Besitzer **oder** Spielleiter setzen die
Zielgruppe eines Spielertokens, letzter Schreiber gewinnt, keine Sperre; NPC-Tokens (ohne
Besitzer) teilt nur der Spielleiter; gültige Einzelempfänger sind Mitglieder mit Rolle
`spieler`; „Alle" ist ein eigener Wert, damit spätere Beitretende abgedeckt sind; „Keine"
leert die Auswahl; ein Event `session:token-share`, das die Zielgruppe als Ganzes ersetzt;
Änderungen wirken sofort über den nächsten gefilterten Bestand.

## What Changes

- **Zielgruppen am Token.** Neue Tabelle `TokenShare`: je Zeile ein Token, ein Stat und ein
  Empfänger (`userId`) oder der Sonderfall „alle" (`userId` `null`). `keine` ist die
  Abwesenheit von Zeilen. Die Tokendarstellung trägt `shares` — die fünf Zielgruppen als
  Objekt — für Spielleiter und Besitzer, für jeden anderen Empfänger `null`.
- **Zielgruppe setzen — Besitzer oder Spielleiter.** Neues Socket-Ereignis
  `session:token-share` `{ sessionId, tokenId, stat, audience }` mit `audience` `'keine'`,
  `'alle'` oder einer nicht-leeren Liste eindeutiger `userId`s. Serverregeln: jede
  Mitgliedschaft darf senden, danach Berechtigung gegen die **jetzt** gespeicherte Zuweisung
  (Spielleiter oder Besitzer — dieselbe Regel wie beim Bewegen); jede `userId` der Liste muss
  ein Mitglied mit Rolle `spieler` sein; Ersetzen der Zielgruppe in einer Transaktion; kein
  Sperrmechanismus.
- **Sichtbarkeit pro Empfänger und Stat.** Die Filterregel aus #61 wird erweitert: ein Stat
  ist sichtbar für Spielleiter, Besitzer, bei Zielgruppe `alle` und für jede `userId` in der
  Liste. `hp`/`hpMax` hängen an der Zielgruppe `hp`, `conditions` an `conditions`. Verborgene
  Werte kommen weiterhin als `null` bzw. leere Liste. `shares` verlässt den Server nur zu
  Spielleiter und Besitzer.
- **Raumansicht.** Je Token mit `shares` und je Stat Kontrollkästchen `<Name> <Stat> für alle`
  und `<Name> <Stat> für <Anzeigename>` für jedes Spieler-Mitglied außer dem Besitzer — in
  der Token-Verwaltung des Spielleiters für jedes Token, in der Spielerliste `Tokenwerte` für
  die eigenen Tokens. Der Zustand folgt dem Server; jedes Ankreuzen/Abwählen sendet genau ein
  `session:token-share`. Abgelehnte Freigaben erscheinen wie jede andere abgelehnte
  Token-Aktion als Meldung.

**Nicht im Umfang:** eine Spielleiter-Sperre gegen das Teilen durch den Besitzer (dritter
Zustand, eigener Change); Teilen je einzelner Markierung; Teilen von `hp` und `hpMax`
getrennt; Sichtbarkeit auf der Karte anders als in der Liste (die Healthbar folgt wie bisher
den gefilterten Werten); Fog-Filterung (#17).

## Capabilities

### New Capabilities

- Keine.

### Modified Capabilities

- `session-token`: neues Requirement „Zielgruppe eines Tokenwerts setzen" (Ereignis, Regeln,
  Berechtigung, Ersetzen, Verhalten bei Zuweisung, Entfernen, Anlegen). Requirement
  „Sichtbarkeit der Tokenwerte" — Regel um die Zielgruppen erweitert, `shares` in der
  Tokendarstellung, ein bestehendes Szenario um `shares` `null` ergänzt, drei neue Szenarien.
  Requirement „Tokenansicht im Raum" — Freigabe-Schalter für Spielleiter und Besitzer, neun
  neue Szenarien; die bestehenden 22 bleiben unverändert.

## Impact

**Schema** (`prisma/schema.prisma`): neues Modell `TokenShare` (`tokenId`, `stat`, `userId`
nullable, `@@unique([tokenId, stat, userId])`, `onDelete: Cascade` an Token und User);
Gegenrelationen `Token.shares` und `User.tokenShares`. Migration legt nur eine Tabelle mit
Fremdschlüsseln und Indizes an — bestehende Tokens haben keine Zeilen und damit die
Zielgruppe `keine` für jeden Stat. Nur gegen die Wegwerf-DB (§5.1, §6.1).

**Geänderter Code:**
- `src/shared/token.ts` — `TOKEN_STATS`, `TokenStatSchema`, `TokenAudienceSchema`,
  `TokenSharesSchema`, `NO_SHARES`; `TokenSchema.shares` (nullable); `ShareTokenInputSchema`,
  `ShareTokenAck`; Ereignisname `share`; Regel `canShareToken`
- `src/server/session/tokens.ts` — `TOKEN_INCLUDE` um die Zielgruppen; `toToken` baut
  `shares`; `isStatVisible` und `redactToken` mit Zielgruppen und `shares`-Filterung;
  Handler `session:token-share`
- `src/client/session/socket.ts` — `shareToken`
- `src/client/session/TokenShare.tsx` (neu) — Freigabe-Schalter als Komponente, Beschriftungen
  der Stats
- `src/client/session/TokenPanel.tsx` — Prop `onShare`, Schalter je Zeile
- `src/client/session/TokenStats.tsx` — `PlayerTokenList` mit `participants` und `onShare`,
  Schalter je eigenem Token
- `src/client/session/SessionRoom.tsx` — Handler für das Teilen, Props durchreichen

**Bestehende Tests:** kein Szenario ändert seine Aussage. Fixtures vom Typ `Token`
(`GOBLIN`/`ORK` in der Token-UI-Suite und alle Stellen, die eine Tokendarstellung
vollständig vergleichen) brauchen das neue Feld `shares`, weil `TokenSchema` es verlangt —
`null` genügt überall dort, wo keine Freigabe-Schalter geprüft werden. Das Szenario „Spieler
erhält von fremden Tokens keine Werte" wird um `shares` `null` erweitert. Alle übrigen
Szenarien von `session-token`, `session-map` und `game-session` bleiben unverändert grün.

**Dependencies:** keine neuen.
