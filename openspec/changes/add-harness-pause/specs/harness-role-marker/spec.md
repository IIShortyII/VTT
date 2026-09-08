## Purpose

Beschreibt, wann ein Lauf eine Rolle beansprucht, wie er sie für einen Eingriff außerhalb der
Rollen freigibt und wieder aufnimmt, und woran ein Aufruf erkennt, welche Rolle für ihn gilt.
Der Rollenmarker ist die einzige Stelle, an der `guard.ts` zur Laufzeit entscheidet, was ein
Werkzeugaufruf darf — er ist damit sowohl die Durchsetzung der Rollentrennung
(`constitution.md` §2) als auch ihr einziger Angriffspunkt.

## ADDED Requirements

### Requirement: Ein Lauf lässt sich für einen Eingriff außerhalb der Rollen pausieren

Der Harness MUST ein Verb anbieten, das den Rollenmarker eines Laufs auf `none` setzt, ohne
Phase oder Rundenzähler zu verändern. Ein Eingriff, der keiner Rolle gehört — eine kaputte
Werkzeugkonfiguration, ein Befund ohne Rollenzuordnung nach `constitution.md` §3.3 — MUST
dadurch möglich sein, ohne dass jemand den Marker von Hand schreibt.

Der Anlass der Pause MUST angegeben werden und MUST im Run-State festgehalten werden. Eine
Pause ohne festgehaltenen Anlass MUST NOT zustande kommen: sie wäre dieselbe undokumentierte
Handkorrektur wie bisher, nur mit einem Verb davor.

#### Scenario: Pausieren gibt den Rollenmarker frei

- **GIVEN** ein Lauf steht in einer Phase, deren Rollenmarker auf einer Rolle steht
- **WHEN** der Lauf mit einem Grund pausiert wird
- **THEN** steht der Rollenmarker auf `none`, Phase und Rundenzähler sind unverändert, und
  Grund sowie Zeitpunkt der Pause stehen im Run-State des Laufs

#### Scenario: Pausieren ohne Grund wird abgelehnt

- **WHEN** ein Lauf ohne Angabe eines Grundes pausiert werden soll
- **THEN** bleiben Rollenmarker, Phase, Rundenzähler und Pausenzustand unverändert, und der
  Harness meldet den fehlenden Grund mit einem Fehlschlag

#### Scenario: Ein pausierter Lauf beansprucht keine Rolle mehr

- **GIVEN** der einzige laufende Lauf ist pausiert
- **WHEN** ein Werkzeugaufruf ausgewertet wird, dem sich kein Issue zuordnen lässt
- **THEN** gilt der Aufruf als rollenlos und wird nicht wegen einer Rollengrenze geblockt

### Requirement: Ein pausierter Lauf steht still

Solange ein Lauf pausiert ist, MUST jedes Verb, das den Zustandsautomaten bewegt, wirkungslos
bleiben und auf das Fortsetzen verweisen. Ein Automatenschritt während der Pause würde den
Rollenmarker über denselben Trichter neu setzen, durch den jeder Schrittwechsel läuft, und die
Pause damit unbemerkt beenden — der Eingriff liefe dann unter einer Rolle, die ihn verbietet.

#### Scenario: Der Automat rückt während der Pause nicht vor

- **GIVEN** ein pausierter Lauf
- **WHEN** ein Verb aufgerufen wird, das den Automaten bewegt — die Bestimmung des nächsten
  Schritts, das Gate, die Rot-Bestätigung, die Aufnahme eines Review-Ergebnisses oder einer
  Runden-Zusammenfassung, die Bestätigung des App-Tests
- **THEN** wird keine Aktion emittiert, kein Rollenmarker gesetzt, kein Board-Zugriff
  ausgelöst, kein Unterprozess gestartet und der Run-State nicht verändert; der Harness meldet
  stattdessen den Pausenzustand samt Grund und verweist auf das Fortsetzen

### Requirement: Fortsetzen stellt die Rolle des aktuellen Schritts wieder her

