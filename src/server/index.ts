import { createApp } from './core/app.js'
import { loadConfig } from './core/config.js'

const config = loadConfig()
const app = createApp()

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info(`Beende Server (${signal}) …`)
  try {
    await app.close()
    process.exit(0)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

app.listen({ port: config.port, host: '0.0.0.0' }, (error, address) => {
  if (error) {
    app.log.error(error)
    process.exit(1)
  }
  app.log.info(`Server läuft auf ${address}`)
})
