## Context

Vorhanden: `ui-dialog` liefert `Modal` (`title`, `onClose`, `role`, `description`, `wide`;
Schließen-X `Schließen` als erstes Element, Esc auf `document`, Tab-Zyklus, Fokusrückgabe
an den beim ersten Render gemerkten Auslöser) und `useConfirm().confirm({ title, message,
confirmLabel, danger })`. `ui-icons` liefert `Icon` (dekorativ ohne `label`, benannt mit
`label`) und `IconButton` (`<button class="icon-button" aria-label>` mit genau einem
benannten Icon); die Registry kennt `more`, `chevronDown`, `info`, `edit`, `user`,
`players`, `delete`, `map`, `close`, `lock`, `logout`. `ui-form` liefert `Field` und
`SubmitButton`, `ui-feedback` `useToasts().push`, `ui-text` `t`/`useT` mit
`{platzhalter}`. `ui-theme` hat den Format-Vertrag (kein Farbwert außerhalb `:root`,
`@media` nur die Bewegungsabfrage am Dateiende, `animation`/`transition` nur darin),
Tokens `--space-*`, `--radius-*`, `--color-*`, `--panel-grad`, `--shadow-panel`, `--red`,
`--font-mono`, und `.modal-backdrop` mit `z-index: 30`.

Token-Zeile (`TokenPanel.tsx`, `TokenRow`): `<li>` mit Name, Schaltfläche
`<Name> entfernen`, Auswahlfeld `<Name> zuweisen` (`name="owner"`), fünf Wertefelder mit
`id` `token-panel-hp-<id>` usw., `Werte speichern`, `TokenShareControls` (Fieldset mit
Legende `<Name> Freigaben`), Änderung/Schaden/Heilung, Markierungsbedienung,
`TokenStatsText`. Props: `sessionId`, `tokens`, `participants`, `onCreate`, `onRemove`,
`onAssign`, `onSetStats`, `onSetConditions`, `onShare`. Spielerliste
(`TokenStats.tsx`, `PlayerTokenList`): `<li>` mit Name, `TokenStatsText`,
`TokenShareControls`; Props `tokens`, `participants`, `onShare`. `SessionRoom.tsx` hält
`handleTokenRemove(tokenId)`, `handleTokenAssign(tokenId, ownerId)`,
`handleTokenShare(tokenId, stat, audience)`, `handleCopyCode()` (Toast bei Erfolg),
rendert für den Spielleiter `Code: <code>` mit `Kopieren` und übergibt der Kartenansicht
`onTokenMove`/`canMoveToken`. Die Canvas-Fassade (`map/canvas.ts`, `createMapCanvas`)
liest Rückrufe nur beim Erzeugen; Token-Container sind nur bei Greifbarkeit
`eventMode: 'static'` mit `pointerdown`; die Bühne hört `pointerdown`/`pointermove`/
`pointerup`/`pointerupoutside`, das Canvas `wheel`. `MapCanvas.tsx` reicht die Rückrufe beim
Erzeugen durch. Karten-Zeile (`MapPanel.tsx`): `<li aria-current>` mit Name und den
Schaltflächen `<Name> aktivieren`, `<Name> aushängen`; `handleUnmount(instanceId)` lädt
danach die Liste neu. Bibliothek (`MapLibrary.tsx`): `<li>` je Karte mit einer
Schaltfläche, deren Text der Kartenname ist (`openMap`), Löschen nur in der Detailansicht
(`handleDelete` über `confirm` mit `map.delete.*`, dann `deleteMap`, `backToList`,
`reload`). Top-Bar (`AppShell.tsx`): `<div class="app-shell-account">` mit Nutzername und
`Abmelden` (`button.link`); `AppShell` importiert nur `react`, `build-info`, `Icon`,
`LocaleSwitch`, `locale`. `App.tsx` übergibt `account`/`onLogout`. Sitzungsliste
(`SessionList.tsx`): `<details class="start-account">` mit Summary `Passwort ändern` und
`ChangePasswordForm` (Toast bei Erfolg, Felder geleert). Bindend und nicht wiederholt:
`constitution.md` §9 — welche Einträge aktiv sind, folgt dem, was der Server gemeldet hat.

## Goals / Non-Goals

**Goals:**
- **Ein Modul, eine Mechanik.** Menü, Trigger und Popover teilen den Schwebezustand
  (`useFloating`): Anker, Klemmen, Klick außerhalb, Fokusrückgabe. Kein Portal, keine
  Bibliothek.
- **Auswahl gibt den Fokus vor `onSelect` zurück**, damit `Modal`/`confirm` den Trigger als
  Auslöser vorfinden und der Fokus nach dem Dialog dort landet.
