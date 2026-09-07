## Why

Das VTT hat bisher keine Nutzeridentität — und ohne sie lässt sich nichts zuweisen: keine
Tokens an Spieler, keine Session an einen Spielleiter, keine Berechtigungsprüfung pro Aktion
(`constitution.md` §9.3). Dieser Change legt die Identität an, an der alle späteren Features
hängen (Issue #12, Epic #5).

Er ist zugleich der erste Change mit Anwendungscode: `src/` enthält nur `.gitkeep`, einen
Client-Einstieg gibt es nicht. Deshalb bringt er den `src/`-Schnitt und den Client-Bootstrap
mit — beides begründet in `design.md`, nicht auf Vorrat.

## What Changes

- **Registrierung** mit E-Mail und Passwort. Die E-Mail ist ein eindeutiger Anmeldename und
  wird *nicht* verifiziert (kein Mailversand, kein Verifikationszustand).
- **Passwortregeln nach [NIST SP 800-63B-4 §3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html)
  und dem [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)**:
  15–128 Zeichen, alle Zeichen erlaubt, keine Zeichenklassenpflicht, kein Beschneiden. Der von
  NIST zusätzlich geforderte Abgleich gegen kompromittierte Passwörter ist bewusst nach #13
  verschoben (Begründung: design.md D11).
- **Login und Logout.** Login legt eine Session-Zeile in der DB an und setzt deren ID in ein
  `httpOnly`-Cookie; Logout löscht die Zeile und das Cookie.
- **Angemeldet bleiben** über Browser-Reload und Serverneustart hinweg: die Session lebt in
  der DB, nicht im Prozessspeicher. Laufzeit 30 Tage, bei Aktivität gleitend verlängert.
- **Passwort-Hashing mit `crypto.scrypt`** aus `node:crypto` — keine neue Dependency, kein
  natives Build-Toolchain unter Windows. Vergleich zeitkonstant (`timingSafeEqual`).
- **Nutzermodell providerunabhängig**: `User` (Identität) und `Account` (Anmeldeverfahren)
  getrennt, damit ein zweiter Provider später danebengelegt werden kann, statt `User`
  umzubauen.
- **Client-Bootstrap**: `vite.config.ts`, `index.html`, React-Einstieg, Registrierungs- und
  Loginformular. Kein Router — der Auth-Zustand entscheidet, welche Ansicht erscheint.
- **`src/`-Schnitt** wird angelegt: `server/`, `client/`, `shared/` (Grenze zuerst, Features
  darunter).

**Nicht im Umfang:** Passwortänderung und Fehlversuchssperre (→ #13), Passwort-Reset per
E-Mail, OAuth, Spielsitzungen, Karten, Tokens.

## Capabilities

### New Capabilities
- `user-auth`: Kontoanlage, Anmeldung, Abmeldung und die serverseitige Sitzung, die einen
  Browser über Reload und Serverneustart hinweg als angemeldeten Nutzer wiedererkennt.
  Umfasst die Regeln, wann eine Anmeldung gelingt, was der Server über ein Konto preisgibt
  und wann eine Sitzung endet.

### Modified Capabilities
Keine — `openspec/specs/` ist leer, dies ist die erste Capability des Projekts.

## Impact

**Neuer Code** (alles bisher nicht vorhanden):
- `src/shared/auth.ts` — zod-Verträge, von Client und Server gemeinsam benutzt
- `src/server/core/` — Fastify-Instanz, Prisma-Client, Konfiguration über `env()`
- `src/server/auth/` — reine Regeln (Hashing, Sitzungsablauf) getrennt von der
  Fastify-Anbindung
- `src/server/index.ts` — Serverstart
- `src/client/app/`, `src/client/auth/`, `src/client/main.tsx`, `index.html`,
  `vite.config.ts`

**Schema** (`prisma/schema.prisma`): neue Modelle `User`, `Account`, `Session`. Die Migration
selbst führt der Agent nicht aus (`constitution.md` §5.1, §6.1).

**Dependencies**: `@fastify/cookie` — **freigabepflichtig nach §5.2, vom Menschen am
2026-09-07 freigegeben.** Begründung: Fastify 5 bringt weder `request.cookies` noch
`reply.setCookie` mit; das Serialisieren und Parsen von Cookie-Headern ist sicherheitsnah
und hat Randfälle, die kein Eigenbau von dreißig Zeilen zuverlässig abdeckt. First-Party-
Plugin der Fastify-Organisation, kein nativer Build.

**Konfiguration**: `.env` braucht `DATABASE_URL` (existiert) und einen Schalter für das
`secure`-Attribut des Cookies (Produktion vs. lokale HTTP-Entwicklung). Werte legt der
Mensch an, der Agent liest sie nur.

**Testinfrastruktur**: erster Integrationstestlauf gegen die ephemere `test.db`; erster
Komponententest mit `jsdom`-Docblock. Beides ist in `AGENTS.md` vorgesehen, aber noch nie
gelaufen.
