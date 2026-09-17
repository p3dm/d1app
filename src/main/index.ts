import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAuthIpc } from './ipc/auth'

const AUTH_PROTOCOL = 'd1app'
let mainWindow: BrowserWindow | null = null
let pendingAuthCode: { eventName: string; code: string } | null = null
let hostProcess: ReturnType<typeof spawn> | null = null
let viewerNatProcess: ReturnType<typeof spawn> | null = null
let viewerNatReady: Promise<boolean> | undefined
let logWindow: BrowserWindow | null = null
const logHistory: string[] = []
const HOST_UDP_PORT = 49000
const VIEWER_UDP_PORT = 49001

function handleAuthDeepLink(url: string): void {
  console.log('[auth] deep link received')
  if (!url.startsWith(`${AUTH_PROTOCOL}://`)) return
  const parsedUrl = new URL(url)
  if (parsedUrl.hostname !== 'auth') return

  const pathname = parsedUrl.pathname.replace(/\/$/, '')

  const eventName =
    pathname === '/confirm'
      ? 'auth:confirm'
      : pathname === '/google-callback'
        ? 'auth:google'
        : pathname === '/reset-password'
          ? 'auth:reset'
          : null
  if (!eventName) return

  const code = parsedUrl.searchParams.get('code')
  const tokenHash = parsedUrl.searchParams.get('token_hash')
  const type = parsedUrl.searchParams.get('type') ?? 'signup'
  const fragmentParams = new URLSearchParams(parsedUrl.hash.slice(1))
  const accessToken = fragmentParams.get('access_token')
  const refreshToken = fragmentParams.get('refresh_token')
  const callbackValue = code
    ? code
    : tokenHash
      ? `token_hash:${type}:${tokenHash}`
      : accessToken && refreshToken
        ? url
        : null
  if (callbackValue && !mainWindow?.webContents.getURL()) {
    pendingAuthCode = { eventName, code: callbackValue }
    return
  }

  if (callbackValue && mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send(eventName, callbackValue)
  }
}

const hasSingleInstance = app.requestSingleInstanceLock()
if (!hasSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const authUrl = commandLine.find((argument) => argument.startsWith(`${AUTH_PROTOCOL}://`))
    if (authUrl) handleAuthDeepLink(authUrl)
  })
}

if (process.defaultApp) {
  const developmentEntry = resolve(process.argv[1] ?? '.')
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [developmentEntry])
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL)
}

function findExistingFile(candidates: string[], description: string): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`${description} not found; checked: ${candidates.join(', ')}`)
}

function getAgentEntry(): string {
  const candidates = [
    resolve(process.resourcesPath, 'agent/dist/agent/src/index.js'),
    resolve(process.cwd(), 'src/main/agent/dist/agent/src/index.js'),
    resolve(process.cwd(), 'src/main/agent/agent.cjs'),
    resolve(app.getAppPath(), 'src/main/agent/dist/agent/src/index.js'),
    resolve(app.getAppPath(), 'src/main/agent/agent.cjs'),
    resolve(__dirname, '../agent/dist/agent/src/index.js'),
    resolve(__dirname, '../agent/agent.cjs')
  ]
  return findExistingFile(candidates, 'agent entry')
}

