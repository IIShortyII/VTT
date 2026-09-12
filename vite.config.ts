import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-Proxy fuer /api auf den Fastify-Port, damit Client und Server im Browser dieselbe
// Origin haben - sonst greift `sameSite` und das Cookie wird nicht gesetzt (design.md D7).
const SERVER_PORT = Number(process.env.PORT ?? 3001)

// add-app-shell (#84, design.md D2): Version und Build-SHA als Vite-Defines fuer den Footer der
// Shell. Die Version kommt aus package.json, der SHA aus dem Git-Checkout; ohne Git (z.B. im
// Container-Build ohne .git) bleibt der Rueckfall `dev` - der Footer ist Beiwerk, kein Grund,
// den Build scheitern zu lassen. `main.tsx` liest beide Defines und reicht sie an `App`.
const APP_VERSION = String(JSON.parse(readFileSync('package.json', 'utf8')).version ?? '0.0.0-dev')

function buildSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch (error) {
    console.warn('[vite] Build-SHA nicht ermittelbar, verwende "dev":', error instanceof Error ? error.message : error)
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
      // Socket.IO braucht eine eigene WebSocket-Weiterleitung (game-session #6, design.md
      // D9) - ohne `ws: true` faellt der Client stumm auf Long-Polling zurueck, was
      // funktioniert und deshalb unbemerkt bliebe.
      '/socket.io': {
        target: `http://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
})
