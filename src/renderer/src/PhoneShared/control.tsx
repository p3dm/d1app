import React from 'react'
import PhoneGrid from '../components/PhoneGrid'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'
import type { SharedPhone } from './index'

interface PhoneSharedControlProps {
  devices: Array<SharedPhone & { id: string; model: string; ip: string }>
  remoteClient: WebRtcClient
  status: string
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string) => void
  onDisconnect: () => void
}

export default function PhoneSharedControl({
  devices,
  remoteClient,
  status,
  selectedDeviceId,
  onSelectDevice,
  onDisconnect
}: PhoneSharedControlProps): React.JSX.Element {
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId)

  return (
    <div className="remote-share-control">
      <header className="remote-share-control-header">
        <div>
          <p className="remote-share-eyebrow">WebRTC session</p>
          <h2 className="remote-share-title">Phone control</h2>
        </div>
        <div className="remote-share-control-meta">
          <span className="remote-share-count is-online">
            {devices.length} phone{devices.length === 1 ? '' : 's'}
          </span>
          {selectedDevice ? <span>Selected: {selectedDevice.model}</span> : null}
          <button className="btn btn-secondary" onClick={onDisconnect}>
            Ngắt kết nối
          </button>
        </div>
      </header>
      <div className="remote-share-control-grid">
        <PhoneGrid
          devices={devices}
          remoteClient={remoteClient}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={(device) => onSelectDevice(device.id)}
        />
      </div>
      {status ? <div className="remote-share-control-status">{status}</div> : null}
    </div>
  )
}