Der Harness MUST ein Verb anbieten, das die Pause beendet und den Rollenmarker auf die Rolle
setzt, die dem Schritt gehört, in dem der Lauf **jetzt** steht. Die Rolle MUST aus der Phase
abgeleitet werden und MUST NOT der bei der Pause vorgefundene Wert sein: während der Pause
korrigiert der Mensch den Lauf — genau dafür ist sie da —, und ein gesicherter Wert wäre danach
womöglich die Rolle des falschen Schritts.

Die wiederhergestellte Rolle MUST für jede Phase dieselbe sein, die der Zustandsautomat beim
regulären Schrittwechsel setzen würde. Zwei Stellen, die dieselbe Zuordnung unabhängig
voneinander treffen, driften auseinander; §8.3 fordert aber, dass der Marker zum anstehenden
Schritt passt, bevor irgendein Werkzeugaufruf erfolgt.

Ein Fortsetzen MUST NOT Phase oder Rundenzähler verändern — abgesehen von der ausdrücklich
angeforderten Rundenrückgabe.

#### Scenario: Fortsetzen setzt die Rolle des aktuellen Schritts

- **GIVEN** ein pausierter Lauf in einer Phase, die einer Rolle gehört
- **WHEN** der Lauf fortgesetzt wird
- **THEN** steht der Rollenmarker auf der Rolle dieser Phase, der Pausenzustand ist beendet,
  und Phase wie Rundenzähler sind unverändert

#### Scenario: Die wiederhergestellte Rolle stimmt in jeder Phase mit dem Automaten überein

- **GIVEN** ein pausierter Lauf, für jede Phase, die der Zustandsautomat kennt
- **WHEN** der Lauf fortgesetzt wird
- **THEN** entspricht der gesetzte Rollenmarker in jeder dieser Phasen genau der Rolle, die der
  Zustandsautomat für den nächsten Schritt aus derselben Phase setzen würde

#### Scenario: Fortsetzen eines Laufs, der nicht pausiert ist, wird abgelehnt

- **GIVEN** ein Lauf, der nicht pausiert ist
- **WHEN** er fortgesetzt werden soll
- **THEN** bleiben Rollenmarker, Phase und Rundenzähler unverändert, und der Harness meldet mit
  einem Fehlschlag, dass kein Pausenzustand vorliegt

### Requirement: Eine Runde, die nur die Umgebung gemessen hat, darf zurückgegeben werden

Das Fortsetzen MUST auf ausdrückliche Anforderung den Rundenzähler um **genau eins**
verringern. Es MUST NOT unter null zählen und MUST NOT ohne diese Anforderung am Zähler
rühren. Die Rückgabe MUST im Run-State festgehalten werden, zusammen mit dem Grund der Pause,
gegen den sie gefällt wurde.

Der Zähler bleibt damit eine Leitplanke im Code (`constitution.md` §3.5/§8.1): Schrittweite
und Untergrenze sind festgelegt, menschlich ist allein das Urteil, dass die betroffene Runde
eine kaputte Umgebung gemessen hat statt einer Implementierung. Ohne diesen Weg verbraucht
Umgebungsrauschen das Eskalationsbudget — im Lauf zu #12 zweimal.

#### Scenario: Die Rückgabe zählt genau eine Runde zurück

- **GIVEN** ein pausierter Lauf, dessen Rundenzähler über null steht
- **WHEN** er mit angeforderter Rundenrückgabe fortgesetzt wird
- **THEN** ist der Rundenzähler um genau eins kleiner, die Phase unverändert, und die Rückgabe
  steht mit Zeitpunkt und dem Grund der Pause im Run-State

#### Scenario: Fortsetzen ohne Anforderung lässt den Zähler unangetastet

- **GIVEN** ein pausierter Lauf, dessen Rundenzähler über null steht
- **WHEN** er ohne angeforderte Rundenrückgabe fortgesetzt wird
- **THEN** ist der Rundenzähler unverändert und es steht keine Rückgabe im Run-State

