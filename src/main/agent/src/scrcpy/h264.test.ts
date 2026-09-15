import assert from 'node:assert/strict'
import test from 'node:test'
import { getAvcCodecStringFromAnnexB, prependCodecConfig } from './h264.js'

const config = Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f, 0xaa, 0, 0, 1, 0x68, 0xbb])

test('derives the AVC codec string from the SPS', () => {
  assert.equal(getAvcCodecStringFromAnnexB(config), 'avc1.64001f')
})

test('prepends SPS/PPS to an IDR without configuration', () => {
  const idr = Uint8Array.from([0, 0, 0, 1, 0x65, 1, 2, 3, 0xff, 0x10, 0x00, 0x42])
  const result = prependCodecConfig(config, idr)
  assert.deepEqual(result.slice(0, config.length), config)
  assert.deepEqual(result.slice(config.length), idr)
})

test("doesn't duplicate SPS/PPS already present in a keyframe", () => {
  const keyframe = Uint8Array.from([...config, 0, 0, 1, 0x65, 1])
  assert.equal(prependCodecConfig(config, keyframe), keyframe)
})
