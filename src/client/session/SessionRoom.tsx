import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import {
  DISTANCE_UNIT_STORAGE_KEY,
  DistanceUnitSchema,
  snapToCellCenter,
  type Annotation,
  type AnnotationColor,
  type AnnotationKind,
  type AnnotationMode,
  type AnnotationVisibility,
  type CanvasTool,
  type DeleteAnnotationTarget,
  type DistanceUnit,
} from '../../shared/annotation.js'
import { cellKey, type FogState, type FogTarget } from '../../shared/fog.js'
import type { Cell, Point } from '../../shared/grid.js'
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
import type { AnnotationOptions, FogLayer } from '../map/canvas.js'
import { useT } from '../i18n/locale.js'
import { MapCanvas } from '../map/MapCanvas.js'
import { AnnotationPanel } from './AnnotationPanel.js'
import { FogPanel } from './FogPanel.js'
import { sessionMapImageUrl } from './fog-api.js'
import { MapPanel } from './MapPanel.js'
import { createSessionSocket, type SessionSocketFacade } from './socket.js'
import { SESSION_OVERLAY, SESSION_STATUS_PRESENTATION, TRANSITION_LABELS } from './session-status.js'
import { PlayerTokenList } from './TokenStats.js'
import { Icon } from '../ui/Icon.js'
import { Modal } from '../ui/Modal.js'
import { MapOverlay, StatusBanner } from '../ui/status.js'
import { useToasts } from '../ui/toast.js'
import { TokenPanel } from './TokenPanel.js'

// Raumansicht (design.md D10, Requirement "Sitzungsoberflaeche"; session-map #50, Requirement
// "Kartenansicht im Raum"; session-token #14, Requirement "Tokenansicht im Raum";
// add-token-assignment #15, Requirement "Tokenansicht im Raum"/"Token bewegen"; add-token-stats
// #61, Requirement "Tokenansicht im Raum"; add-token-sharing #62, Requirement "Zielgruppe
// eines Tokenwerts setzen"/"Tokenansicht im Raum"; add-fog-of-war #16, Requirement
// "Fog-Ansicht im Raum"; add-measure-draw #11, Requirement "Anmerkungsansicht im Raum";
// ui-status #91, Requirement "Verbindungs- und Sitzungszustand im Raum"). Zustand und
// Teilnehmer kommen ausschliesslich aus dem Acknowledgement von `enter` und den nachfolgenden
// Server-Ereignissen - der angezeigte Zustand folgt dem Server, nie dem zuletzt geklickten
// Uebergang oder der zuletzt aktivierten Karte (constitution.md §9.1).
//
// reenter-room-after-reconnect (#46, design.md D3): eine von der Fassade gemeldete
// Wiederverbindung betritt denselben Raum ueber dieselbe Fassade erneut - ausser die
// Verbindung wurde zuvor durch `session:replaced` ersetzt. Die Verdrahtung der Server-
// Ereignisse plus des erneuten Betretens geschieht an einer einzigen Stelle (`wireSocket`),
// die sowohl das Mounten als auch "Hier weiterspielen" aufrufen.
//
// ui-shell (#84, design.md D4): die Rueckkehr zur Sitzungsliste liegt ausschliesslich in der
// Top-Bar der App-Shell - diese Ansicht hat weder eine eigene Schaltflaeche "Zurück zur Liste"
// noch die Prop `onLeave` fuer diesen Zweck. Der Fehlerzustand zeigt nur noch die Meldung.
//
// ui-text (#87, design.md D6): nur zwei Stellen dieser Ansicht laufen ueber Textschluessel -
// die Zustandspille (statt des Rohwerts `state.sessionStatus`) und die Uebergangs-
// Schaltflaechen (statt des Aktionsnamens); die uebrigen Texte dieser Ansicht bleiben
// Rohstrings bis Epic C/D (proposal.md, Umfang).
//
// ui-status (#91, design.md D2-D5): `disconnected` verdrahtet `disconnect` der Fassade und
// zeigt ein `StatusBanner`; `ended` ersetzt den direkten Aufruf von `onEnded` durch einen
// `alertdialog` mit Timer (D4); `replaced` wird nicht mehr als eigene Ansicht gerendert,
// sondern als `alertdialog` ueber dem unveraendert gerenderten Inhalt (D3); das
// Karten-Overlay (D5) folgt ausschliesslich `state.sessionStatus`. `onEnded`/`onLeave`
// wandern in Refs, damit `wireSocket` ohne sie als Abhaengigkeit auskommt (Goal "keine neue
// Fassade bei einem Rendern von `App`").

