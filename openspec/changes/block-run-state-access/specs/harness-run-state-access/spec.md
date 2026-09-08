## Purpose

Beschreibt, wer den ungefilterten Run-State eines Laufs (`.harness/runs/<issue>/`) erreichen
darf und über welche Wege der Zugriff geschlossen ist.

Der Run-State ist die Rohform dessen, was der Orchestrator gefiltert weiterreicht: die
vollständige Gate-Ausgabe mit Codeframes und Testpfaden, die geparsten Failures, die geänderten
Dateien jeder Runde, die Review-Findings mit ihren Fundstellen. `constitution.md` §8.2 G4 hält
diese Rohform bewusst bei ihm — die Rollen bekommen den kompakten, geprüften Auszug. Eine Rolle,
die sich die Quelle selbst holen kann, umgeht damit jede Filterung auf einmal: §2.2 (der
implementer sieht Testdateien nicht) und §2.1 (jede Rolle arbeitet an ihrem eigenen Artefakt).

Diese Capability ist die Mechanik dazu und unterliegt §8.1: sie liegt im Guard, nicht im
Ermessen eines Modells.

## ADDED Requirements

### Requirement: Der Run-State ist für jede geltende Rolle gesperrt

Solange für einen Werkzeugaufruf eine Rolle gilt, MUST der Guard jeden Zugriff auf
`.harness/runs/` ablehnen — unabhängig davon, welche Rolle es ist und auf welchem der drei Wege
adressiert wird: über einen Dateipfad, über eine Kommandozeile oder über Suchwurzel, Dateifilter
und Muster eines Suchwerkzeugs.

Die Sperre MUST für **jede** Rolle gelten, nicht nur für die schreibenden. Der reviewer fände
dort die Urteile der vorherigen Runden, die sein eigenes vorprägen; der test-author fände die
Implementierung, gegen die er seine Tests gerade nicht korrigieren soll. Eine Regel mit
Ausnahmeliste wäre zudem schwerer zu prüfen als eine ohne — dieselbe Begründung wie beim
Steuerdatei- und Worktree-Tabu.

Die Ablehnung MUST den Run-State als Grund benennen. Eine Sperre, die zufällig aus einem anderen
Grund greift, ist keine: sie fällt mit der Regel, die sie zufällig getragen hat, und wer die
Meldung liest, sucht den Fehler an der falschen Stelle.

Der Zugriff MUST unabhängig von der Schreibweise des Pfades erkannt werden: mit den Trennzeichen
des Betriebssystems oder mit Forward-Slashes, und in beiden Formen, in denen der Weg zum
Run-State geschrieben wird — vom Wurzelverzeichnis des Repos aus und **relativ aus einem
Worktree heraus**. Die zweite Form kommt ohne den Namen des Harness-Verzeichnisses aus; sie ist
keine Verschleierung, sondern die natürliche Schreibweise am Arbeitsort der Rollen.

#### Scenario: Ein Dateizugriff auf den Run-State wird abgelehnt

- **GIVEN** für einen Werkzeugaufruf gilt eine Rolle — gleich welche
- **WHEN** der Aufruf eine Datei des Run-State über ihren Dateipfad adressiert
- **THEN** wird er abgelehnt, und die Meldung benennt den Run-State als Grund

#### Scenario: Ein Kommando, das den Run-State nennt, wird abgelehnt

- **GIVEN** für einen Werkzeugaufruf gilt eine Rolle — gleich welche
- **WHEN** eine Kommandozeile eine Datei des Run-State nennt, auch in Anführungszeichen oder
  hinter einem Verzeichniswechsel
- **THEN** wird sie abgelehnt, und die Meldung benennt den Run-State als Grund — auch für eine
  Datei, deren Name zufällig auf eine andere Sperre passt

#### Scenario: Ein Suchwerkzeug auf den Run-State wird abgelehnt

- **GIVEN** für einen Werkzeugaufruf gilt eine Rolle — gleich welche
- **WHEN** ein Suchwerkzeug den Run-State als Suchwurzel, als Dateifilter oder als Pfadmuster
  angibt
- **THEN** wird der Aufruf abgelehnt, und die Meldung benennt den Run-State als Grund

### Requirement: Der Rollenmarker bleibt lesbar

Der Guard MUST `.harness/runs/<issue>/active-role` vom Leseverbot ausnehmen, wenn er über einen
Dateipfad adressiert wird.

`constitution.md` §8.3 verlangt, dass die Sitzung vor jedem Rollenwechsel den Marker prüft,
**bevor** irgendein Werkzeugaufruf für den anstehenden Schritt erfolgt. Zu diesem Zeitpunkt
trägt der Marker noch die Rolle des vorigen Schritts, und diese Rolle gilt über den Fallback
auch für die Sitzung selbst: eine pauschale Sperre blockte genau die Prüfung, die den
Rollenfehler auffangen soll. Der Marker trägt ein Wort aus einer festen Rollenmenge und kann
nichts preisgeben.

Die Ausnahme MUST NOT das Schreiben umfassen. Wer den Marker setzen kann, schaltet die Sperre
ab, unter der er steht.

Die Ausnahme und ihre Gegensicherung MUST dieselbe Reichweite haben: beide gelten für **beide**
Schreibungen des Weges aus dem vorigen Requirement. Eine Ausnahme, die eine Schreibung kennt,
die ihre Gegensicherung nicht kennt, öffnet in dieser Schreibung genau das, was sie
ausdrücklich ausschließt.

#### Scenario: Die Prüfung des Rollenmarkers bleibt möglich

- **GIVEN** ein Lauf, dessen Rollenmarker eine Rolle trägt
- **WHEN** der Marker über seinen Dateipfad gelesen wird
- **THEN** wird der Aufruf nicht abgelehnt

#### Scenario: Die Ausnahme gilt nur dem Lesen

- **GIVEN** ein Lauf, dessen Rollenmarker eine Rolle trägt
- **WHEN** der Marker über seinen Dateipfad geschrieben oder über eine Kommandozeile angefasst
  werden soll
- **THEN** wird der Aufruf abgelehnt

### Requirement: Ohne geltende Rolle bleibt der Run-State erreichbar

Gilt für einen Werkzeugaufruf keine Rolle, MUST der Run-State erreichbar bleiben. Die
orchestrierende Sitzung arbeitet mit ihm — in den rollenlosen Phasen und während einer Pause
liegen dort die Eskalationszusammenfassung und der Zustand, den der Mensch einsehen muss.

#### Scenario: Ein rollenloser Aufruf erreicht den Run-State

- **GIVEN** für einen Werkzeugaufruf gilt keine Rolle
- **WHEN** er eine Datei des Run-State liest — über den Dateipfad, über eine Kommandozeile oder
  über ein Suchwerkzeug
- **THEN** wird er nicht abgelehnt
