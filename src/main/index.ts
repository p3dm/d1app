import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAuthIpc } from './ipc/auth'

const AUTH_PROTOCOL = 'd1app'
let mainWindow: BrowserWindow | null = null
let pendingAuthCode: { eventName: string; code: string } | null = null

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

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthDeepLink(url)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
