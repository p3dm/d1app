import type { IceServer } from 'node-datachannel'
import type { RtcIceServerConfig, RtcIceTransportPolicy } from '../../../shared/webrtc.js'

const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302'
const DEFAULT_CLOUDFLARE_TTL_SECONDS = 86_400
const MIN_CLOUDFLARE_TTL_SECONDS = 60
const MAX_CLOUDFLARE_TTL_SECONDS = 172_800
const CLOUDFLARE_REQUEST_TIMEOUT_MS = 10_000

export interface RtcIceServerProvider {
  readonly name: string
  getIceServers(): Promise<RtcIceServerConfig[]>
}

export type RtcNetworkConfig = {
  iceTransportPolicy: RtcIceTransportPolicy
  iceServerProvider: RtcIceServerProvider
}

function splitUrls(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function readTransportPolicy(env: NodeJS.ProcessEnv): RtcIceTransportPolicy {
  const value = (env.RTC_ICE_TRANSPORT_POLICY ?? 'all').trim().toLowerCase()
  if (value !== 'all' && value !== 'relay') {
    throw new Error(`RTC_ICE_TRANSPORT_POLICY must be "all" or "relay"; received ${value}`)
  }
  return value
}

function readCloudflareTtl(env: NodeJS.ProcessEnv): number {
  const raw = env.CLOUDFLARE_TURN_TTL_SECONDS?.trim()
  if (!raw) return DEFAULT_CLOUDFLARE_TTL_SECONDS
  const value = Number(raw)
  if (
    !Number.isInteger(value) ||
    value < MIN_CLOUDFLARE_TTL_SECONDS ||
    value > MAX_CLOUDFLARE_TTL_SECONDS
  ) {
    throw new Error(
      `CLOUDFLARE_TURN_TTL_SECONDS must be an integer from ${MIN_CLOUDFLARE_TTL_SECONDS} ` +
        `to ${MAX_CLOUDFLARE_TTL_SECONDS}; received ${raw}`
    )
  }
  return value
}

function isIceServerConfig(value: unknown): value is RtcIceServerConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const urls = candidate.urls
  if (
    typeof urls !== 'string' &&
    !(Array.isArray(urls) && urls.length > 0 && urls.every((url) => typeof url === 'string'))
  )
    return false
  if (candidate.username !== undefined && typeof candidate.username !== 'string') return false
  if (candidate.credential !== undefined && typeof candidate.credential !== 'string') return false
  return true
}

function removeBrowserBlockedPort53(config: RtcIceServerConfig): RtcIceServerConfig | undefined {
  const urls = (Array.isArray(config.urls) ? config.urls : [config.urls]).filter((url) => {
    const address = url.split('?', 1)[0] ?? url
    return !address.endsWith(':53')
  })
  if (urls.length === 0) return undefined
  return { ...config, urls }
}

class StaticIceServerProvider implements RtcIceServerProvider {
  readonly name = 'static'
  readonly #iceServers: RtcIceServerConfig[]

  constructor(iceServers: RtcIceServerConfig[]) {
    this.#iceServers = iceServers
  }

  async getIceServers(): Promise<RtcIceServerConfig[]> {
    return this.#iceServers
  }
}

class CloudflareTurnIceServerProvider implements RtcIceServerProvider {
  readonly name = 'Cloudflare Realtime TURN'
  readonly #keyId: string
  readonly #apiToken: string
  readonly #ttlSeconds: number
  #cached?: { expiresAt: number; iceServers: RtcIceServerConfig[] }
  #pending?: Promise<RtcIceServerConfig[]>

  constructor(keyId: string, apiToken: string, ttlSeconds: number) {
    this.#keyId = keyId
    this.#apiToken = apiToken
    this.#ttlSeconds = ttlSeconds
  }

  async getIceServers(): Promise<RtcIceServerConfig[]> {
    const refreshMarginMs = Math.min(300_000, this.#ttlSeconds * 100)
    if (this.#cached && Date.now() < this.#cached.expiresAt - refreshMarginMs) {
      return this.#cached.iceServers
    }
    if (!this.#pending) {
      this.#pending = this.#generate().finally(() => {
        this.#pending = undefined
      })
    }
    return this.#pending
  }

  async #generate(): Promise<RtcIceServerConfig[]> {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.#keyId)}` +
        '/credentials/generate-ice-servers',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: this.#ttlSeconds }),
        signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS)
      }
    )
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300)
      throw new Error(`Cloudflare TURN credential request failed (${response.status}): ${detail}`)
    }

    const payload = (await response.json()) as { iceServers?: unknown }
    if (!Array.isArray(payload.iceServers)) {
      throw new Error('Cloudflare TURN response does not contain iceServers')
    }
    const iceServers = payload.iceServers
      .filter(isIceServerConfig)
      .map(removeBrowserBlockedPort53)
      .filter((config): config is RtcIceServerConfig => config !== undefined)
    if (
      !iceServers.some((config) => {
        const urls = Array.isArray(config.urls) ? config.urls : [config.urls]
        return urls.some((url) => url.startsWith('turn:') || url.startsWith('turns:'))
      })
    ) {
      throw new Error('Cloudflare TURN response does not contain a TURN URL')
    }

    this.#cached = {
      expiresAt: Date.now() + this.#ttlSeconds * 1_000,
      iceServers
    }
    return iceServers
  }
}

