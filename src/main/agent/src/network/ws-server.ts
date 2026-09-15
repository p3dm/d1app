import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type Server as HttpServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import type { WebSocketClientMessage } from '../../../shared/websocket.js'
import type { DeviceManager } from '../adb/device-manager.js'
import { log, logError } from '../utils/logger.js'
import { WebSocketViewerSession } from './websocket-viewer.js'

const AUTH_TIMEOUT_MS = 10_000
const MAX_CLIENT_MESSAGE_BYTES = 64 * 1_024
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

function tokenMatches(expected: string, supplied: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return (
    expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
  )
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(text)
}

export class AgentWebSocketServer {
  readonly #httpServer: HttpServer
  readonly #webSocketServer: WebSocketServer
  readonly #manager: DeviceManager
  readonly #accessToken: string
  readonly #webRoot: string
  readonly #viewers = new Set<WebSocketViewerSession>()

  constructor(
    manager: DeviceManager,
    port: number,
    host: string,
    accessToken: string,
    webRoot: string
  ) {
    this.#manager = manager
    this.#accessToken = accessToken
    this.#webRoot = path.resolve(webRoot)
    this.#httpServer = createServer((request, response) => {
      void this.#serveHttp(request.method ?? 'GET', request.url ?? '/', response)
    })
    this.#webSocketServer = new WebSocketServer({
      server: this.#httpServer,
      perMessageDeflate: false,
      maxPayload: MAX_CLIENT_MESSAGE_BYTES
    })
    this.#webSocketServer.on('connection', (socket, request) => {
      const pathname = request.url ? new URL(request.url, 'ws://localhost').pathname : ''
      if (pathname !== '/ws') {
        socket.close(4404, 'WebSocket endpoint not found')
        return
      }
      this.#authenticate(socket)
    })
    this.#webSocketServer.on('error', (error) => logError('WS', error))
    this.#httpServer.on('error', (error) => logError('HTTP', error))
    this.#httpServer.listen(port, host, () => {
      log('HTTP', `web listening on http://${host}:${port}/`)
      log('WS', `listening on ws://${host}:${port}/ws`)
    })
  }

  async #serveHttp(method: string, requestUrl: string, response: ServerResponse): Promise<void> {
    if (method !== 'GET' && method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed')
      return
    }
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
    } catch {
      sendText(response, 400, 'Bad request')
      return
    }
    if (pathname === '/ws') {
      sendText(response, 426, 'WebSocket upgrade required')
      return
    }
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const filePath = path.resolve(this.#webRoot, relativePath)
    const allowedPrefix = `${this.#webRoot}${path.sep}`
    if (filePath !== this.#webRoot && !filePath.startsWith(allowedPrefix)) {
      sendText(response, 403, 'Forbidden')
      return
    }
    try {
      const body = await readFile(filePath)
      response.writeHead(200, {
        'Content-Type':
          MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control':
          relativePath === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        'Content-Security-Policy':
          "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(method === 'HEAD' ? undefined : body)
    } catch {
      sendText(response, 404, 'Not found')
    }
  }

  #authenticate(socket: WebSocket): void {
    const timeout = setTimeout(() => socket.close(4401, 'Authentication timeout'), AUTH_TIMEOUT_MS)
    const fail = () => {
      clearTimeout(timeout)
      socket.close(4401, 'Invalid access token')
    }
    socket.once('message', (raw, isBinary) => {
      if (isBinary) {
        fail()
        return
      }
      let message: WebSocketClientMessage
      try {
        message = JSON.parse(raw.toString()) as WebSocketClientMessage
      } catch {
        fail()
        return
      }
      if (
        message.type !== 'auth' ||
        typeof message.token !== 'string' ||
        !tokenMatches(this.#accessToken, message.token)
      ) {
        fail()
        return
      }
      clearTimeout(timeout)
      const viewer = new WebSocketViewerSession(socket, this.#manager)
      this.#viewers.add(viewer)
      socket.once('close', () => {
        viewer.close()
        this.#viewers.delete(viewer)
      })
      log('WS', 'viewer authenticated')
    })
    socket.on('error', (error) => logError('WS', error))
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const viewer of this.#viewers) viewer.close()
      this.#viewers.clear()
      for (const client of this.#webSocketServer.clients) client.close(1001, 'Agent stopping')
      this.#webSocketServer.close()
      this.#httpServer.close(() => resolve())
    })
  }
}
