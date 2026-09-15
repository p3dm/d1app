import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const kitRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const agentScript = path.join(kitRoot, 'app', 'agent.cjs')
const webRoot = path.join(kitRoot, 'app', 'web')
const scrcpyServer = path.join(kitRoot, 'app', 'scrcpy-server-v3.3.1')
const adbPath = path.join(kitRoot, 'tools', 'platform-tools', 'adb.exe')
const cloudflaredPath = path.join(kitRoot, 'tools', 'cloudflared.exe')

for (const required of [
  agentScript,
  path.join(webRoot, 'index.html'),
  scrcpyServer,
  adbPath,
  cloudflaredPath
]) {
  if (!existsSync(required)) {
    console.error(`Missing required file: ${required}`)
    await waitForEnter()
    process.exit(1)
  }
}

const port = await reservePort()
const token = randomBytes(32).toString('base64url')
const children = new Set()
let stopping = false

console.log('Android Remote is starting...')
console.log(
  'Connect Android phones by USB, enable USB debugging, and accept the authorization prompt.'
)
console.log(`Local port: ${port}`)

const agent = spawn(process.execPath, [agentScript], {
  cwd: kitRoot,
  env: {
    ...process.env,
    ACCESS_TOKEN: token,
    ADB_PATH: adbPath,
    AGENT_HOST: '127.0.0.1',
    AGENT_PORT: String(port),
    SCRCPY_SERVER_PATH: scrcpyServer,
    WEB_ROOT: webRoot
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
})
children.add(agent)
pipeOutput('AGENT', agent.stdout)
pipeOutput('AGENT', agent.stderr)

try {
  await waitForAgent(agent)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await shutdown(1)
}

const cloudflared = spawn(
  cloudflaredPath,
  ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
  {
    cwd: kitRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }
)
children.add(cloudflared)

let tunnelBuffer = ''
const inspectTunnelOutput = (chunk) => {
  const text = chunk.toString()
  process.stdout.write(`[TUNNEL] ${text}`)
  tunnelBuffer = `${tunnelBuffer}${text}`.slice(-20_000)
}
cloudflared.stdout.on('data', inspectTunnelOutput)
cloudflared.stderr.on('data', inspectTunnelOutput)

try {
  const publicBaseUrl = await waitForTunnel(cloudflared, () => tunnelBuffer)
  const publicUrl = `${publicBaseUrl}/#token=${token}`
  const linkFile = path.join(kitRoot, 'LINK.txt')
  writeFileSync(linkFile, `${publicUrl}\r\n`, 'utf8')
  copyToClipboard(publicUrl)
  openBrowser(publicUrl)
  console.log('\n============================================================')
  console.log('READY - SEND THIS LINK TO THE REMOTE VIEWER:')
  console.log(publicUrl)
  console.log('============================================================')
  console.log(`The link was copied to the clipboard and saved to ${linkFile}`)
  console.log('Keep this window open. Press Ctrl+C to stop sharing.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await shutdown(1)
}

agent.once('exit', (code) => {
  if (!stopping) void failAndWait(`Agent stopped unexpectedly (code ${code ?? 'unknown'}).`)
})
cloudflared.once('exit', (code) => {
  if (!stopping)
    void failAndWait(`Cloudflare Tunnel stopped unexpectedly (code ${code ?? 'unknown'}).`)
})
process.once('SIGINT', () => void shutdown(0))
process.once('SIGTERM', () => void shutdown(0))
process.stdin.resume()

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not reserve a local port'))
        return
      }
      const selectedPort = address.port
      server.close((error) => (error ? reject(error) : resolve(selectedPort)))
    })
  })
}

function pipeOutput(prefix, stream) {
  stream.on('data', (chunk) => process.stdout.write(`[${prefix}] ${chunk.toString()}`))
}

function waitForAgent(child) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => reject(new Error('Agent startup timed out')), 30_000)
    const inspect = (chunk) => {
      buffer = `${buffer}${chunk.toString()}`.slice(-10_000)
      if (!buffer.includes('[WS] listening on')) return
      clearTimeout(timeout)
      child.stdout.off('data', inspect)
      resolve()
    }
    child.stdout.on('data', inspect)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Agent exited during startup (code ${code ?? 'unknown'})`))
    })
  })
}

function waitForTunnel(child, readBuffer) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Cloudflare Quick Tunnel startup timed out')),
      60_000
    )
    const timer = setInterval(() => {
      const match = readBuffer().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (!match) return
      clearTimeout(timeout)
      clearInterval(timer)
      resolve(match[0])
    }, 100)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      clearInterval(timer)
      reject(new Error(`cloudflared exited during startup (code ${code ?? 'unknown'})`))
    })
  })
}

function copyToClipboard(value) {
  try {
    const clip = spawn('clip.exe', [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true })
    clip.stdin.end(value)
  } catch {
    // LINK.txt and the console still contain the URL.
  }
}

function openBrowser(url) {
  try {
    spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {
    // Opening the browser is optional.
  }
}

async function failAndWait(message) {
  if (stopping) return
  console.error(message)
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  console.log('Press Enter to close this window.')
  await waitForEnter()
  process.exit(1)
}

async function shutdown(exitCode) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  process.exit(exitCode)
}

function waitForEnter() {
  return new Promise((resolve) => process.stdin.once('data', resolve))
}
