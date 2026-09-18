import { type JSX } from 'react'
import PhoneCard from './PhoneCard'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'
import DeviceStream from './DeviceStream'
import { Cpu } from 'lucide-react'

export interface PhoneGridDevice {
  id: string
  model?: string
  ip?: string
  system?: string
  connectionTag?: string
  apps?: string[]
  isControlled?: boolean
  controlledLabel?: string
  toolbarActive?: number[]
}

interface PhoneGridProps {
  devices: PhoneGridDevice[]
  onSelectDevice?: (device: PhoneGridDevice) => void
  remoteClient?: WebRtcClient
  selectedDeviceId?: string | null
}

interface WebRtcDeviceTileProps {
  device: PhoneGridDevice
  remoteClient: WebRtcClient
  onSelect?: (device: PhoneGridDevice) => void
  selected?: boolean
}

export function WebRtcDeviceTile({
  device,
  remoteClient,
  onSelect,
  selected = false
}: WebRtcDeviceTileProps): JSX.Element {
  return (
    <div
      className="phone-card"
      onDoubleClick={() => onSelect?.(device)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect?.(device)
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Focus ${device.model ?? device.id}`}
    >
      <div className={`webrtc-device-info${selected ? ' webrtc-device-phone-selected' : ''}`}>
        {selected ? (
          <div className="phone-card-controlled-body">
            <div className="phone-card-controlled-icon">
              <Cpu size={20} />
            </div>
            <div className="phone-card-controlled-title">◆ CONTROLLED</div>
            <div className="phone-card-controlled-subtitle">Master mirror active</div>
          </div>
        ) : (
          <DeviceStream device={device} remoteClient={remoteClient} />
        )}

        <div className="webrtc-device-info" aria-label={`Device information for ${device.id}`}>
          <div className="phone-card-tag-row">
            <span className={`phone-card-tag${selected ? ' phone-card-tag-controlled' : ''}`}>
              <span className="phone-card-tag-dot" />
              {device.connectionTag}
            </span>
          </div>

          <div className="phone-card-info">
            <div className="phone-card-id">{device.system}</div>
            <div className={`phone-card-model${selected ? ' phone-card-model-controlled' : ''}`}>
              {device.model}
            </div>
            <div className="phone-card-ip">{device.ip}</div>
          </div>
        </div>
      </div>
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
    return (
      <main className="screen-matrix-viewport" data-purpose="screen-matrix-viewport">
        <div className="phone-grid-empty">Chưa có thiết bị nào được kết nối.</div>
      </main>
    )
  }

  const selectedDevice =
    selectedDeviceId != null ? devices.find((device) => device.id === selectedDeviceId) : undefined

  return (
    <main data-purpose="screen-matrix-viewport">
      <div className="phone-grid">
        {devices.map((device) => {
          if (remoteClient) {
            return (
              <WebRtcDeviceTile
                key={device.id}
                device={device}
                remoteClient={remoteClient}
                onSelect={onSelectDevice}
                selected={selectedDevice?.id === device.id}
              />
            )
          }

          return (
            <PhoneCard
              key={device.id}
              device={device}
              onSelect={onSelectDevice}
              selected={selectedDevice?.id === device.id}
            />
          )
        })}
      </div>
    </main>
  )
}
