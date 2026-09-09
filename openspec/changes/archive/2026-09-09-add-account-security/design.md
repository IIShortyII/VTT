## Context

Der Auth-Code aus `add-user-auth` (Design dort:
`openspec/changes/archive/2026-09-07-add-user-auth/design.md`, im Folgenden „D-alt") und die
Nachlese `fix-auth-followups` sind gemergt. Struktur: Regeln in `rules.ts` (rein, mit
injizierter Uhr), Sitzungs-Anbindung in `session.ts`, dünne Fastify-Anbindung in `routes.ts`,
gemeinsamer zod-Vertrag in `src/shared/auth.ts`, Client ohne Router. Dieser Change hängt zwei
Fähigkeiten daran, ohne die Struktur zu ändern.

Motivation: `proposal.md` — Why. Verhalten: `specs/user-auth/spec.md` (Delta) und
`openspec/specs/user-auth/spec.md` (Basis). Die vier offenen Fragen aus Issue #13 hat der
Mensch am 2026-09-09 entschieden; die Entscheidungen stehen unten je bei D1–D4.

Bindend und hier nicht wiederholt: `constitution.md` §9 und `AGENTS.md`.

## Goals / Non-Goals

**Goals:**
- Online-Raten gegen ein Konto ist nach fünf Versuchen für 15 Minuten wirkungslos, ohne dass
  ein legitimer Nutzer dauerhaft ausgesperrt werden kann.
- Der Anmeldepfad verrät weiterhin nichts — weder Kontoexistenz noch Sperrzustand, weder
  über Status/Meldung noch über die Antwortzeit.
- Eine Passwortänderung schließt fremde Browser aus, ohne den eigenen abzumelden.
- Alles zeitabhängige Verhalten ist über die injizierte Uhr deterministisch testbar.

**Non-Goals:**
- Kein IP-Rate-Limit, keine zweite Tabelle. Begründung in D1.
- Kein Hintergrundjob, der abgelaufene Sperren zurücksetzt: die Sperre ist ein Zeitpunkt,
  kein Zustand, und wird beim nächsten Versuch als abgelaufen erkannt.
- Keine Regel „neues Passwort muss sich vom alten unterscheiden" — NIST 800-63B verlangt sie
  nicht, und sie brächte einen zweiten scrypt-Lauf pro Änderung.
- Keine Sitzungsübersicht im Client.

## Decisions

### D1 — Zähler und Sperrzeitpunkt als zwei Spalten am `Account`

```prisma
model Account {
  // ... wie bisher
  failedLoginCount Int       @default(0)
  lockedUntil      DateTime?
}
```

Der Bezug ist das Konto, nicht die IP (Entscheidung Frage 1). Eine IP-Sperre bräuchte die
Client-Adresse — hinter einem Reverse Proxy also `trustProxy`-Konfiguration — und träfe eine
ganze Spielrunde hinter einem NAT gemeinsam. Sie bremst breite Angriffe (viele Konten, ein
Passwort), aber das ist ein Rate-Limit, das an die Kante gehört, nicht in die App. Das Konto
ist das, was #13 schützen will.

Die Spalten liegen am `Account`, nicht am `User`, weil der Fehlversuch zum Anmeldeverfahren
gehört (D-alt D2: ein zweiter Provider bekäme eigene Zähler). Beide Spalten haben Defaults
bzw. sind nullable, damit die Migration bestehende Zeilen nicht anfassen muss.

**Migrationsdatei:** Das Gate baut die Wegwerf-DB seit `fix-auth-followups` (D5 dort) aus
`prisma/migrations/` auf — ohne Migrationsdatei bleiben alle Integrationstests rot, aus dem
falschen Grund. Der implementer erzeugt sie deshalb selbst:

```
DATABASE_URL=file:./prisma/test.db pnpm exec prisma migrate dev --name add-account-security
```

`guard.ts` lässt `migrate dev` ausschließlich gegen `test.db` zu; das ist die ephemere DB, keine
Zielumgebung (§5.1 bleibt gewahrt). Die Entwicklungs-DB (`dev.db`) migriert der Mensch vor
dem App-Test mit `migrate deploy`; die produktive führt die CI aus (§6.1). Der Guard prüft
auch Commit-Nachrichten auf Migrationskommandos — die Commit-Message nennt die Migration
also beim Namen, nicht das Kommando.

### D2 — Sperrregel als reine Funktionen; die Sperre ist stumm

In `rules.ts`, ohne Prisma, mit `now` als Parameter:

```ts
export const LOCKOUT_THRESHOLD = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export function isAccountLocked(lockedUntil: Date | null, now: Date): boolean
// true, solange lockedUntil in der Zukunft liegt

export function recordFailedAttempt(state: LockoutState, now: Date): LockoutState
// gesperrt → unverändert (kein Schreibzugriff, Frage 3: Fehlversuche während der Sperre
//   verlängern sie nicht — sonst kann ein Fremder das Konto dauerhaft zuhalten)
// sonst count+1; erreicht count+1 die Schwelle → lockedUntil = now + Dauer, count = 0
// (der Zähler beginnt nach Ablauf der Sperre bei null, nicht bei fünf)

export function clearLockout(): LockoutState
// { failedLoginCount: 0, lockedUntil: null }
```

`LockoutState` ist `{ failedLoginCount: number; lockedUntil: Date | null }` — genau die beiden
Spalten. Schwelle 5, Dauer 15 Minuten (Frage 3, OWASP-Rahmen): bei 15-Zeichen-Passphrasen
sind fünf Versuche pro Viertelstunde für Raten wertlos, ein Tippfehler-Mensch merkt die Sperre
kaum. Und weil die Sperre stumm ist, muss die Dauer kurz sein — sonst wird „mein Passwort
geht nicht" zum Supportfall.

**Anmeldepfad in `routes.ts`, Reihenfolge ist Teil der Entscheidung (Frage 2):**

1. Konto laden, Passwort **immer** gegen den Hash (oder Dummy-Hash) prüfen — auch bei
   gesperrtem Konto. Ein Kurzschluss vor scrypt wäre eine messbar schnellere Antwort und
   damit ein Timing-Kanal für „dieses Konto existiert und ist gesperrt".
2. Ist das Konto gesperrt: `401` mit **derselben** Meldung wie bei falschem Passwort, keine
   Sitzung, kein Cookie, kein Schreibzugriff — unabhängig davon, ob das Passwort stimmte.
3. Ist das Passwort falsch: `recordFailedAttempt` anwenden, Zeile schreiben, `401`.
4. Ist das Passwort richtig: `clearLockout` anwenden — Zeile nur schreiben, wenn sich etwas
   ändert (sonst schriebe jede Anmeldung) —, Sitzung anlegen, `200`.

Ein eigener Status (`423`) wurde verworfen: er verriete, dass das Konto existiert — wer
fünfmal gegen eine E-Mail anläuft, wüsste danach, ob sie registriert ist — und risse ein
Loch in die Requirement „Zurückhaltung des Servers" aus #12. Der Preis: der legitime Nutzer
sieht während der Sperre „E-Mail oder Passwort ist falsch". Bei 15 Minuten verschmerzbar;
ein Hinweis auf Fehlversuche *nach* erfolgreicher Anmeldung wäre der ehrlichere Weg und ist
als Folge-Issue geparkt.

**Was zählt als Fehlversuch:** eine formal mögliche Anmeldung (Objekt, gültige E-Mail,
Passwort in gültiger Form) gegen ein existierendes Konto mit falschem Passwort — und ein
falsches bisheriges Passwort bei der Passwortänderung (D3). Nicht gezählt: unbekannte E-Mail
(kein Konto, nichts zu zählen) und der `401`-Kurzschluss bei Passwort falscher Form (der
Wert wird gar nicht gegen das Konto geprüft, D-alt/Review-Runde 2). Ein Zähler pro E-Mail
für unbekannte Konten entstünde nur mit einer weiteren Tabelle — Non-Goal.

### D3 — `POST /api/auth/password`: Passwortänderung aus der Sitzung heraus

Anfragekörper (Schema in `src/shared/auth.ts`, von Client und Server benutzt):

```ts
export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH), // Form wie beim Login
  newPassword: PasswordSchema,                                   // Regel wie bei Registrierung
})
```

Ablauf in `routes.ts`:

1. Sitzung aus dem Cookie auflösen (`resolveSession`, wie `/me`); keine oder abgelaufene
   Sitzung → `401`, Cookie entwertet wie bei `/me`.
2. Körper validieren; Verstoß → `400` mit `field` (`currentPassword` bzw. `newPassword`),
   **bevor** irgendetwas geprüft wird — ein Fehlversuchszähler darf nicht an einer
   Formverletzung des neuen Passworts hochzählen.
3. Konto des Nutzers laden, bisheriges Passwort gegen den Hash prüfen — auch bei gesperrtem
   Konto (gleicher Grund wie D2 Schritt 1).
4. Gesperrt oder bisheriges Passwort falsch → `403` mit `field: 'currentPassword'` und der
   Meldung „Das bisherige Passwort ist falsch." Ein falsches Passwort zählt als Fehlversuch
   (D2-Regel, Zeile wird geschrieben); bei gesperrtem Konto bleibt die Zeile unverändert.
   Warum `403` und nicht `401`: der Nutzer *ist* angemeldet, der Client darf ihn nicht
   abmelden. Warum eine ehrliche Meldung, anders als beim Login: hier gibt es nichts zu
   verschleiern — wer eine gültige Sitzung hat, weiß, dass das Konto existiert.
   Warum dieselbe Antwort für „gesperrt": wer die Sperre ausgelöst hat, hat die Sitzung
   möglicherweise gestohlen und rät jetzt hier weiter; das Formular ist dieselbe
   Rate-Oberfläche wie der Login und bekommt dieselbe Bremse.
5. Sonst in **einer Transaktion**: neuen Hash schreiben, Zähler und Sperre zurücksetzen
   (`clearLockout`), alle Sitzungszeilen des Nutzers **außer der aktuellen** löschen (D4).
   Antwort `200 { ok: true }`. Das Cookie bleibt unverändert — die eigene Sitzung lebt.

Das Hashen des neuen Passworts (`hashPassword`) passiert vor der Transaktion; scrypt in einer
offenen Transaktion würde SQLite unnötig lange sperren.

### D4 — Passwortänderung beendet alle anderen Sitzungen

Entscheidung Frage 4. Der Grund für eine Passwortänderung ist meist ein Verdacht — dann muss
ein fremder Browser rausfliegen. Die eigene Sitzung bleibt: sie wurde gerade durch das
bisherige Passwort bestätigt, und ein Nutzer, der direkt nach der Änderung abgemeldet ist,
wundert sich. Umsetzung als `session.deleteMany({ where: { userId, id: { not: currentId } } })`
innerhalb der Transaktion aus D3 — Hash und Sitzungen ändern sich zusammen oder gar nicht.

Ein Cookie einer gelöschten Sitzung landet beim nächsten `/me` im bestehenden `401`-Zweig
(Zeile fehlt → Cookie entwertet, `fix-auth-followups` D2). Nichts Neues nötig.

### D5 — Client: Formular in der angemeldeten Ansicht

Neue Komponente `src/client/auth/ChangePasswordForm.tsx` nach dem Muster von `LoginForm`:
zwei Passwortfelder (`autoComplete="current-password"` / `"new-password"`), ein
Absende-Button, eine `role="alert"`-Fläche für die Meldung. `api.ts` bekommt
`changePassword(input)`, das wie `register` zuerst lokal mit `safeParse` prüft (kein
Netzaufruf bei zu kurzem neuen Passwort) und die `ErrorOutput`-Form des Servers durchreicht.

Verhalten: Erfolg → Meldung „Passwort geändert." und beide Felder geleert; Ablehnung
(`400`/`403`) → Meldung des Servers, Felder bleiben; geworfener Fehler → generische Meldung
wie in `LoginForm`. Die angemeldete Ansicht in `App.tsx` rendert das Formular unterhalb von
„Angemeldet als …". Kein Zustandswechsel in `App` — die Sitzung bleibt, der Server sagt nichts
anderes (§9.1).

Eine `401` auf die Passwortänderung (Sitzung inzwischen weg) behandelt das Formular wie jede
andere Ablehnung: Meldung anzeigen. Der nächste Reload holt den echten Stand über `/me`.
Kein Sonderpfad.

### D6 — Uhr durchreichen, nicht neu erzeugen

`lockedUntil` und der Vergleich „liegt in der Zukunft" laufen über die injizierte `Clock`
aus `AuthDeps` (D-alt D5). Die Integrationstests stellen die Uhr, um Sperrablauf ohne Warten
zu prüfen — genau wie heute schon für den Sitzungsablauf.

## Risks / Trade-offs

- **Ein Fremder kann ein Konto für 15 Minuten sperren, sooft er will** → bewusst akzeptiert
  (Frage 1/3): die Alternative — gar keine Sperre oder Sperre nur pro IP — schützt das Konto
  nicht. Die Dauer ist kurz, Fehlversuche während der Sperre verlängern sie nicht, und der
  Kontoinhaber kann sich mit gültigem Cookie weiterhin bewegen (die Sperre trifft nur die
  Anmeldung und die Passwortänderung).
- **Die stumme Sperre kostet den legitimen Nutzer Auskunft** → 15 Minuten, siehe D2;
  Folge-Issue für einen Hinweis nach erfolgreicher Anmeldung.
- **scrypt läuft auch bei gesperrtem Konto** → gewollt (Timing-Kanal); die Rechenzeit ist
  dieselbe wie bei jedem anderen Fehlversuch, die Sperre spart nur den Schreibzugriff.
- **Zwei Fehlversuche gleichzeitig könnten sich beim Hochzählen überholen** (read-modify-
  write ohne Sperre) → im schlimmsten Fall zählt ein Versuch nicht; die Schwelle wird dann
  einen Versuch später erreicht. Für SQLite mit einem Serverprozess vernachlässigbar; ein
  atomares `increment` wäre mit der Schwellen-Logik in einer Zeile nicht ausdrückbar.
- **Der implementer erzeugt eine Migrationsdatei** → nur gegen `test.db`, vom Guard erzwungen;
  der reviewer prüft die erzeugte SQL auf genau die zwei Spalten aus D1.

## Migration Plan

Eine additive Migration: zwei Spalten mit Default bzw. nullable, keine Datenwanderung.
Rollback: Spalten entfernen; verloren gehen nur laufende Zähler und Sperren.

## Open Questions

Keine — die vier Fragen aus dem Issue sind entschieden (siehe D1–D4).
