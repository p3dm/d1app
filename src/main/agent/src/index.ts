import { randomBytes } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { connectAdbServer } from './adb/adb-server-client.js'
import { DeviceManager } from './adb/device-manager.js'
import { AgentWebSocketServer } from './network/ws-server.js'
import { P2PHostConnector } from './network/p2p-host.js'
import { loadRtcNetworkConfig } from './network/ice-servers.js'
import { loadNatPortMappingConfig, NatPortMappingService } from './network/nat-port-mapping.js'
import { log, logError } from './utils/logger.js'

async function findExistingFile(candidates: string[], description: string): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      /* Try the next supported launch layout. */
    }
  }
  throw new Error(`${description} not found; checked: ${candidates.join(', ')}`)
}

async function main(): Promise<void> {
  if (process.env.P2P_MODE === 'nat-map') {
    await runNatMappingOnly()
    return
  }

  const entryFile = process.argv[1]
    ? path.resolve(process.argv[1])
    : path.resolve(process.cwd(), 'index.js')
  const moduleDirectory = path.dirname(entryFile)
  const serverCandidates = process.env.SCRCPY_SERVER_PATH
    ? [path.resolve(process.env.SCRCPY_SERVER_PATH)]
    : [
        path.resolve(process.cwd(), 'assets/scrcpy-server-v3.3.1'),
        path.resolve(process.cwd(), 'agent/assets/scrcpy-server-v3.3.1'),
        path.resolve(moduleDirectory, '../assets/scrcpy-server-v3.3.1'),
        path.resolve(moduleDirectory, '../../../assets/scrcpy-server-v3.3.1')
      ]
  const serverFile = await findExistingFile(serverCandidates, 'scrcpy-server-v3.3.1')
  const adbServer = await connectAdbServer()
  const deviceManager = new DeviceManager(adbServer, serverFile)
  await deviceManager.start()
  const p2pMode = process.env.P2P_MODE === 'host'
  let closeNetwork: () => Promise<void>
  if (p2pMode) {
    const rendezvousUrl = requiredEnvironment('RENDEZVOUS_URL')
    const sessionId = requiredEnvironment('SESSION_ID')
    const sessionSecret = requiredEnvironment('SESSION_SECRET')
    const stunUrls = parseStunUrls(process.env.STUN_URLS ?? requiredEnvironment('STUN_URL'))
    const udpPort = parsePort(process.env.P2P_UDP_PORT ?? '49000', 'P2P_UDP_PORT')
    const rtcNetwork = loadRtcNetworkConfig({
      ...process.env,
      RTC_STUN_URLS: process.env.RTC_STUN_URLS ?? stunUrls.join(','),
      RTC_ICE_TRANSPORT_POLICY: process.env.RTC_ICE_TRANSPORT_POLICY ?? 'all'
    })
    const natMapping = new NatPortMappingService(
      loadNatPortMappingConfig({
        ...process.env,
        RTC_UDP_PORT: String(udpPort)
      })
    )
    // Port mapping is opportunistic. TURN must not wait 5-15 seconds for routers
    // that don't implement PCP/UPnP/NAT-PMP.
    void natMapping.start().catch((error) => logError('NAT', error))
    const connector = new P2PHostConnector(deviceManager, {
      rendezvousUrl,
      sessionId,
      sessionSecret,
      iceTransportPolicy: rtcNetwork.iceTransportPolicy,
      iceServerProvider: rtcNetwork.iceServerProvider,
      udpPort
    })
    connector.start()
    closeNetwork = async () => {
      connector.close()
      await natMapping.stop()
    }
    log('P2P', 'encrypted tunnel; awaiting direct/relay ICE policy from rendezvous')
  } else {
    const webRootCandidates = process.env.WEB_ROOT
      ? [path.resolve(process.env.WEB_ROOT)]
      : [
          path.resolve(process.cwd(), 'web/dist'),
          path.resolve(process.cwd(), '../web/dist'),
          path.resolve(moduleDirectory, '../../web/dist'),
          path.resolve(moduleDirectory, '../../../web/dist'),
          path.resolve(moduleDirectory, '../../../../web/dist')
        ]
    const webIndex = await findExistingFile(
      webRootCandidates.map((candidate) => path.join(candidate, 'index.html')),
      'web/dist/index.html'
    )
    const webRoot = path.dirname(webIndex)
    const host = process.env.AGENT_HOST ?? '127.0.0.1'
    const port = parsePort(process.env.AGENT_PORT ?? '9001', 'AGENT_PORT')
    const configuredAccessToken = (process.env.ACCESS_TOKEN ?? process.env.RTC_ACCESS_TOKEN)?.trim()
    const accessToken = configuredAccessToken || randomBytes(24).toString('base64url')
    const wsServer = new AgentWebSocketServer(deviceManager, port, host, accessToken, webRoot)
    closeNetwork = () => wsServer.close()
    if (configuredAccessToken) log('AUTH', 'ACCESS_TOKEN configured')
    else log('AUTH', `generated viewer URL fragment: #token=${accessToken}`)
    log('WS', 'legacy Cloudflare Quick Tunnel mode')
  }

  let shuttingDown = false
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    log('AGENT', `${signal}; shutting down`)
    await closeNetwork()
    await deviceManager.stop()
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal)
        .then(() => process.exit(0))
        .catch((error) => {
          logError('AGENT', error)
          process.exit(1)
        })
    })
  }
}

async function runNatMappingOnly(): Promise<void> {
  const udpPort = parsePort(process.env.RTC_UDP_PORT ?? '49001', 'RTC_UDP_PORT')
  const natMapping = new NatPortMappingService(
    loadNatPortMappingConfig({
      ...process.env,
      RTC_UDP_PORT: String(udpPort)
    })
  )
  await natMapping.start()
  log('NAT', `viewer UDP ${udpPort} mapping helper ready`)

  const keepAlive = setInterval(() => undefined, 3_600_000)
  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    clearInterval(keepAlive)
    log('AGENT', `${signal}; stopping viewer NAT helper`)
    await natMapping.stop()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal)
        .then(() => process.exit(0))
        .catch((error) => {
          logError('AGENT', error)
          process.exit(1)
        })
    })
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required in P2P host mode`)
  return value
}

function parseStunUrls(raw: string): string[] {
  const urls = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (urls.length === 0 || urls.some((url) => !/^stuns?:[^\s]+$/i.test(url))) {
    throw new Error('STUN_URLS must contain one or more stun:host:port URLs')
  }
  return [...new Set(urls)].slice(0, 8)
}

function parsePort(raw: string, name: string): number {
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`Invalid ${name}: ${raw}`)
  return port
}

process.on('uncaughtException', (error) => logError('AGENT', error))
process.on('unhandledRejection', (error) => logError('AGENT', error))
void main().catch((error) => {
  logError('AGENT', error)
  process.exitCode = 1
})
