import assert from 'node:assert/strict'
import test from 'node:test'
import { createStunBindingResponse } from './stun.js'

test('returns an RFC 5389 IPv4 XOR-MAPPED-ADDRESS', () => {
  const request = Buffer.alloc(20)
  request.writeUInt16BE(0x0001, 0)
  request.writeUInt32BE(0x2112a442, 4)
  Buffer.from('0102030405060708090a0b0c', 'hex').copy(request, 8)
  const response = createStunBindingResponse(request, {
    address: '203.0.113.7',
    family: 'IPv4',
    port: 54321,
    size: request.length
  })
  assert.ok(response)
  assert.equal(response.readUInt16BE(0), 0x0101)
  assert.deepEqual(response.subarray(8, 20), request.subarray(8, 20))
  assert.equal(response.readUInt16BE(26) ^ 0x2112, 54321)
  const cookie = Buffer.from([0x21, 0x12, 0xa4, 0x42])
  assert.deepEqual(
    [...response.subarray(28, 32)].map((byte, index) => byte ^ cookie[index]!),
    [203, 0, 113, 7]
  )
})

test('ignores malformed packets', () => {
  assert.equal(
    createStunBindingResponse(Buffer.alloc(3), {
      address: '127.0.0.1',
      family: 'IPv4',
      port: 1,
      size: 3
    }),
    undefined
  )
})
