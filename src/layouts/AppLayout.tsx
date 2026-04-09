import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/shell'
import { LoginModal } from '../components/auth/LoginModal'
import { useAuth } from '../contexts/AuthContext'

export function AppLayout() {
  const location = useLocation()
  const navigate  = useNavigate()
  const { user, login, logout, loginModalOpen, openLogin, closeLogin } = useAuth()

  return (
    <>
      <AppShell
        activeHref={location.pathname}
        user={user}
        onNavigate={navigate}
        onLogout={logout}
        onSignIn={openLogin}
      >
        <Outlet />
      </AppShell>

      {loginModalOpen && (
        <LoginModal
          onClose={closeLogin}
          onLoginSuccess={login}
        />
      )}
    </>
  )
}
