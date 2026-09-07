> Umsetzung über den Harness-Loop (`pnpm harness start 12 add-user-auth`), nicht über
> `/opsx:apply`. Die Tests entstehen davor durch den test-author (ein Test je Szenario aus
> `specs/user-auth/spec.md`) und werden rot bestätigt; der implementer sieht sie nie. „Gate
> grün" heißt: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
> Orchestrator.

## 1. Gerüst und Konfiguration

- [x] 1.1 `@fastify/cookie` durch den Menschen installieren lassen (§5.2, freigegeben) und
      verifizieren, dass `pnpm install` durchläuft und das Paket in `package.json` steht
- [x] 1.2 `prisma/schema.prisma` um `User`, `Account` und `Session` nach design.md D2
      ergänzen; verifizieren mit `pnpm db:generate` (Client wird ohne Fehler erzeugt).
      Migration nicht ausführen (§5.1)
- [x] 1.3 `src/server/core/config.ts` anlegen: `DATABASE_URL` und der `secure`-Schalter fürs
      Cookie werden über eine `env()`-Hilfe gelesen und beim Start validiert; verifizieren,
      dass ein fehlender Pflichtwert einen sprechenden Fehler beim Start wirft
- [x] 1.4 `src/server/core/clock.ts` anlegen (`type Clock = () => Date`, Default `() => new
      Date()`); verifizieren über den Typecheck und die spätere Verwendung in 3.2
- [x] 1.5 `src/server/core/prisma.ts` anlegen (eine geteilte `PrismaClient`-Instanz);
      verifizieren über den Typecheck

## 2. Gemeinsamer Vertrag

- [x] 2.1 `src/shared/auth.ts` mit den zod-Schemas für Registrierung und Anmeldung
      (E-Mail-Format, Passwort 15–128 Zeichen ohne Zeichenklassenregel und ohne `trim`
      nach design.md D11) und den daraus abgeleiteten Typen anlegen;
      verifizieren, dass die Datei nichts serverseitiges importiert (kein `@prisma/client`,
      kein `node:*`) und der Typecheck grün ist

## 3. Serverseitige Regeln (framework-frei)

- [x] 3.1 `src/server/auth/rules.ts`: `hashPassword` und `verifyPassword` über die
      asynchrone `crypto.scrypt`-Variante, Hashformat und Parameter nach design.md D3,
      Vergleich mit `timingSafeEqual`; verifiziert durch die Szenarien „Passwort wird nicht
      im Klartext abgelegt" und „Gleiches Passwort ergibt unterschiedliche Hashwerte"
- [x] 3.2 In derselben Datei die Sitzungsarithmetik: Ablaufzeitpunkt aus einer übergebenen
      Uhr berechnen und die Halbwertsregel aus design.md D5 als reine Funktion entscheiden;
      verifiziert durch die beiden Verlängerungsszenarien
- [x] 3.3 `normalizeEmail` (trimmen, kleinschreiben) ergänzen und überall dort verwenden, wo
      eine E-Mail gespeichert oder gesucht wird; verifiziert durch das Szenario „E-Mail wird
      unabhängig von der Schreibweise erkannt"

## 4. Serverseitige Anbindung

- [x] 4.1 `src/server/core/app.ts`: Fastify-Instanz als Funktion, die eine fertig
      konfigurierte App zurückgibt (`@fastify/cookie` registriert, Uhr und Prisma-Client
      injizierbar) — nötig, damit ein Test eine zweite Instanz auf derselben DB bauen kann;
      verifiziert durch das Szenario „Anmeldung überdauert den Serverneustart"
- [x] 4.2 `src/server/auth/session.ts`: Sitzung anlegen (opake ID nach D4), Sitzung aus dem
      Cookie auflösen, dabei abgelaufene Zeile löschen und gültige nach der Halbwertsregel
      verlängern; verifiziert durch die Szenarien „Anfrage mit gültigem Cookie …",
      „Abgelaufene Sitzung gilt nicht mehr" und die beiden Verlängerungsszenarien
