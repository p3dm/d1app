const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { randomBytes } = require('node:crypto')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const projectRoot = app.isPackaged ? __dirname : path.resolve(__dirname, '..')
const HOST_UDP_PORT = 49000
const VIEWER_UDP_PORT = 49001
let mainWindow
let hostProcess
let viewerNatProcess
let viewerNatReady

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#101214',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.removeMenu()
  void mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  const smokeRendezvousUrl = process.env.RENDEZVOUS_URL ?? 'ws://127.0.0.1:8443/rendezvous'
  const smokeStunUrl = process.env.STUN_URL ?? 'stun:127.0.0.1:3478'
  if (process.argv.includes('--host-smoke')) {
    createWindow()
    mainWindow.webContents.once('did-finish-load', () => {
      const result = startHost(
        {
          rendezvousUrl: smokeRendezvousUrl,
          stunUrl: smokeStunUrl
        },
        {
          sessionId: 'packagetest1',
          secret: 'fedcba9876543210fedcba9876543210',
          logToConsole: true
        }
      )
      console.log(`[HOST] smoke started session=${result.sessionId}`)
    })
  } else if (process.argv.includes('--viewer-smoke-package')) {
    await startViewerNatMapping()
    createViewerWindow(
      {
        rendezvousUrl: smokeRendezvousUrl,
        stunUrl: smokeStunUrl,
        stunUrls: [smokeStunUrl],
        sessionId: 'packagetest1',
        secret: 'fedcba9876543210fedcba9876543210'
      },
      true
    )
  } else if (process.argv.includes('--viewer-smoke')) {
    await startViewerNatMapping()
    createViewerWindow(
      {
        rendezvousUrl: smokeRendezvousUrl,
        stunUrl: smokeStunUrl,
        stunUrls: [smokeStunUrl],
        sessionId: 'localtest1',
        secret: '0123456789abcdef0123456789abcdef'
      },
      true
    )
  } else createWindow()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  stopHost()
  stopViewerNatMapping()
})

ipcMain.handle('host:start', (_event, input) => {
  return startHost(input)
})

