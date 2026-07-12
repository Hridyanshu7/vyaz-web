import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { useAuthStore } from '../../stores/authStore'
import { useAdminDataStore } from '../../stores/adminDataStore'

export function Layout() {
  const { profile, loading } = useAuthStore()
  const initAdminData = useAdminDataStore((s) => s.initialize)

  useEffect(() => {
    if (!loading && profile?.is_admin) {
      initAdminData()
    }
  }, [loading, profile])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
