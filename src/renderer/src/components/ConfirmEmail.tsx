interface ConfirmEmailProps {
  email: string
  error?: string
  onBack: () => void
}

function ConfirmEmail({ email, error, onBack }: ConfirmEmailProps): React.JSX.Element {
  return (
    <div className="app">
      <main>
        <section className="section confirm-card">
          <div className="section-header">
            <div className="section-title">Confirm your email</div>
            <div className="section-subtitle">
              We sent a confirmation link to <strong>{email}</strong>.
            </div>
          </div>
          <div className="section-body confirm-body">
            {error ? (
              <div className="form-message error">{error}</div>
            ) : (
              <>
                <div className="confirm-spinner" aria-label="Waiting for email confirmation" />
                <p>Open the email in your browser and click the confirmation link.</p>
                <p className="confirm-hint">
                  This window will open the dashboard automatically after confirmation.
                </p>
              </>
            )}
            <button className="btn btn-primary" type="button" onClick={onBack}>
              Back to sign in
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default ConfirmEmail
