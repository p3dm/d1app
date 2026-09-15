import { Cpu } from 'lucide-react'

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
export default function PhoneCard({ device, onSelect }) {
  const {
    id,
    model,
    ip,
    connectionTag = 'OTG',
    apps = [],
    isControlled = false,
    controlledLabel = 'Master mirror active',
    toolbarActive = [0]
  } = device

  return (
    <div
      onClick={() => onSelect?.(device)}
      className={`phone-card${isControlled ? ' phone-card-controlled' : ''}`}
    >
      {/* Tag kết nối góc trên */}
      <div className="phone-card-tag-row">
        <span className={`phone-card-tag${isControlled ? ' phone-card-tag-controlled' : ''}`}>
          <span className="phone-card-tag-dot" />
          {connectionTag}
        </span>
      </div>

      {/* ID + tên máy + IP */}
      <div className="phone-card-info">
        <div className="phone-card-id">{id}</div>
        <div className={`phone-card-model${isControlled ? ' phone-card-model-controlled' : ''}`}>
          {model}
        </div>
        <div className="phone-card-ip">{ip}</div>
      </div>

      {/* Vùng giữa: app đang mở, hoặc thông báo "đang được điều khiển" */}
      {isControlled ? (
        <div className="phone-card-controlled-body">
          <div className="phone-card-controlled-icon">
            <Cpu size={20} />
          </div>
          <div className="phone-card-controlled-title">Device under control</div>
          <div className="phone-card-controlled-subtitle">{controlledLabel}</div>
        </div>
      ) : (
        <div className="phone-card-body">
          <div className="phone-card-apps">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="phone-card-app-slot">
                {apps[slot] ?? ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thanh mini toolbar dưới cùng */}
      <div className="phone-card-toolbar">
        <div className="phone-card-toolbar-row">
          {[0, 1, 2, 3].map((slot) => (
            <div
              key={slot}
              className={`phone-card-toolbar-slot${
                toolbarActive.includes(slot) ? ' phone-card-toolbar-slot-active' : ''
              }`}
            />
          ))}
        </div>
        <div
          className={`phone-card-nav-row${isControlled ? ' phone-card-nav-row-controlled' : ''}`}
        >
          <span>|||</span>
          <span>○</span>
          <span>&lt;</span>
        </div>
      </div>
    </div>
  )
}