- **Berechtigung aus Serverdaten**: Rolle aus dem Enter-Acknowledgement, `shares` aus der
  Tokendarstellung. Keine zweite Regel im Client.
- **Buchstabengleich unter Deutsch** für alles, was nicht in den Deltas genannt ist.
- **Stabile Rückrufe**: die Funktionen des Schwebezustands ändern ihre Identität nicht,
  damit ein beim Erzeugen der Canvas-Fassade übergebener Rückruf gültig bleibt.

**Non-Goals:**
- Kein Untermenü, keine Tastenkürzel, keine Menüleiste (`role="menubar"`).
- Kein Bearbeiten von Name, Farbe oder Symbol (kein Server-Event dafür; #95).
- Kein Menü an Sitzungskarten, Fog-Bereichen, Anmerkungen, Teilnehmerzeilen.
- Keine `pointer: coarse`-Abfrage (Format-Vertrag von `ui-theme`).
- Keine Übersetzung weiterer Rohstrings der Panels; nur neue Texte laufen über `t()`.

## Decisions

### D1 — Modul `src/client/ui/menu.tsx` und der Schwebezustand

Exporte (verbindlich):

```ts
export interface Anchor { x: number; y: number }
export interface FloatingState {
  open: boolean
  anchor: Anchor | null
  triggerRef: RefObject<HTMLButtonElement | null>
  openAt(anchor: Anchor): void
  toggle(): void
  close(): void
  returnFocus(): void
  onContextMenu(event: MouseEvent<HTMLElement>): void
}
export function useFloating(): FloatingState

export interface MenuEntry { id: string; label: string; icon?: IconName; danger?: boolean; disabled?: boolean; onSelect: () => void }
export type MenuTriggerVariant = 'more' | 'text' | 'icon'
export interface MenuTriggerProps { floating: FloatingState; label: string; variant?: MenuTriggerVariant; icon?: IconName; haspopup?: 'menu' | 'dialog'; className?: string }
export function MenuTrigger(props: MenuTriggerProps): JSX.Element
export interface ActionMenuProps { floating: FloatingState; label: string; entries: MenuEntry[] }
export function ActionMenu(props: ActionMenuProps): JSX.Element | null
export interface ActionMenuButtonProps { label: string; entries: MenuEntry[]; variant?: MenuTriggerVariant; icon?: IconName; className?: string }
export function ActionMenuButton(props: ActionMenuButtonProps): JSX.Element
export interface PopoverProps { floating: FloatingState; label: string; children: ReactNode }
export function Popover(props: PopoverProps): JSX.Element | null
```

`useFloating` hält `open`, `anchor` (State), `triggerRef` und einen Ref `returnTarget`
(`HTMLElement | null`). Semantik:
- `openAt(anchor)`: merkt `document.activeElement` als `returnTarget` (nur, wenn es ein
  `HTMLElement` ist), setzt `anchor` und `open = true`.
- `toggle()`: bei `open` → `close()`; sonst Anker aus `triggerRef.current.getBoundingClientRect()`
  als `{ x: rect.left, y: rect.bottom }` und `openAt`. Ohne Trigger `openAt({ x: 0, y: 0 })`.
- `close()`: `open = false`, `anchor = null`. Setzt keinen Fokus.
- `returnFocus()`: fokussiert `triggerRef.current`, falls verbunden (`isConnected`), sonst
  `returnTarget`, falls verbunden; sonst nichts.
- `onContextMenu(event)`: ist `event.target` ein Formularziel (Element, dessen
  `closest('input, select, textarea, button, a')` nicht `null` ist) → nichts tun (kein
  `preventDefault`). Sonst `event.preventDefault()` und `openAt({ x: event.clientX, y:
  event.clientY })`.
- Alle fünf Funktionen sind mit `useCallback` ohne veränderliche Abhängigkeiten gebildet
  (sie benutzen nur State-Setter und Refs) — ihre Identität bleibt über die Lebensdauer
  der Komponente gleich (Goal „stabile Rückrufe").

### D2 — `ActionMenu`

Rendert `null`, solange `floating.open` falsch ist. Sonst (verbindlich):

```
<ul role="menu" className="menu" aria-label={label} ref={listRef} style={{ position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px` }} onKeyDown={handleKeyDown}>
  <li role="menuitem" className="menu-item" | "menu-item menu-item--danger" aria-disabled={entry.disabled ? 'true' : undefined} tabIndex={index === active ? 0 : -1} onClick={() => select(index)} onFocus={() => setActive(index)}>
    {entry.icon && <Icon name={entry.icon} />}
    <span>{entry.label}</span>
  </li>
