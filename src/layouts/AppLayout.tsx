import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/shell'
import { LoginModal } from '../components/auth/LoginModal'
import { DevBlogModal } from '../components/DevBlogModal'
import { useAuth } from '../contexts/AuthContext'
import { shouldShowBlog } from '../lib/devBlog'

export function AppLayout() {
  const location = useLocation()
  const navigate  = useNavigate()
  const { user, login, logout, loginModalOpen, openLogin, closeLogin } = useAuth()
  const [showBlog, setShowBlog] = useState(() => shouldShowBlog())

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

      {showBlog && (
        <DevBlogModal onClose={() => setShowBlog(false)} />
      )}
    </>
  )
}
