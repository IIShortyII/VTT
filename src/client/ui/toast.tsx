import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// Toast-Kanal fuer Gelungenes (ui-feedback, #88, design.md D1). Ein Provider haelt Liste und
// Timer am Lebenszyklus des Baums - das Raeumen beim Unmount ist ein normaler Effekt-Cleanup
// (design.md "Provider mit Kontext, kein Modul-Store"). Ausserhalb des Providers ist `push`
// ein No-Op (Requirement "Auslösen ohne Provider") - der Standardwert des Kontexts traegt ihn.
// Diese Datei importiert nur `react` (design.md D7).

export const TOAST_TTL_MS = 2800
export const TOAST_MAX = 3

interface Toast {
  id: number
  text: string
}

interface ToastContextValue {
  push: (text: string) => void
}

const ToastContext = createContext<ToastContextValue>({ push: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Die massgebliche Liste, die `push` synchron liest und schreibt - Dedupe muss den
  // *aktuellen* Stand sehen, ohne einen Timer in einem `setState`-Updater zu starten (Updater
  // laufen unter StrictMode doppelt, design.md D1).
  const listRef = useRef<Toast[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const nextIdRef = useRef(0)

  const push = useCallback((text: string) => {
    if (text === '') {
      return
    }

    const existing = listRef.current.find((toast) => toast.text === text)
    if (existing) {
      // Dedupe (Requirement "Dedupe gleicher Texte"): Timer neu starten, Position und Liste
      // unveraendert lassen - kein `setToasts`.
      const previousTimer = timersRef.current.get(existing.id)
      if (previousTimer !== undefined) {
        clearTimeout(previousTimer)
      }
      const timer = setTimeout(() => {
        listRef.current = listRef.current.filter((toast) => toast.id !== existing.id)
        timersRef.current.delete(existing.id)
        setToasts([...listRef.current])
      }, TOAST_TTL_MS)
      timersRef.current.set(existing.id, timer)
      return
    }

    const id = nextIdRef.current
    nextIdRef.current += 1
    const toast: Toast = { id, text }
    listRef.current = [...listRef.current, toast]

    // Stapelgrenze (Requirement "Stapelgrenze"): der aelteste verdraengte Toast verschwindet
    // sofort, sein Timer wird abgebrochen.
    if (listRef.current.length > TOAST_MAX) {
      const [oldest, ...rest] = listRef.current
      listRef.current = rest
      const oldestTimer = timersRef.current.get(oldest.id)
      if (oldestTimer !== undefined) {
        clearTimeout(oldestTimer)
      }
      timersRef.current.delete(oldest.id)
    }

    const timer = setTimeout(() => {
      listRef.current = listRef.current.filter((entry) => entry.id !== id)
      timersRef.current.delete(id)
      setToasts([...listRef.current])
    }, TOAST_TTL_MS)
    timersRef.current.set(id, timer)

    setToasts([...listRef.current])
  }, [])

  useEffect(() => {
    // Raeumen beim Unmount (Requirement "Räumen beim Unmount"): alle laufenden Timer
    // abbrechen, kein `setToasts` im Cleanup.
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
      timersRef.current.clear()
      listRef.current = []
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToasts(): ToastContextValue {
  return useContext(ToastContext)
}
