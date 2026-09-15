import React, { useState, useEffect } from 'react'

function index() {
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
  return <div></div>
}

export default index
