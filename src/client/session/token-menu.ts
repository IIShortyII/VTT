import type { Token } from '../../shared/token.js'
import type { t } from '../i18n/locale.js'
import type { MenuEntry } from '../ui/menu.js'

// ui-menu (#92, design.md D5, spec.md Requirement "Tokenansicht im Raum", "Token-Menü"): die
// vier Eintraege des Token-Menues aus Token, Rolle und Texten - eine Stelle fuer Zeilen- und
// Karten-Menue (design.md D5, "Karte"). `canManage` ist `state.role === 'spielleiter'`
// (Enter-Acknowledgement), `token.shares` kommt vom Server (constitution.md §9.3) - keine
// zweite Berechtigungsregel im Client. Importiert nur Typen aus `menu.tsx`, `shared/token.ts`
// und `locale.ts` (design.md D13).

export type Translate = typeof t

export type TokenMenuAction = 'bearbeiten' | 'zuweisen' | 'freigeben' | 'entfernen'

export function tokenMenuEntries(token: Token, canManage: boolean, translate: Translate, onAction: (token: Token, action: TokenMenuAction) => void): MenuEntry[] {
  return [
    { id: 'bearbeiten', label: translate('menu.edit'), icon: 'edit', disabled: !canManage, onSelect: () => onAction(token, 'bearbeiten') },
    { id: 'zuweisen', label: translate('menu.assign'), icon: 'user', disabled: !canManage, onSelect: () => onAction(token, 'zuweisen') },
    { id: 'freigeben', label: translate('menu.share'), icon: 'players', disabled: token.shares === null, onSelect: () => onAction(token, 'freigeben') },
    { id: 'entfernen', label: translate('menu.remove'), icon: 'delete', danger: true, disabled: !canManage, onSelect: () => onAction(token, 'entfernen') },
  ]
}
