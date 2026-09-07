# Projekt-Verfassung (constitution.md)

## Geltung
- Bindend für alle agentischen und menschlichen Änderungen.
- Rangfolge bei Konflikten: constitution.md > AGENTS.md > Ad-hoc-Anweisung.
- Änderungen an dieser Datei sind freigabepflichtig (menschliche Freigabe, per PR).

## 1. Arbeitsweise (nicht verhandelbar)
1.1 Jede Änderung ist an ein GitHub-Issue und einen OpenSpec-Change gebunden. Kein Code ohne Spec.
1.2 Spec-driven & test-first: zuerst Spezifikation (GIVEN/WHEN/THEN), dann Test, dann Implementierung.
1.3 Arbeitseinheit = ein OpenSpec-Change in eigenem Worktree/Feature-Branch.
1.4 Wird während der Arbeit an einem Feature ein Fehler im Harness/Orchestrierungs-Skript
    selbst festgestellt (nicht im Feature-Code), wird dieser nicht im selben Branch/PR wie
    das Feature behoben. Der Feature-Branch bleibt unverändert liegen; der Harness-Fix
    entsteht auf einem eigenen Branch und wird über einen eigenen, von einem Menschen
    gemergten PR integriert. Erst danach wird die Arbeit am Feature-Branch fortgesetzt.
    Harness-Änderungen und Anwendungscode werden nie im selben PR gemergt.

## 2. Rollentrennung
2.1 Drei isolierte Rollen: test-author, implementer, reviewer. Keine Rolle übernimmt die Aufgabe einer anderen.
2.2 Der implementer sieht die Tests nie (Deny-Read auf Testpfade; kein Testinhalt in der Delegation).
2.3 Testdateien sind gegen Änderung durch den implementer gesperrt (CODEOWNERS + Branch-Regel).
2.4 Jede Rolle schreibt nur in ihren Pfadbereich (test-author: Testpfade; implementer: Quellpfade; reviewer: read-only).

## 3. Gates (immer, in dieser Reihenfolge)
3.1 Der Test entsteht vor der Implementierung und muss aus dem richtigen Grund rot sein (erwartete Assertion, nicht Setup-/Compile-Fehler).
3.2 Deterministisches Gate zuerst: Tests + Typecheck + Lint müssen grün sein — bevor der reviewer läuft.
3.3 Danach der reviewer. Findet er etwas, geht die Nacharbeit an die Rolle, deren Artefakt
    betroffen ist: Sind alle blockierenden Findings ausschließlich testbezogen, zurück zum
    test-author — mit Pflicht zur Revalidierung der korrigierten Tests gegen den aktuellen
    Stand (grün → direkt erneut Review, ohne Implementierungsrunde; rot → reguläre
    Implementierungsrunde mit Gate-Feedback). Sind sie gemischt oder implementierungsbezogen,
    zurück zur Implementierung; rein testbezogene Anteile werden geparkt und erst nach grünem
    Gate — vor dem nächsten Review — durch den test-author behoben. Blockierende Findings ohne
    Zuordnung zu einer Rolle (z. B. CI-Konfiguration, OpenSpec-Proposal) eskalieren direkt an
    den Menschen. Jede Nacharbeit-Runde, gleich welcher Rolle, durchläuft erneut Gate und
    erneut Review.
3.4 Empfiehlt der reviewer "ok": App lokal starten, dem Menschen einen Link sowie eine Liste
    der Changes zum manuellen Testen präsentieren. Kein PR, bevor der Mensch nach eigenem
    manuellem Test explizit freigegeben hat. Lehnt der Mensch ab, zählt das wie ein
    Nacharbeit-Befund des reviewers (zurück zur Implementierung → erneut Gate → erneut Review
    → erneut App-Test).
3.5 Maximal 3 Runden (Implementierungs-, Test- und/oder App-Test-Nacharbeit zusammengezählt,
    unabhängig davon, welche Rolle die jeweilige Runde übernimmt). Danach steigt ein Mensch in
    den Loop ein.
3.6 Erst nach der menschlichen App-Freigabe wird der zugehörige OpenSpec-Change archiviert —
    im selben Branch/PR wie das Feature, nicht in einem separaten Archivierungs-PR.
3.7 Nichts erreicht `main` ohne grünes Gate, bestandenen Review, menschlichen App-Test und menschlichen Merge.

## 4. Testprinzipien
4.1 Pro GIVEN/WHEN/THEN-Szenario genau ein aussagekräftiger Test (Traceability Spec↔Test).
4.2 Zuordnung: Verhalten → Tests; Struktur/Mechanik → Typecheck/Lint; Urteil → reviewer + Mensch.
4.3 DB-abhängiges Verhalten wird per Integrationstest gegen eine ephemere Wegwerf-DB geprüft — niemals gegen eine produktive oder kundenseitige Datenbank.

