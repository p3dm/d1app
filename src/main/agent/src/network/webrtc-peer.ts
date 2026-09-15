import { randomUUID } from 'node:crypto'
import {
  H264RtpPacketizer,
  PeerConnection,
  RtcpNackResponder,
  RtcpSrReporter,
  RtpPacketizationConfig,
  Video,
  type DataChannel,
  type DescriptionType,
  type Track
} from 'node-datachannel'
import { WebSocket } from 'ws'
import {
  VIDEO_FLAG_KEYFRAME,
  VIDEO_HEADER_BYTES,
  parseControlMessage,
  type DeviceListMessage
} from '../../../shared/protocol.js'
import {
  chunkRtcVideoFrame,
  rtcDeviceChannelLabel,
  type AgentSignalMessage,
  type RtcIceServerConfig,
  type RtcIceTransportPolicy,
  type RtcSystemClientMessage,
  type ViewerSignalMessage
} from '../../../shared/webrtc.js'
import type { DeviceManager } from '../adb/device-manager.js'
import type { DeviceSession, ViewerConnection } from '../device/device-session.js'
import { log, logError } from '../utils/logger.js'
import { toNativeIceServers } from './ice-servers.js'
import type { ViewerTransport } from './protocol.js'

const MAX_SIGNAL_SDP_BYTES = 1_048_576
const MAX_SIGNAL_CANDIDATE_BYTES = 16_384
const ICE_ROLE_SETTLE_DELAY_MS = 250
const MAX_PENDING_REMOTE_CANDIDATES = 256

export type WebRtcPeerSessionOptions = {
  iceServers: RtcIceServerConfig[]
  viewerIceServers: RtcIceServerConfig[]
  iceTransportPolicy: RtcIceTransportPolicy
  udpPort: number
}

class WebRtcViewerTransport implements ViewerTransport {
  #frameId = 0
  #videoEnabled = true

  constructor(
    readonly control: DataChannel,
    readonly keyVideo: DataChannel,
    readonly deltaVideo: DataChannel,
    readonly onClose: () => void
  ) {}

  sendJson(data: unknown): void {
    if (this.control.isOpen()) this.control.sendMessage(JSON.stringify(data))
  }

  sendBinary(data: Uint8Array): void {
    if (!this.#videoEnabled) return
    const keyframe = data.byteLength > 1 && (data[1]! & VIDEO_FLAG_KEYFRAME) !== 0
    const channel = keyframe ? this.keyVideo : this.deltaVideo
    if (!channel.isOpen()) return
    const frameId = this.#frameId
    this.#frameId = (this.#frameId + 1) >>> 0
    for (const chunk of chunkRtcVideoFrame(data, frameId)) {
      if (!channel.isOpen() || !channel.sendMessageBinary(chunk)) break
    }
  }

  getBufferedAmount(): number {
    return Math.max(this.keyVideo.bufferedAmount(), this.deltaVideo.bufferedAmount())
  }

  close(): void {
    this.onClose()
  }

  setVideoEnabled(enabled: boolean): void {
    this.#videoEnabled = enabled
  }
}

class FocusRtpTransport implements ViewerTransport {
  constructor(
    readonly track: Track,
    readonly rtpConfig: RtpPacketizationConfig
  ) {}

  sendJson(): void {}

  sendBinary(data: Uint8Array): void {
    if (!this.track.isOpen() || data.byteLength <= VIDEO_HEADER_BYTES) return
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const ptsUs = view.getBigUint64(2, false)
    this.rtpConfig.timestamp = Number(((ptsUs * 90n) / 1_000n) & 0xffff_ffffn)
    this.track.sendMessageBinary(Buffer.from(data.subarray(VIDEO_HEADER_BYTES)))
  }

  getBufferedAmount(): number {
    // node-datachannel 0.33.1 declares Track.bufferedAmount() in TypeScript,
    // but the Windows native Track wrapper doesn't expose it at runtime.
    // RTP has its own pacing/congestion pipeline, so no SCTP queue applies.
    const runtimeTrack = this.track as unknown as { bufferedAmount?: () => number }
    return typeof runtimeTrack.bufferedAmount === 'function' ? runtimeTrack.bufferedAmount() : 0
  }