export interface SessionRoomProps {
  sessionId: string
  currentUserId: string
  onEnded: () => void
  onLeave: () => void
}

const ENTER_FAILURE_MESSAGE = 'Der Raum konnte nicht betreten werden. Bitte versuche es erneut.'
const NO_ACTIVE_MAP_MESSAGE = 'Keine Karte aktiv'
const MAP_CANVAS_HEIGHT = 480
// ui-status (#91, design.md D4): Sitzungsende leitet 4000 Millisekunden nach dem Dialog zur
// Liste weiter - Schaltflaeche, Schliessen (Esc/`Schließen`) und der Ablauf des Timers fuehren
// alle zu `onEnded`, genau einmal (der Timer wird beim Verlassen geraeumt).
const ENDED_REDIRECT_MS = 4000

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
      annotations: Annotation[]
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

/** Einheit aus dem Browserspeicher (add-measure-draw #11, design.md D5): `try/catch`, weil
 * ein gesperrter oder privater Speicher nicht die Anzeige verhindern soll - Rueckfall
 * `meter`. Ein gespeicherter, aber nicht mehr gueltiger Wert wird verworfen. */
function readStoredUnit(): DistanceUnit {
  try {
    const stored = localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY)
    const parsed = DistanceUnitSchema.safeParse(stored)
    return parsed.success ? parsed.data : 'meter'
  } catch {
    return 'meter'
  }
}

