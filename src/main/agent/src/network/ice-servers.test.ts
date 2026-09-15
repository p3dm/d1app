import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadRtcNetworkConfig,
  selectBrowserViewerIceServers,
  selectNativeHostIceServers,
  toNativeIceServers
} from './ice-servers.js'

test('direct-first mode uses public STUN by default', async () => {
  const config = loadRtcNetworkConfig({})
  assert.equal(config.iceTransportPolicy, 'all')
  assert.deepEqual(await config.iceServerProvider.getIceServers(), [
    {
      urls: ['stun:stun.l.google.com:19302']
    }
  ])
})

test('explicit relay-only mode rejects a STUN-only configuration', () => {
  assert.throws(
    () => loadRtcNetworkConfig({ RTC_ICE_TRANSPORT_POLICY: 'relay' }),
    /Relay-only WebRTC requires/
  )
})

test('loads a static TURN configuration', async () => {
  const config = loadRtcNetworkConfig({
    RTC_ICE_TRANSPORT_POLICY: 'relay',
    RTC_STUN_URLS: '',
    RTC_TURN_URLS:
      'turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp',
    RTC_TURN_USERNAME: 'viewer',
    RTC_TURN_CREDENTIAL: 'secret'
  })
  assert.equal(config.iceTransportPolicy, 'relay')
  assert.deepEqual(await config.iceServerProvider.getIceServers(), [
    {
      urls: [
        'turn:turn.example.com:3478?transport=udp',
        'turns:turn.example.com:5349?transport=tcp'
      ],
      username: 'viewer',
      credential: 'secret'
    }
  ])
})

test('converts browser TURN servers for node-datachannel', () => {
  assert.deepEqual(
    toNativeIceServers([
      {
        urls: [
          'stun:stun.example.com:3478',
          'turn:turn.example.com:3478?transport=udp',
          'turn:turn.example.com:80?transport=tcp',
          'turns:turn.example.com:5349?transport=tcp'
        ],
        username: 'user',
        credential: 'password'
      }
    ]),
    [
      'stun:stun.example.com:3478',
      {
        hostname: 'turn.example.com',
        port: 3478,
        relayType: 'TurnUdp',
        username: 'user',
        password: 'password'
      },
      {
        hostname: 'turn.example.com',
        port: 80,
        relayType: 'TurnTcp',
        username: 'user',
        password: 'password'
      },
      {
        hostname: 'turn.example.com',
        port: 5349,
        relayType: 'TurnTls',
        username: 'user',
        password: 'password'
      }
    ]
  )
})

test('uses TURN UDP for the native host and prefers UDP with TCP fallback for the browser', () => {
  const configs = [
    { urls: ['stun:stun.example.com:3478'] },
    {
      urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:443?transport=tcp'],
      username: 'temporary-user',
      credential: 'temporary-password'
    }
  ]
  assert.deepEqual(selectNativeHostIceServers(configs), [
    { urls: ['stun:stun.example.com:3478'] },
    {
      urls: ['turn:turn.example.com:3478?transport=udp'],
      username: 'temporary-user',
      credential: 'temporary-password'
    }
  ])
  assert.deepEqual(selectBrowserViewerIceServers(configs), [
    { urls: ['stun:stun.example.com:3478'] },
    {
      urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:443?transport=tcp'],
      username: 'temporary-user',
      credential: 'temporary-password'
    }
  ])
})

test('keeps the available TURN transport when the preferred one is absent', () => {
  const tcpOnly = [
    {
      urls: ['turn:turn.example.com:443?transport=tcp'],
      username: 'user',
      credential: 'password'
    }
  ]
  assert.deepEqual(selectNativeHostIceServers(tcpOnly), tcpOnly)
})

test('generates short-lived Cloudflare TURN credentials and removes port 53', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      'https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers'
    )
    assert.equal(init?.method, 'POST')
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer key-secret')
    assert.deepEqual(JSON.parse(String(init?.body)), { ttl: 3600 })
    return new Response(
      JSON.stringify({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
          {
            urls: [
              'turn:turn.cloudflare.com:3478?transport=udp',
              'turn:turn.cloudflare.com:53?transport=udp',
              'turns:turn.cloudflare.com:5349?transport=tcp'
            ],
            username: 'temporary-user',
            credential: 'temporary-password'
          }
        ]
      }),
      { status: 201 }
    )
  }

  try {
    const config = loadRtcNetworkConfig({
      CLOUDFLARE_TURN_KEY_ID: 'key-id',
      CLOUDFLARE_TURN_API_TOKEN: 'key-secret',
      CLOUDFLARE_TURN_TTL_SECONDS: '3600'
    })
    assert.equal(config.iceTransportPolicy, 'all')
    assert.equal(config.iceServerProvider.name, 'Cloudflare Realtime TURN')
    assert.deepEqual(await config.iceServerProvider.getIceServers(), [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turns:turn.cloudflare.com:5349?transport=tcp'
        ],
        username: 'temporary-user',
        credential: 'temporary-password'
      }
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
