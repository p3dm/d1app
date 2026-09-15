import type { ControlMessage, DeviceListMessage, ServerMessage } from './protocol.js'

export const WS_VIDEO_VERSION = 1
export const WS_VIDEO_HEADER_BYTES = 3
export const WS_MAX_SERIAL_BYTES = 1_024

export type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; serial: string }
  | { type: 'unsubscribe'; serial: string }
  | { type: 'control'; serial: string; message: ControlMessage }

export type WebSocketServerMessage =
  | DeviceListMessage
  | { type: 'device-message'; serial: string; message: ServerMessage }
  | { type: 'error'; code: string; message: string }

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export function encodeWebSocketVideo(serial: string, videoPacket: Uint8Array): Uint8Array {
  const serialBytes = textEncoder.encode(serial)
  if (serialBytes.byteLength === 0 || serialBytes.byteLength > WS_MAX_SERIAL_BYTES) {
    throw new RangeError(`Invalid serial byte length: ${serialBytes.byteLength}`)
  }
  const output = new Uint8Array(
    WS_VIDEO_HEADER_BYTES + serialBytes.byteLength + videoPacket.byteLength
  )
  const view = new DataView(output.buffer)
  view.setUint8(0, WS_VIDEO_VERSION)
  view.setUint16(1, serialBytes.byteLength, false)
  output.set(serialBytes, WS_VIDEO_HEADER_BYTES)
  output.set(videoPacket, WS_VIDEO_HEADER_BYTES + serialBytes.byteLength)
  return output
}

export function decodeWebSocketVideo(
  input: ArrayBuffer | Uint8Array
): { serial: string; videoPacket: Uint8Array } | undefined {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.byteLength <= WS_VIDEO_HEADER_BYTES) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(0) !== WS_VIDEO_VERSION) return undefined
  const serialBytes = view.getUint16(1, false)
  const payloadOffset = WS_VIDEO_HEADER_BYTES + serialBytes
  if (serialBytes === 0 || serialBytes > WS_MAX_SERIAL_BYTES || payloadOffset >= bytes.byteLength)
    return undefined
  try {
    const serial = textDecoder.decode(bytes.subarray(WS_VIDEO_HEADER_BYTES, payloadOffset))
    if (!serial) return undefined
    return { serial, videoPacket: bytes.subarray(payloadOffset) }
  } catch {
    return undefined
  }
}
