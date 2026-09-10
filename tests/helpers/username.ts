// Gemeinsamer Helfer der Integrations- und Komponententests (tasks.md 1.1): leitet aus einer
// E-Mail einen gueltigen, innerhalb einer Suite eindeutigen Nutzernamen ab.
//
// Hintergrund: Ab #45 verlangt die Registrierung ein Pflichtfeld `username` (design.md D1):
// getrimmt 3-24 Codepoints, ausschliesslich `^[\p{L}\p{N}_.\-]+$`, instanzweit einmalig
// unabhaengig von der Schreibweise. Die bestehenden Tests registrieren viele Nutzer, deren
// konkreter Nutzername egal ist - wichtig ist nur, dass jeder Aufruf einen *gueltigen* und
// gegenueber den anderen Registrierungen desselben Tests *eindeutigen* Namen liefert. Ein
// aus der E-Mail abgeleiteter Name erfuellt beides, ohne dass jeder Aufrufer selbst einen
// erfinden muss. Wo ein Test einen bestimmten Nutzernamen braucht (z. B. `sam`, `dm`), setzt
// er ihn direkt - dieser Helfer ist nur die Vorgabe fuer die generischen Faelle.
//
// Diese Datei importiert nichts aus `src/` - sie darf vor der Implementierung existieren.

const USERNAME_ALLOWED = /[\p{L}\p{N}_.\-]/u

/** Kleiner stabiler Hash (FNV-1a, 32 Bit) als base36 - macht den Namen eindeutig und deckt
 * die Mindestlaenge selbst dann ab, wenn der lokale Teil der E-Mail sehr kurz ist. */
function stableSuffix(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Leitet aus einer E-Mail einen gueltigen, eindeutigen Nutzernamen ab. Der lokale Teil wird
 * auf die erlaubten Zeichen reduziert (auf 12 Codepoints begrenzt) und um einen aus der
 * gesamten E-Mail berechneten Suffix ergaenzt - so bleibt der Name unter 24 Codepoints,
 * ueber der Mindestlaenge und fuer verschiedene E-Mails verschieden.
 */
export function usernameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  const sanitized = [...local].filter((ch) => USERNAME_ALLOWED.test(ch)).slice(0, 12).join('')
  const base = sanitized.length > 0 ? sanitized : 'user'
  return `${base}_${stableSuffix(email)}`
}