function startHost(input, forced = {}) {
  stopHost()
  const runtimeLabel = `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`
  mainWindow?.webContents.send('host:log', `[RUNTIME] ${runtimeLabel}\n`)
  if (forced.logToConsole) console.log(`[RUNTIME] ${runtimeLabel}`)
  const rendezvousUrl = validUrl(input?.rendezvousUrl, ['ws:', 'wss:'])
  const stunUrls = validStunUrls(input?.stunUrl)
  const sessionId = forced.sessionId ?? randomBytes(12).toString('base64url')
  const secret = forced.secret ?? randomBytes(32).toString('base64url')
  const agentEntry = getAgentEntry()
  const scrcpyServer = path.join(projectRoot, 'agent', 'assets', 'scrcpy-server-v3.3.1')
  if (!fs.existsSync(agentEntry)) throw new Error('Chưa build Agent. Chạy npm run build trước.')

  const adbCandidates = [
    process.env.ADB_PATH,
    path.join(projectRoot, 'tools', 'platform-tools', 'adb.exe'),
    path.join(projectRoot, 'release', 'AndroidRemotePortable', 'tools', 'platform-tools', 'adb.exe')
  ].filter(Boolean)
  const adbPath = adbCandidates.find((candidate) => fs.existsSync(candidate))
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
    SCRCPY_SERVER_PATH: scrcpyServer,
    SCRCPY_GRID_MAX_SIZE: process.env.SCRCPY_GRID_MAX_SIZE ?? '480',
    SCRCPY_GRID_MAX_FPS: process.env.SCRCPY_GRID_MAX_FPS ?? '5',
    SCRCPY_GRID_VIDEO_BIT_RATE: process.env.SCRCPY_GRID_VIDEO_BIT_RATE ?? '150000',
    SCRCPY_FOCUS_MAX_SIZE: process.env.SCRCPY_FOCUS_MAX_SIZE ?? '720',
    SCRCPY_FOCUS_MAX_FPS: process.env.SCRCPY_FOCUS_MAX_FPS ?? '30',
    SCRCPY_FOCUS_VIDEO_BIT_RATE: process.env.SCRCPY_FOCUS_VIDEO_BIT_RATE ?? '1500000',
    ...(adbPath ? { ADB_PATH: adbPath } : {})
  }
  hostProcess = spawn(process.execPath, [agentEntry], {
    cwd: projectRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  forwardHostLog(hostProcess.stdout, forced.logToConsole)
  forwardHostLog(hostProcess.stderr, forced.logToConsole)
  hostProcess.once('exit', (code) => {
    mainWindow?.webContents.send('host:log', `[HOST] stopped (${code ?? 'unknown'})`)
    hostProcess = undefined
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

ipcMain.handle('host:stop', () => stopHost())

ipcMain.handle('viewer:open', async (_event, encodedInvite) => {
  const invite = parseInvite(encodedInvite)
  // This optimization may take 10-20 seconds on unsupported routers. TURN is
  // now the reliable fallback, so mapping must never delay opening Viewer.
  void startViewerNatMapping().catch((error) => {
    mainWindow?.webContents.send('host:log', `[VIEWER NAT] ${error.message}\n`)
  })
  createViewerWindow(invite, false)
  return true
})

function createViewerWindow(invite, logToConsole) {
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
  const viewerLog = (level, message) => {
    const line = `${new Date().toISOString()} [VIEWER:${level}] ${message}\n`
    mainWindow?.webContents.send('host:log', line)
    if (logToConsole) process.stdout.write(line)
  }
  viewer.webContents.on('console-message', (event) => viewerLog(event.level, event.message))
  viewer.webContents.on('render-process-gone', (_event, details) => {
    viewerLog('error', `renderer gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
  viewer.webContents.on('did-fail-load', (_event, code, description) => {
    viewerLog('error', `load failed code=${code} detail=${description}`)
  })
  viewer.on('unresponsive', () => viewerLog('warn', 'window unresponsive'))
  viewer.on('responsive', () => viewerLog('info', 'window responsive again'))
  viewer.on('closed', () => viewerLog('info', 'window closed'))
  void viewer.loadFile(path.join(projectRoot, 'web', 'dist', 'index.html'), {
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

function getAgentEntry() {
  return app.isPackaged
    ? path.join(projectRoot, 'agent', 'agent.cjs')
    : path.join(projectRoot, 'agent', 'dist', 'agent', 'src', 'index.js')
}

function startViewerNatMapping() {
  if (viewerNatProcess && viewerNatReady) return viewerNatReady
  const agentEntry = getAgentEntry()
  if (!fs.existsSync(agentEntry)) throw new Error('Agent has not been built')

  const child = spawn(process.execPath, [agentEntry], {
    cwd: projectRoot,
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
  viewerNatReady = new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    let timeout
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }
    const onData = (chunk) => {
      const text = chunk.toString()
      output = (output + text).slice(-8_192)
      mainWindow?.webContents.send('host:log', `[VIEWER NAT] ${text}`)
      if (output.includes(`viewer UDP ${VIEWER_UDP_PORT} mapping helper ready`))
        finish(resolve, true)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      if (viewerNatProcess === child) {
        viewerNatProcess = undefined
        viewerNatReady = undefined
      }
      finish(reject, new Error(`Viewer NAT helper stopped (${code ?? 'unknown'})`))
    })
    timeout = setTimeout(() => finish(resolve, false), 20_000)
  })
  return viewerNatReady
}

function stopViewerNatMapping() {
  const child = viewerNatProcess
  viewerNatProcess = undefined
  viewerNatReady = undefined
  child?.kill()
}

function stopHost() {
  if (!hostProcess) return false
  hostProcess.kill()
  hostProcess = undefined
  return true
}

function forwardHostLog(stream, logToConsole = false) {
  stream?.on('data', (chunk) => {
    const text = chunk.toString()
    mainWindow?.webContents.send('host:log', text)
    if (logToConsole) process.stdout.write(text)
  })
}

function validUrl(raw, protocols) {
  if (typeof raw !== 'string') throw new Error('Thiếu URL rendezvous')
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('URL rendezvous không hợp lệ')
  }
  if (!protocols.includes(url.protocol)) throw new Error('Rendezvous phải dùng ws:// hoặc wss://')
  return url.toString()
}

function validStunUrls(raw) {
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

function parseInvite(raw) {
  try {
    const value = JSON.parse(Buffer.from(String(raw).trim(), 'base64url').toString('utf8'))
    if (value?.v !== 1 || typeof value.sessionId !== 'string' || typeof value.secret !== 'string')
      throw new Error()
    value.rendezvousUrl = validUrl(value.rendezvousUrl, ['ws:', 'wss:'])
    const rawStunUrls = Array.isArray(value.stunUrls) ? value.stunUrls.join(',') : value.stunUrl
    value.stunUrls = validStunUrls(rawStunUrls)
    value.stunUrl = value.stunUrls[0]
    return value
  } catch (error) {
    if (error instanceof Error && error.message) throw error
    throw new Error('Mã kết nối không hợp lệ')
  }
}
