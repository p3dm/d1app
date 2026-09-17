import type { ControlMessage, ServerMessage } from '../../shared/protocol'
import { RemoteController } from './controller'
import { RemoteVideoDecoder } from './video-decoder'
import type { WebSocketDeviceEndpoint } from './websocket-client'
import { RtcVideoFrameAssembler, type RtcDeviceChannelKind } from '../../shared/webrtc'
import type { WebRtcDeviceEndpoint } from './webrtc-client'

export type RemoteDeviceCallbacks = {
  status: (text: string, state: 'idle' | 'busy' | 'ok' | 'error') => void
  log: (text: string) => void
  streaming: () => void
  disconnected: () => void
  controlState: (enabled: boolean) => void
}

export class RemoteDevice implements WebSocketDeviceEndpoint, WebRtcDeviceEndpoint {
  static readonly #KEYFRAME_RETRY_DELAYS_MS = [1_500, 2_500, 4_000] as const
  readonly #callbacks: RemoteDeviceCallbacks
  readonly #canvas: HTMLCanvasElement
  readonly #decoder: RemoteVideoDecoder
  readonly #focusVideo: HTMLVideoElement
  readonly #controllers: RemoteController[]
  readonly #channelCleanups = new Map<RtcDeviceChannelKind, () => void>()
  readonly #sendControl: (message: ControlMessage) => void
  #disconnectNotified = false
  readonly #receivedChunks: Record<'key' | 'video', number> = { key: 0, video: 0 }
  readonly #assembledFrames: Record<'key' | 'video', number> = { key: 0, video: 0 }
  readonly #rtcAssemblers = {
    key: new RtcVideoFrameAssembler(),
    video: new RtcVideoFrameAssembler()
  }
  #waitingForKeyframe = false
  #keyframeRequestAttempt = 0
  #keyframeRecoveryTimer?: number
  #lastRtcFrameId?: number

  constructor(
    canvas: HTMLCanvasElement,
    focusVideo: HTMLVideoElement,
    callbacks: RemoteDeviceCallbacks,
    sendControl: (message: ControlMessage) => void
  ) {
    this.#callbacks = callbacks
    this.#canvas = canvas
    this.#sendControl = sendControl
    this.#focusVideo = focusVideo
    const label = canvas.getAttribute('aria-label')?.replace(/^Màn hình Android /, '') ?? 'unknown'
    this.#decoder = new RemoteVideoDecoder(label, canvas, callbacks.streaming)
    this.#controllers = [
      new RemoteController(canvas, (message) => this.send(message)),
      new RemoteController(focusVideo, (message) => this.send(message))
    ]
  }

  handleServerMessage(message: ServerMessage): void {
    this.#disconnectNotified = false
    if (message.type === 'session-ready') {
      this.#callbacks.log('[RTC] session ready')
      this.#callbacks.status(`Connected: ${message.serial}`, 'ok')
      this.#startKeyframeRecovery()
    } else if (message.type === 'control-state') {
      this.#callbacks.log(`[RTC] control=${message.enabled ? 'enabled' : 'disabled'}`)
      this.#callbacks.controlState(message.enabled)
    } else if (message.type === 'video-meta') {
      this.#callbacks.log(`[VIDEO] ${message.codec} ${message.width}x${message.height}`)
      if (this.#decoder.configure(message)) this.#finishKeyframeRecovery()
    } else if (message.type === 'video-size') {
      this.#callbacks.log(`[VIDEO] size=${message.width}x${message.height}`)
    } else if (message.type === 'keyframe-request') {
      this.#callbacks.log(`[VIDEO] keyframe request ${message.status}`)
    } else if (message.type === 'error') {
      this.#callbacks.log(`[ERROR] ${message.code}: ${message.message}`)
      this.#callbacks.status(message.message, 'error')
    }
  }

  handleVideo(videoPacket: Uint8Array): void {
    this.#disconnectNotified = false
    if (this.#decoder.decode(videoPacket)) this.#finishKeyframeRecovery()
  }

  attachChannel(kind: RtcDeviceChannelKind, channel: RTCDataChannel): void {
    this.#channelCleanups.get(kind)?.()
    channel.binaryType = 'arraybuffer'
    this.#callbacks.log(
      `[RTC] channel=${kind} attached state=${channel.readyState} ordered=${channel.ordered} ` +
        `maxLifetime=${channel.maxPacketLifeTime ?? 'none'}`
    )
    const onOpen = (): void => this.#callbacks.log(`[RTC] channel=${kind} open`)
    const onError = (): void => this.#callbacks.log(`[RTC] channel=${kind} error`)
    const onMessage = (event: MessageEvent): void => {
      if (kind === 'control') {
        if (typeof event.data !== 'string') return
        try {
          this.handleServerMessage(JSON.parse(event.data) as ServerMessage)
        } catch {
          /* Ignore malformed peer data. */
        }
        return
      }
      if (!(event.data instanceof ArrayBuffer)) return
      this.#receivedChunks[kind] += 1
      if (this.#receivedChunks[kind] === 1) {
        this.#callbacks.log(`[RTC] channel=${kind} first chunk bytes=${event.data.byteLength}`)
      }
      const frame = this.#rtcAssemblers[kind].push(event.data)
      if (frame) {
        const frameId = this.#rtcAssemblers[kind].lastCompletedFrameId
        if (frameId === undefined || !isNewerFrameId(frameId, this.#lastRtcFrameId)) return
        this.#lastRtcFrameId = frameId
        this.#assembledFrames[kind] += 1
        if (this.#assembledFrames[kind] === 1) {
          this.#callbacks.log(
            `[RTC] channel=${kind} first frame assembled bytes=${frame.byteLength}`
          )
        }
        this.handleVideo(frame)
      }
    }
    const onClose = (): void => {
      if (kind !== 'control') this.#rtcAssemblers[kind].clear()
      const summary =
        kind === 'control'
          ? ''
          : ` chunks=${this.#receivedChunks[kind]} frames=${this.#assembledFrames[kind]}`
      this.#callbacks.log(`[RTC] channel=${kind} closed${summary}`)
    }
    channel.addEventListener('open', onOpen)
    channel.addEventListener('error', onError)
    channel.addEventListener('message', onMessage)
    channel.addEventListener('close', onClose)
    this.#channelCleanups.set(kind, () => {
      channel.removeEventListener('open', onOpen)
      channel.removeEventListener('error', onError)
      channel.removeEventListener('message', onMessage)
      channel.removeEventListener('close', onClose)
      if (this.#channelCleanups.get(kind) === cleanup) this.#channelCleanups.delete(kind)
    })
    const cleanup = this.#channelCleanups.get(kind)!
  }

  send(message: ControlMessage): void {
    this.#sendControl(message)
  }

  setFocusStream(stream?: MediaStream): void {
    this.#focusVideo.srcObject = stream ?? null
    this.#focusVideo.hidden = !stream
    this.#canvas.hidden = Boolean(stream)
    if (stream) void this.#focusVideo.play().catch(() => undefined)
  }

  resetConnection(): void {
    this.#callbacks.log(
      `[RTC] reset; key chunks=${this.#receivedChunks.key} frames=${this.#assembledFrames.key}; ` +
        `video chunks=${this.#receivedChunks.video} frames=${this.#assembledFrames.video}`
    )
    this.#rtcAssemblers.key.clear()
    this.#rtcAssemblers.video.clear()
    this.#lastRtcFrameId = undefined
    this.#receivedChunks.key = 0
    this.#receivedChunks.video = 0
    this.#assembledFrames.key = 0
    this.#assembledFrames.video = 0
    this.#stopKeyframeRecovery()
    this.#decoder.close()
    this.setFocusStream(undefined)
    this.#notifyDisconnected()
  }

  disconnect(): void {
    this.#stopKeyframeRecovery()
    this.#decoder.close()
    for (const cleanup of this.#channelCleanups.values()) cleanup()
    this.#channelCleanups.clear()
    for (const controller of this.#controllers) controller.dispose()
    this.setFocusStream(undefined)
  }

  #notifyDisconnected(): void {
    if (this.#disconnectNotified) return
    this.#disconnectNotified = true
    this.#callbacks.status('Tunnel disconnected', 'error')
    this.#callbacks.disconnected()
  }

  #startKeyframeRecovery(): void {
    this.#stopKeyframeRecovery()
    this.#waitingForKeyframe = true
    this.#keyframeRequestAttempt = 0
    // Spread requests from a large phone grid over a short window.
    const jitter = this.#labelHash() % 700
    this.#scheduleKeyframeRequest(RemoteDevice.#KEYFRAME_RETRY_DELAYS_MS[0] + jitter)
  }

  #scheduleKeyframeRequest(delayMs: number): void {
    window.clearTimeout(this.#keyframeRecoveryTimer)
    this.#keyframeRecoveryTimer = window.setTimeout(() => {
      this.#keyframeRecoveryTimer = undefined
      if (!this.#waitingForKeyframe) return
      this.#keyframeRequestAttempt += 1
      this.#callbacks.log(
        `[VIDEO] waiting for keyframe; request attempt=${this.#keyframeRequestAttempt}`
      )
      this.#sendControl({ type: 'request-keyframe' })
      const nextDelay = RemoteDevice.#KEYFRAME_RETRY_DELAYS_MS[this.#keyframeRequestAttempt]
      if (nextDelay !== undefined) this.#scheduleKeyframeRequest(nextDelay)
    }, delayMs)
  }

  #finishKeyframeRecovery(): void {
    if (!this.#waitingForKeyframe) return
    this.#waitingForKeyframe = false
    window.clearTimeout(this.#keyframeRecoveryTimer)
    this.#keyframeRecoveryTimer = undefined
    if (this.#keyframeRequestAttempt > 0) {
      this.#callbacks.log(
        `[VIDEO] keyframe recovery completed after attempt=${this.#keyframeRequestAttempt}`
      )
    }
  }

  #stopKeyframeRecovery(): void {
    this.#waitingForKeyframe = false
    this.#keyframeRequestAttempt = 0
    window.clearTimeout(this.#keyframeRecoveryTimer)
    this.#keyframeRecoveryTimer = undefined
  }

  #labelHash(): number {
    const label = this.#canvas.getAttribute('aria-label') ?? ''
    let hash = 0
    for (let index = 0; index < label.length; index += 1)
      hash = (hash * 31 + label.charCodeAt(index)) >>> 0
    return hash
  }
}

function isNewerFrameId(candidate: number, reference: number | undefined): boolean {
  if (reference === undefined) return true
  const distance = (candidate - reference) >>> 0
  return distance !== 0 && distance < 0x8000_0000
}
