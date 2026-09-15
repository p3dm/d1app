import type { ControlMessage, ServerMessage } from '../../shared/protocol'
import {
  decodeWebSocketVideo,
  type WebSocketClientMessage,
  type WebSocketServerMessage
} from '../../shared/websocket'

export type ConnectionStatusState = 'idle' | 'busy' | 'ok' | 'error'

export interface WebSocketDeviceEndpoint {
  handleServerMessage(message: ServerMessage): void
  handleVideo(videoPacket: Uint8Array): void
  resetConnection(): void
}

export type WebSocketClientCallbacks = {
  devices: (serials: string[]) => void
  status: (text: string, state: ConnectionStatusState) => void
  log: (text: string) => void
}

export class RemoteWebSocketClient {
  readonly #callbacks: WebSocketClientCallbacks
  readonly #endpoints = new Map<string, WebSocketDeviceEndpoint>()
  #socket?: WebSocket
  #stopped = false
  #reconnectTimer?: number

  constructor(callbacks: WebSocketClientCallbacks) {
    this.#callbacks = callbacks
  }

  connect(): void {
    this.#stopped = false
    this.#open()
  }

  registerDevice(serial: string, endpoint: WebSocketDeviceEndpoint): void {
    this.#endpoints.set(serial, endpoint)
    this.#send({ type: 'subscribe', serial })
  }

  unregisterDevice(serial: string, endpoint: WebSocketDeviceEndpoint): void {
    if (this.#endpoints.get(serial) !== endpoint) return
    this.#send({ type: 'unsubscribe', serial })
    this.#endpoints.delete(serial)
    endpoint.resetConnection()
  }

  sendControl(serial: string, message: ControlMessage): void {
    this.#send({ type: 'control', serial, message })
  }

  close(): void {
    this.#stopped = true
    window.clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = undefined
    const socket = this.#socket
    this.#socket = undefined
    socket?.close(1000, 'Page closed')
    this.#resetEndpoints()
  }

  #open(): void {
    if (this.#stopped) return
    const url = new URL(location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/ws'
    url.search = ''
    url.hash = ''

    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    this.#socket = socket
    this.#callbacks.status('Đang kết nối WebSocket…', 'busy')
    socket.addEventListener('open', () => {
      if (this.#socket !== socket) return
      const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
      this.#send({ type: 'auth', token })
      this.#callbacks.status('WebSocket đã kết nối', 'ok')
      this.#callbacks.log(`[WS] connected ${url}`)
      for (const serial of this.#endpoints.keys()) this.#send({ type: 'subscribe', serial })
    })
    socket.addEventListener('message', (event) => this.#handleMessage(event.data))
    socket.addEventListener('close', (event) => {
      if (this.#socket !== socket) return
      this.#socket = undefined
      this.#resetEndpoints()
      this.#callbacks.status(
        event.code === 4401
          ? 'Access token không hợp lệ'
          : `Mất WebSocket (${event.code}), đang thử lại…`,
        'error'
      )
      this.#scheduleReconnect()
    })
    socket.addEventListener('error', () => {
      this.#callbacks.status('Không kết nối được WebSocket', 'error')
    })
  }

  #handleMessage(data: string | ArrayBuffer | Blob): void {
    if (typeof data === 'string') {
      let message: WebSocketServerMessage
      try {
        message = JSON.parse(data) as WebSocketServerMessage
      } catch {
        return
      }
      if (message.type === 'devices') {
        this.#callbacks.devices(
          message.devices.filter((serial): serial is string => typeof serial === 'string')
        )
      } else if (message.type === 'device-message') {
        this.#endpoints.get(message.serial)?.handleServerMessage(message.message)
      } else if (message.type === 'error') {
        this.#callbacks.log(`[WS ERROR] ${message.code}: ${message.message}`)
        this.#callbacks.status(message.message, 'error')
      }
      return
    }
    if (!(data instanceof ArrayBuffer)) return
    const decoded = decodeWebSocketVideo(data)
    if (decoded) this.#endpoints.get(decoded.serial)?.handleVideo(decoded.videoPacket)
  }

  #send(message: WebSocketClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message))
    }
  }

  #resetEndpoints(): void {
    for (const endpoint of this.#endpoints.values()) endpoint.resetConnection()
  }

  #scheduleReconnect(): void {
    if (this.#stopped || this.#reconnectTimer !== undefined) return
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = undefined
      this.#open()
    }, 2_000)
  }
}