</ul>
```

- **Position.** `pos` startet mit `floating.anchor`. Ein `useLayoutEffect` (Abhängigkeit
  `floating.anchor`) liest `listRef.current.getBoundingClientRect()` (`width`, `height`),
  `window.innerWidth`/`innerHeight` und setzt `pos` auf den geklemmten Wert (Begriff
  „Geklemmt" in der Spec: `Math.max(8, Math.min(anchor.x, innerWidth - width - 8))`,
  entsprechend `y`). Bei Breite/Höhe 0 (jsdom ohne Mock) bleibt der Anker, sofern er
  hineinpasst.
- **Aktiver Eintrag.** State `active` (Index). Beim Öffnen (Effekt mit Abhängigkeit
  `floating.open`) wird `active` auf den ersten nicht gesperrten Eintrag gesetzt und
  dieser fokussiert (`items[active].focus()` über ein Array von `<li>`-Refs). `onFocus`
  eines Eintrags setzt `active` (Mausfokus).
- **Tastatur** (`handleKeyDown` auf dem `<ul>`, jeweils mit `preventDefault`):
  `ArrowDown` → nächster nicht gesperrter Index, nach dem letzten der erste; `ArrowUp`
  → rückwärts, vor dem ersten der letzte; `Home`/`End` → erster/letzter nicht gesperrter;
  jeweils `setActive` und `focus()`. `Enter` und `' '` → `select(active)`. `Escape` →
  `dismiss()`. `Tab` → `dismiss()` (mit `preventDefault`, Spec „Tab schließt"). Andere
  Tasten unberührt.
- **`select(index)`**: ist der Eintrag gesperrt → nichts. Sonst in dieser Reihenfolge:
  `floating.returnFocus()`, `floating.close()`, `entry.onSelect()`. Der Fokus liegt damit
  beim Aufruf von `onSelect` auf dem Trigger — ein dort geöffnetes `Modal` merkt ihn als
  Auslöser (`ui-dialog`, „Fokusrückgabe").
- **`dismiss()`**: `floating.close()`, dann `floating.returnFocus()`.
- **Klick außerhalb.** Effekt, solange `open`: `mousedown`-Listener auf `document`; liegt
  `event.target` weder in `listRef.current` noch in `floating.triggerRef.current` →
  `dismiss()`. Cleanup entfernt den Listener.
- Kein Portal, kein `aria-activedescendant` — echter Fokus auf dem `<li>` (roving
  `tabindex`).

### D3 — `MenuTrigger` und `ActionMenuButton`

`MenuTrigger` rendert selbst ein `<button type="button">` (kein `IconButton` — der nimmt
keinen `ref` entgegen, der Trigger braucht `floating.triggerRef`):

- Attribute: `ref={floating.triggerRef}`, `aria-haspopup={haspopup ?? 'menu'}`,
  `aria-expanded={floating.open}` (rendert `"true"`/`"false"`), `onClick={floating.toggle}`,
  `className` = `menu-trigger` plus `icon-button` bei den Varianten `more`/`icon`, plus
  `className` der Props.
- Variante `more` (Standard): `aria-label={label}`, einziges Kind `<Icon name="more"
  label={label} />` (benanntes Icon, wie `IconButton`).
- Variante `icon`: wie `more` mit `<Icon name={icon} label={label} />`.
- Variante `text`: Kinder `{label}` als Textknoten und danach `<Icon name="chevronDown" />`
  (dekorativ); kein `aria-label`.

`ActionMenuButton` = `const floating = useFloating()` und ein Fragment aus
`<MenuTrigger floating label variant icon className />` und `<ActionMenu floating label
entries />`. `label` ist Name des Triggers und `aria-label` des Menüs.

### D4 — `Popover`

Rendert `null`, solange `floating.open` falsch ist. Sonst:

```
<div role="dialog" className="popover" aria-label={label} tabIndex={-1} ref={boxRef} style={{ position: 'fixed', left, top }} onKeyDown={handleKeyDown}>
  {children}
