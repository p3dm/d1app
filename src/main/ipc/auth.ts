import { ipcMain, shell } from 'electron'
import { authController, type SignUpInput } from '../controller/auth'
import type { ResponseBase } from '../types/responseBase'

async function resultOf<T>(operation: () => Promise<T>): Promise<ResponseBase<T>> {
  try {
    return { ok: true, data: await operation() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định'
    }
  }
}

export function registerAuthIpc(): void {
  ipcMain.handle('auth:signInWithGoogle', async () => {
    const result = await resultOf(() => authController.signInWithGoogle())
    if (result.ok) await shell.openExternal(result.data.url)
    return result
  })

  ipcMain.handle('auth:signIn', (_event, email: string, password: string) =>
    resultOf(() => authController.signIn(email, password))
  )
  ipcMain.handle('auth:updatePhone', (_event, number: string, region: string) =>
    resultOf(() => authController.updatePhone(number, region))
  )
  ipcMain.handle('auth:signUp', (_event, input: SignUpInput) =>
    resultOf(() => authController.signUp(input))
  )
  ipcMain.handle('auth:signOut', () => resultOf(() => authController.signOut()))
  ipcMain.handle('auth:forgotPassword', (_event, email: string) =>
    resultOf(() => authController.forgotPassword(email))
  )
  ipcMain.handle('auth:preparePasswordReset', (_event, callbackUrl: string) =>
    resultOf(() => authController.preparePasswordReset(callbackUrl))
  )
  ipcMain.handle('auth:resetPassword', (_event, newPassword: string) =>
    resultOf(() => authController.resetPassword(newPassword))
  )
  ipcMain.handle('auth:changePassword', (_event, oldPassword: string, newPassword: string) =>
    resultOf(() => authController.changePassword(oldPassword, newPassword))
  )
  ipcMain.handle('auth:confirmEmail', (_event, code: string) =>
    resultOf(() => authController.confirmEmail(code))
  )
  ipcMain.handle('auth:resendConfirmation', (_event, email: string) =>
    resultOf(() => authController.resendConfirmation(email))
  )
  ipcMain.handle('auth:getMe', () => resultOf(() => authController.getMe()))
  ipcMain.handle('auth:selfAssignRole', (_event, role: 'A' | 'B') =>
    resultOf(() => authController.selfAssignRole(role))
  )
  ipcMain.handle('auth:getRoles', (_event, email: string) =>
    resultOf(() => authController.getRoles(email))
  )
}
