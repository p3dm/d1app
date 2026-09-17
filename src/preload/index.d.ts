import { ElectronAPI } from '@electron-toolkit/preload'
import type { Result, SignUpInput, UserInfo } from '../main/controller/auth'
import type { ResponseBase } from '../main/types/responseBase'

interface Api {
  auth: {
    signIn: (email: string, password: string) => Promise<ResponseBase<Result>>
    updatePhone: (number: string, region: string) => Promise<ResponseBase<Result>>
    signInWithGoogle: () => Promise<ResponseBase<{ message: string; url: string }>>
    signUp: (input: SignUpInput) => Promise<ResponseBase<Result>>
    signOut: () => Promise<ResponseBase<unknown>>
    forgotPassword: (email: string) => Promise<ResponseBase<unknown>>
    preparePasswordReset: (callbackUrl: string) => Promise<ResponseBase<unknown>>
    resetPassword: (newPassword: string) => Promise<ResponseBase<unknown>>
    changePassword: (oldPassword: string, newPassword: string) => Promise<ResponseBase<unknown>>
    confirmEmail: (code: string) => Promise<ResponseBase<unknown>>
    onConfirmEmail: (callback: (code: string) => void) => () => void
    onGoogleAuth: (callback: (code: string) => void) => () => void
    onResetPassword: (callback: (callbackUrl: string) => void) => () => void
    resendConfirmation: (email: string) => Promise<ResponseBase<unknown>>
    getMe: () => Promise<ResponseBase<UserInfo>>
    selfAssignRole: (role: 'A' | 'B') => Promise<ResponseBase<unknown>>
    getRoles: (email: string) => Promise<ResponseBase<unknown>>
  }
  remoteShare: {
    startHost: (settings: { rendezvousUrl?: string; stunUrl?: string }) => Promise<{
      invite: string
      sessionId: string
    }>
    stopHost: () => Promise<boolean>
    openViewer: (invite: string) => Promise<{
      rendezvousUrl: string
      sessionId: string
      secret: string
    }>
    writeLog: (text: string) => void
    openLogs: () => Promise<boolean>
    stopViewer: () => Promise<boolean>
    onHostLog: (callback: (text: string) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
