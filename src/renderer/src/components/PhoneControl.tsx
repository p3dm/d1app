import { useEffect, useRef, useState } from 'react'
import {
  FileText,
  Shuffle,
  RefreshCw,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Smartphone,
  Settings as SettingsIcon
} from 'lucide-react'

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'otg-hub', label: 'OTG Hub' }
]

const DEFAULT_SAVED_NETWORKS = [
  { id: 0, from: '192.168.1.1', to: '192.168.1.255', port: '5555' },
  { id: 1, from: '192.168.9.1', to: '192.168.9.255', port: '5555' },
  { id: 2, from: '192.168.5.1', to: '192.168.5.255', port: '5555' },
  { id: 3, from: '192.168.4.1', to: '192.168.4.255', port: '5555' }
]

const DEFAULT_SLIDERS = [
  { key: 'bigScreen', label: 'Big screen', min: 0, max: 100, value: 65 },
  { key: 'smallScreen', label: 'Small screen', min: 0, max: 100, value: 50 },
  { key: 'quality', label: 'Quality', min: 0, max: 100, value: 85 },
  { key: 'frameRate', label: 'Frame rate', min: 0, max: 60, value: 30 }
]

const QUICK_ACTIONS = [
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'device', label: 'Device', icon: Smartphone },
  { id: 'rotate', label: 'Rotate', icon: RefreshCw }
]

const FILTERS = ['All', 'Cloud', 'USB', 'WIFI', 'OTG']

const DEFAULT_GROUPS = [
  {
    id: 'all',
    name: 'All devices',
    devices: Array.from({ length: 19 }, (_, i) => i + 1),
    isDefault: true
  },
  { id: 'ig', name: 'ig', devices: [20] },
  { id: 'kh-thay', name: 'kh thay', devices: Array.from({ length: 12 }, (_, i) => 21 + i) }
]

/** Một ô nhập octet IP (192 / 168 / 1 / 255...) */
function OctetInput({ value, onChange }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={3}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      className="phone-control-octet-input"
    />
  )
}

