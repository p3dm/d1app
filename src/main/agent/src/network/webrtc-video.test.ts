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

test('drops an older frame that completes after a newer frame', () => {
  const oldFrame = chunkRtcVideoFrame(Uint8Array.from({ length: 40 }, () => 1), 10, 20)
  const newFrame = chunkRtcVideoFrame(Uint8Array.from({ length: 40 }, () => 2), 11, 20)
  const assembler = new RtcVideoFrameAssembler()

  assert.equal(assembler.push(oldFrame[0]!), undefined)
  assert.deepEqual(assembler.push(newFrame[0]!), undefined)
  assert.deepEqual(assembler.push(newFrame[1]!), Uint8Array.from({ length: 40 }, () => 2))
  assert.equal(assembler.push(oldFrame[1]!), undefined)
})
