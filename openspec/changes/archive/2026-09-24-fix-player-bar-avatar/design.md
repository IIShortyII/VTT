# Design — fix-player-bar-avatar (#137)

## D1. Identität der Spieler-Leiste ohne Avatar

`PlayerBar` (`src/client/session/PlayerBar.tsx`) rendert in der Gruppe
`.player-bar__group.player-bar__identity` nur noch:

1. `<h1 className="player-bar__name">{name}</h1>`
2. `<span className="chip">{t('session.role.player')}</span>`

Der Avatar-Span (`.player-bar__avatar`, `role="img"`, `aria-label={ownName}`, Inhalt
`initial`) entfällt ersatzlos. Die Prop `ownName` wird aus `PlayerBarProps` entfernt, ebenso die
Ableitung `initial`. Die Verbindungsanzeige in der Trigger-Gruppe bleibt das einzige Element
der Rolle `img` in der Leiste.

## D2. Aufrufer `SessionRoom`

`SessionRoom.tsx` übergibt `ownName` nicht mehr an `PlayerBar`; die lokale Zeile
`const ownName = self ? displayName(self) : ''` im Spieler-Zweig entfällt, ebenso die Ableitung
`self` dort: sie diente nur `ownName`. Eigene Teilnehmerkarte und Alias-Modal leiten `self`
an ihrer Stelle selbst ab und bleiben unberührt. Kein i18n-Schlüssel ist betroffen (der Avatar hatte keinen eigenen Text).

## D3. Stylesheet

Die Regel `.player-bar__avatar { … }` im Abschnitt „Spieler-Leiste (player-bar, #98)" von
`src/client/app/theme.css` entfällt vollständig. Alle anderen Leisten-Regeln bleiben; die Datei
trägt weiterhin genau eine `@media`-Abfrage (`prefers-reduced-motion`). Der Selektor-Vertrag der
Spieler-Leiste umfasst danach elf Selektoren:
`.player-bar`, `.player-bar__group`, `.player-bar__identity`, `.player-bar__name`,
`.player-bar__triggers`, `.player-bar__trigger`, `.player-bar__connection`,
`.player-bar__badge-note`, `.badge`, `.badge--gold`, `.badge--teal`.

## D4. Testabfragen (UI-Schnittstelle)

| Element | Abfrage |
|---|---|
| Gruppe `Sitzung` | `getByRole('group', { name: 'Sitzung' })` |
| Avatar (darf nicht existieren) | `queryByRole('img', { name: <Anzeigename> })` → `null` |
| Verbindungsanzeige | `getByRole('img', { name: 'Verbindung aktiv' })` |
| Überschrift | `getByRole('heading', { level: 1, name: 'Freitagsrunde' })` |
| Rollen-Pille | Text `Spieler` mit Klasse `chip` |

Das Stylesheet-Szenario liest `theme.css` als Text, entfernt Kommentare, normalisiert
Whitespace und prüft `<selektor> {` je Selektor; zusätzlich MUST NOT `.player-bar__avatar {`
mehr vorkommen.