/** Nội dung tab Settings */
function SettingsTabContent({
  activeDeviceId = 8,
  onSliderChange,
  onQuickAction,
  onAddGroup,
  onSelectDevice
}) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS)
  const [filter, setFilter] = useState('Cloud')
  const [groups, setGroups] = useState(
    DEFAULT_GROUPS.map((group) => ({ ...group, expanded: group.isDefault, selected: new Set() }))
  )

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!contentRef.current) return

      const target = event.target as Node
      if (!contentRef.current.contains(target)) {
        setGroups((prev) => prev.map((group) => ({ ...group, selected: new Set() })))
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  const updateSlider = (key, value) => {
    setSliders((prev) => prev.map((slider) => (slider.key === key ? { ...slider, value } : slider)))
    onSliderChange?.(key, value)
  }

  const toggleGroupExpand = (id) => {
    setGroups((prev) =>
      prev.map((group) => (group.id === id ? { ...group, expanded: !group.expanded } : group))
    )
  }

  const toggleDevice = (groupId, deviceId) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group

        const nextSelected = new Set(group.selected)
        if (nextSelected.has(deviceId)) nextSelected.delete(deviceId)
        else nextSelected.add(deviceId)

        return { ...group, selected: nextSelected }
      })
    )

    onSelectDevice?.(groupId, deviceId)
  }

  const toggleSelectAll = (group) => {
    setGroups((prev) =>
      prev.map((item) => {
        if (item.id !== group.id) return item

        const allSelected = item.selected.size === item.devices.length
        return { ...item, selected: allSelected ? new Set() : new Set(item.devices) }
      })
    )
  }

  return (
    <div ref={contentRef} className="settings-tab-content">
      <div className="settings-top-panel">
        <div className="settings-slider-list">
          {sliders.map((slider) => (
            <div key={slider.key} className="settings-slider-row">
              <span className="settings-slider-label">{slider.label}</span>
              <div className="settings-slider-wrap">
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  value={slider.value}
                  onChange={(e) => updateSlider(slider.key, Number(e.target.value))}
                  className="settings-slider-input"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="settings-quick-actions">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                onClick={() => onQuickAction?.(action.id)}
                className={`settings-quick-action ${action.id === 'rotate' ? 'settings-quick-action-wide' : ''}`}
              >
                <Icon className="settings-quick-icon" />
                <span>{action.label}</span>
              </button>
            )
          })}
        </div>

        <div className="settings-filter-panel">
          <div className="settings-filter-bar">
            {FILTERS.map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`settings-filter-button ${filter === item ? 'settings-filter-button-active' : ''}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-groups-panel">
        <div className="settings-groups-header">
          <span className="settings-groups-title">
            <span className="settings-groups-mark">◆</span>
            Groups
          </span>
          <button onClick={onAddGroup} title="Add group" className="settings-add-group-button">
            +
          </button>
        </div>

        <div className="settings-groups-list">
          {groups.map((group) => {
            const selectedCount = group.selected.size
            const allSelected = selectedCount === group.devices.length && group.devices.length > 0

            if (!group.expanded) {
              return (
                <div
                  key={group.id}
                  onClick={() => toggleGroupExpand(group.id)}
                  className="settings-group-item settings-group-item-collapsed"
                >
                  <div className="settings-group-header-title">
                    <ChevronRight className="settings-group-caret" />
                    <span>
                      {group.name} ({selectedCount} / {group.devices.length})
                    </span>
                  </div>
                  {!group.isDefault && <span className="settings-group-tag">Group</span>}
                </div>
              )
            }

            return (
              <div key={group.id} className="settings-group-item">
                <div onClick={() => toggleGroupExpand(group.id)} className="settings-group-header">
                  <div className="settings-group-header-title">
                    <ChevronDown className="settings-group-caret" />
                    <span>
                      {group.name} ({selectedCount} / {group.devices.length})
                    </span>
                  </div>
                </div>

                <label className="settings-select-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAll(group)}
                    className="settings-select-all-input"
                  />
                  <span className="settings-select-all-label">Select all</span>
                </label>

                <div className="settings-device-grid">
                  {group.devices.map((id) => {
                    const isSelected = group.selected.has(id)
                    const isActive = id === activeDeviceId

                    return (
                      <div
                        key={id}
                        onClick={() => toggleDevice(group.id, id)}
                        className={`settings-device-chip ${
                          isActive
                            ? 'settings-device-chip-active'
                            : isSelected
                              ? 'settings-device-chip-selected'
                              : 'settings-device-chip-default'
                        }`}
                      >
                        {String(id).padStart(2, '0')}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * PhoneControl (OTG Hub)
 *
 * Panel bên phải để cấu hình port, quét dải IP LAN, và quản lý danh sách mạng đã lưu.
 * Toàn bộ state (tab, port, dải IP, danh sách mạng) được quản lý nội bộ nhưng có thể
 * override/điều khiển từ ngoài qua props nếu bạn muốn đồng bộ với backend thật.
 */
export default function PhoneControl({
  online = true,
  onCollapse,
  onGuideClick,
  savedNetworks = DEFAULT_SAVED_NETWORKS,
  onAddRange,
  onScanAll,
  onScanNetwork,
  onSliderChange,
  onQuickAction,
  onAddGroup,
  onSelectDevice
}) {
  const [activeTab, setActiveTab] = useState('otg-hub')
  const [port, setPort] = useState('5555')
  const [rangeFrom, setRangeFrom] = useState(['192', '168', '1', '1'])
  const [rangeTo, setRangeTo] = useState(['192', '168', '1', '255'])
  const [savedNetworksState, setSavedNetworksState] = useState(savedNetworks)

  const updateOctet = (setter, arr, index, value) => {
    const next = [...arr]
    next[index] = value
    setter(next)
  }

  const handleAdd = () => {
    onAddRange?.({
      port,
      from: rangeFrom.join('.'),
      to: rangeTo.join('.')
    })
  }

  const handleDeleteNetwork = (id) => {
    setSavedNetworksState((prev) => prev.filter((net) => net.id !== id))
  }

  return (
    <aside className="phone-control-panel" data-purpose="right-control-panel">
      {/* Tabs + nút collapse */}
      <div className="phone-control-header">
        <div className="phone-control-tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`phone-control-tab ${isActive ? 'phone-control-tab-active' : ''}`}
              >
                {isActive && <span className="phone-control-tab-marker">◆</span>}
                {tab.label}
              </button>
            )
          })}
        </div>
        <button onClick={onCollapse} title="Collapse" className="phone-control-collapse">
          <span className="phone-control-collapse-text">&gt;&gt;</span>
        </button>
      </div>

      <div className="phone-control-body">
        <div className="phone-control-scroll">
          {activeTab === 'settings' ? (
            <SettingsTabContent
              activeDeviceId={8}
              onSliderChange={onSliderChange}
              onQuickAction={onQuickAction}
              onAddGroup={onAddGroup}
              onSelectDevice={onSelectDevice}
            />
          ) : (
            <>
              <div className="phone-control-guide">
                <button onClick={onGuideClick} className="phone-control-guide-link">
                  <FileText className="phone-control-icon" />
                  Guide to connect
                </button>
                <div className="phone-control-status-badge">
                  <span
                    className={`phone-control-status-dot ${
                      online
                        ? 'phone-control-status-dot-online'
                        : 'phone-control-status-dot-offline'
                    }`}
                  />
                  {online ? 'Online' : 'Offline'}
                </div>
              </div>

              <div className="phone-control-card">
                <div className="phone-control-section-header">
                  <span className="phone-control-section-title">
                    <span className="phone-control-section-mark">◆</span>
                    Set port
                  </span>
                  <div className="phone-control-inline-badges">
                    <span className="phone-control-badge phone-control-badge-muted">
                      <Shuffle className="phone-control-icon-small" />0
                    </span>
                    <span className="phone-control-badge phone-control-badge-active">Active</span>
                  </div>
                </div>

                <div className="phone-control-input-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
                    className="phone-control-input"
                  />
                  <button
                    onClick={() => setPort(String(Math.floor(1024 + Math.random() * 60000)))}
                    title="Random port"
                    className="phone-control-random-port"
                  >
                    <Shuffle className="phone-control-icon" />
                  </button>
                </div>

                <div className="phone-control-range-group">
                  <div className="phone-control-range-label">IP Range</div>
                  <div className="phone-control-grid-4">
                    {rangeFrom.map((val, i) => (
                      <OctetInput
                        key={`from-${i}`}
                        value={val}
                        onChange={(v) => updateOctet(setRangeFrom, rangeFrom, i, v)}
                      />
                    ))}
                  </div>
                  <div className="phone-control-grid-4">
                    {rangeTo.map((val, i) => (
                      <OctetInput
                        key={`to-${i}`}
                        value={val}
                        onChange={(v) => updateOctet(setRangeTo, rangeTo, i, v)}
                      />
                    ))}
                  </div>
                </div>

                <div className="phone-control-grid-2">
                  <button
                    onClick={handleAdd}
                    className="phone-control-btn phone-control-btn-secondary"
                  >
                    <Plus
                      className="phone-control-icon-small phone-control-icon-accent"
                      strokeWidth={3}
                    />
                    Add
                  </button>
                  <button
                    onClick={() =>
                      onScanAll?.({ port, from: rangeFrom.join('.'), to: rangeTo.join('.') })
                    }
                    className="phone-control-btn phone-control-btn-primary"
                  >
                    <RefreshCw className="phone-control-icon-small" />
                    Scan
                  </button>
                </div>
              </div>

              <div className="phone-control-saved-wrap">
                <div className="phone-control-saved-header">
                  <span className="phone-control-section-title">
                    <span className="phone-control-section-mark">◆</span>
                    Saved networks
                  </span>
                  <button
                    onClick={() => onScanAll?.({ all: true })}
                    className="phone-control-scan-small"
                  >
                    <RefreshCw className="phone-control-icon-small phone-control-icon-accent" />
                    Scan
                  </button>
                </div>

                <div className="phone-control-saved-list">
                  {savedNetworksState.map((net) => (
                    <div key={net.id} className="phone-control-saved-item">
                      <div className="phone-control-network-header">
                        <span className="phone-control-network-id">{net.id}</span>
                        <button
                          onClick={() => onScanNetwork?.(net)}
                          className="phone-control-network-scan"
                        >
                          <Search className="phone-control-icon-small" />
                          Scan
                        </button>
                        <button
                          onClick={() => handleDeleteNetwork(net.id)}
                          className="phone-control-network-delete"
                        >
                          ×
                        </button>
                      </div>
                      <div className="phone-control-network-range">
                        {net.from} - {net.to}
                      </div>
                      <div className="phone-control-network-port">
                        <span>Port</span>
                        <span className="phone-control-network-port-value">{net.port}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
