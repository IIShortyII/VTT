## Context

Vorhanden aus #12/#13/#6: `User { id, email }` mit `Account`/`Session`; Registrierung über
`RegisterInputSchema { email, password }` und Antwort `UserOutputSchema { id, email }`;
`GameSession`/`Membership { sessionId, userId, role }`; Teilnehmerliste aus
`buildParticipants` (`room.ts`) mit `user.email`; Socket-Handler nach dem festen Muster
zod-Parse → `authorizeAction` → Regel → DB → Broadcast → Acknowledgement; Client-Fassade
`client/session/socket.ts` als Mock-Grenze der Komponententests; `SessionRoom` rendert
`participant.email`. Die `App` kennt den angemeldeten Nutzer aus `/api/auth/me`, reicht ihn
aber nicht an `SessionRoom` weiter.

Die Entscheidungen D1 bis D6 sind in der Explore-Runde mit dem Menschen gefallen (2026-09-10)
und werden hier begründet, nicht neu verhandelt. Motivation: `proposal.md` — Why. Verhalten:
`specs/user-auth/spec.md` und `specs/game-session/spec.md`. Bindend und hier nicht
wiederholt: `constitution.md` §9.

## Goals / Non-Goals

**Goals:**
- Genau eine Stelle, die „wie heißt dieser Spieler" beantwortet (`displayName` in
  `shared/`), damit Tokens (#8) und Chat sie übernehmen statt die Regel zu wiederholen.
- Die E-Mail verlässt den Server nur noch an den Nutzer selbst — mechanisch abgesichert
  durch das `ParticipantSchema` (kein `email`-Feld), nicht durch Disziplin.
- Einmaligkeit des Nutzernamens als DB-Constraint, Case-Insensitivität ohne Sonderpfad im
  Client.

**Non-Goals:**
- Kein Ändern des Nutzernamens nach der Registrierung (eigenes Issue, wenn gewünscht).
- Kein Login per Nutzername (D2).
- Keine Moderation durch den Spielleiter (D4).
- Keine Nachholmigration für Konten ohne Nutzernamen (D3).

## Decisions

### D1 — Nutzername: Zeichenvorrat, Länge, Case-Insensitivität über einen Schlüssel

Regel (Spec „Kontoregistrierung"): getrimmt, 3–24 Codepoints, `^[\p{L}\p{N}_.\-]+$` mit
`u`-Flag; Länge über `[...value].length` wie beim Passwort (#12 D11), nicht `String.length`.

Einmaligkeit unabhängig von der Schreibweise: SQLite kennt kein case-insensitives Unique für
Unicode (`COLLATE NOCASE` deckt nur ASCII ab, Prisma bildet es ohnehin nicht ab). Deshalb
zwei Spalten:

```prisma
model User {
  username    String            // wie eingegeben (nach Trimmen) — Anzeige
  usernameKey String  @unique   // normalize('NFKC').toLowerCase() — Einmaligkeit
}
```

`usernameKey` berechnet der Server (`server/auth/rules.ts`, reine Funktion
`usernameKey(username)`), nie der Client — der Client kennt die Spalte nicht. Ein `P2002`
auf `usernameKey` wird zu `409` mit `field: "username"`, analog zur E-Mail in #12; die
Vorabprüfung per `findUnique` entfällt, das Constraint ist die Wahrheit.

Verworfen: *nur ASCII* — „Jörg" würde „Joerg"; ein deutschsprachiger Tisch soll seine Namen
schreiben können. *Case-sensitiv* — eine Spalte weniger, aber „Gandalf" und „gandalf" wären
am Tisch zwei optisch gleiche Spieler, genau das, was der Nutzername verhindern soll.
*`toLocaleLowerCase`* — locale-abhängig (türkisches `İ`); `toLowerCase` nach NFKC ist
deterministisch über Laufzeitumgebungen.

### D2 — Anmeldung bleibt E-Mail-only

Nutzernamen sind am Tisch öffentlich, E-Mails ab diesem Change nicht mehr. Ein Login per
Nutzername würde jeden Mitspieler zum Ziel von Fehlversuchen und damit der Sperre aus #13
machen. Login-Schema, Formular und Sperrlogik bleiben unangetastet; der Anmeldepfad verrät
weiterhin nichts über Nutzernamen. Verworfen: *E-Mail oder Nutzername im selben Feld* —
bequemer, aber Angriffsfläche plus Mehrdeutigkeit bei Nutzernamen in E-Mail-Form.

### D3 — `username` ist `NOT NULL`, ohne Platzhalter, ohne Nachholdialog

Es gibt keine Bestandskonten (Entwicklungsphase, Dev-DB wird geleert; kein Deploy-Ziel mit
Daten). Deshalb Pflichtspalte ohne Default und ohne Ableitung aus der E-Mail. Eine Ableitung
aus dem Local-Part (`dennis.hofmann@…` → `dennis.hofmann`) hätte die E-Mail in die
Teilnehmerliste zurückgetragen — das Gegenteil des Ziels. Ein nullable Feld hätte jeder
Anzeigestelle dauerhaft einen Null-Fall aufgebürdet, der nach dem ersten Login nie wieder
vorkommt.

**Migration** (`prisma/migrations/<stamp>_add-username-and-alias/migration.sql`, von Hand
nach dem Muster der bestehenden): SQLite kann keine `NOT NULL`-Spalte ohne Default per
`ALTER TABLE` ergänzen. Deshalb das Prisma-eigene Redefinitionsmuster für `User`:

```sql
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("id", "email", "createdAt") SELECT "id", "email", "createdAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
ALTER TABLE "Membership" ADD COLUMN "alias" TEXT;
```

Das `INSERT … SELECT` scheitert absichtlich, falls doch Zeilen existieren — besser ein
lauter Migrationsfehler als stumm erfundene Nutzernamen. Die Wegwerf-DB der Tests ist pro Lauf
leer; die Dev-DB leert der Mensch (§5.1).

### D4 — Alias: nur das Mitglied selbst, an der Mitgliedschaft, per Socket

```prisma
model Membership {
  alias String?   // 1–40 Codepoints nach Trimmen, frei bis auf Steuerzeichen; null = kein Alias
}
```

- **An der Mitgliedschaft, nicht am Nutzer**: derselbe Spieler spielt in zwei Sitzungen zwei
  Charaktere (Issue). Gleiches Muster wie `role` in #6 D2.
- **Nur das Mitglied selbst**: das Ereignis trägt keine Ziel-Nutzer-ID; der Handler ändert
  ausschließlich die Mitgliedschaft, die `authorizeAction` für den Absender liefert. Damit
  ist die Berechtigungsprüfung strukturell, nicht per `if`. Ein Spielleiter-Eingriff wäre
  Moderation und gehört mit „Mitglied entfernen" in ein eigenes Issue.
- **Socket statt REST**: der Alias wird im Raum gewählt; die Aktion braucht ohnehin den
  Broadcast der Teilnehmerliste, und `authorizeAction` ist der Pfad, an dem §9.3 gilt
  (#6 D3, D6). Ein REST-Endpunkt wäre ein zweiter Weg zum selben Ziel mit demselben Broadcast.
- **Kein Unique**: zwei „Gandalf" sind erlaubt (Issue). Der Alias ist Anzeige, kein
  Identifikator — Identität bleibt `userId`.
- **Zurücksetzen durch leeren Wert**: kein eigenes Ereignis. Das zod-Schema trimmt, bildet
  `""` auf `null` ab und prüft sonst Länge und `^[^\p{Cc}]+$`:

```ts
export const AliasInputSchema = z.object({
  sessionId: z.string(),
  alias: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.union([z.literal(''), z.string().regex(/^[^\p{Cc}]+$/u).refine((v) => [...v].length <= ALIAS_MAX_LENGTH)]))
    .transform((v) => (v === '' ? null : v)),
})
export type AliasAck = { ok: true; alias: string | null } | { ok: false; message: string }
```

Handler `handleAlias` in `server/session/socket.ts` nach dem bestehenden Muster: Parse →
`authorizeAction` (jede Rolle, jeder Zustand — wer im Raum ist, darf sich benennen) →
`prisma.membership.update({ where: { id: membership.id }, data: { alias } })` →
`broadcastParticipants` → `callback({ ok: true, alias })`.

### D5 — Teilnehmer-Drahtformat und `displayName` in `shared/`

```ts
export const ParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  alias: z.string().optional(),   // fehlt, wenn die Mitgliedschaft keinen trägt
  role: MemberRoleSchema,
  online: z.boolean(),
})
export function displayName(p: Pick<Participant, 'username' | 'alias'>): string {
  return p.alias ?? p.username
}
```

- **`email` entfällt aus dem Schema**, nicht nur aus dem Mapping: `buildParticipants`
  selektiert `user: { select: { id, username } }` und baut Objekte, die das Schema erfüllen.
  Ein späterer Handler, der eine E-Mail hineinlegt, verletzt den Typ.
- **`username` und `alias` getrennt statt eines fertigen `name`**: der Client muss den
  eigenen Alias vorbelegen und zwischen „Alias gesetzt" und „zeigt Nutzernamen" unterscheiden.
  Beide Werte sind für Mitspieler ohnehin sichtbar; es gibt nichts zu verbergen. Der Helfer
  hält die Regel trotzdem an einer Stelle.
- **`alias` optional statt `null`** auf der Leitung: `JSON.stringify` lässt `undefined` weg,
  `null` nicht; das Fehlen des Felds ist der natürliche Zustand „kein Alias" und passt zur
  Spec („ohne Feld `alias`"). In der DB bleibt es `null` (Prisma); das Mapping übersetzt
  `alias ?? undefined`. Im Acknowledgement von `session:alias` dagegen `null`, weil dort
  „zurückgesetzt" eine explizite Antwort ist.
- `UserOutputSchema` bekommt `username`; `toUserOutput` in `server/auth/rules.ts` gibt es mit.

### D6 — Client: eigene Zeile über die Nutzer-ID, Anzeige folgt dem Server

- `SessionRoom` bekommt `currentUserId` als Prop aus der `App` (die den Nutzer aus
  `/api/auth/me` kennt). Verworfen: *`self` im `EnterAck`* — ein zweiter Ort für dieselbe
  Information; die `App` hat sie schon.
- Die Zeile mit `participant.userId === currentUserId` rendert zusätzlich ein Formular
  (Eingabefeld, vorbelegt mit `alias ?? ''`, Schaltfläche „Alias setzen"). Absenden ruft
  `facade.alias(sessionId, value)`; `{ ok: false }` landet in einer `role="alert"`-Meldung.
  Die Anzeige aller Zeilen kommt aus `state.participants`, das nur `session:participants`
  schreibt — die Eingabe ändert nichts an der Liste (§9.1, Spec „Eigener Alias wird als
  Absicht gesendet").
- Fassade `client/session/socket.ts`: `alias(sessionId, alias): Promise<AliasAck>` nach dem
  Muster von `transition`. Die Komponententests mocken die Fassade wie bisher.
- Registrierungsformular: Feld `username` vor der E-Mail (`autoComplete="nickname"`),
  `minLength`/`maxLength` aus `shared/auth.ts`; Fehleranzeige wie bisher über `result.message`.

### Folgeregel — bestehende Tests wandern mit dem Vertrag

`RegisterInputSchema` ist ein `z.object` und verwirft unbekannte Felder. Deshalb können die
bestehenden Integrationstests **vor** der Implementierung um `username` ergänzt werden und
bleiben grün (das Feld wird bis dahin ignoriert); nach der Implementierung sind sie es
weiterhin. Die Fixtures der Komponententests (`email` → `username`) werden im selben Schritt
umgestellt; sie werden erst mit dem neuen `SessionRoom` grün. Das ist Sache des test-author
(`tasks.md` 1.1) — der implementer sieht Tests nie.

## Risks / Trade-offs

- [`\p{L}`/`\p{N}` lässt Zeichen zu, die einander ähneln (kyrillisches `а` vs. lateinisches
  `a`)] → Der Nutzername ist Anzeige, kein Sicherheitsmerkmal; Login bleibt E-Mail (D2).
  Ein Homoglyph-Filter wäre Aufwand ohne Bedrohungsmodell.
- [Ein Alias kann irreführend sein, z. B. der Nutzername eines anderen Mitglieds] →
  Bewusst zugelassen (Issue: frei wählbar). Identität ist `userId`; die Teilnehmerliste
  bleibt die Wahrheit über Rolle und Anwesenheit. Moderation ist ein eigenes Issue (D4).
- [Migration scheitert auf einer DB mit Nutzerzeilen] → Gewollt (D3). Die Meldung ist ein
  NOT-NULL-Fehler beim `INSERT`; Abhilfe ist das Leeren der Dev-DB durch den Menschen.
- [`alias` optional auf der Leitung, `null` in DB und Acknowledgement] → Zwei Darstellungen
  desselben Zustands; die Übersetzung liegt an genau einer Stelle (`buildParticipants`).
- [Breaking Change am Teilnehmer- und Registrierungsvertrag] → Es gibt nur einen Client, im
  selben Repo; beide Seiten ändern sich im selben PR.
