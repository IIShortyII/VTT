## Purpose

Beschreibt, was `pnpm harness start` beim Anlegen eines Worktree über das bloße Klonen hinaus
einrichtet — Installation der Abhängigkeiten und Meldung fehlender Vorbedingungen, ohne dabei
in Credentials einzugreifen — und nach welcher Regel der Feature-Branch benannt wird. Ein
Worktree, der nach `start` nicht arbeitsfähig ist, verschiebt den Fehler auf das erste Gate,
wo er als Werkzeug- statt als Feature-Problem auftaucht.

## ADDED Requirements

### Requirement: Der frische Worktree wird arbeitsfähig gemacht

`start` MUST nach erfolgreichem Anlegen des Worktree dessen Abhängigkeiten mit `pnpm install`
im Worktree-Verzeichnis installieren, bevor der Lauf an die erste Rolle übergeht. Ein frischer
Worktree hat kein `node_modules`; ohne diesen Schritt scheitert das erste Gate nicht an den
Tests, sondern am fehlenden Jest. Die Installation MUST erst laufen, nachdem die bestehende
Existenzprüfung den Worktree bestätigt hat — ein nicht angelegter Worktree bricht den Lauf wie
bisher ab, bevor installiert wird.

#### Scenario: start installiert die Abhängigkeiten im neuen Worktree

- **GIVEN** `start` legt für ein Issue einen frischen Worktree an und das Anlegen war
  erfolgreich
- **WHEN** `start` den Worktree einrichtet
- **THEN** führt `start` `pnpm install` im Verzeichnis dieses Worktree aus, bevor es den Change
  einseedet und den ersten Schritt bestimmt

### Requirement: Fehlende Vorbedingungen werden gemeldet, nicht behoben

Existiert im Worktree eine `.env.example`, fehlt aber die `.env`, MUST `start` das als benannte
Vorbedingung auf der Fehlerausgabe melden. `start` MUST NOT selbst eine `.env` anlegen oder aus
`.env.example` kopieren: die Datei trägt real gelesene Config und Credentials, deren Umgang
`constitution.md` §5.1 dem Menschen vorbehält. Eine fehlende `.env` MUST NOT den Lauf
abbrechen — sie wird gemeldet, damit der Mensch sie vor dem App-Test (§3.4) selbst anlegt.

#### Scenario: Fehlende .env wird als Vorbedingung gemeldet, ohne sie anzulegen

- **GIVEN** im Worktree existiert `.env.example`, aber keine `.env`
- **WHEN** `start` den Worktree einrichtet
- **THEN** meldet `start` die fehlende `.env` als benannte Vorbedingung auf der Fehlerausgabe,
  legt selbst keine `.env` an, und der Lauf wird fortgesetzt

#### Scenario: Vorhandene .env erzeugt keine Meldung

- **GIVEN** im Worktree existieren sowohl `.env.example` als auch `.env`
- **WHEN** `start` den Worktree einrichtet
- **THEN** erfolgt keine `.env`-Vorbedingungsmeldung

### Requirement: Der Feature-Branch folgt der Namenskonvention

`start` MUST den Feature-Branch nach `feat/<issue>-<kurz>` benennen, wobei `<kurz>` der an
`start` übergebene OpenSpec-Change-Name ist — er liegt bereits als kebab-case vor und ist
`start` ohnehin bekannt, sodass kein zusätzlicher Zugriff auf den Issue-Titel nötig ist. Wird
`start` ohne Change-Namen aufgerufen, MUST der Branchname auf `feat/<issue>` zurückfallen.

#### Scenario: Mit Change-Name entsteht feat/<issue>-<change>

- **GIVEN** `start` wird für ein Issue mit einem übergebenen Change-Namen aufgerufen
- **WHEN** `start` den Worktree anlegt
- **THEN** trägt der angelegte Branch den Namen `feat/<issue>-<change-name>`

#### Scenario: Ohne Change-Name fällt der Name auf feat/<issue> zurück

- **GIVEN** `start` wird für ein Issue ohne Change-Namen aufgerufen
- **WHEN** `start` den Worktree anlegt
- **THEN** trägt der angelegte Branch den Namen `feat/<issue>`
