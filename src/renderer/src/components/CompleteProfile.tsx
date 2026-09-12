import { FormEvent, useState } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { isValidPhoneNumber } from 'libphonenumber-js'
import flags from 'react-phone-number-input/flags'

interface CompleteProfileProps {
  onComplete: (user: unknown) => void
}

function CompleteProfile({ onComplete }: CompleteProfileProps): React.JSX.Element {
  const [region, setRegion] = useState('VN')
  const [number, setNumber] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!number || !region.trim() || !isValidPhoneNumber(number)) {
      setError('Phone number and region are required.')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.auth.updatePhone(number.trim(), region.trim())
      if (!result.ok) {
        setError(result.error ?? 'Unable to save phone number and region.')
        return
      }
      onComplete(result.data.user)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save phone number and region.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <main>
        <section className="section">
          <div className="section-header">
            <div className="section-title">Complete your profile</div>
            <div className="section-subtitle">Add your phone number before continuing.</div>
          </div>
          <form className="section-body register-form" onSubmit={handleSubmit} noValidate>
            <label className="form-group phone-field">
              Phone number
              <PhoneInput
                className="phone-input-control"
                international
                defaultCountry="US"
                flags={flags}
                value={number}
                onChange={setNumber}
                onCountryChange={(country) => setRegion(country ?? '')}
                placeholder="Your phone number"
              />
            </label>
            {error && <div className="form-message error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}

export default CompleteProfile