- [x] 4.3 `POST /api/auth/register`: zod-Validierung an der Grenze, Konflikt bei vergebener
      E-Mail, `User` und `Account` in **einer** Transaktion anlegen, Sitzung eröffnen, Cookie
      mit den Attributen aus D4 setzen; verifiziert durch die drei Registrierungsszenarien
      und „Sitzungscookie ist für Skripte unerreichbar"
- [x] 4.4 `POST /api/auth/login`: Konto suchen, Passwort prüfen, bei unbekannter E-Mail gegen
      den Dummy-Hash verifizieren, in beiden Fehlerfällen identisch antworten; verifiziert
      durch die beiden Anmeldeszenarien und „Unbekannte E-Mail ist von falschem Passwort
      nicht zu unterscheiden"
- [x] 4.5 `GET /api/auth/me` und `POST /api/auth/logout`: Nutzer aus der Sitzung, bzw.
      Sitzungszeile löschen und Cookie entwerten; verifiziert durch „Anfrage ohne Cookie gilt
      als nicht angemeldet" und „Abmeldung beendet die Sitzung"
- [x] 4.6 Sicherstellen, dass keine Antwort Hash, Salt oder Hash-Parameter enthält — der
      Nutzer wird an genau einer Stelle in eine Ausgabeform übersetzt, statt Prisma-Objekte
      durchzureichen; verifiziert durch „Antworten enthalten keine Passwortgeheimnisse"
- [x] 4.7 Zentraler Fehler-Handler in `app.ts`: ein fehlgeschlagener Request antwortet
      sprechend, kein stilles `catch {}`; verifizieren, dass ein absichtlich geworfener
      Fehler als 500 mit Meldung ankommt und nicht als Absturz
- [x] 4.8 `src/server/index.ts`: Serverstart auf dem konfigurierten Port; verifizieren mit
      `pnpm dev:server` (Server hört, `/api/auth/me` antwortet mit 401)

## 5. Client

- [x] 5.1 `index.html` und `vite.config.ts` anlegen — React-Plugin und Dev-Proxy für `/api`
      auf den Fastify-Port (D7); verifizieren mit `pnpm dev:client` (Seite lädt, eine
      `/api`-Anfrage erreicht den Server) und `pnpm build`
- [x] 5.2 `src/client/auth/api.ts`: die vier Aufrufe gegen `/api/auth/*` mit
      `credentials: 'include'`, Antworten gegen die Schemas aus `shared/auth.ts` geprüft;
      verifizieren über den Typecheck
- [x] 5.3 `src/client/app/App.tsx` mit den drei Zuständen `unbekannt` / `anonym` /
      `angemeldet` (D7); verifiziert durch das Szenario „Ohne Anmeldung erscheint das
      Anmeldeformular"
- [x] 5.4 `LoginForm` und `RegisterForm` mit nativen Formularelementen (D8), inklusive
      Anzeige eines vom Server gemeldeten Fehlschlags; verifiziert durch „Fehlgeschlagene
      Anmeldung wird angezeigt"
- [x] 5.5 `src/client/main.tsx` als React-Einstieg; verifizieren mit `pnpm build` und im
      App-Test aus 6.2

## 6. Abschluss

- [x] 6.1 Gate grün: `pnpm typecheck`, `pnpm lint` und die vollständige Jest-Suite über den
      Orchestrator; danach reviewer (§3.2/§3.3)
- [x] 6.2 Nach „ok" des reviewers die App lokal starten (`pnpm dev`), dem Menschen Link und
      Änderungsliste zum manuellen Test vorlegen und auf ausdrückliche Freigabe warten (§3.4)
- [x] 6.3 Nach der Freigabe den Change ins `archive/` verschieben — im selben Branch und
      Commit wie das Feature (§3.6) — und den PR mit `Closes #12` öffnen
