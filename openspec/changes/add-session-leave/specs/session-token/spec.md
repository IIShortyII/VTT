## ADDED Requirements

### Requirement: Bereinigung der Tokens beim Verlassen

Verlässt ein Spieler eine Spielsitzung oder wird er vom Spielleiter entfernt (Requirement
„Verlassen einer Spielsitzung und Entfernen eines Spielers" in `game-session`), SHALL der
Server in derselben Transaktion die Tokens dieser Spielsitzung bereinigen.

Jedes Token dieser Spielsitzung, dessen Besitzer (`ownerId`) die `userId` des Betroffenen
ist, SHALL `ownerId: null` erhalten („gehört dem Spielleiter"); die Tokens anderer Besitzer
und ohne Besitzer bleiben unberührt, kein Token wird gelöscht.

In jeder Zielgruppe eines Stats (`hp`, `tempHp`, `ac`, `initiative`, `conditions`) jedes
Tokens dieser Spielsitzung, die als **Liste** vorliegt und die `userId` des Betroffenen
nennt, SHALL diese `userId` entfernt werden; die übrigen genannten `userId`s bleiben
erhalten. Wird eine Liste dadurch leer, SHALL die Zielgruppe `keine` werden (eine Liste ist
nie leer). Eine Zielgruppe `keine` oder `alle` bleibt unverändert.

#### Scenario: Token des Betroffenen verliert den Besitzer

- **GIVEN** eine Spielsitzung im Zustand `geoeffnet` mit einer aktiven Karte, einem Token
  `Ork` mit dem Spieler-Mitglied `sam` als Besitzer und einem Token `Goblin` mit dem
  Spieler-Mitglied `tom` als Besitzer
- **WHEN** `sam` die Spielsitzung über `DELETE /api/sessions/:id/members/:userId` mit seiner
  eigenen `userId` verlässt
- **THEN** trägt `Ork` in der Datenbank `ownerId: null`, `Goblin` trägt weiterhin die
  `userId` von `tom` als `ownerId`, und beide Tokens existieren weiterhin

#### Scenario: userId verlässt die listenwertige Zielgruppe

- **GIVEN** eine Spielsitzung mit einer aktiven Karte und einem Token `Ork`, dessen
  `hp`-Zielgruppe die Liste der `userId`s von `sam` und `tom` ist und dessen `ac`-Zielgruppe
  `alle` ist
- **WHEN** `sam` die Spielsitzung verlässt
- **THEN** ist die `hp`-Zielgruppe von `Ork` die Liste, die nur noch die `userId` von `tom`
  nennt, und die `ac`-Zielgruppe ist weiterhin `alle`

#### Scenario: Letzter Eintrag einer Zielgruppe wird zu keine

- **GIVEN** eine Spielsitzung mit einer aktiven Karte und einem Token `Ork`, dessen
  `initiative`-Zielgruppe die Liste ist, die allein die `userId` von `sam` nennt
- **WHEN** `sam` die Spielsitzung verlässt
- **THEN** ist die `initiative`-Zielgruppe von `Ork` `keine`
