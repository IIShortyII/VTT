import { io, type Socket } from 'socket.io-client'

import type { Cell } from '../../shared/grid.js'
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
import {
  SESSION_TOKEN_EVENTS,
  type AssignTokenAck,
  type CreateTokenAck,
  type CreateTokenInput,
  type MoveTokenAck,
  type RemoveTokenAck,
  type TokenConditionsAck,
  type TokenStatsAck,
  type TokenStatsPatch,
  type TokensEvent,
} from '../../shared/token.js'

// Duenne Fassade ueber socket.io-client (design.md D10) - kennt genau die Ereignisse des
// Vertrags aus shared/session.ts, shared/session-map.ts und shared/token.ts, nichts sonst.
// Das ist zugleich die Mock-Grenze fuer Komponententests
// (`jest.mock('../src/client/session/socket.js')`); ohne sie muesste jeder Test
// socket.io-client selbst nachbauen.

/** Eingabe von `createToken` - `sessionId` kommt vom Aufrufer, der Rest wie im Formular
 * (design.md D5). */
export type CreateTokenFormInput = Omit<CreateTokenInput, 'sessionId'>

export interface SessionSocketFacade {
  connect(): void
  disconnect(): void
  enter(sessionId: string): Promise<EnterAck>
  transition(sessionId: string, action: TransitionAction): Promise<TransitionAck>
  alias(sessionId: string, alias: string): Promise<AliasAck>
  activateMap(sessionId: string, instanceId: string | null): Promise<ActivateMapAck>
  createToken(sessionId: string, input: CreateTokenFormInput): Promise<CreateTokenAck>
  moveToken(sessionId: string, tokenId: string, cell: Cell): Promise<MoveTokenAck>
  removeToken(sessionId: string, tokenId: string): Promise<RemoveTokenAck>
  assignToken(sessionId: string, tokenId: string, ownerId: string | null): Promise<AssignTokenAck>
  // add-token-stats (#61, design.md D5): `patch` traegt nur die im Aufruf gesetzten
  // Schluessel - der Schaden-/Heilungspfad schickt genau `{ hp }`.
  setTokenStats(sessionId: string, tokenId: string, patch: TokenStatsPatch): Promise<TokenStatsAck>
  setTokenConditions(sessionId: string, tokenId: string, conditions: string[]): Promise<TokenConditionsAck>
  on(event: 'participants', handler: (payload: ParticipantsEvent) => void): void
  on(event: 'status', handler: (payload: StatusEvent) => void): void
  on(event: 'replaced', handler: (payload: ReplacedEvent) => void): void
  on(event: 'ended', handler: (payload: EndedEvent) => void): void
  on(event: 'map', handler: (payload: MapEvent) => void): void
  on(event: 'tokens', handler: (payload: TokensEvent) => void): void
  on(event: 'disconnect', handler: (reason: string) => void): void
  /** Feuert bei jeder erfolgreichen Verbindung ausser der ersten (design.md D2) - der Server
   * hat die Verbindung angenommen, kennt den Raum dieser Verbindung nach der vorangegangenen
   * Trennung aber nicht mehr (`design.md` D10 aus #6). Kein Drahtereignis, deshalb nicht in
   * `wireEventFor`. */
  on(event: 'reconnect', handler: () => void): void
}

function wireEventFor(event: string): string {
  if (event === 'disconnect') {
    return 'disconnect'
  }
  if (event === 'map') {
    return SESSION_MAP_EVENTS.map
  }
  if (event === 'tokens') {
    return SESSION_TOKEN_EVENTS.tokens
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

  // design.md D2: Zaehler erfolgreicher Verbindungen, nicht Versuche - eine erst spaeter
  // gelingende erste Verbindung ist trotzdem die erste, kein `reconnect`. Das Socket-Ereignis
  // `connect` (nicht das Manager-Ereignis `reconnect` von socket.io-client) feuert erst, wenn
  // der Server die Verbindung angenommen hat.
  let connectionCount = 0
  let reconnectHandler: (() => void) | undefined

  socket.on('connect', () => {
    connectionCount += 1
    if (connectionCount > 1) {
      reconnectHandler?.()
    }
  })

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
    createToken: (sessionId: string, input: CreateTokenFormInput) =>
      new Promise<CreateTokenAck>((resolve) => {
        socket.emit(SESSION_TOKEN_EVENTS.create, { sessionId, ...input }, (ack: CreateTokenAck) => resolve(ack))
      }),
    moveToken: (sessionId: string, tokenId: string, cell: Cell) =>
      new Promise<MoveTokenAck>((resolve) => {
        socket.emit(SESSION_TOKEN_EVENTS.move, { sessionId, tokenId, col: cell.col, row: cell.row }, (ack: MoveTokenAck) => resolve(ack))
      }),
    removeToken: (sessionId: string, tokenId: string) =>
      new Promise<RemoveTokenAck>((resolve) => {
        socket.emit(SESSION_TOKEN_EVENTS.remove, { sessionId, tokenId }, (ack: RemoveTokenAck) => resolve(ack))
      }),
    assignToken: (sessionId: string, tokenId: string, ownerId: string | null) =>
      new Promise<AssignTokenAck>((resolve) => {
        socket.emit(SESSION_TOKEN_EVENTS.assign, { sessionId, tokenId, ownerId }, (ack: AssignTokenAck) => resolve(ack))
      }),
    setTokenStats: (sessionId: string, tokenId: string, patch: TokenStatsPatch) =>
      new Promise<TokenStatsAck>((resolve) => {
        socket.emit(SESSION_TOKEN_EVENTS.stats, { sessionId, tokenId, ...patch }, (ack: TokenStatsAck) => resolve(ack))
      }),
    setTokenConditions: (sessionId: string, tokenId: string, conditions: string[]) =>
      new Promise<TokenConditionsAck>((resolve) => {
        socket.emit(SESSION_TOKEN_EVENTS.conditions, { sessionId, tokenId, conditions }, (ack: TokenConditionsAck) => resolve(ack))
      }),
    on: (event: string, handler: (payload: unknown) => void) => {
      if (event === 'reconnect') {
        reconnectHandler = handler as () => void
        return
      }
      socket.on(wireEventFor(event), handler as (...args: unknown[]) => void)
    },
  }

  return facade as unknown as SessionSocketFacade
}
