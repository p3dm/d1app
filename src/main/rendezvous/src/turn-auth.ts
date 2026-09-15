import { createHmac } from 'node:crypto'

const DEFAULT_TTL_SECONDS = 86_400
const MIN_TTL_SECONDS = 300
const MAX_TTL_SECONDS = 172_800

export type TurnAuthConfig = {
  urls: string[]
  sharedSecret: string
  ttlSeconds: number
  iceTransportPolicy: 'all' | 'relay'
}

export type TurnIceConfigMessage = {
  type: 'ice-config'
  iceServers: Array<{
    urls: string[]
    username: string
    credential: string
  }>
  iceTransportPolicy: 'all' | 'relay'
  expiresAt: number
}

export function loadTurnAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): TurnAuthConfig | undefined {
  const urls = (env.TURN_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const sharedSecret = env.TURN_SHARED_SECRET?.trim() ?? ''
  if (urls.length === 0 && !sharedSecret) return undefined
  if (urls.length === 0 || !sharedSecret) {
    throw new Error('TURN_URLS and TURN_SHARED_SECRET must be configured together')
  }
  if (urls.some((url) => !/^turns?:[^\s]+$/i.test(url))) {
    throw new Error('TURN_URLS must contain comma-separated turn: or turns: URLs')
  }
  const rawTtl = env.TURN_CREDENTIAL_TTL_SECONDS?.trim()
  const ttlSeconds = rawTtl ? Number(rawTtl) : DEFAULT_TTL_SECONDS
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < MIN_TTL_SECONDS ||
    ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new Error(
      `TURN_CREDENTIAL_TTL_SECONDS must be an integer from ${MIN_TTL_SECONDS} to ${MAX_TTL_SECONDS}`
    )
  }
  const rawPolicy = (env.TURN_ICE_TRANSPORT_POLICY ?? 'all').trim().toLowerCase()
  if (rawPolicy !== 'all' && rawPolicy !== 'relay') {
    throw new Error('TURN_ICE_TRANSPORT_POLICY must be "all" or "relay"')
  }
  return {
    urls: [...new Set(urls)],
    sharedSecret,
    ttlSeconds,
    iceTransportPolicy: rawPolicy
  }
}

export function createTurnIceConfig(
  config: TurnAuthConfig,
  sessionId: string,
  nowMs = Date.now()
): TurnIceConfigMessage {
  const expiresAt = Math.floor(nowMs / 1_000) + config.ttlSeconds
  // coturn's TURN REST API accepts an expiry timestamp followed by arbitrary session data.
  const username = `${expiresAt}:${sessionId}`
  const credential = createHmac('sha1', config.sharedSecret).update(username).digest('base64')
  return {
    type: 'ice-config',
    iceServers: [{ urls: config.urls, username, credential }],
    iceTransportPolicy: config.iceTransportPolicy,
    expiresAt
  }
}
