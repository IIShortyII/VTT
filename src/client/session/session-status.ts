import type { TextKey } from '../i18n/de.js'
import type { GameSessionStatus, MemberRole, TransitionAction } from '../../shared/session.js'
import type { IconName } from '../ui/icons.js'

// add-start-view (#86, design.md D3): Zustand/Rolle -> Beschriftung ist eine Tabelle, kein
// `if` - der Schluessel ist ausschliesslich der vom Server gemeldete `status` bzw. `role`
// (constitution.md §9.1); es gibt keinen anderen Weg in diese Tabellen. `Record<GameSessionStatus,
// ...>` bzw. `Record<MemberRole, ...>` laesst den Typecheck rot werden, sobald `shared/session.ts`
// einen Wert bekommt, den diese Datei nicht kennt.
// ui-text (#87, design.md D3): `label` traegt jetzt einen Textschluessel statt eines
// Rohstrings; ebenso die neue Tabelle `TRANSITION_LABELS` fuer die Uebergangs-Schaltflaechen
// der Raumansicht. Diese Datei importiert nur Typen - kein Laufzeitimport, damit sie
// weiterhin frei von Pixi und React bleibt (design.md D9). Aufrufer schlagen die Texte ueber
// `t(...)` nach.

export interface StatusPresentation {
  label: TextKey
  icon: IconName
  modifier: 'status-pill--active' | 'status-pill--paused' | 'status-pill--ended' | null
}

export const SESSION_STATUS_PRESENTATION: Record<GameSessionStatus, StatusPresentation> = {
  gestartet: { label: 'session.status.active', icon: 'start', modifier: 'status-pill--active' },
  pausiert: { label: 'session.status.paused', icon: 'pause', modifier: 'status-pill--paused' },
  geoeffnet: { label: 'session.status.open', icon: 'players', modifier: null },
  geschlossen: { label: 'session.status.ended', icon: 'lock', modifier: 'status-pill--ended' },
}

export const ROLE_LABELS: Record<MemberRole, TextKey> = {
  spielleiter: 'session.role.gm',
  spieler: 'session.role.player',
}

export const TRANSITION_LABELS: Record<TransitionAction, TextKey> = {
  oeffnen: 'session.action.open',
  starten: 'session.action.start',
  pausieren: 'session.action.pause',
  beenden: 'session.action.end',
}
