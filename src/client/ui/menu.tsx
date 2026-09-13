import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'

import { Icon } from './Icon.js'
import type { IconName } from './icons.js'

// ui-menu (#92, design.md D1-D4): Kontextmenues, Trigger und Popover teilen einen
// Schwebezustand (`useFloating`) - Anker, Klemmen, Klick aussserhalb, Fokusrueckgabe. Kein
// Portal, keine Bibliothek. Diese Datei importiert nur `react`, `./Icon.js` und den Typ
// `IconName` aus `./icons.js` (design.md D13).

export interface Anchor {
  x: number
  y: number
}

export interface FloatingState {
  open: boolean
  anchor: Anchor | null
  triggerRef: RefObject<HTMLButtonElement | null>
  openAt(anchor: Anchor): void
  toggle(): void
  close(): void
  returnFocus(): void
  onContextMenu(event: ReactMouseEvent<HTMLElement>): void
}

const FORM_TARGET_SELECTOR = 'input, select, textarea, button, a'

/**
 * Schwebezustand fuer Menue und Popover (design.md D1): `open`/`anchor` als State,
 * `triggerRef` fuer die Trigger-Schaltflaeche, ein Ref fuer das beim Oeffnen gemerkte
 * Rueckgabeziel. Alle fuenf Funktionen sind mit `useCallback` ohne veraenderliche
 * Abhaengigkeiten gebildet (sie benutzen nur State-Setter und Refs) - ihre Identitaet
 * bleibt ueber die Lebensdauer der Komponente gleich (Goal "Stabile Rueckrufe"), damit ein
 * beim Erzeugen der Canvas-Fassade uebergebener Rueckruf gueltig bleibt.
 */
export function useFloating(): FloatingState {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const returnTargetRef = useRef<HTMLElement | null>(null)
  const openRef = useRef(false)

  const openAt = useCallback((next: Anchor) => {
    if (document.activeElement instanceof HTMLElement) {
      returnTargetRef.current = document.activeElement
    }
    openRef.current = true
    setAnchor(next)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    openRef.current = false
    setOpen(false)
    setAnchor(null)
  }, [])

  const toggle = useCallback(() => {
    if (openRef.current) {
      close()
      return
    }
    const trigger = triggerRef.current
    if (!trigger) {
      openAt({ x: 0, y: 0 })
      return
    }
    const rect = trigger.getBoundingClientRect()
    openAt({ x: rect.left, y: rect.bottom })
  }, [close, openAt])

  const returnFocus = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger && trigger.isConnected) {
      trigger.focus()
      return
    }
    const target = returnTargetRef.current
    if (target && target.isConnected) {
      target.focus()
    }
  }, [])

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target
      const isFormTarget = target instanceof Element && target.closest(FORM_TARGET_SELECTOR) !== null
      if (isFormTarget) {
        return
      }
      event.preventDefault()
      openAt({ x: event.clientX, y: event.clientY })
    },
    [openAt],
  )

  return { open, anchor, triggerRef, openAt, toggle, close, returnFocus, onContextMenu }
}

