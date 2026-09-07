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
- Typecheck: `pnpm typecheck` (tsc --noEmit)
- Lint: `pnpm lint` · Autofix: `pnpm lint:fix`
- Format: `pnpm format` (Prettier)
- Unit-Tests: `pnpm test:unit`
- Integrationstests: `pnpm test:integration` — gegen eine ephemere SQLite-Wegwerfdatei
  (`test.db`), die pro Lauf angelegt, migriert und danach gelöscht wird. Kein Docker nötig.
- Alle Tests: `pnpm test`
- Harness-eigene Tests: `pnpm test:harness`
- Prisma-Client generieren: `pnpm db:generate`
- Migrationen führt der Agent nicht aus. Er schreibt das Schema unter `prisma/`; das
  Ausführen ist menschlich (constitution.md §5.1) bzw. Sache der CI (§6.1).

## Projektstruktur
- `src/domain/` — Spiellogik, framework-frei: kein PixiJS, kein Socket, kein Prisma, kein React.
  Sichtbarkeit, Berechtigungen, Distanzen, Status-/Effektstapel, Healthbar-Übergänge.
- `src/shared/` — Wire-Protokoll: Event-Typen und zod-Schemas, von Client **und** Server genutzt.
- `src/server/` — Fastify, Socket.IO, Prisma-Zugriff. Dünn: übersetzt Events in Domänenaufrufe.
- `src/client/` — React-Komponenten und der PixiJS-Adapter. Dünn: rendert, sendet Absichten.
- `prisma/` — Schema + Migrationen
- `tests/` — Tests (`*.unit.test.ts(x)`, `*.integration.test.ts`)
- `openspec/` — Specs & Changes (Intent-Quelle)
- `.claude/agents/` — Subagent-Definitionen
- `.harness/` — Orchestrierungs-Skill/Skript & Run-State (`runs/`, `wt/` sind gitignored)

## Konventionen (je ein Beispiel)

**Der Server ist autoritativ.** Clients senden Absichten, nie Zustand. Der Server prüft,
entscheidet und broadcastet das Ergebnis. Ein Client, der `{ token: 'x', position: [4,7] }`
als Tatsache schickt, ist ein Fehler — richtig ist `{ type: 'token:move', token: 'x', to: [4,7] }`,
und der Server antwortet mit dem, was tatsächlich passiert ist.

**Fog of War wird serverseitig gefiltert, nie clientseitig maskiert.** Was ein Spieler nicht
sehen darf, verlässt den Server nicht — eine im Client ausgeblendete Karte steht in der
DevTools-Konsole. Jeder Broadcast wird pro Empfänger auf dessen Sicht reduziert:
```ts
for (const [socketId, viewer] of session.viewers)
  io.to(socketId).emit('state:patch', visibleTo(state, viewer)) // nie io.emit(state)
```

**Spiellogik gehört nach `src/domain/` und ist eine pure Funktion.** Kein I/O, keine Zeit,
kein Zufall aus der Umgebung — Würfel und Uhr kommen als Parameter herein:
```ts
export function applyDamage(token: Token, amount: number): Token   // ja
export async function applyDamage(id: string): Promise<void>       // nein: lädt und schreibt selbst
```

**Socket-Handler sind Übersetzer, keine Logik.** Ein Handler validiert, ruft die Domäne und
verteilt das Ergebnis. Steht Spiellogik im Handler, ist sie nicht mehr ohne Transport testbar.

**Jedes eingehende Event wird an der Grenze mit zod validiert.** Das Schema liegt in
`src/shared/`, damit Client und Server denselben Vertrag benutzen:
```ts
export const TokenMove = z.object({ token: z.string(), to: z.tuple([z.number(), z.number()]) })
const move = TokenMove.parse(payload) // wirft bei ungültig → Event wird verworfen
```

**Berechtigungen werden bei jedem Event geprüft, nicht beim Verbinden.** Ob ein Spieler
diesen Token bewegen darf, entscheidet der Server pro Aktion — die Zuweisung kann sich
mitten in der Session ändern.

**Datenzugriff nur über Prisma**, kein rohes SQL ohne begründete Ausnahme. Mehrschrittige
Schreibvorgänge in eine Transaktion klammern.

**PixiJS bleibt im Adapter.** Der Spielzustand lebt in React/Domäne, nicht im Pixi-Szenengraph;
der Adapter spiegelt Zustand auf Sprites. Pixi-Objekte werden beim Unmount zerstört
(`app.destroy()`, `texture.destroy()`) — sonst leckt jede Kartenumschaltung GPU-Speicher.

**Fehler sprudeln bis zum zentralen Handler**; kein stilles `catch {}`. Ein Socket-Event, das
scheitert, meldet das dem Absender zurück, statt lautlos zu verpuffen.

## Tests
- Pro GIVEN/WHEN/THEN-Szenario genau ein Test; Testname = Szenarioname.
- Verhalten mit DB-Bezug → Integrationstest gegen die ephemere Wegwerf-DB.
  Domänenlogik → Unit-Test. Das ist der Regelfall: je mehr Verhalten in `src/domain/` liegt,
  desto mehr ist überhaupt aussagekräftig testbar.
- Rendering wird nicht per Test abgenommen, sondern im menschlichen App-Test
  (constitution.md §3.4). Getestet wird, was der Adapter *bekommt*, nicht wie es aussieht.
- Komponententests sind Unit-Tests (`tests/<name>.unit.test.tsx`) mit
  `/** @jest-environment jsdom */`-Docblock am Dateianfang statt globaler jsdom-Umgebung —
  sonst laufen die Server-Tests nicht mehr unter `node`. `@testing-library/react` für
  `render`/`screen`/`fireEvent`.
- PixiJS läuft nicht in jsdom (WebGL). Komponenten, die den Adapter einbinden, mocken
  `pixi.js` über das Mapping in `jest.config.cjs`.
- Socket-Verhalten wird gegen die Handler-Funktion getestet, nicht gegen einen echten
  Server: Event rein, Domänenaufruf und ausgehende Nachrichten raus.
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

## Kritische Grenzen (immer)
- Niemals Secrets/Credentials committen oder ausgeben.
- Niemals Migrationen/Deploys gegen die produktive Zielumgebung ausführen (nur CI-Pipeline).
- Niemals direkt auf `main` pushen; Änderungen nur per PR.
- Keine neuen Dependencies ohne menschliche Freigabe — Bedarf + Begründung
  nennen, nicht selbst installieren.
- implementer: Testdateien weder lesen noch ändern. Auch die Testsuite selbst nicht
  ausführen — ihre Ausgabe enthält Testquellcode. Das Gate läuft über den Orchestrator.

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
