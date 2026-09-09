## Why

Seit #12 hat das VTT Konten mit E-Mail und Passwort, aber zwei Lücken, die ein echtes
Projekt nicht offen lassen kann (Issue #13, Teil von Epic #5): Ein Angreifer darf heute
unbegrenzt Passwörter gegen eine bekannte E-Mail durchprobieren — die einzige Bremse ist die
Rechenzeit von scrypt. Und ein Nutzer, der sein Passwort für kompromittiert hält, kann es
nicht ändern; ein fremder Browser mit gestohlenem Cookie bliebe ohnehin angemeldet.

## What Changes

- **Sperre nach Fehlversuchen, je Konto.** Fünf fehlgeschlagene Anmeldungen gegen ein Konto
  sperren es für 15 Minuten; danach entsperrt es sich von allein. Eine erfolgreiche
  Anmeldung setzt den Zähler zurück. Fehlversuche während der Sperre verlängern sie nicht —
  sonst könnte ein Fremder ein Konto dauerhaft zuhalten. Zähler und Sperrzeitpunkt sind zwei
  Spalten am `Account`; kein IP-Bezug (Entscheidung des Menschen am 2026-09-09, Begründung
  in design.md D1).
- **Die Sperre ist stumm.** Ein gesperrtes Konto antwortet auf jede Anmeldung — auch mit
  richtigem Passwort — exakt wie auf ein falsches Passwort: `401`, gleiche Meldung, und der
  Hash wird trotzdem geprüft, damit auch die Antwortzeit nichts verrät. Die Invariante
  „unbekannte E-Mail ist von falschem Passwort nicht zu unterscheiden" aus #12 bekommt keine
  Ausnahme (design.md D2).
- **Passwortänderung im angemeldeten Zustand.** `POST /api/auth/password` nimmt bisheriges
  und neues Passwort entgegen; das neue unterliegt derselben Regel wie bei der Registrierung
  (15–128 Zeichen). Ein falsches bisheriges Passwort zählt als Fehlversuch, ein gesperrtes
  Konto kann sein Passwort nicht ändern.
- **Passwortänderung beendet alle anderen Sitzungen.** Die Sitzung, aus der geändert wurde,
  bleibt; jede andere Sitzungszeile des Nutzers wird in derselben Transaktion gelöscht
  (design.md D4).
- **Oberfläche:** die angemeldete Ansicht bekommt ein Formular zur Passwortänderung mit
  sichtbarer Erfolgs- bzw. Fehlermeldung.

**Nicht im Umfang:** Passwort-Reset per E-Mail (Mailversand, externer Dienst, Secrets — siehe
Epic #5), IP-basiertes Rate-Limiting (gehört an die Kante, nicht in die App), ein Hinweis
auf Fehlversuche nach erfolgreicher Anmeldung (Folge-Issue), eine Sitzungsverwaltung
(„andere Geräte abmelden" ohne Passwortänderung).

## Capabilities

### New Capabilities
Keine — alles erweitert `user-auth`.

### Modified Capabilities
- `user-auth`:
  - neue Requirement „Sperre nach Fehlversuchen": Schwelle, Dauer, automatische Entsperrung,
    Zurücksetzen bei Erfolg, Kontobezug, stumme Antwort.
  - neue Requirement „Passwortänderung": Endpunkt, Bestätigung des bisherigen Passworts,
    Passwortregel, Beenden der anderen Sitzungen, Zusammenspiel mit der Sperre.
  - neue Requirement „Passwortänderung in der Oberfläche": Formular in der angemeldeten
    Ansicht, Erfolgs- und Fehlermeldung.

## Impact

**Schema** (`prisma/schema.prisma`): zwei neue Spalten am `Account` (`failedLoginCount`,
`lockedUntil`) plus zugehörige Migration unter `prisma/migrations/`. Die Migrationsdatei
erzeugt der implementer gegen die ephemere Wegwerf-DB (`guard.ts` lässt genau das zu); gegen
die Entwicklungs- und Zielumgebung führt sie ein Mensch bzw. die CI aus (`constitution.md`
§5.1, §6.1).

**Server** (`src/server/auth/`): `rules.ts` (Sperrregel als reine Funktionen mit injizierter
Uhr), `routes.ts` (Sperrprüfung und Zählerpflege im Anmeldepfad, neue Route zur
Passwortänderung), ggf. `session.ts` (Löschen fremder Sitzungen eines Nutzers).

**Shared** (`src/shared/auth.ts`): Schema für den Anfragekörper der Passwortänderung.

**Client** (`src/client/auth/`, `src/client/app/App.tsx`): Formular zur Passwortänderung,
API-Aufruf, Einbau in die angemeldete Ansicht.

**Tests** (Integrations- und Komponententests zu `user-auth`): ein Test je neuem Szenario;
die Integrationstests brauchen die injizierte Uhr, um Sperrablauf ohne Warten zu prüfen.

**Keine** neuen Dependencies.
