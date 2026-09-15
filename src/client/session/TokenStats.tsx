import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { displayName, type Participant } from '../../shared/session.js'
import type { Token } from '../../shared/token.js'
import { useT } from '../i18n/locale.js'
import { Icon } from '../ui/Icon.js'
import { ActionMenu, MenuTrigger, useFloating, type MenuEntry } from '../ui/menu.js'
import { EmptyState } from '../ui/status.js'
import { conditionIcon } from './conditions.js'

// add-token-stats (#61, design.md D8, spec.md Requirement "Tokenansicht im Raum"): die
// sichtbaren Werte je Token - jede Rolle sieht dasselbe Format, nur die Menge der Werte
// unterscheidet sich (Server-Filterung, `redactToken`).
//
// add-token-cards (#95, design.md D3-D5/D9): `TokenCard` ersetzt die bisherige Zeile
// (`TokenStatsText`) - Kopf (Symbol, Name, Zuweisungs-Pill, ⋮-Menü), HP-Balken (`--pct`,
// Low-Klasse ab höchstens 25 %), Werte als Beschreibungsliste (`dl`), Markierungen als Chips.
// Dieselbe Karte fuer Spielleiter-Verwaltung (`TokenPanel`) und Spieler-Liste (hier,
// `PlayerTokenList`) - `children` traegt die Spielleiter-only Schaden/Heilung-Eingabe
// (design.md D9).
//
// add-token-value-pulse (#99, design.md D1-D4): `TokenCard` bleibt praesentational und
// erhaelt nur den optionalen Puls-Eingang; die Erkennung "welcher Wert ist gestiegen"
// (Vergleich mit dem zuletzt empfangenen Bestand) lebt ausschliesslich in
// `PlayerTokenList` - der Spielleiter-Pfad (`TokenPanel`) setzt `pulse` nie.

const UNASSIGNED_LABEL = 'Unzugewiesen'

/** Anzeigename des Besitzers, oder `Unzugewiesen` bei `ownerId` `null` bzw. einem nicht (mehr)
 * gefundenen Teilnehmer (design.md D5). */
export function tokenOwnerLabel(token: Token, participants: Participant[]): string {
  if (token.ownerId === null) {
    return UNASSIGNED_LABEL
  }
  const owner = participants.find((participant) => participant.userId === token.ownerId)
  return owner ? displayName(owner) : UNASSIGNED_LABEL
}

// add-token-value-pulse (#99, design.md D2): die vier sichtbaren Zahlenwerte, die bei einem
// Anstieg pulsieren koennen. `HP` zaehlt ueber den Skalar `hp` (Heilung hebt `hp`), nicht das
// Verhaeltnis zu `hpMax`.
type TokenStatKey = 'hp' | 'tempHp' | 'ac' | 'initiative'

export interface TokenCardProps {
  token: Token
  ownerName: string
  menuEntries: MenuEntry[]
  // add-token-cards (#95, design.md D2): Schaden/Heilung bleibt inline auf der Karte, nur
  // fuer den Spielleiter - der Aufrufer (`TokenPanel`) reicht die Eingabe als Kind durch,
  // die Spieler-Karte (`PlayerTokenList`) laesst sie weg.
  children?: ReactNode
  // add-token-value-pulse (#99, design.md D2/D3): nur `PlayerTokenList` setzt diese Eingaben;
  // die Verwaltungskarten des Spielleisters (`TokenPanel`) lassen sie weg und pulsieren nie.
  pulse?: Partial<Record<TokenStatKey, boolean>>
  onValuePulseEnd?: (key: TokenStatKey) => void
}

/** Praesentationale Tokenkarte (design.md D3-D5/D9, spec.md Requirement "Tokenansicht im
 * Raum"): `article.token-card`, Rolle `listitem`. */
