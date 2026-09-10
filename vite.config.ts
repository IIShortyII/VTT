import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-Proxy fuer /api auf den Fastify-Port, damit Client und Server im Browser dieselbe
// Origin haben - sonst greift `sameSite` und das Cookie wird nicht gesetzt (design.md D7).
const SERVER_PORT = Number(process.env.PORT ?? 3001)

export default defineConfig({
  plugins: [react()],
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
