import { pcpNat, type Gateway as PcpGateway } from '@dozyio/pcp'
import {
  pmpNat,
  upnpNat,
  type Gateway as NatGateway,
  type PortMapping
} from '@achingbrain/nat-port-mapper'
import { gateway4async, gateway6async } from 'default-gateway'
import { log } from '../utils/logger.js'

export type NatMappingProtocol = 'pcp' | 'upnp' | 'pmp'

export type NatPortMappingConfig = {
  enabled: boolean
  udpPort: number
  timeoutMs: number
  ttlMs: number
  retryMs: number
  protocols: NatMappingProtocol[]
  pcpGateway?: string
}

type MappingGateway = NatGateway | PcpGateway

const DEFAULT_UDP_PORT = 50_000
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_TTL_MS = 7_200_000
const DEFAULT_RETRY_MS = 60_000
const VALID_PROTOCOLS = new Set<NatMappingProtocol>(['pcp', 'upnp', 'pmp'])

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}; received ${raw}`)
  }
  return value
}

export function loadNatPortMappingConfig(
  env: NodeJS.ProcessEnv = process.env
): NatPortMappingConfig {
  const mode = (env.RTC_NAT_MAPPING ?? 'auto').trim().toLowerCase()
  if (mode !== 'auto' && mode !== 'off') {
    throw new Error(`RTC_NAT_MAPPING must be "auto" or "off"; received ${env.RTC_NAT_MAPPING}`)
  }

  const protocolNames = (env.RTC_NAT_PROTOCOLS ?? 'pcp,upnp,pmp')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  if (protocolNames.length === 0)
    throw new Error('RTC_NAT_PROTOCOLS must contain at least one protocol')
  const invalidProtocol = protocolNames.find(
    (name) => !VALID_PROTOCOLS.has(name as NatMappingProtocol)
  )
  if (invalidProtocol) {
    throw new Error(`RTC_NAT_PROTOCOLS contains unsupported protocol: ${invalidProtocol}`)
  }

  return {
    enabled: mode === 'auto',
    udpPort: readInteger(env, 'RTC_UDP_PORT', DEFAULT_UDP_PORT, 1_024, 65_535),
    timeoutMs: readInteger(env, 'RTC_NAT_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 500, 60_000),
    ttlMs: readInteger(env, 'RTC_NAT_TTL_MS', DEFAULT_TTL_MS, 120_000, 86_400_000),
    retryMs: readInteger(env, 'RTC_NAT_RETRY_MS', DEFAULT_RETRY_MS, 5_000, 3_600_000),
    protocols: [...new Set(protocolNames)] as NatMappingProtocol[],
    pcpGateway: env.RTC_PCP_GATEWAY?.trim() || undefined
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').trim()
  return String(error)
}

function isNonPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false
  }
  const [a, b] = octets as [number, number, number, number]
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

export class NatPortMappingService {
  readonly #config: NatPortMappingConfig
  readonly #closeController = new AbortController()
  #gateway?: MappingGateway
  #retryTimer?: NodeJS.Timeout
  #attempt?: Promise<void>
  #closed = false

  constructor(config: NatPortMappingConfig) {
    this.#config = config
  }

  async start(): Promise<void> {
    log('RTC', `ICE UDP mux fixed on port ${this.#config.udpPort}`)
    if (!this.#config.enabled) {
      log('NAT', 'automatic port mapping disabled; using STUN hole punching only')
      return
    }
    await this.#mapOnce()
  }

  async stop(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#closeController.abort()
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    await this.#attempt?.catch(() => undefined)
    const gateway = this.#gateway
    this.#gateway = undefined
    if (!gateway) return
    try {
      await gateway.stop({ signal: AbortSignal.timeout(this.#config.timeoutMs) })
      log('NAT', `UDP ${this.#config.udpPort} mapping removed`)
    } catch (error) {
      log('NAT', `could not remove mapping cleanly: ${errorMessage(error)}`)
    }
  }

  async #mapOnce(): Promise<void> {
    if (this.#closed || this.#gateway || this.#attempt) return
    this.#attempt = this.#tryProtocols().finally(() => {
      this.#attempt = undefined
    })
    await this.#attempt
  }

  async #tryProtocols(): Promise<void> {
    const failures: string[] = []
    for (const protocol of this.#config.protocols) {
      if (this.#closed) return
      try {
        const result = await this.#tryProtocol(protocol)
        this.#gateway = result.gateway
        const mapping = result.mapping
        log(
          'NAT',
          `${protocol.toUpperCase()} mapped UDP ${mapping.internalHost}:${mapping.internalPort} -> ` +
            `${mapping.externalHost}:${mapping.externalPort}`
        )
        if (isNonPublicIpv4(mapping.externalHost)) {
          log(
            'NAT',
            `gateway reports non-public address ${mapping.externalHost}; upstream CGNAT/double NAT may still block P2P`
          )
        }
        return
      } catch (error) {
        failures.push(`${protocol}: ${errorMessage(error)}`)
      }
    }
    log(
      'NAT',
      `automatic UDP mapping unavailable (${failures.join('; ')}); continuing with STUN P2P`
    )
    this.#scheduleRetry()
  }

  async #tryProtocol(
    protocol: NatMappingProtocol
  ): Promise<{ gateway: MappingGateway; mapping: PortMapping }> {
    const timeoutSignal = AbortSignal.timeout(this.#config.timeoutMs)
    const signal = AbortSignal.any([this.#closeController.signal, timeoutSignal])
    if (protocol === 'upnp') return this.#tryUpnp(signal)

    if (protocol === 'pmp') {
      const router = await gateway4async()
      const gateway = pmpNat(router.gateway, this.#globalOptions())
      return this.#mapAndReturnGateway(gateway, signal)
    }

    const routerAddresses = this.#config.pcpGateway
      ? [this.#config.pcpGateway]
      : await this.#discoverPcpGateways()
    const failures: string[] = []
    for (const routerAddress of routerAddresses) {
      try {
        const gateway = await pcpNat(routerAddress, this.#globalOptions()).getGateway({ signal })
        return await this.#mapAndReturnGateway(gateway, signal)
      } catch (error) {
        failures.push(`${routerAddress}: ${errorMessage(error)}`)
      }
    }
    throw new Error(failures.join('; ') || 'Unable to determine an IPv4 or IPv6 default gateway')
  }

  async #discoverPcpGateways(): Promise<string[]> {
    const results = await Promise.allSettled([gateway6async(), gateway4async()])
    return [
      ...new Set(
        results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.gateway] : []))
      )
    ]
  }

  async #mapAndReturnGateway(
    gateway: MappingGateway,
    signal: AbortSignal
  ): Promise<{ gateway: MappingGateway; mapping: PortMapping }> {
    try {
      const mapping = await this.#mapGateway(gateway, signal)
      return { gateway, mapping }
    } catch (error) {
      await gateway.stop().catch(() => undefined)
      throw error
    }
  }

  async #tryUpnp(signal: AbortSignal): Promise<{ gateway: MappingGateway; mapping: PortMapping }> {
    const client = upnpNat({
      ...this.#globalOptions(),
      description: 'Android Remote WebRTC',
      gatewaySearchInterval: 1_000
    })
    let lastError: unknown = new Error('no UPnP Internet Gateway Device found')
    for await (const gateway of client.findGateways({ signal, searchInterval: 1_000 })) {
      try {
        const mapping = await this.#mapGateway(gateway, signal)
        return { gateway, mapping }
      } catch (error) {
        lastError = error
        await gateway.stop().catch(() => undefined)
      }
    }
    throw lastError
  }

  async #mapGateway(gateway: MappingGateway, signal: AbortSignal): Promise<PortMapping> {
    for await (const mapping of gateway.mapAll(this.#config.udpPort, {
      protocol: 'udp',
      signal
    })) {
      return mapping
    }
    throw new Error('gateway did not return a UDP mapping')
  }

  #globalOptions(): { ttl: number; autoRefresh: true; refreshTimeout: number } {
    return {
      ttl: this.#config.ttlMs,
      autoRefresh: true,
      refreshTimeout: this.#config.timeoutMs
    }
  }

  #scheduleRetry(): void {
    if (this.#closed || this.#retryTimer) return
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined
      void this.#mapOnce()
    }, this.#config.retryMs)
    this.#retryTimer.unref()
  }
}
