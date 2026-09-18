import Versions from './components/Versions'
import Register from './components/Register'
import ConfirmEmail from './components/ConfirmEmail'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import ControlCenter from './ControlCenter'
import type { SharedPhone } from './PhoneShared'
import AppLayout from './layout/AppLayout'
import { useAuth } from './auth/AuthContext'
import { WebRtcClient } from '../../main/web/src/webrtc-client'
import React, { useState, useCallback, useEffect } from 'react'

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
  const [invite, setInvite] = useState('')
  const [rtcClient, setRtcClient] = useState<WebRtcClient | null>(null)
  const [remoteStatus, setRemoteStatus] = useState('')

  const handleSelectedDevice = useCallback((deviceId: string): void => {
    setSelectedDeviceId(deviceId || null)
    if (!deviceId) return

    setSelectedIds((previous) => (previous.includes(deviceId) ? previous : [...previous, deviceId]))
  }, [])

  useEffect(() => {
    if (
      selectedDeviceId != null &&
      !sharedPhones.some((phone) => phone.serial === selectedDeviceId)
    ) {
      rtcClient?.clearSelection(selectedDeviceId)
      setSelectedDeviceId(null)
    }
  }, [sharedPhones, rtcClient, selectedDeviceId])

  useEffect(() => {
    return () => {
      rtcClient?.close()
      void window.api.remoteShare.stopViewer()
    }
  }, [rtcClient])

  const connectSharedPhones = async (): Promise<void> => {
    try {
      setRemoteStatus('Connecting to Host...')
      setSharedPhones([])
      const connection = await window.api.remoteShare.openViewer(invite.trim())
      const client = new WebRtcClient(
        {
          devices: (serials) => {
            setSharedPhones(
              serials.map((serial) => ({ serial, connectionTag: 'WebRTC', isControlled: false }))
            )
            setRemoteStatus(`${serials.length} phone${serials.length === 1 ? '' : 's'} connected`)
          },
          status: setRemoteStatus,
          log: (text) => window.api.remoteShare.writeLog(text)
        },
        {
          url: connection.rendezvousUrl,
          sessionId: connection.sessionId,
          sessionSecret: connection.secret
        }
      )
      setRtcClient(client)
      client.connect()
    } catch (error) {
      setRemoteStatus(error instanceof Error ? error.message : 'Could not connect to Host')
    }
  }

  const disconnectSharedPhones = async (): Promise<void> => {
    rtcClient?.close()
    setRtcClient(null)
    setSharedPhones([])
    setSelectedDeviceId(null)
    await window.api.remoteShare.stopViewer()
    setRemoteStatus('Disconnected from Host')
  }

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
        remoteInvite={invite}
        remoteStatus={remoteStatus}
        remoteConnected={rtcClient !== null}
        onRemoteInviteChange={setInvite}
        onRemoteConnect={() => void connectSharedPhones()}
        onRemoteDisconnect={() => void disconnectSharedPhones()}
      >
        <ControlCenter
          phones={sharedPhones}
          remoteClient={rtcClient}
          status={remoteStatus}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={(deviceId) => {
            handleSelectedDevice(deviceId)
            rtcClient?.selectDevice(deviceId)
          }}
          onCloseFocused={() => {
            if (selectedDeviceId) rtcClient?.clearSelection(selectedDeviceId)
            handleSelectedDevice('')
          }}
          onDisconnect={() => void disconnectSharedPhones()}
        />
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
