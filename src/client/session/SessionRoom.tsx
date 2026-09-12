import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { cellKey, type FogState, type FogTarget, type FogTool } from '../../shared/fog.js'
import type { Cell } from '../../shared/grid.js'
import {
  allowedActions,
  displayName,
  type AliasAck,
  type EnterAck,
  type GameSessionStatus,
  type MemberRole,
  type Participant,
  type TransitionAction,
} from '../../shared/session.js'
import type { ActiveMap } from '../../shared/session-map.js'
import {
  canMoveToken,
  type CreateTokenInput,
  type Token,
  type TokenAudience,
  type TokenStat,
  type TokenStatsPatch,
} from '../../shared/token.js'
import type { FogLayer } from '../map/canvas.js'
import { MapCanvas } from '../map/MapCanvas.js'
import { FogPanel } from './FogPanel.js'
import { sessionMapImageUrl } from './fog-api.js'
import { MapPanel } from './MapPanel.js'
import { createSessionSocket, type SessionSocketFacade } from './socket.js'
import { PlayerTokenList } from './TokenStats.js'
import { TokenPanel } from './TokenPanel.js'

// Raumansicht (design.md D10, Requirement "Sitzungsoberflaeche"; session-map #50, Requirement
// "Kartenansicht im Raum"; session-token #14, Requirement "Tokenansicht im Raum";
// add-token-assignment #15, Requirement "Tokenansicht im Raum"/"Token bewegen"; add-token-stats
// #61, Requirement "Tokenansicht im Raum"; add-token-sharing #62, Requirement "Zielgruppe
// eines Tokenwerts setzen"/"Tokenansicht im Raum"; add-fog-of-war #16, Requirement
// "Fog-Ansicht im Raum"). Zustand und Teilnehmer kommen ausschliesslich aus dem
// Acknowledgement von `enter` und den nachfolgenden Server-Ereignissen - der angezeigte
// Zustand folgt dem Server, nie dem zuletzt geklickten Uebergang oder der zuletzt aktivierten
// Karte (constitution.md §9.1).
//
// reenter-room-after-reconnect (#46, design.md D3): eine von der Fassade gemeldete
// Wiederverbindung betritt denselben Raum ueber dieselbe Fassade erneut - ausser die
// Verbindung wurde zuvor durch `session:replaced` ersetzt. Die Verdrahtung der Server-
// Ereignisse plus des erneuten Betretens geschieht an einer einzigen Stelle (`wireSocket`),
// die sowohl das Mounten als auch "Hier weiterspielen" aufrufen.

export interface SessionRoomProps {
  sessionId: string
  currentUserId: string
  onLeave: () => void
  onEnded: (message: string) => void
}

const ENDED_MESSAGE = 'Die Spielsitzung wurde beendet.'
const REPLACED_MESSAGE = 'Diese Spielsitzung wurde an anderer Stelle geöffnet.'
const ENTER_FAILURE_MESSAGE = 'Der Raum konnte nicht betreten werden. Bitte versuche es erneut.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv'
const MAP_CANVAS_HEIGHT = 480

type RoomState =
  | { status: 'lädt' }
  | { status: 'fehler'; message: string }
  | {
      status: 'bereit'
      name: string
      sessionStatus: GameSessionStatus
      role: MemberRole
      code?: string
      participants: Participant[]
      map: ActiveMap | null
      tokens: Token[]
      fog: FogState | null
    }

/** Vereinigung zweier Zelllisten ohne Doppelte (add-fog-of-war #16, design.md D7) - benutzt,
 * um im Werkzeug "Bereich markieren" gemeldete Zellen der lokalen Auswahl hinzuzufuegen. */
function mergeCells(a: Cell[], b: Cell[]): Cell[] {
  const byKey = new Map<string, Cell>()
  for (const cell of a) {
    byKey.set(cellKey(cell), cell)
  }
  for (const cell of b) {
    byKey.set(cellKey(cell), cell)
  }
  return [...byKey.values()]
}