</div>
```

Position wie D2 (Klemmen im `useLayoutEffect`). Beim Öffnen (Effekt mit Abhängigkeit
`floating.open`) `boxRef.current.focus()`. `handleKeyDown`: `Escape` → `preventDefault`,
`floating.close()`, `floating.returnFocus()`. Klick außerhalb wie D2 (`mousedown` auf
`document`, Ziel weder in der Box noch im Trigger → schließen und Fokus zurück). Kein
`aria-modal`, kein Backdrop, kein Tab-Zyklus, kein Esc-Listener auf `document` — Esc wirkt
nur, solange der Fokus im Popover liegt.

### D5 — Token-Menü

**Einträge** in einer neuen Datei `src/client/session/token-menu.ts` (verbindlich):

```ts
export type TokenMenuAction = 'bearbeiten' | 'zuweisen' | 'freigeben' | 'entfernen'
export function tokenMenuEntries(token: Token, canManage: boolean, t: Translate, onAction: (token: Token, action: TokenMenuAction) => void): MenuEntry[]
```

`Translate` ist der Typ der Funktion, die `useT()` liefert. Die vier Einträge in dieser
Reihenfolge:

| `id` | `label` | `icon` | `danger` | `disabled` |
|---|---|---|---|---|
| `bearbeiten` | `t('menu.edit')` | `edit` | – | `!canManage` |
| `zuweisen` | `t('menu.assign')` | `user` | – | `!canManage` |
| `freigeben` | `t('menu.share')` | `players` | – | `token.shares === null` |
| `entfernen` | `t('menu.remove')` | `delete` | wahr | `!canManage` |

`onSelect` ruft `onAction(token, <id>)`. `canManage` ist `state.role === 'spielleiter'`
(Enter-Acknowledgement); `shares` kommt vom Server (`constitution.md` §9.3).

**Zeilen.** `TokenRow` (`TokenPanel.tsx`) und die Zeile in `PlayerTokenList`
(`TokenStats.tsx`, als eigene Komponente `PlayerTokenRow`, weil sie Hooks braucht) rendern
je Token einen eigenen Schwebezustand:

```
<li onContextMenu={floating.onContextMenu}>
  <span>{token.name}</span>
  <MenuTrigger floating={floating} label={t('menu.rowActions', { name: token.name })} />
  … (übrige Zeile wie bisher, ohne `<Name> entfernen`, ohne Auswahlfeld `<Name> zuweisen`, ohne `TokenShareControls`)
  <ActionMenu floating={floating} label={t('menu.rowActions', { name: token.name })} entries={menuEntries(token)} />
</li>
```

Neue Props: `TokenPanel` verliert `participants`, `onRemove`, `onAssign`, `onShare` und
bekommt `menuEntries: (token: Token) => MenuEntry[]`; `PlayerTokenList` verliert
`participants`, `onShare` und bekommt `menuEntries`. `SessionRoom` bildet
`menuEntries = (token) => tokenMenuEntries(token, state.role === 'spielleiter', t,
handleTokenAction)`.

**`handleTokenAction(token, action)`** in `SessionRoom`:
- `bearbeiten`: Element mit `id` `token-panel-hp-<token.id>` per `document.getElementById`
  holen; falls vorhanden `scrollIntoView` (nur, wenn die Methode existiert — jsdom hat sie
  nicht) und `focus()`. Vom Karten-Menü aus ist das der einzige Weg zur Zeile.
- `zuweisen`: State `assignTokenId = token.id`.
- `freigeben`: State `shareTokenId = token.id`.
- `entfernen`: `confirm({ title: t('token.remove.title', { name }), message:
  t('token.remove.message'), confirmLabel: t('token.remove.confirm'), danger: true })`;
  bei `true` `handleTokenRemove(token.id)`.

**Zuweisen-Modal** (gerendert, solange `assignTokenId` auf ein Token in `state.tokens`
zeigt; verschwindet das Token, wird der State auf `null` gesetzt), Titel
`t('token.assign.title', { name })`, `onClose` setzt `assignTokenId` auf `null`:

```
<form className="form-grid" onSubmit={…}>
  <Field id="token-assign-owner" label={t('token.assign.player')}>
    {(control) => <select {...control} name="owner" value={owner} onChange={…}>
      <option value="">{t('session.role.gm')}</option>
      {players.map((p) => <option value={p.userId}>{displayName(p)}</option>)}
    </select>}
  </Field>
  <div className="form-actions"><SubmitButton pending={false}>{t('token.assign.submit')}</SubmitButton></div>
