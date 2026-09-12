import { useSyncExternalStore } from 'react'

import { de, type TextKey } from './de.js'
import { en } from './en.js'

// ui-text (#87, design.md D1): ein Modul haelt die aktive Sprache, kein Provider und kein
// Kontext (design.md Goals, "Ein Modul, drei Funktionen"). `t` ist ueberall aufrufbar, auch
// ausserhalb von React; Komponenten abonnieren die Sprache ueber `useLocale`/`useT`
// (`useSyncExternalStore`), damit sie beim Umschalten neu rendern. Die Sprache erreicht den
// Server nie - sie ist eine reine Darstellungsentscheidung des Clients (constitution.md §9,
// specs/ui-text/spec.md).

export const LOCALES = ['de', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'de'
export const LOCALE_STORAGE_KEY = 'vtt.locale'

const dictionaries: Record<Locale, Record<TextKey, string>> = { de, en }

function isLocale(value: string | null): value is Locale {
  return value === 'de' || value === 'en'
}

/** Liest die gespeicherte Wahl beim Laden des Moduls (design.md D1). Ein geworfener Zugriff
 * (kein `window`, gesperrter Speicher) oder ein ungueltiger Wert liefert `DEFAULT_LOCALE`. */
function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

/** Setzt `lang` des `<html>`-Elements auf die aktive Sprache (design.md D1, Requirement
 * "Sprachwahl"). Ohne `document` (kein Browser) passiert nichts. */
function applyLang(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

let current: Locale = readStoredLocale()
applyLang(current)

const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

/** Setzt die aktive Sprache, speichert die Wahl (Fehler beim Speichern werden ignoriert - die
 * Wahl gilt trotzdem fuer die laufende Seite, design.md D1/Requirement "Sprachwahl") und
 * benachrichtigt alle Abonnenten. Dieselbe Sprache wie bisher schreibt nicht erneut und
 * benachrichtigt niemanden. */
export function setLocale(locale: Locale): void {
  if (locale === current) {
    return
  }
  current = locale
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Gesperrter/privater Speicher - die Wahl gilt trotzdem fuer diese Seite.
  }
  applyLang(locale)
  for (const listener of listeners) {
    listener()
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Schlaegt `key` in der aktiven Sprache nach und ersetzt jeden Platzhalter `{name}`, fuer den
 * `params` einen Wert traegt; ein Platzhalter ohne uebergebenen Wert bleibt unveraendert
 * stehen (design.md D1, Requirement "Woerterbuecher und Textschluessel"). */
export function t(key: TextKey, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key]
  if (!params) {
    return text
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

/** Abonniert die aktive Sprache (Neu-Render beim Umschalten) und liefert `t`. Aufrufmuster:
 * `const t = useT()` (design.md D1). */
export function useT(): typeof t {
  useLocale()
  return t
}
