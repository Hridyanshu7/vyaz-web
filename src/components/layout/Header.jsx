import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, User, LogOut, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { Logo } from '../ui/Logo'
import { NavDropdown } from './NavDropdown'

// "Why Vyaz?" is a section on the Home page, reachable from every page via this
// header — if we're already on Home, just scroll; otherwise navigate to Home with
// the section as a hash and let Home's own mount effect finish the scroll.
function useSectionLink() {
  const navigate = useNavigate()
  const location = useLocation()
  return (id) => {
    if (location.pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate(`/#${id}`)
    }
  }
}

const itemClass = 'block w-full text-left px-4 py-2 text-sm text-ink-soft hover:bg-background hover:text-foreground transition-colors cursor-pointer'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const goToSection = useSectionLink()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
    setMobileOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <Logo size={28} />
          Vyaz
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <NavDropdown trigger={<>About <ChevronDown size={14} /></>}>
            <Link to="/mission" className={itemClass}>Mission &amp; Purpose</Link>
            <button type="button" onClick={() => goToSection('why-vyaz')} className={itemClass}>Why Vyaz?</button>
          </NavDropdown>

          <NavDropdown trigger={<>Explore <ChevronDown size={14} /></>}>
            <Link to="/books" className={itemClass}>All</Link>
            <Link to="/books?sort=bestsellers" className={itemClass}>Bestsellers</Link>
            <Link to="/books?by=language" className={itemClass}>By language</Link>
            <Link to="/books?by=author" className={itemClass}>By Authors</Link>
          </NavDropdown>

          {!profile?.is_admin && (
            <Link to="/add-book" className="text-sm text-muted hover:text-foreground transition-colors">
              Request a book
            </Link>
          )}

          {user ? (
            <NavDropdown
              align="right"
              trigger={
                profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-accent-wash flex items-center justify-center">
                    <User size={16} className="text-highlight-hover" />
                  </span>
                )
              }
            >
              <Link to="/profile" className={itemClass}>Profile</Link>
              {profile?.is_admin && <Link to="/admin" className={itemClass}>Admin</Link>}
              <button type="button" onClick={handleSignOut} className={itemClass}>Sign out</button>
            </NavDropdown>
          ) : (
            <Link to="/login" aria-label="Sign in" className="w-8 h-8 rounded-full border border-border-strong flex items-center justify-center text-muted hover:border-highlight hover:text-highlight transition-colors">
              <User size={16} />
            </Link>
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
          <div className="px-4 py-3 flex flex-col gap-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted mt-2 mb-1">About</p>
            <Link to="/mission" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
              Mission &amp; Purpose
            </Link>
            <button type="button" className="py-2 text-sm text-left text-muted hover:text-foreground cursor-pointer" onClick={() => { goToSection('why-vyaz'); setMobileOpen(false) }}>
              Why Vyaz?
            </button>

            <p className="text-[10px] font-mono uppercase tracking-wider text-muted mt-3 mb-1">Explore</p>
            <Link to="/books" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>All</Link>
            <Link to="/books?sort=bestsellers" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>Bestsellers</Link>
            <Link to="/books?by=language" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>By language</Link>
            <Link to="/books?by=author" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>By Authors</Link>

            {!profile?.is_admin && (
              <Link to="/add-book" className="py-2 mt-3 text-sm text-muted hover:text-foreground border-t border-border pt-3" onClick={() => setMobileOpen(false)}>
                Request a book
              </Link>
            )}

            {user ? (
              <>
                <Link to="/profile" className="py-2 text-sm text-muted hover:text-foreground border-t border-border mt-2 pt-3" onClick={() => setMobileOpen(false)}>
                  Profile
                </Link>
                {profile?.is_admin && (
                  <Link to="/admin" className="py-2 text-sm text-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
                    Admin
                  </Link>
                )}
                <button type="button" onClick={handleSignOut} className="py-2 text-sm text-left text-muted hover:text-foreground cursor-pointer flex items-center gap-1.5">
                  <LogOut size={14} /> Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="py-2 text-sm text-muted hover:text-foreground border-t border-border mt-2 pt-3" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
