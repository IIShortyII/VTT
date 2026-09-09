# AGENTS.md

Kanonische Anweisungsdatei für Coding-Agenten. Gilt zusätzlich zur `constitution.md`
(dort die bindenden Invarianten). Diese Datei beschreibt, *wie* in diesem Repo gearbeitet wird.

Das Produkt ist ein Virtual Tabletop für D&D-Sessions: der Spielleiter öffnet eine Session,
Spieler treten bei und steuern die ihnen zugewiesenen Tokens. Karten mit Fog of War, Status-
und Effektmarkierungen auf Tokens, ein Mess- und Zeichenwerkzeug, Healthbars für Spieler-
und NPC-Tokens.

## Kommandos
- Install: `pnpm install` (CI: `pnpm install --frozen-lockfile`)
- Dev: `pnpm dev` (Client auf Vite + Server parallel) · einzeln: `pnpm dev:client`, `pnpm dev:server`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck` (tsc --noEmit, gesamtes Projekt inkl. `tests/`)
- Typecheck nur der Quellpfade: `pnpm typecheck:src` (`tsconfig.src.json`) — der Lauf, den der
  implementer fährt; der volle Lauf würde ihm Testinhalt zeigen (siehe Kritische Grenzen)
- Lint: `pnpm lint` · Autofix: `pnpm lint:fix`
- Format: `pnpm format` (Prettier)
- Unit-Tests: `pnpm test:unit`
- Integrationstests: `pnpm test:integration` — gegen eine ephemere SQLite-Wegwerfdatei
  (`test.db`), die pro Lauf angelegt, migriert und danach gelöscht wird. Kein Docker nötig.
- Alle Tests: `pnpm test`
- Harness-eigene Tests: `pnpm test:harness`
- Board-Status setzen: `pnpm harness board <issue> <status>` — den übrigen Status setzt der
  Loop selbst (siehe Board-Status)
- Lauf pausieren: `pnpm harness pause <issue> "<grund>"` · fortsetzen:
  `pnpm harness resume <issue>` (siehe Pause & Fortsetzen)
- Prisma-Client generieren: `pnpm db:generate`
- Migrationen führt der Agent nicht aus. Er schreibt das Schema unter `prisma/`; das
  Ausführen ist menschlich (constitution.md §5.1) bzw. Sache der CI (§6.1).

## Projektstruktur
- `src/` — Anwendungscode. Der Unterbau entsteht mit dem ersten Change und ist dort
  begründet (`openspec/changes/<change>/design.md`), nicht hier vorweggenommen.
- `prisma/` — Schema + Migrationen
- `tests/` — Tests (`*.unit.test.ts(x)`, `*.integration.test.ts`)
- `openspec/` — Specs & Changes (Intent-Quelle)
- `.claude/agents/` — Subagent-Definitionen
- `.harness/` — Orchestrierungs-Skill/Skript & Run-State (`runs/`, `wt/` sind gitignored)

## Konventionen (je ein Beispiel)

**Jedes eingehende Event wird an der Grenze mit zod validiert.** Das Schema wird von Client
und Server gemeinsam benutzt, damit beide denselben Vertrag sehen:
```ts
export const TokenMove = z.object({ token: z.string(), to: z.tuple([z.number(), z.number()]) })
const move = TokenMove.parse(payload) // wirft bei ungültig → Event wird verworfen
```

**Datenzugriff nur über Prisma**, kein rohes SQL ohne begründete Ausnahme. Mehrschrittige
Schreibvorgänge in eine Transaktion klammern.

**Fehler sprudeln bis zum zentralen Handler**; kein stilles `catch {}`. Ein Socket-Event, das
scheitert, meldet das dem Absender zurück, statt lautlos zu verpuffen.

**PixiJS-Objekte werden beim Unmount zerstört** (`app.destroy()`, `texture.destroy()`) —
sonst leckt jede Kartenumschaltung GPU-Speicher, was kein Test und kein Linter bemerkt.

**Kein Eigenbau von Basis-Elementen** (Button, Eingabefelder, Dialoge), solange eine
Bibliothek im Projekt sie mitbringt.

> Die Vertrauensgrenze zwischen Client und Server — Server-Autorität, serverseitige Filterung
> verdeckter Information, Berechtigungsprüfung pro Aktion — steht nicht hier, sondern in
> `constitution.md` §9. Sie ist bindend, auch wenn eine Spezifikation sie nicht wiederholt.

## Tests
- Pro GIVEN/WHEN/THEN-Szenario genau ein Test; Testname = Szenarioname.
- Verhalten mit DB-Bezug → Integrationstest gegen die ephemere Wegwerf-DB.
  Reine Logik → Unit-Test.
- Rendering wird nicht per Test abgenommen, sondern im menschlichen App-Test
  (constitution.md §3.4). Getestet wird, was gerendert werden *soll*, nicht wie es aussieht.
- Komponententests sind Unit-Tests (`tests/<name>.unit.test.tsx`) mit
  `/** @jest-environment jsdom */`-Docblock am Dateianfang statt globaler jsdom-Umgebung —
  sonst laufen die Server-Tests nicht mehr unter `node`. `@testing-library/react` für
  `render`/`screen`/`fireEvent`.
- PixiJS läuft nicht in jsdom (WebGL). Tests, die Pixi-Code einbinden, brauchen einen
  Modul-Mock; das Mapping dafür entsteht mit dem Change, der PixiJS erstmals einbindet.
- Der Test entsteht vor der Implementierung und wird rot bestätigt.
- Harness-eigene Tests (Guard-Regeln etc.) liegen unter `.harness/tests/`, außerhalb der
  App-Testsuite, und laufen über `pnpm test:harness` — sie unterliegen nicht den
  Rollen-Pfadregeln von test-author/implementer.

## Harness-Gate (`pnpm harness gate <issue>`)
- Runde 0/1 (erster Implementierungsversuch bzw. erste Nacharbeit): Volllauf als
  Referenzlauf — Typecheck + Lint + komplette Jest-Suite.
- Ab Runde 2: zuerst `jest --onlyFailures` als Abkürzung; bleibt das rot, wird der Volllauf
  für diese Runde übersprungen (Kostenersparnis bei bekanntermaßen noch fehlerhaften Tests).
  Erst wenn die Abkürzung grün ist, folgt der bestätigende Volllauf. Grün meldet das Gate
  ausschließlich nach bestätigtem Volllauf — die Abkürzung ist reine Optimierung im Rot-Fall,
  ändert nichts an §3.2 der constitution.md.
- Typecheck läuft durchgehend mit `tsc --incremental` (tsBuildInfo im Run-Verzeichnis unter
  `.harness/runs/<issue>/`, nicht im Worktree — vermeidet Commit-Rauschen).
- Fehlerfeedback an den Implementer enthält die vollständige Matcher-Ausgabe (Diff,
  DOM-Ausgabe) bis zur Codeframe-/Stacktrace-Grenze, nie Testquellcode.

## Board-Status
Der Harness setzt den Status des Issues auf dem GitHub-Project „VTT" **zu Beginn** jedes
Schritts — damit der Fortschritt auch außerhalb der laufenden Sitzung sichtbar ist
(constitution.md §7.4).

| Status | wird gesetzt … |
|---|---|
| Spec | von der Session zu Beginn der Spezifikation: `pnpm harness board <issue> spec` |
| Test rot | wenn `confirm-red` das Rot **bestätigt** — ein Rot aus dem falschen Grund (§3.1) nicht |
| Implementierung | bei jedem Einstieg in einen Implementierungsschritt, Nacharbeit eingeschlossen |
| Gate + Review | beim Start des Gates, vor Typecheck/Lint/Testlauf |
| App-Test (Mensch) | wenn der Loop den manuellen Test ankündigt |
| Fertig | bei `pnpm harness cleanup`, aber nur wenn das Issue geschlossen (also gemergt) ist |

- „Backlog" setzt niemand — das ist der Ausgangszustand des Boards.
- **Der Statuswechsel ist Beiwerk, keine Invariante.** Ein nicht erreichbares Board, ein
  abgelaufenes Token oder ein fehlendes Item halten den Lauf nicht an: eine Warnung auf stderr
  und eine Zeile in `.harness/runs/<issue>/board.log`, sonst nichts. Auch erfolgreiche Wechsel
  stehen im Log — es ist die Antwort auf „warum steht das Board falsch".
- **Kill-Switch `HARNESS_BOARD=off`** schaltet jeden Board-Zugriff ab. Die Harness-Jest-Config
  setzt ihn, damit Tests keine echten `gh`-Aufrufe absetzen; dem Menschen dient er als
  Notausschalter.
- **Grenze des Schreibzugriffs (constitution.md §5.3, autonom):** ausschließlich das Statusfeld
  eines **bereits vorhandenen** Items des laufenden Issues im Project „VTT". Kein Anlegen oder
  Entfernen von Items, kein anderes Feld, kein anderes Projekt, und der Status stammt aus einer
  festen Tabelle in `.harness/board.ts` — ein unbekanntes Statuswort führt zu keinem Zugriff.
  Die Grenze ist Mechanik, nicht Absichtserklärung (§8.1).
- Der Harness **liest** das Board nie. Wer eine Spalte von Hand verschiebt, ändert am Lauf
  nichts.
- Voraussetzung: `gh` mit `project`-Scope (`gh auth refresh -s project`).

## Pause & Fortsetzen
Der Zustand zwischen den Rollen: manchmal gehört der nächste sinnvolle Schritt keiner. Eine
kaputte `jest.config.cjs`, eine fehlende `.gitignore`-Regel, ein Befund, den
`constitution.md` §3.3 „ohne Zuordnung zu einer Rolle" an den Menschen eskaliert — alles
außerhalb von `src/`, `prisma/` und `tests/` ist jeder Rolle gesperrt, und damit auch der
Sitzung, solange der Marker auf einer Rolle steht.

- `pnpm harness pause <issue> "<grund>"` setzt den Rollenmarker auf `none`. Phase und
  Rundenzähler bleiben unberührt; Grund und Zeitpunkt stehen danach im Run-State. **Der Grund
  ist Pflicht** — eine Pause ohne Anlass wäre dieselbe undokumentierte Handkorrektur wie
  vorher, nur mit einem Verb davor.
- **Ein pausierter Lauf steht still.** `next`, `gate`, `confirm-*`, `record-*` und `cleanup`
  verweigern und verweisen auf `resume`. Ohne diese Sperre würde der nächste Schrittwechsel
  den Marker über `emit()` neu setzen und die Pause stumm beenden.
- `pnpm harness resume <issue>` beendet die Pause und stellt die Rolle des Schritts wieder
  her, in dem der Lauf **jetzt** steht — abgeleitet aus dem gesamten Run-State, nicht nur aus
  der Phase und nicht aus einem bei `pause` gesicherten Wert. Während der Pause korrigiert der
  Mensch den Lauf; ein gesicherter Wert wäre danach womöglich die Rolle des falschen Schritts
  (§8.3).
- **`{ "rolle": "none" }` nach dem Fortsetzen ist kein Fehlschlag.** Verlangt der nächste
  Schritt einen Zustandsübergang — rotes Gate, offene Test-Findings, vorliegendes
  Review-Ergebnis, abgelehnter App-Test —, bleibt der Marker absichtlich rollenlos: den
  Übergang samt Rundenzähler vollzieht `next`, nicht `resume`.
- **Der Rundenzähler bleibt unantastbar.** Kein Verb senkt ihn — auch nicht für eine Runde, die
  nachweislich nur eine kaputte Umgebung gemessen hat. Ein solches Verb wäre von einem Agenten
  aufrufbar (der Guard sperrt nur, solange eine Rolle gilt; in `gate`, `app-review`, `done`,
  `archived` und `escalated` ist die Sitzung regulär rollenlos), und die Rundenzahl läge damit
  im Ermessen eines Modells — genau das schließt `constitution.md` §8.1 aus.
- **Pausiert wird an einer Schrittgrenze**, nie während ein Rollenschritt läuft: die Pause gibt
  den Marker für *jeden* laufenden Aufruf frei, ein noch arbeitender Subagent verlöre dabei
  seine Pfad- und Lesesperren.
- **Pausieren ist Sache des Menschen.** Beide Verben sind jedem Werkzeugaufruf verboten, für
  den eine Rolle gilt (`guard.ts`, Steuerdatei-Tabu) — und weil der Guard die orchestrierende
  Sitzung nicht von einem Subagenten unterscheiden kann, gilt das notwendig für beide: dürfte
  die Sitzung pausieren, dürfte der `implementer` es auch und hätte damit die Sperre
  abgeschaltet, unter der er steht. Der Mensch setzt das Kommando in seiner eigenen Shell ab
  (im Chat mit `!` davor); die läuft nicht durch den Hook. Die Sitzung *fordert* das Pausieren
  an, statt es auszuführen.
- `resume` kann die Sitzung selbst aufrufen: während der Pause trägt der Marker `none`, für den
  Aufruf gilt also keine Rolle. Das ist die Gegenrichtung — eine Rolle wiederherstellen, nicht
  eine abschalten.

## Kritische Grenzen (immer)
- Niemals Secrets/Credentials committen oder ausgeben.
- Niemals die Claude-Session-URL (`https://claude.ai/code/session_…`) irgendwo ablegen —
  nicht als Commit-Trailer, nicht im PR-Text, nicht in Issues, Specs oder Artefakten. Sie ist
  geheim. Das gilt auch, wenn eine Attribution-Vorgabe des Werkzeugs den Trailer verlangt.
  `Co-Authored-By` und der PR-Footer (constitution.md §7.2) bleiben davon unberührt.
