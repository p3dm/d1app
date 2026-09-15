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
}

function PhoneShared({ phones }: PhoneSharedProps) {
  const [connectedPhones, setConnectedPhones] = useState<SharedPhone[]>(phones)
  const devices = connectedPhones.map((phone) => ({
    ...phone,
    id: phone.serial,
    model: phone.model ?? phone.serial,
    ip: phone.ip ?? 'Network'
  }))
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(phones[0]?.serial ?? null)
  const [invite, setInvite] = useState('')
  const [rtcClient, setRtcClient] = useState<WebRtcClient | null>(null)
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'setup' | 'control'>('setup')

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null

  useEffect(() => {
    setConnectedPhones(phones)
  }, [phones])

  useEffect(() => {
    if (!connectedPhones.some((phone) => phone.serial === selectedDeviceId)) {
      setSelectedDeviceId(connectedPhones[0]?.serial ?? null)
    }
  }, [connectedPhones, selectedDeviceId])

  const handleConnect = async (): Promise<void> => {
    try {
      setStatus('Đang kết nối tới Host...')
      setConnectedPhones([])
      const connection = await window.api.remoteShare.openViewer(invite.trim())
      const client = new WebRtcClient(
        {
          devices: (serials) => {
            setConnectedPhones(
              serials.map((serial) => ({ serial, connectionTag: 'WebRTC', isControlled: false }))
            )
            setView('control')
            setStatus(`${serials.length} phone đã kết nối tới Host`)
          },
          status: (text) => setStatus(text),
          log: () => undefined
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
    setConnectedPhones([])
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
        setSelectedDeviceId(deviceId)
        rtcClient.selectDevice(deviceId)
      }}
      onDisconnect={() => void handleDisconnect()}
    />
  )
}

export default PhoneShared
