# Design — add-participant-cards (#97)

Reiner Client-Change auf bestehenden, vollständig spezifizierten Serververträgen
(`game-session` „Teilnehmerliste in Echtzeit"/„Verlassen …", `session-token` „Token
zuweisen"). Kein Ereignis, keine Filterung, kein Schema ändert sich — nur Darstellung und
Bedienwege im Reiter `Teilnehmer`. Alle sichtbaren Werte (Präsenz, Rolle, Zuweisung) stammen
aus dem zuletzt vom Server gemeldeten Bestand (`state.participants`, `state.tokens`),
`constitution.md` §9.1.

## D1 — Karte statt Zeile

Der Reiter `Teilnehmer` behält Panel (`panel panel--wide`) und Überschrift `Teilnehmer` der
Ebene 2 (`session-tabs`, „Panel-Raster"). Statt des `<ul>` mit Text-`<li>` rendert er eine
Liste `<ul class="participant-card-list">` (wie `token-card-list`, `list-style:none`) mit je
Mitglied einem `<article class="participant-card" role="listitem">`. Reihenfolge = Reihenfolge
von `state.participants` (die Serverliste, unverändert). Aufbau je Karte:

- `<span class="participant-card__avatar" aria-hidden="true">` — dekorativer Avatar-Kreis
  (Gold-Rahmen aus dem Stylesheet); **kein** zugänglicher Text (der Name steht daneben).
- `<span class="participant-card__name">{displayName(p)}</span>` — Alias, sonst Nutzername
  (`displayName` aus `shared/session.ts`, unverändert).
- `<span class="chip participant-card__role">{rolle}</span>` — Rollen-Pill; Text
  `t('session.role.gm')` = `Spielleiter` bzw. `t('session.role.player')` = `Spieler`. Als
  eigenes Element (nicht in den Namen gemischt) — ein Nutzername, der „leiter" enthält, wird
  so nicht überdeckt.
- Präsenz: `<span class="presence presence--online|--offline">` mit einem dekorativen Punkt
  `<span class="presence__dot" aria-hidden="true">` und dem Text `t('presence.online')` =
  `anwesend` (Punkt teal, aus dem Stylesheet) bzw. `t('presence.offline')` = `abwesend`
  (`p.online`).
- Token-Chips: `<span class="participant-card__tokens">` mit je Token, dessen `ownerId` gleich
  `p.userId` ist, einem `<span class="chip">{token.name}</span>`. Gefiltert aus `state.tokens`
  (`token.ownerId === p.userId`); `ownerId` ist öffentliche Tokendarstellung (§9.2). Hat das
  Mitglied kein Token, bleibt der Bereich leer (kein Chip).
- Aktions-Bereich: `Alias ändern` (nur eigene Karte, D2) und der ⋮-Trigger (D3), soweit die
  Rolle Einträge hat.

Verworfen: die Präsenz nur als Farbe (Barrierefreiheit — Punkt **und** Text, nie Farbe
allein, `ui-icons`-Grundsatz).

## D2 — Alias im Modal (eigene Karte)

Die eigene Karte (`p.userId === currentUserId`, jede Rolle) trägt `<IconButton name="edit"
label={t('alias.edit')}>` mit `t('alias.edit')` = `Alias ändern`. Das Auslösen öffnet ein
`<Modal title={t('alias.edit')} onClose=…>` (`ui-dialog`) mit einem `AliasForm`:

- `<label>` `Alias` (`t('alias.label')`) + `<input name="alias">`, vorbelegt mit dem aktuell
  vom Server gemeldeten Alias der eigenen Mitgliedschaft (leer, wenn keiner).
- Absende-Schaltfläche `Alias setzen` (`t('alias.submit')`).
- Fehler als `<p role="alert">` im Modal.

Das Absenden ruft `socket.alias(sessionId, wert)` (unverändert) und schließt das Modal bei
`ack.ok === true`; bei `ack.ok === false` bleibt das Modal offen und zeigt `ack.message` als
`role="alert"`. Die angezeigte Benennung der Karte folgt weiterhin ausschließlich
`state.participants`, nie der Eingabe (§9.1): nach `Gandalf` absenden zeigt die Karte den
Nutzernamen weiter, bis ein `session:participants` mit `alias: "Gandalf"` eintrifft. Das
Inline-Alias-Formular des alten Reiters entfällt.

Das bisherige `aliasInput`/`aliasError` wandert in den Modal-Zustand; da `ActionMenu`/Button
den Fokus vor `onClose`/`onSelect` an den Trigger zurückgibt und `Modal` seinen Öffner merkt,
kehrt der Fokus beim Schließen korrekt auf `Alias ändern` zurück (keine Extra-Verdrahtung).

## D3 — ⋮-Menü je Rolle

Je Karte ein `useFloating()` + `<MenuTrigger floating label={t('menu.rowActions', { name:
displayName(p) })}>` (⋮, `menu.rowActions` = `Aktionen für {name}`) und ein `<ActionMenu>` mit
denselben `label`. Die Einträge (`MenuEntry`-Form aus `ui/menu`) hängen von Rolle und
Beziehung ab — die Sichtbarkeit destruktiver/verwaltender Einträge folgt der eigenen Rolle im
`state` (die der Server im `session:enter`-Ack gesetzt hat, §9.3), nicht einer Vermutung:

| Karte | Betrachter | ⋮-Einträge |
|---|---|---|
| fremde Spielerkarte | Spielleiter | `Tokens zuweisen` (Icon `token`), `Entfernen` (Icon `delete`, `danger`) |
| eigene Spielerkarte | der Spieler selbst | `Austreten` (Icon `logout`, `danger`) |
| eigene Spielleiter-Karte | der Spielleiter selbst | *kein ⋮-Menü* (nur `Alias ändern`) |
| jede Karte | Spieler als Betrachter einer **fremden** Karte | *kein ⋮-Menü* |

`t('menu.assignTokens')` = `Tokens zuweisen`. `Entfernen`/`Austreten` nutzen die bestehenden
Labels `t('session.remove')` = `Entfernen` bzw. `t('session.leave')` = `Austreten`. Trägt eine
Karte keine Einträge, wird **kein** ⋮-Trigger gerendert (kein leeres Menü).

## D4 — Destruktive Aktionen hinter Confirm (#89)

`Entfernen` und `Austreten` senden weiterhin `DELETE /api/sessions/:id/members/:userId`
(`removeMember`, `api.ts`, unverändert) — aber erst nach `await confirm({...})` (Epic #103:
nie Zwei-Klick-Button):

- `Entfernen`: `confirm({ title: t('participant.remove.title', { name: displayName(p) }),
  message: t('participant.remove.message'), confirmLabel: t('session.remove'), danger: true })`.
  `participant.remove.title` = `{name} entfernen?`, `participant.remove.message` = `Das
  Mitglied wird aus der Spielsitzung entfernt.`
- `Austreten`: `confirm({ title: t('participant.leave.title'), message:
  t('participant.leave.message'), confirmLabel: t('session.leave'), danger: true })`.
  `participant.leave.title` = `Spielsitzung verlassen?`, `participant.leave.message` = `Du
  verlässt die Spielsitzung.`

Nur bei `ok === true` wird gesendet. Der Bestätigungsdialog rendert `Abbrechen`
(`dialog.cancel`) und den `danger`-Bestätigungsknopf mit dem `confirmLabel` (`ui-dialog`,
„Bestätigungsdialog"). Eine Ablehnung des Servers (`memberError`) bleibt als `role="alert"` im
Panel sichtbar (unverändert).

## D5 — `Einladen`-Popover (nur Spielleiter)

Der Panel-Kopf des Reiters `Teilnehmer` trägt für den Spielleiter neben der Überschrift einen
`<MenuTrigger floating label={t('invite.open')} haspopup="dialog" variant="text"
icon="players">` (`invite.open` = `Einladen`) und ein `<Popover floating label={t('invite.open')}>`
(`ui-menu`, „Popover", `role="dialog"`, nicht modal). Inhalt des Popovers:

- `<code aria-label={t('session.code')}>` mit der Maske `'•'.repeat(code.length)` — nie der
  Klartext (§9.2; das Popover hat **keinen** Umschalter, anders als die Session-Bar).
- `<IconButton name="copy" label={t('invite.copy')}>` (`invite.copy` = `Code kopieren` —
  bewusst nicht `Sitzungscode kopieren`, um keine zweite Schaltfläche gleichen zugänglichen
  Namens neben der Session-Bar zu erzeugen). Das Auslösen ruft denselben Weg wie die Bar
  (`handleCopyCode`): schreibt den Klartext-Code in die Zwischenablage und löst bei Erfolg den
  Toast `t('toast.codeCopied')` = `Sitzungscode kopiert` aus; scheitert das Schreiben, kein
  Toast.

Ein Spieler bekommt weder den Trigger `Einladen` noch das Popover. Der Code der Session-Bar
(#93) bleibt unberührt (zweiter, kontextnaher Ort zum Einladen).

## D6 — `Tokens zuweisen`-Modal (nur Spielleiter, nur Spielerkarten)

Der ⋮-Eintrag `Tokens zuweisen` öffnet ein `<Modal title={t('participant.assign.title', {
name: displayName(p) })}>` (`participant.assign.title` = `Tokens für {name}`) mit einem
`AssignTokensForm`: je Token aus `state.tokens` eine Zeile mit `<label>{token.name}</label>`
und einer Checkbox (`<input type="checkbox">`, zugänglicher Name = `token.name`), **checked**
genau dann, wenn `token.ownerId === p.userId`. Der Checkbox-Zustand folgt `state.tokens`
(§9.1), nie einem lokalen Optimismus.

Eine Umschaltung sendet sofort das bestehende `session:token-assign` (`socket.assignToken`,
`session-token` „Token zuweisen") mit `{ sessionId, tokenId, ownerId }`:
- Anhaken → `ownerId: p.userId` (weist das Token diesem Mitglied zu, auch wenn es einem
  anderen gehörte — der Server entscheidet, §9.1/§9.3).
- Abhaken (war diesem Mitglied zugewiesen) → `ownerId: null` (dem Spielleiter, „unzugewiesen").

Ein ablehnendes Ack (`ack.ok === false`) zeigt `ack.message` als `role="alert"` im Modal; die
Checkboxen bleiben am Serverzustand. Hat die Sitzung keine Tokens, zeigt das Modal den Hinweis
`t('participant.assign.empty')` = `Keine Tokens in dieser Sitzung.` und keine Checkbox. Das
Modal schließt über `Schließen` (`dialog.close`) — es gibt keinen Absende-Knopf, weil jede
Umschaltung schon gesendet hat.

Verworfen: ein Absende-Knopf mit gesammelten Änderungen (zweiter Zustand neben `state.tokens`,
der bei einem zwischenzeitlichen Broadcast veralten würde, §9.1).

## D7 — Formular- und Adressierungs-Schnittstelle (für den test-author)

Elemente über Testing-Library-Rollen/Labels ansprechen (`getByRole`, `getByLabelText`), nie
über CSS-Selektoren; Listen und Karten gescoped prüfen (die Raumansicht hat mehrere Listen und
mehrere Chips), sonst trifft eine Abfrage mehrfach. Die zugänglichen Namen und Rollen als
Vertrag:

- **Reiter aktivieren** (Testaufbau-Konvention `session-tabs`): erst den Reiter `Teilnehmer`
  aktivieren, dann im sichtbaren Reiterpanel (Rolle `tabpanel`, Name `Teilnehmer`) scopen.
- **Eine Karte scopen**: die Karte über den Namen des Mitglieds bestimmen und zur umschließenden
  `article.participant-card` hochgehen; Token-Chips, Rollen-Pill und Präsenz **immer** in dieser
  Kartenscope prüfen.
- **Rollen-Pill**: Text `Spieler` bzw. `Spielleiter` in der Karte.
- **Präsenz**: Text `anwesend` bzw. `abwesend` in der Karte; die Klasse `presence--online`
  bzw. `presence--offline` am umschließenden Element der Klasse `presence` — nur prüfen, wo die
  Klasse Teil der THEN ist (der teal Punkt selbst bleibt dem App-Test).
- **Alias ändern**: Schaltfläche (Rolle `button`) mit Namen `Alias ändern` in der eigenen
  Karte. Das Modal danach als Rolle `dialog` mit Namen `Alias ändern`; das Feld über das Label
  `Alias` (Attribut `name="alias"`); der Absende-Knopf mit Namen `Alias setzen`; ein Fehler als
  Rolle `alert`.
- **⋮-Menü**: Trigger (Rolle `button`) mit Namen `Aktionen für <Anzeigename>`; nach dem Öffnen
  die Einträge als Rolle `menuitem` mit Namen `Tokens zuweisen`, `Entfernen`, `Austreten`.
- **Confirm**: Rolle `alertdialog` mit Namen `<Anzeigename> entfernen?` bzw. `Spielsitzung
  verlassen?`; Bestätigen über den Knopf mit Namen `Entfernen` bzw. `Austreten` **im Dialog**,
  Abbrechen über den Knopf `Abbrechen`.
- **Einladen**: Trigger (Rolle `button`) mit Namen `Einladen` im Panel-Kopf; das Popover als
  Rolle `dialog` mit Namen `Einladen`; das Kopieren über den Knopf `Code kopieren` **im
  Popover**; der Toast über den Toast-Host (`ui-feedback`).
- **Tokens zuweisen**: Menüeintrag `Tokens zuweisen`; das Modal als Rolle `dialog` mit Namen
  `Tokens für <Anzeigename>`; je Token eine Checkbox (Rolle `checkbox`) mit dem Tokennamen als
  Namen (Zustand über `checked`); Schließen über den Knopf `Schließen`.

Sendewege (gegen die gemockte Socket-Fassade prüfbar, wie bestehende Token-Szenarien):
`socket.alias(sessionId, wert)`, `socket.assignToken({ sessionId, tokenId, ownerId })`,
`removeMember(sessionId, userId)` → `DELETE /api/sessions/:id/members/:userId`.

## D8 — i18n

Neue Schlüssel in `de.ts` und `en.ts` (gleiche Reihenfolge/Gruppen wie bestehend):
`presence.online`/`presence.offline`; `alias.edit`/`alias.label`/`alias.submit`;
`menu.assignTokens`; `invite.open`/`invite.copy`; `participant.remove.title`/
`participant.remove.message`/`participant.leave.title`/`participant.leave.message`/
`participant.assign.title`/`participant.assign.empty`. Bestehende Schlüssel werden
wiederverwendet: `session.role.gm`/`session.role.player`, `session.leave`/`session.remove`,
`menu.rowActions`, `session.code`, `toast.codeCopied`, `dialog.cancel`/`dialog.close`. Die
bisher **hartkodierten** Strings „Alias"/„Alias setzen"/„anwesend"/„abwesend" im alten Reiter
entfallen zugunsten der `t()`-Schlüssel (Epic C: Texte über `t()`).

## D9 — Stylesheet

`theme.css` bekommt `.participant-card-list`, `.participant-card`, `.participant-card__avatar`
(Kreis mit Gold-Rahmen), `.participant-card__name` (Display-Serif), `.participant-card__role`
(nutzt `.chip`), `.presence`, `.presence__dot`, `.presence--online` (teal Punkt),
`.presence--offline` (faint), `.participant-card__tokens`. Farbwerte nur aus dem Tokenblock
(`ui-theme`-Vertrag); die Datei behält **genau eine** Medienabfrage
(`prefers-reduced-motion`) — kein zweites `@media`. Aussehen nimmt der App-Test ab
(`constitution.md` §3.4), getestet wird nur, welche Elemente/Klassen gerendert werden.

## D10 — Testkonvention

Wie seit `session-tabs` (#94)/`add-token-cards` (#95): Szenarien, die Elemente des Reiters
`Teilnehmer` adressieren, aktivieren den Reiter vorher per Klick. Szenarien, die das Alias-,
Zuweisen- oder Bestätigungs-Dialogfeld adressieren, öffnen vorher das jeweilige Modal
(`Alias ändern`, `Tokens zuweisen`, ⋮ → `Entfernen`/`Austreten`) bzw. das `Einladen`-Popover.
