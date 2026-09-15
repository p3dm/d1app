import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { createTurnIceConfig, loadTurnAuthConfig } from './turn-auth.js'

test('TURN is optional but partial configuration is rejected', () => {
  assert.equal(loadTurnAuthConfig({}), undefined)
  assert.throws(
    () => loadTurnAuthConfig({ TURN_URLS: 'turn:example.com:3478' }),
    /configured together/
  )
  assert.throws(() => loadTurnAuthConfig({ TURN_SHARED_SECRET: 'secret' }), /configured together/)
})

test('creates coturn REST credentials scoped to a session and expiry', () => {
  const config = loadTurnAuthConfig({
    TURN_URLS: 'turn:turn.example.com:3478?transport=udp, turn:turn.example.com:3478?transport=tcp',
    TURN_SHARED_SECRET: 'test-secret',
    TURN_CREDENTIAL_TTL_SECONDS: '3600',
    TURN_ICE_TRANSPORT_POLICY: 'relay'
  })
  assert.ok(config)
  const message = createTurnIceConfig(config, 'session-123', 1_700_000_000_000)
  assert.equal(message.expiresAt, 1_700_003_600)
  assert.equal(message.iceTransportPolicy, 'relay')
  assert.deepEqual(message.iceServers[0]?.urls, [
    'turn:turn.example.com:3478?transport=udp',
    'turn:turn.example.com:3478?transport=tcp'
  ])
  const username = '1700003600:session-123'
  assert.equal(message.iceServers[0]?.username, username)
  assert.equal(
    message.iceServers[0]?.credential,
    createHmac('sha1', 'test-secret').update(username).digest('base64')
  )
})
