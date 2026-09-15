import { useState } from 'react'
import {
  Home,
  LayoutGrid,
  Cloud,
  Smartphone,
  Store,
  Video,
  Repeat,
  Users,
  Clock,
  Server,
  CreditCard,
  Settings,
  HelpCircle,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp
} from 'lucide-react'

interface SidebarProps {
  activeId?: string
  onNavigate?: (item: { id: string; href: string }) => void
  user?: {
    name: string
    plan: string
    node: string
    devices: string
  }
  onUpgrade?: () => void
  onAccountSettings?: () => void
  defaultCollapsed?: boolean
}

// ---- Cấu hình dữ liệu menu: chỉnh sửa ở đây để dùng chung cho mọi trang ----
const NAV_SECTIONS = [
  {
    label: 'Core Operations',
    items: [
      {
        id: 'control-center',
        label: 'Control Center',
        icon: LayoutGrid,
        badge: '24',
        href: '/control-center'
      },
      { id: 'phone-cloud', label: 'Phone Cloud', icon: Cloud, count: '24', href: '/phone-cloud' },
      {
        id: 'phone-shared',
        label: 'Phone Shared',
        icon: Smartphone,
        count: '0',
        href: '/phone-shared'
      }
    ]
  },
  {
    label: 'Automation Hub',
    items: [
      { id: 'automation-store', label: 'Automation store', icon: Store, href: '/automation-store' },
      {
        id: 'automation-record',
        label: 'Automation Record',
        icon: Video,
        href: '/automation-record'
      },
      {
        id: 'automated-agents',
        label: 'Automated agents',
        icon: Repeat,
        tag: '12 Run',
        href: '/automated-agents'
      },
      { id: 'account-manager', label: 'Account Manager', icon: Users, href: '/account-manager' },
      { id: 'schedules', label: 'Schedules', icon: Clock, href: '/schedules' }
    ]
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'router-proxy', label: 'Router & Proxy', icon: Server, href: '/router-proxy' },
      { id: 'billing-plan', label: 'Billing & Plan', icon: CreditCard, href: '/billing-plan' },
      { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
      { id: 'help-docs', label: 'Help & Documents', icon: HelpCircle, href: '/help' }
    ]
  }
]

/**
 * Sidebar
 *
 * Sidenav dùng chung cho toàn bộ dashboard / các trang con.
 * Truyền `activeId` + `onNavigate` để router của bạn (react-router, next/link, ...)
 * tự quyết định điều hướng thay vì dùng thẻ <a href> tĩnh.
 */
export default function Sidebar({
  activeId: activeIdProp,
  onNavigate,
  user = { name: 'admin@matrix', plan: 'Free', node: 'Enterprise Node', devices: '2 active' },
  onUpgrade,
  onAccountSettings,
  defaultCollapsed = false
}: SidebarProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [internalActive, setInternalActive] = useState('control-center')
  const activeId = activeIdProp ?? internalActive

  const handleNavigate = (item: { id: string; href: string }): void => {
    if (onNavigate) onNavigate(item)
    else setInternalActive(item.id)
  }

  const initials = user.name.split('@')[0].slice(0, 2).toUpperCase()

  return (
    <div
      className={`sidebar-root ${collapsed ? 'sidebar-root-collapsed' : ''}`}
      data-purpose="primary-sidebar"
    >
      <div className="sidebar-scroll">
        <div className="sidebar-inner">
          {/* Dashboard / collapse toggle */}
          <div className="sidebar-dashboard">
            <button
              onClick={() => handleNavigate({ id: 'dashboard', href: '/' })}
              className="sidebar-dashboard-button"
            >
              <div className="sidebar-dashboard-content">
                <Home className="sidebar-icon" />
                {!collapsed && <span>Dashboard</span>}
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed((c) => !c)
            }}
            className="sidebar-collapse-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronsLeft className="w-3.5 h-3.5" />
            )}
          </button>

          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="sidebar-section">
              {!collapsed && (
                <div className="sidebar-section-label">
                  <span className="sidebar-section-marker">◆</span>
                  {section.label}
                </div>
              )}
              <div className="sidebar-items">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeId === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item)}
                      title={collapsed ? item.label : undefined}
                      className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
                    >
                      <div className="sidebar-item-content">
                        <Icon className="sidebar-icon" />
                        {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                      </div>
                      {!collapsed && item.badge && (
                        <span className="sidebar-badge">{item.badge}</span>
                      )}
                      {!collapsed && item.count !== undefined && (
                        <span className="sidebar-count">{item.count}</span>
                      )}
                      {!collapsed && item.tag && <span className="sidebar-tag">{item.tag}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account card */}
      {!collapsed && (
        <div className="sidebar-account-wrap">
          <div className="sidebar-account">
            <div className="sidebar-account-header">
              <div className="sidebar-account-identity">
                <div className="sidebar-avatar">{initials}</div>
                <div className="sidebar-account-info">
                  <span className="sidebar-account-name">{user.name}</span>
                  <span className="sidebar-account-node">
                    <span className="sidebar-status-dot" />
                    {user.node}
                  </span>
                </div>
              </div>
              {!collapsed && <span className="sidebar-plan">{user.plan}</span>}
            </div>

            {!collapsed && (
              <div className="sidebar-account-details">
                <div className="sidebar-detail-row">
                  <span>Expired at</span>
                  <span className="sidebar-detail-value">Unlimited</span>
                </div>
                <div className="sidebar-detail-row">
                  <span>Device threads</span>
                  <span className="sidebar-detail-value sidebar-detail-value-accent">
                    {user.devices}
                  </span>
                </div>
              </div>
            )}

            <button onClick={onUpgrade} className="sidebar-action sidebar-action-upgrade">
              <ArrowUp className="sidebar-action-icon" />
              {!collapsed && <span>Upgrade Plan</span>}
            </button>

            <button onClick={onAccountSettings} className="sidebar-action sidebar-action-settings">
              <Settings className="sidebar-action-icon" />
              {!collapsed && <span>Account Setting</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
