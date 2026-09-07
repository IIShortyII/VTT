## Context

`src/` enthält heute nur `.gitkeep`, `prisma/schema.prisma` nur Datenquelle und Generator,
`openspec/specs/` ist leer. Dieser Change ist damit nicht nur „Auth", sondern der Moment, in
dem der Verzeichnisschnitt, der Client-Bootstrap und das erste Datenmodell entstehen. Was
hier gewählt wird, wird kopiert — deshalb steht es hier begründet und nicht nur im Code.

Motivation: siehe `proposal.md` — Why. Verhalten: siehe `specs/user-auth/spec.md`.

Bindend und hier nicht wiederholt: `constitution.md` §9 (Server autoritativ, verdeckte
Information wird serverseitig gefiltert, Berechtigung pro Aktion) und `AGENTS.md`.

## Goals / Non-Goals

**Goals:**
- Ein Verzeichnisschnitt, dem man die Vertrauensgrenze ansieht.
- So viel Auth-Verhalten wie möglich in framework-freien Funktionen, damit der Loop es
  testen kann — Rendering nimmt nur der menschliche App-Test ab (§3.4).
- Zeitabhängiges Verhalten (Sitzungsablauf, gleitende Verlängerung) deterministisch testbar.

**Non-Goals:**
- Keine Abstraktionsschicht über Prisma, kein Repository-Pattern. Prisma *ist* die
  Datenzugriffsschicht (`AGENTS.md`).
- Kein generisches Auth-Framework. `Account` ist providerunabhängig geschnitten, aber es gibt
  genau einen Provider und keine Provider-Registry.
- Keine Socket.IO-Authentifizierung. Sie gehört zu dem Change, der den ersten Socket-Kanal
  einführt; §9.3 (Prüfung pro Aktion, nicht pro Verbindung) ist dort einzulösen.

## Decisions

### D1 — Verzeichnisschnitt: Grenze zuerst, Features darunter

```
src/
  server/
    core/     app.ts (Fastify-Instanz), prisma.ts, config.ts, clock.ts
    auth/     rules.ts (pur), routes.ts (Fastify-Anbindung), session.ts
    index.ts  Serverstart (listen)
  client/
    app/      App.tsx, main-Einstieg, Layout
    auth/     LoginForm.tsx, RegisterForm.tsx, api.ts
    main.tsx
  shared/
    auth.ts   zod-Verträge, von beiden Seiten importiert
```

Begründung: Die Vertrauensgrenze ist die Regel, an der in diesem Projekt alles hängt — sie
soll das Erste sein, was der Baum zeigt. Ein Prüfer sieht in Sekunden: nichts unter `client/`
entscheidet etwas. Verworfene Alternative: Feature-Ordner zuoberst (`auth/` mit
`client/server/shared` darin) — verteilt die Grenze über künftig sieben Ordner.

Prüfbare Folgeregel: **`shared/` importiert nichts, was nur serverseitig existiert**
(`@prisma/client`, `node:crypto`, `node:fs`). `shared/auth.ts` enthält deshalb nur zod-Schemas
und daraus abgeleitete Typen.

Zweite Regel, eine Ebene tiefer: **pro Feature Regeln von Glue trennen.** `server/auth/rules.ts`
ist rein und framework-frei (Hashen, Prüfen, Ablauf berechnen); `server/auth/routes.ts` ist
die dünne Fastify-Anbindung. Je mehr im ersten steht, desto mehr kann der Loop testen.

### D2 — `User` + `Account` getrennt