function startHost(input: { rendezvousUrl?: string; stunUrl?: string } = {}): {
  invite: string
  sessionId: string
} {
  stopHost()
  const runtimeLabel = `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`
  broadcastHostLog(`[RUNTIME] ${runtimeLabel}\n`)

  const rendezvousUrl = validUrl(input.rendezvousUrl, ['ws:', 'wss:'])
  const stunUrls = validStunUrls(input.stunUrl ?? '')
  const sessionId = randomBytes(12).toString('base64url')
  const secret = randomBytes(32).toString('base64url')
  const agentEntry = getAgentEntry()
  const adbCandidates = [
    process.env.ADB_PATH,
    resolve(process.cwd(), 'tools/platform-tools/adb.exe'),
    resolve(process.cwd(), 'release/AndroidRemotePortable/tools/platform-tools/adb.exe'),
    resolve(app.getAppPath(), 'tools/platform-tools/adb.exe'),
    resolve(app.getAppPath(), 'release/AndroidRemotePortable/tools/platform-tools/adb.exe')
  ].filter(Boolean) as string[]
  const adbPath = adbCandidates.find((candidate) => existsSync(candidate))
  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    P2P_MODE: 'host',
    RENDEZVOUS_URL: rendezvousUrl,
    STUN_URL: stunUrls[0],
    STUN_URLS: stunUrls.join(','),
    RTC_STUN_URLS: stunUrls.join(','),
    RTC_ICE_TRANSPORT_POLICY: 'all',
    SESSION_ID: sessionId,
    SESSION_SECRET: secret,
    P2P_UDP_PORT: String(HOST_UDP_PORT),
    SCRCPY_SERVER_PATH: resolve(process.cwd(), 'src/main/agent/assets/scrcpy-server-v3.3.1'),
    ...(adbPath ? { ADB_PATH: adbPath } : {})
  }

  hostProcess = spawn(process.execPath, [agentEntry], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  forwardHostLog(hostProcess.stdout)
  forwardHostLog(hostProcess.stderr)
  hostProcess.once('exit', (code) => {
    broadcastHostLog(`[HOST] stopped (${code ?? 'unknown'})\n`)
    hostProcess = null
  })

  const invite = Buffer.from(
    JSON.stringify({ v: 1, rendezvousUrl, stunUrl: stunUrls[0], stunUrls, sessionId, secret })
  ).toString('base64url')
  return { invite, sessionId }
}

function stopHost(): boolean {
  if (!hostProcess) return false
  hostProcess.kill()
  hostProcess = null
  return true
}

async function openViewer(encodedInvite: string): Promise<{
  rendezvousUrl: string
  sessionId: string
  secret: string
}> {
  const invite = parseInvite(encodedInvite)
  void startViewerNatMapping().catch((error: Error) => {
    broadcastHostLog(`[VIEWER NAT] optional helper unavailable: ${error.message}\n`)
  })
  return {
    rendezvousUrl: invite.rendezvousUrl,
    sessionId: invite.sessionId,
    secret: invite.secret
  }
}