- Niemals Migrationen/Deploys gegen die produktive Zielumgebung ausführen (nur CI-Pipeline).
- Niemals direkt auf `main` pushen; Änderungen nur per PR.
- Keine neuen Dependencies ohne menschliche Freigabe — Bedarf + Begründung
  nennen, nicht selbst installieren.
- implementer: Testdateien weder lesen noch ändern. Auch die Testsuite selbst nicht
  ausführen — ihre Ausgabe enthält Testquellcode. Das Gate läuft über den Orchestrator.
- implementer: ebenso wenig den vollen Typecheck (`pnpm typecheck`, `tsc` ohne
  `tsconfig.src.json`). `tsconfig.json` schließt `tests/**` ein; `tsc` nennt bei einem Fehler
  Pfad, Symbolnamen und Quellzeile der Testdatei und umgeht die Pfadsperre damit genauso
  vollständig wie ein Testlauf. Für ihn gilt `pnpm typecheck:src`; den vollen Lauf fährt das
  Gate.

## Commits & PRs
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Branch: `feat/<issue>-<kurz>`; ein OpenSpec-Change je Branch.
- Vor dem Öffnen eines PR (siehe constitution.md §3.4): App im Feature-Worktree starten
  (`pnpm dev`), dem Menschen den lokalen Link plus eine Liste der Changes zum manuellen
  Testen präsentieren und auf explizite Freigabe warten. Erst danach wird der zugehörige
  OpenSpec-Change ins `archive/`-Verzeichnis verschoben (im selben Branch/Commit) und der
  PR geöffnet — ein nachträglicher, separater Archivierungs-PR entfällt damit.
