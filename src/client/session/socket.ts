import { io, type Socket } from 'socket.io-client'

import {
  SESSION_EVENTS,
  type EnterAck,
  type EndedEvent,
  type ParticipantsEvent,
  type ReplacedEvent,
  type StatusEvent,
  type TransitionAck,
  type TransitionAction,
} from '../../shared/session.js'

// Duenne Fassade ueber socket.io-client (design.md D10) - kennt genau die Ereignisse des
// Vertrags aus shared/session.ts, nichts sonst. Das ist zugleich die Mock-Grenze fuer
// Komponententests (`jest.mock('../src/client/session/socket.js')`); ohne sie muesste jeder
// Test socket.io-client selbst nachbauen.

export interface SessionSocketFacade {
  connect(): void
  disconnect(): void
  enter(sessionId: string): Promise<EnterAck>
  transition(sessionId: string, action: TransitionAction): Promise<TransitionAck>
  on(event: 'participants', handler: (payload: ParticipantsEvent) => void): void
  on(event: 'status', handler: (payload: StatusEvent) => void): void
  on(event: 'replaced', handler: (payload: ReplacedEvent) => void): void
  on(event: 'ended', handler: (payload: EndedEvent) => void): void
  on(event: 'disconnect', handler: (reason: string) => void): void
}

function wireEventFor(event: string): string {
  return event === 'disconnect' ? 'disconnect' : SESSION_EVENTS[event as 'participants' | 'status' | 'replaced' | 'ended']
}

/**
 * Erzeugt eine neue Fassade mit einem eigenen, noch nicht verbundenen Socket
 * (`autoConnect: false`) - der Aufrufer entscheidet per `connect()`, wann die Verbindung
 * aufgebaut wird (design.md D10). `withCredentials: true` schickt das Sitzungscookie mit.
 */
export function createSessionSocket(): SessionSocketFacade {
  const socket: Socket = io('/', { path: '/socket.io', autoConnect: false, withCredentials: true })

  const facade = {
    connect: () => {
      socket.connect()
    },
    disconnect: () => {
      socket.disconnect()
    },
    enter: (sessionId: string) =>
      new Promise<EnterAck>((resolve) => {
        socket.emit(SESSION_EVENTS.enter, { sessionId }, (ack: EnterAck) => resolve(ack))
      }),
    transition: (sessionId: string, action: TransitionAction) =>
      new Promise<TransitionAck>((resolve) => {
        socket.emit(SESSION_EVENTS.transition, { sessionId, action }, (ack: TransitionAck) => resolve(ack))
      }),
    on: (event: string, handler: (payload: unknown) => void) => {
      socket.on(wireEventFor(event), handler as (...args: unknown[]) => void)
    },
  }

  return facade as unknown as SessionSocketFacade
}
