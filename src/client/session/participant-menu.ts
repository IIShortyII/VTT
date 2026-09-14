import type { MemberRole, Participant } from '../../shared/session.js'
import type { t } from '../i18n/locale.js'
import type { MenuEntry } from '../ui/menu.js'

// add-participant-cards (#97, design.md D3, spec.md Requirement "Teilnehmerkarten"): die
// Eintraege des ⋮-Menues einer Teilnehmerkarte aus Teilnehmer, Betrachter-Rolle und Texten -
// eine Stelle fuer die vier Faelle der Tabelle in D3. Die Sichtbarkeit folgt der eigenen,
// vom Server im `session:enter`-Ack gesetzten Rolle (`viewerRole`), nicht einer
// clientseitigen Vermutung (constitution.md §9.3). Importiert nur Typen aus `shared/session.ts`,
// `locale.ts` und `menu.tsx` (Muster `token-menu.ts`).

export type Translate = typeof t

export type ParticipantMenuAction = 'zuweisen' | 'entfernen' | 'austreten'

export function participantMenuEntries(
  participant: Participant,
  viewerRole: MemberRole,
  currentUserId: string,
  translate: Translate,
  onAction: (participant: Participant, action: ParticipantMenuAction) => void,
): MenuEntry[] {
  const isOwn = participant.userId === currentUserId

  // Dem Spielleiter: jede fremde Spielerkarte traegt "Tokens zuweisen" und "Entfernen".
  if (viewerRole === 'spielleiter' && !isOwn && participant.role === 'spieler') {
    return [
      { id: 'zuweisen', label: translate('menu.assignTokens'), icon: 'token', onSelect: () => onAction(participant, 'zuweisen') },
      { id: 'entfernen', label: translate('session.remove'), icon: 'delete', danger: true, onSelect: () => onAction(participant, 'entfernen') },
    ]
  }

  // Dem Spieler selbst: die eigene Karte traegt "Austreten".
  if (isOwn && viewerRole === 'spieler') {
    return [{ id: 'austreten', label: translate('session.leave'), icon: 'logout', danger: true, onSelect: () => onAction(participant, 'austreten') }]
  }

  // Eigene Spielleiter-Karte und jede fremde Karte aus Spieler-Sicht: kein Eintrag, also kein
  // ⋮-Trigger (der Aufrufer rendert ihn nur bei nicht-leeren Eintraegen).
  return []
}
