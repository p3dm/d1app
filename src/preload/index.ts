import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SignUpInput } from '../main/controller/auth'

// Custom APIs for renderer
const api = {
  auth: {
    signIn: (email: string, password: string) => ipcRenderer.invoke('auth:signIn', email, password),
    updatePhone: (number: string) => ipcRenderer.invoke('auth:updatePhone', number),
    signInWithGoogle: () => ipcRenderer.invoke('auth:signInWithGoogle'),
    signUp: (input: SignUpInput) => ipcRenderer.invoke('auth:signUp', input),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    forgotPassword: (email: string) => ipcRenderer.invoke('auth:forgotPassword', email),
    preparePasswordReset: (callbackUrl: string) =>
      ipcRenderer.invoke('auth:preparePasswordReset', callbackUrl),
    resetPassword: (newPassword: string) => ipcRenderer.invoke('auth:resetPassword', newPassword),
    changePassword: (oldPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', oldPassword, newPassword),
    confirmEmail: (code: string) => ipcRenderer.invoke('auth:confirmEmail', code),
    resendConfirmation: (email: string) => ipcRenderer.invoke('auth:resendConfirmation', email),
    getMe: () => ipcRenderer.invoke('auth:getMe'),
    onConfirmEmail: (callback: (code: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, code: string) => callback(code)
      ipcRenderer.on('auth:confirm', listener)
      return () => ipcRenderer.removeListener('auth:confirm', listener)
    },
    onGoogleAuth: (callback: (code: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, code: string) => callback(code)
      ipcRenderer.on('auth:google', listener)
      return () => ipcRenderer.removeListener('auth:google', listener)
    },
    onResetPassword: (callback: (callbackUrl: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, callbackUrl: string) =>
        callback(callbackUrl)
      ipcRenderer.on('auth:reset', listener)
      return () => ipcRenderer.removeListener('auth:reset', listener)
    },
    selfAssignRole: (role: 'A' | 'B') => ipcRenderer.invoke('auth:selfAssignRole', role),
    getRoles: (email: string) => ipcRenderer.invoke('auth:getRoles', email)
  },
  remoteShare: {
    startHost: (settings: { rendezvousUrl?: string; stunUrl?: string }) =>
      ipcRenderer.invoke('remote-share:startHost', settings),
    stopHost: () => ipcRenderer.invoke('remote-share:stopHost'),
    openViewer: (invite: string) => ipcRenderer.invoke('remote-share:openViewer', invite),
    writeLog: (text: string) => ipcRenderer.send('remote-share:log', text),
    openLogs: () => ipcRenderer.invoke('remote-share:openLogs'),
    stopViewer: () => ipcRenderer.invoke('remote-share:stopViewer'),
    onHostLog: (callback: (text: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
      ipcRenderer.on('host:log', listener)
      return () => ipcRenderer.removeListener('host:log', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
