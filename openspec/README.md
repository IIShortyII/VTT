# openspec/

Intent-Ebene des Projekts: hier entstehen die Specs und Changes, aus denen der
Harness-Loop arbeitet.

- `specs/` — Spec-Baseline (Source of Truth)
- `changes/` — aktive Changes (Eingabe für `pnpm harness start`)
- `changes/archive/` — gemergte Changes (Audit-Historie)

## Voraussetzung

Die `/opsx:*`-Commands rufen die OpenSpec-CLI als nacktes `openspec`-Kommando auf
(`allowed-tools: Bash(openspec:*)`), sie muss also global installiert sein:

    pnpm add -g @fission-ai/openspec

Meldet pnpm dabei, das globale bin-Verzeichnis liege nicht im PATH: einmalig
`pnpm setup` ausführen. Das schreibt die Umgebungsvariablen, wirkt aber erst in
neu gestarteten Prozessen — eine laufende Claude-Code-Session findet `openspec`
danach weiterhin nicht und muss neu gestartet werden.

Aktualisieren der Skills/Commands im Repo nach einem CLI-Update:

    openspec init --tools claude

Das Profil-Preset `workflows` aus früheren Versionen gibt es nicht mehr; ab 1.12
ist `core` das einzige Preset und der volle Command-Satz wird ohnehin installiert.

## Naht zur Harness

OpenSpec liefert die Intent-Ebene (`/opsx:propose`, `/opsx:update`, `/opsx:explore`),
der Harness-Loop übernimmt die Umsetzung.

**`/opsx:apply` wird nicht benutzt** — es würde den Code selbst schreiben und damit
die Rollentrennung aus constitution.md §2 umgehen. Stattdessen:
`pnpm harness start <issue> <change>` und dann dem `feature-loop`-Skill folgen.
Archiviert wird im Feature-Branch vor dem PR (§3.6), nicht über einen separaten
Archivierungslauf.
