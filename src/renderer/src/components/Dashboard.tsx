import { useAuth } from '../auth/AuthContext'
import React, { useEffect } from 'react'

interface User {
  number: string
  name?: string
  full_name?: string
  email: string
}

function Dashboard(): React.JSX.Element {
  const { signOut } = useAuth()
  const [data, setData] = React.useState<User>({
    number: '',
    name: '',
    email: ''
  })

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleGetUserInfo = async () => {
    try {
      const result = await window.api.auth.getMe()
      if (result.ok) {
        const response = result.data as { user?: User }
        if (response.user) {
          setData(response.user)
        }
      } else {
        console.error('Failed to get user info:', result.error)
      }
    } catch (error) {
      console.error('Error fetching user info:', error)
    }
  }

  useEffect(() => {
    void handleGetUserInfo()
  }, [])

  return (
    <section className="section dashboard-card">
      <div className="section-header">
        <div className="section-title">Dashboard</div>
        <div className="section-subtitle">Your email has been confirmed successfully.</div>
        <div className="section-subtitle">Welcome, {data.name ?? data.full_name ?? 'user'}!</div>
        <div className="section-subtitle">Email: {data.email}</div>
        <div className="section-subtitle">Phone: {data.number}</div>
        <button className="btn btn-primary" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </section>
  )
}

export default Dashboard
