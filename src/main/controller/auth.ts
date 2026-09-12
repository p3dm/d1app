import { supabase } from '../db/supabase'

const SELF_ASSIGNABLE_ROLES = ['A', 'B'] as const
type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number]

export interface SafeUser {
  user_id: string
  id?: string | number
  email: string
  full_name?: string | null
  age?: number | null
  created_at?: string
  job_field?: string | null
  avatar_url?: string | null
  number?: string | null
  roles: string[]
}

export interface UserInfo {
  name: string
  email: string
  number: string
}

export interface SignUpInput {
  email: string
  password: string
  name: string
  region: string
  number: string
}

export interface Result {
  message: string
  user: SafeUser | null
  expiresAt?: number
}

class AuthController {
  private async getSessionUser(): Promise<SafeUser | null> {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return null

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user?.email) return null

    const { data: userRow } = await supabase
      .from('users')
      .select('*')
      .eq('email', authData.user.email)
      .single()
    if (!userRow) return null

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('roles(role_name)')
      .eq('user_id', userRow.user_id)
    const roles = (roleRows ?? []).map((row: any) => row.roles?.role_name ?? '').filter(Boolean)

    const { password_hash: _passwordHash, ...safeFields } = userRow
    return { ...safeFields, roles } as SafeUser
  }

  private async userProfile(
    email: string,
    name: string,
    region: string,
    number: string
  ): Promise<void> {
    const { error } = await supabase.from('users').upsert({
      email,
      name,
      region,
      number,
      created_at: new Date().toISOString()
    })

    if (error) throw new Error(`Tạo user trong DB thất bại: ${error.message}`)
  }

  async signIn(email: string, password: string) {
    if (!email || !password) throw new Error('email và password là bắt buộc')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(`Đăng nhập thất bại: ${error.message}`)

    const user = await this.getSessionUser()
    if (!user) throw new Error('Không tìm thấy user trong hệ thống')
    return { message: 'Sign in successfully', user, expiresAt: data.session?.expires_at }
  }

  async updatePhone(number: string, region: string) {
    if (!number.trim() || !region.trim()) throw new Error('Phone number and region are required')

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw new Error('Invalid session or user not logged in')

    const { error } = await supabase.from('users').update({ number, region }).eq('user_id', userId)
    if (error) throw new Error(`Failed to save phone number: ${error.message}`)

    const user = await this.getSessionUser()
    if (!user) throw new Error('User information not found')
    return { message: 'Phone number saved successfully', user }
  }

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'd1app://auth/google-callback',
        skipBrowserRedirect: true
      }
    })

    if (error || !data.url) {
      throw new Error(`Đăng nhập Google thất bại: ${error?.message ?? 'Không có OAuth URL'}`)
    }

    return { message: 'Đã mở đăng nhập Google', url: data.url }
  }

  async signUp(input: SignUpInput) {
    const { email, password, name, region, number } = input
    if (!email || !password || !name || !region || !number) {
      throw new Error('email, password, name, region và number là bắt buộc')
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, number, region },
        emailRedirectTo: 'd1app://auth/confirm'
      }
    })
    if (error) throw new Error(`Đăng ký thất bại: ${error.message}`)
    if (!data.session) {
      return {
        message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.',
        user: null
      }
    }

    await this.userProfile(email, name, region, number)
    return { message: 'Đăng ký thành công', user: await this.getSessionUser() }
  }

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(`Đăng xuất thất bại: ${error.message}`)
    return { message: 'Đã đăng xuất' }
  }

  async forgotPassword(email: string) {
    if (!email) throw new Error('email là bắt buộc')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'd1app://auth/reset-password'
    })
    if (error) throw new Error(`Gửi email reset thất bại: ${error.message}`)
    return { message: 'Đã gửi email reset mật khẩu. Vui lòng kiểm tra hộp thư.' }
  }

  async preparePasswordReset(callbackUrl: string) {
    const parsedUrl = new URL(callbackUrl)
    const params = new URLSearchParams(parsedUrl.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) {
      throw new Error('Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })
    if (error || !data.session) throw new Error('Không thể tạo phiên đặt lại mật khẩu')
    return { message: 'Bạn có thể đặt mật khẩu mới' }
  }

  async resetPassword(newPassword: string) {
    if (!newPassword) throw new Error('Mật khẩu mới là bắt buộc')

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) throw new Error(`Đặt lại mật khẩu thất bại: ${error.message}`)

    return { message: 'Đặt lại mật khẩu thành công!' }
  }

  async changePassword(oldPassword: string, newPassword: string) {
    const currentUser = await this.getSessionUser()
    if (!currentUser) throw new Error('Chưa đăng nhập hoặc phiên đã hết hạn')
    if (!oldPassword || !newPassword) {
      throw new Error('old_password và new_password là bắt buộc')
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: oldPassword
    })
    if (verifyError) throw new Error('Mật khẩu cũ không đúng')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(`Đổi mật khẩu thất bại: ${error.message}`)
    return { message: 'Đã đổi mật khẩu thành công!' }
  }

  async confirmEmail(code: string) {
    if (!code) throw new Error('Thiếu mã code xác nhận từ Supabase')

    let data
    let error
    if (code.startsWith('d1app://')) {
      const callbackUrl = new URL(code)
      const fragment = new URLSearchParams(callbackUrl.hash.slice(1))
      const accessToken = fragment.get('access_token')
      const refreshToken = fragment.get('refresh_token')
      if (!accessToken || !refreshToken) {
        throw new Error('Callback không chứa access token hoặc refresh token')
      }

      const result = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })
      data = result.data
      error = result.error
    } else if (code.startsWith('token_hash:')) {
      const [, type, tokenHash] = code.split(':')
      const result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'signup'
      })
      data = result.data
      error = result.error
    } else {
      const result = await supabase.auth.exchangeCodeForSession(code)
      data = result.data
      error = result.error
    }

    if (error) throw new Error(`Xác nhận email thất bại: ${error.message}`)
    if (!data.session) throw new Error('Không thể tạo phiên đăng nhập sau xác nhận')

    const metadata = data.user?.user_metadata ?? {}
    await this.userProfile(
      data.user.email ?? '',
      metadata.full_name ?? '',
      metadata.region ?? '',
      metadata.number ?? ''
    )

    return { message: 'Email đã xác nhận thành công!', user: await this.getSessionUser() }
  }

  async resendConfirmation(email: string) {
    if (!email) throw new Error('email là bắt buộc')
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) throw new Error(`Gửi lại email thất bại: ${error.message}`)
    return { message: 'Đã gửi lại email xác nhận. Vui lòng kiểm tra hộp thư.' }
  }

  async getMe() {
    const user = await this.getSessionUser()
    if (!user) throw new Error('Chưa đăng nhập hoặc phiên đã hết hạn')
    return { user }
  }

  async selfAssignRole(role: SelfAssignableRole) {
    if (!SELF_ASSIGNABLE_ROLES.includes(role)) {
      throw new Error("Chỉ được chọn role 'A' (Advertiser) hoặc 'B' (Publisher)")
    }
    const user = await this.getSessionUser()
    if (!user) throw new Error('Chưa đăng nhập hoặc phiên đã hết hạn')

    const { data: roleRow, error: roleError } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', role)
      .single()
    if (roleError || !roleRow) throw new Error(`Role '${role}' chưa được tạo trong DB`)

    const { error } = await supabase
      .from('user_roles')
      .upsert(
        { user_id: user.user_id, role_id: roleRow.role_id },
        { onConflict: 'user_id,role_id' }
      )
    if (error) throw new Error(`Đăng ký role thất bại: ${error.message}`)

    const updatedUser = await this.getSessionUser()
    return { message: `Đã đăng ký role '${role}' thành công`, roles: updatedUser?.roles ?? [] }
  }

  async getRoles(email: string) {
    if (!email) throw new Error('Thiếu email')
    if (!(await this.getSessionUser())) throw new Error('Chưa đăng nhập hoặc phiên đã hết hạn')

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('email', email)
      .single()
    if (userError || !userRow) throw new Error('Không tìm thấy user')

    const { data: roleRows, error } = await supabase
      .from('user_roles')
      .select('roles(role_name)')
      .eq('user_id', userRow.user_id)
    if (error) throw new Error(`Lấy role thất bại: ${error.message}`)
    const roles = (roleRows ?? []).map((row: any) => row.roles?.role_name ?? '').filter(Boolean)
    return { email, roles }
  }
}

export const authController = new AuthController()
