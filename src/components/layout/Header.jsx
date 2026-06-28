import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, BookOpen, User, LogOut, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useSignupModal } from '../../hooks/useSignupModal'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const showSignup = useSignupModal((s) => s.show)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
    setMobileOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <BookOpen size={22} className="text-highlight" />
          Tome
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/books" className="text-sm text-muted hover:text-foreground transition-colors">
            Browse Books
          </Link>
          <Link to="/add-book" className="text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1">
            <Plus size={14} /> Add Book
          </Link>
          {user ? (
            <>
              <Link to="/dashboard" className="text-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <div className="flex items-center gap-3">
                <Link to="/profile" className="flex items-center gap-1.5 text-sm hover:text-highlight transition-colors">
                  <User size={16} />
                  {profile?.name || 'Profile'}
                </Link>
                <button onClick={handleSignOut} className="p-1.5 text-muted hover:text-foreground cursor-pointer">
                  <LogOut size={16} />
                </button>
              </div>
            </>
          ) : (
            <Button size="sm" onClick={showSignup}>
              Sign in
            </Button>
          )}
        </nav>

        <button
          className="md:hidden p-1.5 cursor-pointer"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-4 py-3 flex flex-col gap-2">
            <Link to="/books" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
              Browse Books
            </Link>
            <Link to="/add-book" className="py-2 text-sm text-muted hover:text-foreground flex items-center gap-1" onClick={() => setMobileOpen(false)}>
              <Plus size={14} /> Add Book
            </Link>
            {user ? (
              <>
                <Link to="/dashboard" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
                  Dashboard
                </Link>
                <Link to="/profile" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
                  Profile
                </Link>
                <button onClick={handleSignOut} className="py-2 text-sm text-left text-muted hover:text-foreground cursor-pointer">
                  Log out
                </button>
              </>
            ) : (
              <Button size="sm" className="mt-2" onClick={() => { navigate('/login'); setMobileOpen(false) }}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