export function TokenCard({ token, ownerName, menuEntries, children, pulse, onValuePulseEnd }: TokenCardProps) {
  const t = useT()
  const floating = useFloating()
  const rowLabel = t('menu.rowActions', { name: token.name })

  const hasHpBar = token.hp !== null && token.hpMax !== null
  const pct = hasHpBar ? Math.max(0, Math.min(100, Math.round((token.hp! / token.hpMax!) * 100))) : 0
  const hpBarClass = pct <= 25 ? 'token-card__hp-bar token-card__hp-bar--low' : 'token-card__hp-bar'

  const hasStats = hasHpBar || token.tempHp !== null || token.ac !== null || token.initiative !== null

  // add-token-value-pulse (#99, design.md D2/D3): Basisklasse `token-card__value` fuer jede
  // Rolle, `token-card__value--pulse` zusaetzlich nur wenn `pulse?.<key>` `true` ist; das
  // Animationsende reicht den Rueckruf durch, den nur `PlayerTokenList` belegt.
  const valueClassName = (key: TokenStatKey) =>
    pulse?.[key] ? 'token-card__value token-card__value--pulse' : 'token-card__value'
  const onValueAnimationEnd = (key: TokenStatKey) => (onValuePulseEnd ? () => onValuePulseEnd(key) : undefined)

  return (
    <article className="token-card" role="listitem" onContextMenu={floating.onContextMenu}>
      <div className="token-card__head">
        {token.icon !== null ? <Icon name={token.icon} /> : <span aria-hidden="true">{token.name.charAt(0).toUpperCase()}</span>}
        <span className="token-card__name">{token.name}</span>
        <span className="chip">{ownerName}</span>
        <MenuTrigger floating={floating} label={rowLabel} />
      </div>

      {hasHpBar && <div className={hpBarClass} style={{ '--pct': pct } as CSSProperties} />}

      {hasStats && (
        <dl>
          {hasHpBar && (
            <>
              <dt>HP</dt>
              <dd className={valueClassName('hp')} onAnimationEnd={onValueAnimationEnd('hp')}>{`${token.hp}/${token.hpMax}`}</dd>
            </>
          )}
          {token.tempHp !== null && (
            <>
              <dt>Temp-HP</dt>
              <dd className={valueClassName('tempHp')} onAnimationEnd={onValueAnimationEnd('tempHp')}>
                {token.tempHp}
              </dd>
            </>
          )}
          {token.ac !== null && (
            <>
              <dt>RK</dt>
              <dd className={valueClassName('ac')} onAnimationEnd={onValueAnimationEnd('ac')}>
                {token.ac}
              </dd>
            </>
          )}
          {token.initiative !== null && (
            <>
              <dt>Initiative</dt>
              <dd className={valueClassName('initiative')} onAnimationEnd={onValueAnimationEnd('initiative')}>
                {token.initiative}
              </dd>
            </>
          )}
        </dl>
      )}

      {token.conditions.length > 0 && (
        <div className="token-card__conditions">
          {token.conditions.map((label) => {
            const icon = conditionIcon(label)
            return (
              <span key={label} className="chip">
                {icon !== null && <Icon name={icon} />}
                <span>{label}</span>
              </span>
            )
          })}
        </div>
      )}

      {children}

      <ActionMenu floating={floating} label={rowLabel} entries={menuEntries} />
    </article>
  )
}

export interface PlayerTokenListProps {
  tokens: Token[]
  participants: Participant[]
  // ui-menu (#92, design.md D5): je Zeile ein eigenes ⋮-Menue statt eingebetteter
  // Freigabe-Kaestchen - dieselben Eintraege wie in der Token-Verwaltung, gebaut vom
  // Aufrufer (`SessionRoom`, `token-menu.ts`).
  menuEntries: (token: Token) => MenuEntry[]
}

interface TokenValueSnapshot {
  hp: number | null
  tempHp: number | null
  ac: number | null
  initiative: number | null
}

function snapshotValues(token: Token): TokenValueSnapshot {
  return { hp: token.hp, tempHp: token.tempHp, ac: token.ac, initiative: token.initiative }
}

