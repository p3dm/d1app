function nalTypes(data: Uint8Array): number[] {
  const types: number[] = []
  for (let index = 0; index + 3 < data.length; index += 1) {
    if (data[index] !== 0 || data[index + 1] !== 0) continue
    let header = -1
    if (data[index + 2] === 1) header = index + 3
    else if (data[index + 2] === 0 && data[index + 3] === 1) header = index + 4
    if (header >= 0 && header < data.length) {
      types.push(data[header]! & 0x1f)
      index = header - 1
    }
  }
  return types
}

export function getAvcCodecStringFromAnnexB(config: Uint8Array): string {
  for (let index = 0; index + 7 < config.length; index += 1) {
    let header = -1
    if (config[index] === 0 && config[index + 1] === 0 && config[index + 2] === 1)
      header = index + 3
    else if (
      config[index] === 0 &&
      config[index + 1] === 0 &&
      config[index + 2] === 0 &&
      config[index + 3] === 1
    )
      header = index + 4
    if (header < 0 || (config[header]! & 0x1f) !== 7 || header + 3 >= config.length) continue
    return `avc1.${[config[header + 1], config[header + 2], config[header + 3]]
      .map((value) => value!.toString(16).padStart(2, '0'))
      .join('')}`
  }
  throw new Error('H.264 configuration does not contain a valid SPS NAL unit')
}

export function prependCodecConfig(
  config: Uint8Array | undefined,
  keyframe: Uint8Array
): Uint8Array {
  const types = nalTypes(keyframe)
  if (!config || (types.includes(7) && types.includes(8))) return keyframe
  const output = new Uint8Array(config.byteLength + keyframe.byteLength)
  output.set(config)
  output.set(keyframe, config.byteLength)
  return output
}
