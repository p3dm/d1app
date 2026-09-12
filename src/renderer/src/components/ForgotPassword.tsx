import { FormEvent, useState } from 'react'

interface ForgotPasswordProps {
  onBack: () => void
  onSent: (email: string) => void
}

function ForgotPassword({ onBack, onSent }: ForgotPasswordProps): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.auth.forgotPassword(email.trim())
      if (!result.ok) {
        setError(result.error ?? 'Unable to send reset email.')
        return
      }
      setMessage('Reset link sent. Please check your email.')
      onSent(email.trim())
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to send reset email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <main>
        <section className="section">
          <div className="section-header">
            <div className="section-title">Forgot password</div>
            <div className="section-subtitle">Enter your email to receive a reset link.</div>
          </div>
          <form className="section-body register-form" onSubmit={handleSubmit} noValidate>
            <label className="form-group">
              Email
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            {error && <div className="form-message error">{error}</div>}
            {message && <div className="form-message success">{message}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
          <div className="footer-note">
            <a
              href="#login"
              onClick={(event) => {
                event.preventDefault()
                onBack()
              }}
            >
              Back to sign in
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}

export default ForgotPassword
