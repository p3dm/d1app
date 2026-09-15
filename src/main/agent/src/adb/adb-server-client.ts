import { spawn } from 'node:child_process'
import { AdbServerClient } from '@yume-chan/adb'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import { log } from '../utils/logger.js'

function createClient(): AdbServerClient {
  return new AdbServerClient(new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 }))
}

function startGoogleAdbServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ADB_PATH ?? 'adb', ['start-server'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`adb start-server exited ${code}: ${stderr.trim()}`))
    })
  })
}

export async function connectAdbServer(): Promise<AdbServerClient> {
  let client = createClient()
  try {
    await client.getVersion()
  } catch (firstError) {
    log('ADB', `server unavailable, trying adb start-server: ${String(firstError)}`)
    await startGoogleAdbServer()
    client = createClient()
    await client.getVersion()
  }
  log('ADB', 'server connected at 127.0.0.1:5037')
  return client
}
