import React from 'react'
import PhoneGrid from '../components/PhoneGrid'
import FocusedPhoneView from '../components/FocusPhoneView'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'
import type { SharedPhone } from '../PhoneShared'

interface ControlCenterProps {
  phones: SharedPhone[]
  remoteClient: WebRtcClient | null
  status: string
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string) => void
  onCloseFocused: () => void
  onDisconnect: () => void
}

function ControlCenter({
  phones,
  remoteClient,
  status,
  selectedDeviceId,
  onSelectDevice,
  onCloseFocused,
  onDisconnect
}: ControlCenterProps): React.JSX.Element {
  const devices = phones.map((phone) => ({
    ...phone,
    id: phone.serial,
    model: phone.model ?? phone.serial,
    ip: phone.ip ?? 'Network'
  }))
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId)

  if (!remoteClient) {
    return (
      <div className="section control-center screen-matrix-viewport">
        <div className="remote-share-setup">
          <p className="remote-share-eyebrow">Shared phone network</p>
          <h2 className="remote-share-title">Connect a shared phone network</h2>
          <p className="remote-share-description">
            Paste the connection code in the Settings sidebar, then select Connect.
          </p>
          {status ? <div className="remote-share-status">{status}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <section className="section control-center screen-matrix-viewport">
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
            Disconnect
          </button>
        </div>
      </header>

      <div className="remote-share-control-grid">
        <div className="remote-share-control-body">
          {selectedDevice ? (
            <aside className="remote-share-focus-inspector" data-purpose="master-phone-inspector">
              <FocusedPhoneView
                key={selectedDevice.id}
                device={selectedDevice}
                remoteClient={remoteClient}
                onClose={onCloseFocused}
              />
            </aside>
          ) : null}
          <div className="screen-matrix-viewport" data-purpose="screen-matrix-viewport">
            <PhoneGrid
              devices={devices}
              remoteClient={remoteClient}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={(device) => onSelectDevice(device.id)}
            />
          </div>
        </div>
      </div>
      {status ? <div className="remote-share-control-status">{status}</div> : null}
    </section>
  )
}

export default ControlCenter
