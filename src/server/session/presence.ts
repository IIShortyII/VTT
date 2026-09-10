// Anwesenheitsregister als reine Datenstruktur - kein Import aus socket.io (design.md D7,
// D1: "was einen Neustart nicht ueberleben soll, steht im Speicher und nirgends sonst").
// Prozesslokal, nicht persistiert; ein Neustart raeumt es implizit leer.

export interface EnterResult {
  /** Die bisher fuer denselben Nutzer in dieser Spielsitzung registrierte Socket-ID, falls
   * eine andere - der Aufrufer trennt sie (Uebernahme, design.md D8). */
  replaced: string | null
  /** Die Spielsitzung, in der genau diese Socket-ID zuvor registriert war, falls eine
   * andere als die jetzige - der Aufrufer verlaesst diesen Raum. */
  previousRoom: string | null
}

export interface LeaveResult {
  gameSessionId: string
  userId: string
}

interface SocketInfo {
  gameSessionId: string
  userId: string
}

/**
 * Zwei Indizes (design.md D7): `gameSessionId -> userId -> socketId` fuer die
 * Teilnehmerliste, `socketId -> { gameSessionId, userId }` fuer `leave`. Ein Socket ist in
 * hoechstens einer Spielsitzung.
 */
export class Presence {
  private readonly rooms = new Map<string, Map<string, string>>()
  private readonly sockets = new Map<string, SocketInfo>()

  enter(gameSessionId: string, userId: string, socketId: string): EnterResult {
    const previous = this.sockets.get(socketId)
    let previousRoom: string | null = null

    if (previous && previous.gameSessionId !== gameSessionId) {
      previousRoom = previous.gameSessionId
      const previousRoomMap = this.rooms.get(previous.gameSessionId)
      if (previousRoomMap && previousRoomMap.get(previous.userId) === socketId) {
        previousRoomMap.delete(previous.userId)
        if (previousRoomMap.size === 0) {
          this.rooms.delete(previous.gameSessionId)
        }
      }
    }

    let roomMap = this.rooms.get(gameSessionId)
    if (!roomMap) {
      roomMap = new Map()
      this.rooms.set(gameSessionId, roomMap)
    }

    const existingSocketId = roomMap.get(userId)
    let replaced: string | null = null
    if (existingSocketId !== undefined && existingSocketId !== socketId) {
      replaced = existingSocketId
      this.sockets.delete(existingSocketId)
    }

    roomMap.set(userId, socketId)
    this.sockets.set(socketId, { gameSessionId, userId })

    return { replaced, previousRoom }
  }

  /** Entfernt `socketId`. Liefert `null`, wenn diese Socket-ID nicht (mehr) registriert war -
   * etwa weil `enter` sie zuvor schon ersetzt hat (design.md D7/D8: ein bereits ersetzter
   * Socket loest beim Trennen nichts mehr aus). */
  leave(socketId: string): LeaveResult | null {
    const info = this.sockets.get(socketId)
    if (!info) {
      return null
    }
    const roomMap = this.rooms.get(info.gameSessionId)
    if (roomMap && roomMap.get(info.userId) === socketId) {
      roomMap.delete(info.userId)
      if (roomMap.size === 0) {
        this.rooms.delete(info.gameSessionId)
      }
    }
    this.sockets.delete(socketId)
    return { gameSessionId: info.gameSessionId, userId: info.userId }
  }

  isOnline(gameSessionId: string, userId: string): boolean {
    return this.rooms.get(gameSessionId)?.has(userId) ?? false
  }

  socketOf(gameSessionId: string, userId: string): string | null {
    return this.rooms.get(gameSessionId)?.get(userId) ?? null
  }

  socketsIn(gameSessionId: string): string[] {
    const roomMap = this.rooms.get(gameSessionId)
    return roomMap ? [...roomMap.values()] : []
  }
}
