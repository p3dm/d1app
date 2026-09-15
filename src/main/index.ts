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
const HOST_UDP_PORT = 49000
const VIEWER_UDP_PORT = 49001
const viewerWindows: BrowserWindow[] = []

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
    resolve(process.cwd(), 'src/main/agent/dist/agent/src/index.js'),
    resolve(process.cwd(), 'src/main/agent/agent.cjs'),
    resolve(app.getAppPath(), 'src/main/agent/dist/agent/src/index.js'),
    resolve(app.getAppPath(), 'src/main/agent/agent.cjs'),
    resolve(__dirname, '../agent/dist/agent/src/index.js'),
    resolve(__dirname, '../agent/agent.cjs')
  ]
  return findExistingFile(candidates, 'agent entry')
}

function getWebViewerFile(): string {
  const candidates = [
    resolve(process.cwd(), 'src/main/web/dist/index.html'),
    resolve(app.getAppPath(), 'src/main/web/dist/index.html'),
    resolve(__dirname, '../web/dist/index.html')
  ]
  return findExistingFile(candidates, 'web/dist/index.html')
}

function startHost(input: { rendezvousUrl?: string; stunUrl?: string } = {}): {
  invite: string
  sessionId: string
} {
  stopHost()
  const runtimeLabel = `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`
  mainWindow?.webContents.send('host:log', `[RUNTIME] ${runtimeLabel}\n`)

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

  forwardHostLog(hostProcess.stdout, false)
  forwardHostLog(hostProcess.stderr, false)

  hostProcess.once('exit', (code) => {
    mainWindow?.webContents.send('host:log', `[HOST] stopped (${code ?? 'unknown'})\n`)
    hostProcess = null
  })

  const invite = Buffer.from(
    JSON.stringify({
      v: 1,
      rendezvousUrl,
      stunUrl: stunUrls[0],
      stunUrls,
      sessionId,
      secret
    })
  ).toString('base64url')

  return { invite, sessionId }
}

function stopHost(): boolean {
  if (!hostProcess) return false
  hostProcess.kill()
  hostProcess = null
  return true
}

function openViewer(encodedInvite: string): boolean {
  const invite = parseInvite(encodedInvite)
  void startViewerNatMapping().catch((error: Error) => {
    mainWindow?.webContents.send('host:log', `[VIEWER NAT] ${error.message}\n`)
  })
  createViewerWindow(invite, false)
  return true
}

function createViewerWindow(
  invite: {
    rendezvousUrl: string
    sessionId: string
    secret: string
    stunUrls: string[]
    stunUrl: string
  },
  logToConsole: boolean
): BrowserWindow {
  const viewer = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#101214',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })

  viewer.webContents.setWebRTCUDPPortRange({ min: VIEWER_UDP_PORT, max: VIEWER_UDP_PORT })
  viewer.removeMenu()

  const viewerLog = (level: string, message: string): void => {
    const line = `${new Date().toISOString()} [VIEWER:${level}] ${message}\n`
    mainWindow?.webContents.send('host:log', line)
    if (logToConsole) process.stdout.write(line)
  }

  viewer.webContents.on('console-message', (_event, level, message) => {
    viewerLog(String(level), message)
  })

  viewer.webContents.on('render-process-gone', (_event, details) => {
    viewerLog('error', `renderer gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  viewer.webContents.on('did-fail-load', (_event, code, description) => {
    viewerLog('error', `load failed code=${code} detail=${description}`)
  })

  viewer.on('unresponsive', () => viewerLog('warn', 'window unresponsive'))
  viewer.on('responsive', () => viewerLog('info', 'window responsive again'))
  viewer.on('closed', () => {
    viewerLog('info', 'window closed')
    const index = viewerWindows.indexOf(viewer)
    if (index >= 0) viewerWindows.splice(index, 1)
  })

  viewerWindows.push(viewer)

  void viewer.loadFile(getWebViewerFile(), {
    query: {
      signal: invite.rendezvousUrl,
      session: invite.sessionId,
      secret: invite.secret
    }
  })

  viewer.webContents.once('did-finish-load', () => {
    viewerLog(
      'info',
      `window loaded; Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`
    )
  })

  return viewer
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
    let timeout: NodeJS.Timeout | undefined

    const finish = (value: boolean | Error, shouldReject = false): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (shouldReject) reject(value as Error)
      else resolve(value as boolean)
    }

    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString()
      output = (output + text).slice(-8192)
      mainWindow?.webContents.send('host:log', `[VIEWER NAT] ${text}`)
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

    timeout = setTimeout(() => finish(false), 20_000)
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
    mainWindow?.webContents.send('host:log', text)
    if (logToConsole) process.stdout.write(text)
  })
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
