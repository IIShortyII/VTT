import './app/theme.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'
import { FALLBACK_BUILD, type BuildInfo } from './app/build-info.js'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root-Element #root fehlt in index.html.')
}

// Einzige Stelle, die die Vite-Defines anfasst (ui-shell #84, design.md D2) - ohne Vite-Lauf
// (z. B. unter Jest) existieren `__APP_VERSION__`/`__BUILD_SHA__` nicht; der `typeof`-Waechter
// faellt dann auf `FALLBACK_BUILD` zurueck.
const build: BuildInfo = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : FALLBACK_BUILD.version,
  sha: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : FALLBACK_BUILD.sha,
}

createRoot(container).render(
  <StrictMode>
    <App build={build} />
  </StrictMode>,
)
