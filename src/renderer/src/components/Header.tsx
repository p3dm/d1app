import { useAuth } from '@renderer/auth/AuthContext'
import { useEffect } from 'react'
/**
 * Header
 *
 * Thanh header trên cùng dùng chung cho toàn bộ dashboard.
 * - `onSearchClick`: mở command palette / search modal khi bấm hoặc nhấn ⌘K.
 * - `deviceCount` + `connected`: hiển thị trạng thái kết nối realtime.
 * - `rightSlot`: chỗ trống bên phải để nhét icon thông báo, avatar, v.v. (div rỗng trong HTML gốc).
 */

interface HeaderProps {
  user?: {
    name: string
    avatar?: string
    plan?: string
  }
  brand?: string
  version?: string
  onSearchClick?: () => void
  deviceCount?: number
  connected?: boolean
  rightSlot?: React.ReactNode
}

export default function Header({
  user,
  brand = 'D1A CLUSTER MATRIX',
  version,
  onSearchClick,
  deviceCount = 24,
  connected = true,
  rightSlot
}: HeaderProps): React.JSX.Element {
  // Bắt phím tắt ⌘K / Ctrl+K để mở search, giống hành vi ngụ ý bởi <kbd>⌘K</kbd>
  useEffect(() => {
    const handleKeyDown = (e): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onSearchClick?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSearchClick])

  const { signOut } = useAuth()
  const hasUser = Boolean(user?.name?.trim())
  const userInitials = hasUser ? user?.name.split('@')[0].slice(0, 2).toUpperCase() : 'SI'

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <header className="app-header" data-purpose="primary-header">
      {/* Bên trái: logo, tên hệ thống, badge version, ô search */}
      <div className="app-header-left">
        <div className="app-header-brand">
          <div className="app-header-mark">✳</div>
          <span className="app-header-brand-name">{brand}</span>
          {version && <span className="app-header-version">{version}</span>}
        </div>

        <div className="app-header-search-wrap">
          <button onClick={onSearchClick} className="app-header-search">
            <span className="app-header-search-marker">◆</span>
            <span>Search function</span>
            <kbd className="app-header-shortcut">⌘K</kbd>
          </button>
        </div>
      </div>

      {/* Bên phải: trạng thái kết nối thiết bị + khu vực mở rộng */}
      <div className="app-header-right">
        <div className="app-header-connection">
          <span
            className={`app-header-status-dot ${connected ? 'app-header-status-dot-connected' : ''}`}
          />
          <span className="app-header-device-count">{deviceCount} Devices Connected</span>
        </div>
        <div className="app-header-divider" />
        <div className="app-header-slot">{rightSlot}</div>
        <div className="app-header-account">
          {hasUser ? (
            <div className="app-header-account-avatar-initials">
              {user?.avatar ? (
                <img src={user.avatar} alt="User Avatar" />
              ) : (
                <div className="app-header-account-avatar-fallback">{userInitials}</div>
              )}
              <div>{user?.name}</div>
              <button type="button" className="app-header-signin" onClick={handleSignOut}>
                SignOut
              </button>
            </div>
          ) : (
            <button type="button" className="app-header-signin">
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
