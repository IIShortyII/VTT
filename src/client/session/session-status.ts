import type { GameSessionStatus, MemberRole } from '../../shared/session.js'
import type { IconName } from '../ui/icons.js'

// add-start-view (#86, design.md D3): Zustand/Rolle -> Beschriftung ist eine Tabelle, kein
// `if` - der Schluessel ist ausschliesslich der vom Server gemeldete `status` bzw. `role`
// (constitution.md §9.1); es gibt keinen anderen Weg in diese Tabellen. `Record<GameSessionStatus,
// ...>` bzw. `Record<MemberRole, ...>` laesst den Typecheck rot werden, sobald `shared/session.ts`
// einen Wert bekommt, den diese Datei nicht kennt.

export interface StatusPresentation {
  label: string
  icon: IconName
  modifier: 'status-pill--active' | 'status-pill--paused' | 'status-pill--ended' | null
}

export const SESSION_STATUS_PRESENTATION: Record<GameSessionStatus, StatusPresentation> = {
  gestartet: { label: 'Läuft', icon: 'start', modifier: 'status-pill--active' },
  pausiert: { label: 'Pausiert', icon: 'pause', modifier: 'status-pill--paused' },
  geoeffnet: { label: 'Geöffnet', icon: 'players', modifier: null },
  geschlossen: { label: 'Geschlossen', icon: 'lock', modifier: 'status-pill--ended' },
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  spielleiter: 'Spielleiter',
  spieler: 'Spieler',
}
