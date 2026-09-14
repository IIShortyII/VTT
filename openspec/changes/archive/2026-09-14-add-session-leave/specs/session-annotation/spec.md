## ADDED Requirements

### Requirement: Bereinigung der Anmerkungen beim Verlassen

Verlässt ein Spieler eine Spielsitzung oder wird er vom Spielleiter entfernt (Requirement
„Verlassen einer Spielsitzung und Entfernen eines Spielers" in `game-session`), SHALL der
Server in derselben Transaktion seine Anmerkungen in allen Karteninstanzen dieser
Spielsitzung bereinigen: eine **geteilte** Anmerkung des Betroffenen SHALL erhalten bleiben,
ihr Urheber SHALL `null` werden; eine **private** Anmerkung des Betroffenen SHALL gelöscht
werden. Anmerkungen anderer Mitglieder bleiben in Urheber, Sichtbarkeit und Bestand
unberührt.

#### Scenario: Geteilte Anmerkung bleibt mit Urheber null

- **GIVEN** eine Spielsitzung mit einer Karteninstanz, auf der eine geteilte Anmerkung des
  Spieler-Mitglieds `sam` und eine geteilte Anmerkung des Spieler-Mitglieds `tom` liegen
- **WHEN** `sam` die Spielsitzung über `DELETE /api/sessions/:id/members/:userId` mit seiner
  eigenen `userId` verlässt
- **THEN** existiert die Anmerkung von `sam` in der Datenbank weiterhin, und ihr Urheber ist
  `null`; die Anmerkung von `tom` trägt weiterhin `tom` als Urheber

#### Scenario: Private Anmerkung wird gelöscht

- **GIVEN** eine Spielsitzung mit einer Karteninstanz, auf der eine private Anmerkung des
  Spieler-Mitglieds `sam` liegt
- **WHEN** `sam` die Spielsitzung verlässt
- **THEN** existiert diese Anmerkung in der Datenbank nicht mehr
