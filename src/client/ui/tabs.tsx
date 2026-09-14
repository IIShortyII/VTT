import { useRef, type KeyboardEvent, type ReactNode } from 'react'

// Reiterbaustein (session-tabs #94, design.md D1): eine Reiterliste mit roving tabindex
// (WAI-ARIA Tabs Pattern) und ein zugehoeriges Panel. Reine Praesentationsschicht ohne
// eigenen State - `active`/`onSelect` liegen beim Aufrufer (Komponentenzustand der
// Raumansicht; kein Server-Ereignis und keine Pfeiltaste aendert die Auswahl, nur Klick oder
// Enter/Leertaste auf dem fokussierten Reiter - manuelle Aktivierung). Importiert nur
// `react` (design.md D10), wiederverwendbar fuer #95-#100.

export interface TabItem<Id extends string> {
  id: Id
  label: string
}

export interface TabListProps<Id extends string> {
  /** aria-label der Reiterliste. */
  label: string
  tabs: readonly TabItem<Id>[]
  active: Id
  onSelect: (id: Id) => void
  /** Reiter erhaelt die id `${idPrefix}-tab-${id}`, sein Panel `${idPrefix}-panel-${id}`. */
  idPrefix: string
}

export function TabList<Id extends string>({ label, tabs, active, onSelect, idPrefix }: TabListProps<Id>) {
  const tabRefs = useRef<Map<Id, HTMLButtonElement>>(new Map())

  const focusTab = (id: Id): void => {
    tabRefs.current.get(id)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(tabs[(index + 1) % tabs.length].id)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(tabs[(index - 1 + tabs.length) % tabs.length].id)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusTab(tabs[0].id)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusTab(tabs[tabs.length - 1].id)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(tabs[index].id)
    }
  }

  return (
    <div role="tablist" className="tab-list" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          ref={(element) => {
            if (element) {
              tabRefs.current.set(tab.id, element)
            } else {
              tabRefs.current.delete(tab.id)
            }
          }}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export interface TabPanelProps<Id extends string> {
  id: Id
  active: Id
  idPrefix: string
  /** wird an `tab-panel` angehaengt. */
  className?: string
  children: ReactNode
}

export function TabPanel<Id extends string>({ id, active, idPrefix, className, children }: TabPanelProps<Id>) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      className={className ? `tab-panel ${className}` : 'tab-panel'}
      hidden={id !== active}
    >
      {children}
    </div>
  )
}
