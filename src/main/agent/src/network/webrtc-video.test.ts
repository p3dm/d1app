import assert from 'node:assert/strict'
import test from 'node:test'
import { RtcVideoFrameAssembler, chunkRtcVideoFrame } from '../../../shared/webrtc.js'

test('chunks and reassembles a video frame arriving out of order', () => {
  const source = Uint8Array.from({ length: 100 }, (_, index) => index)
  const chunks = chunkRtcVideoFrame(source, 42, 17).reverse()
  const assembler = new RtcVideoFrameAssembler()
  let result: Uint8Array | undefined
  for (const chunk of chunks) result = assembler.push(chunk) ?? result
  assert.deepEqual(result, source)
})

test('does not emit an incomplete video frame', () => {
  const chunks = chunkRtcVideoFrame(new Uint8Array(100), 7, 20)
  const assembler = new RtcVideoFrameAssembler()
  for (const chunk of chunks.slice(1)) assert.equal(assembler.push(chunk), undefined)
})
