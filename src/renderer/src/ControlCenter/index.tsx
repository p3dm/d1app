import React, { useEffect, useState } from 'react'
import PhoneGrid, { SAMPLE_DEVICES } from '../components/PhoneGrid'

function ControlCenter(): React.JSX.Element {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    SAMPLE_DEVICES[0]?.id ?? null
  )
  const [rendezvousUrl, setRendezvousUrl] = useState('ws://103.6.235.189:8443/rendezvous')
  const [stunUrl, setStunUrl] = useState('stun:103.6.235.189:3478')
  const [invite, setInvite] = useState('')
  const [status, setStatus] = useState('')
  const [logs, setLogs] = useState('')

  const selectedDevice = SAMPLE_DEVICES.find((device) => device.id === selectedDeviceId) ?? null

  useEffect(() => {
    const removeListener = window.api.remoteShare.onHostLog((text) => {
      setLogs((previous) => `${previous}${text}`)
    })

    return () => removeListener()
  }, [])

  const handleStartHost = async (): Promise<void> => {
    try {
      setStatus('Đang khởi động Host...')
      const result = await window.api.remoteShare.startHost({ rendezvousUrl, stunUrl })
      setInvite(result.invite)
      setStatus(`Host sẵn sàng, session ${result.sessionId}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không thể khởi động Host')
    }
  }

  const handleStopHost = async (): Promise<void> => {
    try {
      await window.api.remoteShare.stopHost()
      setStatus('Đã dừng Host')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không thể dừng Host')
    }
  }

  const handleOpenViewer = async (): Promise<void> => {
    try {
      setStatus('Đang mở Viewer...')
      await window.api.remoteShare.openViewer(invite)
      setStatus('Đã mở Viewer')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không thể mở Viewer')
    }
  }

  const handleCopyInvite = async (): Promise<void> => {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite)
      setStatus('Đã sao chép mã kết nối')
    } catch {
      setStatus('Không thể sao chép mã kết nối')
    }
  }

  return (
    <section className="section control-center">
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Remote Share</h3>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Rendezvous</label>
          <input
            value={rendezvousUrl}
            onChange={(event) => setRendezvousUrl(event.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>STUN</label>
          <input
            value={stunUrl}
            onChange={(event) => setStunUrl(event.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => void handleStartHost()}>
            Bắt đầu chia sẻ
          </button>
          <button className="btn btn-secondary" onClick={() => void handleStopHost()}>
            Dừng Host
          </button>
        </div>

        {invite ? (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Mã kết nối</label>
              <textarea value={invite} readOnly style={{ width: '100%', minHeight: 120 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => void handleOpenViewer()}>
                Mở Viewer
              </button>
              <button className="btn btn-secondary" onClick={() => void handleCopyInvite()}>
                Sao chép mã
              </button>
            </div>
          </>
        ) : null}

        {status ? <div style={{ color: '#d7ebff' }}>{status}</div> : null}

        {logs ? (
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#0e1620',
              padding: 12,
              borderRadius: 8,
              maxHeight: 200,
              overflow: 'auto'
            }}
          >
            {logs}
          </pre>
        ) : null}
      </div>

      <PhoneGrid
        devices={SAMPLE_DEVICES}
        onSelectDevice={(device) => setSelectedDeviceId(device.id)}
      />
      {selectedDevice ? <div>Selected: {selectedDevice.model}</div> : null}
    </section>
  )
}

export default ControlCenter
