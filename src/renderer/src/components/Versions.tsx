import { useState, useEffect, useRef, useCallback } from 'react'

const THEME_ICON_DARK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

const THEME_ICON_LIGHT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const TOAST_ICONS = {
  success: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

let toastId = 0

type Toast = {
  id: number
  type: keyof typeof TOAST_ICONS
  title: string
  msg: string
}

interface VersionsProps {
  onRegister: () => void
  onGoogleSignIn: () => void
  onAuthenticated: (user: unknown) => void
  onForgotPassword: () => void
}

function Versions({
  onRegister,
  onGoogleSignIn,
  onAuthenticated,
  onForgotPassword
}: VersionsProps): React.JSX.Element {
  const [theme, setTheme] = useState('dark')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
    usernameRef.current?.focus()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toast = useCallback((type, title, msg) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, type, title, msg }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const closeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const toggleTheme = () => setTheme((d) => (d === 'dark' ? 'light' : 'dark'))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = { username: '', password: '' }
    let hasError = false

    if (!username.trim()) {
      nextErrors.username = 'Username is required.'
      hasError = true
    }
    if (!password) {
      nextErrors.password = 'Password is required.'
      hasError = true
    }
    setErrors(nextErrors)
    if (hasError) return

    setLoading(true)
    try {
      const r = await window.api.auth.signIn(username.trim(), password)

      if (r.ok) {
        toast('success', 'Signed in', 'Redirecting to dashboard...')
        onAuthenticated(r.data.user)
      } else {
        setErrors({
          username: r.error || '',
          password: r.error || ''
        })
        toast('error', 'Login failed', r.error || 'Invalid username or password.')
      }
    } catch {
      toast('error', 'Connection failed', 'Please check whether the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <main>
        <div className="section" id="sec-login">
          <div className="section-header">
            <div className="section-title">Welcome back</div>
            <div className="section-subtitle">Sign in to access the Tool Controller dashboard.</div>
          </div>
          <div className="section-body">
            <form id="login-form" noValidate onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  ref={usernameRef}
                  className={`input${errors.username ? ' has-error' : ''}`}
                  type="text"
                  id="username"
                  name="username"
                  placeholder="Enter your username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                {errors.username && <div className="field-error show">{errors.username}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrap">
                  <input
                    className={`input has-icon${errors.password ? ' has-error' : ''}`}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="input-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
                {errors.password && <div className="field-error show">{errors.password}</div>}
              </div>

              <div className="row-between">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    id="remember"
                    name="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <a
                  href="#forgot-password"
                  className="link"
                  onClick={(event) => {
                    event.preventDefault()
                    onForgotPassword()
                  }}
                >
                  Forgot password?
                </a>
              </div>

              <button type="submit" className="btn btn-primary" id="btn-login" disabled={loading}>
                {loading ? (
                  <>
                    <div className="spinner" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Sign In
                  </>
                )}
              </button>
            </form>
            <button type="button" className="btn google-button" onClick={onGoogleSignIn}>
              Continue with Google
            </button>
          </div>
        </div>

        <div className="footer-note">
          Don&apos;t have access?{' '}
          <a
            href="#register"
            onClick={(event) => {
              event.preventDefault()
              onRegister()
            }}
          >
            Create an account
          </a>
        </div>
      </main>

      <div className="toast-container" aria-live="assertive" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div className={`toast-icon ${t.type}`}>{TOAST_ICONS[t.type] || TOAST_ICONS.info}</div>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.msg && <div className="toast-msg">{t.msg}</div>}
            </div>
            <button className="toast-close" aria-label="Close" onClick={() => closeToast(t.id)}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Versions
