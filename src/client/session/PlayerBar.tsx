import type { GameSessionStatus } from '../../shared/session.js'
import { useT } from '../i18n/locale.js'
import { Icon } from '../ui/Icon.js'
import { SESSION_STATUS_PRESENTATION } from './session-status.js'

// player-bar (#98, design.md D1, Requirement "Aufbau der Spieler-Leiste"): die eigene
// Kopfleiste eines Spielers - ersetzt `SessionBar` und die Reiterliste `Bereiche`
// (`session-tabs`) fuer diese Rolle. Rein praesentational (kein eigener State); zeigt
// ausschliesslich, was der Server gemeldet hat, und sendet Absichten ueber die drei
// `onOpen*`-Rueckrufe (constitution.md §9.1). Kein Sitzungscode, keine Maske, keine
// Uebergangs-Schaltflaechen - der Server sendet einem Spieler keinen Code
// (constitution.md §9.2). Diese Datei importiert nur `react`, `shared/session.ts`,
// `session-status.ts`, `locale.ts` und `ui/Icon.tsx` (design.md D6).
//
// fix-player-bar-avatar (#137, design.md D1, Requirement "Aufbau der Spieler-Leiste"): die
// Identitaet traegt keinen Avatar mehr - kein Element der Rolle `img` mit dem Anzeigenamen
// und keine Initiale; der Anzeigename bleibt ueber die Teilnehmerkarten (Modal `Teilnehmer`)
// erreichbar. Die Verbindungsanzeige bleibt das einzige Element der Rolle `img` in der Leiste.

export interface PlayerBarProps {
  name: string
  status: GameSessionStatus
  connected: boolean
  tokenCount: number
  tokenEvent: boolean
  annotationsDisabled: boolean
  onOpenTokens: () => void
  onOpenAnnotations: () => void
  onOpenParticipants: () => void
}

export function PlayerBar({
  name,
  status,
  connected,
  tokenCount,
  tokenEvent,
  annotationsDisabled,
  onOpenTokens,
  onOpenAnnotations,
  onOpenParticipants,
}: PlayerBarProps) {
  const t = useT()
  const presentation = SESSION_STATUS_PRESENTATION[status]

  return (
    <div className="player-bar" role="group" aria-label={t('playerBar.label')}>
      <div className="player-bar__group player-bar__identity">
        <h1 className="player-bar__name">{name}</h1>
        <span className="chip">{t('session.role.player')}</span>
      </div>

      <div className="player-bar__group">
        <span className={presentation.modifier ? `status-pill ${presentation.modifier}` : 'status-pill'}>
          <Icon name={presentation.icon} /> {t(presentation.label)}
        </span>
      </div>

      <div className="player-bar__group player-bar__triggers">
        <button type="button" className="player-bar__trigger" onClick={onOpenTokens}>
          {t('tabs.tokens')}
          {tokenCount > 0 && (
            <span className={`badge ${tokenEvent ? 'badge--teal' : 'badge--gold'}`}>
              {tokenCount}
              {tokenEvent && <span className="player-bar__badge-note"> {t('playerBar.newValues')}</span>}
            </span>
          )}
        </button>
        <button type="button" className="player-bar__trigger" onClick={onOpenAnnotations} disabled={annotationsDisabled}>
          {t('playerBar.annotations')}
        </button>
        <button type="button" className="player-bar__trigger" onClick={onOpenParticipants}>
          {t('tabs.participants')}
        </button>
        <span
          className="player-bar__connection"
          role="img"
          data-connected={connected ? 'true' : 'false'}
          aria-label={connected ? t('playerBar.connected') : t('playerBar.disconnected')}
        />
      </div>
    </div>
  )
}
