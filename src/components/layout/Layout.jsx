import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { SignupModal } from '../SignupModal'
import { useSignupModal } from '../../hooks/useSignupModal'
import { useAuthStore } from '../../stores/authStore'

export function Layout() {
  const { open, hide, show } = useSignupModal()
  const { user, profile, loading } = useAuthStore()

  useEffect(() => {
    if (!loading && user && profile && !profile.onboarding_complete) {
      show()
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
