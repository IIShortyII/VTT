import { io, type Socket } from 'socket.io-client'

import {
  SESSION_EVENTS,
  type AliasAck,
  type EnterAck,
  type EndedEvent,
  type ParticipantsEvent,
  type ReplacedEvent,
  type StatusEvent,
  type TransitionAck,
  type TransitionAction,
} from '../../shared/session.js'
import { SESSION_MAP_EVENTS, type ActivateMapAck, type MapEvent } from '../../shared/session-map.js'

// Duenne Fassade ueber socket.io-client (design.md D10) - kennt genau die Ereignisse des
// Vertrags aus shared/session.ts und shared/session-map.ts, nichts sonst. Das ist zugleich
// die Mock-Grenze fuer Komponententests
// (`jest.mock('../src/client/session/socket.js')`); ohne sie muesste jeder Test
// socket.io-client selbst nachbauen.

export interface SessionSocketFacade {
  connect(): void
  disconnect(): void
  enter(sessionId: string): Promise<EnterAck>
  transition(sessionId: string, action: TransitionAction): Promise<TransitionAck>
  alias(sessionId: string, alias: string): Promise<AliasAck>
  activateMap(sessionId: string, instanceId: string | null): Promise<ActivateMapAck>
  on(event: 'participants', handler: (payload: ParticipantsEvent) => void): void
  on(event: 'status', handler: (payload: StatusEvent) => void): void
  on(event: 'replaced', handler: (payload: ReplacedEvent) => void): void
  on(event: 'ended', handler: (payload: EndedEvent) => void): void
  on(event: 'map', handler: (payload: MapEvent) => void): void
  on(event: 'disconnect', handler: (reason: string) => void): void
}

function wireEventFor(event: string): string {
  if (event === 'disconnect') {
    return 'disconnect'
  }
  if (event === 'map') {
    return SESSION_MAP_EVENTS.map
  }
  return SESSION_EVENTS[event as 'participants' | 'status' | 'replaced' | 'ended']
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
    alias: (sessionId: string, alias: string) =>
      new Promise<AliasAck>((resolve) => {
        socket.emit(SESSION_EVENTS.alias, { sessionId, alias }, (ack: AliasAck) => resolve(ack))
      }),
    activateMap: (sessionId: string, instanceId: string | null) =>
      new Promise<ActivateMapAck>((resolve) => {
        socket.emit(SESSION_MAP_EVENTS.activate, { sessionId, instanceId }, (ack: ActivateMapAck) => resolve(ack))
      }),
    on: (event: string, handler: (payload: unknown) => void) => {
      socket.on(wireEventFor(event), handler as (...args: unknown[]) => void)
    },
  }

  return facade as unknown as SessionSocketFacade
}
