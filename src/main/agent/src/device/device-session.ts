import { readFile } from 'node:fs/promises'
import type { Adb } from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyExitedError, AdbScrcpyOptions3_3_1 } from '@yume-chan/adb-scrcpy'
import {
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  type AndroidKeyCode,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  type ScrcpyMediaStreamDataPacket,
  type ScrcpyMediaStreamPacket
} from '@yume-chan/scrcpy'
import { ReadableStream } from '@yume-chan/stream-extra'
import type { ControlMessage, TouchMessage, VideoMetaMessage } from '../../../shared/protocol.js'
import { serializeVideoPacket, type ViewerTransport } from '../network/protocol.js'
import { getAvcCodecStringFromAnnexB, prependCodecConfig } from '../scrcpy/h264.js'
import { log, logError } from '../utils/logger.js'

const DEVICE_SERVER_PATH = '/data/local/tmp/scrcpy-server-v3.3.1.jar'
// Remote control must stay live. A small queue is preferable to replaying old
// screen contents after the user has already completed an action.
const MAX_BUFFERED_BYTES = 64 * 1_024
// RESET_VIDEO restarts only this phone's MediaCodec pipeline. Coalesce requests
// from multiple Viewers so a reconnect storm can't keep the encoder resetting.
const VIDEO_RESET_COOLDOWN_MS = 2_000
const GRID_VIDEO_PROFILE = {
  maxSize: readVideoInteger('SCRCPY_GRID_MAX_SIZE', 480, 240, 1_024),
  maxFps: readVideoInteger('SCRCPY_GRID_MAX_FPS', 5, 1, 30),
  bitRate: readVideoInteger('SCRCPY_GRID_VIDEO_BIT_RATE', 150_000, 80_000, 2_000_000)
}
const FOCUS_VIDEO_PROFILE = {
  maxSize: readVideoInteger('SCRCPY_FOCUS_MAX_SIZE', 720, 480, 4_096),
  maxFps: readVideoInteger('SCRCPY_FOCUS_MAX_FPS', 30, 5, 60),
  bitRate: readVideoInteger('SCRCPY_FOCUS_VIDEO_BIT_RATE', 1_500_000, 250_000, 8_000_000)
}
const VIDEO_CODEC_OPTIONS = process.env.SCRCPY_VIDEO_CODEC_OPTIONS?.trim() || 'i-frame-interval=1'

export type DeviceSessionState = 'idle' | 'starting' | 'streaming' | 'stopped' | 'error'
export type StreamQuality = 'grid' | 'focus'
type VideoProfile = typeof GRID_VIDEO_PROFILE
export type ViewerConnection = {
  transport: ViewerTransport
  waitForKeyframe: boolean
  connectedAt: number
  droppedFrames: number
}

export class DeviceSession {
  readonly serial: string
  readonly adb: Adb
  state: DeviceSessionState = 'idle'
  videoWidth = 0
  videoHeight = 0
  codecConfig?: Uint8Array

  readonly #serverFile: string
  readonly #viewers = new Set<ViewerConnection>()
  #client?: AdbScrcpyClient<AdbScrcpyOptions3_3_1<true>>
  #startPromise?: Promise<void>
  #stopping = false
  #generation = 0
  #controlQueue: Promise<void> = Promise.resolve()
  #pendingMove?: { message: TouchMessage; transport: ViewerTransport }
  #movePumpQueued = false
  #metricsTimer?: NodeJS.Timeout
  #metricsStartedAt = performance.now()
  #receivedFrames = 0
  #receivedBytes = 0
  #desiredQuality: StreamQuality = 'grid'
  #activeQuality?: StreamQuality
  #qualityTask?: Promise<void>
  #lastVideoResetAt = 0

  constructor(serial: string, adb: Adb, serverFile: string) {
    this.serial = serial
    this.adb = adb
    this.#serverFile = serverFile
  }

