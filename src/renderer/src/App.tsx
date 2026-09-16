import Versions from './components/Versions'
import Register from './components/Register'
import ConfirmEmail from './components/ConfirmEmail'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import ControlCenter from './ControlCenter'
import PhoneShared, { type SharedPhone } from './PhoneShared'
import AppLayout from './layout/AppLayout'
import { useAuth } from './auth/AuthContext'
import React, { useState, useCallback } from 'react'

function App(): React.JSX.Element {
  const { loading: authLoading, setAuthenticated, signOut } = useAuth()
  const [page, setPage] = useState<'login' | 'register' | 'confirm' | 'forgot' | 'reset'>('login')
  const [authen] = useState('true')
  const [pendingEmail, setPendingEmail] = useState('')
  const [confirmError] = useState('')
  const [activeId, setActiveId] = useState('control-center')
  const [sharedPhones, setSharedPhones] = useState<SharedPhone[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

  const handleSelectedDevice = useCallback((deviceId: string): void => {
    setSelectedDeviceId(deviceId || null)
    if (!deviceId) return

    setSelectedIds((previous) => (previous.includes(deviceId) ? previous : [...previous, deviceId]))
  }, [])

  const handleAuthenticated = useCallback(
    (user: unknown) => {
      setAuthenticated(user)
    },
    [setAuthenticated]
  )

  // React.useEffect(() => {
  //   const handleAuthCode = async (code: string) => {
  //     setConfirmError('')
  //     let result
  //     try {
  //       result = await window.api.auth.confirmEmail(code)
  //     } catch (error) {
  //       setConfirmError(error instanceof Error ? error.message : 'Email confirmation failed.')
  //       setPage('confirm')
  //       return
  //     }

  //     if (result.ok) {
  //       const data = result.data as { user?: unknown } | undefined
  //       handleAuthenticated(data?.user ?? null)
  //     } else {
  //       setConfirmError(result.error ?? 'Email confirmation failed.')
  //       setPage('confirm')
  //     }
  //   }

  //   const removeEmailListener = window.api.auth.onConfirmEmail(handleAuthCode)
  //   const removeGoogleListener = window.api.auth.onGoogleAuth(handleAuthCode)
  //   const removeResetListener = window.api.auth.onResetPassword(async (callbackUrl) => {
  //     const result = await window.api.auth.preparePasswordReset(callbackUrl)
  //     if (result.ok) {
  //       setPage('reset')
  //     } else {
  //       setConfirmError(result.error ?? 'Password reset link is invalid or expired.')
  //       setPage('forgot')
  //     }
  //   })
  //   return () => {
  //     removeEmailListener()
  //     removeGoogleListener()
  //     removeResetListener()
  //   }
  // }, [handleAuthenticated])

  if (authLoading) return <div className="app auth-loading">Loading...</div>
  if (authen == 'true') {
    // const profile = user as { number?: string | null } | null
    // if (!profile?.number?.trim()) {
    //   return <CompleteProfile onComplete={(nextUser) => setAuthenticated(nextUser)} />
    // }
    return (
      <AppLayout
        activeId={activeId}
        onNavigate={setActiveId}
        sharedPhones={sharedPhones}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onSelectedDevice={handleSelectedDevice}
      >
        {activeId === 'phone-shared' ? (
          <PhoneShared
            phones={sharedPhones}
            onPhonesChange={setSharedPhones}
            selectedDeviceId={selectedDeviceId}
            onSelectedDevice={handleSelectedDevice}
          />
        ) : (
          <ControlCenter />
        )}
      </AppLayout>
    )
  }

  if (page === 'confirm') {
    return (
      <ConfirmEmail email={pendingEmail} error={confirmError} onBack={() => setPage('login')} />
    )
  }
  if (page === 'reset') {
    return (
      <ResetPassword
        onCompleted={async () => {
          await signOut()
          setPage('login')
        }}
      />
    )
  }
  if (page === 'forgot') {
    return <ForgotPassword onBack={() => setPage('login')} onSent={() => setPage('forgot')} />
  }
  if (page === 'register') {
    return (
      <Register
        onBack={() => setPage('login')}
        onWaitingForConfirmation={(email) => {
          setPendingEmail(email)
          setPage('confirm')
        }}
      />
    )
  }
  return (
    <Versions
      onRegister={() => setPage('register')}
      onAuthenticated={handleAuthenticated}
      onForgotPassword={() => setPage('forgot')}
      onGoogleSignIn={() => {
        void window.api.auth.signInWithGoogle()
      }}
    />
  )
}

export default App