  close(): void {}
}

class RtcDevicePeer {
  readonly #serial: string
  readonly #session: DeviceSession
  readonly #control: DataChannel
  readonly #keyVideo: DataChannel
  readonly #deltaVideo: DataChannel
  readonly #transport: WebRtcViewerTransport
  readonly #openChannels = new Set<DataChannel>()
  #viewer?: ViewerConnection
  #startPromise?: Promise<void>
  #closed = false
  #controlEnabled = false

  constructor(serial: string, session: DeviceSession, peer: PeerConnection) {
    this.#serial = serial
    this.#session = session
    this.#control = peer.createDataChannel(rtcDeviceChannelLabel('control', serial))
    this.#keyVideo = peer.createDataChannel(rtcDeviceChannelLabel('key', serial), {
      unordered: true,
      maxPacketLifeTime: 500
    })
    this.#deltaVideo = peer.createDataChannel(rtcDeviceChannelLabel('video', serial), {
      unordered: true,
      // Recover brief packet loss, but don't let stale delta frames block the
      // live screen for more than a fraction of a second.
      maxPacketLifeTime: 80
    })
    this.#transport = new WebRtcViewerTransport(
      this.#control,
      this.#keyVideo,
      this.#deltaVideo,
      () => this.close()
    )

    for (const channel of [this.#control, this.#keyVideo, this.#deltaVideo]) {
      channel.onOpen(() => {
        this.#openChannels.add(channel)
        this.#tryStart()
      })
      channel.onClosed(() => this.close())
      channel.onError((error) => {
        log('RTC', `${serial} channel=${channel.getLabel()} error=${error}`)
        this.close()
      })
    }
    this.#control.onMessage((raw) => this.#handleControl(raw))
  }

  #tryStart(): void {
    if (this.#closed || this.#viewer || this.#startPromise || this.#openChannels.size !== 3) return
    this.#startPromise = this.#session
      .start()
      .then(() => {
        if (this.#closed) return
        this.#viewer = this.#session.addViewer(this.#transport)
        this.#transport.sendJson({ type: 'control-state', enabled: this.#controlEnabled })
        log('RTC', `${this.#serial} WebRTC viewer attached`)
      })
      .catch((error) => {
        logError('RTC', error)
        this.#transport.sendJson({
          type: 'error',
          code: 'SESSION_START_FAILED',
          message: error instanceof Error ? error.message : String(error)
        })
        this.close()
      })
      .finally(() => {
        this.#startPromise = undefined
      })
  }

  #handleControl(raw: string | Buffer | ArrayBuffer): void {
    if (this.#closed || typeof raw !== 'string') return
    try {
      const message = parseControlMessage(JSON.parse(raw))
      if (!message) {
        this.#transport.sendJson({
          type: 'error',
          code: 'INVALID_CONTROL',
          message: 'Invalid control message'
        })
        return
      }
      // A grid Viewer must be able to recover its decoder before it is
      // selected for control. All input messages remain selection-gated.
      if (message.type !== 'request-keyframe' && !this.#controlEnabled) return
      this.#session.handleControl(message, this.#transport)
    } catch {
      this.#transport.sendJson({
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Control message must be JSON'
      })
    }
  }

  setControlEnabled(enabled: boolean): void {
    if (this.#closed || this.#controlEnabled === enabled) return
    this.#controlEnabled = enabled
    this.#transport.setVideoEnabled(!enabled)
    this.#session.setQuality(enabled ? 'focus' : 'grid')
    this.#transport.sendJson({ type: 'control-state', enabled })
    log('RTC', `${this.#serial} control=${enabled ? 'enabled' : 'disabled'}`)
  }

  prepareFocus(): void {
    if (this.#closed) return
    this.#transport.setVideoEnabled(false)
    this.#session.setQuality('focus')
    this.#transport.sendJson({ type: 'control-state', enabled: false })
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    if (this.#viewer) this.#session.removeViewer(this.#viewer)
    this.#viewer = undefined
    for (const channel of [this.#control, this.#keyVideo, this.#deltaVideo]) {
      if (channel.isOpen()) channel.close()
    }
  }
}

export class WebRtcPeerSession {
  readonly #socket: WebSocket
  readonly #manager: DeviceManager
  readonly #peer: PeerConnection
  readonly #system: DataChannel
  readonly #focusTrack: Track
  readonly #focusTransport: FocusRtpTransport
  readonly #devicePeers = new Map<string, RtcDevicePeer>()
  readonly #remoteCandidates: Array<{ candidate: string; sdpMid: string }> = []
  readonly #remoteCandidateKeys = new Set<string>()
  readonly #unsubscribeDevices: () => void
  #serials: string[] = []
  #remoteDescriptionSet = false
  #remoteCandidateFlushTimer?: NodeJS.Timeout
  #answerReceived = false
  #systemOpen = false
  #disconnectTimer?: NodeJS.Timeout
  #closed = false
  #selectedSerial?: string
  #focusViewer?: ViewerConnection
  #focusSession?: DeviceSession

  constructor(socket: WebSocket, manager: DeviceManager, options: WebRtcPeerSessionOptions) {
    this.#socket = socket
    this.#manager = manager
    this.#send({
      type: 'rtc-config',
      iceServers: options.viewerIceServers,
      iceTransportPolicy: options.iceTransportPolicy
    })

    this.#peer = new PeerConnection(`viewer-${randomUUID()}`, {
      iceServers: toNativeIceServers(options.iceServers),
      iceTransportPolicy: options.iceTransportPolicy,
      ...(options.iceTransportPolicy === 'all'
        ? {
            enableIceUdpMux: true,
            portRangeBegin: options.udpPort,
            portRangeEnd: options.udpPort
          }
        : {})
    })
    log(
      'RTC',
      `negotiation profile=answer-before-candidates-v2 settle=${ICE_ROLE_SETTLE_DELAY_MS}ms`
    )
    this.#peer.onLocalDescription((sdp, type) => {
      if (type === 'offer') this.#send({ type: 'offer', sdp })
    })
    this.#peer.onLocalCandidate((candidate, sdpMid) => {
      log('RTC', `local candidate ${describeCandidate(candidate)} mid=${sdpMid}`)
      this.#send({ type: 'ice-candidate', candidate, sdpMid })
    })
    this.#peer.onStateChange((state) => this.#handlePeerState(state))

    const focusSsrc = (Math.random() * 0xffff_ffff) >>> 0
    const focusVideo = new Video('focus', 'SendOnly')
    focusVideo.addH264Codec(96, '42e01f')
    focusVideo.addSSRC(focusSsrc, 'android-focus', 'android-focus', 'android-focus-video')
    focusVideo.setBitrate(1_500_000)
    this.#focusTrack = this.#peer.addTrack(focusVideo)
    const rtpConfig = new RtpPacketizationConfig(focusSsrc, 'android-focus', 96, 90_000)
    const packetizer = new H264RtpPacketizer('StartSequence', rtpConfig, 1_200)
    const senderReport = new RtcpSrReporter(rtpConfig)
    packetizer.addToChain(senderReport)
    senderReport.addToChain(new RtcpNackResponder(256))
    this.#focusTrack.setMediaHandler(packetizer)
    this.#focusTrack.onOpen(() => log('RTC', 'focus H264 RTP track open'))
    this.#focusTrack.onError((error) => log('RTC', `focus RTP error=${error}`))
    this.#focusTransport = new FocusRtpTransport(this.#focusTrack, rtpConfig)

    this.#system = this.#peer.createDataChannel('system')
    this.#system.onOpen(() => {
      this.#systemOpen = true
      this.#sendDeviceList()
      log('RTC', 'system DataChannel open')
    })
    this.#system.onMessage((raw) => this.#handleSystemMessage(raw))
    this.#system.onClosed(() => this.close())
    this.#system.onError((error) => {
      log('RTC', `system channel error=${error}`)
      this.close()
    })

    this.#unsubscribeDevices = manager.subscribeDevices((serials) => {
      this.#serials = serials
      const available = new Set(serials)
      for (const [serial, peer] of this.#devicePeers) {
        if (available.has(serial)) continue
        if (this.#selectedSerial === serial) this.#selectedSerial = undefined
        peer.close()
        this.#devicePeers.delete(serial)
      }
      this.#sendDeviceList()
    })

    socket.on('message', (raw, isBinary) => {
      if (!isBinary) this.#handleSignal(raw.toString())
    })
    socket.once('close', () => this.close())
    socket.on('error', (error) => logError('SIGNAL', error))
  }

  #handleSignal(raw: string): void {
    let message: ViewerSignalMessage
    try {
      message = JSON.parse(raw) as ViewerSignalMessage
    } catch {
      return
    }
    if (message.type === 'answer') {
      if (typeof message.sdp !== 'string' || message.sdp.length > MAX_SIGNAL_SDP_BYTES) return
      if (this.#answerReceived) {
        log('RTC', 'ignored duplicate remote answer')
        return
      }
      this.#answerReceived = true
      try {
        this.#peer.setRemoteDescription(message.sdp, 'answer' as DescriptionType)
      } catch (error) {
        logError('RTC', error)
        this.#socket.close(1011, 'Invalid WebRTC answer')
        return
      }
      // libjuice is synchronous, but delaying trickled candidates briefly keeps
      // connectivity checks out of the SDP/ICE role transition window.
      this.#remoteCandidateFlushTimer = setTimeout(
        () => this.#flushRemoteCandidates(),
        ICE_ROLE_SETTLE_DELAY_MS
      )
      return
    }
    if (message.type === 'ice-candidate') {
      if (
        typeof message.candidate !== 'string' ||
        message.candidate.length > MAX_SIGNAL_CANDIDATE_BYTES ||
        typeof message.sdpMid !== 'string' ||
        message.sdpMid.length > 256
      )
        return
      log('RTC', `remote candidate ${describeCandidate(message.candidate)} mid=${message.sdpMid}`)
      const key = candidateKey(message)
      if (this.#remoteCandidateKeys.has(key)) return
      if (
        !this.#remoteDescriptionSet &&
        this.#remoteCandidates.length >= MAX_PENDING_REMOTE_CANDIDATES
      ) {
        log('RTC', 'ignored remote candidate because the pre-answer queue is full')
        return
      }
      this.#remoteCandidateKeys.add(key)
      if (this.#remoteDescriptionSet) this.#addRemoteCandidate(message)
      else this.#remoteCandidates.push(message)
    }
  }

  #flushRemoteCandidates(): void {
    this.#remoteCandidateFlushTimer = undefined
    if (this.#closed) return
    this.#remoteDescriptionSet = true
    const pending = this.#remoteCandidates.splice(0)
    log('RTC', `remote answer settled; applying ${pending.length} queued candidate(s)`)
    for (const candidate of pending) this.#addRemoteCandidate(candidate)
  }

  #addRemoteCandidate(candidate: { candidate: string; sdpMid: string }): void {
    try {
      this.#peer.addRemoteCandidate(candidate.candidate, candidate.sdpMid)
    } catch (error) {
      // One malformed/unsupported candidate should not discard every other
      // direct and TURN route collected for this session.
      log(
        'RTC',
        `ignored remote candidate ${describeCandidate(candidate.candidate)}: ${String(error)}`
      )
    }
  }

  #handleSystemMessage(raw: string | Buffer | ArrayBuffer): void {
    if (typeof raw !== 'string') return
    let message: RtcSystemClientMessage
    try {
      message = JSON.parse(raw) as RtcSystemClientMessage
    } catch {
      return
    }
    if (typeof message.serial !== 'string' || message.serial.length > 256) return
    if (message.type === 'unsubscribe') {
      if (this.#selectedSerial === message.serial) this.#clearSelection()
      this.#devicePeers.get(message.serial)?.close()
      this.#devicePeers.delete(message.serial)
      return
    }
    if (message.type === 'select-device') {
      const peer = this.#devicePeers.get(message.serial)
      if (!peer) return
      if (this.#selectedSerial && this.#selectedSerial !== message.serial) {
        this.#devicePeers.get(this.#selectedSerial)?.setControlEnabled(false)
      }
      this.#selectedSerial = message.serial
      peer.prepareFocus()
      this.#attachFocusSession(message.serial)
      return
    }
    if (message.type === 'clear-selection') {
      if (this.#selectedSerial === message.serial) this.#clearSelection()
      return
    }
    if (message.type !== 'subscribe' || this.#devicePeers.has(message.serial)) return
    const session = this.#manager.getSession(message.serial)
    if (!session) {
      this.#system.sendMessage(
        JSON.stringify({
          type: 'error',
          code: 'DEVICE_NOT_FOUND',
          message: `Device ${message.serial} not found`
        })
      )
      return
    }
    this.#devicePeers.set(message.serial, new RtcDevicePeer(message.serial, session, this.#peer))
  }

  #clearSelection(): void {
    if (!this.#selectedSerial) return
    this.#detachFocusSession()
    this.#devicePeers.get(this.#selectedSerial)?.setControlEnabled(false)
    this.#selectedSerial = undefined
    if (this.#system.isOpen())
      this.#system.sendMessage(JSON.stringify({ type: 'focus-media', serial: null }))
  }

  #attachFocusSession(serial: string): void {
    this.#detachFocusSession()
    const session = this.#manager.getSession(serial)
    if (!session) return
    this.#focusSession = session
    void session
      .waitForQuality('focus')
      .then(() => {
        if (this.#closed || this.#selectedSerial !== serial || this.#focusSession !== session)
          return
        this.#focusViewer = session.addViewer(this.#focusTransport)
        this.#devicePeers.get(serial)?.setControlEnabled(true)
        if (this.#system.isOpen())
          this.#system.sendMessage(JSON.stringify({ type: 'focus-media', serial }))
        log('RTC', `${serial} attached to dedicated H264 RTP track`)
      })
      .catch((error) => logError('RTC', error))
  }

  #detachFocusSession(): void {
    if (this.#focusViewer && this.#focusSession) this.#focusSession.removeViewer(this.#focusViewer)
    this.#focusViewer = undefined
    this.#focusSession = undefined
  }

  #sendDeviceList(): void {
    if (!this.#systemOpen || !this.#system.isOpen()) return
    const message: DeviceListMessage = { type: 'devices', devices: this.#serials }
    this.#system.sendMessage(JSON.stringify(message))
  }

  #handlePeerState(state: string): void {
    log('RTC', `peer state=${state}`)
    if (state === 'connected') {
      if (this.#disconnectTimer) clearTimeout(this.#disconnectTimer)
      const selected = this.#peer.getSelectedCandidatePair()
      if (selected) {
        const route =
          selected.local.type === 'relay' || selected.remote.type === 'relay'
            ? 'TURN relay'
            : 'direct'
        log(
          'RTC',
          `selected ${selected.local.type}/${selected.local.transportType} -> ` +
            `${selected.remote.type}/${selected.remote.transportType} (${route})`
        )
      }
      return
    }
    if (state === 'disconnected') {
      if (this.#disconnectTimer) clearTimeout(this.#disconnectTimer)
      this.#disconnectTimer = setTimeout(
        () => this.#socket.close(1011, 'WebRTC disconnected'),
        12_000
      )
      return
    }
    if (state === 'failed' || state === 'closed') this.#socket.close(1011, `WebRTC ${state}`)
  }

  #send(message: AgentSignalMessage): void {
    if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message))
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    if (this.#disconnectTimer) clearTimeout(this.#disconnectTimer)
    if (this.#remoteCandidateFlushTimer) clearTimeout(this.#remoteCandidateFlushTimer)
    this.#unsubscribeDevices()
    this.#clearSelection()
    for (const peer of this.#devicePeers.values()) peer.close()
    this.#devicePeers.clear()
    if (this.#system.isOpen()) this.#system.close()
    if (this.#focusTrack.isOpen()) this.#focusTrack.close()
    this.#peer.close()
    log('RTC', 'peer session closed')
  }
}

function candidateKey(candidate: { candidate: string; sdpMid: string }): string {
  return `${candidate.sdpMid}\n${candidate.candidate}`
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
    `type=${type} transport=${fields[2]?.toLowerCase() ?? 'unknown'} ` +
    `endpoint=${fields[4] ?? '?'}:${fields[5] ?? '?'}`
  )
}
