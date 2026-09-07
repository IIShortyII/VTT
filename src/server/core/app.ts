import cookie from '@fastify/cookie'
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'

import type { PrismaClient } from '@prisma/client'

import { registerAuthRoutes } from '../auth/routes.js'
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
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const config = loadConfig()
  const prisma = options.prisma ?? defaultPrisma
  const clock = options.clock ?? systemClock
  const cookieSecure = options.cookieSecure ?? config.cookieSecure

  const app = Fastify({ logger: false })

  app.register(cookie)

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

  return app
}
