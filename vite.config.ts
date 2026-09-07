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
    },
  },
})