</form>
```

`players` = Mitglieder mit Rolle `spieler`; `owner` startet mit `token.ownerId ?? ''` (als
lokaler State einer eigenen Komponente `AssignTokenDialog` mit `key={token.id}`). Absenden:
`handleTokenAssign(token.id, owner === '' ? null : owner)`, dann schließen. Die Anzeige
folgt weiterhin `session:tokens`.

**Freigaben-Modal** (gerendert, solange `shareTokenId` auf ein Token in `state.tokens`
zeigt), Titel `t('token.share.title', { name })`, `wide`, Inhalt
`<TokenShareControls token={liveToken} participants={state.participants}
onShare={handleTokenShare} />` — `liveToken` ist das Token aus `state.tokens` (Kästchen
folgen dem Server). `TokenShareControls` bleibt unverändert (Legende `<Name> Freigaben`).

**Karte.** `MapCanvasOptions` und `MapCanvasProps` bekommen
`onTokenContextMenu?: (tokenId: string, anchor: Anchor) => void` (nur beim Erzeugen gelesen,
Muster `onTokenMove`; `MapCanvas` reicht ihn beim Erzeugen durch). In `createMapCanvas`:
- `app.canvas.addEventListener('contextmenu', onContextMenu)` mit `event.preventDefault()`,
  im `destroy` entfernt (Muster `wheel`).
- In `onPointerDown` der Bühne: bei `event.button === 2` sofort zurück — ein Rechtsklick
  startet kein Schwenken und keine Geste.
- In `buildTokenContainer`, wenn `options.onTokenContextMenu` gesetzt ist: `eventMode =
  'static'` (auch für nicht greifbare Tokens) und `on('rightdown', …)`: `stopPropagation`,
  dann `onTokenContextMenu(token.id, { x: event.client.x, y: event.client.y })`.

In `SessionRoom`: `mapMenu = useFloating()`, State `mapMenuTokenId`;
`handleTokenContextMenu(tokenId, anchor)` (an `MapCanvas` übergeben) setzt den State und
ruft `mapMenu.openAt(anchor)`; unter der Bühne wird `<ActionMenu floating={mapMenu}
label={t('menu.rowActions', { name })} entries={menuEntries(token)} />` gerendert, solange
das Token in `state.tokens` existiert. Weil `openAt` stabil ist (D1) und der State-Setter
ebenso, bleibt der beim Erzeugen übergebene Rückruf gültig.

### D6 — Karten-Zeile (`MapPanel.tsx`)

Eigene Komponente `MapInstanceRow` (Props `instance`, `active`, `onActivate`, `onUnmount`):

```
<li aria-current={active ? 'true' : undefined} onContextMenu={floating.onContextMenu}>
  <span>{instance.name}</span>
  <MenuTrigger floating={floating} label={t('menu.rowActions', { name })} />
  <ActionMenu floating={floating} label={t('menu.rowActions', { name })} entries={[
    { id: 'activate', label: t('menu.activate'), icon: 'map', onSelect: () => onActivate(instance.id) },
    { id: 'unmount', label: t('menu.unmount'), icon: 'close', onSelect: () => onUnmount(instance.id) },
  ]} />
</li>
```

Die Schaltflächen `<Name> aktivieren`/`<Name> aushängen` entfallen. `handleUnmount`,
`onActivate`, Formular und `Keine Karte anzeigen` bleiben.

### D7 — Bibliothekskarte (`MapLibrary.tsx`)

Eigene Komponente `LibraryRow` (Props `map`, `onOpen`, `onDelete`):

```
<li onContextMenu={floating.onContextMenu}>
  {!map.hasImage && <span>{`${map.name} (ohne Bild)`}</span>}
  <button type="button" onClick={() => onOpen(map)}>{map.name}</button>
  <MenuTrigger floating={floating} label={t('menu.rowActions', { name: map.name })} />
  <ActionMenu floating={floating} label={…} entries={[
    { id: 'open', label: t('menu.open'), icon: 'map', onSelect: () => onOpen(map) },
    { id: 'delete', label: t('menu.delete'), icon: 'delete', danger: true, onSelect: () => onDelete(map) },
  ]} />
</li>
```

`onDelete(map)` in `MapLibrary` (`handleDeleteFromList`): `confirm` mit denselben Optionen
wie `handleDelete` (`map.delete.title` mit `map.name`, `map.delete.message`,
`map.delete.confirm`, `danger`); bei `true` `deleteMap(map.id)`, bei `ok` `reload()`, sonst
neuer State `listError` (Meldung), gerendert als `<p role="alert">` in der Listenansicht
nach `loadError`; Netzfehler → `GENERIC_DELETE_ERROR_MESSAGE`. Detailansicht unverändert.

### D8 — Kontomenü

`AppShellProps` bekommt `onChangePassword: () => void`. Die Kontozone:

```
<div className="app-shell-account">
  <ActionMenuButton variant="text" label={account.username} entries={[
    { id: 'password', label: t('shell.changePassword'), icon: 'lock', onSelect: onChangePassword },
    { id: 'logout', label: t('shell.logout'), icon: 'logout', onSelect: onLogout },
  ]} />
