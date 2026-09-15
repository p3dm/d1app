import { WebSocket } from 'ws'
import type { RtcIceServerConfig, RtcIceTransportPolicy } from '../../../shared/webrtc.js'
import type { DeviceManager } from '../adb/device-manager.js'
import { log, logError } from '../utils/logger.js'
import {
  describeIceServers,
  selectBrowserViewerIceServers,
  selectNativeHostIceServers,
  type RtcIceServerProvider
} from './ice-servers.js'
import { WebRtcPeerSession } from './webrtc-peer.js'

export type P2PHostOptions = {
  rendezvousUrl: string
  sessionId: string
  sessionSecret: string
  iceTransportPolicy: RtcIceTransportPolicy
  iceServerProvider: RtcIceServerProvider
  udpPort: number
}

type CoordinatorIceConfig = {
  type: 'ice-config'
  iceServers: RtcIceServerConfig[]
  iceTransportPolicy: RtcIceTransportPolicy
  expiresAt?: number
}

export class P2PHostConnector {
  readonly #manager: DeviceManager
  readonly #options: P2PHostOptions
  #socket?: WebSocket
  #peer?: WebRtcPeerSession
  #retry?: NodeJS.Timeout
  #coordinatorIce?: CoordinatorIceConfig
  #pairGeneration = 0
  #stopped = false

  constructor(manager: DeviceManager, options: P2PHostOptions) {
    this.#manager = manager
    this.#options = options
  }

  start(): void {
    this.#stopped = false
    this.#connect()
  }

  #connect(): void {
    if (this.#stopped) return
    log('P2P', `connecting rendezvous ${this.#options.rendezvousUrl}`)
    const socket = new WebSocket(this.#options.rendezvousUrl, { perMessageDeflate: false })
    this.#socket = socket
    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          type: 'register',
          role: 'host',
          sessionId: this.#options.sessionId,
          secret: this.#options.sessionSecret
        })
      )
    })
    socket.on('message', (raw, binary) => {
      if (binary) return
      let message: { type?: string; message?: string } & Partial<CoordinatorIceConfig>
      try {
        message = JSON.parse(raw.toString()) as typeof message
      } catch {
        return
      }
      if (message.type === 'ice-config') {
        const config = parseCoordinatorIceConfig(message)
        if (!config) {
          log('TURN', 'rendezvous returned an invalid ICE configuration')
          return
        }
        this.#coordinatorIce = config
        log(
          'TURN',
          `temporary credentials received; servers=${describeIceServers(config.iceServers)}`
        )
      } else if (message.type === 'registered') {
        log('P2P', `host registered session=${this.#options.sessionId}; waiting for Viewer`)
      } else if (message.type === 'paired') {
        void this.#startPeer(socket)
      } else if (message.type === 'peer-left') {
        this.#pairGeneration += 1
        this.#peer?.close()
        this.#peer = undefined
        log('P2P', 'Viewer disconnected; waiting for another Viewer')
      } else if (message.type === 'error') {
        log('P2P', `rendezvous error: ${message.message ?? 'unknown'}`)
      }
    })
    socket.once('close', (code, reason) => {
      if (this.#socket !== socket) return
      this.#socket = undefined
      this.#pairGeneration += 1
      this.#coordinatorIce = undefined
      this.#peer?.close()
      this.#peer = undefined
      if (!this.#stopped) {
        log('P2P', `rendezvous closed (${code}: ${reason.toString()}); reconnecting`)
        this.#retry = setTimeout(() => this.#connect(), 2_000)
      }
    })
    socket.on('error', (error) => logError('P2P', error))
  }

  async #startPeer(socket: WebSocket): Promise<void> {
    const generation = ++this.#pairGeneration
    try {
      const localIceServers = await this.#options.iceServerProvider.getIceServers()
      if (this.#stopped || this.#socket !== socket || generation !== this.#pairGeneration) return
      const coordinatorIce = this.#coordinatorIce
      const iceServers = coordinatorIce
        ? [...onlyStunServers(localIceServers), ...coordinatorIce.iceServers]
        : localIceServers
      const iceTransportPolicy =
        this.#options.iceTransportPolicy === 'relay'
          ? 'relay'
          : (coordinatorIce?.iceTransportPolicy ?? 'all')
      const nativeHostIceServers = selectNativeHostIceServers(iceServers)
      const browserViewerIceServers = selectBrowserViewerIceServers(iceServers)
      this.#peer?.close()
      this.#peer = new WebRtcPeerSession(socket, this.#manager, {
        iceServers: nativeHostIceServers,
        viewerIceServers: browserViewerIceServers,
        iceTransportPolicy,
        udpPort: this.#options.udpPort
      })
      const hasTurn = iceServers.some((server) =>
        urlsOf(server).some((url) => /^turns?:/i.test(url))
      )
      log(
        'P2P',
        hasTurn
          ? `Viewer paired; mode=${iceTransportPolicy === 'relay' ? 'TURN relay-only' : 'direct + TURN race'}; ` +
              `host=${describeIceServers(nativeHostIceServers)}; viewer=${describeIceServers(browserViewerIceServers)}`
          : 'Viewer paired; no TURN configuration received, direct candidates only'
      )
    } catch (error) {
      logError('TURN', error)
      if (this.#socket === socket) socket.close(1011, 'ICE configuration failed')
    }
  }

  close(): void {
    this.#stopped = true
    this.#pairGeneration += 1
    if (this.#retry) clearTimeout(this.#retry)
    this.#retry = undefined
    this.#peer?.close()
    this.#peer = undefined
    this.#socket?.close(1000, 'Host stopping')
    this.#socket = undefined
  }
}

function urlsOf(config: RtcIceServerConfig): string[] {
  return Array.isArray(config.urls) ? config.urls : [config.urls]
}

function onlyStunServers(configs: RtcIceServerConfig[]): RtcIceServerConfig[] {
  return configs.flatMap((config) => {
    const urls = urlsOf(config).filter((url) => /^stuns?:/i.test(url))
    return urls.length > 0 ? [{ urls }] : []
  })
}

function parseCoordinatorIceConfig(
  message: Partial<CoordinatorIceConfig>
): CoordinatorIceConfig | undefined {
  if (message.type !== 'ice-config' || !Array.isArray(message.iceServers)) return undefined
  if (message.iceTransportPolicy !== 'all' && message.iceTransportPolicy !== 'relay')
    return undefined
  if (message.iceServers.length === 0 || message.iceServers.length > 8) return undefined
  for (const server of message.iceServers) {
    if (!server || typeof server !== 'object') return undefined
    const urls = urlsOf(server)
    if (urls.length === 0 || urls.length > 8 || urls.some((url) => !/^turns?:[^\s]+$/i.test(url)))
      return undefined
    if (typeof server.username !== 'string' || typeof server.credential !== 'string')
      return undefined
  }
  return message as CoordinatorIceConfig
}
