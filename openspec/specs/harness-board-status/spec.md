# harness-board-status Specification

## Purpose
Beschreibt, wann der Harness den Status eines Issues auf dem Projekt-Board setzt, worauf sein
Schreibzugriff dabei begrenzt ist und wie er sich verhält, wenn das Board nicht erreichbar
ist. Das Board ist die einzige Stelle, an der der Fortschritt eines Laufs auch außerhalb der
laufenden Sitzung sichtbar wird (`constitution.md` §7.4) — und zugleich ein Schreibzugriff
nach außen, der den Lauf niemals anhalten darf.

## Requirements

### Requirement: Der Board-Status folgt dem Schritt, nicht dem Ergebnis

Der Harness MUST den Status eines Issues auf dem Projekt-Board zu **Beginn** des jeweiligen
Schritts setzen, nicht nach dessen Abschluss. Ein Board, das erst nach getaner Arbeit
weiterschaltet, zeigt jeden laufenden Schritt als den vorherigen an und wäre damit genau dann
falsch, wenn jemand hinschaut.

Der Status ist eine Projektion des Laufzustands, niemals dessen Quelle: der Harness MUST
seine Entscheidungen weiterhin ausschließlich aus dem eigenen Run-State ableiten und MUST NOT
den Board-Zustand lesen, um daraus einen Schritt abzuleiten.

#### Scenario: Beginn der Spezifikation setzt „Spec"

- **GIVEN** für ein Issue existiert noch kein Run-Verzeichnis, weil die Spezifikation vor dem
  Start des Loops entsteht
- **WHEN** die Sitzung den Statuswechsel auf „Spec" für dieses Issue anfordert
- **THEN** wird „Spec" gesetzt, ohne dass ein Run-State gelesen oder angelegt werden muss

#### Scenario: Bestätigtes Rot setzt „Test rot"

- **GIVEN** die Tests eines Change sind geschrieben
- **WHEN** der Harness den Testlauf als rot aus dem richtigen Grund bestätigt
- **THEN** wird „Test rot" gesetzt

#### Scenario: Rot aus dem falschen Grund schaltet das Board nicht weiter

- **GIVEN** die Tests eines Change sind geschrieben
- **WHEN** der Testlauf an einem Setup- oder Compile-Fehler scheitert und der Harness das Rot
  deshalb nicht bestätigt (`constitution.md` §3.1)
- **THEN** bleibt der Board-Status unverändert

#### Scenario: Jeder Einstieg in einen Implementierungsschritt setzt „Implementierung"

- **GIVEN** ein Lauf steht vor einem Implementierungsschritt — sei es der erste Versuch nach
  bestätigtem Rot oder eine Nacharbeit-Runde nach rotem Gate, Reviewer-Befund oder abgelehntem
  App-Test
- **WHEN** der Harness den Implementierungsschritt eröffnet
- **THEN** wird „Implementierung" gesetzt, unabhängig davon, über welchen dieser Wege der
  Schritt erreicht wurde

#### Scenario: Der Gate-Start setzt „Gate + Review"

- **GIVEN** ein Implementierungsschritt ist abgeschlossen
- **WHEN** der Harness das Gate startet
- **THEN** wird „Gate + Review" gesetzt, bevor Typecheck, Lint und Testlauf beginnen — und
  nicht erst, wenn der Reviewer an der Reihe ist

#### Scenario: Die Ankündigung des App-Tests setzt „App-Test (Mensch)"

- **GIVEN** der Reviewer hat „ok" empfohlen
- **WHEN** der Harness den menschlichen App-Test ankündigt
- **THEN** wird „App-Test (Mensch)" gesetzt

#### Scenario: Aufräumen nach dem Merge setzt „Fertig"

- **GIVEN** ein Lauf ist archiviert, der PR gemergt und das zugehörige Issue dadurch
  geschlossen
- **WHEN** der Harness den Worktree des Laufs aufräumt
- **THEN** wird „Fertig" gesetzt

#### Scenario: Aufräumen bei noch offenem Issue setzt „Fertig" nicht

