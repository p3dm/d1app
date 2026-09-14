import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import AppLayout from './layout/AppLayout'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppLayout activeId="control-center">
        <App />
      </AppLayout>
    </AuthProvider>
  </StrictMode>
)
