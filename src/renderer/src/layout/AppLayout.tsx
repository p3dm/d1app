import React from 'react'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'
import Sidebar from '../components/SideNav'
import Footer from '@renderer/components/Footer'
import PhoneControl from '../components/PhoneControl'

interface AppLayoutProps {
  activeId?: string
  children: React.ReactNode
}

interface LayoutUser {
  name?: string
  email?: string
}

export default function AppLayout({
  activeId = 'control-center',
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
          onNavigate={({ id }) => setSelectedId(id)}
          user={{
            name: userName,
            plan: 'Free',
            node: 'Enterprise Node',
            devices: '2 active'
          }}
          onAccountSettings={() => setSelectedId('settings')}
        />
        <main className="dashboard-content">{children}</main>

        {selectedId === 'control-center' ||
        selectedId === 'phone-cloud' ||
        selectedId === 'phone-shared' ? (
          <PhoneControl />
        ) : null}
      </div>

      <Footer />
    </div>
  )
}