- **GIVEN** ein Lauf ist archiviert, das zugehörige Issue aber noch offen — der PR ist nicht
  gemergt
- **WHEN** der Harness den Worktree des Laufs aufräumt
- **THEN** bleibt der Board-Status unverändert, und das Aufräumen selbst läuft trotzdem durch

### Requirement: Der Schreibzugriff bleibt auf das Statusfeld begrenzt

Der Board-Zugriff läuft ohne menschliche Rückfrage (`constitution.md` §5.3). Die Grenze dieses
Zugriffs MUST deshalb im Code liegen und nicht in einer Absichtserklärung (§8.1): der Harness
MUST ausschließlich das Statusfeld eines **bereits vorhandenen** Items des laufenden Issues im
dafür vorgesehenen Projekt schreiben. Er MUST NOT Items anlegen oder entfernen, ein anderes
Feld schreiben oder ein anderes Projekt ansprechen.

Der Status MUST aus einer festen, im Code hinterlegten Menge stammen. Ein unbekanntes
Statuswort MUST NOT zu einem Schreibzugriff führen — sonst wäre die Menge der erreichbaren
Feldwerte durch den Aufrufer bestimmt statt durch den Harness.

#### Scenario: Ein Statuswechsel schreibt nur das Statusfeld

- **GIVEN** ein Issue mit einem vorhandenen Item auf dem Projekt-Board
- **WHEN** der Harness dessen Status setzt
- **THEN** enthält der Zugriff genau einen schreibenden Aufruf, der das Statusfeld dieses Items
  auf die zum Status gehörende Option setzt — mit der fest hinterlegten Projekt- und Feld-ID,
  ohne Anlegen eines Items und ohne weiteres Feld

#### Scenario: Ein unbekanntes Statuswort führt zu keinem Schreibzugriff

- **GIVEN** ein Statuswort, das in der hinterlegten Menge nicht vorkommt
- **WHEN** ein Statuswechsel damit angefordert wird
- **THEN** erfolgt kein Zugriff auf das Board, und der Harness meldet das unbekannte Statuswort

### Requirement: Ein fehlgeschlagener Board-Zugriff hält den Lauf nicht an

Der Statuswechsel ist Beiwerk, keine Invariante des Loops. Ein nicht erreichbares Board, ein
abgelaufenes Token, ein fehlender Berechtigungsbereich oder ein fehlendes Item MUST NOT den
Lauf anhalten, den Exit-Code verändern, die emittierte Aktion beeinflussen oder den Run-State
verändern.

Ein Fehlschlag MUST dennoch sichtbar sein — auf der Fehlerausgabe **und** dauerhaft im
Run-Verzeichnis. Ein stumm gestorbenes Board ist schlechter als gar keins: man vertraut dann
einem Stand, der seit mehreren Schritten falsch ist.

Der Board-Zugriff MUST abschaltbar sein, ohne dass der Loop sich anders verhält.

#### Scenario: Ein fehlgeschlagener Zugriff wird gemeldet und protokolliert

- **GIVEN** der Board-Zugriff scheitert — etwa weil das Token abgelaufen oder das Board nicht
  erreichbar ist
- **WHEN** der Harness einen Status setzen will
- **THEN** wirft er nicht, meldet den Fehlschlag auf der Fehlerausgabe und hält ihn im
  Run-Verzeichnis des Issues fest

#### Scenario: Ein fehlendes Item wird gemeldet, ohne Schreibversuch

- **GIVEN** das Issue hat kein Item im Projekt
- **WHEN** der Harness dessen Status setzen will
- **THEN** unterbleibt der schreibende Aufruf, der Fehlschlag wird gemeldet und protokolliert,
  und der Lauf geht weiter

#### Scenario: Der Zustandsautomat verhält sich mit und ohne Board identisch

- **GIVEN** derselbe Run-State, einmal mit abgeschaltetem Board-Zugriff und einmal mit einem
  scheiternden
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** liefert er in beiden Fällen dieselbe Aktion, denselben Rollenmarker und denselben
  Run-State