export interface MenuEntry {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type MenuTriggerVariant = 'more' | 'text' | 'icon'

export interface MenuTriggerProps {
  floating: FloatingState
  label: string
  variant?: MenuTriggerVariant
  icon?: IconName
  haspopup?: 'dialog' | 'menu'
  className?: string
}

/** Trigger in drei Formen (design.md D3): `more` (Standard, Icon-only `more`), `icon`
 * (Icon-only mit `icon`), `text` (Textknoten `label` plus dekoratives `chevronDown`). Rendert
 * selbst ein `<button>` statt `IconButton` - der braucht `floating.triggerRef`, den
 * `IconButton` nicht entgegennimmt. */
export function MenuTrigger({ floating, label, variant = 'more', icon, haspopup = 'menu', className }: MenuTriggerProps) {
  const classes = ['menu-trigger']
  if (variant !== 'text') {
    classes.push('icon-button')
  }
  if (className) {
    classes.push(className)
  }
  const classNameValue = classes.join(' ')

  if (variant === 'text') {
    return (
      <button
        ref={floating.triggerRef}
        type="button"
        aria-haspopup={haspopup}
        aria-expanded={floating.open}
        onClick={floating.toggle}
        className={classNameValue}
      >
        {label}
        <Icon name="chevronDown" />
      </button>
    )
  }

  const resolvedIcon: IconName = variant === 'icon' && icon ? icon : 'more'
  return (
    <button
      ref={floating.triggerRef}
      type="button"
      aria-haspopup={haspopup}
      aria-expanded={floating.open}
      aria-label={label}
      onClick={floating.toggle}
      className={classNameValue}
    >
      <Icon name={resolvedIcon} label={label} />
    </button>
  )
}

/** Klemmt einen Anker gegen ein Element (design.md D2/D4, Begriff "Geklemmt"): das Maximum
 * aus `8` und dem Minimum aus `anchor.<achse>` und `innerBreite/-hoehe - Ausdehnung - 8`. */
function clampToViewport(anchor: Anchor, size: { width: number; height: number }): Anchor {
  return {
    x: Math.max(8, Math.min(anchor.x, window.innerWidth - size.width - 8)),
    y: Math.max(8, Math.min(anchor.y, window.innerHeight - size.height - 8)),
  }
}

/** Klick ausserhalb von zwei Elementen (Menue/Popover-Box und Trigger) schliesst und gibt den
 * Fokus zurueck (design.md D2/D4) - registriert nur, solange `open` gilt. */
function useDismissOnOutsideClick(open: boolean, boxRef: RefObject<HTMLElement | null>, floating: FloatingState, dismiss: () => void): void {
  useEffect(() => {
    if (!open) {
      return
    }
    function handleMouseDown(event: MouseEvent): void {
      const target = event.target
      const box = boxRef.current
      const trigger = floating.triggerRef.current
      if (target instanceof Node && ((box && box.contains(target)) || (trigger && trigger.contains(target)))) {
        return
      }
      dismiss()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
    // eslint hat hier keine "exhaustive-deps"-Regel konfiguriert (eslint.config.mjs) - `open`
    // ist die einzige absichtliche Abhaengigkeit (design.md D2/D4, "Effekt, solange `open`").
  }, [open])
}

export interface ActionMenuProps {
  floating: FloatingState
  label: string
  entries: MenuEntry[]
}

/** Aktionsmenue (design.md D2, spec.md Requirement "Menü-Baustein"): `role="menu"`,
 * geklemmt positioniert, roving `tabindex` statt `aria-activedescendant`. Rendert `null`,
 * solange `floating.open` falsch ist - trotzdem immer gemountet (der Aufrufer bedingt nicht
 * selbst), darum laufen alle Hooks unbedingt und pruefen `floating.open` innerhalb. */
export function ActionMenu({ floating, label, entries }: ActionMenuProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const [pos, setPos] = useState<Anchor>({ x: 0, y: 0 })
  const [active, setActive] = useState(0)

  useLayoutEffect(() => {
    const anchor = floating.anchor
    const list = listRef.current
    if (!anchor || !list) {
      return
    }
    const rect = list.getBoundingClientRect()
    setPos(clampToViewport(anchor, rect))
  }, [floating.anchor])

  useEffect(() => {
    if (!floating.open) {
      return
    }
    const firstEnabled = entries.findIndex((entry) => !entry.disabled)
    const index = firstEnabled === -1 ? 0 : firstEnabled
    setActive(index)
    itemRefs.current[index]?.focus()
    // design.md D2: Abhaengigkeit ausschliesslich `floating.open` - siehe Kommentar in
    // `useDismissOnOutsideClick`.
  }, [floating.open])

  function dismiss(): void {
    floating.close()
    floating.returnFocus()
  }

  useDismissOnOutsideClick(floating.open, listRef, floating, dismiss)

  function select(index: number): void {
    const entry = entries[index]
    if (!entry || entry.disabled) {
      return
    }
    floating.returnFocus()
    floating.close()
    entry.onSelect()
  }

  function enabledIndices(): number[] {
    const indices: number[] = []
    entries.forEach((entry, index) => {
      if (!entry.disabled) {
        indices.push(index)
      }
    })
    return indices
  }

  function stepActive(step: 1 | -1): void {
    const enabled = enabledIndices()
    if (enabled.length === 0) {
      return
    }
    const currentPosition = enabled.indexOf(active)
    const nextPosition = currentPosition === -1 ? 0 : (currentPosition + step + enabled.length) % enabled.length
    const nextIndex = enabled[nextPosition]
    setActive(nextIndex)
    itemRefs.current[nextIndex]?.focus()
  }

  function jumpActive(edge: 'start' | 'end'): void {
    const enabled = enabledIndices()
    if (enabled.length === 0) {
      return
    }
    const nextIndex = edge === 'start' ? enabled[0] : enabled[enabled.length - 1]
    setActive(nextIndex)
    itemRefs.current[nextIndex]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        stepActive(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        stepActive(-1)
        return
      case 'Home':
        event.preventDefault()
        jumpActive('start')
        return
      case 'End':
        event.preventDefault()
        jumpActive('end')
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        select(active)
        return
      case 'Escape':
        dismiss()
        return
      case 'Tab':
        event.preventDefault()
        dismiss()
        return
      default:
        return
    }
  }

  if (!floating.open) {
    return null
  }

  return (
    <ul
      role="menu"
      className="menu"
      aria-label={label}
      ref={listRef}
      style={{ position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px` }}
      onKeyDown={handleKeyDown}
    >
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          role="menuitem"
          className={entry.danger ? 'menu-item menu-item--danger' : 'menu-item'}
          aria-disabled={entry.disabled ? 'true' : undefined}
          tabIndex={index === active ? 0 : -1}
          ref={(node) => {
            itemRefs.current[index] = node
          }}
          onClick={() => select(index)}
          onFocus={() => setActive(index)}
        >
          {entry.icon && <Icon name={entry.icon} />}
          <span>{entry.label}</span>
        </li>
      ))}
    </ul>
  )
}

export interface ActionMenuButtonProps {
  label: string
  entries: MenuEntry[]
  variant?: MenuTriggerVariant
  icon?: IconName
  className?: string
}

/** Trigger und Menue mit eigenem Schwebezustand in einem Baustein (design.md D3): `label`
 * ist zugleich Name des Triggers und `aria-label` des Menues. */
export function ActionMenuButton({ label, entries, variant, icon, className }: ActionMenuButtonProps) {
  const floating = useFloating()
  return (
    <>
      <MenuTrigger floating={floating} label={label} variant={variant} icon={icon} className={className} />
      <ActionMenu floating={floating} label={label} entries={entries} />
    </>
  )
}

export interface PopoverProps {
  floating: FloatingState
  label: string
  children: ReactNode
}

/** Nicht modaler Popover (design.md D4, spec.md Requirement "Popover"): `role="dialog"`,
 * geklemmt positioniert, Fokus beim Oeffnen auf die Box, kein Tab-Zyklus, kein Backdrop, Esc
 * wirkt nur innerhalb der Box (kein `document`-Listener). Rendert `null`, solange
 * `floating.open` falsch ist - wie `ActionMenu` immer gemountet. */
export function Popover({ floating, label, children }: PopoverProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Anchor>({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const anchor = floating.anchor
    const box = boxRef.current
    if (!anchor || !box) {
      return
    }
    const rect = box.getBoundingClientRect()
    setPos(clampToViewport(anchor, rect))
  }, [floating.anchor])

  useEffect(() => {
    if (!floating.open) {
      return
    }
    boxRef.current?.focus()
  }, [floating.open])

  function dismiss(): void {
    floating.close()
    floating.returnFocus()
  }

  useDismissOnOutsideClick(floating.open, boxRef, floating, dismiss)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
    }
  }

  if (!floating.open) {
    return null
  }

  return (
    <div
      role="dialog"
      className="popover"
      aria-label={label}
      tabIndex={-1}
      ref={boxRef}
      style={{ position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px` }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  )
}
