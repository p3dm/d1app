import type { DeviceListMessage } from '../../shared/protocol'
import type { ControlMessage } from '../../shared/protocol'
import {
  parseRtcDeviceChannelLabel,
  type AgentSignalMessage,
  type RtcDeviceChannelKind,
  type RtcIceServerConfig,
  type RtcIceTransportPolicy,
  type RtcSystemClientMessage,
  type ViewerSignalMessage
} from '../../shared/webrtc'

export type ConnectionStatusState = 'idle' | 'busy' | 'ok' | 'error'

export interface WebRtcDeviceEndpoint {
  attachChannel(kind: RtcDeviceChannelKind, channel: RTCDataChannel): void
  setFocusStream(stream?: MediaStream): void
  resetConnection(): void
}

export type WebRtcClientCallbacks = {
  devices: (serials: string[]) => void
  status: (text: string, state: ConnectionStatusState) => void
  log: (text: string) => void
}

export type P2PSignalingOptions = {
  url: string
  sessionId: string
  sessionSecret: string
}

type DeviceChannels = Partial<Record<RtcDeviceChannelKind, RTCDataChannel>>

// Chromium may start connectivity checks as soon as a remote candidate is
// installed.  Keep candidates queued until the local answer (and therefore the
// ICE role/tie-breaker) has been committed.  A short settle window also avoids
// the Chromium/libjuice race where the first check is emitted with an
// uninitialised ICE-CONTROLLED tie-breaker.
const ICE_ROLE_SETTLE_DELAY_MS = 250
const MAX_PENDING_REMOTE_CANDIDATES = 256

export class WebRtcClient {
  readonly #callbacks: WebRtcClientCallbacks
  readonly #p2p?: P2PSignalingOptions
  readonly #endpoints = new Map<string, WebRtcDeviceEndpoint>()
  readonly #deviceChannels = new Map<string, DeviceChannels>()
  readonly #pendingRemoteCandidates: RTCIceCandidateInit[] = []
  readonly #pendingRemoteCandidateKeys = new Set<string>()
  #signal?: WebSocket
  #peer?: RTCPeerConnection
  #system?: RTCDataChannel
  #remoteDescriptionSet = false
  #stopped = false
  #reconnectTimer?: number
  #disconnectTimer?: number
  #signalWork: Promise<void> = Promise.resolve()
  #selectedSerial?: string
  #focusStream?: MediaStream

  constructor(callbacks: WebRtcClientCallbacks, p2p?: P2PSignalingOptions) {
    this.#callbacks = callbacks
    this.#p2p = p2p
  }

  connect(): void {
    this.#stopped = false
    this.#openSignaling()
  }

