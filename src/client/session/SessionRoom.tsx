import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

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
import { canMoveToken, type CreateTokenInput, type Token } from '../../shared/token.js'
import { mapImageUrl } from '../map/api.js'
import { MapCanvas } from '../map/MapCanvas.js'
import { MapPanel } from './MapPanel.js'
import { createSessionSocket, type SessionSocketFacade } from './socket.js'
import { TokenPanel } from './TokenPanel.js'

// Raumansicht (design.md D10, Requirement "Sitzungsoberflaeche"; session-map #50, Requirement
// "Kartenansicht im Raum"; session-token #14, Requirement "Tokenansicht im Raum";
// add-token-assignment #15, Requirement "Tokenansicht im Raum"/"Token bewegen"). Zustand und
// Teilnehmer kommen ausschliesslich aus dem Acknowledgement von `enter` und den
// nachfolgenden Server-Ereignissen - der angezeigte Zustand folgt dem Server, nie dem zuletzt
// geklickten Uebergang oder der zuletzt aktivierten Karte (constitution.md §9.1).
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
  // DOM, sobald auch ein Spieler eine abgelehnte Bewegung sieht.
  const [tokenError, setTokenError] = useState<string | null>(null)

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
        // diese Aenderung nicht kennen.
        setState({
          status: 'bereit',
          name: ack.session.name,
          sessionStatus: ack.session.status,
          role: ack.session.role,
          code: ack.session.code,
          participants: ack.participants,
          map: ack.map ?? null,
          tokens: ack.tokens ?? [],
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
      // ausschliesslich `session:map`, nie der zuletzt geklickten Schaltflaeche. `tokens` wird
      // hier NICHT angefasst - der Server schickt den passenden Bestand unmittelbar danach
      // ueber `session:tokens` (session-token #14, design.md D5); ein lokales Leeren erzeugte
      // nur ein Flackern.
      socket.on('map', ({ map }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, map } : prev))
      })
      // session-token (#14, Requirement "Tokenbestand beim Betreten und Kartenwechsel"):
      // ersetzt die Liste vollstaendig.
      socket.on('tokens', ({ tokens }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, tokens } : prev))
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
            imageUrl={state.map.hasImage ? mapImageUrl(state.map.mapId) : null}
            grid={state.map.grid}
            tokens={state.tokens}
            onTokenMove={handleTokenMove}
            canMoveToken={(token) => canMoveToken(token, { role: state.role, userId: currentUserId })}
          />
        </div>
      )}

      {/* add-token-assignment (#15, design.md D6): fuer jede Rolle, damit auch ein Spieler
          eine abgelehnte eigene Bewegung sieht. */}
      {tokenError !== null && <p role="alert">{tokenError}</p>}

      {state.role === 'spielleiter' && (
        <MapPanel
          sessionId={sessionId}
          activeInstanceId={state.map?.instanceId ?? null}
          onActivate={handleActivateMap}
          activateError={activateError}
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
        />
      )}

      <button type="button" onClick={onLeave}>
        Zurück zur Liste
      </button>
    </div>
  )
}
