import assert from 'node:assert/strict'
import test from 'node:test'
import { parseControlMessage } from '../../../shared/protocol.js'

test('accepts a keyframe recovery request', () => {
  assert.deepEqual(parseControlMessage({ type: 'request-keyframe' }), { type: 'request-keyframe' })
})

test('does not accept extra fields as a different control operation', () => {
  assert.deepEqual(parseControlMessage({ type: 'request-keyframe', action: 'press', keyCode: 3 }), {
    type: 'request-keyframe'
  })
})
