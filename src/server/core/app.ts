import cookie from '@fastify/cookie'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { Server as SocketIOServer } from 'socket.io'

import type { PrismaClient } from '@prisma/client'

import { registerAuthRoutes } from '../auth/routes.js'
import { Presence } from '../session/presence.js'
import { registerSessionRoutes } from '../session/routes.js'
import { registerSessionSocket } from '../session/socket.js'
import { type Clock, systemClock } from './clock.js'
import { loadConfig } from './config.js'
import { prisma as defaultPrisma } from './prisma.js'

// Fastify-Instanz als Funktion, die eine fertig konfigurierte App zurueckgibt. Uhr und
// Prisma-Client sind injizierbar, damit ein Test eine zweite Instanz auf derselben
// DB-Datei bauen kann (design.md D10, Neustart-Szenario).

export interface CreateAppOptions {
  prisma?: PrismaClient
  clock?: Clock
  cookieSecure?: boolean
  /** Fastify-Logger an-/abschalten. Default an - bei abgeschaltetem Logger wuerde der
   * zentrale Fehler-Handler unerwartete 5xx spurlos verschlucken (Review-Runde 2). Tests
   * duerfen bewusst `false` setzen. */
  logger?: boolean
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const config = loadConfig()
  const prisma = options.prisma ?? defaultPrisma
  const usingDefaultPrisma = options.prisma === undefined
  const clock = options.clock ?? systemClock
  const cookieSecure = options.cookieSecure ?? config.cookieSecure

  const app = Fastify({ logger: options.logger ?? true })

  app.register(cookie)

  // Socket.IO haengt sich an die "upgrade"- und "request"-Ereignisse des Node-Servers, den
  // Fastify ohnehin erzeugt - app.inject() fuer die REST-Tests funktioniert daneben weiter
  // (design.md D9). Kein `fastify-socket.io`-Plugin: neue Dependency, die nichts anderes tut.
  const io = new SocketIOServer(app.server, { serveClient: false, path: '/socket.io' })
  // Anwesenheit ist prozesslokal und lebt fuer die Laufzeit dieser App-Instanz (design.md D1).
  const presence = new Presence()

  // Nur den geteilten Default-Client trennen, nie einen von aussen injizierten - der gehoert
  // dem Aufrufer (etwa einem Test mit einer zweiten Instanz auf derselben DB-Datei).
  app.addHook('onClose', async () => {
    io.close()
    if (usingDefaultPrisma) {
      await prisma.$disconnect()
    }
  })

  // Beim Serverstart hat noch niemand eine Socket-Verbindung aufgebaut - eine Spielsitzung,
  // die als `gestartet` in der DB steht (etwa nach einem Absturz ohne disconnect-Ereignis),
  // ist dann tatsaechlich `pausiert` (design.md D5, Requirement "Abwesenheit des
  // Spielleiters pausiert").
  app.addHook('onReady', async () => {
    await prisma.gameSession.updateMany({ where: { status: 'gestartet' }, data: { status: 'pausiert' } })
  })

  // Zentraler Fehler-Handler: kein stilles catch{} irgendwo in den Routen - ein
  // unerwarteter Fehler wird geloggt und sprechend beantwortet statt abzustuerzen
  // (AGENTS.md, tasks.md 4.7).
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error)
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500
    const isServerError = statusCode >= 500
    reply.status(statusCode).send({
      statusCode,
      error: isServerError ? 'Internal Server Error' : error.name || 'Error',
      message: isServerError ? 'Interner Serverfehler.' : error.message,
    })
  })

  registerAuthRoutes(app, { prisma, clock, cookieSecure })
  registerSessionRoutes(app, { prisma, clock, cookieSecure, io, presence })
  registerSessionSocket(io, { prisma, clock, presence })

  return app
}