function startViewerNatMapping(): Promise<boolean> {
  if (viewerNatProcess && viewerNatReady) return viewerNatReady

  const agentEntry = getAgentEntry()
  const child = spawn(process.execPath, [agentEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      P2P_MODE: 'nat-map',
      RTC_UDP_PORT: String(VIEWER_UDP_PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  viewerNatProcess = child
  viewerNatReady = new Promise<boolean>((resolve, reject) => {
    let output = ''
    let settled = false
    const finish = (value: boolean | Error, shouldReject = false): void => {
      if (settled) return
      settled = true
      if (shouldReject) reject(value as Error)
      else resolve(value as boolean)
    }

    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString()
      output = (output + text).slice(-8192)
      broadcastHostLog(`[VIEWER NAT] ${text}`)
      if (output.includes(`viewer UDP ${VIEWER_UDP_PORT} mapping helper ready`)) {
        finish(true)
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      if (viewerNatProcess === child) {
        viewerNatProcess = null
        viewerNatReady = undefined
      }
      finish(new Error(`Viewer NAT helper stopped (${code ?? 'unknown'})`), true)
    })

    setTimeout(() => finish(false), 20_000)
  })

  return viewerNatReady
}

function stopViewerNatMapping(): void {
  const child = viewerNatProcess
  viewerNatProcess = null
  viewerNatReady = undefined
  child?.kill()
}

function forwardHostLog(
  stream: NodeJS.ReadableStream | null | undefined,
  logToConsole = false
): void {
  stream?.on('data', (chunk) => {
    const text = chunk.toString()
    broadcastHostLog(text)
    if (logToConsole) process.stdout.write(text)
  })
}

function broadcastHostLog(text: string): void {
  logHistory.push(text)
  if (logHistory.length > 2_000) logHistory.splice(0, logHistory.length - 2_000)
  mainWindow?.webContents.send('host:log', text)
  if (!app.isPackaged) process.stdout.write(text)
  if (!logWindow || logWindow.isDestroyed()) return
  const encoded = JSON.stringify(text)
  void logWindow.webContents.executeJavaScript(`window.appendLog(${encoded})`).catch(() => undefined)
}

function openLogWindow(): void {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.show()
    logWindow.focus()
    return
  }

  logWindow = new BrowserWindow({
    width: 980,
    height: 620,
    minWidth: 560,
    minHeight: 320,
    title: 'D1A connection logs',
    backgroundColor: '#080b09',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  logWindow.removeMenu()
  logWindow.on('closed', () => {
    logWindow = null
  })
  logWindow.webContents.once('did-finish-load', () => {
    for (const text of logHistory) {
      const encoded = JSON.stringify(text)
      void logWindow?.webContents.executeJavaScript(`window.appendLog(${encoded})`)
    }
  })
  const html = `<!doctype html><meta charset="utf-8"><title>D1A logs</title>
<style>html,body{margin:0;height:100%;background:#080b09;color:#d7e8dc;font:12px Consolas,monospace}header{height:40px;display:flex;align-items:center;padding:0 14px;box-sizing:border-box;color:#00e599;border-bottom:1px solid #1c3a2a}pre{margin:0;padding:12px;height:calc(100% - 40px);box-sizing:border-box;overflow:auto;white-space:pre-wrap;word-break:break-word}button{margin-left:auto;background:#10251a;color:#00e599;border:1px solid #2b704d;padding:5px 10px;cursor:pointer}</style>
<header>LIVE CONNECTION LOG<button onclick="out.textContent=''">Clear</button></header><pre id="out"></pre>
<script>const out=document.getElementById('out');window.appendLog=(text)=>{out.append(document.createTextNode(text));out.scrollTop=out.scrollHeight}</script>`
  void logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function validUrl(raw: string | undefined, protocols: string[]): string {
  if (typeof raw !== 'string') throw new Error('Thiếu URL rendezvous')
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('URL rendezvous không hợp lệ')
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error('Rendezvous phải dùng ws:// hoặc wss://')
  }
  return url.toString()
}

function validStunUrls(raw: string | undefined): string[] {
  if (typeof raw !== 'string') throw new Error('Thiếu STUN URL')
  const urls = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (urls.length === 0 || urls.some((url) => !/^stuns?:[^\s]+$/i.test(url))) {
    throw new Error('STUN phải có dạng stun:host:port; phân tách nhiều URL bằng dấu phẩy')
  }
  return [...new Set(urls)].slice(0, 8)
}

function parseInvite(raw: string): {
  rendezvousUrl: string
  sessionId: string
  secret: string
  stunUrls: string[]
  stunUrl: string
} {
  try {
    const value = JSON.parse(Buffer.from(String(raw).trim(), 'base64url').toString('utf8')) as {
      v?: number
      sessionId?: string
      secret?: string
      rendezvousUrl?: string
      stunUrls?: string[]
      stunUrl?: string
    }

    if (value?.v !== 1 || typeof value.sessionId !== 'string' || typeof value.secret !== 'string') {
      throw new Error('Mã kết nối không hợp lệ')
    }

    value.rendezvousUrl = validUrl(value.rendezvousUrl, ['ws:', 'wss:'])
    const rawStunUrls = Array.isArray(value.stunUrls) ? value.stunUrls.join(',') : value.stunUrl
    value.stunUrls = validStunUrls(rawStunUrls)
    value.stunUrl = value.stunUrls[0]

    return value as {
      rendezvousUrl: string
      sessionId: string
      secret: string
      stunUrls: string[]
      stunUrl: string
    }
  } catch (error) {
    if (error instanceof Error && error.message) throw error
    throw new Error('Mã kết nối không hợp lệ')
  }
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.webContents.setWebRTCUDPPortRange({ min: VIEWER_UDP_PORT, max: VIEWER_UDP_PORT })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (!pendingAuthCode || !mainWindow) return
    const { eventName, code } = pendingAuthCode
    pendingAuthCode = null
    mainWindow.webContents.send(eventName, code)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  registerAuthIpc()
  ipcMain.handle('remote-share:startHost', (_event, input) => startHost(input))
  ipcMain.handle('remote-share:stopHost', () => stopHost())
  ipcMain.handle('remote-share:openViewer', (_event, invite) => openViewer(invite))
  ipcMain.on('remote-share:log', (_event, text: unknown) => {
    if (typeof text === 'string' && text.length > 0) broadcastHostLog(`[VIEWER] ${text}\n`)
  })
  ipcMain.handle('remote-share:openLogs', () => {
    openLogWindow()
    return true
  })
  ipcMain.handle('remote-share:stopViewer', () => {
    stopViewerNatMapping()
    return true
  })

  createWindow()
  const authUrl = process.argv.find((argument) => argument.startsWith(`${AUTH_PROTOCOL}://`))
  if (authUrl) handleAuthDeepLink(authUrl)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopHost()
  stopViewerNatMapping()
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthDeepLink(url)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
