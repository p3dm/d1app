import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface AuthContextValue {
  authenticated: boolean
  loading: boolean
  user: unknown
  setAuthenticated: (user: unknown) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [authenticated, setAuthenticatedState] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<unknown>(null)

  useEffect(() => {
    let active = true

    void window.api.auth.getMe().then((result) => {
      if (!active) return

      if (result.ok) {
        const data = result.data as { user?: unknown } | undefined
        setUser(data?.user ?? null)
        setAuthenticatedState(Boolean(data?.user))
      }
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  const setAuthenticated = (nextUser: unknown) => {
    setUser(nextUser)
    setAuthenticatedState(true)
  }

  const signOut = async () => {
    const result = await window.api.auth.signOut()
    if (!result.ok) throw new Error(result.error)
    setUser(null)
    setAuthenticatedState(false)
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, user, setAuthenticated, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
