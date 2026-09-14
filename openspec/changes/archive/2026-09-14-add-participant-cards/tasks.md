# Tasks — add-participant-cards (#97)

## 1. i18n
- [x] 1.1 Neue Schlüssel in `src/client/i18n/de.ts` und `src/client/i18n/en.ts`:
  `presence.online`/`presence.offline`, `alias.edit`/`alias.label`/`alias.submit`,
  `menu.assignTokens`, `invite.open`/`invite.copy`, `participant.remove.title`/
  `participant.remove.message`/`participant.leave.title`/`participant.leave.message`/
  `participant.assign.title`/`participant.assign.empty` (design.md D8).

## 2. Teilnehmerkarte
- [x] 2.1 `ParticipantCard` (im `session`-Bereich): `article.participant-card` mit Avatar,
  Name, Rollen-Pill, Präsenz (Punkt + Text), Token-Chips (`token.ownerId === p.userId` aus
  `state.tokens`) (design.md D1).
- [x] 2.2 Reiter `Teilnehmer` in `SessionRoom.tsx` auf `ul.participant-card-list` mit
  `ParticipantCard` umbauen; altes `<ul>`/Inline-Alias-Formular/Buttons entfernen.

## 3. Alias-Modal
- [x] 3.1 `Alias ändern` (`IconButton name="edit"`) nur auf der eigenen Karte; öffnet Modal
  mit `AliasForm` (Feld `Alias` name `alias`, Knopf `Alias setzen`, Fehler `role="alert"`),
  sendet `socket.alias`, schließt bei `ack.ok` (design.md D2).

## 4. ⋮-Menü + Confirm
- [x] 4.1 Je Karte `useFloating` + `MenuTrigger`/`ActionMenu` mit den rollenabhängigen
  Einträgen (design.md D3-Tabelle); kein Trigger ohne Einträge.
- [x] 4.2 `Entfernen`/`Austreten` über `useConfirm().confirm({...})` (danger), erst bei `ok`
  `removeMember(sessionId, userId)` (design.md D4).

## 5. Einladen-Popover
- [x] 5.1 Panel-Kopf (nur Spielleiter): `MenuTrigger` (`Einladen`, `haspopup="dialog"`) +
  `Popover` mit maskiertem `<code>` und `Code kopieren` (`handleCopyCode`, Toast bei Erfolg)
  (design.md D5).

## 6. Tokens-zuweisen-Modal
- [x] 6.1 ⋮-Eintrag `Tokens zuweisen` (nur Spielleiter, nur Spielerkarten) öffnet Modal mit
  `AssignTokensForm`: je `state.tokens`-Token eine Checkbox (checked = `ownerId === p.userId`);
  Umschaltung sendet `socket.assignToken` (an → `p.userId`, ab → `null`); leerer Zustand +
  Fehler `role="alert"`; Schließen über `Schließen` (design.md D6).

## 7. Stylesheet
- [x] 7.1 `src/client/app/theme.css`: `.participant-card-list`, `.participant-card`,
  `.participant-card__avatar`, `.participant-card__name`, `.participant-card__role`,
  `.presence`, `.presence__dot`, `.presence--online`, `.presence--offline`,
  `.participant-card__tokens` — Farbwerte nur aus dem Tokenblock, weiterhin genau eine
  `@media` (design.md D9).

## 8. Archivierung (nach menschlicher App-Freigabe)
- [x] 8.1 Haupt-Specs nachziehen: `game-session` (MODIFIED „Sitzungsoberfläche" + ADDED
  „Teilnehmerkarten") und `session-tabs` (MODIFIED „Bereiche der Raumansicht") aus den Deltas;
  Change nach `openspec/changes/archive/YYYY-MM-DD-add-participant-cards/`.