export function loadRtcNetworkConfig(env: NodeJS.ProcessEnv = process.env): RtcNetworkConfig {
  const iceTransportPolicy = readTransportPolicy(env)
  const cloudflareKeyId = env.CLOUDFLARE_TURN_KEY_ID?.trim()
  const cloudflareApiToken = env.CLOUDFLARE_TURN_API_TOKEN?.trim()
  if (Boolean(cloudflareKeyId) !== Boolean(cloudflareApiToken)) {
    throw new Error('CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN must be set together')
  }

  let iceServerProvider: RtcIceServerProvider
  if (cloudflareKeyId && cloudflareApiToken) {
    iceServerProvider = new CloudflareTurnIceServerProvider(
      cloudflareKeyId,
      cloudflareApiToken,
      readCloudflareTtl(env)
    )
  } else {
    const stunUrls = splitUrls(env.RTC_STUN_URLS ?? DEFAULT_STUN_URL)
    const turnUrls = splitUrls(env.RTC_TURN_URLS)
    const turnUsername = env.RTC_TURN_USERNAME?.trim()
    const turnCredential = env.RTC_TURN_CREDENTIAL?.trim()
    if (turnUrls.length > 0 && (!turnUsername || !turnCredential)) {
      throw new Error('RTC_TURN_USERNAME and RTC_TURN_CREDENTIAL are required with RTC_TURN_URLS')
    }
    if (iceTransportPolicy === 'relay' && turnUrls.length === 0) {
      throw new Error(
        'Relay-only WebRTC requires Cloudflare TURN credentials or RTC_TURN_URLS/USERNAME/CREDENTIAL'
      )
    }
    const iceServers: RtcIceServerConfig[] = []
    if (stunUrls.length > 0) iceServers.push({ urls: stunUrls })
    if (turnUrls.length > 0) {
      iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential })
    }
    if (iceServers.length === 0) throw new Error('At least one ICE server must be configured')
    iceServerProvider = new StaticIceServerProvider(iceServers)
  }

  return { iceTransportPolicy, iceServerProvider }
}

function parseTurnUrl(url: string): {
  hostname: string
  port: number
  relayType: IceServer['relayType']
} {
  const match =
    /^(turn|turns):(?:\/\/)?(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/i.exec(url)
  if (!match) throw new Error(`Unsupported TURN URL for native Agent: ${url}`)
  const scheme = match[1]!.toLowerCase()
  const hostname = match[2]!.replace(/^\[|\]$/g, '')
  const port = match[3] ? Number(match[3]) : scheme === 'turns' ? 5349 : 3478
  const transport = match[4]?.toLowerCase()
  return {
    hostname,
    port,
    relayType: scheme === 'turns' ? 'TurnTls' : transport === 'tcp' ? 'TurnTcp' : 'TurnUdp'
  }
}

export function toNativeIceServers(configs: RtcIceServerConfig[]): Array<string | IceServer> {
  const result: Array<string | IceServer> = []
  for (const config of configs) {
    for (const url of Array.isArray(config.urls) ? config.urls : [config.urls]) {
      if (url.startsWith('stun:')) {
        result.push(url)
        continue
      }
      if (!url.startsWith('turn:') && !url.startsWith('turns:')) continue
      if (!config.username || !config.credential) {
        throw new Error(`TURN credentials are missing for ${url}`)
      }
      result.push({
        ...parseTurnUrl(url),
        username: config.username,
        password: config.credential
      })
    }
  }
  return result
}

/**
 * libdatachannel's native ICE backend is substantially more reliable when the
 * TURN control connection uses UDP. Chromium, on the other hand, can use TURN
 * over TCP/443 on restrictive viewer networks. Keep both endpoints on the
 * same coturn server, but give each endpoint the transport it handles best.
 */
export function selectNativeHostIceServers(configs: RtcIceServerConfig[]): RtcIceServerConfig[] {
  return selectPreferredTurnUrls(configs, isTurnUdpUrl)
}

export function selectBrowserViewerIceServers(configs: RtcIceServerConfig[]): RtcIceServerConfig[] {
  // Chromium handles TURN/UDP reliably and it avoids TCP head-of-line delay.
  // Keep TCP/TLS in the list as an ICE fallback for restrictive networks.
  return preferTurnUrls(configs, isTurnUdpUrl)
}

function preferTurnUrls(
  configs: RtcIceServerConfig[],
  isPreferredTurn: (url: string) => boolean
): RtcIceServerConfig[] {
  return configs.map((config) => {
    const urls = urlsOf(config)
    const preferred = urls.filter(isPreferredTurn)
    const remaining = urls.filter((url) => !isPreferredTurn(url))
    return { ...config, urls: [...preferred, ...remaining] }
  })
}

function selectPreferredTurnUrls(
  configs: RtcIceServerConfig[],
  isPreferredTurn: (url: string) => boolean
): RtcIceServerConfig[] {
  const hasPreferredTurn = configs.some((config) => urlsOf(config).some(isPreferredTurn))
  return configs.flatMap((config) => {
    const urls = urlsOf(config).filter((url) => {
      if (/^stuns?:/i.test(url)) return true
      if (!/^turns?:/i.test(url)) return false
      return hasPreferredTurn ? isPreferredTurn(url) : true
    })
    return urls.length > 0 ? [{ ...config, urls }] : []
  })
}

function urlsOf(config: RtcIceServerConfig): string[] {
  return Array.isArray(config.urls) ? config.urls : [config.urls]
}

function isTurnUdpUrl(url: string): boolean {
  if (!/^turn:/i.test(url)) return false
  const transport = /[?&]transport=(udp|tcp)(?:&|$)/i.exec(url)?.[1]?.toLowerCase()
  return transport === undefined || transport === 'udp'
}

function isTurnTcpUrl(url: string): boolean {
  if (/^turns:/i.test(url)) return true
  return /^turn:/i.test(url) && /[?&]transport=tcp(?:&|$)/i.test(url)
}

export function describeIceServers(configs: RtcIceServerConfig[]): string {
  return configs
    .flatMap((config) => (Array.isArray(config.urls) ? config.urls : [config.urls]))
    .join(', ')
}
