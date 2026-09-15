import { WebSocket } from 'ws'
import {
  parseControlMessage,
  type DeviceListMessage,
  type ServerMessage
} from '../../../shared/protocol.js'
import {
  encodeWebSocketVideo,
  type WebSocketClientMessage,
  type WebSocketServerMessage
} from '../../../shared/websocket.js'
import type { DeviceManager } from '../adb/device-manager.js'
import type { DeviceSession, ViewerConnection } from '../device/device-session.js'
import { log, logError } from '../utils/logger.js'
import type { ViewerTransport } from './protocol.js'

const MAX_SERIAL_LENGTH = 256

class WebSocketViewerTransport implements ViewerTransport {
  readonly #socket: WebSocket
  readonly #serial: string
  readonly #onClose: () => void
  #closed = false

  constructor(socket: WebSocket, serial: string, onClose: () => void) {
    this.#socket = socket
    this.#serial = serial
    this.#onClose = onClose
  }

  sendJson(data: unknown): void {
    if (this.#socket.readyState !== WebSocket.OPEN) return
    this.#socket.send(
      JSON.stringify({
        type: 'device-message',
        serial: this.#serial,
        message: data as ServerMessage
      } satisfies WebSocketServerMessage)
    )
  }

  sendBinary(data: Uint8Array): void {
    if (this.#socket.readyState !== WebSocket.OPEN) return
    this.#socket.send(encodeWebSocketVideo(this.#serial, data), { binary: true, compress: false })
  }

  getBufferedAmount(): number {
    return this.#socket.bufferedAmount
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#onClose()
  }
}

class DeviceSubscription {
  readonly #serial: string
  readonly #session: DeviceSession
  readonly #transport: WebSocketViewerTransport
  #viewer?: ViewerConnection
  #closed = false

  constructor(serial: string, session: DeviceSession, socket: WebSocket, onClose: () => void) {
    this.#serial = serial
    this.#session = session
    this.#transport = new WebSocketViewerTransport(socket, serial, onClose)
  }

  async start(): Promise<void> {
    try {
      await this.#session.start()
      if (this.#closed) return
      this.#viewer = this.#session.addViewer(this.#transport)
      log('WS', `${this.#serial} WebSocket viewer attached`)
    } catch (error) {
      logError('WS', error)
      this.#transport.sendJson({
        type: 'error',
        code: 'SESSION_START_FAILED',
        message: error instanceof Error ? error.message : String(error)
      } satisfies ServerMessage)
      this.close()
    }
  }

  handleControl(value: unknown): void {
    const message = parseControlMessage(value)
    if (!message) {
      this.#transport.sendJson({
        type: 'error',
        code: 'INVALID_CONTROL',
        message: 'Invalid control message'
      } satisfies ServerMessage)
      return
    }
    this.#session.handleControl(message, this.#transport)
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    if (this.#viewer) this.#session.removeViewer(this.#viewer)
    this.#viewer = undefined
  }
}

export class WebSocketViewerSession {
  readonly #socket: WebSocket
  readonly #manager: DeviceManager
  readonly #subscriptions = new Map<string, DeviceSubscription>()
  readonly #unsubscribeDevices: () => void
  #serials: string[] = []
  #closed = false

  constructor(socket: WebSocket, manager: DeviceManager) {
    this.#socket = socket
    this.#manager = manager
    this.#unsubscribeDevices = manager.subscribeDevices((serials) => {
      this.#serials = serials
      const available = new Set(serials)
      for (const serial of this.#subscriptions.keys()) {
        if (!available.has(serial)) this.#removeSubscription(serial)
      }
      this.#sendDeviceList()
    })
    socket.on('message', (raw, isBinary) => {
      if (!isBinary) this.#handleMessage(raw.toString())
    })
    socket.once('close', () => this.close())
  }

  #handleMessage(raw: string): void {
    let message: WebSocketClientMessage
    try {
      message = JSON.parse(raw) as WebSocketClientMessage
    } catch {
      return
    }
    if (
      (message.type !== 'subscribe' &&
        message.type !== 'unsubscribe' &&
        message.type !== 'control') ||
      typeof message.serial !== 'string' ||
      message.serial.length === 0 ||
      message.serial.length > MAX_SERIAL_LENGTH
    )
      return

    if (message.type === 'unsubscribe') {
      this.#removeSubscription(message.serial)
      return
    }
    if (message.type === 'control') {
      this.#subscriptions.get(message.serial)?.handleControl(message.message)
      return
    }
    if (this.#subscriptions.has(message.serial)) return
    const deviceSession = this.#manager.getSession(message.serial)
    if (!deviceSession) {
      this.#send({
        type: 'error',
        code: 'DEVICE_NOT_FOUND',
        message: `Device ${message.serial} not found`
      })
      return
    }
    const subscription = new DeviceSubscription(message.serial, deviceSession, this.#socket, () => {
      if (this.#subscriptions.get(message.serial) === subscription) {
        this.#subscriptions.delete(message.serial)
      }
    })
    this.#subscriptions.set(message.serial, subscription)
    void subscription.start()
  }

  #removeSubscription(serial: string): void {
    const subscription = this.#subscriptions.get(serial)
    if (!subscription) return
    this.#subscriptions.delete(serial)
    subscription.close()
  }

  #sendDeviceList(): void {
    const message: DeviceListMessage = { type: 'devices', devices: this.#serials }
    this.#send(message)
  }

  #send(message: WebSocketServerMessage): void {
    if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message))
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#unsubscribeDevices()
    for (const subscription of this.#subscriptions.values()) subscription.close()
    this.#subscriptions.clear()
    log('WS', 'viewer session closed')
  }
}
