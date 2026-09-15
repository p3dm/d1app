import {
  VIDEO_FLAG_KEYFRAME,
  VIDEO_HEADER_BYTES,
  VIDEO_PROTOCOL_VERSION
} from '../../../shared/protocol.js'

export function serializeVideoPacket(
  payload: Uint8Array,
  ptsUs: bigint,
  keyframe: boolean
): Uint8Array {
  const output = new Uint8Array(VIDEO_HEADER_BYTES + payload.byteLength)
  output[0] = VIDEO_PROTOCOL_VERSION
  output[1] = keyframe ? VIDEO_FLAG_KEYFRAME : 0
  new DataView(output.buffer).setBigUint64(2, ptsUs, false)
  output.set(payload, VIDEO_HEADER_BYTES)
  return output
}

export interface ViewerTransport {
  sendJson(data: unknown): void
  sendBinary(data: Uint8Array): void
  getBufferedAmount(): number
  close(code?: number, reason?: string): void
}
