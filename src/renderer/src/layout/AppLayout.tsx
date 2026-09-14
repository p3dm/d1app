import React from 'react'
import { useAuth } from '../auth/AuthContext'
import Header from '../components/Header'
import Sidebar from '../components/SideNav'

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
    <div className="root">
      <Header deviceCount={24} connected />
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
      </div>
    </div>
  )
}
