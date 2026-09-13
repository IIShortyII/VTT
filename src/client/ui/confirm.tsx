import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Modal } from './Modal.js'
import { useT } from '../i18n/locale.js'

// ui-dialog (#89, design.md D3): Bestätigungsdialog mit Promise-API `confirm()`, statt eines
// zweiten Klicks oder `window.confirm` (spec.md Purpose). Ausserhalb des Providers loest
// `confirm()` sofort mit `false` auf (Requirement "Ohne Provider") - der Standardwert des
// Kontexts traegt das. Diese Datei importiert `react`, `./Modal.js` und `../i18n/locale.js`
// (design.md D10).

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: () => Promise.resolve(false) })

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  // Haelt den aktuellen Stand fuer das Unmount-Cleanup (design.md D3) - wird bei jedem Render
  // aktualisiert, gelesen nur im Cleanup des Effekts unten.
  const pendingRef = useRef<PendingConfirm | null>(null)
  useEffect(() => {
    pendingRef.current = pending
  })

  useEffect(() => {
    return () => {
      pendingRef.current?.resolve(false)
    }
  }, [])

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending((current) => {
        // Zweiter Aufruf bei offenem Dialog (Requirement "Bestätigungsdialog", "Zweite
        // Anfrage ersetzt die offene"): die erste Anfrage loest mit `false` auf.
        current?.resolve(false)
        return { options, resolve }
      })
    })
  }, [])

  const settle = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <Modal role="alertdialog" title={pending.options.title} description={pending.options.message} onClose={() => settle(false)}>
          <div className="modal-actions">
            <button type="button" autoFocus onClick={() => settle(false)}>
              {t('dialog.cancel')}
            </button>
            <button
              type="button"
              className={pending.options.danger ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {pending.options.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean> } {
  return useContext(ConfirmContext)
}
