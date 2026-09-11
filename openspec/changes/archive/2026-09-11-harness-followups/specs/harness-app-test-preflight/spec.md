## ADDED Requirements

### Requirement: Belegte App-Ports werden vor dem App-Test und beim Aufräumen genannt

Wenn der Harness den App-Test ankündigt (`present-app-review`) und wenn er nach dem Merge
aufräumt (`cleanup`), MUST er prüfen, ob die Ports der App (3001 für den Server, 5173 für
Vite) belegt sind, und je belegtem Port die PID und die Kommandozeile des haltenden Prozesses
auf stderr nennen. Die Prüfung MUST auf Windows (`netstat`, `Get-CimInstance`) und auf
POSIX-Systemen (`ss`, `ps`) funktionieren.

Die Warnung ist Beiwerk: sie MUST NOT den Automaten bewegen, blockieren oder den Prozess
beenden — Beenden ist Menschensache (`constitution.md` §5.1). Ein fehlendes oder
scheiterndes Werkzeug MUST eine Hinweiszeile ergeben, keinen Abbruch.

#### Scenario: Ein belegter Port wird bei der Ankündigung des App-Tests genannt

- **GIVEN** ein Lauf, dessen Review „ok" ergab, und Port 3001 wird von einem Prozess gehalten
- **WHEN** der Harness den nächsten Schritt bestimmt
- **THEN** emittiert er `present-app-review` wie bisher, und auf stderr steht eine Zeile mit
  Port 3001, der PID und der Kommandozeile des Prozesses

#### Scenario: Ein belegter Port wird beim Aufräumen genannt

- **GIVEN** ein archivierter Lauf, und Port 5173 wird von einem Prozess gehalten
- **WHEN** der Harness aufräumt
- **THEN** räumt er auf wie bisher, und auf stderr steht eine Zeile mit Port 5173, PID und
  Kommandozeile

#### Scenario: Unter Windows werden netstat und Get-CimInstance gelesen

- **GIVEN** `netstat -ano` zeigt eine horchende Zeile für Port 3001 mit PID 20448, und
  `Get-CimInstance` liefert dazu die Kommandozeile
- **WHEN** der Harness die belegten Ports für die Plattform `win32` bestimmt
- **THEN** meldet er Port 3001 mit PID 20448 und dieser Kommandozeile, und keine anderen Ports

#### Scenario: Unter POSIX werden ss und ps gelesen

- **GIVEN** `ss -ltnp` zeigt eine horchende Zeile für Port 5173 mit `pid=4242`, und `ps`
  liefert dazu die Kommandozeile
- **WHEN** der Harness die belegten Ports für die Plattform `linux` bestimmt
- **THEN** meldet er Port 5173 mit PID 4242 und dieser Kommandozeile

#### Scenario: Ein fehlendes Werkzeug ergibt einen Hinweis, keinen Abbruch

- **GIVEN** das Port-Werkzeug der Plattform ist nicht aufrufbar
- **WHEN** der Harness den App-Test ankündigt
- **THEN** emittiert er `present-app-review`, und auf stderr steht ein Hinweis, dass die
  Portprüfung nicht möglich war
