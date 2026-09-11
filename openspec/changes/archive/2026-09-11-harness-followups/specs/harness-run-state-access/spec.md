## ADDED Requirements

### Requirement: Rollen-Antworten erreichen den Run-State nur über stdin

`record-round-summary` und `record-review` MUST das JSON der Rolle ausschließlich über stdin
(`-`) entgegennehmen. Ein anderes JSON-Argument MUST mit einem Hinweis abgebrochen werden,
der den Grund nennt: pnpm reicht Argumente unter Windows durch cmd.exe, dessen Parser an
Klammern und Semikolons bricht und Umlaute verstümmelt — eine Antwort käme je nach Inhalt
verstümmelt oder gar nicht an, und der Fehler läge scheinbar bei der Rolle.

#### Scenario: Ein JSON-Argument statt stdin wird abgelehnt

- **GIVEN** eine Rollen-Antwort als Argument statt als `-`
- **WHEN** der Harness sie entgegennimmt
- **THEN** bricht er ab, ohne den Run-State zu verändern, und der Hinweis nennt `-` als
  einzigen Weg
