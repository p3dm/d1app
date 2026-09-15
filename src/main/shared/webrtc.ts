import type { DeviceListMessage } from './protocol.js'

export const RTC_VIDEO_CHUNK_VERSION = 1
export const RTC_VIDEO_CHUNK_HEADER_BYTES = 13
export const RTC_VIDEO_CHUNK_PAYLOAD_BYTES = 16 * 1024
export const RTC_MAX_VIDEO_FRAME_BYTES = 32 * 1024 * 1024

export type RtcIceServerConfig = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type RtcIceTransportPolicy = 'all' | 'relay'

export type ViewerSignalMessage =
  | { type: 'auth'; token: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: string; sdpMid: string }

export type AgentSignalMessage =
  | {
      type: 'rtc-config'
      iceServers: RtcIceServerConfig[]
      iceTransportPolicy: RtcIceTransportPolicy
    }
  | { type: 'offer'; sdp: string }
  | { type: 'ice-candidate'; candidate: string; sdpMid: string }
  | { type: 'error'; code: string; message: string }

export type RtcSystemClientMessage =
  | { type: 'subscribe'; serial: string }
  | { type: 'unsubscribe'; serial: string }
  | { type: 'select-device'; serial: string }
  | { type: 'clear-selection'; serial: string }

export type RtcSystemServerMessage = DeviceListMessage
export type RtcDeviceChannelKind = 'control' | 'key' | 'video'

export function rtcDeviceChannelLabel(kind: RtcDeviceChannelKind, serial: string): string {
  return `${kind}:${encodeURIComponent(serial)}`
}

export function parseRtcDeviceChannelLabel(
  label: string
): { kind: RtcDeviceChannelKind; serial: string } | undefined {
  const separator = label.indexOf(':')
  if (separator < 1) return undefined
  const kind = label.slice(0, separator)
  if (kind !== 'control' && kind !== 'key' && kind !== 'video') return undefined
  try {
    const serial = decodeURIComponent(label.slice(separator + 1))
    return serial ? { kind, serial } : undefined
  } catch {
    return undefined
  }
}

export function chunkRtcVideoFrame(
  frame: Uint8Array,
  frameId: number,
  payloadBytes = RTC_VIDEO_CHUNK_PAYLOAD_BYTES
): Uint8Array[] {
  if (frame.byteLength === 0 || frame.byteLength > RTC_MAX_VIDEO_FRAME_BYTES) {
    throw new RangeError(`Invalid RTC video frame size: ${frame.byteLength}`)
  }
  if (!Number.isInteger(payloadBytes) || payloadBytes < 1)
    throw new RangeError('Invalid RTC chunk payload size')
  const chunkCount = Math.ceil(frame.byteLength / payloadBytes)
  if (chunkCount > 0xffff) throw new RangeError(`Too many RTC video chunks: ${chunkCount}`)

  const chunks: Uint8Array[] = []
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * payloadBytes
    const payload = frame.subarray(start, Math.min(start + payloadBytes, frame.byteLength))
    const chunk = new Uint8Array(RTC_VIDEO_CHUNK_HEADER_BYTES + payload.byteLength)
    const view = new DataView(chunk.buffer)
    view.setUint8(0, RTC_VIDEO_CHUNK_VERSION)
    view.setUint32(1, frameId >>> 0, false)
    view.setUint16(5, chunkIndex, false)
    view.setUint16(7, chunkCount, false)
    view.setUint32(9, frame.byteLength, false)
    chunk.set(payload, RTC_VIDEO_CHUNK_HEADER_BYTES)
    chunks.push(chunk)
  }
  return chunks
}

type PendingFrame = {
  createdAt: number
  frameBytes: number
  chunks: Array<Uint8Array | undefined>
  receivedBytes: number
  receivedChunks: number
}

export class RtcVideoFrameAssembler {
  readonly #frames = new Map<number, PendingFrame>()

  push(input: ArrayBuffer | Uint8Array): Uint8Array | undefined {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (bytes.byteLength <= RTC_VIDEO_CHUNK_HEADER_BYTES) return undefined
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint8(0) !== RTC_VIDEO_CHUNK_VERSION) return undefined

    const frameId = view.getUint32(1, false)
    const chunkIndex = view.getUint16(5, false)
    const chunkCount = view.getUint16(7, false)
    const frameBytes = view.getUint32(9, false)
    if (
      chunkCount === 0 ||
      chunkIndex >= chunkCount ||
      frameBytes === 0 ||
      frameBytes > RTC_MAX_VIDEO_FRAME_BYTES
    )
      return undefined

    this.#prune()
    let pending = this.#frames.get(frameId)
    if (!pending || pending.frameBytes !== frameBytes || pending.chunks.length !== chunkCount) {
      pending = {
        createdAt: Date.now(),
        frameBytes,
        chunks: new Array<Uint8Array | undefined>(chunkCount),
        receivedBytes: 0,
        receivedChunks: 0
      }
      this.#frames.set(frameId, pending)
    }
    if (pending.chunks[chunkIndex]) return undefined

    const payload = bytes.slice(RTC_VIDEO_CHUNK_HEADER_BYTES)
    pending.chunks[chunkIndex] = payload
    pending.receivedBytes += payload.byteLength
    pending.receivedChunks += 1
    if (pending.receivedChunks !== chunkCount) return undefined
    this.#frames.delete(frameId)
    if (pending.receivedBytes !== frameBytes) return undefined

    const frame = new Uint8Array(frameBytes)
    let offset = 0
    for (const chunk of pending.chunks) {
      if (!chunk || offset + chunk.byteLength > frame.byteLength) return undefined
      frame.set(chunk, offset)
      offset += chunk.byteLength
    }
    return offset === frame.byteLength ? frame : undefined
  }

  clear(): void {
    this.#frames.clear()
  }

  #prune(): void {
    const expiresBefore = Date.now() - 300
    for (const [frameId, frame] of this.#frames) {
      if (frame.createdAt < expiresBefore || this.#frames.size > 8) this.#frames.delete(frameId)
    }
  }
}