#### Scenario: Bei Rundenzähler null wird die Rückgabe abgelehnt

- **GIVEN** ein pausierter Lauf, dessen Rundenzähler auf null steht
- **WHEN** er mit angeforderter Rundenrückgabe fortgesetzt wird
- **THEN** bleibt der Rundenzähler auf null, der Lauf bleibt pausiert, der Rollenmarker
  unverändert, und der Harness meldet die abgelehnte Rückgabe mit einem Fehlschlag

### Requirement: Eine aktive Rolle kann sich nicht selbst entpausieren

Der Guard MUST einer aktiven Rolle die Verben zum Pausieren und Fortsetzen verweigern, wie er
ihr heute schon den direkten Zugriff auf die Steuerdateien verweigert. Andernfalls wäre die
Rollentrennung nur noch Konvention: eine Rolle könnte die Sperre abschalten, die für sie gilt.

#### Scenario: Eine aktive Rolle darf das Pausieren nicht aufrufen

- **GIVEN** ein Werkzeugaufruf unter einer aktiven Rolle
- **WHEN** er das Verb zum Pausieren oder das zum Fortsetzen ausführen will
- **THEN** wird der Aufruf geblockt, mit derselben Begründung wie beim Zugriff auf die
  Steuerdateien

#### Scenario: Ohne aktive Rolle sind die Verben erlaubt

- **GIVEN** ein Werkzeugaufruf ohne aktive Rolle
- **WHEN** er das Verb zum Pausieren oder das zum Fortsetzen ausführen will
- **THEN** wird der Aufruf nicht geblockt

### Requirement: Ein Lauf ohne Worktree beansprucht keine Rolle

Lässt sich einem Werkzeugaufruf kein Issue zuordnen, leitet der Guard die Rolle daraus ab, dass
genau ein Lauf aktiv ist. Als aktiv MUST dabei nur gelten, wessen Worktree existiert —
zusätzlich zur bestehenden Bedingung, dass die Phase nicht terminal ist. Der Worktree ist das
einzige Artefakt des Laufs mit sauberem Lebenszyklus: er entsteht beim Start und verschwindet
beim Aufräumen. Ein Marker ohne Worktree gehört zu einem Lauf, der nichts hat, woran er
arbeiten könnte — er darf keinem fremden Aufruf eine Rolle aufzwingen.

Für einen Aufruf, dessen Issue sich aus Pfad oder Kommando ergibt, ändert sich nichts: dort
belegt der Pfad die Existenz des Worktrees bereits.

#### Scenario: Ein Lauf ohne Worktree wird bei der Rollenermittlung übergangen

- **GIVEN** der einzige Lauf mit nicht-terminaler Phase trägt einen Rollenmarker, sein
  Worktree existiert aber nicht
- **WHEN** ein Werkzeugaufruf ausgewertet wird, dem sich kein Issue zuordnen lässt
- **THEN** gilt der Aufruf als rollenlos und wird nicht wegen einer Rollengrenze geblockt

#### Scenario: Ein Lauf mit Worktree bleibt maßgeblich

- **GIVEN** der einzige Lauf mit nicht-terminaler Phase trägt einen Rollenmarker und sein
  Worktree existiert
- **WHEN** ein Werkzeugaufruf ausgewertet wird, dem sich kein Issue zuordnen lässt
- **THEN** gilt die Rolle dieses Laufs für den Aufruf, und ein Zugriff außerhalb ihres
  Pfadbereichs wird geblockt

#### Scenario: Ein direkt adressierter Lauf bleibt von der Prüfung unberührt

- **GIVEN** ein Lauf mit Rollenmarker, dessen Worktree-Verzeichnis nicht existiert
- **WHEN** ein Werkzeugaufruf ausgewertet wird, dessen Issue sich aus seinem Pfad ergibt
- **THEN** gilt die Rolle dieses Laufs für den Aufruf und ein Zugriff außerhalb ihres
  Pfadbereichs wird geblockt — die Existenz des Worktrees wird dabei nicht geprüft