export function SessionRoom({ sessionId, currentUserId, onEnded, onLeave }: SessionRoomProps) {
  const t = useT()
  const { push } = useToasts()
  const socketRef = useRef<SessionSocketFacade | null>(null)
  const [state, setState] = useState<RoomState>({ status: 'lädt' })
  const [replaced, setReplaced] = useState(false)
  // Requirement "Sitzungsoberflaeche": eine gemeldete Wiederverbindung nach `session:replaced`
  // betritt den Raum nicht automatisch erneut. Der `reconnect`-Handler wird einmal beim
  // Verdrahten registriert und lebt so lange wie die Fassade - die Pruefung braucht deshalb
  // den *aktuellen* Wert, ein `useState`-Wert in der Effekt-Closure waere veraltet
  // (design.md D3, "Achtung bei der Umsetzung").
  const replacedRef = useRef(false)
  // ui-status (#91, design.md D2/D4): `disconnected` traegt den Verbindungszustand fuer das
  // Banner, `ended`/`endedRef` den Sitzungsende-Dialog samt Timer - `endedRef` wird von
  // `wireSocket` gelesen (Disconnect-/Reconnect-Handler duerfen nach Sitzungsende nichts mehr
  // tun), `ended` steuert den Dialog und den Timer-Effekt.
  const [disconnected, setDisconnected] = useState<'unterbrochen' | 'getrennt' | null>(null)
  const [ended, setEnded] = useState(false)
  const endedRef = useRef(false)
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
  // add-fog-of-war (#16, design.md D7): lokale Ad-hoc-Auswahl fuer "Bereich markieren" und
  // die Fehlermeldung einer abgelehnten Fog-Aktion. add-measure-draw (#11, design.md D5):
  // `fogTool` wird zu `tool: CanvasTool` - EIN Werkzeugzustand fuer Fog- und
  // Anmerkungswerkzeuge, Standard weiterhin "schwenken".
  const [tool, setTool] = useState<CanvasTool>('schwenken')
  const [fogSelection, setFogSelection] = useState<Cell[]>([])
  const [fogError, setFogError] = useState<string | null>(null)
  // add-fog-of-war (#16, design.md D6): `onCellsSelected` wird der Canvas-Fassade nur beim
  // Erzeugen uebergeben (wie `onTokenMove`) - dieser Ref haelt das jeweils aktuelle Werkzeug,
  // damit der einmal erzeugte Rueckruf trotzdem das Werkzeug zum Zeitpunkt des Loslassens
  // sieht, nicht das der ersten Wiedergabe.
  const toolRef = useRef<CanvasTool>(tool)
  toolRef.current = tool

  // add-measure-draw (#11, design.md D5): Modus/Sichtbarkeit/Farbe der naechsten Anmerkung,
  // Einheit (aus dem Browserspeicher vorbelegt) und die Fehlermeldung einer abgelehnten
  // Anmerkungsaktion.
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('gerastert')
  const [annotationVisibility, setAnnotationVisibility] = useState<AnnotationVisibility>('privat')
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>('rot')
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(readStoredUnit)
  const [annotationError, setAnnotationError] = useState<string | null>(null)
  // design.md D5: `onAnnotationDrawn` wird der Canvas-Fassade nur beim Erzeugen uebergeben
  // (Muster `onCellsSelected`/`fogToolRef`) - diese Refs halten Modus/Sichtbarkeit/Farbe und
  // das aktuelle Raster, damit der einmal erzeugte Rueckruf trotzdem den aktuellen Stand
  // sieht.
  const annotationModeRef = useRef<AnnotationMode>(annotationMode)
  annotationModeRef.current = annotationMode
  const annotationVisibilityRef = useRef<AnnotationVisibility>(annotationVisibility)
  annotationVisibilityRef.current = annotationVisibility
  const annotationColorRef = useRef<AnnotationColor>(annotationColor)
  annotationColorRef.current = annotationColor
  const currentGrid = state.status === 'bereit' ? (state.map?.grid ?? null) : null
  const gridRef = useRef(currentGrid)
  gridRef.current = currentGrid

  // ui-status (#91, design.md D2): `onEnded`/`onLeave` (und `push`/`t`, damit der
  // Reconnect-Handler den Toast in der aktuellen Sprache auslösen kann) wandern in Refs, bei
  // jedem Rendern nachgezogen - `wireSocket` liest sie darüber, ohne sie als Abhaengigkeit zu
  // fuehren (Goal "keine neue Fassade bei einem Rendern von `App`").
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const onLeaveRef = useRef(onLeave)
  onLeaveRef.current = onLeave
  const pushRef = useRef(push)
  pushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

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
        // Muster. add-measure-draw (#11): `ack.annotations ?? []` ebenso.
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
          annotations: ack.annotations ?? [],
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
      // add-measure-draw (#11, Requirement "Anmerkungsbestand beim Betreten und
      // Kartenwechsel"): ersetzt den Anmerkungsbestand vollstaendig; die angezeigte Liste
      // MUSS NICHT lokal geaendert werden, bevor dieses Ereignis eintrifft (constitution.md
      // §9.1).
      socket.on('annotations', ({ annotations }) => {
        setState((prev) => (prev.status === 'bereit' ? { ...prev, annotations } : prev))
      })
      // ui-status (#91, design.md D2, Requirement "Verbindungs- und Sitzungszustand im
      // Raum"): jede Trennung, die kein Netzereignis ist ("io client disconnect" - die
      // Anwendung selbst hat getrennt, etwa beim Unmount oder bei "Hier weiterspielen") oder
      // die nach `replaced`/`ended` eintrifft, bleibt ohne Banner.
      socket.on('disconnect', (reason) => {
        if (isCancelled() || replacedRef.current || endedRef.current || reason === 'io client disconnect') {
          return
        }
        setDisconnected(reason === 'io server disconnect' ? 'getrennt' : 'unterbrochen')
      })
      // Nach `replaced` MUSS die Fassade sich nicht von selbst neu verbinden oder den Raum
      // erneut betreten (Requirement "Sitzungsoberflaeche") - nur der Dialog erscheint, ein
      // erneutes Betreten erfolgt ausschliesslich durch "Hier weiterspielen".
      socket.on('replaced', () => {
        replacedRef.current = true
        setReplaced(true)
      })
      // ui-status (#91, design.md D4): kein direkter Aufruf von `onEnded` mehr - der Dialog
      // (samt Timer) entscheidet, wann die Ansicht wechselt.
      socket.on('ended', () => {
        endedRef.current = true
        setEnded(true)
      })
      // reenter-room-after-reconnect (#46, design.md D2/D3): der Server kennt den Raum einer
      // Verbindung nach einer Trennung nicht mehr - eine gemeldete Wiederverbindung betritt ihn
      // ueber dieselbe Fassade erneut, ausser die Verbindung wurde inzwischen ersetzt, der Raum
      // inzwischen verlassen (`ended`) oder die Komponente ist inzwischen unmounted
      // (Reviewer-Finding #46 Runde 1). ui-status (#91, design.md D2): das Banner verschwindet
      // und der Toast erscheint VOR dem erneuten Betreten, unabhaengig von dessen Ergebnis.
      socket.on('reconnect', () => {
        if (replacedRef.current || endedRef.current || isCancelled()) {
          return
        }
        setDisconnected(null)
        pushRef.current(tRef.current('toast.reconnected'))
        enter()
      })

      socket.connect()
      enter()
    },
    [sessionId, currentUserId],
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

  // ui-status (#91, design.md D4): der Timer fuer den Sitzungsende-Dialog - beim Verlassen
  // (Unmount, die Anwendung hat zur Liste gewechselt) raeumt das Cleanup ihn, ein zweiter
  // Aufruf von `onEnded` bleibt aus.
  useEffect(() => {
    if (!ended) {
      return
    }
    const timer = setTimeout(() => {
      onEndedRef.current()
    }, ENDED_REDIRECT_MS)
    return () => clearTimeout(timer)
  }, [ended])

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

  // add-measure-draw (#11, design.md D5): die drei Anzeigeoptionen als ein Objekt, damit der
  // `setAnnotationOptions`-Effekt in `MapCanvas` nur bei tatsaechlicher Aenderung feuert.
  const annotationOptions = useMemo<AnnotationOptions>(
    () => ({ mode: annotationMode, color: annotationColor, unit: distanceUnit }),
    [annotationMode, annotationColor, distanceUnit],
  )

  const handleTransition = (action: TransitionAction) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket.transition(sessionId, action).catch((error: unknown) => {
      console.error(error)
    })
  }

  // ui-feedback (#88, design.md D4): der Sitzungscode wird ueber die Zwischenablage des
  // Browsers kopiert; gelingt das, loest die Anwendung den Toast `Sitzungscode kopiert` aus,
  // scheitert es (auch ohne `navigator.clipboard`, etwa ausserhalb eines sicheren Kontexts),
  // bleibt es ohne Toast und ohne State.
  const handleCopyCode = () => {
    if (state.status !== 'bereit' || state.code === undefined) {
      return
    }
    const code = state.code
    const clipboard = navigator.clipboard
    const writePromise = clipboard
      ? clipboard.writeText(code)
      : Promise.reject(new Error('Zwischenablage nicht verfügbar'))
    writePromise
      .then(() => {
        push(t('toast.codeCopied'))
      })
      .catch((error: unknown) => {
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

  // ui-form (#90, design.md D7): das Formular `Tokens` wartet auf das Acknowledgement -
  // ohne Socket `Promise.resolve(false)`, sonst wird `ack.ok` (bestaetigend/ablehnend)
  // durchgereicht, damit das Panel `Name` nur nach einem bestaetigenden Acknowledgement
  // leert.
  const handleTokenCreate = (input: Omit<CreateTokenInput, 'sessionId'>): Promise<boolean> => {
    const socket = socketRef.current
    if (!socket) {
      return Promise.resolve(false)
    }
    return socket
      .createToken(sessionId, input)
      .then((ack) => {
        setTokenError(ack.ok ? null : ack.message)
        if (ack.ok) {
          push(t('toast.tokenCreated'))
        }
        return ack.ok
      })
      .catch((error: unknown) => {
        console.error(error)
        return false
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
  // deshalb aus `toolRef`, nicht aus der `tool`-Variable dieses Aufrufs.
  const handleFogCellsSelected = (cells: Cell[]) => {
    const currentToolValue = toolRef.current
    if (currentToolValue === 'aufdecken') {
      sendFogSet(true, { kind: 'zellen', cells })
      return
    }
    if (currentToolValue === 'verdecken') {
      sendFogSet(false, { kind: 'zellen', cells })
      return
    }
    if (currentToolValue === 'bereich') {
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

  // add-measure-draw (#11, design.md D5): wird der Canvas-Fassade als `onAnnotationDrawn`
  // beim Erzeugen uebergeben und danach nicht erneut gelesen - Modus/Sichtbarkeit/Farbe und
  // das Raster kommen deshalb aus Refs, nicht aus den Variablen dieses Aufrufs. Bei
  // `kind === 'zeichnung'` ist der Modus immer `frei` und die Farbe kommt aus der Farbwahl,
  // sonst ist die Farbe `null` und der Modus kommt aus der Moduswahl. Bei `gerastert` werden
  // die Punkte vor dem Senden per `snapToCellCenter` eingerastet (der Server rastet ohnehin
  // erneut ein, constitution.md §9.1 - das ist nur die angezeigte Vorschau der Absicht). Der
  // angezeigte Bestand wird NICHT lokal geaendert - das uebernimmt `session:annotations`.
  const handleAnnotationDrawn = (kind: AnnotationKind, points: Point[]) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    const mode: AnnotationMode = kind === 'zeichnung' ? 'frei' : annotationModeRef.current
    const color: AnnotationColor | null = kind === 'zeichnung' ? annotationColorRef.current : null
    const grid = gridRef.current
    const sentPoints = mode === 'gerastert' && grid ? points.map((point) => snapToCellCenter(grid, point)) : points
    socket
      .createAnnotation(sessionId, { kind, mode, visibility: annotationVisibilityRef.current, color, points: sentPoints })
      .then((ack) => {
        setAnnotationError(ack.ok ? null : ack.message)
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  const handleAnnotationDelete = (target: DeleteAnnotationTarget) => {
    const socket = socketRef.current
    if (!socket) {
      return
    }
    socket
      .deleteAnnotation(sessionId, target)
      .then((ack) => {
        setAnnotationError(ack.ok ? null : ack.message)
        if (ack.ok) {
          push(t(target.kind === 'eine' ? 'toast.annotationRemoved' : 'toast.annotationsRemoved'))
        }
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }

  // add-measure-draw (#11, design.md D5): schreibt in `try/catch` - ein gesperrter Speicher
  // bricht die Sitzung nicht, das Umschalten wirkt trotzdem (nur nicht ueber einen Reload
  // hinweg).
  const handleUnitChange = (unit: DistanceUnit) => {
    setDistanceUnit(unit)
    try {
      localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, unit)
    } catch {
      // Blockierter/privater Speicher - die Einstellung gilt trotzdem fuer diese Sitzung.
    }
  }

  // "Hier weiterspielen" (Requirement "Sitzungsoberflaeche"): eine bewusste Handlung des
  // Nutzers, keine Automatik - die Sperren werden zurueckgesetzt, die neue Fassade beginnt
  // ohne Vorgeschichte (design.md D3). Die bisherige Fassade wird zusaetzlich explizit
  // getrennt (Reviewer-Finding #46 Runde 1) - der Server hat sie zwar bereits getrennt
  // (design.md D8, "io server disconnect"), aber keine lebende Fassade mit aktiven Handlern
  // bleibt so in keinem Fall zurueck, bevor die neue erzeugt wird. ui-status (#91, design.md
  // D2): ein etwa noch sichtbares Banner verschwindet mit demselben Klick.
  const handleReconnect = () => {
    replacedRef.current = false
    cancelledRef.current = false
    setReplaced(false)
    setDisconnected(null)
    setState({ status: 'lädt' })

    socketRef.current?.disconnect()

    const socket = createSessionSocket()
    socketRef.current = socket
    wireSocket(socket, () => cancelledRef.current)
  }

  // ui-status (#91, design.md D3/D4): "Zur Übersicht", Esc und die Schaltflaeche `Schließen`
  // des Ersetzt-Dialogs fuehren alle zu `leave`; die Schaltflaeche, Esc/`Schließen` und der
  // Timer des Sitzungsende-Dialogs alle zu `finish`.
  const leave = () => {
    onLeaveRef.current()
  }
  const finish = () => {
    onEndedRef.current()
  }

  // ui-status (#91, design.md D2): das Banner erscheint genau dann, wenn eine Trennung
  // gemeldet wurde und weder `replaced` noch `ended` gilt - nach `replaced`/`ended` uebernimmt
  // der jeweilige Dialog die Anzeige (proposal.md "Solange ersetzt, erscheint kein Banner").
  const banner =
    disconnected !== null && !replaced && !ended ? (
      <StatusBanner>{t(disconnected === 'unterbrochen' ? 'status.disconnected' : 'status.disconnectedByServer')}</StatusBanner>
    ) : null

  let content: ReactNode
  if (state.status === 'lädt') {
    content = <p>Lädt …</p>
  } else if (state.status === 'fehler') {
    content = <p role="alert">{state.message}</p>
  } else {
    // add-fog-of-war (#16, design.md D7): Bild-URL der Kartenansicht - der Spielleiter laedt
    // das Original genau einmal je Karte, ein Spieler bei jeder Fog-Version neu (`MapCanvas`
    // ruft `setImage` nur bei geaenderter URL-Zeichenkette auf).
    const hasImage = state.map?.hasImage ?? false
    const imageUrl = !hasImage
      ? null
      : state.role === 'spielleiter'
        ? sessionMapImageUrl(sessionId, null)
        : sessionMapImageUrl(sessionId, state.fog?.version ?? 0)
    // ui-text (#87, design.md D6): die Zustandspille nach der Zuordnungstabelle aus
    // `session-status.ts` (`ui-start`); kein Textknoten traegt den Rohwert des Zustands.
    const status = SESSION_STATUS_PRESENTATION[state.sessionStatus]
    // ui-status (#91, design.md D5): das Overlay folgt ausschliesslich `state.sessionStatus`
    // (Enter-Acknowledgement, danach `session:status`) - kein eigener State.
    const overlay = SESSION_OVERLAY[state.sessionStatus]

    content = (
      <>
        <h1>{state.name}</h1>
        <p className="session-room-status">
          <span className={status.modifier ? `status-pill ${status.modifier}` : 'status-pill'}>
            <Icon name={status.icon} /> {t(status.label)}
          </span>
        </p>
        {state.code !== undefined && (
          <p>
            Code: {state.code}{' '}
            <button type="button" onClick={handleCopyCode}>
              {t('session.copyCode')}
            </button>
          </p>
        )}
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
                {t(TRANSITION_LABELS[action])}
              </button>
            ))}
          </div>
        )}

        {/* session-map (#50, Requirement "Kartenansicht im Raum"): der Name folgt genau dem
            Text "Aktive Karte: <Name>" bzw. "Keine Karte aktiv" (design.md D7). */}
        {state.map !== null ? <p>{`Aktive Karte: ${state.map.name}`}</p> : <p>{NO_ACTIVE_MAP_MESSAGE}</p>}
        {state.map !== null && (
          // ui-status (#91, design.md D5): die Buehne ersetzt den bisherigen einfachen
          // Container - das Overlay liegt als letztes Kind darueber (Groesse unveraendert).
          <div className="map-stage" style={{ width: '100%', height: MAP_CANVAS_HEIGHT }}>
            <MapCanvas
              imageUrl={imageUrl}
              grid={state.map.grid}
              tokens={state.tokens}
              onTokenMove={handleTokenMove}
              canMoveToken={(token) => canMoveToken(token, { role: state.role, userId: currentUserId })}
              fog={fogLayer}
              tool={tool}
              selection={fogSelection}
              onCellsSelected={handleFogCellsSelected}
              annotations={state.annotations}
              annotationOptions={annotationOptions}
              onAnnotationDrawn={handleAnnotationDrawn}
            />
            {overlay !== undefined && state.role === 'spieler' && (
              <MapOverlay title={t(overlay.title)} subline={t(overlay.subline)} icon={status.icon} />
            )}
          </div>
        )}

        {/* add-token-assignment (#15, design.md D6): fuer jede Rolle, damit auch ein Spieler
            eine abgelehnte eigene Bewegung sieht. add-token-sharing (#62): auch eine
            abgelehnte Freigabe. */}
        {tokenError !== null && <p role="alert">{tokenError}</p>}

        {/* add-fog-of-war (#16, design.md D7, D8): fuer jede Rolle, wie `tokenError`. */}
        {fogError !== null && <p role="alert">{fogError}</p>}

        {/* add-measure-draw (#11, design.md D6): fuer jede Rolle, wie `tokenError`/`fogError`. */}
        {annotationError !== null && <p role="alert">{annotationError}</p>}

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
            tool={tool}
            selectionCount={fogSelection.length}
            onToolChange={setTool}
            onRevealAll={() => sendFogSet(true, { kind: 'alle' })}
            onHideAll={() => sendFogSet(false, { kind: 'alle' })}
            onAreaCreate={handleFogAreaCreate}
            onClearSelection={handleFogClearSelection}
            onAreaToggle={(areaId, revealed) => sendFogSet(revealed, { kind: 'bereich', areaId })}
            onAreaDelete={handleFogAreaDelete}
          />
        )}

        {/* add-measure-draw (#11, design.md D6): jede Rolle, nur bei aktiver Karte. */}
        {state.map !== null && (
          <AnnotationPanel
            annotations={state.annotations}
            grid={state.map.grid}
            participants={state.participants}
            viewer={{ role: state.role, userId: currentUserId }}
            tool={tool}
            mode={annotationMode}
            visibility={annotationVisibility}
            color={annotationColor}
            unit={distanceUnit}
            onToolChange={setTool}
            onModeChange={setAnnotationMode}
            onVisibilityChange={setAnnotationVisibility}
            onColorChange={setAnnotationColor}
            onUnitChange={handleUnitChange}
            onDelete={handleAnnotationDelete}
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
      </>
    )
  }

  // ui-status (#91, design.md D3/D4): treffen `replaced` und `ended` zusammen, zeigt die
  // Ansicht nur den Sitzungsende-Dialog (Requirement "Sitzungsoberflaeche") - ein erneutes
  // Betreten waere sinnlos, die Sitzung ist vorbei.
  const dialogs = (
    <>
      {ended && (
        <Modal role="alertdialog" title={t('session.ended.title')} description={t('session.ended.message')} onClose={finish}>
          <div className="modal-actions">
            <button type="button" className="primary" autoFocus onClick={finish}>
              {t('session.toList')}
            </button>
          </div>
        </Modal>
      )}
      {replaced && !ended && (
        <Modal role="alertdialog" title={t('session.replaced.title')} description={t('session.replaced.message')} onClose={leave}>
          <div className="modal-actions">
            <button type="button" onClick={leave}>
              {t('session.toList')}
            </button>
            <button type="button" className="primary" autoFocus onClick={handleReconnect}>
              {t('session.replaced.continue')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )

  return (
    <div>
      {banner}
      {content}
      {dialogs}
    </div>
  )
}
