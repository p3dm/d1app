import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeWebSocketVideo, encodeWebSocketVideo } from '../../../shared/websocket.js'

test('multiplexes a binary video packet by ADB serial', () => {
  const packet = Uint8Array.from({ length: 100 }, (_, index) => index)
  const encoded = encodeWebSocketVideo('R58RC0VCTZT', packet)
  const decoded = decodeWebSocketVideo(encoded)
  assert.equal(decoded?.serial, 'R58RC0VCTZT')
  assert.deepEqual(decoded?.videoPacket, packet)
})

test('rejects an invalid WebSocket video envelope', () => {
  assert.equal(decodeWebSocketVideo(new Uint8Array()), undefined)
  assert.equal(decodeWebSocketVideo(Uint8Array.from([99, 0, 1, 65, 1])), undefined)
  assert.equal(decodeWebSocketVideo(Uint8Array.from([1, 0, 0, 1])), undefined)
})
