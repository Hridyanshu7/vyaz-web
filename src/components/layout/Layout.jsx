import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { SignupModal } from '../SignupModal'
import { useSignupModal } from '../../hooks/useSignupModal'
import { useAuthStore } from '../../stores/authStore'
import { useAdminDataStore } from '../../stores/adminDataStore'

export function Layout() {
  const { open, hide, show } = useSignupModal()
  const { user, profile, loading } = useAuthStore()
  const initAdminData = useAdminDataStore((s) => s.initialize)

  useEffect(() => {
    if (!loading && user && profile && !profile.onboarding_complete && !profile.is_admin) {
      show({ type: 'signin' })
    }
    if (!loading && profile?.is_admin) {
      initAdminData()
    }
  }, [loading, user, profile])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Outlet />
      </main>
      <SignupModal open={open} onClose={hide} />
    </div>
  )
}
