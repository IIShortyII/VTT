## Why

Der reviewer hat in #12 fünf nicht blockierende Hinweise gemeldet, die dort nicht mehr
umgesetzt wurden, weil das Rundenbudget aus `constitution.md` §3.5 aufgebraucht war
(Sammelticket Issue #25). Einer davon — Cookie und Sitzung laufen auseinander — ist ein
echter Nutzerfehler mit Langzeitwirkung: geht genau die Antwort verloren, die die Sitzung
verlängert hat, wird der Nutzer trotz gültiger Sitzung abgemeldet, und die verwaiste
Sitzungszeile bleibt liegen. Die übrigen vier sind Inkonsequenzen, die sich jetzt, solange
der Auth-Code klein ist, billiger schließen lassen als nach dem nächsten Feature darauf.

## What Changes

- **Sitzungscookie bei jeder authentifizierten Antwort** (Punkt 1). Die Laufzeit des Cookies
  wird aus dem Ablaufzeitpunkt der Sitzung abgeleitet, nicht mehr aus der Konstanten; damit
  ist die Datenbank allein die Quelle der Laufzeit (`constitution.md` §9.1), und ein
  verlorener Verlängerungs-Response holt sich beim nächsten Aufruf selbst nach. **Das ändert
  die Spec**: das Szenario „Aktivität in der ersten Hälfte der Laufzeit ändert nichts"
  verlangte bisher ausdrücklich, dass *kein* Cookie gesetzt wird. Entscheidung des Menschen
  am 2026-09-09: Spec ändern, nicht Randfall festschreiben.
- **Abgelaufene Sitzung entwertet das Cookie** (Punkt 2). Die `401`-Antwort auf eine
  abgelaufene Sitzung löscht neben der Zeile auch das Cookie im Browser — konsequent zum
  Abmeldepfad.
- **Strukturell kaputter Anmeldekörper ist `400`, nicht `401`** (Punkt 3). Ein Körper, der
  kein Objekt ist (`null`, String, Array), wird als ungültige Anfrage beantwortet statt als
  falsche Zugangsdaten.
- **Client fängt Fehler der Auth-Abfragen** (Punkt 4). Ist der Server beim Start nicht
  erreichbar, fällt die Anwendung auf „anonym" zurück und zeigt einen Hinweis statt dauerhaft
  „Lädt …"; scheitert die Abmeldung, wird die Fehlermeldung angezeigt. Keine unbehandelte
  Promise-Rejection mehr.
- **Integrationstests bauen die Wegwerf-DB aus `prisma/migrations/`** (Punkt 5, kein
  Verhalten des Systems, sondern Testinfrastruktur — Pfadbereich des test-author). Bisher
  `prisma db push` aus `schema.prisma`; damit fiele eine vergessene Migration erst beim
  Deploy auf.
- **Hauptspec nachgeholt**: `openspec/specs/user-auth/spec.md` existierte nicht, obwohl der
  Change `add-user-auth` archiviert ist — das Delta wurde beim Archivieren nicht in die
  Hauptspec übernommen. Ohne Basis lässt sich kein MODIFIED-Delta anwenden; die Hauptspec
  wird in diesem Change aus dem archivierten Delta angelegt.

**Nicht im Umfang:** Fehlversuchssperre und Passwortänderung (#13), Socket-Authentifizierung,
alles, was nicht in #25 steht.

## Capabilities

### New Capabilities
Keine.

### Modified Capabilities
- `user-auth`:
  - Requirement „Ablauf und gleitende Verlängerung der Sitzung": jede authentifizierte
    Antwort trägt das Sitzungscookie mit der verbleibenden Laufzeit; eine abgelaufene
    Sitzung entwertet das Cookie.
  - Requirement „Anmeldung": ein strukturell ungültiger Anfragekörper wird mit `400`
    beantwortet.
  - Requirement „Anmeldeoberfläche": Ausfall des Servers beim Start und Fehlschlag der
    Abmeldung werden sichtbar gemacht statt verschluckt.

## Impact

**Server** (`src/server/auth/`): `routes.ts` (Cookie-Helfer mit abgeleiteter Laufzeit, Aufruf
bei jeder authentifizierten Antwort, `clearCookie` im Ablauf-Zweig, Zweigwahl bei
Anmeldefehlern), `session.ts` (das `renewed`-Flag wird überflüssig; `expiresAt` bleibt).

**Client** (`src/client/app/App.tsx`): Fehlerbehandlung im Mount-Effekt und in der
Abmeldung, ein zusätzlicher Hinweistext in der Ansicht.

**Tests** (Integrations- und Komponententests zu `user-auth`): neue bzw.
angepasste Tests je geändertem Szenario; Aufbau der Wegwerf-DB über
`prisma migrate deploy` statt `prisma db push`. Der Guard erlaubt beides ausschließlich gegen
`test.db` (`.harness/guard.ts`).

**Specs** (`openspec/specs/user-auth/spec.md`): wird neu angelegt (siehe oben) und beim
Archivieren dieses Change um das Delta ergänzt.

**Keine** neuen Dependencies, **keine** Schemaänderung, **keine** Migration.