## 5. Berechtigungen & Blast Radius
5.1 Nur Mensch (nie Agent): Merge auf `main`; Migrationen/Schemaänderungen gegen die produktive Zielumgebung; Umgang mit Secrets/Credentials; Löschen von Daten/Ressourcen; Security-/RBAC-Einstellungen.
5.2 Freigabepflichtig (Mensch bestätigt): neue/aktualisierte Dependencies (Agent nennt Paket + Begründung); Deploys; Änderungen an CI/CD, Rulesets, Repo-Settings, dieser Verfassung und AGENTS.md-Kernregeln.
5.3 Frei (autonom): Lesen; Schreiben im eigenen Pfadbereich; lokale Tests/Typecheck/Lint/Build; ephemere Test-DB; Commit/Push auf Feature-Branch; PR öffnen.
5.4 Grenzen sind als allow/deny formuliert, nicht als Rückfrage (Subagents können nicht nachfragen). Least Privilege gilt durchgängig.

## 6. Deploy & Migrationen
6.1 Deploys und Migrationen laufen ausschließlich über die CI-Pipeline — nie von einer lokalen oder Agenten-Maschine.
6.2 Authentifizierung per OIDC / Workload Identity Federation; keine langlebigen Cloud-Credentials im Repo oder beim Agenten.
6.3 dev: automatischer Deploy/Migrate bei Merge auf `main`. stage/prod: nur über Pipeline mit GitHub Environments + menschlicher Freigabe (Required Reviewers).

## 7. Nachvollziehbarkeit & Verantwortung
7.1 Jeder PR verweist auf sein GitHub-Issue und seinen OpenSpec-Change (per CI-Check erzwungen). Kette: Issue → Change → Tests → PR → Merge → Deploy.
7.2 KI-Beteiligung bleibt sichtbar: Standard-`Co-Authored-By`-Trailer im Commit; PR-Footer weist KI-Nutzung und menschliche Prüfung/Verantwortung aus.
7.3 Die Verantwortung für jede gemergte Änderung trägt der freigebende Mensch — nicht das Werkzeug.
7.4 Der Fortschritt ist jederzeit sichtbar: eine Todo-/Schrittliste wird durchgehend angezeigt. Dauert ein Schritt (test-author/implementer/reviewer) länger, wird währenddessen in regelmäßigen Abständen der aktuelle Stand dieses Schritts zusammengefasst, statt stumm zu arbeiten.

## 8. Determinismus der Steuerung
8.1 Die harten Invarianten (Rundenzahl, Gate-Reihenfolge, Rot-Bestätigung, Eskalation) liegen im Orchestrierungs-Skript (Code), nicht im Ermessen eines Modells.
8.2 Leitplanken: (G1) Delegationen getemplatet, nicht frei formuliert; (G2) Rollen-Summaries schema-gebunden; (G3) Fehler-Feedback aus geparster Gate-Ausgabe (Testname + vollständige Matcher-Ausgabe bis zur Codeframe-/Stacktrace-Grenze, kein Testquellcode; ein Leak-Wächter degradiert einzelne Failures notfalls auf eine Kurzform, statt den Run zu blockieren); (G4) Run-State auf Platte, Orchestrator liest nur kompakten Status; frische Session pro Feature.
8.3 Vor jedem Rollenwechsel im Loop (`none → test-author → implementer → reviewer → ...`) prüft die Session zuerst, ob der `active-role`-Marker des laufenden Issues (`.harness/runs/<issue>/active-role`) zur für den anstehenden Schritt vorgesehenen Rolle passt — bevor irgendein Werkzeugaufruf für diesen Schritt erfolgt. Bei Abweichung: kein Arbeitsbeginn, sondern Rückfrage an den Menschen, der die Rolle manuell korrigiert; erst danach wird fortgesetzt. Ein Rollenfehler darf nicht erst dadurch auffallen, dass ein Datei-Edit oder Tool-Aufruf vom Guard abgelehnt wird.

## 9. Vertrauensgrenze zwischen Client und Server
Bindend für jeden Change, unabhängig von Feature und Architektur. Diese Regeln stehen hier
und nicht in AGENTS.md, weil ihre Verletzung kein Stilfehler ist, sondern ein Defekt: sie
entscheidet darüber, ob ein Mitspieler Informationen oder Kontrolle erlangt, die ihm nicht
zustehen.

9.1 Der Server ist autoritativ. Clients senden Absichten, niemals Zustand. Was tatsächlich
    geschieht, entscheidet der Server und teilt es mit; eine Client-Nachricht ist ein Antrag,
    kein Ergebnis.
9.2 Verdeckte Information verlässt den Server nicht. Was ein Teilnehmer nicht sehen darf —
    unaufgedeckte Kartenbereiche, verdeckte Werte, Vorbereitungen der Spielleitung — wird
    pro Empfänger herausgefiltert, bevor gesendet wird. Clientseitiges Ausblenden ist keine
    Umsetzung dieser Regel, sondern ihre Verletzung: die Daten liegen dann bereits im Browser.
9.3 Berechtigungen werden pro Aktion geprüft, nicht beim Verbindungsaufbau. Zuweisungen
    können sich mitten in einer Sitzung ändern; eine einmal erteilte Verbindung ist keine
    dauerhafte Erlaubnis.
9.4 Diese Regeln gelten auch dann, wenn eine Spezifikation sie nicht wiederholt. Ein Change,
    der sie verletzt, ist unabhängig von seiner Spec fehlerhaft.
