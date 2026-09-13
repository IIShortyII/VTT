import { useId, type ReactNode } from 'react'

import { Icon } from './Icon.js'
import type { IconName } from './icons.js'

// Zustandsanzeigen des Clients (ui-status, #91, design.md D1, spec.md "Begriffe"): ein
// Zustandsbanner fuer Dauerzustaende der Verbindung, ein Overlay ueber der Kartenansicht fuer
// Sitzungszustaende, in denen ein Spieler nicht handeln soll, und ein Leerzustand fuer Listen
// ohne Eintraege. Jede Anzeige zeigt ausschliesslich, was der Aufrufer aus Socket- oder
// Server-Ereignissen ableitet (constitution.md §9.1) - keine Komponente hier leitet selbst
// etwas aus Zeit oder letztem bekannten Stand ab. Diese Datei importiert `react`, `./Icon.js`
// und den Typ aus `./icons.js`, sonst nichts (design.md D1, D10).

export interface StatusBannerProps {
  children: ReactNode
}

/** Zustandsbanner (spec.md Requirement "Zustandsbanner"): `role="status"` traegt die
 * Live-Region implizit - kein zusaetzliches `aria-live`, kein `role="alert"`. Erscheinen und
 * Verschwinden entscheidet der Aufrufer. */
export function StatusBanner({ children }: StatusBannerProps) {
  return (
    <div className="status-banner" role="status">
      <Icon name="warning" />
      <span>{children}</span>
    </div>
  )
}

export interface MapOverlayProps {
  title: string
  subline: string
  icon: IconName
}

/** Karten-Overlay (spec.md Requirement "Karten-Overlay"): eine benannte `region`
 * (`aria-labelledby` auf den Titel), ohne `pointer-events: none` als Inline-Stil - es ist ein
 * gewoehnliches Element, das als letztes Kind der Buehne (`.map-stage`) ueber der Kartenansicht
 * liegt und damit Zeigerereignisse abfaengt (design.md D1). */
export function MapOverlay({ title, subline, icon }: MapOverlayProps) {
  const titleId = useId()
  return (
    <div className="map-overlay" role="region" aria-labelledby={titleId}>
      <Icon name={icon} />
      <p className="map-overlay-title" id={titleId}>
        {title}
      </p>
      <p className="map-overlay-subline">{subline}</p>
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  hint: string
}

/** Leerzustand (spec.md Requirement "Leerzustand"): dasselbe Markup wie der bisherige
 * Leerzustand der Startansicht (`ui-start`, „Leerzustand") - ein Absatz mit Titel und Hinweis
 * in dieser Reihenfolge. */
export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <p className="empty-state">
      <strong>{title}</strong>
      <span>{hint}</span>
    </p>
  )
}
