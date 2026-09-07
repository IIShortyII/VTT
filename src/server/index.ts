import { createApp } from './core/app.js'
import { loadConfig } from './core/config.js'

const config = loadConfig()
const app = createApp()

app.listen({ port: config.port, host: '0.0.0.0' }, (error, address) => {
  if (error) {
    app.log.error(error)
    process.exit(1)
  }
  app.log.info(`Server läuft auf ${address}`)
})
