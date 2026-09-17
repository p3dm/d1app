import {
  VIDEO_FLAG_KEYFRAME,
  VIDEO_HEADER_BYTES,
  VIDEO_PROTOCOL_VERSION,
  type VideoMetaMessage
} from '../../shared/protocol'

const MAX_DECODE_QUEUE_SIZE = 3

export class RemoteVideoDecoder {
  readonly #label: string
  readonly #canvas: HTMLCanvasElement
  readonly #context: CanvasRenderingContext2D
  readonly #onFirstFrame: () => void
  #decoder?: VideoDecoder
  #configuration?: VideoDecoderConfig
  #configuredCodec?: string
  #firstFrameRendered = false
  #waitForKeyframe = true
  #reportedPacketBeforeConfiguration = false
  #reportedFirstKeyframe = false
  #pendingKeyframe?: Uint8Array

  constructor(label: string, canvas: HTMLCanvasElement, onFirstFrame: () => void) {
    this.#label = label
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!context) throw new Error('Canvas 2D is unavailable')
    this.#canvas = canvas
    this.#context = context
    this.#onFirstFrame = onFirstFrame
  }

  configure(meta: VideoMetaMessage): boolean {
    if (this.#configuredCodec === meta.codec && this.#decoder?.state === 'configured') return false
    // DataChannels are independent, so a keyframe can beat video-meta by a few
    // milliseconds. Preserve it across decoder creation instead of waiting for
    // the encoder's next IDR.
    const pendingKeyframe = this.#pendingKeyframe
    this.close()
    this.#decoder = new VideoDecoder({
      output: (frame) => this.#render(frame),
      error: (error) => console.error(`[${this.#label}] [DECODER] ${error.message}`)
    })
    this.#configuration = {
      codec: meta.codec,
      hardwareAcceleration: 'prefer-hardware',
      optimizeForLatency: true
    }
    this.#decoder.configure(this.#configuration)
    this.#configuredCodec = meta.codec
    this.#waitForKeyframe = true
    this.#reportedPacketBeforeConfiguration = false
    this.#reportedFirstKeyframe = false
    console.log(`[${this.#label}] [DECODER] configured ${meta.codec} ${meta.width}x${meta.height}`)
    if (!pendingKeyframe) return false
    console.log(
      `[${this.#label}] [DECODER] applying keyframe buffered before metadata bytes=${pendingKeyframe.byteLength}`
    )
    return this.decode(pendingKeyframe)
  }

  decode(message: ArrayBuffer | Uint8Array): boolean {
    const bytes = message instanceof Uint8Array ? message : new Uint8Array(message)
    if (bytes.byteLength <= VIDEO_HEADER_BYTES) return false
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint8(0) !== VIDEO_PROTOCOL_VERSION) return false
    const keyframe = (view.getUint8(1) & VIDEO_FLAG_KEYFRAME) !== 0
    if (!this.#decoder || this.#decoder.state !== 'configured') {
      if (keyframe) this.#pendingKeyframe = bytes.slice()
      if (!this.#reportedPacketBeforeConfiguration) {
        this.#reportedPacketBeforeConfiguration = true
        console.warn(
          `[${this.#label}] [DECODER] video arrived before metadata; keyframe=${keyframe} bytes=${bytes.byteLength}`
        )
      }
      return false
    }
    if (this.#decoder.decodeQueueSize > MAX_DECODE_QUEUE_SIZE && this.#configuration) {
      // Never play an old remote-screen queue. Resume at the next frequent
      // keyframe instead of accumulating seconds of input lag.
      this.#decoder.reset()
      this.#decoder.configure(this.#configuration)
      this.#waitForKeyframe = true
      console.warn(`[${this.#label}] [DECODER] dropped decode backlog; waiting for keyframe`)
    }
    if (this.#waitForKeyframe && !keyframe) return false
    if (keyframe) {
      this.#waitForKeyframe = false
      if (!this.#reportedFirstKeyframe) {
        this.#reportedFirstKeyframe = true
        console.log(`[${this.#label}] [DECODER] first keyframe accepted bytes=${bytes.byteLength}`)
      }
    }
    this.#decoder.decode(
      new EncodedVideoChunk({
        type: keyframe ? 'key' : 'delta',
        timestamp: Number(view.getBigUint64(2, false)),
        data: bytes.subarray(VIDEO_HEADER_BYTES)
      })
    )
    return keyframe
  }

  #render(frame: VideoFrame): void {
    try {
      if (
        this.#canvas.width !== frame.displayWidth ||
        this.#canvas.height !== frame.displayHeight
      ) {
        this.#canvas.width = frame.displayWidth
        this.#canvas.height = frame.displayHeight
      }
      this.#context.clearRect(0, 0, this.#canvas.width, this.#canvas.height)
      this.#context.drawImage(frame, 0, 0, this.#canvas.width, this.#canvas.height)
      if (!this.#firstFrameRendered) {
        this.#firstFrameRendered = true
        console.log(
          `[${this.#label}] [DECODER] first frame rendered ${frame.displayWidth}x${frame.displayHeight}`
        )
        this.#onFirstFrame()
      }
    } finally {
      frame.close()
    }
  }

  close(): void {
    if (this.#decoder && this.#decoder.state !== 'closed') this.#decoder.close()
    this.#decoder = undefined
    this.#configuration = undefined
    this.#configuredCodec = undefined
    this.#firstFrameRendered = false
    this.#waitForKeyframe = true
    this.#reportedPacketBeforeConfiguration = false
    this.#reportedFirstKeyframe = false
    this.#pendingKeyframe = undefined
  }
}
