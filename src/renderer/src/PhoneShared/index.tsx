import { useState, useEffect } from 'react'
import { WebRtcClient } from '../../../main/web/src/webrtc-client'
import PhoneSharedSetup from './setup'
import PhoneSharedControl from './control'

export interface SharedPhone {
  serial: string
  model?: string
  ip?: string
  connectionTag?: string
  apps?: string[]
  isControlled: boolean
  controlledLabel?: string
  toolbarActive?: number[]
}

interface PhoneSharedProps {
  phones: SharedPhone[]
  onPhonesChange: (phones: SharedPhone[]) => void
  selectedDeviceId: string | null
  onSelectedDevice: (deviceId: string) => void
}

function PhoneShared({
  phones,
  onPhonesChange,
  selectedDeviceId,
  onSelectedDevice
}: PhoneSharedProps) {
  const devices = phones.map((phone) => ({
    ...phone,
    id: phone.serial,
    model: phone.model ?? phone.serial,
    ip: phone.ip ?? 'Network'
  }))
  const [invite, setInvite] = useState('')
  const [rtcClient, setRtcClient] = useState<WebRtcClient | null>(null)
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'setup' | 'control'>('setup')

  useEffect(() => {
    if (selectedDeviceId != null && !phones.some((phone) => phone.serial === selectedDeviceId)) {
      rtcClient?.clearSelection(selectedDeviceId)
      onSelectedDevice('')
    }
  }, [phones, rtcClient, selectedDeviceId, onSelectedDevice])

  useEffect(() => {
    if (rtcClient && selectedDeviceId) rtcClient.selectDevice(selectedDeviceId)
  }, [rtcClient, selectedDeviceId])

  const handleConnect = async (): Promise<void> => {
    try {
      setStatus('Đang kết nối tới Host...')
      onPhonesChange([])
      const connection = await window.api.remoteShare.openViewer(invite.trim())
      const client = new WebRtcClient(
        {
          devices: (serials) => {
            onPhonesChange(
              serials.map((serial) => ({ serial, connectionTag: 'WebRTC', isControlled: false }))
            )
            setView('control')
            setStatus(`${serials.length} phone đã kết nối tới Host`)
          },
          status: (text) => setStatus(text),
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
      setStatus(error instanceof Error ? error.message : 'Không thể kết nối tới Host')
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    rtcClient?.close()
    setRtcClient(null)
    await Promise.all([window.api.remoteShare.stopViewer(), window.api.remoteShare.stopHost()])
    onPhonesChange([])
    setStatus('Đã ngắt kết nối Host')
    setView('setup')
  }

  useEffect(() => {
    return () => {
      rtcClient?.close()
      void window.api.remoteShare.stopViewer()
    }
  }, [rtcClient])

  if (view === 'setup') {
    return (
      <div className="remote-share-shell remote-share-setup-shell">
        <PhoneSharedSetup
          invite={invite}
          status={status}
          onInviteChange={setInvite}
          onConnect={() => void handleConnect()}
        />
      </div>
    )
  }

  if (!rtcClient) return null

  return (
    <PhoneSharedControl
      devices={devices}
      remoteClient={rtcClient}
      status={status}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={(deviceId) => {
        onSelectedDevice(deviceId)
        // Mark the device before React replaces the grid endpoint with the focus endpoint.
        // This keeps unregisterDevice from unsubscribing and closing its WebRTC channels.
        rtcClient.selectDevice(deviceId)
      }}
      onCloseFocused={() => {
        if (selectedDeviceId) rtcClient.clearSelection(selectedDeviceId)
        onSelectedDevice('')
      }}
      onDisconnect={() => void handleDisconnect()}
    />
  )
}

export default PhoneShared