  registerDevice(serial: string, endpoint: WebRtcDeviceEndpoint): void {
    this.#endpoints.set(serial, endpoint)
    const channels = this.#deviceChannels.get(serial)
    if (channels) {
      for (const [kind, channel] of Object.entries(channels) as Array<
        [RtcDeviceChannelKind, RTCDataChannel]
      >) {
        endpoint.attachChannel(kind, channel)
      }
    }
    if (this.#selectedSerial === serial && this.#focusStream) {
      endpoint.setFocusStream(this.#focusStream)
    }
    this.#sendSystem({ type: 'subscribe', serial })
  }

  unregisterDevice(serial: string, endpoint: WebRtcDeviceEndpoint): void {
    if (this.#endpoints.get(serial) !== endpoint) return
    // React replaces the thumbnail endpoint with the inspector endpoint when a
    // device is focused. Keep the selection and its channels alive during that
    // hand-off; the incoming inspector endpoint will immediately reattach them.
    if (this.#selectedSerial === serial) {
      this.#endpoints.delete(serial)
      return
    }

    this.#sendSystem({ type: 'unsubscribe', serial })
    this.#endpoints.delete(serial)
    const channels = this.#deviceChannels.get(serial)
    this.#deviceChannels.delete(serial)
    if (channels) {
      for (const channel of Object.values(channels)) channel?.close()
    }
  }

  sendControl(serial: string, message: ControlMessage): void {
    const channel = this.#deviceChannels.get(serial)?.control
    if (channel?.readyState === 'open') channel.send(JSON.stringify(message))
  }

  selectDevice(serial: string): void {
    if (this.#selectedSerial === serial) return
    if (this.#selectedSerial && this.#selectedSerial !== serial) {
      this.#endpoints.get(this.#selectedSerial)?.setFocusStream(undefined)
    }
    this.#selectedSerial = serial
    if (this.#focusStream) this.#endpoints.get(serial)?.setFocusStream(this.#focusStream)
    this.#sendSystem({ type: 'select-device', serial })
  }

  clearSelection(serial: string): void {
    if (this.#selectedSerial === serial) {
      this.#endpoints.get(serial)?.setFocusStream(undefined)
      this.#selectedSerial = undefined
    }
    this.#sendSystem({ type: 'clear-selection', serial })
  }

  close(): void {
    this.#stopped = true
    window.clearTimeout(this.#reconnectTimer)
    window.clearTimeout(this.#disconnectTimer)
    const signal = this.#signal
    this.#signal = undefined
    signal?.close(1000, 'Page closed')
    this.#resetPeer()
  }

  #openSignaling(): void {
    if (this.#stopped) return
    const url = this.#p2p ? new URL(this.#p2p.url) : new URL(location.href)
    if (!this.#p2p) {
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.pathname = '/signal'
      url.search = ''
      url.hash = ''
    }
    const socket = new WebSocket(url)
    this.#signal = socket
    this.#callbacks.status('Đang kết nối signaling…', 'busy')
    socket.addEventListener('open', () => {
      if (this.#p2p) {
        socket.send(
          JSON.stringify({
            type: 'register',
            role: 'viewer',
            sessionId: this.#p2p.sessionId,
            secret: this.#p2p.sessionSecret
          })
        )
      } else {
        const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
        this.#sendSignal({ type: 'auth', token })
      }
      this.#callbacks.log(`[SIGNAL] connected ${url}`)
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      this.#signalWork = this.#signalWork
        .then(() => this.#handleSignal(event.data as string))
        .catch((error) => this.#fail(error))
    })
    socket.addEventListener('close', (event) => {
      if (this.#signal !== socket) return
      this.#callbacks.log(`[SIGNAL] closed code=${event.code} reason=${event.reason || 'none'}`)
      this.#signal = undefined
      this.#resetPeer()
      const status =
        event.code === 4401 || event.code === 4403
          ? 'Mã kết nối không hợp lệ'
          : `Mất signaling (${event.code}: ${event.reason || 'không có lý do'}), đang thử lại…`
      this.#callbacks.status(status, 'error')
      this.#scheduleReconnect()
    })
    socket.addEventListener('error', () => {
      this.#callbacks.log(`[SIGNAL ERROR] url=${url.toString()} readyState=${socket.readyState}`)
      this.#callbacks.status(`Không kết nối được signaling: ${url.host}`, 'error')
    })
  }

  async #handleSignal(raw: string): Promise<void> {
    let message: AgentSignalMessage
    try {
      message = JSON.parse(raw) as AgentSignalMessage
    } catch {
      return
    }
    if ((message as { type?: string }).type === 'registered') {
      this.#callbacks.status('Đã đăng ký, đang chờ Host…', 'busy')
      return
    }
    if ((message as { type?: string }).type === 'paired') {
      this.#callbacks.status('Đã tìm thấy Host, đang tạo tunnel WebRTC…', 'busy')
      return
    }
    if ((message as { type?: string }).type === 'peer-left') {
      this.#callbacks.status('Host đã ngắt kết nối', 'error')
      this.#resetPeer()
      return
    }
    if (message.type === 'rtc-config') {
      if (!this.#peer) this.#createPeer(message.iceServers, message.iceTransportPolicy)
      return
    }
    if (message.type === 'offer') {
      const peer = this.#peer
      if (!peer || typeof message.sdp !== 'string') return
      this.#remoteDescriptionSet = false
      await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      if (this.#peer !== peer || this.#stopped) return
      const sdp = peer.localDescription?.sdp
      if (sdp) this.#sendSignal({ type: 'answer', sdp })

      await delay(ICE_ROLE_SETTLE_DELAY_MS)
      if (this.#peer !== peer || this.#stopped) return
      this.#remoteDescriptionSet = true
      const pending = this.#pendingRemoteCandidates.splice(0)
      this.#callbacks.log(
        `[RTC] local answer committed; applying ${pending.length} queued candidate(s)`
      )
      for (const candidate of pending) {
        if (this.#peer !== peer || this.#stopped) return
        await this.#addRemoteCandidate(peer, candidate)
      }
      return
    }
    if (message.type === 'ice-candidate') {
      if (typeof message.candidate !== 'string' || typeof message.sdpMid !== 'string') return
      const candidate = { candidate: message.candidate, sdpMid: message.sdpMid }
      this.#callbacks.log(`[RTC] remote candidate ${describeCandidate(message.candidate)}`)
      const key = candidateKey(candidate)
      if (this.#peer && this.#remoteDescriptionSet) {
        await this.#addRemoteCandidate(this.#peer, candidate)
      } else if (!this.#pendingRemoteCandidateKeys.has(key)) {
        if (this.#pendingRemoteCandidates.length >= MAX_PENDING_REMOTE_CANDIDATES) {
          this.#callbacks.log('[RTC] ignored remote candidate because the pre-answer queue is full')
          return
        }
        this.#pendingRemoteCandidateKeys.add(key)
        this.#pendingRemoteCandidates.push(candidate)
      }
      return
    }
    if (message.type === 'error') {
      this.#callbacks.status(message.message, 'error')
      this.#callbacks.log(`[RTC ERROR] ${message.code}: ${message.message}`)
    }
  }

  async #addRemoteCandidate(
    peer: RTCPeerConnection,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    try {
      await peer.addIceCandidate(candidate)
    } catch (error) {
      // A stale or unsupported candidate must not tear down an otherwise valid
      // TURN/direct candidate pair.
      this.#callbacks.log(
        `[RTC] ignored remote candidate ${describeCandidate(candidate.candidate ?? '')} ` +
          `because addIceCandidate failed: ${String(error)}`
      )
    }
  }

  #createPeer(iceServers: RtcIceServerConfig[], iceTransportPolicy: RtcIceTransportPolicy): void {
    const peer = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy
    })
    this.#peer = peer
    this.#callbacks.log(
      `[RTC] negotiation profile=answer-before-candidates-v2 settle=${ICE_ROLE_SETTLE_DELAY_MS}ms`
    )
    const mode = iceTransportPolicy === 'relay' ? 'TURN relay' : 'direct-first, TURN fallback'
    this.#callbacks.status(`Đang thiết lập tunnel (${mode})…`, 'busy')
    peer.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return
      this.#callbacks.log(`[RTC] local candidate ${describeCandidate(event.candidate.candidate)}`)
      this.#sendSignal({
        type: 'ice-candidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? '0'
      })
    })
    peer.addEventListener('icegatheringstatechange', () => {
      this.#callbacks.log(`[RTC] gathering state=${peer.iceGatheringState}`)
    })
    peer.addEventListener('icecandidateerror', (event) => {
      this.#callbacks.log(
        `[RTC] STUN error code=${event.errorCode} url=${event.url || 'unknown'} ` +
          `detail=${event.errorText || 'unknown'}`
      )
    })
    peer.addEventListener('iceconnectionstatechange', () => {
      this.#callbacks.log(`[RTC] ICE state=${peer.iceConnectionState}`)
    })
    peer.addEventListener('datachannel', (event) => this.#handleDataChannel(event.channel))
    peer.addEventListener('track', (event) => {
      if (
        event.track.kind !== 'video' ||
        (event.transceiver.mid !== 'focus' && event.track.id !== 'android-focus-video')
      )
        return
      this.#focusStream = event.streams[0] ?? new MediaStream([event.track])
      if (this.#selectedSerial)
        this.#endpoints.get(this.#selectedSerial)?.setFocusStream(this.#focusStream)
      this.#callbacks.log('[RTC] dedicated Focus H264 media track received')
    })
    peer.addEventListener('connectionstatechange', () => {
      if (this.#peer !== peer) return
      const state = peer.connectionState
      this.#callbacks.log(`[RTC] peer state=${state}`)
      if (state === 'connected') {
        window.clearTimeout(this.#disconnectTimer)
        this.#callbacks.status(`Tunnel ${mode} đã kết nối`, 'ok')
        void this.#reportSelectedCandidatePair(peer)
      } else if (state === 'disconnected') {
        this.#callbacks.status('Tunnel tạm mất kết nối…', 'busy')
        window.clearTimeout(this.#disconnectTimer)
        this.#disconnectTimer = window.setTimeout(() => this.#restart(), 12_000)
      } else if (state === 'failed' || state === 'closed') {
        if (state === 'failed') {
          this.#callbacks.status('ICE thất bại: không tạo được cả direct lẫn TURN', 'error')
          this.#callbacks.log(
            '[RTC] ICE failed; check TURN credentials, firewall and relay port range'
          )
        }
        this.#restart()
      }
    })
  }

  async #reportSelectedCandidatePair(peer: RTCPeerConnection): Promise<void> {
    try {
      const stats = await peer.getStats()
      if (this.#peer !== peer) return
      let selected:
        | (RTCStats & {
            localCandidateId: string
            remoteCandidateId: string
          })
        | undefined
      for (const report of stats.values()) {
        if (
          report.type === 'candidate-pair' &&
          report.state === 'succeeded' &&
          (report.nominated || report.selected)
        ) {
          selected = report as typeof selected
          break
        }
      }
      if (!selected) return
      const local = stats.get(selected.localCandidateId)
      const remote = stats.get(selected.remoteCandidateId)
      const relay = local?.candidateType === 'relay' || remote?.candidateType === 'relay'
      const route = relay ? 'TURN relay' : 'direct'
      this.#callbacks.log(
        `[RTC] selected ${local?.candidateType ?? '?'}/${local?.protocol ?? '?'} -> ` +
          `${remote?.candidateType ?? '?'}/${remote?.protocol ?? '?'} (${route})`
      )
      this.#callbacks.status(`Tunnel ${route} đã kết nối`, 'ok')
    } catch (error) {
      this.#callbacks.log(`[RTC] không đọc được candidate pair: ${String(error)}`)
    }
  }

  #handleDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    this.#callbacks.log(`[RTC] incoming DataChannel label=${channel.label}`)
    if (channel.label === 'system') {
      this.#system = channel
      channel.addEventListener('open', () => {
        if (this.#system !== channel) return
        this.#callbacks.log('[RTC] system DataChannel open')
        for (const serial of this.#endpoints.keys()) this.#sendSystem({ type: 'subscribe', serial })
        if (this.#selectedSerial)
          this.#sendSystem({ type: 'select-device', serial: this.#selectedSerial })
      })
      channel.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        let message: DeviceListMessage | { type: 'focus-media'; serial: string | null }
        try {
          message = JSON.parse(event.data) as typeof message
        } catch {
          return
        }
        if (message.type === 'devices' && Array.isArray(message.devices)) {
          this.#callbacks.log(`[RTC] device list received count=${message.devices.length}`)
          this.#callbacks.devices(
            message.devices.filter((serial): serial is string => typeof serial === 'string')
          )
        } else if (message.type === 'focus-media') {
          if (this.#selectedSerial)
            this.#endpoints.get(this.#selectedSerial)?.setFocusStream(undefined)
          if (typeof message.serial === 'string') {
            this.#selectedSerial = message.serial
            if (this.#focusStream)
              this.#endpoints.get(message.serial)?.setFocusStream(this.#focusStream)
          }
        }
      })
      return
    }

    const parsed = parseRtcDeviceChannelLabel(channel.label)
    if (!parsed) {
      channel.close()
      return
    }
    let channels = this.#deviceChannels.get(parsed.serial)
    if (!channels) {
      channels = {}
      this.#deviceChannels.set(parsed.serial, channels)
    }
    channels[parsed.kind]?.close()
    channels[parsed.kind] = channel
    this.#endpoints.get(parsed.serial)?.attachChannel(parsed.kind, channel)
    channel.addEventListener('close', () => {
      const current = this.#deviceChannels.get(parsed.serial)
      if (current?.[parsed.kind] === channel) delete current[parsed.kind]
    })
  }

  #sendSystem(message: RtcSystemClientMessage): void {
    if (this.#system?.readyState === 'open') this.#system.send(JSON.stringify(message))
  }

  #sendSignal(message: ViewerSignalMessage): void {
    if (this.#signal?.readyState === WebSocket.OPEN) this.#signal.send(JSON.stringify(message))
  }

  #restart(): void {
    if (this.#stopped) return
    const signal = this.#signal
    this.#signal = undefined
    signal?.close(4012, 'Restart WebRTC')
    this.#resetPeer()
    this.#scheduleReconnect()
  }

  #resetPeer(): void {
    window.clearTimeout(this.#disconnectTimer)
    this.#disconnectTimer = undefined
    const peer = this.#peer
    this.#peer = undefined
    this.#system = undefined
    this.#remoteDescriptionSet = false
    this.#pendingRemoteCandidates.length = 0
    this.#pendingRemoteCandidateKeys.clear()
    this.#deviceChannels.clear()
    this.#focusStream = undefined
    for (const endpoint of this.#endpoints.values()) {
      endpoint.setFocusStream(undefined)
      endpoint.resetConnection()
    }
    peer?.close()
  }

  #scheduleReconnect(): void {
    if (this.#stopped || this.#reconnectTimer !== undefined) return
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = undefined
      this.#openSignaling()
    }, 2_000)
  }

  #fail(error: unknown): void {
    this.#callbacks.log(
      `[RTC ERROR] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
    )
    this.#callbacks.status('Thiết lập WebRTC thất bại', 'error')
    this.#restart()
  }
}

function candidateKey(candidate: RTCIceCandidateInit): string {
  return `${candidate.sdpMid ?? ''}\n${candidate.candidate ?? ''}`
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function describeCandidate(candidate: string): string {
  const fields = candidate
    .trim()
    .replace(/^a=candidate:/i, '')
    .replace(/^candidate:/i, '')
    .split(/\s+/)
  const typeIndex = fields.findIndex((field) => field.toLowerCase() === 'typ')
  const type = typeIndex >= 0 ? (fields[typeIndex + 1] ?? 'unknown') : 'unknown'
  return (
    `type=${type} protocol=${fields[2]?.toLowerCase() ?? 'unknown'} ` +
    `endpoint=${fields[4] ?? '?'}:${fields[5] ?? '?'}`
  )
}