  start(): Promise<void> {
    if (this.state === 'streaming') return Promise.resolve()
    if (this.#startPromise) return this.#startPromise
    this.#stopping = false
    this.#startPromise = this.#startWithSingleRetry(this.#desiredQuality).finally(() => {
      this.#startPromise = undefined
      this.#scheduleQualityChange()
    })
    return this.#startPromise
  }

  setQuality(quality: StreamQuality): void {
    if (this.#desiredQuality === quality) return
    this.#desiredQuality = quality
    log('SCRCPY', `${this.serial} requested quality=${quality}`)
    this.#scheduleQualityChange()
  }

  async waitForQuality(quality: StreamQuality): Promise<void> {
    this.setQuality(quality)
    if (this.state === 'idle' || this.state === 'stopped' || this.state === 'error')
      await this.start()
    while (!this.#stopping && this.#activeQuality !== quality) {
      const pending = this.#qualityTask ?? this.#startPromise
      if (pending) await pending
      else {
        this.#scheduleQualityChange()
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
      if (this.state === 'error')
        throw new Error(`Unable to activate ${quality} quality for ${this.serial}`)
    }
  }

  #scheduleQualityChange(): void {
    if (
      this.#qualityTask ||
      this.#startPromise ||
      this.state !== 'streaming' ||
      this.#activeQuality === this.#desiredQuality
    )
      return
    this.#qualityTask = this.#applyQualityChange()
      .catch((error) => {
        this.state = 'error'
        logError('SCRCPY', error)
      })
      .finally(() => {
        this.#qualityTask = undefined
        if (this.state === 'streaming' && this.#activeQuality !== this.#desiredQuality)
          this.#scheduleQualityChange()
      })
  }

  async #applyQualityChange(): Promise<void> {
    while (
      !this.#stopping &&
      this.state === 'streaming' &&
      this.#activeQuality !== this.#desiredQuality
    ) {
      const quality = this.#desiredQuality
      this.state = 'starting'
      await this.#closeClient()
      if (this.#stopping) return
      await this.#startWithSingleRetry(quality)
    }
  }

  async #startWithSingleRetry(quality: StreamQuality): Promise<void> {
    let lastError: unknown
    const profile = quality === 'focus' ? FOCUS_VIDEO_PROFILE : GRID_VIDEO_PROFILE
    for (let attempt = 0; attempt < 2; attempt += 1) {
      this.state = 'starting'
      try {
        // A few vendor encoders reject custom MediaFormat options. The second
        // attempt keeps all low-bandwidth settings but removes that option.
        await this.#launch(profile, quality, attempt === 0 ? VIDEO_CODEC_OPTIONS : undefined)
        this.#activeQuality = quality
        this.state = 'streaming'
        this.#startMetrics()
        return
      } catch (error) {
        lastError = error
        if (error instanceof AdbScrcpyExitedError) {
          log('SCRCPY', `${this.serial} ----- server exited output -----`)
          for (const line of error.output) log('SCRCPY', `${this.serial} ${line}`)
          log('SCRCPY', `${this.serial} ----- end server output -----`)
        }
        logError('SCRCPY', error)
        await this.#closeClient()
        if (attempt === 0) log('SCRCPY', `${this.serial} retrying once`)
      }
    }
    this.state = 'error'
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async #launch(
    profile: VideoProfile,
    quality: StreamQuality,
    videoCodecOptions?: string
  ): Promise<void> {
    const serverBytes = await readFile(this.#serverFile)
    log('SCRCPY', `${this.serial} pushing server`)
    const serverStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from(serverBytes))
        controller.close()
      }
    })
    await AdbScrcpyClient.pushServer(this.adb, serverStream, DEVICE_SERVER_PATH)
    const options = new AdbScrcpyOptions3_3_1(
      {
        video: true,
        audio: false,
        control: true,
        videoCodec: 'h264',
        maxSize: profile.maxSize,
        maxFps: profile.maxFps,
        videoBitRate: profile.bitRate,
        videoCodecOptions,
        clipboardAutosync: false
      },
      { version: '3.3.1' }
    )
    const client = await AdbScrcpyClient.start(this.adb, DEVICE_SERVER_PATH, options)
    this.#client = client
    const generation = ++this.#generation
    log(
      'SCRCPY',
      `${this.serial} server started; quality=${quality} max=${profile.maxSize}px fps=${profile.maxFps} ` +
        `bitrate=${(profile.bitRate / 1_000_000).toFixed(2)}Mbps keyframeInterval=${videoCodecOptions ? '1s' : 'encoder default'}`
    )
    void this.#consumeOutput(client, generation)

    const video = await client.videoStream
    if (!video) throw new Error('scrcpy video stream is unavailable')
    this.#setVideoSize(video.width, video.height)
    video.sizeChanged(({ width, height }) => this.#setVideoSize(width, height))
    void this.#consumeVideo(video.stream, generation).catch((error) => {
      if (!this.#stopping && generation === this.#generation) this.#handleStreamFailure(error)
    })
  }

  async #consumeOutput(
    client: AdbScrcpyClient<AdbScrcpyOptions3_3_1<true>>,
    generation: number
  ): Promise<void> {
    const reader = client.output.getReader()
    try {
      while (!this.#stopping && generation === this.#generation) {
        const { value, done } = await reader.read()
        if (done) break
        log('SCRCPY', `${this.serial} ${value}`)
      }
    } catch (error) {
      if (!this.#stopping) logError('SCRCPY', error)
    } finally {
      reader.releaseLock()
    }
  }

  async #consumeVideo(
    stream: ReadableStream<ScrcpyMediaStreamPacket>,
    generation: number
  ): Promise<void> {
    const reader = stream.getReader()
    let sawKeyframe = false
    let sawDelta = false
    try {
      while (!this.#stopping && generation === this.#generation) {
        const { value: packet, done } = await reader.read()
        if (done) throw new Error('scrcpy video stream ended')
        if (packet.type === 'configuration') {
          this.codecConfig = packet.data.slice()
          log(
            'VIDEO',
            `${this.serial} config received codec=${getAvcCodecStringFromAnnexB(this.codecConfig)}`
          )
          this.#broadcastVideoMeta()
          continue
        }
        if (packet.keyframe && !sawKeyframe) {
          sawKeyframe = true
          log('VIDEO', `${this.serial} first keyframe`)
        } else if (!packet.keyframe && !sawDelta) {
          sawDelta = true
          log('VIDEO', `${this.serial} first delta`)
        }
        this.#handleVideoPacket(packet)
      }
    } finally {
      reader.releaseLock()
    }
  }

  #handleVideoPacket(packet: ScrcpyMediaStreamDataPacket): void {
    const keyframe = packet.keyframe === true
    const payload = keyframe ? prependCodecConfig(this.codecConfig, packet.data) : packet.data
    const ptsUs = packet.pts ?? process.hrtime.bigint() / 1_000n
    const bytes = serializeVideoPacket(payload, ptsUs, keyframe)
    this.#receivedFrames += 1
    this.#receivedBytes += payload.byteLength
    for (const viewer of this.#viewers) this.#sendVideo(viewer, bytes, keyframe)
  }

  #sendVideo(viewer: ViewerConnection, bytes: Uint8Array, keyframe: boolean): void {
    if (viewer.transport.getBufferedAmount() > MAX_BUFFERED_BYTES) {
      viewer.waitForKeyframe = true
      viewer.droppedFrames += 1
      return
    }
    if (viewer.waitForKeyframe && !keyframe) {
      viewer.droppedFrames += 1
      return
    }
    if (keyframe) viewer.waitForKeyframe = false
    viewer.transport.sendBinary(bytes)
  }

  addViewer(transport: ViewerTransport): ViewerConnection {
    const viewer = { transport, waitForKeyframe: true, connectedAt: Date.now(), droppedFrames: 0 }
    this.#viewers.add(viewer)
    transport.sendJson({ type: 'session-ready', serial: this.serial })
    this.#sendVideoMeta(transport)
    // A new keyframe arrives every second. Waiting for it avoids replaying old
    // screen contents immediately after a Viewer reconnects.
    log('WS', `${this.serial} viewer connected; waiting for a fresh keyframe`)
    return viewer
  }

  removeViewer(viewer: ViewerConnection): void {
    this.#viewers.delete(viewer)
    log('WS', `${this.serial} viewer disconnected`)
  }

  handleControl(message: ControlMessage, transport: ViewerTransport): void {
    if (message.type === 'request-keyframe') {
      this.#enqueueControl(() => this.#requestFreshKeyframe(transport), transport)
      return
    }
    if (message.type === 'touch' && message.action === 'move') {
      this.#pendingMove = { message, transport }
      if (this.#movePumpQueued) return
      this.#movePumpQueued = true
      this.#enqueueControl(async () => {
        while (this.#pendingMove) {
          const latest = this.#pendingMove
          this.#pendingMove = undefined
          await this.#injectControl(latest.message)
        }
        this.#movePumpQueued = false
      }, transport)
      return
    }
    this.#enqueueControl(() => this.#injectControl(message), transport)
  }

  async #requestFreshKeyframe(transport: ViewerTransport): Promise<void> {
    const viewer = [...this.#viewers].find((candidate) => candidate.transport === transport)
    if (!viewer || !viewer.waitForKeyframe) {
      transport.sendJson({ type: 'keyframe-request', status: 'ignored' })
      return
    }

    const now = Date.now()
    if (now - this.#lastVideoResetAt < VIDEO_RESET_COOLDOWN_MS) {
      log('VIDEO', `${this.serial} keyframe request coalesced`)
      transport.sendJson({ type: 'keyframe-request', status: 'coalesced' })
      return
    }

    const controller = this.#client?.controller
    if (!controller || this.state !== 'streaming') {
      throw new Error('scrcpy controller is unavailable for video reset')
    }
    this.#lastVideoResetAt = now
    log('VIDEO', `${this.serial} fresh keyframe requested; resetting video encoder`)
    await controller.resetVideo()
    transport.sendJson({ type: 'keyframe-request', status: 'accepted' })
  }

  #enqueueControl(task: () => Promise<void>, transport: ViewerTransport): void {
    this.#controlQueue = this.#controlQueue.then(task).catch((error) => {
      this.#movePumpQueued = false
      this.#pendingMove = undefined
      logError('CONTROL', error)
      transport.sendJson({
        type: 'error',
        code: 'CONTROL_FAILED',
        message: error instanceof Error ? error.message : String(error)
      })
    })
  }

  async #injectControl(message: ControlMessage): Promise<void> {
    const controller = this.#client?.controller
    if (!controller || this.state !== 'streaming')
      throw new Error('scrcpy controller is unavailable')
    if (message.type === 'request-keyframe') {
      throw new Error('keyframe requests must use the video recovery path')
    }
    if (message.type === 'touch') {
      if (!this.videoWidth || !this.videoHeight) throw new Error('video size is unknown')
      const action = {
        down: AndroidMotionEventAction.Down,
        move: AndroidMotionEventAction.Move,
        up: AndroidMotionEventAction.Up
      }[message.action]
      const pointerX = Math.min(
        this.videoWidth - 1,
        Math.max(0, Math.round(message.x * this.videoWidth))
      )
      const pointerY = Math.min(
        this.videoHeight - 1,
        Math.max(0, Math.round(message.y * this.videoHeight))
      )
      await controller.injectTouch({
        action,
        pointerId: BigInt(message.pointerId),
        pointerX,
        pointerY,
        videoWidth: this.videoWidth,
        videoHeight: this.videoHeight,
        pressure: message.action === 'up' ? 0 : 1,
        actionButton: AndroidMotionEventButton.Primary,
        buttons: message.buttons
      })
      // MOVE may run at display refresh rate. Logging every event adds stdout,
      // IPC and DOM work to the latency-sensitive control path.
      if (message.action !== 'move') {
        log('CONTROL', `${this.serial} ${message.action.toUpperCase()} x=${pointerX} y=${pointerY}`)
      }
      return
    }
    if (message.type === 'key') {
      for (const action of [AndroidKeyEventAction.Down, AndroidKeyEventAction.Up]) {
        await controller.injectKeyCode({
          action,
          keyCode: message.keyCode as AndroidKeyCode,
          repeat: 0,
          metaState: AndroidKeyEventMeta.None
        })
      }
      log('CONTROL', `${this.serial} KEY keyCode=${message.keyCode}`)
      return
    }
    await controller.injectText(message.text)
    log('CONTROL', `${this.serial} TEXT length=${[...message.text].length}`)
  }

  #setVideoSize(width: number, height: number): void {
    if (!width || !height || (width === this.videoWidth && height === this.videoHeight)) return
    this.videoWidth = width
    this.videoHeight = height
    log('VIDEO', `${this.serial} size=${width}x${height}`)
    for (const viewer of this.#viewers)
      viewer.transport.sendJson({ type: 'video-size', width, height })
    this.#broadcastVideoMeta()
  }

  #videoMeta(): VideoMetaMessage | undefined {
    if (!this.codecConfig || !this.videoWidth || !this.videoHeight) return undefined
    return {
      type: 'video-meta',
      codec: getAvcCodecStringFromAnnexB(this.codecConfig),
      width: this.videoWidth,
      height: this.videoHeight
    }
  }

  #sendVideoMeta(transport: ViewerTransport): void {
    const meta = this.#videoMeta()
    if (meta) transport.sendJson(meta)
  }

  #broadcastVideoMeta(): void {
    const meta = this.#videoMeta()
    if (meta) for (const viewer of this.#viewers) viewer.transport.sendJson(meta)
  }

  #handleStreamFailure(error: unknown): void {
    this.state = 'error'
    logError('VIDEO', error)
    for (const viewer of this.#viewers) {
      viewer.transport.sendJson({
        type: 'error',
        code: 'SCRCPY_STREAM_ENDED',
        message: 'scrcpy video stream ended'
      })
    }
    void this.#closeClient()
  }

  async stop(deviceDisconnected = false): Promise<void> {
    if (this.state === 'stopped') return
    this.#stopping = true
    this.state = 'stopped'
    for (const viewer of this.#viewers) {
      if (deviceDisconnected) {
        viewer.transport.sendJson({
          type: 'error',
          code: 'DEVICE_DISCONNECTED',
          message: 'Android device disconnected'
        })
        viewer.transport.close(1011, 'Device disconnected')
      } else viewer.transport.close(1001, 'Agent stopping')
    }
    this.#viewers.clear()
    await this.#closeClient()
    this.#activeQuality = undefined
    await this.adb.close().catch((error) => logError('ADB', error))
    if (this.#metricsTimer) clearInterval(this.#metricsTimer)
  }

  async #closeClient(): Promise<void> {
    const client = this.#client
    this.#client = undefined
    this.#lastVideoResetAt = 0
    this.#generation += 1
    if (!client) return
    try {
      await client.close()
    } catch (error) {
      if (error instanceof AdbScrcpyExitedError) {
        for (const line of error.output) log('SCRCPY', `${this.serial} ${line}`)
      } else if (!this.#stopping) logError('SCRCPY', error)
    }
  }

  #startMetrics(): void {
    if (this.#metricsTimer) return
    this.#metricsStartedAt = performance.now()
    this.#metricsTimer = setInterval(() => {
      const seconds = Math.max((performance.now() - this.#metricsStartedAt) / 1_000, 0.001)
      const drops = [...this.#viewers].reduce((total, viewer) => total + viewer.droppedFrames, 0)
      const maxBuffered = [...this.#viewers].reduce(
        (max, viewer) => Math.max(max, viewer.transport.getBufferedAmount()),
        0
      )
      log(
        this.serial,
        `quality=${this.#activeQuality ?? this.#desiredQuality} fps=${(this.#receivedFrames / seconds).toFixed(1)} ` +
          `rx=${((this.#receivedBytes * 8) / seconds / 1_000_000).toFixed(1)}Mbps ` +
          `viewers=${this.#viewers.size} drops=${drops} buffered=${maxBuffered}`
      )
      this.#receivedFrames = 0
      this.#receivedBytes = 0
      this.#metricsStartedAt = performance.now()
    }, 5_000)
    this.#metricsTimer.unref()
  }
}

function readVideoInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}
