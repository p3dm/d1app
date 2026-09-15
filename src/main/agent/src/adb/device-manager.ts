import type { AdbServerClient } from '@yume-chan/adb'
import { DeviceSession } from '../device/device-session.js'
import { log, logError } from '../utils/logger.js'

export type DevicesChangedListener = (serials: string[]) => void

export class DeviceManager {
  readonly sessions = new Map<string, DeviceSession>()
  readonly #client: AdbServerClient
  readonly #serverFile: string
  #pollTimer?: NodeJS.Timeout
  #syncPromise?: Promise<void>
  readonly #devicesChangedListeners = new Set<DevicesChangedListener>()

  constructor(client: AdbServerClient, serverFile: string) {
    this.#client = client
    this.#serverFile = serverFile
  }

  async start(): Promise<void> {
    await this.#sync()
    this.#pollTimer = setInterval(
      () => void this.#sync().catch((error) => logError('ADB', error)),
      2_000
    )
    this.#pollTimer.unref()
  }

  getSession(serial: string): DeviceSession | undefined {
    return this.sessions.get(serial)
  }

  getSerials(): string[] {
    return [...this.sessions.keys()].sort()
  }

  subscribeDevices(listener: DevicesChangedListener): () => void {
    this.#devicesChangedListeners.add(listener)
    listener(this.getSerials())
    return () => this.#devicesChangedListeners.delete(listener)
  }

  async #sync(): Promise<void> {
    if (this.#syncPromise) return this.#syncPromise
    this.#syncPromise = this.#syncDevices().finally(() => {
      this.#syncPromise = undefined
    })
    return this.#syncPromise
  }

  async #syncDevices(): Promise<void> {
    const devices = await this.#client.getDevices()
    const available = new Map(
      devices.filter((device) => device.state === 'device').map((device) => [device.serial, device])
    )

    let changed = false
    for (const [serial, session] of this.sessions) {
      if (available.has(serial)) continue
      this.sessions.delete(serial)
      changed = true
      log('ADB', `device=${serial} disconnected`)
      await session.stop(true)
    }

    for (const [serial, device] of available) {
      if (this.sessions.has(serial)) continue
      log('ADB', `device=${serial} state=device`)
      const adb = await this.#client.createAdb(device)
      try {
        const output = await adb.subprocess.noneProtocol.spawnWaitText('echo AGENT_ADB_OK')
        if (!output.includes('AGENT_ADB_OK')) throw new Error(`unexpected shell output: ${output}`)
        log('ADB', `device=${serial} shell test OK`)
        this.sessions.set(serial, new DeviceSession(serial, adb, this.#serverFile))
        changed = true
      } catch (error) {
        await adb.close()
        logError('ADB', error)
      }
    }
    if (changed) this.#emitDevicesChanged()
  }

  #emitDevicesChanged(): void {
    const serials = this.getSerials()
    for (const listener of this.#devicesChangedListeners) listener(serials)
  }

  async stop(): Promise<void> {
    if (this.#pollTimer) clearInterval(this.#pollTimer)
    await Promise.allSettled([...this.sessions.values()].map((session) => session.stop()))
    this.sessions.clear()
    this.#devicesChangedListeners.clear()
  }
}
