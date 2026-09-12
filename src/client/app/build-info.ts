// Build-Angaben der App-Shell (ui-shell #84, design.md D2). `main.tsx` liest die
// Vite-Defines `__APP_VERSION__`/`__BUILD_SHA__` und uebergibt das Ergebnis an `App`; ueberall
// sonst ist `BuildInfo` ein gewoehnlicher Wert mit Rueckfall - kein Jest-Wissen ueber Vite
// noetig (design.md Goals "Build-Angaben ohne Jest-Magie").

export interface BuildInfo {
  version: string
  sha: string
}

export const FALLBACK_BUILD: BuildInfo = { version: '0.0.0-dev', sha: 'dev' }