</div>
```

`AppShell` importiert zusätzlich `./menu.js`-Bausteine aus `../ui/` (Kommentar zur
Importliste anpassen). `App` hält `passwordOpen` (Startwert `false`), übergibt
`onChangePassword={() => setPasswordOpen(true)}` und rendert innerhalb der Shell nach
`content`:

```
{passwordOpen && (
  <Modal title={t('shell.changePassword')} onClose={() => setPasswordOpen(false)}>
    <ChangePasswordForm onSuccess={() => setPasswordOpen(false)} />
  </Modal>
)}
```

`ChangePasswordForm` bekommt die optionale Prop `onSuccess?: () => void`, aufgerufen nach
dem Toast und dem Leeren der Felder; das Feld `Bisheriges Passwort` bekommt `autoFocus`
(das Modal lässt es ihm, `ui-dialog` „Ein Kind mit autoFocus behält den Fokus").
`SessionList` verliert das `<details class="start-account">` und den Import des Formulars.
Der Auslöser des Modals ist der Text-Trigger (D2: Fokus vor `onSelect` zurück) — nach dem
Schließen liegt der Fokus wieder auf ihm.

### D9 — Sitzungscode-Popover

In `SessionRoom` (Spielleiter, `state.code` gesetzt) ersetzt dieser Block den Absatz
`Code: … Kopieren` (`<div>` statt `<p>`, weil der Popover ein `<div>` ist):

```
<div className="session-room-code">
  <span>Code: </span>
  <span className="session-code-mask">{'•'.repeat(state.code.length)}</span>
  <MenuTrigger floating={codeFloating} variant="icon" icon="info" haspopup="dialog" label={t('session.showCode')} />
  <Popover floating={codeFloating} label={t('session.code')}>
    <code className="session-code">{state.code}</code>
    <button type="button" onClick={handleCopyCode}>{t('session.copyCode')}</button>
  </Popover>
</div>
```

`codeFloating = useFloating()`. Die Maske ist der Punkt `•` (U+2022) so oft, wie der Code
Zeichen hat (sechs). `handleCopyCode` bleibt (Toast bei Erfolg, nichts bei Fehlschlag);
der Popover bleibt nach dem Kopieren offen. Für einen Spieler wird nichts davon gerendert
(`state.code` fehlt).

### D10 — Wörterbücher (`de.ts`, `en.ts`)

Neue Schlüssel (verbindlich, buchstabengleich; Auslassungspunkte als ein Zeichen `…`,
Anführungszeichen `„"` wie bei `map.delete.title`). `start.account.password` entfällt in
beiden Wörterbüchern. Gruppen im deutschen Wörterbuch: `shell.*` bei den
Shell-Schlüsseln, `session.*` bei den Sitzungsschlüsseln, `menu.*` und `token.*` als neue
Gruppen vor `form.stillWorking`; das englische spiegelt die Menge (Typfehler bei
Abweichung).

| Schlüssel | Deutsch | Englisch |
|---|---|---|
| `shell.account` | Konto | Account |
| `shell.changePassword` | Passwort ändern | Change password |
| `session.showCode` | Sitzungscode anzeigen | Show session code |
| `session.code` | Sitzungscode | Session code |
| `menu.rowActions` | Aktionen für {name} | Actions for {name} |
| `menu.edit` | Bearbeiten | Edit |
| `menu.assign` | Zuweisen… | Assign… |
| `menu.share` | Freigeben… | Share… |
| `menu.remove` | Entfernen | Remove |
| `menu.activate` | Aktivieren | Activate |
| `menu.unmount` | Aushängen | Unmount |
| `menu.open` | Öffnen | Open |
| `menu.delete` | Löschen | Delete |
| `token.assign.title` | {name} zuweisen | Assign {name} |
| `token.assign.player` | Spieler | Player |
| `token.assign.submit` | Zuweisen | Assign |
| `token.share.title` | Freigaben für {name} | Sharing for {name} |
| `token.remove.title` | Token „{name}" entfernen? | Remove token "{name}"? |
| `token.remove.message` | Das Token wird von der Karte entfernt. | The token is removed from the map. |
| `token.remove.confirm` | Entfernen | Remove |

`shell.account` ist reserviert für Epic C (Beschriftung einer Kontozone) und wird hier
nur angelegt; das Kontomenü trägt den Nutzernamen als Namen.

### D11 — Stylesheet (Abschnitt „Menüs" in `theme.css`)

Nach dem Abschnitt „Zustandsanzeigen" und vor dem Bewegungsblock ein Kommentar
`/* Menüs (ui-menu, #92) */` und diese Regeln — nur `var(--…)`, kein Farbwert, kein neues
`@media`:

- `.menu`: `position: fixed`, `z-index: 40`, `min-width: 12rem`, `margin: 0`,
  `padding: var(--space-1)`, `list-style: none`, `border: 1px solid var(--color-border)`,
  `border-radius: var(--radius-5)`, `background: var(--panel-grad)`,
  `box-shadow: var(--shadow-panel)`.
- `.menu-item`: `display: flex`, `align-items: center`, `gap: var(--space-2)`,
  `min-height: 36px`, `padding: var(--space-2) var(--space-3)`,
  `border-radius: var(--radius-2)`, `cursor: pointer`, `color: var(--color-text)`.
