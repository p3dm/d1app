import { readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createSocket } from 'node:dgram'
import { timingSafeEqual } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { createStunBindingResponse } from './stun.js'
import { createTurnIceConfig, loadTurnAuthConfig } from './turn-auth.js'

type Role = 'host' | 'viewer'
type Client = { socket: WebSocket; role?: Role; sessionId?: string; secret?: string; peer?: Client }
type Room = { host?: Client; viewer?: Client }

const httpPort = readPort('RENDEZVOUS_PORT', 8443)
const stunPort = readPort('STUN_PORT', 3478)
const stunEnabled = readBoolean('STUN_ENABLED', true)
const legacyBindHost = process.env.BIND_HOST
const rendezvousBindHost = process.env.RENDEZVOUS_BIND_HOST ?? legacyBindHost ?? '127.0.0.1'
const stunBindHost = process.env.STUN_BIND_HOST ?? legacyBindHost ?? '0.0.0.0'
const certPath = process.env.TLS_CERT_PATH?.trim()
const keyPath = process.env.TLS_KEY_PATH?.trim()
const server =
  certPath && keyPath
    ? createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) })
    : createHttpServer()
const wss = new WebSocketServer({ server, maxPayload: 1_100_000, perMessageDeflate: false })
const rooms = new Map<string, Room>()
const turnAuth = loadTurnAuthConfig()

server.on('request', (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  response.writeHead(404).end()
})

wss.on('connection', (socket, request) => {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/rendezvous') {
    socket.close(4404, 'Endpoint not found')
    return
  }
  const client: Client = { socket }
  const registrationTimer = setTimeout(() => socket.close(4408, 'Registration timeout'), 10_000)
  socket.on('message', (raw, binary) => {
    if (binary) return
    const text = raw.toString()
    if (!client.role) {
      const registration = parseRegistration(text)
      if (!registration) {
        socket.close(4400, 'Invalid registration')
        return
      }
      clearTimeout(registrationTimer)
      client.role = registration.role
      client.sessionId = registration.sessionId
      client.secret = registration.secret
      register(client)
      return
    }
    if (isServerOnlyMessage(text)) return
    if (client.peer?.socket.readyState === WebSocket.OPEN) client.peer.socket.send(text)
  })
  socket.once('close', () => {
    clearTimeout(registrationTimer)
    detach(client)
  })
  socket.on('error', () => detach(client))
})

server.listen(httpPort, rendezvousBindHost, () => {
  const scheme = certPath && keyPath ? 'wss' : 'ws'
  console.log(`[RENDEZVOUS] ${scheme}://${rendezvousBindHost}:${httpPort}/rendezvous`)
})

if (stunEnabled) {
  const stun = createSocket('udp4')
  stun.on('message', (message, remote) => {
    const response = createStunBindingResponse(message, remote)
    if (response) stun.send(response, remote.port, remote.address)
  })
  stun.on('error', (error) => console.error(`[STUN] ${error.stack ?? error.message}`))
  stun.bind(stunPort, stunBindHost, () => console.log(`[STUN] udp://${stunBindHost}:${stunPort}`))
} else {
  console.log('[STUN] built-in server disabled; coturn should serve STUN/TURN')
}
if (turnAuth) console.log(`[TURN] ephemeral credentials enabled for ${turnAuth.urls.join(', ')}`)

function register(client: Client): void {
  const sessionId = client.sessionId!
  const room = rooms.get(sessionId) ?? {}
  const existing = client.role === 'host' ? room.host : room.viewer
  if (existing && existing.socket.readyState === WebSocket.OPEN) {
    client.socket.close(4409, `${client.role} already connected`)
    return
  }
  if (client.role === 'host') room.host = client
  else room.viewer = client
  rooms.set(sessionId, room)
  client.socket.send(JSON.stringify({ type: 'registered', role: client.role }))
  pair(room)
}

function pair(room: Room): void {
  const { host, viewer } = room
  if (!host || !viewer || host.peer || viewer.peer) return
  if (!safeEqual(host.secret!, viewer.secret!)) {
    viewer.socket.close(4403, 'Invalid session secret')
    room.viewer = undefined
    return
  }
  host.peer = viewer
  viewer.peer = host
  if (turnAuth) host.socket.send(JSON.stringify(createTurnIceConfig(turnAuth, host.sessionId!)))
  host.socket.send(JSON.stringify({ type: 'paired' }))
  viewer.socket.send(JSON.stringify({ type: 'paired' }))
}

function isServerOnlyMessage(raw: string): boolean {
  try {
    const type = (JSON.parse(raw) as { type?: unknown }).type
    return (
      type === 'ice-config' || type === 'registered' || type === 'paired' || type === 'peer-left'
    )
  } catch {
    return false
  }
}

function detach(client: Client): void {
  const peer = client.peer
  client.peer = undefined
  if (peer) {
    peer.peer = undefined
    if (peer.socket.readyState === WebSocket.OPEN)
      peer.socket.send(JSON.stringify({ type: 'peer-left' }))
  }
  if (!client.sessionId || !client.role) return
  const room = rooms.get(client.sessionId)
  if (!room) return
  if (client.role === 'host' && room.host === client) room.host = undefined
  if (client.role === 'viewer' && room.viewer === client) room.viewer = undefined
  if (!room.host && !room.viewer) rooms.delete(client.sessionId)
}

function parseRegistration(
  raw: string
): { role: Role; sessionId: string; secret: string } | undefined {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      value.type !== 'register' ||
      (value.role !== 'host' && value.role !== 'viewer') ||
      typeof value.sessionId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(value.sessionId) ||
      typeof value.secret !== 'string' ||
      value.secret.length < 32 ||
      value.secret.length > 128
    )
      return undefined
    return { role: value.role, sessionId: value.sessionId, secret: value.secret }
  } catch {
    return undefined
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error(`Invalid ${name}`)
  return value
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  throw new Error(`Invalid ${name}; expected true or false`)
}
