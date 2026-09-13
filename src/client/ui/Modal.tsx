import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import { IconButton } from './Icon.js'
import { useT } from '../i18n/locale.js'

// ui-dialog (#89, design.md D1): der Modal-Baustein - Backdrop, Box mit Rolle `dialog`
// (Standard) oder `alertdialog`, Fokus-Trap per Tab-Zyklus, Schliessen per Esc/Backdrop/
// Schaltflaeche, Fokusrueckgabe an den Auslöser (`isConnected`-Guard). Kein Portal, kein
// natives `<dialog>` (proposal.md "Kein Portal, kein <dialog>-Element"). Diese Datei
// importiert `react`, `./Icon.js` und `../i18n/locale.js` (design.md D10).

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(box: HTMLElement): HTMLElement[] {
  return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export interface ModalProps {
  title: string
  onClose: () => void
  role?: 'dialog' | 'alertdialog'
  description?: string
  wide?: boolean
  children: ReactNode
}

export function Modal({ title, onClose, role = 'dialog', description, wide, children }: ModalProps) {
  const t = useT()
  const titleId = useId()
  const descriptionId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const openerRef = useRef<HTMLElement | null>(null)

  // Auslöser merken - beim ersten Render, nicht im Effekt (design.md D1/D2): React ruft
  // `focus()` fuer Kinder mit `autoFocus` in der Commit-Phase auf, also *vor* jedem Effekt
  // des Modals - ein im Effekt gelesenes `activeElement` waere dort bereits das
  // Eingabefeld/`Abbrechen` in der Box, nicht der Auslöser. Nur der Render-Zeitpunkt liegt
  // sicher davor; befuellt wird nur einmal (solange noch `null`).
  if (openerRef.current === null && document.activeElement instanceof HTMLElement) {
    openerRef.current = document.activeElement
  }

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Escape (Requirement "Schließen"): auf `document`, damit Esc immer wirkt, auch wenn der
  // Fokus die Box verlassen hat (proposal.md "Risks"). Registriert einmalig; liest `onClose`
  // ueber den Ref, damit der Effekt nicht bei jedem Render neu angemeldet wird.
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [])

  // Fokus beim Oeffnen und Fokusrueckgabe (D2, Requirement "Fokus beim Öffnen"/
  // "Fokusrückgabe"): einmalig beim Mount/Unmount, kein Abhaengigkeitseintrag. Der Auslöser
  // wurde bereits beim Rendern gemerkt (oben) - hier nur noch gelesen.
  useEffect(() => {
    const box = boxRef.current
    if (box) {
      const activeElement = document.activeElement
      const focusInsideBox = activeElement instanceof Node && box.contains(activeElement)
      if (!focusInsideBox) {
        focusableElements(box)[0]?.focus()
      }
    }
    return () => {
      const opener = openerRef.current
      if (opener && opener.isConnected) {
        opener.focus()
      }
    }
  }, [])

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return
    }
    const box = boxRef.current
    if (!box) {
      return
    }
    const focusable = focusableElements(box)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeElement = document.activeElement
    const isOutsideBox = !(activeElement instanceof Node && box.contains(activeElement))
    if (!event.shiftKey && (activeElement === last || isOutsideBox)) {
      event.preventDefault()
      first.focus()
    } else if (event.shiftKey && (activeElement === first || isOutsideBox)) {
      event.preventDefault()
      last.focus()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={boxRef}
        className={wide ? 'modal modal--wide' : 'modal'}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
      >
        <IconButton name="close" label={t('dialog.close')} className="modal-close" onClick={onClose} />
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="modal-description">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