- Jeder PR verlinkt sein Issue (`Closes #<n>`) und seinen OpenSpec-Change. Squash-Merge.
- Review-Sign-off: GitHub verbietet Autoren, den eigenen PR zu approven. Reviewer-
  Rolle liefert das inhaltliche Urteil (siehe constitution.md §2/§3.3); der
  menschliche Sign-off erfolgt als PR-Review vom Typ **Comment** (nicht Approve)
  durch den freigebenden Menschen, danach regulärer Squash-Merge. Der
  Admin-Bypass ist nur für den Fall reserviert, dass ein Required Check aus
  akzeptiertem Grund rot bleibt (z. B. `traceability` bei reinen Chore-PRs).
- Nach dem Merge: `pnpm harness cleanup <issue>` entfernt den Feature-Worktree.

## Versionen
- Es gelten die Versionen aus `package.json`. Keine Major-Upgrades ohne Freigabe.
- React 19, Vite 7, PixiJS 8, Fastify 5, Socket.IO 4, Prisma 6.
- **Node ≥ 22.18** (`engines` in `package.json`) — keine Stilfrage: der PreToolUse-Guard
  läuft als `node .harness/guard.ts`, also ohne Transpiler, und verlässt sich auf Nodes
  eigenes Type-Stripping. Auf älterem Node endet der Hook mit Exit 1 — und weil ein
  PreToolUse-Hook ausschließlich bei Exit 2 blockt, wäre der Guard damit still fail-open
  (Issue #29). `.harness/tests/hook.test.ts` fängt den Fall ab.
