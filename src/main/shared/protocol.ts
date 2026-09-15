export const VIDEO_PROTOCOL_VERSION = 1
export const VIDEO_HEADER_BYTES = 10
export const VIDEO_FLAG_KEYFRAME = 1
export const MAX_TEXT_LENGTH = 1_000

export type VideoMetaMessage = { type: 'video-meta'; codec: string; width: number; height: number }
export type DeviceListMessage = { type: 'devices'; devices: string[] }
export type ServerMessage =
  | { type: 'session-ready'; serial: string }
  | { type: 'control-state'; enabled: boolean }
  | { type: 'keyframe-request'; status: 'accepted' | 'coalesced' | 'ignored' }
  | VideoMetaMessage
  | { type: 'video-size'; width: number; height: number }
  | { type: 'error'; code: string; message: string }
export type TouchMessage = {
  type: 'touch'
  action: 'down' | 'move' | 'up'
  pointerId: number
  x: number
  y: number
  buttons: number
}
export type ControlMessage =
  | TouchMessage
  | { type: 'key'; action: 'press'; keyCode: number }
  | { type: 'text'; text: string }
  | { type: 'request-keyframe' }

export function parseControlMessage(value: unknown): ControlMessage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const message = value as Record<string, unknown>

  if (message.type === 'touch') {
    if (
      !['down', 'move', 'up'].includes(message.action as string) ||
      !Number.isInteger(message.pointerId) ||
      typeof message.x !== 'number' ||
      !Number.isFinite(message.x) ||
      message.x < 0 ||
      message.x > 1 ||
      typeof message.y !== 'number' ||
      !Number.isFinite(message.y) ||
      message.y < 0 ||
      message.y > 1 ||
      !Number.isInteger(message.buttons) ||
      (message.buttons as number) < 0
    )
      return undefined
    return message as TouchMessage
  }

  if (
    message.type === 'key' &&
    message.action === 'press' &&
    Number.isInteger(message.keyCode) &&
    (message.keyCode as number) >= 0
  )
    return message as ControlMessage

  if (
    message.type === 'text' &&
    typeof message.text === 'string' &&
    [...message.text].length <= MAX_TEXT_LENGTH
  )
    return message as ControlMessage

  if (message.type === 'request-keyframe') return { type: 'request-keyframe' }

  return undefined
}
