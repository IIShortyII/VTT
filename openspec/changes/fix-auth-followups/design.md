## Context

Der Auth-Code aus `add-user-auth` (Design dort: `openspec/changes/archive/2026-09-07-add-user-auth/design.md`,
im Folgenden „D-alt") ist klein und noch von nichts abhängig. Dieser Change ändert an seiner
Struktur nichts — Regeln in `rules.ts`, Sitzungs-Anbindung in `session.ts`, dünne Fastify-
Anbindung in `routes.ts`, Client ohne Router — sondern schließt fünf Lücken darin.

Motivation: siehe `proposal.md` — Why. Verhalten: siehe `specs/user-auth/spec.md` (Delta) und
`openspec/specs/user-auth/spec.md` (Basis).

Bindend und hier nicht wiederholt: `constitution.md` §9 und `AGENTS.md`.

## Goals / Non-Goals

**Goals:**
- Die Datenbank ist die einzige Quelle der Sitzungslaufzeit; das Cookie ist nur ihre Projektion.
- Fehlerpfade (abgelaufen, kaputter Körper, Server weg) verhalten sich konsequent zu den
  bereits vorhandenen Pfaden, statt Sonderfälle zu bleiben.
- Die Wegwerf-DB der Integrationstests entsteht auf demselben Weg wie die Zielumgebung.

**Non-Goals:**
- Kein Umbau des Sitzungsmodells (weiterhin opake ID in der DB, D-alt D4/D5).
- Kein Hintergrundjob zum Aufräumen verwaister Sitzungen. Mit D1 entstehen sie nicht mehr
  durch verlorene Antworten; was bleibt, sind Sitzungen von Browsern, die nie wiederkommen —
  das ist der in D-alt D5 bewusst akzeptierte Zustand.
- Keine Retry-Logik im Client. Ein Hinweis plus Neuladen durch den Nutzer genügt für ein
  Werkzeug, das am Spieltisch läuft.

## Decisions

### D1 — Cookie-Laufzeit aus `expiresAt`, gesetzt bei jeder authentifizierten Antwort

Der Cookie-Helfer bekommt den Ablaufzeitpunkt der Sitzung und die injizierte Uhr und leitet
`maxAge` daraus ab (`ceil((expiresAt − now) / 1000)`, nie negativ). Er wird an allen drei
Stellen benutzt, an denen eine Antwort authentifiziert ist: Registrierung, Anmeldung
(jeweils mit `expiresAt` der frisch angelegten Sitzung — ergibt wie bisher die volle
Laufzeit) und `GET /api/auth/me` (mit `expiresAt` der aufgelösten Sitzung — verlängert oder
unverändert). Die Konstante `SESSION_TTL_SECONDS` verliert damit ihren Abnehmer in `routes.ts`.

`resolveSession` liefert weiterhin `expiresAt`; das Flag `renewed` hat keinen Leser mehr und
entfällt, samt dem Kommentar, der die Cookie-Erneuerung an dieses Flag band.

Verworfen — nur bei Verlängerung setzen, aber mit abgeleiteter Laufzeit: schließt die Lücke
nicht, weil nach einem verlorenen Verlängerungs-Response die nächste Verlängerung erst
fällig ist, wenn das Cookie längst abgelaufen ist (genau der Befund aus #25). Verworfen —
Randfall akzeptieren: vom Menschen am 2026-09-09 abgelehnt.

Preis: ein `Set-Cookie`-Header pro `/me`-Antwort. Kein DB-Schreibzugriff — die Halbwertsregel
(D-alt D5) bleibt unverändert der einzige Auslöser für ein Update der Zeile.

### D2 — Ablauf-Zweig entwertet das Cookie

`resolveSession` unterscheidet heute nicht zwischen „keine Zeile" und „Zeile abgelaufen und
gelöscht" — beides `null`. Für das Entwerten braucht `routes.ts` diese Unterscheidung nicht:
in beiden Fällen ist das vorgelegte Cookie wertlos, und `clearCookie` auf ein Cookie, das der
Browser gar nicht hat, ist harmlos. Der `401`-Zweig nach `resolveSession` ruft deshalb
einheitlich `clearSessionCookie` auf. Der Zweig „kein Cookie vorgelegt" bleibt ohne
`clearCookie` — es gibt nichts zu entwerten, und ein überflüssiger Header auf jeder anonymen
Anfrage wäre Rauschen.

### D3 — Zweigwahl bei Anmeldefehlern: „ist das überhaupt eine Anmeldung?"

Die heutige Zweigwahl sucht nach einer Issue mit `path[0] === 'email'` und behandelt alles
andere als `401`. Bei nicht-objektförmigem Körper meldet zod eine einzelne Issue mit leerem
`path` — sie fällt in den `401`-Zweig. Neue Regel, als kleine reine Funktion formuliert:
`401` **nur**, wenn *alle* Issues am Feld `password` hängen (der Körper ist also ein Objekt
mit gültiger E-Mail und einem Passwort falscher Form — laut D-alt/Review-Runde 2 bewusst wie
falsche Zugangsdaten behandelt). Jede andere Konstellation — leerer Pfad, `email`, beides —
ist `400`. Das `field`-Antwortfeld wird nur gesetzt, wenn die Issue einen Pfad hat; bei leerem
Pfad entfällt es, statt als leerer String zu erscheinen.

Die Registrierung nutzt dieselbe Pfad-zu-`field`-Übersetzung (heute liefert `path.join('.')`
dort bei leerem Pfad `''`); ihr Statuscode ist ohnehin `400`. Ihre spezifizierten Szenarien
ändern sich dadurch nicht.

### D4 — Client: Fehler an der Stelle fangen, an der der Zustand entschieden wird

Zwei `try/catch` in `App.tsx`, kein neuer Zustandstyp:

- **Mount-Effekt:** schlägt `fetchCurrentUser` fehl (Netzfehler, Nicht-JSON-Antwort,
  Schema-Verletzung), wird der Zustand `anonym` gesetzt und ein Hinweistext in einem eigenen
  `hinweis`-State abgelegt, der über dem Anmeldeformular erscheint. `anonym` ist die einzige
  ehrliche Wahl: der Server hat keinen Nutzer bestätigt (§9.1), und nur so kommt der Besucher
  an ein Formular, mit dem er es erneut versuchen kann. Der Hinweis bleibt, bis eine
  Anmeldung oder Registrierung gelingt.
- **Abmeldung:** scheitert `logout` oder die anschließende Rückfrage an `/api/auth/me` mit
  einem geworfenen Fehler, bleibt der Zustand unverändert (`angemeldet` — der Server hat die
  Abmeldung nicht bestätigt) und dieselbe `hinweis`-Fläche zeigt die Fehlermeldung in der
  angemeldeten Ansicht. Der bestehende Pfad für eine *beantwortete*, aber nicht erfolgreiche
  Abmeldung (Rückfrage an `/me`) bleibt.

Die Meldungstexte sind kurz und nennen die Ursache („Der Server ist nicht erreichbar.",
„Abmelden fehlgeschlagen: …"). Ein `console.error` des gefangenen Fehlers ist erlaubt, kein
stilles `catch {}` (AGENTS.md).

`fetchCurrentUser` in `api.ts` bleibt, wie es ist: es unterscheidet bereits „Server sagt
nein" (`null`) von „keine brauchbare Antwort" (wirft). Genau diese Unterscheidung braucht D4.

### D5 — Wegwerf-DB über `prisma migrate deploy`

Der `beforeAll` des Integrationstests ruft statt `prisma db push --skip-generate` das
Kommando `prisma migrate deploy` gegen `DATABASE_URL=file:…/prisma/test.db` auf. Damit wird
die Wegwerf-DB aus `prisma/migrations/` aufgebaut — derselbe Weg wie in der CI-Pipeline
(`constitution.md` §6.1). Eine vergessene Migration lässt die Integrationstests rot werden
statt erst den Deploy.

`migrate deploy` ist nicht destruktiv und legt bei SQLite die Datei an, wenn sie fehlt; der
leere Startzustand kommt weiterhin aus der zuvor gelöschten Datei, nicht aus einem
Reset-Kommando. Der Guard (`.harness/guard.ts`, `MIGRATION_COMMANDS`) erlaubt `migrate deploy`
genau wie `db push` ausschließlich gegen die ephemere DB.

Das ist eine Änderung im Pfadbereich des test-author — sie gehört in dessen Runde, nicht in
die des implementer.

### D6 — Hauptspec aus dem archivierten Delta

`openspec/specs/user-auth/spec.md` wird aus dem archivierten Delta angelegt (Purpose
übernommen, `## ADDED Requirements` → `## Requirements`), damit dieses Delta eine Basis hat.
Kein inhaltlicher Eingriff; die Datei ist Teil dieses Branches, weil sie der erste Change
ist, der sie braucht.

Zeitpunkt: `pnpm harness start` trägt nur `openspec/changes/<change>` in den Worktree, und
danach steht der Rollenmarker auf `test-author` — `openspec/specs/` ist der Sitzung dann
gesperrt. Die Hauptspec wird deshalb erst im Abschluss-Schritt übernommen, wenn die Sitzung
rollenlos ist (nach der App-Freigabe, vor dem Archivieren). Bis dahin liegt sie untracked im
Hauptrepo; test-author, implementer und reviewer brauchen sie nicht — das Delta enthält die
geänderten Requirements vollständig, die unveränderten stehen im archivierten Change.

## Risks / Trade-offs

- **Ein `Set-Cookie` pro `/me`-Antwort könnte Caches oder Proxys irritieren** → `/me` ist ein
  authentifizierter, nutzerbezogener Endpunkt, der ohnehin nie gecacht werden darf; ein
  zusätzlicher Header ändert daran nichts.
- **Die Cookie-Laufzeit wird sekundengenau aus der Uhr abgeleitet; Tests vergleichen sie mit
  der Restlaufzeit** → `ceil` statt `floor`, und die Spec verlangt eine Schranke („nicht länger
  als der Abstand …, kürzer als 30 Tage"), keinen exakten Wert. Die Tests sollten mit
  Toleranz im Sekundenbereich prüfen.
- **`migrate deploy` ist langsamer als `db push`** → eine Migration, einmal pro Testlauf;
  im Rauschen der scrypt-Kosten.
- **Der test-author ändert ein bestehendes Test-Setup** → Bricht dadurch die gesamte Datei,
  ist das ein Rot aus dem falschen Grund (§3.1) und fällt bei `confirm-red` auf.
- **Der Szenarioname „Aktivität in der ersten Hälfte der Laufzeit ändert nichts" bleibt,
  obwohl jetzt ein Cookie gesetzt wird** → OpenSpec erlaubt in einem MODIFIED-Block kein
  Umbenennen; „nichts" bezieht sich auf die Sitzung, der THEN-Text sagt das jetzt
  ausdrücklich. Der bestehende Test behält seinen Namen und bekommt die neue Assertion.
