import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root-Element #root fehlt in index.html.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
