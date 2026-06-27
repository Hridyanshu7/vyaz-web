import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, BookOpen, User, LogOut, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()

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
          BookLoop
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
              {profile?.role === 'narrator' || profile?.role === 'both' ? (
                <Link to="/narrator/dashboard" className="text-sm text-muted hover:text-foreground transition-colors">
                  Narrator
                </Link>
              ) : null}
              <div className="flex items-center gap-3">
                <Link to="/dashboard" className="flex items-center gap-1.5 text-sm">
                  <User size={16} />
                  {profile?.name || 'Account'}
                </Link>
                <button onClick={handleSignOut} className="p-1.5 text-muted hover:text-foreground cursor-pointer">
                  <LogOut size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                Log in
              </Button>
              <Button size="sm" onClick={() => navigate('/signup')}>
                Sign up
              </Button>
            </div>
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
            <Link
              to="/books"
              className="py-2 text-sm text-muted hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Browse Books
            </Link>
            <Link
              to="/add-book"
              className="py-2 text-sm text-muted hover:text-foreground flex items-center gap-1"
              onClick={() => setMobileOpen(false)}
            >
              <Plus size={14} /> Add Book
            </Link>
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="py-2 text-sm text-muted hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  Dashboard
                </Link>
                {(profile?.role === 'narrator' || profile?.role === 'both') && (
                  <Link
                    to="/narrator/dashboard"
                    className="py-2 text-sm text-muted hover:text-foreground"
                    onClick={() => setMobileOpen(false)}
                  >
                    Narrator Dashboard
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="py-2 text-sm text-left text-muted hover:text-foreground cursor-pointer"
                >
                  Log out
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { navigate('/login'); setMobileOpen(false) }}>
                  Log in
                </Button>
                <Button size="sm" className="flex-1" onClick={() => { navigate('/signup'); setMobileOpen(false) }}>
                  Sign up
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
