import type { RemoteInfo } from 'node:dgram'

const HEADER_BYTES = 20
const MAGIC_COOKIE = 0x2112a442
const BINDING_REQUEST = 0x0001
const BINDING_SUCCESS = 0x0101
const XOR_MAPPED_ADDRESS = 0x0020

export function createStunBindingResponse(request: Buffer, remote: RemoteInfo): Buffer | undefined {
  if (request.length < HEADER_BYTES || remote.family !== 'IPv4') return undefined
  if (request.readUInt16BE(0) !== BINDING_REQUEST || request.readUInt32BE(4) !== MAGIC_COOKIE)
    return undefined
  const bodyLength = request.readUInt16BE(2)
  if (HEADER_BYTES + bodyLength > request.length) return undefined

  const address = remote.address.split('.').map(Number)
  if (
    address.length !== 4 ||
    address.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return undefined
  }

  const response = Buffer.alloc(HEADER_BYTES + 12)
  response.writeUInt16BE(BINDING_SUCCESS, 0)
  response.writeUInt16BE(12, 2)
  response.writeUInt32BE(MAGIC_COOKIE, 4)
  request.copy(response, 8, 8, 20)
  response.writeUInt16BE(XOR_MAPPED_ADDRESS, 20)
  response.writeUInt16BE(8, 22)
  response[24] = 0
  response[25] = 0x01
  response.writeUInt16BE(remote.port ^ (MAGIC_COOKIE >>> 16), 26)
  const cookie = Buffer.allocUnsafe(4)
  cookie.writeUInt32BE(MAGIC_COOKIE, 0)
  for (let index = 0; index < 4; index += 1) response[28 + index] = address[index]! ^ cookie[index]!
  return response
}
