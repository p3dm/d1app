import assert from 'node:assert/strict'
import test from 'node:test'
import { loadNatPortMappingConfig } from './nat-port-mapping.js'

test('uses a fixed ICE UDP port and all mapping protocols by default', () => {
  const config = loadNatPortMappingConfig({})
  assert.equal(config.enabled, true)
  assert.equal(config.udpPort, 50_000)
  assert.deepEqual(config.protocols, ['pcp', 'upnp', 'pmp'])
})

test('parses NAT mapping overrides and removes duplicate protocols', () => {
  const config = loadNatPortMappingConfig({
    RTC_NAT_MAPPING: 'off',
    RTC_UDP_PORT: '55000',
    RTC_NAT_PROTOCOLS: 'upnp,pmp,upnp',
    RTC_NAT_TIMEOUT_MS: '2500',
    RTC_NAT_TTL_MS: '600000',
    RTC_NAT_RETRY_MS: '30000',
    RTC_PCP_GATEWAY: '2001:db8::1'
  })
  assert.equal(config.enabled, false)
  assert.equal(config.udpPort, 55_000)
  assert.deepEqual(config.protocols, ['upnp', 'pmp'])
  assert.equal(config.timeoutMs, 2_500)
  assert.equal(config.ttlMs, 600_000)
  assert.equal(config.retryMs, 30_000)
  assert.equal(config.pcpGateway, '2001:db8::1')
})

test('rejects invalid NAT mapping configuration', () => {
  assert.throws(() => loadNatPortMappingConfig({ RTC_UDP_PORT: '99999' }), /RTC_UDP_PORT/)
  assert.throws(
    () => loadNatPortMappingConfig({ RTC_NAT_PROTOCOLS: 'turn' }),
    /unsupported protocol/
  )
  assert.throws(() => loadNatPortMappingConfig({ RTC_NAT_MAPPING: 'yes' }), /RTC_NAT_MAPPING/)
})
