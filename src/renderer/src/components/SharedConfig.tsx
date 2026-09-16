import { useState, useRef, useEffect } from 'react'
import { User, Calendar, Clock, Plus, Key } from 'lucide-react'
import { SAMPLE_DEVICE_GRID, SAMPLE_SESSIONS } from './sampleDevices'

type Session = (typeof SAMPLE_SESSIONS)[number]
type Device = (typeof SAMPLE_DEVICE_GRID)[number]

type PermissionKey = 'screenView' | 'touchControl' | 'adbAccess'

type Permissions = Record<PermissionKey, boolean>
/**
 * Dữ liệu mẫu — thay bằng danh sách phiên chia sẻ thật lấy từ API.
 *
 * status quyết định toàn bộ màu sắc của thẻ (viền, badge, progress bar,
 * "days left", icon email):
 *   "ok"     → emerald (còn nhiều ngày, an toàn)
 *   "warn"   → trắng/trung tính (sắp hết hạn, chưa nguy cấp)
 *   "danger" → đỏ (gần hết hạn hoặc lỗi xác thực — có icon ⚠ và nút Re-auth)
 */

/** 19 thiết bị mẫu cho lưới chọn máy ở tab Setting — khớp dữ liệu trong HTML gốc */

const TABS = [
  { id: 'setting', label: 'Setting' },
  { id: 'shared-session', label: 'Shared session' }
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "28/10/2026" + "23:59" → "Oct 28, 2026 • 23:59" (trả về null nếu ngày không hợp lệ) */
function formatExpirySummary(dateStr, timeStr): { text: string; time: string } | null {
  const parts = dateStr.split('/').map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const [day, month, year] = parts
  const monthName = MONTHS[month - 1]
  if (!monthName) return null
  return { text: `${monthName} ${day}, ${year}`, time: timeStr }
}

/* ───────────────────────── Tab: Setting ───────────────────────── */

interface SettingTabProps {
  devices: Device[]
  selectedIds: Set<string>
  onToggleDevice: (id: string) => void
  onSelectAll: () => void
  permissions: Permissions
  onTogglePermission: (key: PermissionKey) => void
  borrowerEmail: string
  onBorrowerEmailChange: (email: string) => void
  leaseDate: string
  onLeaseDateChange: (date: string) => void
  leaseTime: string
  onLeaseTimeChange: (time: string) => void
}

function SettingTab({
  devices,
  selectedIds,
  onToggleDevice,
  onSelectAll,
  permissions,
  onTogglePermission,
  borrowerEmail,
  onBorrowerEmailChange,
  leaseDate,
  onLeaseDateChange,
  leaseTime,
  onLeaseTimeChange
}: SettingTabProps): React.JSX.Element {
  const availableCount = devices.filter((d) => d.status !== 'rented').length
  const allAvailableSelected =
    availableCount > 0 && devices.every((d) => d.status === 'rented' || selectedIds.has(d.id))
  const expiry = formatExpirySummary(leaseDate, leaseTime)

  return (
    <>
      {/* Device Grid selector */}
      <div className="share-drawer-device-grid-head">
        <span className="share-drawer-sessions-label">
          Device grid
          <span className="share-drawer-device-grid-sub">
            ({selectedIds.size}/{devices.length} Sel)
          </span>
        </span>
        <div className="share-drawer-device-grid-selectall">
          <input
            id="selectAllRight"
            type="checkbox"
            checked={allAvailableSelected}
            onChange={onSelectAll}
            className="share-drawer-device-grid-checkbox"
          />
          <label htmlFor="selectAllRight" className="share-drawer-device-grid-selectall-label">
            Select all
          </label>
        </div>
      </div>

      <div className="share-drawer-device-grid">
        {devices.map((device) => {
          const isSelected = selectedIds.has(device.id)
          const isRented = device.status === 'rented'
          return (
            <button
              key={device.id}
              type="button"
              disabled={isRented}
              title={
                isRented
                  ? `Device ${device.id}: Rented (${device.group})`
                  : isSelected
                    ? `Device ${device.id}: Selected`
                    : `Device ${device.id}: Available`
              }
              onClick={() => onToggleDevice(device.id)}
              className={`share-drawer-device-btn${
                isRented
                  ? ' share-drawer-device-btn-rented'
                  : isSelected
                    ? ' share-drawer-device-btn-selected'
                    : ''
              }`}
            >
              <span>{device.id}</span>
              {isRented && <span className="share-drawer-device-btn-dot" />}
            </button>
          )
        })}
        {/* ô trống để lấp đầy hàng cuối, giống HTML gốc (19 máy trong lưới 4 cột) */}
        <div className="share-drawer-device-grid-spacer" />
      </div>

      <div className="share-drawer-legend">
        <div className="share-drawer-legend-item">
          <span className="share-drawer-legend-dot share-drawer-legend-dot-ok" />
          <span>Selected</span>
        </div>
        <div className="share-drawer-legend-item">
          <span className="share-drawer-legend-dot share-drawer-legend-dot-danger" />
          <span>Rented / In use</span>
        </div>
        <div className="share-drawer-legend-item">
          <span className="share-drawer-legend-dot share-drawer-legend-dot-neutral" />
          <span>Available</span>
        </div>
      </div>

      {/* Granular Permissions — tái dùng khung thẻ .share-drawer-session-card */}
      <div className="share-drawer-session-card">
        <span className="share-drawer-sessions-label">Granular permissions</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { key: 'screenView', label: 'Screen view' },
            { key: 'touchControl', label: 'Touch control' },
            { key: 'adbAccess', label: 'ADB shell access' }
          ].map((perm) => {
            const isOn = permissions[perm.key]
            return (
              <div key={perm.key} className="share-drawer-permission-row">
                <span className="share-drawer-permission-label">{perm.label}</span>
                <label className="share-drawer-toggle">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => onTogglePermission(perm.key)}
                    className="share-drawer-toggle-input"
                  />
                  <span
                    className={`share-drawer-toggle-track${isOn ? ' share-drawer-toggle-track-on' : ''}`}
                  />
                  <span
                    className={`share-drawer-toggle-thumb${isOn ? ' share-drawer-toggle-thumb-on' : ''}`}
                  />
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* Borrower email — tái dùng .share-drawer-search-input làm khung ô nhập */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label className="share-drawer-sessions-label" style={{ display: 'block' }}>
          Borrower recipient
        </label>
        <div className="share-drawer-search">
          <input
            type="email"
            value={borrowerEmail}
            onChange={(e) => onBorrowerEmailChange(e.target.value)}
            placeholder="e.g. partner@gmail.com"
            className="share-drawer-search-input"
            style={{ padding: '8px 28px 8px 12px', fontSize: '12px' }}
          />
          <span className="share-drawer-input-suffix share-drawer-input-suffix-accent">✓</span>
        </div>
        <span className="share-drawer-field-hint">
          Requires Google verification for scrcpy stream
        </span>
      </div>

      {/* Lease Expiry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="share-drawer-device-grid-head">
          <span className="share-drawer-sessions-label">
            Lease expiry{' '}
            <span style={{ color: '#00e599', fontSize: '10px', fontWeight: 400 }}>
              (Date &amp; time)
            </span>
          </span>
          <span className="share-drawer-input-suffix-accent" style={{ fontSize: '11px' }}>
            Custom UTC
          </span>
        </div>

        <div className="share-drawer-search" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="share-drawer-input-icon">
            <Calendar size={16} />
          </span>
          <input
            type="text"
            value={leaseDate}
            onChange={(e) => onLeaseDateChange(e.target.value)}
            placeholder="DD / MM / YYYY"
            className="share-drawer-search-input share-drawer-input-icon-left"
            style={{ padding: '8px 12px', fontSize: '12px', letterSpacing: '0.05em' }}
          />
        </div>

        <div className="share-drawer-search" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="share-drawer-input-icon">
            <Clock size={16} />
          </span>
          <input
            type="text"
            value={leaseTime}
            onChange={(e) => onLeaseTimeChange(e.target.value)}
            placeholder="HH:MM (24h UTC)"
            className="share-drawer-search-input share-drawer-input-icon-left"
            style={{ padding: '8px 12px', fontSize: '12px', letterSpacing: '0.05em' }}
          />
          <span className="share-drawer-input-suffix">24H UTC</span>
        </div>

        <div
          className="share-drawer-expiry-summary share-drawer-session-card"
          style={{ flexDirection: 'row' }}
        >
          <span>Expires on:</span>
          <span className="share-drawer-expiry-value">
            {expiry ? (
              <>
                <span className="share-drawer-expiry-value-accent">{expiry.text}</span>
                <span>• {expiry.time} UTC</span>
              </>
            ) : (
              <span className="share-drawer-field-hint">Nhập ngày hợp lệ</span>
            )}
          </span>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────── Tab: Shared session ───────────────────────── */

interface SessionCardProps {
  session: Session
  onInspect?: (session: Session) => void
  onRevoke?: (session: Session) => void
  onReauth?: (session: Session) => void
}

function SessionCard({
  session,
  onInspect,
  onRevoke,
  onReauth
}: SessionCardProps): React.JSX.Element {
  const { name, email, deviceLabel, phoneCount, daysLeft, progress, expDate, expTime, status } =
    session
  const isDanger = status === 'danger'
  const isOk = status === 'ok'

  return (
    <div
      className={`share-drawer-session-card${isOk ? ' share-drawer-session-card-ok' : ''}${
        isDanger ? ' share-drawer-session-card-danger' : ''
      }`}
    >
      <div className="share-drawer-session-header">
        <div className="share-drawer-session-name-row">
          <div className="share-drawer-session-name">
            <span>{name}</span>
            {isDanger && <span className="share-drawer-session-warning-icon">⚠</span>}
          </div>
          <div
            className={`share-drawer-session-email share-drawer-session-email-${
              isOk ? 'ok' : isDanger ? 'danger' : 'warn'
            }`}
          >
            <User
              className={`share-drawer-session-email-icon${
                !isOk && !isDanger ? ' share-drawer-session-email-icon-warn' : ''
              }`}
            />
            <span>{email}</span>
          </div>
        </div>
        <span
          className={`share-drawer-session-badge share-drawer-session-badge-${
            isOk ? 'ok' : isDanger ? 'danger' : 'warn'
          }`}
        >
          {phoneCount} {phoneCount > 1 ? 'Phones' : 'Phone'}
        </span>
      </div>

      <div className="share-drawer-session-meta">
        <span>{deviceLabel}</span>
        <span
          className={`share-drawer-session-meta-days share-drawer-session-meta-days-${
            isOk ? 'ok' : isDanger ? 'danger' : 'warn'
          }`}
        >
          {daysLeft} Days left
        </span>
      </div>

      <div className="share-drawer-session-progress">
        <div className="share-drawer-session-progress-track">
          <div
            className={`share-drawer-session-progress-fill share-drawer-session-progress-fill-${
              isOk ? 'ok' : isDanger ? 'danger' : 'warn'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className={`share-drawer-session-progress-labels${
            isDanger ? ' share-drawer-session-progress-labels-danger' : ''
          }`}
        >
          <span>Exp: {expDate}</span>
          <span>{expTime}</span>
        </div>
      </div>

      <div className="share-drawer-session-actions">
        {isDanger ? (
          <>
            <button
              type="button"
              onClick={() => onReauth?.(session)}
              className="share-drawer-session-action share-drawer-session-action-danger"
            >
              Re-auth
            </button>
            <button
              type="button"
              onClick={() => onInspect?.(session)}
              className="share-drawer-session-action share-drawer-session-action-neutral"
            >
              Inspect
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onInspect?.(session)}
              className="share-drawer-session-action share-drawer-session-action-neutral"
            >
              Inspect
            </button>
            <button
              type="button"
              onClick={() => onRevoke?.(session)}
              className="share-drawer-session-action share-drawer-session-action-danger"
            >
              Revoke
            </button>
          </>
        )}
      </div>
    </div>
  )
}

interface SharedSessionTabProps {
  sessions: Session[]
  onInspect?: (session: Session) => void
  onRevoke?: (session: Session) => void
  onReauth?: (session: Session) => void
}

function SharedSessionTab({
  sessions,
  onInspect,
  onRevoke,
  onReauth
}: SharedSessionTabProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const filtered = sessions.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <>
      <div className="share-drawer-sessions-head">
        <div className="share-drawer-sessions-title">
          <span className="share-drawer-sessions-label">Sessions</span>
          <span className="share-drawer-sessions-count">{sessions.length} Active Leases</span>
        </div>
      </div>

      <div className="share-drawer-search">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter sessions..."
          className="share-drawer-search-input"
        />
        <span className="share-drawer-search-hint">⌘F</span>
      </div>

      <div className="share-drawer-session-list">
        {filtered.length === 0 ? (
          <div className="share-drawer-empty">Không tìm thấy phiên nào phù hợp.</div>
        ) : (
          filtered.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onInspect={onInspect}
              onRevoke={onRevoke}
              onReauth={onReauth}
            />
          ))
        )}
      </div>
    </>
  )
}

/* ───────────────────────── ShareConfigDrawer ───────────────────────── */

/**
 * ShareConfigDrawer
 *
 * Panel bên phải: tab "Setting" để tạo phiên chia sẻ mới (chọn máy, quyền hạn,
 * email người mượn, thời hạn thuê) và tab "Shared session" để quản lý các
 * phiên đang hoạt động. Footer với 2 nút hành động chỉ hiện ở tab Setting.
 */

interface ShareConfigDrawerProps {
  sessions?: Session[]
  deviceGrid?: Device[]
  onCollapse?: () => void
  onInspect?: (session: Session) => void
  onRevoke?: (session: Session) => void
  onReauth?: (session: Session) => void
  onConfirmShare?: (config: {
    deviceIds: string[]
    permissions: Permissions
    borrowerEmail: string
    leaseDate: string
    leaseTime: string
  }) => void
  onOneTimeShare?: () => void
}

export default function ShareConfigDrawer({
  sessions = SAMPLE_SESSIONS,
  deviceGrid = SAMPLE_DEVICE_GRID,
  onCollapse,
  onInspect,
  onRevoke,
  onReauth,
  onConfirmShare,
  onOneTimeShare
}: ShareConfigDrawerProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('setting')
  const [selectedIds, setSelectedIds] = useState(() => new Set(['08']))
  const [permissions, setPermissions] = useState<Permissions>({
    screenView: true,
    touchControl: true,
    adbAccess: false
  })
  const [borrowerEmail, setBorrowerEmail] = useState('trader.mmo88@gmail.com')
  const [leaseDate, setLeaseDate] = useState('28/10/2026')
  const [leaseTime, setLeaseTime] = useState('23:59')

  const toggleDevice = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAllDevices = (): void => {
    setSelectedIds((prev) => {
      const availableIds = deviceGrid.filter((d) => d.status !== 'rented').map((d) => d.id)
      const allSelected = availableIds.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(availableIds)
    })
  }

  const togglePermission = (key: PermissionKey): void => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleConfirmShare = (): void => {
    onConfirmShare?.({
      deviceIds: Array.from(selectedIds),
      permissions,
      borrowerEmail,
      leaseDate,
      leaseTime
    })
  }

  return (
    <aside className="share-drawer" data-purpose="share-config-drawer">
      <div className="share-drawer-body">
        <div className="share-drawer-header">
          <div className="share-drawer-header-title">
            <span className="share-drawer-header-dot">◆</span>
            <span className="share-drawer-header-label">Share configuration</span>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse panel"
            className="share-drawer-collapse-btn"
          >
            &gt;&gt;
          </button>
        </div>

        <div className="share-drawer-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`share-drawer-tab${activeTab === tab.id ? ' share-drawer-tab-active' : ''}`}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
        </div>

        {activeTab === 'setting' ? (
          <SettingTab
            devices={deviceGrid}
            selectedIds={selectedIds}
            onToggleDevice={toggleDevice}
            onSelectAll={selectAllDevices}
            permissions={permissions}
            onTogglePermission={togglePermission}
            borrowerEmail={borrowerEmail}
            onBorrowerEmailChange={setBorrowerEmail}
            leaseDate={leaseDate}
            onLeaseDateChange={setLeaseDate}
            leaseTime={leaseTime}
            onLeaseTimeChange={setLeaseTime}
          />
        ) : (
          <SharedSessionTab
            sessions={sessions}
            onInspect={onInspect}
            onRevoke={onRevoke}
            onReauth={onReauth}
          />
        )}
      </div>

      {activeTab === 'setting' && (
        <div className="share-drawer-footer">
          <button type="button" onClick={handleConfirmShare} className="share-drawer-btn-primary">
            <Plus size={16} />
            <span>Confirm &amp; share</span>
          </button>
          <button type="button" onClick={onOneTimeShare} className="share-drawer-btn-secondary">
            <Key className="share-drawer-btn-secondary-icon" />
            <span>One-time share</span>
          </button>
        </div>
      )}
    </aside>
  )
}
