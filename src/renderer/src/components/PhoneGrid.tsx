import { useEffect, useRef, useState, type JSX } from 'react'
import PhoneCard from './PhoneCard'
import { RemoteDevice } from '../../../main/web/src/remote-device'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'
import type { ControlMessage } from '../../../main/shared/protocol'

export interface PhoneGridDevice {
  id: string
  model?: string
  ip?: string
  connectionTag?: string
  apps?: string[]
  isControlled?: boolean
  controlledLabel?: string
  toolbarActive?: number[]
  [key: string]: unknown
}

interface PhoneGridProps {
  devices: PhoneGridDevice[]
  onSelectDevice?: (device: PhoneGridDevice) => void
  remoteClient?: WebRtcClient
  selectedDeviceId?: string | null
}

function WebRtcDeviceTile({
  device,
  remoteClient,
  onSelect,
  selected
}: {
  device: PhoneGridDevice
  remoteClient: WebRtcClient
  onSelect?: (device: PhoneGridDevice) => void
  selected?: boolean
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const focusVideoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Đang chờ stream...')

  useEffect(() => {
    if (!canvasRef.current || !focusVideoRef.current) return

    const remote = new RemoteDevice(
      canvasRef.current,
      focusVideoRef.current,
      {
        status: (text) => setStatus(text),
        log: () => undefined,
        streaming: () => setStatus('Đang phát trực tiếp'),
        disconnected: () => setStatus('Đã ngắt kết nối'),
        controlState: (enabled) => setStatus(enabled ? 'Đang điều khiển' : 'Đã kết nối')
      },
      (message) => remoteClient.sendControl(device.id, message)
    )

    remoteClient.registerDevice(device.id, remote)
    return () => {
      remoteClient.unregisterDevice(device.id, remote)
      remote.disconnect()
    }
  }, [device.id, remoteClient])

  const sendKey = (keyCode: number): void => {
    const message: ControlMessage = { type: 'key', action: 'press', keyCode }
    remoteClient.sendControl(device.id, message)
  }

  return (
    <div
      className={`webrtc-device-tile${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect?.(device)}
      onDoubleClick={() => onSelect?.(device)}
    >
      <div className="webrtc-device-tile-header">
        <strong>{device.model ?? device.id}</strong>
        <span>{device.connectionTag ?? 'WebRTC'}</span>
      </div>
      <div className="webrtc-device-screen">
        <canvas ref={canvasRef} aria-label={`Màn hình ${device.id}`} />
        <video ref={focusVideoRef} autoPlay muted playsInline />
        <span>{status}</span>
      </div>
      {selected ? (
        <div className="webrtc-device-controls" onClick={(event) => event.stopPropagation()}>
          {[
            ['Back', 4],
            ['Home', 3],
            ['Recents', 187],
            ['Enter', 66]
          ].map(([label, keyCode]) => (
            <button key={label} type="button" onClick={() => sendKey(keyCode as number)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <small>{device.ip ?? device.id}</small>
    </div>
  )
}

/**
 * Dữ liệu mẫu — thay bằng danh sách thiết bị thật lấy từ API/websocket.
 * Mỗi phần tử tuân theo đúng shape mà PhoneCard yêu cầu (xem PhoneCard.jsx).
 */
/**
 * PhoneGrid
 *
 * Nhận vào danh sách thiết bị (`devices`) và hiển thị lần lượt từng thiết bị
 * ra lưới responsive (`.phone-grid` trong main.css) bằng PhoneCard.
 * Component này không biết gì về cách vẽ một ô điện thoại — việc đó do
 * PhoneCard đảm nhiệm.
 *
 * `onSelectDevice`: callback khi người dùng bấm vào một thẻ.
 */
export default function PhoneGrid({
  devices,
  onSelectDevice,
  remoteClient,
  selectedDeviceId
}: PhoneGridProps): JSX.Element {
  if (devices.length === 0) {
    return <div className="phone-grid-empty">Chưa có thiết bị nào được kết nối.</div>
  }

  return (
    <main className="screen-matrix-viewport" data-purpose="screen-matrix-viewport">
      {devices.length === 0 ? (
        <div className="phone-grid-empty">Chưa có thiết bị nào được kết nối.</div>
      ) : (
        <div className="phone-grid">
          {devices.map((device) =>
            remoteClient ? (
              <WebRtcDeviceTile
                key={device.id}
                device={device}
                remoteClient={remoteClient}
                onSelect={onSelectDevice}
                selected={selectedDeviceId === device.id}
              />
            ) : (
              <PhoneCard key={device.id} device={device} onSelect={onSelectDevice} />
            )
          )}
        </div>
      )}
    </main>
  )
}
