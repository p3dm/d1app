import { FormEvent, useState } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { isValidPhoneNumber } from 'libphonenumber-js'
import flags from 'react-phone-number-input/flags'

interface SignUpInput {
  name: string
  number: string
  region: string
  email: string
  password: string
}

interface RegisterProps {
  onBack: () => void
  onWaitingForConfirmation: (email: string) => void
}

function Register({ onBack, onWaitingForConfirmation }: RegisterProps): React.JSX.Element {
  const [phone, setPhone] = useState<string | undefined>()

  const [form, setForm] = useState<SignUpInput>({
    name: '',
    number: '',
    region: 'VN',
    email: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (field: keyof SignUpInput, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!form.name.trim() || !form.email.trim() || !form.password || !form.region || !phone) {
      setError('Please complete all required fields.')
      return
    }
    if (!isValidPhoneNumber(phone)) {
      setError('Please enter a valid phone number.')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.auth.signUp({ ...form, number: phone })
      if (!result.ok) {
        setError(result.error ?? 'Registration failed.')
        return
      }

      if (!result.data?.user) {
        onWaitingForConfirmation(form.email)
      } else {
        setMessage(result.data.message)
        setForm({ name: '', number: '', region: '', email: '', password: '' })
      }
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <main>
        <div className="section">
          <div className="section-header">
            <div className="section-title">Create account</div>
            <div className="section-subtitle">Enter your details to get started.</div>
          </div>

          <form className="section-body register-form" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <label className="form-group">
                Name
                <input
                  className="input"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </label>
              <label className="form-group phone-field">
                Phone number
                <PhoneInput
                  className="phone-input-control"
                  flags={flags}
                  international
                  defaultCountry="US"
                  value={phone}
                  onChange={setPhone}
                  onCountryChange={(country) => updateField('region', country ?? '')}
                  placeholder="Your phone number"
                />
              </label>
              <label className="form-group">
                Email
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              <label className="form-group">
                Password
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
              </label>
            </div>

            {error && <div className="form-message error">{error}</div>}
            {message && <div className="form-message success">{message}</div>}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        <div className="footer-note">
          Already have an account?{' '}
          <a
            href="#login"
            onClick={(event) => {
              event.preventDefault()
              onBack()
            }}
          >
            Sign in
          </a>
        </div>
      </main>
    </div>
  )
}

export default Register