```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique          // normalisiert: getrimmt, lowercase
  createdAt DateTime  @default(now())
  accounts  Account[]
  sessions  Session[]
}

model Account {
  id           String @id @default(cuid())
  userId       String
  provider     String                  // "password"
  passwordHash String                  // Format siehe D3
  user         User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, provider])
}

model Session {
  id        String   @id               // opake Zufalls-ID, siehe D4
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

`User` trägt die Identität, `Account` das Anmeldeverfahren. Ein zweiter Provider ließe sich
danebenlegen, ohne `User` anzufassen — und der Fehlversuchszähler aus #13 hat einen
natürlichen Platz am `Account`. Verworfen: `passwordHash` direkt am `User` — später
herauszulösen hieße Migration plus Anfassen von Code, an dem dann schon #13 und
Token-Zuweisungen hängen.

Die E-Mail wird **vor** dem Speichern und vor jeder Suche normalisiert (`trim().toLowerCase()`),
damit `@unique` nicht durch Groß-/Kleinschreibung unterlaufen wird — SQLite vergleicht per
Default binär.

### D3 — `crypto.scrypt`, Parameter im Hashstring

Ein Feld, selbstbeschreibend:

```
scrypt$N=16384,r=8,p=1$<salt-base64>$<hash-base64>
```

Salt 16 Byte aus `randomBytes`, abgeleiteter Schlüssel 64 Byte. Verglichen wird mit
`timingSafeEqual` über die Rohpuffer, nie mit `===` über Strings. Aufgerufen wird die
**asynchrone** `scrypt`-Variante (`promisify`), nicht `scryptSync` — sonst blockiert jede
Anmeldung für ~100 ms den Event-Loop.

Die Parameter stehen im String und nicht im Code, damit ein späterer Wechsel (höheres `N`,
oder Argon2id über `@node-rs/argon2`) alte Hashes weiter prüfen kann, statt alle Nutzer
auszusperren.

`maxmem` muss explizit gesetzt werden (`N * r * 128 * 2`), sonst wirft Node bei `N=16384`
gegen sein Default-Limit von 32 MB.

### D4 — Sitzung: opake ID in der DB, Cookie trägt nur die ID

`randomBytes(32).toString('base64url')` als Primärschlüssel der `Session`-Zeile; das Cookie
heißt `sid` und enthält genau diesen Wert. Kein JWT: widerrufbar (Logout wirkt sofort und
serverseitig), kein Signing-Secret zu rotieren. Kein Signieren des Cookies nötig — der Wert
ist unvorhersagbar und wird ohnehin in der DB nachgeschlagen; eine Fälschung müsste 256 Bit
raten.

Cookie-Attribute: `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge` = Sitzungslaufzeit,
`secure` aus der Konfiguration (in lokaler HTTP-Entwicklung aus, sonst an). `lax` statt
`strict`, damit ein späterer Einladungslink in eine Session nicht in einer scheinbar
abgemeldeten App landet.

### D5 — Gleitende Verlängerung mit Halbwertsregel und injizierter Uhr

Bei jeder authentifizierten Anfrage: ist die Restlaufzeit kleiner als die Hälfte der vollen
30 Tage, wird `expiresAt` auf `jetzt + 30 Tage` gesetzt; sonst bleibt die Zeile unangetastet.
Ohne diese Regel schriebe jede Anfrage in die DB.

Damit Ablauf und Verlängerung überhaupt testbar sind, kommt die Zeit aus einer injizierten
Quelle (`server/core/clock.ts`: `type Clock = () => Date`), nicht aus `new Date()` mitten im
Regelcode. Der Test setzt die Uhr, statt zu warten oder Jest-Faketimer über eine
Prisma-Grenze zu schieben. Alternative — Zeilen mit vergangenem `expiresAt` direkt in die DB
schreiben — bleibt für den Ablauf-Fall zusätzlich möglich, reicht aber für die
Halbwertsregel nicht aus.

Aufräumen abgelaufener Sitzungen: die abgelaufene Zeile wird beim Antreffen gelöscht. Kein
Hintergrundjob — bei der Nutzerzahl dieses Projekts wäre er Zeremonie.

### D6 — `@fastify/cookie` (freigegeben nach §5.2)

Fastify 5 kennt weder `request.cookies` noch `reply.setCookie`. Das Plugin liefert beides mit
korrekter Attribut-Serialisierung. Verworfen: dreißig Zeilen Eigenbau — Cookie-Parsing ist
sicherheitsnah und hat Randfälle (mehrere Cookies, kodierte Werte, Anführungszeichen), und
der Precedent gegen `argon2`/`bcrypt` hatte einen anderen Grund als Dependency-Vermeidung
(dort scheitert die native Toolchain unter Windows; `@fastify/cookie` ist reines JS).

### D7 — Client ohne Router

`App.tsx` fragt beim Start `GET /api/auth/me`. Kein Nutzer → Auth-Ansicht mit Umschalter
zwischen Login und Registrierung; Nutzer → angemeldete Ansicht mit E-Mail und Abmelden.
Drei Zustände: `unbekannt` (Anfrage läuft), `anonym`, `angemeldet` — der erste ist kein
Detail, sondern verhindert, dass beim Reload für einen Moment das Loginformular aufblitzt.

Kein `react-router`: zwei Ansichten rechtfertigen keine zweite Dependency. Die Entscheidung
fällt bei dem Change, der echte URLs braucht (Beitritt über geteilten Link).

Alle Anfragen mit `credentials: 'include'`. Vite bekommt einen Dev-Proxy für `/api` auf den
Fastify-Port, damit Client und Server im Browser dieselbe Origin haben — sonst greift
`sameSite` und das Cookie wird nicht gesetzt.

### D8 — Formulare mit nativen Elementen

Es ist keine UI-Bibliothek im Projekt. `AGENTS.md` verbietet den Eigenbau von Basis-Elementen
nur, *solange eine Bibliothek im Projekt sie mitbringt* — hier also native `<form>`,
`<input>`, `<button>` mit minimalem CSS. Keine UI-Bibliothek als Beifang dieses Changes; die
Entscheidung gehört einem eigenen Change mit eigener §5.2-Freigabe.

### D9 — Registrierung meldet direkt an

Eine erfolgreiche Registrierung eröffnet dieselbe Sitzung wie eine Anmeldung. Annahme, nicht
aus dem Issue: ohne E-Mail-Verifikation gibt es keinen Grund, den Nutzer nach dem Anlegen auf
ein Loginformular zu schicken. Falls unerwünscht, betrifft es genau ein Szenario.

### D10 — Testaufbau

- Serverseitige Szenarien laufen als Integrationstest über `app.inject()` gegen die ephemere
  `test.db` — kein Netzwerk, kein Port, aber der echte Fastify-Stack samt Plugin und Prisma.
- Der Neustart-Fall baut in einem Test eine **zweite** Fastify-Instanz auf derselben DB-Datei.
  Genau das ist die Aussage: der Zustand liegt nicht im Prozess.
- Reine Regeln (`rules.ts`) prüft ein Unit-Test — Hashen/Verifizieren und die Halbwertsregel
  ohne DB.
- Komponententests: `/** @jest-environment jsdom */` als Docblock am Dateianfang (keine
  globale jsdom-Umgebung, sonst laufen die Servertests nicht mehr unter `node`),
  `@testing-library/react`, `fetch` gemockt.
- Kein PixiJS in diesem Change — das Modul-Mapping dafür entsteht mit dem Change, der Pixi
  einführt.

### D11 — Passwortregeln: Länge statt Zeichenklassen

15–128 Zeichen, alle Zeichen erlaubt (druckbares ASCII, Leerzeichen, Unicode), kein `trim`,
kein Abschneiden, keine Zeichenklassenpflicht, kein turnusmäßiger Wechselzwang.

Herleitung — NIST SP 800-63B-4 (§3.1.1, Fassung 2025) und der OWASP Authentication Cheat
Sheet stimmen hier überein:

- „Verifiers and CSPs **SHALL** require passwords that are used as a single-factor
  authentication mechanism to be a minimum of **15 characters** in length." Bei uns ist das
  Passwort alleiniger Faktor — MFA ist weder vorhanden noch geplant. OWASP formuliert
  dieselbe Grenze umgekehrt: ohne MFA gilt alles unter 15 Zeichen als schwach. Die 8 aus
  Revision 3 sind überholt.
- „Verifiers and CSPs **SHALL NOT** impose other composition rules (e.g., requiring mixtures
  of different character types)." Zeichenklassenregeln sind damit nicht bloß unklug, sondern
  normwidrig: Menschen beantworten sie vorhersagbar (`Sommer2026!`), und Cracking-Regeln
  bilden genau diese Muster ab.
- „Verifiers **SHALL** request the password to be provided in full … and **SHALL** verify the
  entire submitted password (e.g., not truncate it)." Daraus folgt das ausdrückliche Verbot
  eines `trim()` auf dem Passwort — anders als bei der E-Mail, die normalisiert wird (D2).
  `scrypt` hat keine Eingabegrenze wie bcrypts 72 Byte, es gibt also keinen technischen Grund
  zu kürzen. Die 128 sind reine Vorsorge gegen absurd große Eingaben und liegen deutlich über
  den von NIST geforderten „mindestens 64".

**Bewusste Abweichung:** NIST verlangt zusätzlich „Verifiers **SHALL** compare the prospective
secret against a blocklist that contains known commonly used, expected, or compromised
passwords." Das lösen wir in #12 *nicht* ein. Begründung: Eine eingebaute Liste häufiger
Passwörter liefe bei einer Mindestlänge von 15 weitgehend ins Leere — `123456`, `password`,
`qwerty123` scheitern schon an der Längenprüfung. Wirksam wäre nur der Abgleich gegen den
Have-I-Been-Pwned-Korpus per k-Anonymität (SHA-1-Präfix hin, Suffixliste zurück, Vergleich
lokal; das Passwort verlässt den Server nie) — das bringt einen ausgehenden Netzaufruf in den
Registrierungspfad, eine Entscheidung für den Ausfall des Dienstes und einen gemockten Test
mit. Das gehört zu #13 (Kontosicherheit), wo es zusammen mit dem Fehlversuchszähler entworfen
wird, statt hier angeflanscht.

Die Fehlermeldung bei zu kurzem Passwort nennt die Zahl und schlägt eine Passphrase vor —
drei bis vier Wörter erreichen die 15 mühelos, eine Zeichensuppe nicht.

Quellen: [NIST SP 800-63B-4, §3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html) ·
[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## Risks / Trade-offs

- **`scrypt` mit `N=16384` kostet ~100 ms pro Anmeldung** → Bei einer Handvoll gleichzeitiger
  Spieler unkritisch, und die asynchrone Variante blockiert den Event-Loop nicht. Steigt die
  Testlaufzeit spürbar, senkt eine niedrigere `N` *in der Testkonfiguration* die Kosten,
  ohne die Produktionsparameter anzufassen — die Parameter stehen ohnehin im Hashstring.
- **Zeitunterschied verrät ein existierendes Konto** → §9.2 fordert gleiche Antworten; gleiche
  Antwortzeiten fordert sie nicht, aber der Unterschied (Hash gerechnet vs. nicht gerechnet)
  ist messbar. Mitigation: bei unbekannter E-Mail wird gegen einen konstanten Dummy-Hash
  verifiziert, damit beide Wege dieselbe Arbeit leisten.
- **`NodeNext` projektweit, auch fürs Frontend** → Relative Imports brauchen das `.js`-Suffix,
  auch in `.tsx` (`import { LoginForm } from './LoginForm.js'`). Nicht auf `bundler`
  umstellen: der Servercode hängt daran. Jest löst das über den bestehenden
  `moduleNameMapper`.
- **Erster Integrationslauf gegen `test.db` überhaupt** → Der Weg (anlegen, migrieren,
  löschen) ist in `AGENTS.md` beschrieben, aber noch nie gelaufen. Scheitert er, ist das ein
  Harness-/Infrastrukturbefund und gehört nach §1.4 auf einen eigenen Branch, nicht in diesen.
- **Der Change ist groß** (Schema, Server, Client-Bootstrap, ~20 Szenarien) → Er ist nicht
  sinnvoll kleiner zu schneiden, ohne einen Zwischenstand zu bauen, den niemand benutzen kann.
  Konsequenz: die Rundenbegrenzung aus §3.5 ist hier realistisch erreichbar; ein früher
  menschlicher Blick auf die rote Testrunde lohnt.

## Migration Plan

`prisma/schema.prisma` bekommt die drei Modelle. Der Agent **führt keine Migration aus**
(§5.1): die Entwicklungsmigration erzeugt ein Mensch lokal, die produktive führt die CI aus
(§6.1). Der Integrationstestlauf migriert ausschließlich die ephemere `test.db` — das ist
ausdrücklich erlaubt und wird von `guard.ts` auf diese Datei begrenzt.

Rollback: Die Modelle sind neu und tragen keine Daten, an denen etwas anderes hängt; ein
Rücknehmen der Migration verliert nur Testkonten.

## Open Questions

- Ob die angemeldete Ansicht mehr zeigt als E-Mail und Abmelden, entscheidet erst der Change,
  der eine Spielsitzung einführt. Bis dahin ist sie bewusst ein Platzhalter.
