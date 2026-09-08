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
- **WHEN** ein Verb aufgerufen wird, das den Automaten bewegt — das Starten eines Laufs, die
  Bestimmung des nächsten Schritts, das Gate, die Rot-Bestätigung, die Aufnahme eines
  Review-Ergebnisses oder einer Runden-Zusammenfassung, die Bestätigung des App-Tests, das
  Aufräumen
- **THEN** wird keine Aktion emittiert, kein Rollenmarker gesetzt, kein Board-Zugriff
  ausgelöst, kein Unterprozess gestartet und der Run-State nicht verändert; der Harness meldet
  stattdessen den Pausenzustand samt Grund und verweist auf das Fortsetzen

### Requirement: Fortsetzen stellt die Rolle des aktuellen Schritts wieder her

Der Harness MUST ein Verb anbieten, das die Pause beendet und den Rollenmarker auf die Rolle
setzt, die dem Schritt gehört, in dem der Lauf **jetzt** steht. Die Rolle MUST aus der Phase
abgeleitet werden und MUST NOT der bei der Pause vorgefundene Wert sein: während der Pause
korrigiert der Mensch den Lauf — genau dafür ist sie da —, und ein gesicherter Wert wäre danach
womöglich die Rolle des falschen Schritts.

Die wiederhergestellte Rolle MUST dieselbe sein, die der Zustandsautomat aus demselben
Run-State setzen würde — sofern der nächste Schritt **ohne Zustandsübergang** auskommt.
Verlangt er einen (etwa eine Nacharbeit-Runde nach rotem Gate), MUST der Marker rollenlos
bleiben: den Übergang samt Rundenzähler vollzieht allein der Automat, und ein Fortsetzen darf
ihn weder vorwegnehmen noch auslösen.

Die Ableitung MUST den vollständigen Run-State berücksichtigen, nicht allein die Phase. Der
Automat entscheidet an einer Stelle feiner: nach einem grünen Gate bleibt die Phase auf `gate`
stehen, während der Reviewer-Schritt läuft — eine Ableitung, die nur die Phase liest, setzte
dort rollenlos, wo der Automat den Reviewer gesetzt hätte.

Zwei Stellen, die dieselbe Zuordnung unabhängig voneinander treffen, driften auseinander; §8.3
fordert aber, dass der Marker zum anstehenden Schritt passt, bevor irgendein Werkzeugaufruf
erfolgt. Die Übereinstimmung MUST deshalb mechanisch geprüft werden, nicht durch Sorgfalt.

Ein Fortsetzen MUST NOT Phase oder Rundenzähler verändern — abgesehen von der ausdrücklich
angeforderten Rundenrückgabe.

#### Scenario: Fortsetzen setzt die Rolle des aktuellen Schritts

- **GIVEN** ein pausierter Lauf in einer Phase, die einer Rolle gehört
- **WHEN** der Lauf fortgesetzt wird
- **THEN** steht der Rollenmarker auf der Rolle dieser Phase, der Pausenzustand ist beendet,
  und Phase wie Rundenzähler sind unverändert

#### Scenario: Die wiederhergestellte Rolle stimmt mit dem Automaten überein

- **GIVEN** ein pausierter Lauf, für jeden Run-State, den der Zustandsautomat unterscheidet —
  jede Phase, und für die Phase `gate` zusätzlich jeden Zweig, den der Automat dort kennt
- **WHEN** der Lauf fortgesetzt wird
- **THEN** entspricht der gesetzte Rollenmarker in jedem Run-State, dessen nächster Schritt
  ohne Zustandsübergang auskommt, genau der Rolle, die der Zustandsautomat setzen würde — und
  bleibt in jedem übrigen rollenlos, ohne dass Phase oder Rundenzähler sich ändern

#### Scenario: Fortsetzen eines Laufs, der nicht pausiert ist, wird abgelehnt

- **GIVEN** ein Lauf, der nicht pausiert ist
- **WHEN** er fortgesetzt werden soll
- **THEN** bleiben Rollenmarker, Phase und Rundenzähler unverändert, und der Harness meldet mit
  einem Fehlschlag, dass kein Pausenzustand vorliegt

#### Scenario: Fortsetzen bei unbekannter Phase wird abgelehnt, bevor etwas geschrieben ist

- **GIVEN** ein pausierter Lauf, dessen Phase der Zustandsautomat nicht kennt — während der
  Pause korrigiert der Mensch den Run-State von Hand, ein Vertippen ist dort der Regelfall,
  nicht die Ausnahme
- **WHEN** er fortgesetzt werden soll
- **THEN** bleibt der Lauf pausiert, Rollenmarker, Phase und Rundenzähler bleiben unverändert,
  und der Harness meldet die unbekannte Phase mit einem Fehlschlag statt mit einem Absturz

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

### Requirement: Kein Werkzeugaufruf unter einer Rolle darf pausieren

Der Guard MUST jedem Werkzeugaufruf, für den eine Rolle gilt, die Verben zum Pausieren und
Fortsetzen verweigern — **jeder** Rolle, nicht nur denen mit einem Schreibbereich. Andernfalls
wäre die Rollentrennung an dieser Stelle nur noch Konvention: wer pausieren kann, schaltet die
Sperre ab, unter der er selbst steht.

Der Guard kann nicht unterscheiden, ob ein Werkzeugaufruf von der orchestrierenden Sitzung
oder von einem Subagenten stammt. Diese Regel gilt deshalb notwendig für beide: entweder darf
kein Agent pausieren oder jeder. Der vorgesehene Kanal ist damit die Eingabe des Menschen, die
den Guard nicht durchläuft; die Sitzung fordert das Pausieren an, statt es auszuführen.

Ein Aufruf **ohne** geltende Rolle MUST NOT geblockt werden. Während einer Pause trägt der
Marker `none` — das Fortsetzen bleibt dadurch möglich, ohne die Sperre aufzuweichen: es stellt
eine Rolle wieder her, statt eine abzuschalten.

#### Scenario: Unter jeder Rolle wird das Pausieren verweigert

- **GIVEN** ein Werkzeugaufruf, für den eine Rolle gilt — gleich welche der drei
- **WHEN** er das Verb zum Pausieren oder das zum Fortsetzen ausführen will
- **THEN** wird der Aufruf geblockt, mit derselben Begründung wie beim Zugriff auf die
  Steuerdateien

#### Scenario: Ohne geltende Rolle sind die Verben erlaubt

- **GIVEN** ein Werkzeugaufruf, für den keine Rolle gilt — etwa weil der einzige laufende Lauf
  pausiert ist
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

Diese Regel schafft eine Richtung, in die der Guard fail-**open** kippen kann: ein Marker ohne
Worktree entzieht sich der Prüfung. Ein Lauf MUST deshalb gar nicht erst mit einem Rollenmarker
entstehen, wenn sein Worktree nicht angelegt werden konnte.

#### Scenario: Ein Lauf entsteht nicht, wenn sein Worktree nicht angelegt werden konnte

- **GIVEN** das Anlegen des Worktrees für einen neuen Lauf schlägt fehl
- **WHEN** der Lauf gestartet wird
- **THEN** entsteht weder ein Rollenmarker noch ein Run-State, und der Harness meldet den
  Fehlschlag — statt einen Lauf zu hinterlassen, den die Rollenermittlung für tot hält

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
