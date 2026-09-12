import { useState, FormEvent, useCallback } from 'react'
interface ResetPasswordProps {
  onCompleted: () => void
  error?: string
}

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

function ResetPassword({
  onCompleted,
  error: callbackError
}: ResetPasswordProps): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState(callbackError ?? '')
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const result = await window.api.auth.resetPassword(password)
      if (!result.ok) {
        setError(result.error ?? 'Unable to reset password.')
        return
      }
      toast('success', 'Password reset', 'Your password has been reset successfully.')
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await onCompleted()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to reset password.')
    } finally {
      setLoading(false)
    }
  }
  const toast = useCallback((type, title, msg) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, type, title, msg }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const closeToast = (id): void => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <div className="app">
      <main>
        <section className="section">
          <div className="section-header">
            <div className="section-title">Set a new password</div>
            <div className="section-subtitle">Choose a new password for your account.</div>
          </div>
          <form className="section-body register-form" onSubmit={handleSubmit} noValidate>
            <label className="form-group">
              New password
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="form-group">
              Confirm password
              <input
                className="input"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            {error && <div className="form-message error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save new password'}
            </button>
          </form>
        </section>
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

export default ResetPassword