- `.menu-item:hover, .menu-item:focus-visible`: `background: var(--color-surface-hover)`.
- `.menu-item--danger`: `color: var(--red)`.
- `.menu-item[aria-disabled="true"]`: `color: var(--color-text-faint)`, `cursor: default`,
  `background: none`.
- `.menu-trigger`: `min-height: 36px`, `min-width: 36px`.
- `.popover`: `position: fixed`, `z-index: 40`, `display: flex`, `align-items: center`,
  `gap: var(--space-3)`, `padding: var(--space-3) var(--space-4)`,
  `border: 1px solid var(--color-border)`, `border-radius: var(--radius-5)`,
  `background: var(--panel-grad)`, `box-shadow: var(--shadow-panel)`.
- `.session-room-code`: `display: flex`, `align-items: center`, `gap: var(--space-2)`,
  `margin: 0 0 var(--space-3)`.
- `.session-code-mask`, `.session-code`: `font-family: var(--font-mono)`,
  `letter-spacing: 0.1em`; `.session-code` zusätzlich `font-size: var(--font-size-4)`.
- Die Regel `.start-account` im Abschnitt „Startansicht" entfällt.

Im Bewegungsblock zusätzlich `@keyframes menu-in` (wie `modal-in`) und
`.menu, .popover { animation: menu-in 0.12s ease-out; }`.

### D12 — Schnittstelle für die Tests

Adressen (Testing-Library-Abfragen über Rolle, Namen und Text; Listen und Panels immer
gescoped):

| Element | Adresse |
|---|---|
| Baustein-Szenarien | rendern eine kleine Harness-Komponente, die `useFloating()` aufruft und `MenuTrigger`, `ActionMenu` bzw. `Popover` (Exporte aus `src/client/ui/menu.tsx`) mit diesem Schwebezustand komponiert — als `<li>` mit `onContextMenu` für die Zeilen-Szenarien; für „geschlossen" wird der Schwebezustand nicht geöffnet; `ActionMenuButton` für die Szenarien mit Trigger |
| Menü, Einträge | `getByRole('menu', { name })`, `within(menu).getAllByRole('menuitem')`; gesperrt = Attribut `aria-disabled` gleich `"true"`; gefährlich = Klasse `menu-item--danger`; aktiver Eintrag = `document.activeElement` und `tabindex="0"` |
| Trigger | `getByRole('button', { name })` mit `aria-haspopup`/`aria-expanded` als Attribute; Klasse `menu-trigger` |
| Tastatur | `keyDown` mit `key` `ArrowDown`, `ArrowUp`, `Home`, `End`, `Enter`, `' '`, `Escape`, `Tab` auf `document.activeElement`; „unterdrückt" = der Rückgabewert von `fireEvent` ist `false` (`defaultPrevented`) |
| Klick außerhalb | `mouseDown` auf `document.body` |
| Rechtsklick | `contextMenu` mit `clientX`/`clientY` auf dem Ziel; „am Zeiger" = Inline-Stil `left`/`top` des Menüs in `px` |
| Klemmen | vor dem Öffnen `window.innerWidth`/`innerHeight` setzen (schreibbar in jsdom) und `getBoundingClientRect` des Menü-Elements (Klasse `menu`) auf ein Objekt mit `width`/`height` überschreiben — etwa über einen Spy auf `HTMLElement.prototype.getBoundingClientRect`, der für Elemente mit Rolle `menu` die Maße liefert und sonst Nullen; Cleanup stellt das Original wieder her |
| Popover | `getByRole('dialog', { name })`; Fokus = `document.activeElement`; Backdrop-Abwesenheit = `document.querySelector('.modal-backdrop')` ist `null` |
| Token-Menü im Raum | Trigger `Aktionen für Goblin` in der Token-Verwaltung (Elternelement der Überschrift `Tokens`) bzw. unter `Tokenwerte`; Menü `Aktionen für Goblin`; Karten-Rechtsklick = den beim Erzeugen übergebenen `onTokenContextMenu` der Canvas-Mock-Optionen mit der Token-`id` und `{ x, y }` aufrufen, wie die bestehenden Suiten `onTokenMove` aufrufen |
| Zuweisen-Modal | `getByRole('dialog', { name: 'Goblin zuweisen' })`, darin Auswahlfeld `Spieler` (`getByLabelText`) und Schaltfläche `Zuweisen`; Absenden per `submit` des Formulars oder Klick |
| Freigaben-Modal | `getByRole('dialog', { name: 'Freigaben für Goblin' })`, darin die Kontrollkästchen mit den bisherigen Namen (`Goblin HP für alle` …) |
| Bestätigung Entfernen | `getByRole('alertdialog', { name: 'Token „Goblin" entfernen?' })`, Schaltfläche `Entfernen` darin (`within`), `Abbrechen` |
| Bearbeiten | nach Auswahl von `Bearbeiten` ist `document.activeElement` das Feld `Goblin HP` |
| Karten-Zeile | Trigger `Aktionen für Taverne` in der Kartenverwaltung (Elternelement der Überschrift `Karten`), Einträge `Aktivieren`/`Aushängen` |
| Bibliothekskarte | Trigger `Aktionen für Taverne` in der Bibliothek, Einträge `Öffnen`/`Löschen`; Bestätigung `Karte „Taverne" löschen?` |
| Kontomenü | Schaltfläche mit dem Nutzernamen im `<header>` (`within(header)`), `aria-haspopup="menu"`; Menü mit dem Nutzernamen als Name; Einträge `Passwort ändern`, `Abmelden` |
| Passwort-Modal | `getByRole('dialog', { name: 'Passwort ändern' })`, darin Felder `Bisheriges Passwort`/`Neues Passwort` und die Schaltfläche `Passwort ändern` (`within`) |
| Sitzungscode | Maske `••••••` per `getByText`; Trigger `Sitzungscode anzeigen`; Popover `Sitzungscode` mit Text `ABC234` und Schaltfläche `Kopieren` (`within`) |
| Stylesheet | `theme.css` als Text (Kommentare entfernen, Whitespace normalisieren, `<selektor> {` suchen, `@media`-Blöcke per Klammerzählung) — dieselben Helfer wie in der Theme-/Dialog-Suite, sie können dupliziert werden |
| Sprache | `setLocale('en')` aus `src/client/i18n/locale.ts` vor dem Rendern, im Cleanup zurück auf `de` |

