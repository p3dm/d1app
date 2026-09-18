import { useEffect, useRef, useState } from 'react'
import { Cpu } from 'lucide-react'
import { RemoteDevice } from '../../../main/web/src/remote-device'
import type { WebRtcClient } from '../../../main/web/src/webrtc-client'

interface PhoneCardProps {
  device: {
    id: string
    model?: string
    ip?: string
    connectionTag?: string
    apps?: string[]
    isControlled?: boolean
    controlledLabel?: string
    toolbarActive?: number[]
  }
  onSelect?: (device: PhoneCardProps['device']) => void
  remoteClient?: WebRtcClient
  selected?: boolean
}

/**
 * PhoneCard
 *
 * Component "cấu hình" cho MỘT thiết bị điện thoại: nhận vào dữ liệu của
 * thiết bị (`device`) và tự quyết định cách hiển thị — tag kết nối, app đang
 * chạy, thanh điều khiển mini, và trạng thái "đang điều khiển" (controlled).
 *
 * Style lấy từ main.css (nhóm class `.phone-card*`) — không dùng Tailwind.
 * Khi cần đổi giao diện thẻ, sửa CSS ở `.phone-card*` trong main.css.
 *
 * Shape của `device`:
 * {
 *   id: "08",
 *   model: "Pixel 5",
 *   ip: "192.168.5.37",
 *   connectionTag: "OTG",          // OTG | USB | WIFI | Cloud
 *   apps: ["YT", "FB", "TT"],      // tuỳ chọn, tối đa 3 app hiển thị giữa màn hình
 *   isControlled: true,            // true = đang được mirror/điều khiển
 *   controlledLabel: "Master mirror active",
 *   toolbarActive: [0, 1],         // index các ô toolbar được tô emerald
 * }
 */
export default function PhoneCard({
  device,
  onSelect,
  remoteClient,
  selected = false
}: PhoneCardProps): React.JSX.Element {
  const {
    id,
    model,
    ip,
    connectionTag = 'OTG',
    apps = [],
    isControlled = false,
    controlledLabel = 'Master mirror active'
  } = device
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const focusVideoRef = useRef<HTMLVideoElement>(null)
  const [remoteStatus, setRemoteStatus] = useState('Đang chờ stream...')

  useEffect(() => {
    if (!remoteClient || !canvasRef.current || !focusVideoRef.current) return

    let remote: RemoteDevice
    try {
      remote = new RemoteDevice(
        canvasRef.current,
        focusVideoRef.current,
        {
          status: (text) => setRemoteStatus(text),
          log: () => undefined,
          streaming: () => setRemoteStatus('Đang phát trực tiếp'),
          disconnected: () => setRemoteStatus('Đã ngắt kết nối'),
          controlState: (enabled) => setRemoteStatus(enabled ? 'Đang điều khiển' : 'Đã kết nối')
        },
        (message) => remoteClient.sendControl(id, message)
      )
    } catch (error) {
      setRemoteStatus(error instanceof Error ? error.message : 'Không tạo được video decoder')
      return
    }
    canvasRef.current.hidden = false
    remoteClient.registerDevice(id, remote)

    return () => {
      remoteClient.unregisterDevice(id, remote)
      remote.disconnect()
    }
  }, [id, remoteClient])

  const isSelected = selected || isControlled

  return (
    <div
      onDoubleClick={() => onSelect?.(device)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect?.(device)
        }
      }}
      className={`phone-card${isSelected ? ' phone-card-controlled' : ''}${remoteClient ? ' phone-card-remote' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
    >
      {/* Tag kết nối góc trên */}
      <div className="phone-card-tag-row">
        <span className={`phone-card-tag${isSelected ? ' phone-card-tag-controlled' : ''}`}>
          <span className="phone-card-tag-dot" />
          {connectionTag}
        </span>
      </div>

      {/* ID + tên máy + IP */}
      <div className="phone-card-info">
        <div className="phone-card-id">{id}</div>
        <div className={`phone-card-model${isSelected ? ' phone-card-model-controlled' : ''}`}>
          {model}
        </div>
        <div className="phone-card-ip">{ip}</div>
      </div>

      {/* Vùng giữa: app đang mở, hoặc thông báo "đang được điều khiển" */}
      {isSelected ? (
        <div className="phone-card-controlled-body">
          <div className="phone-card-controlled-icon">
            <Cpu size={20} />
          </div>
          <div className="phone-card-controlled-title">◆ CONTROLLED</div>
          <div className="phone-card-controlled-subtitle">{controlledLabel}</div>
        </div>
      ) : (
        <div className="phone-card-body">
          {remoteClient ? (
            <>
              <canvas ref={canvasRef} className="phone-card-screen" aria-label={`Màn hình ${id}`} />
              <video
                ref={focusVideoRef}
                className="phone-card-focus-screen"
                autoPlay
                muted
                playsInline
              />
              <span className="phone-card-stream-status">{remoteStatus}</span>
            </>
          ) : (
            <div className="phone-card-apps">
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="phone-card-app-slot">
                  {apps[slot] ?? ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
