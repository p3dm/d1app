import PhoneCard from './PhoneCard'

/**
 * Dữ liệu mẫu — thay bằng danh sách thiết bị thật lấy từ API/websocket.
 * Mỗi phần tử tuân theo đúng shape mà PhoneCard yêu cầu (xem PhoneCard.jsx).
 */
export const SAMPLE_DEVICES = [
  { id: '01', model: 'Pixel 3a', ip: '192.168.4.116', apps: ['YT', 'FB', 'TT'] },
  { id: '02', model: 'SM-A505F', ip: '192.168.5.147' },
  { id: '03', model: 'SM-G998B', ip: '192.168.4.234' },
  { id: '04', model: 'M2007J20', ip: '192.168.5.121' },
  { id: '05', model: 'CPH2139', ip: '192.168.5.23' },
  { id: '06', model: 'RMX2185', ip: '192.168.5.192' },
  { id: '07', model: 'G301', ip: '192.168.5.22' },
  {
    id: '08',
    model: 'Pixel 5',
    ip: '192.168.5.37',
    isControlled: true,
    controlledLabel: 'Master mirror active',
    toolbarActive: [0, 1]
  },
  { id: '09', model: 'SM-A315F', ip: '192.168.5.72' },
  { id: '10', model: 'SM-A107F', ip: '192.168.5.158' },
  { id: '11', model: 'SM-E625F', ip: '192.168.5.87' },
  { id: '12', model: 'YAL-L21', ip: '192.168.4.250' },
  { id: '13', model: 'Redmi 9', ip: '192.168.5.92' },
  { id: '14', model: 'GT20', ip: '192.168.4.50' },
  { id: '15', model: 'SM-G973F', ip: '192.168.5.4' },
  { id: '16', model: 'Vivo 1818', ip: '192.168.4.182' }
]

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
export default function PhoneGrid({ devices = SAMPLE_DEVICES, onSelectDevice }) {
  if (devices.length === 0) {
    return <div className="phone-grid-empty">Chưa có thiết bị nào được kết nối.</div>
  }

  return (
    <main className="screen-matrix-viewport" data-purpose="screen-matrix-viewport">
      {devices.length === 0 ? (
        <div className="phone-grid-empty">Chưa có thiết bị nào được kết nối.</div>
      ) : (
        <div className="phone-grid">
          {devices.map((device) => (
            <PhoneCard key={device.id} device={device} onSelect={onSelectDevice} />
          ))}
        </div>
      )}
    </main>
  )
}