Szenarien, die Exporte des noch fehlenden Moduls `menu.tsx` importieren, gehören in eine
eigene Datei, damit ein Ladefehler die bestehenden Suiten nicht mitreißt. Die Raum-Szenarien
rendern `App` mit gemocktem `fetch` und gemockter Socket-/Canvas-Fassade nach dem Muster der
bestehenden Raum-Suiten; die Canvas-Mock-Optionen (zweites Argument von `createMapCanvas`)
tragen `onTokenContextMenu`. Bestehende Text-Abfragen nach dem Nutzernamen im `<header>`
treffen jetzt eine Schaltfläche.

### D13 — Reihenfolge der Kopplungen

`menu.tsx` importiert `react`, `./Icon.js` und den Typ `IconName` aus `./icons.js`, sonst
nichts. `token-menu.ts` importiert Typen aus `menu.tsx`, `shared/token.ts` und `locale.ts`.
`TokenPanel`, `TokenStats`, `MapPanel`, `MapLibrary`, `SessionRoom` importieren `menu.tsx`;
`SessionRoom` zusätzlich `token-menu.ts`, `Modal.tsx`, `confirm.tsx`, `form.tsx`,
`TokenShare.tsx`. `AppShell` importiert `menu.tsx`; `App` importiert `Modal.tsx` und
`ChangePasswordForm.tsx`. `canvas.ts`/`MapCanvas.tsx` ändern nur Optionen und Ereignisse;
`pixi.js` bleibt außerhalb der statischen Importkette von `App`. Kein Server-Code.

## Risks / Trade-offs

- **Roving `tabindex` auf `<li>`** → jsdom fokussiert `<li tabindex>` wie Browser; kein
  `aria-activedescendant` nötig. Ein Screenreader liest Rolle, Name und `aria-disabled`.
- **Fokus vor `onSelect` zurück** → ein `onSelect`, das selbst fokussiert (`Bearbeiten`),
  gewinnt, weil es danach läuft. Gewollt.
- **Maskierter Code** → die Spielleitung muss für jeden Blick einen Klick mehr tun; dafür
  steht der Code nicht dauerhaft auf einem geteilten Bildschirm.
- **`rightdown` auf allen Token-Containern** setzt `eventMode: 'static'` auch für nicht
  greifbare Tokens → ihr `pointerdown` bubbelt zur Bühne (kein Handler am Container), das
  Schwenken bleibt.
- **Rechtsklick startet kein Schwenken mehr** (`button === 2` in `onPointerDown` ignoriert)
  → bisher schwenkte ein Rechtsklick-Zug die Karte; das war ein Nebeneffekt, kein
  Verhalten aus einer Spec.
- **Zwei Schwebezustände gleichzeitig offen** (Zeilen-Menü und Karten-Menü) sind möglich,
  weil jedes seinen Klick-außerhalb-Listener nur auf sein Element bezieht; der zweite
  `mousedown` schließt das erste. Kein globaler „genau eins offen"-Zustand.
- **`start.account.password` entfällt** → ein Test, der den Schlüssel liest, wird zum
  Typfehler; die `ui-text`-Suite prüft nur Schlüsselgleichheit beider Wörterbücher.
