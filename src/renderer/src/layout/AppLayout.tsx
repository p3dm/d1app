import React from 'react'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'
import Sidebar from '../components/SideNav'
import Footer from '@renderer/components/Footer'
import OTGHub from '../components/PhoneControl'
import SharedConfig from '@renderer/components/SharedConfig'
import type { SharedPhone } from '../PhoneShared'

interface AppLayoutProps {
  activeId?: string
  onNavigate?: (id: string) => void
  sharedPhones: SharedPhone[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onSelectedDevice: (deviceId: string) => void
  remoteInvite: string
  remoteStatus: string
  remoteConnected: boolean
  onRemoteInviteChange: (invite: string) => void
  onRemoteConnect: () => void
  onRemoteDisconnect: () => void
  children: React.ReactNode
}

interface LayoutUser {
  name?: string
  email?: string
}

export default function AppLayout({
  activeId = 'control-center',
  onNavigate,
  sharedPhones,
  selectedIds,
  onSelectionChange,
  onSelectedDevice,
  remoteInvite,
  remoteStatus,
  remoteConnected,
  onRemoteInviteChange,
  onRemoteConnect,
  onRemoteDisconnect,
  children
}: AppLayoutProps): React.JSX.Element {
  const { user } = useAuth()
  const [selectedId, setSelectedId] = React.useState(activeId)
  const layoutUser = user as LayoutUser | null
  const userName = layoutUser?.email || layoutUser?.name || 'admin@matrix'

  React.useEffect(() => {
    setSelectedId(activeId)
  }, [activeId])

  return (
    <div className="dashboard-shell">
      <Header
        deviceCount={24}
        connected
        user={
          layoutUser && (layoutUser.name || layoutUser.email)
            ? {
                name: userName,
                plan: 'Free',
                avatar: undefined
              }
            : undefined
        }
      />

      <div className="dashboard-body">
        <Sidebar
          activeId={selectedId}
          onNavigate={({ id }) => {
            setSelectedId(id)
            onNavigate?.(id)
          }}
          user={{
            name: userName,
            plan: 'Free',
            node: 'Enterprise Node',
            devices: '2 active'
          }}
          onAccountSettings={() => setSelectedId('settings')}
        />
        <main className="dashboard-content">{children}</main>

        {selectedId === 'control-center' || selectedId === 'phone-cloud' ? (
          <OTGHub
            remoteInvite={remoteInvite}
            remoteStatus={remoteStatus}
            remoteConnected={remoteConnected}
            onRemoteInviteChange={onRemoteInviteChange}
            onRemoteConnect={onRemoteConnect}
            onRemoteDisconnect={onRemoteDisconnect}
          />
        ) : null}
        {/* {selectedId === 'phone-shared' ? (
          <SharedConfig
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            onSelectedDevice={onSelectedDevice}
            deviceGrid={sharedPhones.map((phone) => ({
              id: phone.serial,
              status: 'available'
            }))}
          />
        ): null} */}
      </div>

      <Footer />
    </div>
  )
}