const STAT_KEYS: readonly TokenStatKey[] = ['hp', 'tempHp', 'ac', 'initiative']

/** Tokenliste fuer Spieler (design.md D8/D9, spec.md Requirement "Tokenansicht im Raum"): die
 * Ueberschrift ist bewusst NICHT "Tokens" - das Szenario "Spieler sieht keine
 * Token-Verwaltung" verbietet diese Ueberschrift beim Spieler. session-tabs (#94, design.md
 * D2/D4): das Wurzelelement traegt die Klasse `panel` (nicht `panel--wide` - anders als die
 * Token-Verwaltung des Spielleiters).
 *
 * add-token-value-pulse (#99, design.md D1/D4): merkt sich je Token in einem Ref den zuletzt
 * empfangenen Bestand der vier Zahlenwerte (`useRef<Map<tokenId, TokenValueSnapshot>>`) und
 * leitet bei jedem neuen `tokens`-Bestand (Effekt statt Render, damit der Ref nur ausserhalb
 * des Render-Durchlaufs mutiert) die Menge der gestiegenen Werte ab - Puls nur bei bekanntem,
 * niedrigerem Vorwert; ein erstmals erscheinender Wert pulsiert nicht, weil der Ref beim
 * ersten Durchlauf noch leer ist. Die aktuell pulsierenden Stats haelt React-State (design.md
 * D3), damit `onAnimationEnd` die Klasse gezielt je Token/Stat wieder entfernen kann. */
export function PlayerTokenList({ tokens, participants, menuEntries }: PlayerTokenListProps) {
  const t = useT()
  const previousValuesRef = useRef<Map<string, TokenValueSnapshot>>(new Map())
  const [pulsing, setPulsing] = useState<Map<string, Partial<Record<TokenStatKey, boolean>>>>(new Map())

  useEffect(() => {
    const previousValues = previousValuesRef.current
    const nextValues = new Map<string, TokenValueSnapshot>()
    const nextPulsing = new Map<string, Partial<Record<TokenStatKey, boolean>>>()

    for (const token of tokens) {
      const current = snapshotValues(token)
      nextValues.set(token.id, current)

      const prior = previousValues.get(token.id)
      if (prior) {
        const pulse: Partial<Record<TokenStatKey, boolean>> = {}
        let anyRaised = false
        for (const key of STAT_KEYS) {
          const priorValue = prior[key]
          const currentValue = current[key]
          if (priorValue !== null && currentValue !== null && currentValue > priorValue) {
            pulse[key] = true
            anyRaised = true
          }
        }
        if (anyRaised) {
          nextPulsing.set(token.id, pulse)
        }
      }
    }

    previousValuesRef.current = nextValues
    setPulsing(nextPulsing)
  }, [tokens])

  const handleValuePulseEnd = (tokenId: string, key: TokenStatKey) => {
    setPulsing((previous) => {
      const entry = previous.get(tokenId)
      if (!entry?.[key]) {
        return previous
      }
      const nextEntry = { ...entry }
      delete nextEntry[key]
      const next = new Map(previous)
      if (Object.keys(nextEntry).length === 0) {
        next.delete(tokenId)
      } else {
        next.set(tokenId, nextEntry)
      }
      return next
    })
  }

  return (
    <div className="panel">
      <h2>Tokenwerte</h2>
      {tokens.length === 0 ? (
        <EmptyState title={t('empty.tokens.title')} hint={t('empty.tokenValues.hint')} />
      ) : (
        <ul className="token-card-list">
          {tokens.map((token) => (
            <TokenCard
              key={token.id}
              token={token}
              ownerName={tokenOwnerLabel(token, participants)}
              menuEntries={menuEntries(token)}
              pulse={pulsing.get(token.id)}
              onValuePulseEnd={(key) => handleValuePulseEnd(token.id, key)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
