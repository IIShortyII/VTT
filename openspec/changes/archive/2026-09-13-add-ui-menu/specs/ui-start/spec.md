## MODIFIED Requirements

### Requirement: Stylesheet der Startansicht

Das Stylesheet SHALL für jeden Start-Selektor außer `.start-account` (entfallen mit dem
Kontomenü von `ui-menu`; kein Selektor dieses Namens mehr) eine Regel enthalten und dabei den
Format-Vertrag von `ui-theme` einhalten (kein Farbwert außerhalb des Tokenblocks, kein
`@media` außer der Bewegungsabfrage, keine weiteren `@import`-Zeilen).

#### Scenario: Start-Selektoren vorhanden

- **GIVEN** das Stylesheet ohne Kommentare, Whitespace normalisiert
- **WHEN** nach jedem Start-Selektor gesucht wird
- **THEN** ist jeder der elf Start-Selektoren außer `.start-account` vorhanden, und `.start-account`
  ist nicht vorhanden