export function SessionRoom({ sessionId, currentUserId, onLeave, onEnded }: SessionRoomProps) {
  const socketRef = useRef<SessionSocketFacade | null>(null)
  const [state, setState] = useState<RoomState>({ status: 'lädt' })
  const [replaced, setReplaced] = useState(false)
  // Requirement "Sitzungsoberflaeche": eine gemeldete Wiederverbindung nach `session:replaced`
  // betritt den Raum nicht automatisch erneut. Der `reconnect`-Handler wird einmal beim
  // Verdrahten registriert und lebt so lange wie die Fassade - die Pruefung braucht deshalb
  // den *aktuellen* Wert, ein `useState`-Wert in der Effekt-Closure waere veraltet
  // (design.md D3, "Achtung bei der Umsetzung").
  const replacedRef = useRef(false)
  // Reviewer-Finding #46 Runde 1: der Mount-Effekt trennt im Cleanup nur die Fassade, die er
  // selbst erzeugt hat - "Hier weiterspielen" ersetzt `socketRef.current` zwischenzeitlich
  // durch eine zweite Fassade, ohne dass der Effekt neu liefe. Diese Sperre gilt fuer *jede*
  // aktuell gueltige Fassade (Mount-Effekt wie `handleReconnect`) und kippt im Cleanup des
  // Mount-Effekts - dem einzigen Punkt, der ein echtes Unmount von einem blossen Re-Render
  // unterscheidet (analog zur bisherigen lokalen `cancelled`-Variable, aber komponentenweit
  // sichtbar statt effekt-lokal).
  const cancelledRef = useRef(false)
  // Eingabefeld der eigenen Zeile (design.md D6): einmal beim Betreten mit dem aktuell
  // gesetzten Alias vorbelegt, danach eine unabhaengige Absicht - die angezeigte Benennung
  // (`displayName`) folgt ausschliesslich `state.participants`, nicht dieser Eingabe
  // (constitution.md §9.1, Requirement "Eigener Alias wird als Absicht gesendet").
  const [aliasInput, setAliasInput] = useState('')
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [activateError, setActivateError] = useState<string | null>(null)
  // session-token (#14, design.md D5): gemeinsame Fehlermeldung fuer das Ziehen auf dem
  // Canvas und die Token-Verwaltung - beides sind Absichten desselben Spielleiters.
  // add-token-assignment (#15, design.md D6): wird jetzt in der Raumansicht selbst gerendert
  // (fuer jede Rolle), nicht mehr in `TokenPanel` - sonst stuende dieselbe Meldung zweimal im
  // DOM, sobald auch ein Spieler eine abgelehnte Bewegung sieht. add-token-sharing (#62,
  // design.md D6): dieselbe Meldung auch fuer eine abgelehnte Freigabe.
  const [tokenError, setTokenError] = useState<string | null>(null)
  // add-fog-of-war (#16, design.md D7): Werkzeugwahl (Standard "schwenken"), lokale
  // Ad-hoc-Auswahl fuer "Bereich markieren" und die Fehlermeldung einer abgelehnten
  // Fog-Aktion.
  const [fogTool, setFogTool] = useState<FogTool>('schwenken')
  const [fogSelection, setFogSelection] = useState<Cell[]>([])
  const [fogError, setFogError] = useState<string | null>(null)
  // add-fog-of-war (#16, design.md D6): `onCellsSelected` wird der Canvas-Fassade nur beim
  // Erzeugen uebergeben (wie `onTokenMove`) - dieser Ref haelt das jeweils aktuelle Werkzeug,
  // damit der einmal erzeugte Rueckruf trotzdem das Werkzeug zum Zeitpunkt des Loslassens
  // sieht, nicht das der ersten Wiedergabe.
  const fogToolRef = useRef<FogTool>(fogTool)
  fogToolRef.current = fogTool

  // Registriert die Server-Ereignisse und das erneute Betreten bei Wiederverbindung auf einer
  // gegebenen Fassade, und betritt den Raum ueber sie (design.md D3, D10). `isCancelled`
  // entscheidet, ob ein inzwischen veraltetes Acknowledgement noch State setzen darf - beide
  // Aufrufer (Mount-Effekt, "Hier weiterspielen") reichen dafuer `cancelledRef` durch.
  const wireSocket = useCallback(
    (socket: SessionSocketFacade, isCancelled: () => boolean) => {
      function applyEnterAck(ack: EnterAck): void {
        if (!ack.ok) {
          setState({ status: 'fehler', message: ack.message })
          return
        }
        // session-token (#14, Gate-Nacharbeit Runde 1): `ack.tokens ?? []` faengt bestehende
        // Tests aus #49/#50 ab, deren gemockte Acknowledgements das neue Feld nicht fuehren -
        // "Keine bestehende Assertion bricht" (design.md Goals) gilt auch fuer Mocks, die
        // diese Aenderung nicht kennen. add-fog-of-war (#16): `ack.fog ?? null` nach demselben
        // Muster.
        setState({
          status: 'bereit',
          name: ack.session.name,
          sessionStatus: ack.session.status,
          role: ack.session.role,
          code: ack.session.code,
          participants: ack.participants,
          map: ack.map ?? null,
          tokens: ack.tokens ?? [],
          fog: ack.fog ?? null,
        })
        const self = ack.participants.find((participant) => participant.userId === currentUserId)
        setAliasInput(self?.alias ?? '')
      }

      function enter(): void {
        socket
          .enter(sessionId)
          .then((ack: EnterAck) => {
            if (isCancelled()) {
              return
            }
            applyEnterAck(ack)
          })
          .catch((error: unknown) => {
            if (isCancelled()) {
              return
            }
            console.error(error)
            setState({ status: 'fehler', message: ENTER_FAILURE_MESSAGE })
          })
      }

      socket.on('participants', ({ participants }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, participants } : prev))
      })
      socket.on('status', ({ status }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, sessionStatus: status } : prev))
      })
      // session-map (#50, Requirement "Kartenansicht im Raum"): die angezeigte Karte folgt
      // ausschliesslich `session:map`, nie der zuletzt geklickten Schaltflaeche. `tokens`/`fog`
      // werden hier NICHT angefasst - der Server schickt sie unmittelbar danach ueber
      // `session:fog`/`session:tokens` (session-token #14, add-fog-of-war #16, design.md D5);
      // ein lokales Leeren erzeugte nur ein Flackern.
      socket.on('map', ({ map }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, map } : prev))
      })
      // session-token (#14, Requirement "Tokenbestand beim Betreten und Kartenwechsel"):
      // ersetzt die Liste vollstaendig.
      socket.on('tokens', ({ tokens }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, tokens } : prev))
      })
      // add-fog-of-war (#16, Requirement "Fog beim Betreten und Kartenwechsel"): ersetzt die
      // Fog-Darstellung vollstaendig, auch mit `null`.
      socket.on('fog', ({ fog }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, fog } : prev))
      })
      // Nach `replaced` MUSS die Fassade sich nicht von selbst neu verbinden oder den Raum
      // erneut betreten (Requirement "Sitzungsoberflaeche") - nur der Hinweis erscheint, ein
      // erneutes Betreten erfolgt ausschliesslich durch "Hier weiterspielen".
      socket.on('replaced', () => {
        replacedRef.current = true
        setReplaced(true)
      })
      socket.on('ended', () => {
        onEnded(ENDED_MESSAGE)
      })
      // reenter-room-after-reconnect (#46, design.md D2/D3): der Server kennt den Raum einer
      // Verbindung nach einer Trennung nicht mehr - eine gemeldete Wiederverbindung betritt ihn
      // ueber dieselbe Fassade erneut, ausser die Verbindung wurde inzwischen ersetzt oder die
      // Komponente ist inzwischen unmounted (Reviewer-Finding #46 Runde 1).
      socket.on('reconnect', () => {
        if (replacedRef.current || isCancelled()) {
          return
        }
        enter()
      })

      socket.connect()
      enter()
    },
    [sessionId, currentUserId, onEnded],
  )

  // Betritt den Raum beim Mounten und bei einem Wechsel der `sessionId` - eine neue Fassade
  // je Betreten. Das Cleanup trennt `socketRef.current`, nicht die hier erzeugte lokale
  // Variable: "Hier weiterspielen" kann zwischenzeitlich eine andere Fassade dort abgelegt
  // haben, und genau die - nicht die des urspruenglichen Mounts - ist beim Unmount noch am
  // Leben (Reviewer-Finding #46 Runde 1; design.md D10: "Fassade beim Unmount trennen").
  useEffect(() => {
    cancelledRef.current = false
    const socket = createSessionSocket()
    socketRef.current = socket

    wireSocket(socket, () => cancelledRef.current)

    return () => {
      cancelledRef.current = true
      socketRef.current?.disconnect()
    }
  }, [wireSocket])

  // add-fog-of-war (#16, design.md D7): Fog-Ebene fuer die Canvas-Fassade - nur bei Aenderung
  // von `fog`/`role` neu gebaut, damit der `setFog`-Effekt in `MapCanvas` nicht bei jedem
  // Render feuert (etwa bei einer Teilnehmerliste-Aktualisierung).
  const currentFog = state.status === 'bereit' ? state.fog : null
  const currentRole = state.status === 'bereit' ? state.role : null
  const fogLayer = useMemo<FogLayer | null>(() => {
    if (!currentFog) {
      return null
    }
    return { revealed: currentFog.revealed, opaque: currentRole === 'spieler' }
  }, [currentFog, currentRole])

  const handleTransition = (action: TransitionAction) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket.transition(sessionId, action).catch((error: unknown) => {
      console.error(error)
    })
  }

  const handleAliasSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .alias(sessionId, aliasInput)
      .then((ack: AliasAck) => {
        setAliasError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // session-map (#50, Requirement "Aktive Karte setzen"): die Absicht wird gesendet, die
  // Anzeige folgt ausschliesslich `session:map` - das Acknowledgement liefert nur `ok`
  // und im Fehlerfall eine Meldung (design.md D4, D7).
  const handleActivateMap = (instanceId: string | null) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .activateMap(sessionId, instanceId)
      .then((ack) => {
        setActivateError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // session-token (#14, Requirement "Tokenansicht im Raum"): die Absicht wird gesendet, das
  // Token springt erst mit dem `session:tokens`, das der Server nach dem Schreiben verteilt
  // (constitution.md §9.1) - kein optimistisches Verschieben. add-token-assignment (#15): fuer
  // JEDE Rolle verdrahtet - die Greifbarkeitsregel entscheidet, ob der Rueckruf ueberhaupt
  // ausgeloest wird, aber der Server ist die letzte Instanz (constitution.md §9.3).
  const handleTokenMove = (tokenId: string, cell: Cell) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .moveToken(sessionId, tokenId, cell)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleTokenCreate = (input: Omit<CreateTokenInput, 'sessionId'>) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .createToken(sessionId, input)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleTokenRemove = (tokenId: string) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .removeToken(sessionId, tokenId)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // add-token-assignment (#15, design.md D6): keine lokale Aenderung des Bestands - der
  // Server verteilt den neuen Bestand per `session:tokens` (constitution.md §9.1).
  const handleTokenAssign = (tokenId: string, ownerId: string | null) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .assignToken(sessionId, tokenId, ownerId)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // add-token-stats (#61, design.md D10): dieselbe Fehlermeldung wie die uebrigen
  // Token-Handler - keine lokale Aenderung des Bestands, der Server verteilt ihn per
  // `session:tokens` (constitution.md §9.1).
  const handleTokenStats = (tokenId: string, patch: TokenStatsPatch) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .setTokenStats(sessionId, tokenId, patch)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleTokenConditions = (tokenId: string, conditions: string[]) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .setTokenConditions(sessionId, tokenId, conditions)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // add-token-sharing (#62, design.md D6): die Absicht wird gesendet, keine lokale Aenderung
  // des Bestands - der Server verteilt den neuen Bestand per `session:tokens`
  // (constitution.md §9.1); dieselbe Fehlermeldung wie die uebrigen Token-Handler.
  const handleTokenShare = (tokenId: string, stat: TokenStat, audience: TokenAudience) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .shareToken(sessionId, tokenId, stat, audience)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // add-fog-of-war (#16, design.md D7): gemeinsamer Sendepfad fuer `session:fog-set` - der
  // angezeigte Fog wird NICHT lokal geaendert, bevor `session:fog` eintrifft (constitution.md
  // §9.1); nur die Fehlermeldung eines abgelehnten Acks wird gesetzt.
  const sendFogSet = (revealed: boolean, target: FogTarget) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .setFog(sessionId, revealed, target)
      .then((ack) => {
        setFogError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // add-fog-of-war (#16, design.md D7, D6): wird der Canvas-Fassade als `onCellsSelected`
  // beim Erzeugen uebergeben und danach nicht erneut gelesen - das aktuelle Werkzeug kommt
  // deshalb aus `fogToolRef`, nicht aus der `fogTool`-Variable dieses Aufrufs.
  const handleFogCellsSelected = (cells: Cell[]) => {
    const tool = fogToolRef.current
    if (tool === 'aufdecken') {
      sendFogSet(true, { kind: 'zellen', cells })
      return
    }
    if (tool === 'verdecken') {
      sendFogSet(false, { kind: 'zellen', cells })
      return
    }
    if (tool === 'bereich') {
      setFogSelection((prev) => mergeCells(prev, cells))
    }
  }

  const handleFogAreaCreate = (name: string) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .createFogArea(sessionId, name, fogSelection)
      .then((ack) => {
        setFogError(ack.ok ? null : ack.message)
        if (ack.ok) {
          setFogSelection([])
        }
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleFogAreaDelete = (areaId: string) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .deleteFogArea(sessionId, areaId)
      .then((ack) => {
        setFogError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleFogClearSelection = () => {
    setFogSelection([])
  }

  // "Hier weiterspielen" (Requirement "Sitzungsoberflaeche"): eine bewusste Handlung des
  // Nutzers, keine Automatik - die Sperren werden zurueckgesetzt, die neue Fassade beginnt
  // ohne Vorgeschichte (design.md D3). Die bisherige Fassade wird zusaetzlich explizit
  // getrennt (Reviewer-Finding #46 Runde 1) - der Server hat sie zwar bereits getrennt
  // (design.md D8, "io server disconnect"), aber keine lebende Fassade mit aktiven Handlern
  // bleibt so in keinem Fall zurueck, bevor die neue erzeugt wird.
  const handleReconnect = () => {
    replacedRef.current = false
    cancelledRef.current = false
    setReplaced(false)
    setState({ status: 'lädt' })

    socketRef.current?.disconnect()

    const socket = createSessionSocket()
    socketRef.current = socket
    wireSocket(socket, () => cancelledRef.current)
  }

  if (replaced) {
    return (
      <div>
        <p role="alert">{REPLACED_MESSAGE}</p>
        <button type="button" onClick={handleReconnect}>
          Hier weiterspielen
        </button>
      </div>
    )
  }

  if (state.status === 'lädt') {
    return <p>Lädt …</p>
  }

  if (state.status === 'fehler') {
    return (
      <div>
        <p role="alert">{state.message}</p>
        <button type="button" onClick={onLeave}>
          Zurück zur Liste
        </button>
      </div>
    )
  }

  // add-fog-of-war (#16, design.md D7): Bild-URL der Kartenansicht - der Spielleiter laedt
  // das Original genau einmal je Karte, ein Spieler bei jeder Fog-Version neu (`MapCanvas`
  // ruft `setImage` nur bei geaenderter URL-Zeichenkette auf).
  const hasImage = state.map?.hasImage ?? false
  const imageUrl = !hasImage
    ? null
    : state.role === 'spielleiter'
      ? sessionMapImageUrl(sessionId, null)
      : sessionMapImageUrl(sessionId, state.fog?.version ?? 0)

  return (
    <div>
      <h1>{state.name}</h1>
      <p>Zustand: {state.sessionStatus}</p>
      {state.code !== undefined && <p>Code: {state.code}</p>}
      <ul>
        {state.participants.map((participant) => (
          <li key={participant.userId}>
            {/* Kein Rollen-Text pro Teilnehmer (Requirement "Sitzungsoberflaeche" nennt nur
                Alias-oder-Nutzername und Anwesenheitskennzeichen) - "spielleiter" als
                sichtbarer Text wuerde jeden Nutzernamen ueberdecken, der "leiter" als
                Teilstring enthaelt. */}
            <span>{displayName(participant)}</span>
            <span> – {participant.online ? 'anwesend' : 'abwesend'}</span>
            {participant.userId === currentUserId && (
              <form onSubmit={handleAliasSubmit}>
                <label htmlFor="alias-input">Alias</label>
                <input id="alias-input" value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} />
                <button type="submit">Alias setzen</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {aliasError !== null && <p role="alert">{aliasError}</p>}
      {state.role === 'spielleiter' && (
        <div>
          {allowedActions(state.sessionStatus).map((action) => (
            <button key={action} type="button" onClick={() => handleTransition(action)}>
              {action}
            </button>
          ))}
        </div>
      )}

      {/* session-map (#50, Requirement "Kartenansicht im Raum"): der Name folgt genau dem
          Text "Aktive Karte: <Name>" bzw. "Keine Karte aktiv" (design.md D7). */}
      {state.map !== null ? <p>{`Aktive Karte: ${state.map.name}`}</p> : <p>{NO_ACTIVE_MAP_MESSAGE}</p>}
      {state.map !== null && (
        <div style={{ width: '100%', height: MAP_CANVAS_HEIGHT }}>
          <MapCanvas
            imageUrl={imageUrl}
            grid={state.map.grid}
            tokens={state.tokens}
            onTokenMove={handleTokenMove}
            canMoveToken={(token) => canMoveToken(token, { role: state.role, userId: currentUserId })}
            fog={fogLayer}
            tool={fogTool}
            selection={fogSelection}
            onCellsSelected={handleFogCellsSelected}
          />
        </div>
      )}

      {/* add-token-assignment (#15, design.md D6): fuer jede Rolle, damit auch ein Spieler
          eine abgelehnte eigene Bewegung sieht. add-token-sharing (#62): auch eine
          abgelehnte Freigabe. */}
      {tokenError !== null && <p role="alert">{tokenError}</p>}

      {/* add-fog-of-war (#16, design.md D7, D8): fuer jede Rolle, wie `tokenError`. */}
      {fogError !== null && <p role="alert">{fogError}</p>}

      {state.role === 'spielleiter' && (
        <MapPanel
          sessionId={sessionId}
          activeInstanceId={state.map?.instanceId ?? null}
          onActivate={handleActivateMap}
          activateError={activateError}
        />
      )}

      {/* add-fog-of-war (#16, design.md D7): nur fuer den Spielleiter und bei vorhandenem Fog
          (also bei aktiver Karte) - ein Spieler bekommt weder die Verwaltung noch deren
          Abfragen (constitution.md §9.2). */}
      {state.role === 'spielleiter' && state.fog !== null && (
        <FogPanel
          fog={state.fog}
          tool={fogTool}
          selectionCount={fogSelection.length}
          onToolChange={setFogTool}
          onRevealAll={() => sendFogSet(true, { kind: 'alle' })}
          onHideAll={() => sendFogSet(false, { kind: 'alle' })}
          onAreaCreate={handleFogAreaCreate}
          onClearSelection={handleFogClearSelection}
          onAreaToggle={(areaId, revealed) => sendFogSet(revealed, { kind: 'bereich', areaId })}
          onAreaDelete={handleFogAreaDelete}
        />
      )}

      {state.role === 'spielleiter' && (
        <TokenPanel
          sessionId={sessionId}
          tokens={state.tokens}
          participants={state.participants}
          onCreate={handleTokenCreate}
          onRemove={handleTokenRemove}
          onAssign={handleTokenAssign}
          onSetStats={handleTokenStats}
          onSetConditions={handleTokenConditions}
          onShare={handleTokenShare}
        />
      )}

      {/* add-token-stats (#61, design.md D10, Requirement "Tokenansicht im Raum"): ein
          Spieler sieht statt der Verwaltung die eigene Werteliste. add-token-sharing (#62,
          design.md D6): `participants` und `onShare` fuer die Freigabe-Schalter der eigenen
          Tokens. */}
      {state.role === 'spieler' && (
        <PlayerTokenList tokens={state.tokens} participants={state.participants} onShare={handleTokenShare} />
      )}

      <button type="button" onClick={onLeave}>
        Zurück zur Liste
      </button>
    </div>
  )
}
